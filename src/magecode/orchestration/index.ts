import * as vscode from "vscode"
import { LRUCache } from "lru-cache"
import type { ILLMOrchestrator, RequestOptions, LLMResponse } from "../interfaces"
import { IModelTier, ModelRequestOptions, ModelResponse, ModelTier } from "./interfaces"
import { CloudModelTier } from "./tiers/cloudModelTier"
import { LocalModelTier } from "./tiers/localModelTier"
import { ModelRouter } from "./router"
import { PromptService } from "./prompt/promptService"

/**
 * Orchestrator for managing multiple model tiers (cloud, local, etc.),
 * handling routing, caching, and fallback logic.
 */
export class MultiModelOrchestrator implements ILLMOrchestrator {
	private cloudTier: CloudModelTier
	private localTier: LocalModelTier
	private modelRouter: ModelRouter
	private promptService: PromptService
	private cache: LRUCache<string, LLMResponse>

	constructor(
		cloudTier: CloudModelTier,
		localTier: LocalModelTier,
		modelRouter: ModelRouter,
		promptService: PromptService,
	) {
		this.cloudTier = cloudTier
		this.localTier = localTier
		this.modelRouter = modelRouter
		this.promptService = promptService

		// Initialize cache with configured settings
		const config = vscode.workspace.getConfiguration("roo-code")
		const maxItems = config.get<number>("magecode.cache.maxItems", 500)
		const ttlSeconds = config.get<number>("magecode.cache.ttlSeconds", 3600)
		const ttlMilliseconds = ttlSeconds * 1000 // Convert seconds to milliseconds

		this.cache = new LRUCache<string, LLMResponse>({
			max: maxItems,
			ttl: ttlMilliseconds,
		})
		console.log(`[Orchestrator] Initialized cache with maxItems: ${maxItems}, ttl: ${ttlSeconds}s`)
	}

	/**
	 * Convert generic request options to model-specific options.
	 */
	private convertOptions(options: RequestOptions): ModelRequestOptions {
		// Exclude options not relevant to the model tier itself
		const { skipCache, cacheResponse, allowFallback, taskType, ...modelOpts } = options
		return {
			maxTokens: modelOpts.maxTokens,
			temperature: modelOpts.temperature,
			stopSequences: modelOpts.stopSequences,
			cacheStrategy: modelOpts.cacheStrategy, // Keep if tiers use it internally
		}
	}

	/**
	 * Convert model response to the generic LLM response format.
	 */
	private convertResponse(response: ModelResponse): LLMResponse {
		return {
			content: response.text,
			usage: response.tokenUsage,
			modelType: response.modelType, // This will now reflect the actual tier used
			latency: response.latency,
		}
	}

	/**
	 * Generates a cache key for a given request.
	 * Includes relevant options that affect the response.
	 */
	private getCacheKey(prompt: string, options: RequestOptions): string {
		// Only include options that influence the generation result
		const keyOptions = {
			maxTokens: options.maxTokens,
			temperature: options.temperature,
			stopSequences: options.stopSequences,
			taskType: options.taskType, // Include taskType if it affects routing/prompting
		}
		// Simple stringification for the key. Consider hashing for very long prompts if needed.
		return JSON.stringify({ prompt, options: keyOptions })
	}

	/**
	 * Make an API request, handling routing, caching, and fallback.
	 * @param prompt The input prompt.
	 * @param options Request options including caching and fallback flags.
	 * @returns Promise resolving to the LLM response.
	 */
	async makeApiRequest(prompt: string, options: RequestOptions = {}): Promise<LLMResponse> {
		const cacheKey = this.getCacheKey(prompt, options)

		// 1. Check cache
		if (!options.skipCache) {
			const cachedResponse = this.cache.get(cacheKey)
			if (cachedResponse) {
				console.log(`[Orchestrator] Cache hit for key: ${cacheKey.substring(0, 50)}...`)
				// Optionally add a flag or adjust latency info for cached responses
				return { ...cachedResponse, latency: 0 } // Indicate cache hit with 0 latency
			}
			console.log(`[Orchestrator] Cache miss for key: ${cacheKey.substring(0, 50)}...`)
		} else {
			console.log(`[Orchestrator] Skipping cache check for key: ${cacheKey.substring(0, 50)}...`)
		}

		// 2. Route request
		const modelOptions = this.convertOptions(options)
		const routerOptions = { taskType: options.taskType }
		let chosenTierEnum = await this.modelRouter.routeRequest(options.taskType, prompt, routerOptions)
		let chosenTier: IModelTier = chosenTierEnum === ModelTier.LOCAL ? this.localTier : this.cloudTier

		console.log(`[Orchestrator] Routed to tier: ${chosenTierEnum}`)

		// 3. Format prompt
		const formattedPrompt = this.promptService.formatPrompt(prompt, chosenTierEnum)

		// 4. Make request to chosen tier
		try {
			console.log(`[Orchestrator] Attempting request with tier: ${chosenTierEnum}`)
			const response = await chosenTier.makeRequest(formattedPrompt, modelOptions)
			const llmResponse = this.convertResponse(response)

			// 5. Store in cache if successful and enabled
			if (options.cacheResponse !== false) {
				console.log(`[Orchestrator] Caching response for key: ${cacheKey.substring(0, 50)}...`)
				this.cache.set(cacheKey, llmResponse)
			}
			return llmResponse
		} catch (error: any) {
			console.warn(`[Orchestrator] Initial request failed for tier ${chosenTierEnum}:`, error.message || error)

			// 6. Fallback logic (only if initial tier was LOCAL and fallback is allowed)
			if (chosenTierEnum === ModelTier.LOCAL && options.allowFallback !== false) {
				console.log("[Orchestrator] Local tier failed, attempting fallback to Cloud tier.")
				chosenTierEnum = ModelTier.CLOUD // Explicitly switch to cloud
				chosenTier = this.cloudTier
				// Re-format prompt for cloud if necessary (though current service is pass-through)
				const fallbackFormattedPrompt = this.promptService.formatPrompt(prompt, chosenTierEnum)

				try {
					const fallbackResponse = await chosenTier.makeRequest(fallbackFormattedPrompt, modelOptions)
					const fallbackLlmResponse = this.convertResponse(fallbackResponse)

					// Cache the successful fallback response if enabled
					if (options.cacheResponse !== false) {
						console.log(`[Orchestrator] Caching fallback response for key: ${cacheKey.substring(0, 50)}...`)
						this.cache.set(cacheKey, fallbackLlmResponse)
					}
					return fallbackLlmResponse
				} catch (fallbackError: any) {
					console.error(
						"[Orchestrator] Cloud fallback request failed:",
						fallbackError.message || fallbackError,
					)
					throw new Error(
						`Initial request failed (${ModelTier.LOCAL}) and Cloud fallback failed: ${
							fallbackError.message || String(fallbackError)
						}`,
					)
				}
			}

			// If no fallback occurred or was allowed, throw the original error
			throw new Error(`Model request failed for tier ${chosenTierEnum}: ${error.message || String(error)}`)
		}
	}

	/**
	 * Clears the entire LLM response cache.
	 * Called by SyncService on file changes as a simple invalidation strategy.
	 */
	public clearCache(): void {
		this.cache.clear()
		console.log("[Orchestrator] LLM response cache cleared.")
	}
}

/**
 * Export types that consumers might need.
 */
export type { IModelTier, ModelRequestOptions, ModelResponse }

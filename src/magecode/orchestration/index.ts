import type { ILLMOrchestrator, RequestOptions, LLMResponse } from "../interfaces"
import { IModelTier, ModelRequestOptions, ModelResponse } from "./interfaces"
import { CloudModelTier } from "./tiers/cloudModelTier"
import { LocalModelTier } from "./tiers/localModelTier"

/**
 * Orchestrator for managing multiple model tiers (cloud, local, etc.)
 */
export class MultiModelOrchestrator implements ILLMOrchestrator {
	private cloudTier: CloudModelTier
	private localTier: LocalModelTier

	constructor(cloudTier: CloudModelTier, localTier: LocalModelTier) {
		this.cloudTier = cloudTier
		this.localTier = localTier
	}

	/**
	 * Convert generic request options to model-specific options
	 */
	private convertOptions(options: RequestOptions): ModelRequestOptions {
		return {
			maxTokens: options.maxTokens,
			temperature: options.temperature,
			stopSequences: options.stopSequences,
			cacheStrategy: options.cacheStrategy,
		}
	}

	/**
	 * Convert model response to LLM response format
	 */
	private convertResponse(response: ModelResponse): LLMResponse {
		return {
			content: response.text,
			usage: response.tokenUsage,
			modelType: response.modelType,
			latency: response.latency,
		}
	}

	/**
	 * Select the appropriate model tier based on request characteristics
	 * @param prompt The input prompt
	 * @param options Request options
	 * @returns The selected model tier
	 */
	private selectTier(prompt: string, options: ModelRequestOptions): IModelTier {
		// Use local tier for simpler tasks that fit within context window
		if (
			prompt.length < 1000 && // Short prompts
			(!options.maxTokens || options.maxTokens <= 256) && // Limited response length
			!options.stopSequences?.length && // No complex stop sequence logic
			!options.cacheStrategy // No caching requirements
		) {
			try {
				return this.localTier
			} catch {
				// Fallback to cloud tier if local tier fails
				return this.cloudTier
			}
		}

		// Default to cloud tier for more complex tasks
		return this.cloudTier
	}

	/**
	 * Make an API request to the appropriate model tier
	 * @param prompt The input prompt
	 * @param options Request options
	 * @returns Promise resolving to the LLM response
	 */
	async makeApiRequest(prompt: string, options: RequestOptions = {}): Promise<LLMResponse> {
		try {
			const modelOptions = this.convertOptions(options)
			const selectedTier = this.selectTier(prompt, modelOptions)

			const response = await selectedTier.makeRequest(prompt, modelOptions)
			return this.convertResponse(response)
		} catch (error) {
			// If local tier fails, try falling back to cloud tier
			if (error instanceof Error && error.message.includes("LocalModelTier")) {
				try {
					const modelOptions = this.convertOptions(options)
					const response = await this.cloudTier.makeRequest(prompt, modelOptions)
					return this.convertResponse(response)
				} catch (fallbackError) {
					throw new Error(
						`Cloud fallback failed: ${
							fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
						}`,
					)
				}
			}

			// Otherwise, throw the original error
			throw new Error(`Model request failed: ${error instanceof Error ? error.message : String(error)}`)
		}
	}
}

/**
 * Export types that consumers might need
 */
export type { IModelTier, ModelRequestOptions, ModelResponse }

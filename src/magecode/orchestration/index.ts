import type { ILLMOrchestrator, RequestOptions, LLMResponse } from "../interfaces"
import { IModelTier, ModelRequestOptions, ModelResponse } from "./interfaces"
import { CloudModelTier } from "./tiers/cloudModelTier"

/**
 * Orchestrator for managing multiple model tiers (cloud, local, etc.)
 */
export class MultiModelOrchestrator implements ILLMOrchestrator {
	private cloudTier: CloudModelTier

	constructor(cloudTier: CloudModelTier) {
		this.cloudTier = cloudTier
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
	 * Make an API request to the appropriate model tier
	 * @param prompt The input prompt
	 * @param options Request options
	 * @returns Promise resolving to the LLM response
	 */
	async makeApiRequest(prompt: string, options: RequestOptions = {}): Promise<LLMResponse> {
		try {
			// Currently always route to cloud tier
			// Future: Add routing logic based on options/context
			const modelOptions = this.convertOptions(options)
			const response = await this.cloudTier.makeRequest(prompt, modelOptions)
			return this.convertResponse(response)
		} catch (error) {
			// Add context and rethrow
			throw new Error(`Model request failed: ${error instanceof Error ? error.message : String(error)}`)
		}
	}
}

/**
 * Export types that consumers might need
 */
export type { IModelTier, ModelRequestOptions, ModelResponse }

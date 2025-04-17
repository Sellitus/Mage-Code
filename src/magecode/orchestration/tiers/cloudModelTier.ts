import { Anthropic } from "@anthropic-ai/sdk"
import { ApiHandler, SingleCompletionHandler } from "../../../api"
import { ModelRequestOptions, ModelResponse, IModelTier } from "../interfaces"
import { logger } from "../../utils/logging" // Import logger
import { ApiError } from "../../utils/errors" // Import custom error

/**
 * Adapter for converting between ModelRequestOptions and provider-specific options
 */
interface CloudModelAdapter {
	toProviderOptions(options: ModelRequestOptions): any
	fromProviderResponse(response: any, latency: number): ModelResponse
}

/**
 * Cloud model tier implementation wrapping existing Roo-Code LLM service
 */
export class CloudModelTier implements IModelTier {
	private llmService: ApiHandler & SingleCompletionHandler
	private adapter: CloudModelAdapter

	constructor(llmService: ApiHandler & SingleCompletionHandler) {
		this.llmService = llmService
		this.adapter = {
			toProviderOptions: (options: ModelRequestOptions) => ({
				maxTokens: options.maxTokens,
				temperature: options.temperature,
				stopSequences: options.stopSequences,
				cacheStrategy: options.cacheStrategy,
			}),
			fromProviderResponse: (response: any, latency: number): ModelResponse => ({
				text: typeof response === "string" ? response : response.content || "",
				tokenUsage: {
					inputTokens: response.usage?.promptTokens || 0,
					outputTokens: response.usage?.completionTokens || 0,
					cacheReadTokens: response.usage?.cacheReadTokens,
					cacheWriteTokens: response.usage?.cacheWriteTokens,
				},
				modelType: "cloud",
				latency,
			}),
		}
	}

	/**
	 * Make a request to the cloud LLM service
	 * @param prompt The input prompt
	 * @param options Request options
	 * @returns Promise resolving to the model's response
	 */
	async makeRequest(prompt: string, options: ModelRequestOptions): Promise<ModelResponse> {
		const startTime = Date.now()

		try {
			// Convert options to provider format
			const providerOptions = this.adapter.toProviderOptions(options)

			// Make request using existing LLM service
			logger.debug("[CloudModelTier] Making request via llmService...")
			const response = await this.llmService.completePrompt(prompt) // Assuming completePrompt handles its own errors/retries
			logger.debug("[CloudModelTier] Received response from llmService.")

			// Calculate latency
			const latency = Date.now() - startTime
			logger.info(`[CloudModelTier] Cloud inference latency: ${latency}ms`)

			// Convert response to common format
			return this.adapter.fromProviderResponse(response, latency)
		} catch (error: any) {
			const msg = "Cloud model request failed"
			logger.error(`[CloudModelTier] ${msg}`, error)
			// Attempt to extract status code if the underlying error has it
			const statusCode = typeof error?.statusCode === "number" ? error.statusCode : undefined
			throw new ApiError(msg, { cause: error, statusCode: statusCode })
		}
	}
}

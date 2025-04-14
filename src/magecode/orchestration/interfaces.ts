/**
 * Options for making a model request
 */
export interface ModelRequestOptions {
	/**
	 * Maximum number of tokens to generate
	 */
	maxTokens?: number

	/**
	 * Temperature for controlling randomness (0-1)
	 */
	temperature?: number

	/**
	 * Sequences at which to stop generation
	 */
	stopSequences?: string[]

	/**
	 * Strategy for caching responses
	 */
	cacheStrategy?: string
}

/**
 * Response from a model request
 */
export interface ModelResponse {
	/**
	 * Generated text response
	 */
	text: string

	/**
	 * Token usage metrics
	 */
	tokenUsage: {
		inputTokens: number
		outputTokens: number
		cacheReadTokens?: number
		cacheWriteTokens?: number
	}

	/**
	 * Type of model that generated the response (e.g. 'cloud', 'local')
	 */
	modelType: string

	/**
	 * Time taken to generate response in milliseconds
	 */
	latency: number
}

/**
 * Interface for model tiers (Cloud, Local, etc.)
 */
export interface IModelTier {
	/**
	 * Make a request to the model tier
	 * @param prompt The input prompt
	 * @param options Request options
	 * @returns Promise resolving to the model's response
	 */
	makeRequest(prompt: string, options: ModelRequestOptions): Promise<ModelResponse>
}

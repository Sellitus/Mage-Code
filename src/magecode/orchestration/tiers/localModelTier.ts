import * as path from "path"
import * as ort from "onnxruntime-node"
import { SentencePieceProcessor } from "sentencepiece-js"
import { IModelTier, ModelRequestOptions, ModelResponse } from "../interfaces"

/**
 * Implementation of a local model tier using ONNX Runtime
 * for efficient on-device inference
 */
export class LocalModelTier implements IModelTier {
	private session: ort.InferenceSession | null = null
	private tokenizer: SentencePieceProcessor | null = null
	private initialized = false

	/**
	 * Initialize the local model tier
	 * @param extensionPath Base path of the extension
	 */
	async initialize(extensionPath: string): Promise<void> {
		try {
			// Load model and tokenizer
			const modelPath = path.join(extensionPath, "src/magecode/assets/models/tinyllama-1b.onnx")
			const tokenizerPath = path.join(extensionPath, "src/magecode/assets/models/tokenizer.model")

			await this.loadModel(modelPath)
			await this.loadTokenizer(tokenizerPath)

			this.initialized = true
		} catch (error) {
			throw new Error(
				`Failed to initialize LocalModelTier: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	/**
	 * Load the ONNX model with optimizations
	 */
	private async loadModel(modelPath: string): Promise<void> {
		try {
			// Configure session options for CPU optimization
			const sessionOptions = {
				executionProviders: ["CPUExecutionProvider"],
				graphOptimizationLevel: "all" as const,
				enableCpuMemArena: true,
				executionMode: "sequential" as const,
				// Use up to 4 threads for inference
				intraOpNumThreads: 4,
				interOpNumThreads: 4,
			}

			this.session = await ort.InferenceSession.create(modelPath, sessionOptions)
		} catch (error) {
			throw new Error(`Failed to load model: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/**
	 * Load the tokenizer
	 */
	private async loadTokenizer(tokenizerPath: string): Promise<void> {
		try {
			this.tokenizer = new SentencePieceProcessor()
			await this.tokenizer.load(tokenizerPath)
		} catch (error) {
			throw new Error(`Failed to load tokenizer: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/**
	 * Make a request to the local model
	 * @param prompt The input prompt
	 * @param options Request options
	 */
	async makeRequest(prompt: string, options: ModelRequestOptions): Promise<ModelResponse> {
		if (!this.initialized || !this.session || !this.tokenizer) {
			throw new Error("LocalModelTier not initialized")
		}

		const startTime = Date.now()

		try {
			// Tokenize input
			const inputTokens = this.tokenizer.encodeIds(prompt)

			if (inputTokens.length > 2048) {
				throw new Error("Input prompt exceeds maximum context length of 2048 tokens")
			}

			// Prepare input tensor
			const inputTensor = new ort.Tensor("int64", inputTokens, [1, inputTokens.length])

			// Run inference
			const feeds = { input_ids: inputTensor }
			const maxNewTokens = options.maxTokens || 256
			const temperature = options.temperature || 0.7

			const results = await this.session.run(feeds)

			// Get output tokens
			const outputTokens = Array.from(results.output_ids.data as BigInt64Array).map(Number)

			// Decode tokens
			const outputText = this.tokenizer.decode(outputTokens)

			const latency = Date.now() - startTime

			return {
				text: outputText,
				tokenUsage: {
					inputTokens: inputTokens.length,
					outputTokens: outputTokens.length,
				},
				modelType: "local",
				latency,
			}
		} catch (error) {
			throw new Error(`Local model inference failed: ${error instanceof Error ? error.message : String(error)}`)
		}
	}
}

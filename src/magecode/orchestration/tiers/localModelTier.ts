import * as path from "path"
import * as fs from "fs"
import * as ort from "onnxruntime-node"
import * as vscode from "vscode" // Import vscode for Disposable
import { SentencePieceProcessor } from "sentencepiece-js"
import { IModelTier, ModelRequestOptions, ModelResponse } from "../interfaces"
import { logger } from "../../utils/logging"
import { ApiError, ConfigurationError } from "../../utils/errors"
import {
	getLocalModelPath,
	getLocalTokenizerPath,
	getLocalModelNumThreads,
	getLocalModelMaxContextLength,
} from "../../config/settings" // Import settings functions

/**
 * Implementation of a local model tier using ONNX Runtime
 * for efficient on-device inference
 */
export class LocalModelTier implements IModelTier, vscode.Disposable {
	// Implement Disposable
	private session: ort.InferenceSession | null = null
	private tokenizer: SentencePieceProcessor | null = null
	private initialized = false

	/**
	 * Initialize the local model tier
	 * @param extensionPath Base path of the extension
	 */
	async initialize(extensionPath: string): Promise<void> {
		if (this.initialized) {
			logger.info("[LocalModelTier] Already initialized.")
			return
		}
		logger.info("[LocalModelTier] Initializing...")
		try {
			// Get paths from settings or use defaults relative to extension path
			const userModelPath = getLocalModelPath()
			const userTokenizerPath = getLocalTokenizerPath()

			const defaultModelPath = path.join(extensionPath, "src/magecode/assets/models/tinyllama-1b.onnx") // Default bundled model
			const defaultTokenizerPath = path.join(extensionPath, "src/magecode/assets/models/tokenizer.model") // Default bundled tokenizer

			const modelPath = userModelPath ?? defaultModelPath
			const tokenizerPath = userTokenizerPath ?? defaultTokenizerPath

			logger.info(`[LocalModelTier] Using model path: ${modelPath}`)
			logger.info(`[LocalModelTier] Using tokenizer path: ${tokenizerPath}`)

			await this.loadModel(modelPath)
			await this.loadTokenizer(tokenizerPath)

			this.initialized = true
			logger.info("[LocalModelTier] Initialization complete.")
		} catch (error: any) {
			this.initialized = false // Ensure state reflects failure
			const msg = "Failed to initialize LocalModelTier"
			logger.error(msg, error)
			// Re-throw wrapped error
			if (error instanceof ConfigurationError) {
				throw error // Propagate config errors directly
			}
			throw new ApiError(msg, { cause: error }) // Treat other init failures as API/runtime issues
		}
	}

	/**
	 * Load the ONNX model with optimizations
	 */
	private async loadModel(modelPath: string): Promise<void> {
		logger.info(`[LocalModelTier] Loading model from: ${modelPath}`)
		if (!fs.existsSync(modelPath)) {
			throw new ConfigurationError(`Local model file not found: ${modelPath}`)
		}
		try {
			// Configure session options using settings
			const numThreads = getLocalModelNumThreads()
			logger.info(`[LocalModelTier] Using ${numThreads} threads for ONNX session.`)
			const sessionOptions: ort.InferenceSession.SessionOptions = {
				executionProviders: ["cpu"], // Use 'cpu' for simplicity, ORT maps it
				graphOptimizationLevel: "all",
				enableCpuMemArena: true,
				// executionMode: ort.ExecutionMode.SEQUENTIAL, // Use enum if available
				intraOpNumThreads: numThreads,
				interOpNumThreads: numThreads,
			}

			this.session = await ort.InferenceSession.create(modelPath, sessionOptions)
			logger.info("[LocalModelTier] ONNX session created.")
		} catch (error: any) {
			throw new ConfigurationError(`Failed to load local model: ${modelPath}`, error)
		}
	}

	/**
	 * Load the tokenizer
	 */
	private async loadTokenizer(tokenizerPath: string): Promise<void> {
		logger.info(`[LocalModelTier] Loading tokenizer from: ${tokenizerPath}`)
		if (!fs.existsSync(tokenizerPath)) {
			throw new ConfigurationError(`Local tokenizer file not found: ${tokenizerPath}`)
		}
		try {
			this.tokenizer = new SentencePieceProcessor()
			await this.tokenizer.load(tokenizerPath)
			logger.info("[LocalModelTier] Tokenizer loaded.")
		} catch (error: any) {
			throw new ConfigurationError(`Failed to load local tokenizer: ${tokenizerPath}`, error)
		}
	}

	/**
	 * Make a request to the local model
	 * @param prompt The input prompt
	 * @param options Request options
	 */
	async makeRequest(prompt: string, options: ModelRequestOptions): Promise<ModelResponse> {
		if (!this.initialized || !this.session || !this.tokenizer) {
			// This indicates a programming error or failed initialization
			throw new ApiError("LocalModelTier not initialized or initialization failed.")
		}

		const startTime = Date.now()

		try {
			// Tokenize input
			const inputTokens = this.tokenizer.encodeIds(prompt)

			// Get max context length from settings
			const maxContextLength = getLocalModelMaxContextLength()
			if (inputTokens.length > maxContextLength) {
				throw new ApiError(
					`Input prompt (${inputTokens.length} tokens) exceeds maximum context length of ${maxContextLength} tokens`,
				)
			}

			// Prepare input tensor
			// Ensure inputTokens is Int32Array or similar compatible with int64 tensor data
			const inputData = Int32Array.from(inputTokens) // Convert to Int32Array
			const inputTensor = new ort.Tensor("int64", inputData, [1, inputTokens.length])

			// Run inference
			const feeds = { input_ids: inputTensor }
			// Note: Generation parameters like max_length, temperature are often handled *outside* the raw session.run call,
			// typically in a generation loop or specific ONNX model structures (like encoder-decoder with generate method).
			// This basic example assumes the model generates until EOS or a built-in limit.
			// const maxNewTokens = options.maxTokens || 256; // Keep for potential future use
			// const temperature = options.temperature || 0.7; // Keep for potential future use

			logger.debug("[LocalModelTier] Running local inference...")
			const results = await this.session.run(feeds)
			logger.debug("[LocalModelTier] Local inference complete.")

			// Get output tokens - Adjust key and type based on actual model output
			const outputIdsData = results.output_ids?.data // Use optional chaining
			if (!outputIdsData) {
				throw new ApiError("Local model inference did not return expected 'output_ids'.")
			}
			// Assuming output_ids.data is Int32Array (most common for token IDs)
			// Adjust type assertion if the model specifically outputs BigInt64Array
			const outputTokens = Array.from(outputIdsData as Int32Array) // Directly convert Int32Array to number[]

			// Decode tokens
			const outputText = this.tokenizer.decode(outputTokens)

			const latency = Date.now() - startTime
			logger.info(`[LocalModelTier] Inference latency: ${latency}ms`)

			return {
				text: outputText,
				tokenUsage: {
					inputTokens: inputTokens.length,
					outputTokens: outputTokens.length,
				},
				modelType: "local",
				latency,
			}
		} catch (error: any) {
			// If it's already an ApiError (like the length check), re-throw it directly
			if (error instanceof ApiError) {
				logger.error(`[LocalModelTier] API Error during inference: ${error.message}`)
				throw error
			}
			// Otherwise, wrap other errors
			const msg = "Local model inference failed"
			logger.error(`[LocalModelTier] ${msg}`, error)
			throw new ApiError(msg, { cause: error })
		}
	}

	/**
	 * Dispose resources held by the tier.
	 */
	dispose(): void {
		logger.info("[LocalModelTier] Disposing...")
		// Nullify references to potentially large objects to aid GC
		// ONNX Runtime sessions don't have an explicit dispose method in the Node API
		this.session = null
		this.tokenizer = null // SentencePieceProcessor doesn't have dispose either
		this.initialized = false
		logger.info("[LocalModelTier] Disposed.")
	}
}

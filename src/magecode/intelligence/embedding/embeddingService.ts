import * as vscode from "vscode"
import * as ort from "onnxruntime-node"
import { Tokenizer } from "tokenizers"
import * as fs from "fs"
import * as path from "path"
import { LRUCache } from "lru-cache"
import { logger } from "../../utils/logging" // Import the logger
import { EmbeddingError, ConfigurationError } from "../../utils/errors" // Import custom errors

/**
 * Singleton service responsible for generating text embeddings using a local ONNX model.
 * It handles model loading, tokenization, inference, mean pooling, normalization,
 * and in-memory caching of embeddings.
 */
export class EmbeddingService {
	private static instance: EmbeddingService
	private session: ort.InferenceSession | null = null
	private tokenizer: Tokenizer | null = null
	private embeddingCache: LRUCache<string, number[]> | null = null // Cache: text -> embedding
	private readonly modelPath = path.join(__dirname, "../../assets/models/all-MiniLM-L6-v2.onnx")
	private readonly tokenizerPath = path.join(__dirname, "../../assets/models/tokenizer.json")
	private readonly vocabPath = path.join(__dirname, "../../assets/models/vocab.txt") // optional

	private constructor() {}

	/**
	 * Gets the singleton instance of the EmbeddingService.
	 * @returns The singleton instance.
	 */
	public static getInstance(): EmbeddingService {
		if (!EmbeddingService.instance) {
			EmbeddingService.instance = new EmbeddingService()
		}
		return EmbeddingService.instance
	}

	/**
	 * Initializes the EmbeddingService by loading the ONNX model, tokenizer, and setting up the cache.
	 * This method is idempotent and safe to call multiple times.
	 * @throws {ConfigurationError} If model or tokenizer files are not found.
	 * @throws {EmbeddingError} If ONNX session creation or tokenizer loading fails for other reasons.
	 */
	public async initialize(): Promise<void> {
		if (this.session && this.tokenizer && this.embeddingCache) {
			logger.info("[EmbeddingService] Already initialized.")
			return
		}
		logger.info("[EmbeddingService] Initializing...")

		try {
			// Load ONNX model if not already loaded
			if (!this.session) {
				logger.info(`[EmbeddingService] Loading ONNX model from: ${this.modelPath}`)
				if (!fs.existsSync(this.modelPath)) {
					throw new ConfigurationError(`Embedding model file not found: ${this.modelPath}`)
				}
				this.session = await ort.InferenceSession.create(this.modelPath, {
					executionProviders: ["cpu"], // Use 'cpu' provider
					graphOptimizationLevel: "all",
				})
				logger.info("[EmbeddingService] ONNX session created.")
			}

			// Load tokenizer if not already loaded
			if (!this.tokenizer) {
				logger.info(`[EmbeddingService] Loading tokenizer from: ${this.tokenizerPath}`)
				if (!fs.existsSync(this.tokenizerPath)) {
					throw new ConfigurationError(`Tokenizer file not found: ${this.tokenizerPath}`)
				}
				const tokenizerData = fs.readFileSync(this.tokenizerPath, "utf-8")
				this.tokenizer = await Tokenizer.fromString(tokenizerData)
				logger.info("[EmbeddingService] Tokenizer loaded.")
			}

			// Initialize cache if not already initialized
			if (!this.embeddingCache) {
				this.initializeCache() // Separate cache init logic
			}
			logger.info("[EmbeddingService] Initialization complete.")
		} catch (error: any) {
			const msg = "[EmbeddingService] Initialization failed"
			logger.error(msg, error)
			// Clean up partially initialized resources
			this.session = null
			this.tokenizer = null
			this.embeddingCache = null
			if (error instanceof ConfigurationError) {
				throw error // Re-throw config errors directly
			}
			throw new EmbeddingError(msg, error) // Wrap other errors
		}
	}

	/** Helper to initialize the cache */
	private initializeCache(): void {
		try {
			const config = vscode.workspace.getConfiguration("roo-code")
			const maxItems = config.get<number>("magecode.cache.maxItems", 500) // Use same settings as MMO
			const ttlSeconds = config.get<number>("magecode.cache.ttlSeconds", 3600)
			const ttlMilliseconds = ttlSeconds * 1000

			this.embeddingCache = new LRUCache<string, number[]>({
				max: maxItems,
				ttl: ttlMilliseconds,
			})
			logger.info(`[EmbeddingService] Initialized cache with maxItems: ${maxItems}, ttl: ${ttlSeconds}s`)
		} catch (error: any) {
			// Cache config errors are likely programming errors or bad settings
			throw new ConfigurationError(`Failed to read cache configuration: ${error.message}`, error)
		}
	}

	/**
	 * Generates embeddings for an array of input texts.
	 * It first checks an in-memory cache. For cache misses, it tokenizes the texts,
	 * runs inference using the ONNX model, performs mean pooling and normalization,
	 * caches the results, and returns the embeddings.
	 * @param texts - An array of strings to generate embeddings for.
	 * @returns A promise resolving to an array of embedding vectors (each typically a number array).
	 * @throws {EmbeddingError} If the service is not initialized or if any step in the embedding generation process fails.
	 */
	public async generateEmbeddings(texts: string[]): Promise<number[][]> {
		if (!this.session || !this.tokenizer || !this.embeddingCache) {
			// Throw specific error if not initialized
			throw new EmbeddingError("EmbeddingService not initialized. Call initialize() first.")
		}
		if (texts.length === 0) {
			logger.debug("[EmbeddingService] generateEmbeddings called with empty text array.")
			return []
		}

		const allEmbeddings: (number[] | null)[] = new Array(texts.length).fill(null)
		const textsToProcess: string[] = []
		const indicesToProcess: number[] = []
		let cacheHits = 0

		// 1. Check cache for existing embeddings
		for (let i = 0; i < texts.length; i++) {
			const text = texts[i]
			const cacheKey = text // Using raw text as key per decision
			const cachedEmbedding = this.embeddingCache.get(cacheKey)
			if (cachedEmbedding) {
				allEmbeddings[i] = cachedEmbedding
				cacheHits++
			} else {
				textsToProcess.push(text)
				indicesToProcess.push(i)
			}
		}

		logger.info(
			`[EmbeddingService] Cache check for ${texts.length} texts: ${cacheHits} hits, ${textsToProcess.length} misses.`,
		)

		// 2. Process cache misses
		if (textsToProcess.length > 0) {
			try {
				// Tokenize inputs for misses
				const encoded = await this.tokenizer.encodeBatch(textsToProcess)
				const maxLen = Math.max(...encoded.map((e: any) => e.ids.length))
				const padTokenId = this.tokenizer.tokenToId("[PAD]") ?? 0
				const inputIds = encoded.map((e: any) => padArray(e.ids, maxLen, padTokenId))
				const attentionMask = encoded.map((e: any) => padArray(e.attentionMask, maxLen, 0))

				// Prepare tensors for misses
				const inputIdsTensor = new ort.Tensor("int64", flatten2D(inputIds), [textsToProcess.length, maxLen])
				const attentionMaskTensor = new ort.Tensor("int64", flatten2D(attentionMask), [
					textsToProcess.length,
					maxLen,
				])

				// Run inference for misses
				const feeds: Record<string, ort.Tensor> = {
					input_ids: inputIdsTensor,
					attention_mask: attentionMaskTensor,
				}
				logger.debug(`[EmbeddingService] Running inference for ${textsToProcess.length} texts.`)
				const results = await this.session.run(feeds)
				const lastHiddenState = results["last_hidden_state"] || results[Object.keys(results)[0]]
				if (!lastHiddenState || !lastHiddenState.data) {
					throw new EmbeddingError("Inference did not return expected last_hidden_state.")
				}

				// Mean pooling and caching for new embeddings
				for (let i = 0; i < textsToProcess.length; i++) {
					const originalIndex = indicesToProcess[i]
					const text = textsToProcess[i]
					const cacheKey = text

					const seqLen = attentionMask[i].reduce((a: number, b: number) => a + b, 0)
					// Assuming hiddenSize is 384 for all-MiniLM-L6-v2
					const vector = meanPool(lastHiddenState.data as Float32Array, i, maxLen, 384, attentionMask[i])
					const normalizedVector = l2Normalize(vector)

					allEmbeddings[originalIndex] = normalizedVector // Store in final result array
					this.embeddingCache.set(cacheKey, normalizedVector) // Store in cache
				}
				logger.info(`[EmbeddingService] Processed and cached ${textsToProcess.length} new embeddings.`)
			} catch (error: any) {
				const msg = `[EmbeddingService] Failed to process ${textsToProcess.length} cache misses`
				logger.error(msg, error)
				throw new EmbeddingError(msg, error) // Wrap and re-throw
			}
		} // End of processing cache misses block

		// 3. Return combined results (ensure no nulls remain)
		if (allEmbeddings.some((e) => e === null)) {
			// This should ideally not happen if the logic above is correct
			logger.error("[EmbeddingService] Internal Error: Null embedding found in final result array.")
			throw new EmbeddingError("Internal error: Failed to generate all embeddings.")
		}
		return allEmbeddings as number[][]
	}

	/**
	 * Clears the entire in-memory embedding cache.
	 * This is typically called when underlying file content changes,
	 * invalidating potentially cached embeddings derived from that content.
	 */
	public clearCache(): void {
		if (this.embeddingCache) {
			this.embeddingCache.clear()
			logger.info("[EmbeddingService] Embedding cache cleared.")
		}
	}

	/**
	 * Clears the cache entries associated with a specific file path.
	 * **Note:** Currently implements a simple strategy of clearing the *entire* cache
	 * whenever any file changes, as mapping specific cache keys back to file paths
	 * is not yet implemented.
	 * @param _filePath - The path of the file that changed (currently unused).
	 */
	public clearCacheForFile(_filePath: string): void {
		// For now, simple strategy: clear everything on any change.
		// TODO: Implement mapping from file path to cache keys if needed later for more granular clearing.
		this.clearCache()
	}
}

// Helper: Pad array to length with value
function padArray(arr: number[], length: number, value: number): number[] {
	return arr.concat(Array(length - arr.length).fill(value))
}

// Helper: Flatten 2D array
function flatten2D(arr: number[][]): number[] {
	return arr.reduce((acc, val) => acc.concat(val), [])
}

// Helper: Mean pooling over valid tokens
function meanPool(
	data: Float32Array,
	batchIdx: number,
	seqLen: number,
	hiddenSize: number,
	attentionMask: number[],
): number[] {
	const start = batchIdx * seqLen * hiddenSize
	const sum = new Array(hiddenSize).fill(0)
	let count = 0
	for (let t = 0; t < seqLen; t++) {
		if (attentionMask[t] === 0) continue
		for (let h = 0; h < hiddenSize; h++) {
			sum[h] += data[start + t * hiddenSize + h]
		}
		count++
	}
	return sum.map((x) => x / (count || 1))
}

// Helper: L2 normalization
function l2Normalize(vec: number[]): number[] {
	const norm = Math.sqrt(vec.reduce((acc, x) => acc + x * x, 0)) || 1
	return vec.map((x) => x / norm)
}

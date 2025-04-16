import * as vscode from "vscode"
import * as ort from "onnxruntime-node"
import { Tokenizer } from "tokenizers"
import * as fs from "fs"
import * as path from "path"
import { LRUCache } from "lru-cache"

/**
 * EmbeddingService: Singleton for generating embeddings using ONNX Runtime and Hugging Face Tokenizers.
 * Includes in-memory caching.
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
	 * Get the singleton instance.
	 */
	public static getInstance(): EmbeddingService {
		if (!EmbeddingService.instance) {
			EmbeddingService.instance = new EmbeddingService()
		}
		return EmbeddingService.instance
	}

	/**
	 * Initialize the ONNX session and tokenizer.
	 */
	public async initialize(): Promise<void> {
		if (this.session && this.tokenizer && this.embeddingCache) return

		// Load ONNX model if not already loaded
		if (!this.session) {
			this.session = await ort.InferenceSession.create(this.modelPath, {
				executionProviders: ["cpuExecutionProvider"],
				graphOptimizationLevel: "all",
			})
		}

		// Load tokenizer if not already loaded
		if (!this.tokenizer) {
			const tokenizerData = fs.readFileSync(this.tokenizerPath, "utf-8")
			this.tokenizer = await Tokenizer.fromString(tokenizerData)
		}

		// Initialize cache if not already initialized
		if (!this.embeddingCache) {
			const config = vscode.workspace.getConfiguration("roo-code")
			const maxItems = config.get<number>("magecode.cache.maxItems", 500) // Use same settings as MMO
			const ttlSeconds = config.get<number>("magecode.cache.ttlSeconds", 3600)
			const ttlMilliseconds = ttlSeconds * 1000

			this.embeddingCache = new LRUCache<string, number[]>({
				max: maxItems,
				ttl: ttlMilliseconds,
			})
			console.log(`[EmbeddingService] Initialized cache with maxItems: ${maxItems}, ttl: ${ttlSeconds}s`)
		}
	}

	/**
	 * Generate embeddings for an array of texts.
	 * Uses caching to avoid recomputing embeddings for identical texts.
	 * @param texts Array of input strings.
	 * @returns Promise resolving to array of 384-dim vectors.
	 */
	public async generateEmbeddings(texts: string[]): Promise<number[][]> {
		if (!this.session || !this.tokenizer || !this.embeddingCache) {
			throw new Error("EmbeddingService not initialized. Call initialize() first.")
		}
		if (texts.length === 0) return []

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

		console.log(
			`[EmbeddingService] Cache check for ${texts.length} texts: ${cacheHits} hits, ${textsToProcess.length} misses.`,
		)

		// 2. Process cache misses
		if (textsToProcess.length > 0) {
			// Tokenize inputs for misses
			const encoded = await this.tokenizer.encodeBatch(textsToProcess)
			const maxLen = Math.max(...encoded.map((e: any) => e.ids.length))
			const inputIds = encoded.map((e: any) => padArray(e.ids, maxLen, this.tokenizer!.tokenToId("[PAD]") ?? 0))
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
			const results = await this.session.run(feeds)
			const lastHiddenState = results["last_hidden_state"] || results[Object.keys(results)[0]]

			// Mean pooling and caching for new embeddings
			for (let i = 0; i < textsToProcess.length; i++) {
				const originalIndex = indicesToProcess[i]
				const text = textsToProcess[i]
				const cacheKey = text

				const seqLen = attentionMask[i].reduce((a: number, b: number) => a + b, 0)
				const vector = meanPool(lastHiddenState.data as Float32Array, i, maxLen, 384, attentionMask[i])
				const normalizedVector = l2Normalize(vector)

				allEmbeddings[originalIndex] = normalizedVector // Store in final result array
				this.embeddingCache.set(cacheKey, normalizedVector) // Store in cache
			}
			console.log(`[EmbeddingService] Processed and cached ${textsToProcess.length} new embeddings.`)
		}

		// 3. Return combined results (ensure no nulls remain)
		if (allEmbeddings.some((e) => e === null)) {
			// This should not happen if logic is correct, but adding a safeguard
			console.error("[EmbeddingService] Error: Null embedding found in final result array.")
			throw new Error("Failed to generate all embeddings.")
		}
		return allEmbeddings as number[][]
	}

	/**
	 * Clears the entire embedding cache.
	 * Called by SyncService on file changes as a simple invalidation strategy.
	 */
	public clearCache(): void {
		if (this.embeddingCache) {
			this.embeddingCache.clear()
			console.log("[EmbeddingService] Embedding cache cleared.")
		}
	}

	/**
	 * Placeholder for potentially more granular cache clearing based on file path.
	 * Currently clears the entire cache.
	 * @param _filePath The path of the file that changed (currently unused).
	 */
	public clearCacheForFile(_filePath: string): void {
		// For now, simple strategy: clear everything on any change.
		// TODO: Implement mapping from file path to cache keys if needed later.
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

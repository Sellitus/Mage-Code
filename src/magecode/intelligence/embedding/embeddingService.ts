import * as ort from "onnxruntime-node"
import { Tokenizer } from "tokenizers"
import * as fs from "fs"
import * as path from "path"

/**
 * EmbeddingService: Singleton for generating embeddings using ONNX Runtime and Hugging Face Tokenizers.
 */
export class EmbeddingService {
	private static instance: EmbeddingService
	private session: ort.InferenceSession | null = null
	private tokenizer: Tokenizer | null = null
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
		if (this.session && this.tokenizer) return

		// Load ONNX model
		this.session = await ort.InferenceSession.create(this.modelPath, {
			executionProviders: ["cpuExecutionProvider"],
			graphOptimizationLevel: "all",
		})

		// Load tokenizer
		const tokenizerData = fs.readFileSync(this.tokenizerPath, "utf-8")
		this.tokenizer = await Tokenizer.fromString(tokenizerData)
	}

	/**
	 * Generate embeddings for an array of texts.
	 * @param texts Array of input strings.
	 * @returns Promise resolving to array of 384-dim vectors.
	 */
	public async generateEmbeddings(texts: string[]): Promise<number[][]> {
		if (!this.session || !this.tokenizer) {
			throw new Error("EmbeddingService not initialized")
		}
		if (texts.length === 0) return []

		// Tokenize inputs
		const encoded = await this.tokenizer.encodeBatch(texts)
		const maxLen = Math.max(...encoded.map((e: any) => e.ids.length))
		const inputIds = encoded.map((e: any) => padArray(e.ids, maxLen, this.tokenizer!.tokenToId("[PAD]") ?? 0))
		const attentionMask = encoded.map((e: any) => padArray(e.attentionMask, maxLen, 0))

		// Prepare tensors
		const inputIdsTensor = new ort.Tensor("int64", flatten2D(inputIds), [texts.length, maxLen])
		const attentionMaskTensor = new ort.Tensor("int64", flatten2D(attentionMask), [texts.length, maxLen])

		// Run inference
		const feeds: Record<string, ort.Tensor> = {
			input_ids: inputIdsTensor,
			attention_mask: attentionMaskTensor,
		}
		const results = await this.session.run(feeds)
		const lastHiddenState = results["last_hidden_state"] || results[Object.keys(results)[0]]
		// lastHiddenState: [batch, seq_len, hidden_size]

		// Mean pooling
		const embeddings: number[][] = []
		for (let i = 0; i < texts.length; i++) {
			const seqLen = attentionMask[i].reduce((a: number, b: number) => a + b, 0)
			const vector = meanPool(lastHiddenState.data as Float32Array, i, maxLen, 384, attentionMask[i])
			embeddings.push(l2Normalize(vector))
		}
		return embeddings
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

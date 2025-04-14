import { EmbeddingService } from "../embeddingService"

jest.mock("onnxruntime-node", () => {
	class MockTensor {
		type: string
		data: any
		dims: number[]
		constructor(type: string, data: any, dims: number[]) {
			this.type = type
			this.data = data
			this.dims = dims
		}
	}
	const mockRun = jest.fn(async (feeds: any) => ({
		last_hidden_state: {
			data: (() => {
				// 2 samples, 3 tokens, 384 hidden size (all ones for simplicity)
				const batch = 2,
					seq = 3,
					hidden = 384
				const arr = new Float32Array(batch * seq * hidden)
				for (let b = 0; b < batch; b++) {
					for (let t = 0; t < seq; t++) {
						for (let h = 0; h < hidden; h++) {
							arr[b * seq * hidden + t * hidden + h] = 1
						}
					}
				}
				return arr
			})(),
			dims: [2, 3, 384],
		},
	}))
	return {
		InferenceSession: {
			create: jest.fn(async () => ({
				run: mockRun,
			})),
		},
		Tensor: MockTensor,
	}
})

jest.mock("tokenizers", () => {
	return {
		Tokenizer: {
			fromString: jest.fn(async () => ({
				encodeBatch: jest.fn(async (texts: string[]) =>
					texts.map((t, i) => ({
						ids: [101, 102 + i, 103 + i],
						attentionMask: [1, 1, 1],
					})),
				),
				tokenToId: jest.fn((token: string) => 0),
			})),
		},
	}
})

describe("EmbeddingService", () => {
	let service: EmbeddingService

	beforeEach(async () => {
		service = EmbeddingService.getInstance()
		await service.initialize()
	})

	it("should initialize without errors", async () => {
		expect(service).toBeDefined()
	})

	it("should return correct shape for generateEmbeddings", async () => {
		const result = await service.generateEmbeddings(["foo", "bar"])
		expect(Array.isArray(result)).toBe(true)
		expect(result.length).toBe(2)
		expect(Array.isArray(result[0])).toBe(true)
		expect(result[0].length).toBe(384) // model hidden size
	})

	it("should return empty array for empty input", async () => {
		const result = await service.generateEmbeddings([])
		expect(result).toEqual([])
	})

	it("should produce L2-normalized vectors", async () => {
		const result = await service.generateEmbeddings(["foo"])
		const norm = Math.sqrt(result[0].reduce((acc, x) => acc + x * x, 0))
		expect(Math.abs(norm - 1)).toBeLessThan(1e-6)
	})

	it("should handle large batch input", async () => {
		const batch = Array(32).fill("test")
		const result = await service.generateEmbeddings(batch)
		expect(result.length).toBe(32)
	})

	it("should produce similar vectors for similar inputs", async () => {
		const res1 = await service.generateEmbeddings(["hello world"])
		const res2 = await service.generateEmbeddings(["hello world!"])
		// Cosine similarity should be high (mocked, so will be identical)
		const dot = res1[0].reduce((acc, x, i) => acc + x * res2[0][i], 0)
		expect(dot).toBeCloseTo(1, 5)
	})
})

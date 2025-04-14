import * as path from "path"
import { LocalModelTier } from "../localModelTier"
import * as ort from "onnxruntime-node"
import { SentencePieceProcessor } from "sentencepiece-js"

// Mock dependencies
jest.mock("onnxruntime-node")
jest.mock("sentencepiece-js")

describe("LocalModelTier", () => {
	let localTier: LocalModelTier
	const mockExtensionPath = "/mock/extension/path"

	beforeEach(() => {
		localTier = new LocalModelTier()
		jest.clearAllMocks()

		// Setup default mocks
		const mockSession = {
			run: jest.fn().mockResolvedValue({
				output_ids: {
					data: new BigInt64Array([1n, 2n, 3n]),
				},
			}),
		}

		jest.spyOn(ort.InferenceSession, "create").mockResolvedValue(mockSession as any)
		;(SentencePieceProcessor as jest.Mock).mockImplementation(() => ({
			load: jest.fn().mockResolvedValue(undefined),
			encodeIds: jest.fn().mockReturnValue([1, 2, 3, 4]),
			decode: jest.fn().mockReturnValue("Generated response"),
		}))
	})

	describe("initialize", () => {
		it("should load model and tokenizer successfully", async () => {
			const mockSession = {
				run: jest.fn(),
			}

			// Mock ONNX session creation
			jest.spyOn(ort.InferenceSession, "create").mockResolvedValue(mockSession as any)

			// Mock tokenizer loading
			const mockTokenizerLoad = jest.fn().mockResolvedValue(undefined)
			;(SentencePieceProcessor as jest.Mock).mockImplementation(() => ({
				load: mockTokenizerLoad,
			}))

			await localTier.initialize(mockExtensionPath)

			// Verify model loading
			expect(ort.InferenceSession.create).toHaveBeenCalledWith(
				path.join(mockExtensionPath, "src/magecode/assets/models/tinyllama-1b.onnx"),
				expect.any(Object),
			)

			// Verify tokenizer loading
			expect(SentencePieceProcessor).toHaveBeenCalled()
			expect(mockTokenizerLoad).toHaveBeenCalledWith(
				path.join(mockExtensionPath, "src/magecode/assets/models/tokenizer.model"),
			)
		})

		it("should throw error if model loading fails", async () => {
			jest.spyOn(ort.InferenceSession, "create").mockRejectedValue(new Error("Model load failed"))

			await expect(localTier.initialize(mockExtensionPath)).rejects.toThrow(
				"Failed to initialize LocalModelTier: Failed to load model: Model load failed",
			)
		})

		it("should throw error if tokenizer loading fails", async () => {
			const mockSession = { run: jest.fn() }
			jest.spyOn(ort.InferenceSession, "create").mockResolvedValue(mockSession as any)
			;(SentencePieceProcessor as jest.Mock).mockImplementation(() => ({
				load: jest.fn().mockRejectedValue(new Error("Tokenizer load failed")),
			}))

			await expect(localTier.initialize(mockExtensionPath)).rejects.toThrow(
				"Failed to initialize LocalModelTier: Failed to load tokenizer: Tokenizer load failed",
			)
		})
	})

	describe("makeRequest", () => {
		const mockPrompt = "Test prompt"
		const mockOptions = { maxTokens: 100, temperature: 0.7 }

		beforeEach(async () => {
			await localTier.initialize(mockExtensionPath)
		})

		it("should process request successfully", async () => {
			const response = await localTier.makeRequest(mockPrompt, mockOptions)

			expect(response).toEqual({
				text: "Generated response",
				tokenUsage: {
					inputTokens: 4,
					outputTokens: 3,
				},
				modelType: "local",
				latency: expect.any(Number),
			})
		})

		it("should throw error if not initialized", async () => {
			localTier = new LocalModelTier() // New instance without initialization

			await expect(localTier.makeRequest(mockPrompt, mockOptions)).rejects.toThrow(
				"LocalModelTier not initialized",
			)
		})

		it("should throw error if input exceeds max length", async () => {
			// Mock tokenizer to return more tokens than the limit
			;(SentencePieceProcessor as jest.Mock).mockImplementation(() => ({
				load: jest.fn().mockResolvedValue(undefined),
				encodeIds: jest.fn().mockReturnValue(new Array(2049).fill(1)), // Exceed 2048 token limit
				decode: jest.fn().mockReturnValue("Generated response"),
			}))

			// Reinitialize with new mock
			localTier = new LocalModelTier()
			await localTier.initialize(mockExtensionPath)

			await expect(localTier.makeRequest(mockPrompt, mockOptions)).rejects.toThrow(
				"Input prompt exceeds maximum context length of 2048 tokens",
			)
		})

		it("should use default values when options not provided", async () => {
			await localTier.makeRequest(mockPrompt, {})

			// Verify defaults were used in tensor creation
			expect(ort.Tensor).toHaveBeenCalledWith("int64", expect.any(Array), expect.any(Array))
		})
	})
})

import * as path from "path"
import * as fs from "fs" // Import fs to mock it
import { LocalModelTier } from "../localModelTier"
import * as ort from "onnxruntime-node"
import { SentencePieceProcessor } from "sentencepiece-js"
import { ApiError, ConfigurationError } from "../../../utils/errors" // Import custom errors

// Mock dependencies
jest.mock("onnxruntime-node")
jest.mock("sentencepiece-js")
jest.mock("fs") // Mock the entire fs module
// Mock settings functions (assuming defaults are used if not overridden)
// Correct the relative path here
jest.mock("../../../config/settings", () => ({
	getLocalModelPath: jest.fn().mockReturnValue(null),
	getLocalTokenizerPath: jest.fn().mockReturnValue(null),
	getLocalModelNumThreads: jest.fn().mockReturnValue(4),
	getLocalModelMaxContextLength: jest.fn().mockReturnValue(2048),
}))

describe("LocalModelTier", () => {
	let localTier: LocalModelTier
	const mockExtensionPath = "/mock/extension/path"
	const defaultModelPath = path.join(mockExtensionPath, "src/magecode/assets/models/tinyllama-1b.onnx")
	const defaultTokenizerPath = path.join(mockExtensionPath, "src/magecode/assets/models/tokenizer.model")
	let mockSession: any // To hold the mock session for manipulation

	beforeEach(() => {
		localTier = new LocalModelTier()
		jest.clearAllMocks()

		// Mock fs.existsSync to return true by default for these tests
		;(fs.existsSync as jest.Mock).mockReturnValue(true)

		// Setup default mocks for successful initialization
		mockSession = {
			// Assign to the outer variable
			run: jest.fn().mockResolvedValue({
				// Adjust output_ids based on expected tensor type (e.g., Int32Array)
				output_ids: { data: Int32Array.from([1, 2, 3]) },
			}),
		}
		jest.spyOn(ort.InferenceSession, "create").mockResolvedValue(mockSession as any)
		;(SentencePieceProcessor as jest.Mock).mockImplementation(() => ({
			load: jest.fn().mockResolvedValue(undefined),
			encodeIds: jest.fn().mockReturnValue([1, 2, 3, 4]), // Example token IDs
			decode: jest.fn().mockReturnValue("Generated response"),
			tokenToId: jest.fn().mockReturnValue(0), // Mock tokenToId for padding
		}))
	})

	afterEach(() => {
		jest.restoreAllMocks() // Restore all mocks after each test
	})

	describe("initialize", () => {
		it("should load model and tokenizer successfully using default paths", async () => {
			await localTier.initialize(mockExtensionPath)

			// Verify model loading uses default path when setting returns null
			expect(ort.InferenceSession.create).toHaveBeenCalledWith(defaultModelPath, expect.any(Object))
			expect(SentencePieceProcessor).toHaveBeenCalled()
			// Get the instance created by the mock constructor
			const mockTokenizerInstance = (SentencePieceProcessor as jest.Mock).mock.results[0].value
			expect(mockTokenizerInstance.load).toHaveBeenCalledWith(defaultTokenizerPath)
		})

		it("should throw ConfigurationError if model file not found", async () => {
			;(fs.existsSync as jest.Mock).mockReturnValue(false) // Simulate file not found
			await expect(localTier.initialize(mockExtensionPath)).rejects.toThrow(
				new ConfigurationError(`Local model file not found: ${defaultModelPath}`),
			)
		})

		it("should throw ConfigurationError if tokenizer file not found", async () => {
			// Simulate model exists, but tokenizer doesn't
			;(fs.existsSync as jest.Mock).mockImplementation((p) => p === defaultModelPath)
			await expect(localTier.initialize(mockExtensionPath)).rejects.toThrow(
				new ConfigurationError(`Local tokenizer file not found: ${defaultTokenizerPath}`),
			)
		})

		it("should throw ConfigurationError if model loading fails (ONNX error)", async () => {
			const modelLoadError = new Error("Model load failed")
			jest.spyOn(ort.InferenceSession, "create").mockRejectedValue(modelLoadError)

			await expect(localTier.initialize(mockExtensionPath)).rejects.toThrow(
				new ConfigurationError(`Failed to load local model: ${defaultModelPath}`, modelLoadError),
			)
		})

		it("should throw ConfigurationError if tokenizer loading fails (SentencePiece error)", async () => {
			const tokenizerLoadError = new Error("Tokenizer load failed")
			;(SentencePieceProcessor as jest.Mock).mockImplementation(() => ({
				load: jest.fn().mockRejectedValue(tokenizerLoadError),
			}))

			await expect(localTier.initialize(mockExtensionPath)).rejects.toThrow(
				new ConfigurationError(`Failed to load local tokenizer: ${defaultTokenizerPath}`, tokenizerLoadError),
			)
		})
	})

	describe("makeRequest", () => {
		const mockPrompt = "Test prompt"
		const mockOptions = { maxTokens: 100, temperature: 0.7 }

		beforeEach(async () => {
			// Ensure initialized state for these tests
			await localTier.initialize(mockExtensionPath)
			// Note: mockSession is already set up in the outer beforeEach
		})

		it("should process request successfully", async () => {
			const response = await localTier.makeRequest(mockPrompt, mockOptions)

			expect(response).toEqual({
				text: "Generated response",
				tokenUsage: {
					inputTokens: 4, // From default mock encodeIds
					outputTokens: 3, // From default mock session.run output
				},
				modelType: "local",
				latency: expect.any(Number),
			})
			// Check if the specific mock session's run was called
			expect(mockSession.run).toHaveBeenCalled()
		})

		it("should throw ApiError if not initialized", async () => {
			const uninitializedTier = new LocalModelTier() // New instance without initialization

			await expect(uninitializedTier.makeRequest(mockPrompt, mockOptions)).rejects.toThrow(
				new ApiError("LocalModelTier not initialized or initialization failed."),
			)
		})

		it("should throw ApiError if input exceeds max length", async () => {
			// Mock tokenizer to return more tokens than the limit (2048 default)
			const mockTokenizerInstance = (SentencePieceProcessor as jest.Mock).mock.results[0].value
			mockTokenizerInstance.encodeIds.mockReturnValue(new Array(2049).fill(1))

			// Expect the specific ApiError message (length might vary slightly if default changes)
			await expect(localTier.makeRequest(mockPrompt, mockOptions)).rejects.toThrow(
				new ApiError(`Input prompt (2049 tokens) exceeds maximum context length of 2048 tokens`),
			)
		})

		it("should use default values when options not provided", async () => {
			await localTier.makeRequest(mockPrompt, {}) // Empty options

			// Check if the specific mock session's run was called
			expect(mockSession.run).toHaveBeenCalled()
			// We can't easily check the *internal* defaults of session.run without more complex mocking
		})

		it("should throw ApiError if session.run fails", async () => {
			const inferenceError = new Error("Inference failed")
			// Mock the run method on the specific instance used in this test block
			mockSession.run.mockRejectedValue(inferenceError)

			await expect(localTier.makeRequest(mockPrompt, mockOptions)).rejects.toThrow(
				new ApiError("Local model inference failed", { cause: inferenceError }),
			)
		})
	})
})

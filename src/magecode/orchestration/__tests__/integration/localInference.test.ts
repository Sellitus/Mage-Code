import * as path from "path"
import { MultiModelOrchestrator } from "../../index"
import { CloudModelTier } from "../../tiers/cloudModelTier"
import { LocalModelTier } from "../../tiers/localModelTier"
import * as ort from "onnxruntime-node"

// Mock ONNX Runtime
jest.mock("onnxruntime-node", () => {
	const actualModule = jest.requireActual("onnxruntime-node")
	return {
		...actualModule,
		InferenceSession: {
			create: jest.fn().mockImplementation(async () => ({
				run: jest.fn().mockImplementation(async () => {
					// Simulate some processing time
					await new Promise((resolve) => setTimeout(resolve, 10))
					return {
						output_ids: {
							data: new BigInt64Array([1n, 2n, 3n]),
						},
					}
				}),
			})),
		},
		Tensor: jest.fn().mockImplementation(() => ({})),
	}
})

// Mock SentencePiece
jest.mock("sentencepiece-js", () => ({
	SentencePieceProcessor: jest.fn().mockImplementation(() => ({
		load: jest.fn().mockResolvedValue(undefined),
		encodeIds: jest.fn().mockReturnValue([1, 2, 3, 4]),
		decode: jest.fn().mockReturnValue("Mock local model response"),
	})),
}))

describe("Local Model Inference Integration", () => {
	let cloudTier: CloudModelTier
	let localTier: LocalModelTier
	let orchestrator: MultiModelOrchestrator
	const mockExtensionPath = path.resolve(__dirname, "../../../..")

	beforeEach(async () => {
		// Clear all mocks before each test
		jest.clearAllMocks()

		// Set up real instances with mocked dependencies
		cloudTier = new CloudModelTier({
			completePrompt: async () => ({ content: "Cloud response" }), // Minimal mock for cloud tier
		} as any)

		localTier = new LocalModelTier()
		await localTier.initialize(mockExtensionPath)

		orchestrator = new MultiModelOrchestrator(cloudTier, localTier)
	})

	it("should successfully generate response using local tier for simple prompts", async () => {
		const prompt = "What is 2+2?"
		const options = {
			maxTokens: 50,
			temperature: 0.7,
		}

		const response = await orchestrator.makeApiRequest(prompt, options)

		expect(response).toBeDefined()
		expect(response.content).toBe("Mock local model response")
		expect(response.modelType).toBe("local")
		expect(response.usage).toBeDefined()
		expect(response.latency).toBeGreaterThan(0)
	})

	it("should route complex prompts to cloud tier", async () => {
		const complexPrompt = "A".repeat(1500) // Long prompt
		const options = {
			maxTokens: 1000,
			temperature: 0.7,
		}

		const response = await orchestrator.makeApiRequest(complexPrompt, options)

		expect(response).toBeDefined()
		expect(response.content).toBe("Cloud response")
		expect(response.modelType).toBe("cloud")
	})

	it("should handle graceful fallback to cloud tier", async () => {
		// Mock ONNX Runtime to fail for this specific test
		;(ort.InferenceSession.create as jest.Mock).mockRejectedValueOnce(new Error("Mock ONNX error"))

		// Reset LocalModelTier to trigger the error
		localTier = new LocalModelTier()
		await localTier.initialize(mockExtensionPath).catch(() => {
			/* Expected error */
		})

		// Create new orchestrator with the failed local tier
		orchestrator = new MultiModelOrchestrator(cloudTier, localTier)

		const prompt = "Test fallback"
		const options = {
			maxTokens: 50,
			temperature: 0.7,
		}

		const response = await orchestrator.makeApiRequest(prompt, options)

		expect(response).toBeDefined()
		expect(response.content).toBe("Cloud response")
		expect(response.modelType).toBe("cloud")
	})
})

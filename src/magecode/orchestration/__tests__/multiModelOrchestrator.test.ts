import { MultiModelOrchestrator } from ".."
import { CloudModelTier } from "../tiers/cloudModelTier"
import { LocalModelTier } from "../tiers/localModelTier"
import { ModelRequestOptions, ModelResponse } from "../interfaces"
import { RequestOptions } from "../../interfaces"

// Mock the tiers
jest.mock("../tiers/cloudModelTier")
jest.mock("../tiers/localModelTier")

describe("MultiModelOrchestrator", () => {
	let mockCloudTier: jest.Mocked<CloudModelTier>
	let mockLocalTier: jest.Mocked<LocalModelTier>
	let orchestrator: MultiModelOrchestrator

	beforeEach(() => {
		mockCloudTier = new CloudModelTier(null as any) as jest.Mocked<CloudModelTier>
		mockLocalTier = new LocalModelTier() as jest.Mocked<LocalModelTier>
		orchestrator = new MultiModelOrchestrator(mockCloudTier, mockLocalTier)
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	describe("makeApiRequest", () => {
		const mockPrompt = "Test prompt"
		const mockOptions: RequestOptions = {
			maxTokens: 100,
			temperature: 0.7,
		}

		const mockResponse: ModelResponse = {
			text: "Mock response",
			tokenUsage: {
				inputTokens: 10,
				outputTokens: 20,
			},
			modelType: "local",
			latency: 100,
		}

		it("should use local tier for simple requests", async () => {
			mockLocalTier.makeRequest.mockResolvedValue(mockResponse)

			const result = await orchestrator.makeApiRequest(mockPrompt, mockOptions)

			expect(mockLocalTier.makeRequest).toHaveBeenCalled()
			expect(mockCloudTier.makeRequest).not.toHaveBeenCalled()
			expect(result).toEqual({
				content: mockResponse.text,
				usage: mockResponse.tokenUsage,
				modelType: mockResponse.modelType,
				latency: mockResponse.latency,
			})
		})

		it("should use cloud tier for complex requests", async () => {
			const complexPrompt = "A".repeat(1500) // Long prompt
			const complexOptions: RequestOptions = {
				maxTokens: 1000, // Large output
				stopSequences: ["END"], // Stop sequences
			}

			mockCloudTier.makeRequest.mockResolvedValue({
				...mockResponse,
				modelType: "cloud",
			})

			const result = await orchestrator.makeApiRequest(complexPrompt, complexOptions)

			expect(mockCloudTier.makeRequest).toHaveBeenCalled()
			expect(mockLocalTier.makeRequest).not.toHaveBeenCalled()
			expect(result.modelType).toBe("cloud")
		})

		it("should fallback to cloud tier if local tier fails", async () => {
			mockLocalTier.makeRequest.mockRejectedValue(new Error("LocalModelTier failed"))
			mockCloudTier.makeRequest.mockResolvedValue({
				...mockResponse,
				modelType: "cloud",
			})

			const result = await orchestrator.makeApiRequest(mockPrompt, mockOptions)

			expect(mockLocalTier.makeRequest).toHaveBeenCalled()
			expect(mockCloudTier.makeRequest).toHaveBeenCalled()
			expect(result.modelType).toBe("cloud")
		})

		it("should throw error if both tiers fail", async () => {
			mockLocalTier.makeRequest.mockRejectedValue(new Error("LocalModelTier failed"))
			mockCloudTier.makeRequest.mockRejectedValue(new Error("CloudModelTier failed"))

			await expect(orchestrator.makeApiRequest(mockPrompt, mockOptions)).rejects.toThrow(
				"Cloud fallback failed: CloudModelTier failed",
			)
		})

		it("should handle missing options", async () => {
			mockLocalTier.makeRequest.mockResolvedValue(mockResponse)

			await orchestrator.makeApiRequest(mockPrompt)

			expect(mockLocalTier.makeRequest).toHaveBeenCalledWith(
				mockPrompt,
				expect.objectContaining({
					maxTokens: undefined,
					temperature: undefined,
					stopSequences: undefined,
					cacheStrategy: undefined,
				}),
			)
		})
	})
})

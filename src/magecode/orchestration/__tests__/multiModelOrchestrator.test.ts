import { MultiModelOrchestrator } from ".."
import { CloudModelTier } from "../tiers/cloudModelTier"
import { LocalModelTier } from "../tiers/localModelTier"
import { ModelTier, ModelRequestOptions, ModelResponse } from "../interfaces" // Combined imports
import { ModelRouter } from "../router"
import { PromptService } from "../prompt/promptService"
import { RequestOptions } from "../../interfaces"

// Mock the tiers
jest.mock("../tiers/cloudModelTier")
jest.mock("../tiers/localModelTier")
jest.mock("../router") // Added mock
jest.mock("../prompt/promptService") // Added mock

describe("MultiModelOrchestrator", () => {
	let mockCloudTier: jest.Mocked<CloudModelTier>
	let mockLocalTier: jest.Mocked<LocalModelTier>
	let mockRouter: jest.Mocked<ModelRouter> // Added mock instance variable
	let mockPromptService: jest.Mocked<PromptService> // Added mock instance variable
	let orchestrator: MultiModelOrchestrator

	beforeEach(() => {
		mockCloudTier = new CloudModelTier(null as any) as jest.Mocked<CloudModelTier>
		mockLocalTier = new LocalModelTier() as jest.Mocked<LocalModelTier>
		mockRouter = new ModelRouter() as jest.Mocked<ModelRouter> // Instantiate mock
		mockPromptService = new PromptService() as jest.Mocked<PromptService> // Instantiate mock
		// Update constructor call with new mocks
		orchestrator = new MultiModelOrchestrator(mockCloudTier, mockLocalTier, mockRouter, mockPromptService)
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
			// Explicitly mock router for this test
			mockRouter.routeRequest.mockResolvedValue(ModelTier.LOCAL)
			mockLocalTier.makeRequest.mockResolvedValue(mockResponse)

			const result = await orchestrator.makeApiRequest(mockPrompt, mockOptions)

			expect(mockRouter.routeRequest).toHaveBeenCalledWith(undefined, mockPrompt, { taskType: undefined })
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
			// Explicitly mock router for this test
			mockRouter.routeRequest.mockResolvedValue(ModelTier.CLOUD)
			const complexPrompt = "A".repeat(1500) // Long prompt
			const complexOptions: RequestOptions = {
				maxTokens: 1000, // Large output
				stopSequences: ["END"], // Stop sequences
				taskType: "complex", // Add taskType for routing check
			}

			mockCloudTier.makeRequest.mockResolvedValue({
				...mockResponse,
				modelType: "cloud",
			})

			const result = await orchestrator.makeApiRequest(complexPrompt, complexOptions)

			expect(mockRouter.routeRequest).toHaveBeenCalledWith(complexOptions.taskType, complexPrompt, {
				taskType: complexOptions.taskType,
			})
			expect(mockCloudTier.makeRequest).toHaveBeenCalled()
			expect(mockLocalTier.makeRequest).not.toHaveBeenCalled()
			expect(result.modelType).toBe("cloud")
		})

		it("should fallback to cloud tier if local tier fails and fallback allowed", async () => {
			// Explicitly mock router for this test
			mockRouter.routeRequest.mockResolvedValue(ModelTier.LOCAL)
			// Setup mocks within the test
			mockLocalTier.makeRequest.mockRejectedValue(new Error("LocalModelTier failed"))
			mockCloudTier.makeRequest.mockResolvedValue({
				...mockResponse,
				modelType: "cloud",
			})

			const result = await orchestrator.makeApiRequest(mockPrompt, mockOptions)

			expect(mockRouter.routeRequest).toHaveBeenCalledWith(undefined, mockPrompt, { taskType: undefined })
			expect(mockLocalTier.makeRequest).toHaveBeenCalledTimes(1) // Ensure it was called once before failing
			expect(mockCloudTier.makeRequest).toHaveBeenCalledTimes(1) // Ensure fallback was called
			expect(result.modelType).toBe("cloud")
		})

		it("should throw specific fallback error if cloud fallback fails", async () => {
			// Explicitly mock router for this test
			mockRouter.routeRequest.mockResolvedValue(ModelTier.LOCAL)
			// Setup mocks within the test
			mockLocalTier.makeRequest.mockRejectedValue(new Error("LocalModelTier failed"))
			mockCloudTier.makeRequest.mockRejectedValue(new Error("CloudModelTier fallback failed"))

			await expect(orchestrator.makeApiRequest(mockPrompt, mockOptions)).rejects.toThrow(
				`Initial request failed (${ModelTier.LOCAL}) and Cloud fallback failed: CloudModelTier fallback failed`,
			)
			expect(mockRouter.routeRequest).toHaveBeenCalledWith(undefined, mockPrompt, { taskType: undefined })
			expect(mockLocalTier.makeRequest).toHaveBeenCalledTimes(1)
			expect(mockCloudTier.makeRequest).toHaveBeenCalledTimes(1)
		})

		it("should throw original local error if fallback is disabled", async () => {
			// Explicitly mock router for this test
			mockRouter.routeRequest.mockResolvedValue(ModelTier.LOCAL)
			// Setup mocks within the test
			mockLocalTier.makeRequest.mockRejectedValue(new Error("Local Failed No Fallback"))

			await expect(orchestrator.makeApiRequest(mockPrompt, { allowFallback: false })).rejects.toThrow(
				`Model request failed for tier ${ModelTier.LOCAL}: Local Failed No Fallback`,
			)
			expect(mockRouter.routeRequest).toHaveBeenCalledWith(undefined, mockPrompt, { taskType: undefined })
			expect(mockLocalTier.makeRequest).toHaveBeenCalledTimes(1)
			expect(mockCloudTier.makeRequest).not.toHaveBeenCalled()
		})

		it("should throw cloud error if cloud tier fails (no fallback)", async () => {
			// Explicitly mock router for this test
			mockRouter.routeRequest.mockResolvedValue(ModelTier.CLOUD)
			// Setup mocks within the test
			mockCloudTier.makeRequest.mockRejectedValue(new Error("Cloud Failed Directly"))

			await expect(orchestrator.makeApiRequest(mockPrompt, mockOptions)).rejects.toThrow(
				`Model request failed for tier ${ModelTier.CLOUD}: Cloud Failed Directly`,
			)
			expect(mockRouter.routeRequest).toHaveBeenCalledWith(undefined, mockPrompt, { taskType: undefined })
			expect(mockCloudTier.makeRequest).toHaveBeenCalledTimes(1)
			expect(mockLocalTier.makeRequest).not.toHaveBeenCalled()
		})

		it("should handle missing options correctly", async () => {
			// Explicitly mock router for this test
			mockRouter.routeRequest.mockResolvedValue(ModelTier.LOCAL)
			// Explicitly mock tier for this test, even though beforeEach does it
			mockLocalTier.makeRequest.mockResolvedValue(mockResponse)
			// Explicitly mock prompt service for this test to ensure pass-through
			mockPromptService.formatPrompt.mockImplementation((prompt, _) => prompt)

			await orchestrator.makeApiRequest(mockPrompt) // No options passed

			expect(mockRouter.routeRequest).toHaveBeenCalledWith(undefined, mockPrompt, { taskType: undefined })
			// Verify prompt service was called correctly
			expect(mockPromptService.formatPrompt).toHaveBeenCalledWith(mockPrompt, ModelTier.LOCAL)
			expect(mockLocalTier.makeRequest).toHaveBeenCalledWith(
				mockPrompt,
				expect.objectContaining({
					// Check that default/undefined options are passed correctly
					maxTokens: undefined,
					temperature: undefined,
					stopSequences: undefined,
					cacheStrategy: undefined,
				}),
			)
			expect(mockCloudTier.makeRequest).not.toHaveBeenCalled()
		})
	})
})

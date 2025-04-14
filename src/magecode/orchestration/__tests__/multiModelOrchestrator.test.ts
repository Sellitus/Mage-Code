import { MultiModelOrchestrator } from ".."
import { CloudModelTier } from "../tiers/cloudModelTier"
import { ModelRequestOptions, ModelResponse } from "../interfaces"
import { RequestOptions } from "../../interfaces"

describe("MultiModelOrchestrator", () => {
	let mockCloudTier: jest.Mocked<CloudModelTier>
	let orchestrator: MultiModelOrchestrator

	beforeEach(() => {
		mockCloudTier = {
			makeRequest: jest.fn(),
		} as unknown as jest.Mocked<CloudModelTier>

		orchestrator = new MultiModelOrchestrator(mockCloudTier)
	})

	it("should route requests to cloud tier", async () => {
		const prompt = "Test prompt"
		const options: RequestOptions = {
			maxTokens: 100,
			temperature: 0.7,
			stopSequences: ["stop"],
			cacheStrategy: "enabled",
		}

		const mockResponse: ModelResponse = {
			text: "Mock response",
			tokenUsage: {
				inputTokens: 5,
				outputTokens: 10,
				cacheReadTokens: 3,
				cacheWriteTokens: 2,
			},
			modelType: "cloud",
			latency: 100,
		}

		mockCloudTier.makeRequest.mockResolvedValue(mockResponse)

		const response = await orchestrator.makeApiRequest(prompt, options)

		// Verify options conversion
		const expectedModelOptions: ModelRequestOptions = {
			maxTokens: 100,
			temperature: 0.7,
			stopSequences: ["stop"],
			cacheStrategy: "enabled",
		}

		expect(mockCloudTier.makeRequest).toHaveBeenCalledWith(prompt, expectedModelOptions)

		// Verify response conversion
		expect(response).toEqual({
			content: "Mock response",
			usage: {
				inputTokens: 5,
				outputTokens: 10,
				cacheReadTokens: 3,
				cacheWriteTokens: 2,
			},
			modelType: "cloud",
			latency: 100,
		})
	})

	it("should handle requests without options", async () => {
		const prompt = "Test prompt"
		const mockResponse: ModelResponse = {
			text: "Mock response",
			tokenUsage: {
				inputTokens: 5,
				outputTokens: 10,
			},
			modelType: "cloud",
			latency: 100,
		}

		mockCloudTier.makeRequest.mockResolvedValue(mockResponse)

		const response = await orchestrator.makeApiRequest(prompt)

		expect(mockCloudTier.makeRequest).toHaveBeenCalledWith(prompt, {})
		expect(response).toBeDefined()
	})

	it("should handle cloud tier errors", async () => {
		const error = new Error("Cloud tier error")
		mockCloudTier.makeRequest.mockRejectedValue(error)

		await expect(orchestrator.makeApiRequest("Test prompt")).rejects.toThrow(
			"Model request failed: Cloud tier error",
		)
	})
})

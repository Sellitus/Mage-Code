import { ApiHandler, SingleCompletionHandler } from "../../../../api"
import { ModelInfo } from "../../../../shared/api"
import { ApiStream } from "../../../../api/transform/stream"
import { CloudModelTier } from "../cloudModelTier"

describe("CloudModelTier", () => {
	let mockLlmService: ApiHandler & SingleCompletionHandler
	let cloudTier: CloudModelTier

	beforeEach(() => {
		const mockModelInfo: ModelInfo = {
			contextWindow: 2048,
			maxTokens: 1024,
			supportsPromptCache: true,
			supportsImages: false,
			inputPrice: 0.001,
			outputPrice: 0.002,
			description: "Mock model for testing",
		}

		mockLlmService = {
			completePrompt: jest.fn().mockResolvedValue("Mock response"),
			createMessage: async function* (): ApiStream {
				yield { type: "text", text: "Mock response" }
				yield {
					type: "usage",
					inputTokens: 10,
					outputTokens: 20,
				}
			},
			getModel: jest.fn().mockReturnValue({ id: "mock-model", info: mockModelInfo }),
			countTokens: jest.fn().mockResolvedValue(0),
		}

		cloudTier = new CloudModelTier(mockLlmService)
	})

	it("should pass prompt to LLM service and return response", async () => {
		const prompt = "Test prompt"
		const options = {
			maxTokens: 100,
			temperature: 0.7,
		}

		const response = await cloudTier.makeRequest(prompt, options)

		expect(mockLlmService.completePrompt).toHaveBeenCalledWith(prompt)
		expect(response).toEqual({
			text: "Mock response",
			tokenUsage: {
				inputTokens: 0,
				outputTokens: 0,
			},
			modelType: "cloud",
			latency: expect.any(Number),
		})
	})

	it("should handle LLM service errors", async () => {
		const error = new Error("LLM service error")
		mockLlmService.completePrompt = jest.fn().mockRejectedValue(error)

		await expect(cloudTier.makeRequest("Test prompt", {})).rejects.toThrow(
			"Cloud model request failed: LLM service error",
		)
	})

	it("should handle response with usage information", async () => {
		mockLlmService.completePrompt = jest.fn().mockResolvedValue({
			content: "Mock response with usage",
			usage: {
				promptTokens: 5,
				completionTokens: 10,
				cacheReadTokens: 3,
				cacheWriteTokens: 2,
			},
		})

		const response = await cloudTier.makeRequest("Test prompt", {})

		expect(response).toEqual({
			text: "Mock response with usage",
			tokenUsage: {
				inputTokens: 5,
				outputTokens: 10,
				cacheReadTokens: 3,
				cacheWriteTokens: 2,
			},
			modelType: "cloud",
			latency: expect.any(Number),
		})
	})
})

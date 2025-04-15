import { MultiModelOrchestrator } from ".." // Adjust path as needed
import { ModelRouter } from "../router"
import { PromptService } from "../prompt/promptService"
import { CloudModelTier } from "../tiers/cloudModelTier"
import { LocalModelTier } from "../tiers/localModelTier"
import { ModelTier, ModelResponse } from "../interfaces"
import { LLMResponse, RequestOptions } from "../../interfaces"
import { LRUCache } from "lru-cache"

// --- Mocks ---
jest.mock("../router")
jest.mock("../prompt/promptService")
jest.mock("../tiers/cloudModelTier")
jest.mock("../tiers/localModelTier")
jest.mock("lru-cache")

const MockedModelRouter = ModelRouter as jest.MockedClass<typeof ModelRouter>
const MockedPromptService = PromptService as jest.MockedClass<typeof PromptService>
const MockedCloudModelTier = CloudModelTier as jest.MockedClass<typeof CloudModelTier>
const MockedLocalModelTier = LocalModelTier as jest.MockedClass<typeof LocalModelTier>
const MockedLRUCache = LRUCache as jest.MockedClass<typeof LRUCache>

// --- Test Setup ---
describe("MultiModelOrchestrator", () => {
	let orchestrator: MultiModelOrchestrator
	let mockCloudTier: jest.MockedObject<CloudModelTier>
	let mockLocalTier: jest.MockedObject<LocalModelTier>
	let mockRouter: jest.MockedObject<ModelRouter>
	let mockPromptService: jest.MockedObject<PromptService>
	let mockCache: jest.MockedObject<LRUCache<string, LLMResponse>>

	const mockLocalResponse: ModelResponse = {
		text: "Local response",
		tokenUsage: { inputTokens: 10, outputTokens: 20 },
		modelType: "local-test-model",
		latency: 100,
	}
	const mockCloudResponse: ModelResponse = {
		text: "Cloud response",
		tokenUsage: { inputTokens: 15, outputTokens: 30 },
		modelType: "cloud-test-model",
		latency: 500,
	}
	const expectedLocalLLMResponse: LLMResponse = {
		content: "Local response",
		usage: { inputTokens: 10, outputTokens: 20 },
		modelType: "local-test-model",
		latency: 100,
	}
	const expectedCloudLLMResponse: LLMResponse = {
		content: "Cloud response",
		usage: { inputTokens: 15, outputTokens: 30 },
		modelType: "cloud-test-model",
		latency: 500,
	}

	beforeEach(() => {
		// Instantiate mocks
		mockCloudTier = new MockedCloudModelTier({} as any) as jest.MockedObject<CloudModelTier>
		mockLocalTier = new MockedLocalModelTier() as jest.MockedObject<LocalModelTier>
		mockRouter = new MockedModelRouter() as jest.MockedObject<ModelRouter>
		mockPromptService = new MockedPromptService() as jest.MockedObject<PromptService>
		mockCache = new MockedLRUCache({ max: 10 }) as jest.MockedObject<LRUCache<string, LLMResponse>>

		// Mock specific methods
		mockLocalTier.makeRequest.mockResolvedValue(mockLocalResponse)
		mockCloudTier.makeRequest.mockResolvedValue(mockCloudResponse)
		mockRouter.routeRequest.mockResolvedValue(ModelTier.LOCAL) // Default route to local
		mockPromptService.formatPrompt.mockImplementation((prompt, _) => prompt) // Pass-through mock
		mockCache.get.mockReturnValue(undefined) // Default cache miss
		mockCache.set.mockClear()
		mockCache.get.mockClear()

		// Create orchestrator instance with mocks
		orchestrator = new MultiModelOrchestrator(mockCloudTier, mockLocalTier, mockRouter, mockPromptService)
		// Inject mock cache instance (since constructor creates its own)
		;(orchestrator as any).cache = mockCache
	})

	// --- Tests ---

	test("should call router, prompt service, and chosen tier (LOCAL)", async () => {
		mockRouter.routeRequest.mockResolvedValue(ModelTier.LOCAL)
		const prompt = "test prompt local"
		const options: RequestOptions = { taskType: "test" }

		await orchestrator.makeApiRequest(prompt, options)

		expect(mockRouter.routeRequest).toHaveBeenCalledWith(options.taskType, prompt, {
			taskType: options.taskType,
		})
		expect(mockPromptService.formatPrompt).toHaveBeenCalledWith(prompt, ModelTier.LOCAL)
		expect(mockLocalTier.makeRequest).toHaveBeenCalledWith(prompt, expect.any(Object))
		expect(mockCloudTier.makeRequest).not.toHaveBeenCalled()
	})

	test("should call router, prompt service, and chosen tier (CLOUD)", async () => {
		mockRouter.routeRequest.mockResolvedValue(ModelTier.CLOUD)
		const prompt = "test prompt cloud"
		const options: RequestOptions = { taskType: "test" }

		await orchestrator.makeApiRequest(prompt, options)

		expect(mockRouter.routeRequest).toHaveBeenCalledWith(options.taskType, prompt, {
			taskType: options.taskType,
		})
		expect(mockPromptService.formatPrompt).toHaveBeenCalledWith(prompt, ModelTier.CLOUD)
		expect(mockCloudTier.makeRequest).toHaveBeenCalledWith(prompt, expect.any(Object))
		expect(mockLocalTier.makeRequest).not.toHaveBeenCalled()
	})

	// --- Caching Tests ---
	test("should return cached response on cache hit", async () => {
		const prompt = "cached prompt"
		const options: RequestOptions = {}
		const cacheKey = JSON.stringify({ prompt, options: {} }) // Simplified key for test
		const cachedLLMResponse: LLMResponse = { ...expectedLocalLLMResponse, content: "Cached!" }
		mockCache.get.mockReturnValue(cachedLLMResponse)
		;(orchestrator as any).getCacheKey = jest.fn().mockReturnValue(cacheKey) // Mock private method

		const response = await orchestrator.makeApiRequest(prompt, options)

		expect(mockCache.get).toHaveBeenCalledWith(cacheKey)
		expect(response).toEqual({ ...cachedLLMResponse, latency: 0 }) // Expect 0 latency for cache hit
		expect(mockRouter.routeRequest).not.toHaveBeenCalled()
		expect(mockLocalTier.makeRequest).not.toHaveBeenCalled()
		expect(mockCloudTier.makeRequest).not.toHaveBeenCalled()
	})

	test("should skip cache check if options.skipCache is true", async () => {
		const prompt = "skip cache prompt"
		const options: RequestOptions = { skipCache: true }
		const cacheKey = JSON.stringify({ prompt, options: {} })
		mockCache.get.mockReturnValue({ ...expectedLocalLLMResponse, content: "Should not return this" })
		;(orchestrator as any).getCacheKey = jest.fn().mockReturnValue(cacheKey)

		await orchestrator.makeApiRequest(prompt, options)

		expect(mockCache.get).not.toHaveBeenCalled()
		expect(mockRouter.routeRequest).toHaveBeenCalled() // Ensure request proceeds
		expect(mockLocalTier.makeRequest).toHaveBeenCalled() // Assumes default route is local
	})

	test("should store response in cache if options.cacheResponse is not false", async () => {
		mockRouter.routeRequest.mockResolvedValue(ModelTier.LOCAL)
		const prompt = "store in cache"
		const options: RequestOptions = { cacheResponse: true } // Explicitly true
		const cacheKey = JSON.stringify({ prompt, options: { taskType: undefined } })
		;(orchestrator as any).getCacheKey = jest.fn().mockReturnValue(cacheKey)

		await orchestrator.makeApiRequest(prompt, options)

		expect(mockCache.set).toHaveBeenCalledWith(cacheKey, expectedLocalLLMResponse)
	})

	test("should NOT store response in cache if options.cacheResponse is false", async () => {
		mockRouter.routeRequest.mockResolvedValue(ModelTier.LOCAL)
		const prompt = "do not store in cache"
		const options: RequestOptions = { cacheResponse: false }
		const cacheKey = JSON.stringify({ prompt, options: { taskType: undefined } })
		;(orchestrator as any).getCacheKey = jest.fn().mockReturnValue(cacheKey)

		await orchestrator.makeApiRequest(prompt, options)

		expect(mockCache.set).not.toHaveBeenCalled()
	})

	// --- Fallback Tests ---
	test("should fallback to cloud tier if local tier fails and fallback is allowed", async () => {
		mockRouter.routeRequest.mockResolvedValue(ModelTier.LOCAL)
		const prompt = "fallback test"
		const options: RequestOptions = { allowFallback: true } // Default, but explicit
		const localError = new Error("Local failed")
		mockLocalTier.makeRequest.mockRejectedValue(localError)

		const response = await orchestrator.makeApiRequest(prompt, options)

		expect(mockLocalTier.makeRequest).toHaveBeenCalledTimes(1)
		expect(mockCloudTier.makeRequest).toHaveBeenCalledTimes(1)
		expect(mockCloudTier.makeRequest).toHaveBeenCalledWith(prompt, expect.any(Object)) // Check cloud call
		expect(response).toEqual(expectedCloudLLMResponse) // Should return cloud response
		expect(mockCache.set).toHaveBeenCalledWith(expect.any(String), expectedCloudLLMResponse) // Cache fallback result
	})

	test("should NOT fallback to cloud tier if local tier fails and fallback is false", async () => {
		mockRouter.routeRequest.mockResolvedValue(ModelTier.LOCAL)
		const prompt = "no fallback test"
		const options: RequestOptions = { allowFallback: false }
		const localError = new Error("Local failed")
		mockLocalTier.makeRequest.mockRejectedValue(localError)

		await expect(orchestrator.makeApiRequest(prompt, options)).rejects.toThrow(
			`Model request failed for tier ${ModelTier.LOCAL}: ${localError.message}`,
		)

		expect(mockLocalTier.makeRequest).toHaveBeenCalledTimes(1)
		expect(mockCloudTier.makeRequest).not.toHaveBeenCalled()
		expect(mockCache.set).not.toHaveBeenCalled()
	})

	test("should throw original error if cloud tier fails (no fallback from cloud)", async () => {
		mockRouter.routeRequest.mockResolvedValue(ModelTier.CLOUD)
		const prompt = "cloud fail test"
		const options: RequestOptions = {}
		const cloudError = new Error("Cloud failed")
		mockCloudTier.makeRequest.mockRejectedValue(cloudError)

		await expect(orchestrator.makeApiRequest(prompt, options)).rejects.toThrow(
			`Model request failed for tier ${ModelTier.CLOUD}: ${cloudError.message}`,
		)

		expect(mockCloudTier.makeRequest).toHaveBeenCalledTimes(1)
		expect(mockLocalTier.makeRequest).not.toHaveBeenCalled()
	})

	test("should throw specific error if cloud fallback fails", async () => {
		mockRouter.routeRequest.mockResolvedValue(ModelTier.LOCAL)
		const prompt = "fallback fail test"
		const options: RequestOptions = { allowFallback: true }
		const localError = new Error("Local failed initially")
		const fallbackError = new Error("Cloud fallback also failed")
		mockLocalTier.makeRequest.mockRejectedValue(localError)
		mockCloudTier.makeRequest.mockRejectedValue(fallbackError)

		await expect(orchestrator.makeApiRequest(prompt, options)).rejects.toThrow(
			`Initial request failed (${ModelTier.LOCAL}) and Cloud fallback failed: ${fallbackError.message}`,
		)

		expect(mockLocalTier.makeRequest).toHaveBeenCalledTimes(1)
		expect(mockCloudTier.makeRequest).toHaveBeenCalledTimes(1)
		expect(mockCache.set).not.toHaveBeenCalled()
	})
})

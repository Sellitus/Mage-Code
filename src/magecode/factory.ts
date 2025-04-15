import * as vscode from "vscode"
import { RelevancyEngine } from "./relevancy"
import { HybridScorer } from "./relevancy/scoring/hybridScorer"
import { VectorRetriever } from "./relevancy/retrievers/vectorRetriever"
import { GraphRetriever } from "./relevancy/retrievers/graphRetriever"
import { LocalCodeIntelligenceEngine, VectorSearchResult, GraphSearchResult } from "./intelligence"
import { CodeElement } from "./intelligence/types"
import { ILLMOrchestrator } from "./interfaces"
import { CloudModelTier } from "./orchestration/tiers/cloudModelTier"
import { LocalModelTier } from "./orchestration/tiers/localModelTier"
import { MultiModelOrchestrator } from "./orchestration"
import { ModelRouter } from "./orchestration/router" // Added import
import { PromptService } from "./orchestration/prompt/promptService" // Added import
import { buildApiHandler, SingleCompletionHandler } from "../api"
import { ApiConfiguration } from "../shared/api"
import { ApiHandler } from "../api"
import { ApiStream, ApiStreamChunk } from "../api/transform/stream"
import { ModelInfo } from "../shared/api"

/**
 * Dependencies required by MageCode components
 */
export interface MageCodeDependencies {
	contextRetriever: RelevancyEngine
	llmOrchestrator: ILLMOrchestrator
}

/**
 * Mock implementation of LocalCodeIntelligenceEngine for testing
 */
class MockIntelligenceEngine extends LocalCodeIntelligenceEngine {
	private mockElementId = 0

	override async initialize(): Promise<void> {
		this.initialized = true
	}

	override async generateEmbedding(text: string): Promise<Float32Array> {
		if (!this.initialized) {
			throw new Error("MockIntelligenceEngine not initialized")
		}
		// Return mock embedding vector
		const vector = new Float32Array(384)
		for (let i = 0; i < vector.length; i++) {
			vector[i] = Math.random()
		}
		return vector
	}

	override async searchVectors(
		queryVector: Float32Array,
		limit: number,
		threshold: number,
		fileTypes?: string[],
	): Promise<VectorSearchResult[]> {
		if (!this.initialized) {
			throw new Error("MockIntelligenceEngine not initialized")
		}
		return [this.createMockVectorResult()]
	}

	override async searchGraph(
		startId: string,
		maxDistance: number,
		relationTypes: string[],
		limit: number,
	): Promise<GraphSearchResult[]> {
		if (!this.initialized) {
			throw new Error("MockIntelligenceEngine not initialized")
		}
		return [this.createMockGraphResult()]
	}

	private createMockElement(): CodeElement {
		const id = String(++this.mockElementId)
		return {
			id,
			type: "function",
			name: `mockFunction${id}`,
			content: `function mockFunction${id}() { return ${id}; }`,
			filePath: `test${id}.ts`,
			startLine: 1,
			endLine: 3,
		}
	}

	private createMockVectorResult(): VectorSearchResult {
		return {
			element: this.createMockElement(),
			similarity: 0.8,
		}
	}

	private createMockGraphResult(): GraphSearchResult {
		return {
			element: this.createMockElement(),
			distance: 1,
			path: ["test1.ts", "test2.ts"],
		}
	}
}

/**
 * Creates and wires up all MageCode dependencies
 */
export async function createMageCodeDependencies(context: vscode.ExtensionContext): Promise<MageCodeDependencies> {
	// Initialize the intelligence engine first as other components depend on it
	const intelligenceEngine = new LocalCodeIntelligenceEngine()
	await intelligenceEngine.initialize()
	context.subscriptions.push(intelligenceEngine)

	// Create retrievers using the intelligence engine
	const vectorRetriever = new VectorRetriever(intelligenceEngine)
	const graphRetriever = new GraphRetriever(intelligenceEngine)

	// Initialize hybrid scorer
	const hybridScorer = new HybridScorer()

	// Create relevancy engine with retrievers and scorer
	const relevancyEngine = new RelevancyEngine(vectorRetriever, graphRetriever, hybridScorer)
	context.subscriptions.push(relevancyEngine)

	// Initialize LLM services
	const config: ApiConfiguration = {
		apiProvider: "anthropic", // Default provider, should be configurable
	}
	const llmService = buildApiHandler(config)

	// Check if the service implements required interface
	if (!("completePrompt" in llmService)) {
		throw new Error("LLM service does not implement required SingleCompletionHandler interface")
	}

	// Create cloud tier and local tier
	const cloudTier = new CloudModelTier(llmService as SingleCompletionHandler & typeof llmService)
	const localTier = new LocalModelTier()

	// Initialize local tier
	try {
		await localTier.initialize(context.extensionPath)
		console.log("LocalModelTier initialized successfully.")
	} catch (error) {
		console.warn("Failed to initialize LocalModelTier:", error)
		vscode.window.showWarningMessage(
			"MageCode: Local model initialization failed. Falling back to cloud-only mode.",
		)
	}

	// Create router and prompt service
	const modelRouter = new ModelRouter()
	const promptService = new PromptService()

	// Create orchestrator with tiers, router, and prompt service
	const orchestrator = new MultiModelOrchestrator(cloudTier, localTier, modelRouter, promptService)
	context.subscriptions.push({
		dispose: () => {
			// Add cleanup if needed
		},
	})

	return {
		contextRetriever: relevancyEngine,
		llmOrchestrator: orchestrator,
	}
}

/**
 * Creates test dependencies for use in tests
 */
export async function createTestDependencies(): Promise<MageCodeDependencies> {
	const mockIntelligenceEngine = new MockIntelligenceEngine()
	await mockIntelligenceEngine.initialize()

	const vectorRetriever = new VectorRetriever(mockIntelligenceEngine)
	const graphRetriever = new GraphRetriever(mockIntelligenceEngine)
	const hybridScorer = new HybridScorer()
	const relevancyEngine = new RelevancyEngine(vectorRetriever, graphRetriever, hybridScorer)

	// Create mock cloud tier and orchestrator for testing
	const mockModelInfo: ModelInfo = {
		contextWindow: 2048,
		maxTokens: 1024,
		supportsPromptCache: true,
		supportsImages: false,
		inputPrice: 0.001,
		outputPrice: 0.002,
		description: "Mock model for testing",
	}

	const mockLlmService: ApiHandler & SingleCompletionHandler = {
		completePrompt: async (prompt: string) => "Mock response",
		createMessage: async function* (): ApiStream {
			yield { type: "text", text: "Mock response" }
			yield {
				type: "usage",
				inputTokens: 10,
				outputTokens: 20,
			}
		},
		getModel: () => ({ id: "mock-model", info: mockModelInfo }),
		countTokens: async () => 0,
	}

	// Create mock local and cloud tiers
	const cloudTier = new CloudModelTier(mockLlmService)
	const localTier = new LocalModelTier()
	// For tests, we don't need to initialize the local tier as it will be mocked
	const testModelRouter = new ModelRouter() // Use separate instances for test setup if needed
	const testPromptService = new PromptService()

	const orchestrator = new MultiModelOrchestrator(cloudTier, localTier, testModelRouter, testPromptService)

	return {
		contextRetriever: relevancyEngine,
		llmOrchestrator: orchestrator,
	}
}

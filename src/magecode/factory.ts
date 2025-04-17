import * as vscode from "vscode"
import { RelevancyEngine } from "./relevancy"
import { FileReader } from "./tools/fileReader" // Added import
import { ToolRegistry } from "./tools/toolRegistry" // Added import
import { HybridScorer } from "./relevancy/scoring/hybridScorer"
import { VectorRetriever } from "./relevancy/retrievers/vectorRetriever"
import { GraphRetriever } from "./relevancy/retrievers/graphRetriever"
import { LocalCodeIntelligenceEngine, VectorSearchResult, GraphSearchResult } from "./intelligence"
import { DatabaseManager } from "./intelligence/storage/databaseManager" // Added import
import { MageParser } from "./intelligence/parser" // Added import
import { EmbeddingService } from "./intelligence/embedding/embeddingService" // Added import
import { VectorIndex } from "./intelligence/vector/vectorIndex" // Added import
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
import { logger } from "./utils/logging" // Import the logger

/**
 * Dependencies required by MageCode components
 */
export interface MageCodeDependencies {
	contextRetriever: RelevancyEngine
	llmOrchestrator: ILLMOrchestrator
	toolRegistry: ToolRegistry // Added tool registry
}

/**
 * Mock implementation of LocalCodeIntelligenceEngine for testing
 */
class MockIntelligenceEngine extends LocalCodeIntelligenceEngine {
	private mockElementId = 0

	// Add constructor to match base class, even if dependencies aren't used
	constructor(
		dbManager: DatabaseManager,
		parser: MageParser,
		embeddingService: EmbeddingService,
		vectorIndex: VectorIndex,
	) {
		super(dbManager, parser, embeddingService, vectorIndex)
	}

	override async initialize(context?: vscode.ExtensionContext): Promise<void> {
		// Add context param
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
	// Instantiate dependencies
	const databaseManager = new DatabaseManager()
	const mageParser = new MageParser() // Assuming constructor requires no args or is static init
	const embeddingService = EmbeddingService.getInstance() // Assuming singleton
	const vectorIndex = new VectorIndex()

	// Initialize the intelligence engine first as other components depend on it
	const intelligenceEngine = new LocalCodeIntelligenceEngine(
		databaseManager,
		mageParser,
		embeddingService,
		vectorIndex,
	)
	await intelligenceEngine.initialize(context) // Pass context
	context.subscriptions.push(intelligenceEngine) // Engine handles disposing its dependencies

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
		logger.info("LocalModelTier initialized successfully.")
	} catch (error) {
		logger.warn("Failed to initialize LocalModelTier", error)
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

	// Initialize Tool Registry and register tools
	const toolRegistry = new ToolRegistry()
	const fileReader = new FileReader()
	toolRegistry.registerTool(fileReader)

	return {
		contextRetriever: relevancyEngine,
		llmOrchestrator: orchestrator,
		toolRegistry: toolRegistry, // Added tool registry
	}
}

/**
 * Creates test dependencies for use in tests
 */
export async function createTestDependencies(): Promise<MageCodeDependencies> {
	// Create mock dependencies for MockIntelligenceEngine constructor
	const mockDbManager = {} as DatabaseManager // Simple mock object
	const mockParser = {} as MageParser
	const mockEmbeddingService = {
		generateEmbeddings: jest.fn().mockResolvedValue([[0.1, 0.2]]),
		initialize: jest.fn().mockResolvedValue(undefined),
	} as unknown as EmbeddingService
	const mockVectorIndex = {
		search: jest.fn().mockResolvedValue([]),
		initialize: jest.fn().mockResolvedValue(undefined),
	} as unknown as VectorIndex

	const mockIntelligenceEngine = new MockIntelligenceEngine(
		mockDbManager,
		mockParser,
		mockEmbeddingService,
		mockVectorIndex,
	)
	await mockIntelligenceEngine.initialize() // Call initialize (context is optional here)

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

	// Initialize Tool Registry and register tools for tests
	const testToolRegistry = new ToolRegistry()
	const testFileReader = new FileReader() // Use real FileReader for test dependencies too
	testToolRegistry.registerTool(testFileReader)

	return {
		contextRetriever: relevancyEngine,
		llmOrchestrator: orchestrator,
		toolRegistry: testToolRegistry, // Added tool registry for tests
	}
}

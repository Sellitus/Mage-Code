import * as vscode from "vscode"
import { RelevancyEngine } from "./relevancy"
import { HybridScorer } from "./relevancy/scoring/hybridScorer"
import { VectorRetriever } from "./relevancy/retrievers/vectorRetriever"
import { GraphRetriever } from "./relevancy/retrievers/graphRetriever"
import { LocalCodeIntelligenceEngine, VectorSearchResult, GraphSearchResult } from "./intelligence"
import { CodeElement } from "./intelligence/types"

/**
 * Dependencies required by MageCode components
 */
export interface MageCodeDependencies {
	contextRetriever: RelevancyEngine
	// Add other dependencies as needed
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

	return {
		contextRetriever: relevancyEngine,
		// Add other initialized dependencies as needed
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

	return {
		contextRetriever: relevancyEngine,
	}
}

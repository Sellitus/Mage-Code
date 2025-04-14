import { RelevancyEngine } from "../index"
import { HybridScorer } from "../scoring/hybridScorer"
import { RetrievedItem, IRetriever, RetrievalOptions, ScoredItem } from "../types"

// Mock retrievers
class MockVectorRetriever implements IRetriever {
	constructor(
		private items: RetrievedItem[] = [],
		private shouldFail = false,
	) {}

	async retrieve(): Promise<RetrievedItem[]> {
		if (this.shouldFail) {
			throw new Error("Vector retriever failed")
		}
		return this.items
	}
}

class MockGraphRetriever implements IRetriever {
	constructor(
		private items: RetrievedItem[] = [],
		private shouldFail = false,
	) {}

	async retrieve(): Promise<RetrievedItem[]> {
		if (this.shouldFail) {
			throw new Error("Graph retriever failed")
		}
		return this.items
	}
}

describe("RelevancyEngine", () => {
	let vectorRetriever: MockVectorRetriever
	let graphRetriever: MockGraphRetriever
	let hybridScorer: HybridScorer
	let engine: RelevancyEngine

	beforeEach(() => {
		vectorRetriever = new MockVectorRetriever()
		graphRetriever = new MockGraphRetriever()
		hybridScorer = new HybridScorer()
		engine = new RelevancyEngine(vectorRetriever, graphRetriever, hybridScorer)
	})

	describe("findRelevantCode", () => {
		it("should return empty array when no results found", async () => {
			const results = await engine.findRelevantCode("test query", {})
			expect(results).toEqual([])
		})

		it("should combine results from all retrievers", async () => {
			const vectorItems = [createItem("vector", 0.8, "file1.ts"), createItem("vector", 0.6, "file2.ts")]
			const graphItems = [createItem("graph", 0.7, "file3.ts"), createItem("graph", 0.5, "file4.ts")]

			vectorRetriever = new MockVectorRetriever(vectorItems)
			graphRetriever = new MockGraphRetriever(graphItems)
			engine = new RelevancyEngine(vectorRetriever, graphRetriever, hybridScorer)

			const results = await engine.findRelevantCode("test query", {})

			expect(results).toHaveLength(4)
			expect(results.map((r) => r.filePath)).toEqual(
				expect.arrayContaining(["file1.ts", "file2.ts", "file3.ts", "file4.ts"]),
			)
		})

		it("should handle retriever failures gracefully", async () => {
			const vectorItems = [createItem("vector", 0.8, "file1.ts")]
			vectorRetriever = new MockVectorRetriever(vectorItems)
			graphRetriever = new MockGraphRetriever([], true) // Graph retriever fails
			engine = new RelevancyEngine(vectorRetriever, graphRetriever, hybridScorer)

			const results = await engine.findRelevantCode("test query", {})

			// Should still get vector results even though graph retriever failed
			expect(results).toHaveLength(1)
			expect(results[0].filePath).toBe("file1.ts")
		})

		it("should pass retrieval options to retrievers", async () => {
			const mockRetrieve = jest.spyOn(vectorRetriever, "retrieve")
			const options: RetrievalOptions = {
				limit: 10,
				fileTypes: ["ts"],
				cursorFile: "current.ts",
				cursorLine: 42,
			}

			await engine.findRelevantCode("test query", options)

			expect(mockRetrieve).toHaveBeenCalledWith("test query", options)
		})

		it("should convert retrieval options to scoring options", async () => {
			const vectorItems = [createItem("vector", 0.8, "current.ts")]
			const options: RetrievalOptions = {
				cursorFile: "current.ts",
				cursorLine: 42,
			}

			vectorRetriever = new MockVectorRetriever(vectorItems)
			engine = new RelevancyEngine(vectorRetriever, graphRetriever, hybridScorer)

			const results = await engine.findRelevantCode("test query", options)

			// Verify proximity boost was applied for current file
			expect(results[0].finalScore).toBeGreaterThan(0.8 * 0.6) // Base vector score * weight
		})

		it("should throw error for complete retrieval failure", async () => {
			vectorRetriever = new MockVectorRetriever([], true)
			graphRetriever = new MockGraphRetriever([], true)
			engine = new RelevancyEngine(vectorRetriever, graphRetriever, hybridScorer)

			await expect(engine.findRelevantCode("test query", {})).resolves.toEqual([]) // Should return empty array rather than throwing
		})
	})
})

// Helper function to create test items
function createItem(source: "vector" | "graph", score: number, filePath: string): RetrievedItem {
	return {
		id: `test-${Math.random()}`,
		content: "test content",
		filePath,
		startLine: 1,
		endLine: 5,
		score,
		source,
		type: "function",
	} as RetrievedItem
}

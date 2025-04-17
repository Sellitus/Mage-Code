import { HybridScorer } from "../hybridScorer"
import { RetrievedItem, ScoredItem, ScoringOptions, IScorer } from "../../types"
import { ElementType } from "../../../intelligence/types" // Corrected import path
import { ProximityScorer, RecencyScorer } from "../index" // Import for mocking

// Mock the individual scorers
jest.mock("../proximityScorer")
jest.mock("../recencyScorer")

describe("HybridScorer", () => {
	let scorer: HybridScorer
	let mockProximityScore: jest.Mock
	let mockRecencyScore: jest.Mock

	beforeEach(() => {
		scorer = new HybridScorer()
		// Reset mocks and provide default implementations
		mockProximityScore = ProximityScorer.prototype.score as jest.Mock
		mockRecencyScore = RecencyScorer.prototype.score as jest.Mock

		// Default mock implementation: return items unchanged
		mockProximityScore.mockImplementation((items: ScoredItem[]) => items)
		mockRecencyScore.mockImplementation((items: ScoredItem[]) => items)
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	describe("scoreItems", () => {
		it("should return empty array for empty input", () => {
			const result = scorer.scoreItems([], "test query", {})
			expect(result).toEqual([])
		})

		it("should apply default weights and sort by score descending", () => {
			const items: RetrievedItem[] = [
				createItem("lexical", 1.0), // 1.0 * 0.1 = 0.1
				createItem("graph", 1.0), // 1.0 * 0.3 = 0.3
				createItem("vector", 1.0), // 1.0 * 0.6 = 0.6
			]

			const result = scorer.scoreItems(items, "test", {})

			expect(result).toHaveLength(3)
			// Check scores and descending order
			expect(result[0].source).toBe("vector")
			expect(result[0].finalScore).toBe(0.6)
			expect(result[1].source).toBe("graph")
			expect(result[1].finalScore).toBe(0.3)
			expect(result[2].source).toBe("lexical")
			expect(result[2].finalScore).toBe(0.1)
		})

		it("should override default weights and sort by score descending", () => {
			const items: RetrievedItem[] = [
				createItem("vector", 1.0), // 1.0 * 0.3 = 0.3
				createItem("graph", 1.0), // 1.0 * 0.7 = 0.7
			]

			const options: ScoringOptions = {
				weights: {
					vector: 0.3,
					graph: 0.7,
					lexical: 0.0, // Explicitly set lexical to 0
				},
			}

			const result = scorer.scoreItems(items, "test", options)

			expect(result).toHaveLength(2)
			// Check scores and descending order
			expect(result[0].source).toBe("graph")
			expect(result[0].finalScore).toBe(0.7)
			expect(result[1].source).toBe("vector")
			expect(result[1].finalScore).toBe(0.3)
		})

		it("should handle varied input scores with default weights and sort", () => {
			const items: RetrievedItem[] = [
				createItem("vector", 0.8), // 0.8 * 0.6 = 0.48
				createItem("graph", 2.0), // 2.0 * 0.3 = 0.6
				createItem("lexical", 1.5), // 1.5 * 0.1 = 0.15
			]

			const result = scorer.scoreItems(items, "test", {})

			expect(result).toHaveLength(3)
			// Check scores and descending order
			expect(result[0].source).toBe("graph")
			expect(result[0].finalScore).toBe(0.6)
			expect(result[1].source).toBe("vector")
			expect(result[1].finalScore).toBe(0.48)
			expect(result[2].source).toBe("lexical")
			expect(result[2].finalScore).toBeCloseTo(0.15) // Use toBeCloseTo for float comparison
		})

		it("should remove duplicates, combine scores with dampening, and sort", () => {
			const items: RetrievedItem[] = [
				createItem("vector", 0.8, "file1.ts", 1, 5), // 0.8 * 0.6 = 0.48
				createItem("graph", 0.6, "file1.ts", 1, 5), // 0.6 * 0.3 = 0.18
				createItem("vector", 0.9, "file2.ts", 10, 20), // 0.9 * 0.6 = 0.54
			]

			const result = scorer.scoreItems(items, "test", {})

			// Expected combined score for file1.ts: (0.48 + 0.18) * 0.8 = 0.66 * 0.8 = 0.528
			expect(result).toHaveLength(2)

			// Check scores and descending order
			expect(result[0].filePath).toBe("file2.ts")
			expect(result[0].finalScore).toBe(0.54)

			expect(result[1].filePath).toBe("file1.ts")
			expect(result[1].finalScore).toBe(0.528)
		})

		it("should call proximity scorer when boost is enabled", () => {
			const items: RetrievedItem[] = [createItem("vector", 1.0)]
			const options: ScoringOptions = {
				boost: { proximity: true },
				context: { currentFile: "current.ts" }, // Context needed for proximity
			}

			// Mock proximity scorer to add a fixed value for verification
			mockProximityScore.mockImplementation((scoredItems: ScoredItem[]) =>
				scoredItems.map((item) => ({ ...item, finalScore: item.finalScore + 0.1 })),
			)

			const result = scorer.scoreItems(items, "test", options)

			expect(mockProximityScore).toHaveBeenCalledTimes(1)
			expect(mockProximityScore).toHaveBeenCalledWith(
				expect.arrayContaining([expect.objectContaining({ source: "vector", finalScore: 0.6 })]), // Initial weighted score
				options,
			)
			expect(mockRecencyScore).not.toHaveBeenCalled()
			expect(result[0].finalScore).toBe(0.7) // 0.6 (initial) + 0.1 (boost)
		})

		it("should call recency scorer when boost is enabled", () => {
			const items: RetrievedItem[] = [createItem("graph", 1.0)]
			const options: ScoringOptions = {
				boost: { recency: true },
				context: { recentFiles: ["recent.ts"] }, // Context needed for recency
			}

			// Mock recency scorer to multiply score for verification
			mockRecencyScore.mockImplementation((scoredItems: ScoredItem[]) =>
				scoredItems.map((item) => ({ ...item, finalScore: item.finalScore * 1.5 })),
			)

			const result = scorer.scoreItems(items, "test", options)

			expect(mockRecencyScore).toHaveBeenCalledTimes(1)
			expect(mockRecencyScore).toHaveBeenCalledWith(
				expect.arrayContaining([expect.objectContaining({ source: "graph", finalScore: 0.3 })]), // Initial weighted score
				options,
			)
			expect(mockProximityScore).not.toHaveBeenCalled()
			expect(result[0].finalScore).toBeCloseTo(0.45) // Use toBeCloseTo for float comparison
		})

		it("should call both scorers when both boosts are enabled and sort", () => {
			const items: RetrievedItem[] = [
				createItem("vector", 1.0, "fileA"), // 0.6
				createItem("graph", 1.0, "fileB"), // 0.3
			]
			const options: ScoringOptions = {
				boost: { proximity: true, recency: true },
				context: { currentFile: "current.ts", recentFiles: ["recent.ts"] },
			}

			// Mock scorers to apply different boosts
			mockProximityScore.mockImplementation((scoredItems: ScoredItem[]) =>
				scoredItems.map((item) => ({
					...item,
					finalScore: item.filePath === "fileA" ? item.finalScore + 0.1 : item.finalScore, // Boost fileA
				})),
			)
			mockRecencyScore.mockImplementation((scoredItems: ScoredItem[]) =>
				scoredItems.map((item) => ({
					...item,
					finalScore: item.filePath === "fileB" ? item.finalScore * 2 : item.finalScore, // Boost fileB
				})),
			)

			const result = scorer.scoreItems(items, "test", options)

			expect(mockProximityScore).toHaveBeenCalledTimes(1)
			expect(mockRecencyScore).toHaveBeenCalledTimes(1)

			// Order of scorer execution isn't guaranteed, so check final scores and order
			// fileA: 0.6 (initial) + 0.1 (prox) = 0.7
			// fileB: 0.3 (initial) * 2 (recency) = 0.6
			expect(result).toHaveLength(2)
			expect(result[0].filePath).toBe("fileA")
			expect(result[0].finalScore).toBeCloseTo(0.7)
			expect(result[1].filePath).toBe("fileB")
			expect(result[1].finalScore).toBeCloseTo(0.6)
		})

		it("should handle items with undefined score by treating score as 0", () => {
			const items: RetrievedItem[] = [
				createItem("vector", 1.0), // 1.0 * 0.6 = 0.6
				createItem("graph", undefined as any), // undefined * 0.3 = 0
			]
			const result = scorer.scoreItems(items, "test", {})
			expect(result).toHaveLength(2)
			expect(result[0].source).toBe("vector")
			expect(result[0].finalScore).toBe(0.6)
			expect(result[1].source).toBe("graph")
			expect(result[1].finalScore).toBe(0)
		})

		it("should handle unknown source type by assigning weight 0", () => {
			const items: RetrievedItem[] = [
				createItem("vector", 1.0), // 1.0 * 0.6 = 0.6
				createItem("unknown" as any, 1.0), // 1.0 * 0 = 0
			]
			const result = scorer.scoreItems(items, "test", {})
			expect(result).toHaveLength(2)
			expect(result[0].source).toBe("vector")
			expect(result[0].finalScore).toBe(0.6)
			expect(result[1].source).toBe("unknown")
			expect(result[1].finalScore).toBe(0)
		})
	})
})

function createItem(
	source: "vector" | "graph" | "lexical" | string, // Allow string for unknown test
	score: number | undefined,
	filePath: string = `test-${source}.ts`,
	startLine: number = 1,
	endLine: number = 2,
	type: ElementType = "function", // Use ElementType and a default valid value
): RetrievedItem {
	return {
		id: `${filePath}-${startLine}-${endLine}-${Math.random()}`,
		name: `name-${source}-${Math.random()}`,
		content: `content for ${source}`,
		filePath,
		startLine,
		endLine,
		score,
		source,
		type,
	} as RetrievedItem // Use type assertion to handle test-specific mismatches
}

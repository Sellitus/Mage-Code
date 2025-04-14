import { HybridScorer } from "../hybridScorer"
import { RetrievedItem, ScoredItem, ScoringOptions } from "../../types"

describe("HybridScorer", () => {
	let scorer: HybridScorer

	beforeEach(() => {
		scorer = new HybridScorer()
	})

	describe("scoreItems", () => {
		it("should return empty array for empty input", () => {
			const result = scorer.scoreItems([], "test query", {})
			expect(result).toEqual([])
		})

		it("should apply correct weights to different sources", () => {
			// All input scores are 1.0
			const items: RetrievedItem[] = [
				createItem("vector", 1.0), // Should get 1.0 * 0.6 = 0.6
				createItem("graph", 1.0), // Should get (1/2) * 0.3 = 0.15
				createItem("lexical", 1.0), // Should get 1.0 * 0.1 = 0.1
			]

			const result = scorer.scoreItems(items, "test", {})
			// Sort by source for consistent comparison
			result.sort((a, b) => a.source.localeCompare(b.source))

			// Log scores for debugging
			console.log(
				"Scores:",
				result.map((i) => ({
					source: i.source,
					score: i.finalScore,
				})),
			)

			expect(result[0].source).toBe("graph")
			expect(result[0].finalScore).toBe(0.15)

			expect(result[1].source).toBe("lexical")
			expect(result[1].finalScore).toBe(0.1)

			expect(result[2].source).toBe("vector")
			expect(result[2].finalScore).toBe(0.6)
		})

		it("should override default weights with provided weights", () => {
			const items: RetrievedItem[] = [
				createItem("vector", 1.0), // Will get 1.0 * 0.3 = 0.3
				createItem("graph", 1.0), // Will get (1/2) * 0.7 = 0.35
			]

			const options: ScoringOptions = {
				weights: {
					vector: 0.3,
					graph: 0.7,
				},
			}

			const result = scorer.scoreItems(items, "test", options)

			// Log for debugging
			console.log(
				"Custom weights scores:",
				result.map((i) => ({
					source: i.source,
					score: i.finalScore,
					calculation: i.source === "graph" ? "(1/2) * 0.7" : "1.0 * 0.3",
				})),
			)

			expect(result[0].source).toBe("graph")
			expect(result[0].finalScore).toBe(0.35)
			expect(result[1].source).toBe("vector")
			expect(result[1].finalScore).toBe(0.3)
		})

		it("should properly normalize scores from different sources", () => {
			const items: RetrievedItem[] = [
				createItem("vector", 0.8), // Gets 0.8 * 0.6 = 0.48
				createItem("graph", 2.0), // Gets (1/3) * 0.3 = 0.1
				createItem("lexical", 1.5), // Gets min(1.0, 1.5) * 0.1 = 0.1
			]

			const result = scorer.scoreItems(items, "test", {})
			// Sort by source for consistent testing
			result.sort((a, b) => a.source.localeCompare(b.source))

			// Log normalization details
			console.log(
				"Normalized scores:",
				result.map((i) => ({
					source: i.source,
					raw: i.score,
					final: i.finalScore,
				})),
			)

			expect(result[0].source).toBe("graph")
			expect(result[0].finalScore).toBe(0.1)

			expect(result[1].source).toBe("lexical")
			expect(result[1].finalScore).toBe(0.1)

			expect(result[2].source).toBe("vector")
			expect(result[2].finalScore).toBe(0.48)
		})

		it("should remove duplicates and combine their scores", () => {
			const items: RetrievedItem[] = [
				createItem("vector", 0.8, "file1.ts", 1, 5), // 0.8 * 0.6 = 0.48
				createItem("graph", 0.6, "file1.ts", 1, 5), // (1/1.6) * 0.3 ≈ 0.188
			]

			const result = scorer.scoreItems(items, "test", {})

			// Log combination details
			console.log("Combined scores:", {
				vectorScore: 0.48,
				graphScore: 0.188,
				summed: 0.668,
				dampened: 0.668 * 0.8,
				final: result[0].finalScore,
			})

			expect(result).toHaveLength(1)
			expect(result[0].filePath).toBe("file1.ts")
			expect(result[0].finalScore).toBe(0.534) // (0.48 + 0.188) * 0.8
		})

		it("should properly handle boost factors when enabled", () => {
			const items: RetrievedItem[] = [
				createItem("vector", 1.0, "current.ts", 10, 15),
				createItem("vector", 1.0, "other.ts", 1, 5),
			]

			const options: ScoringOptions = {
				boost: {
					proximity: true,
					recency: true,
				},
				context: {
					currentFile: "current.ts",
					recentFiles: ["current.ts"],
				},
			}

			const result = scorer.scoreItems(items, "test", options)
			expect(result[0].filePath).toBe("current.ts")
			expect(result[0].finalScore).toBeGreaterThan(result[1].finalScore)
		})
	})
})

function createItem(
	source: "vector" | "graph" | "lexical",
	score: number,
	filePath: string = "test.ts",
	startLine: number = 1,
	endLine: number = 2,
): RetrievedItem {
	return {
		id: `test-${Math.random()}`,
		name: `test-${Math.random()}`,
		content: "test content",
		filePath,
		startLine,
		endLine,
		score,
		source,
		type: "function",
	}
}

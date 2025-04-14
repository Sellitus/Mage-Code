import { RecencyScorer } from "../recencyScorer"
import { RetrievedItem, ScoringOptions } from "../../types"

describe("RecencyScorer", () => {
	let scorer: RecencyScorer

	beforeEach(() => {
		scorer = new RecencyScorer()
	})

	describe("normalize", () => {
		it("should clamp values to 0-1 range", () => {
			expect(scorer.normalize(-0.5)).toBe(0)
			expect(scorer.normalize(0.5)).toBe(0.5)
			expect(scorer.normalize(1.5)).toBe(1)
		})
	})

	describe("score", () => {
		it("should not modify scores when no recent files are provided", () => {
			const items = [createItem("test1.ts", 0.8), createItem("test2.ts", 0.6)]

			const result = scorer.score(items, {})

			expect(result[0].finalScore).toBe(0.8)
			expect(result[1].finalScore).toBe(0.6)
		})

		it("should boost scores for items in recent files with exponential decay", () => {
			const items = [
				createItem("test1.ts", 0.8), // Most recent
				createItem("test2.ts", 0.8), // Second most recent
				createItem("test3.ts", 0.8), // Third most recent
				createItem("old.ts", 0.8), // Not in recent files
			]

			const options: ScoringOptions = {
				context: {
					recentFiles: ["test1.ts", "test2.ts", "test3.ts"],
				},
			}

			const result = scorer.score(items, options)

			// More recent files should get higher boost
			expect(result[0].finalScore).toBeGreaterThan(result[1].finalScore)
			expect(result[1].finalScore).toBeGreaterThan(result[2].finalScore)
			// Non-recent file should get no boost
			expect(result[3].finalScore).toBe(0.8)
		})

		it("should handle previously scored items", () => {
			const items = [
				{
					...createItem("test1.ts", 0.8),
					finalScore: 0.9, // Already scored
				},
			]

			const options: ScoringOptions = {
				context: {
					recentFiles: ["test1.ts"],
				},
			}

			const result = scorer.score(items, options)

			// Should apply boost to finalScore instead of original score
			expect(result[0].finalScore).toBeGreaterThan(0.9)
		})

		it("should maintain relative ordering within recency groups", () => {
			const items = [
				createItem("test1.ts", 0.8), // High score, most recent
				createItem("test1.ts", 0.6), // Lower score, most recent
				createItem("test2.ts", 0.9), // Highest score, less recent
				createItem("test2.ts", 0.7), // Medium score, less recent
			]

			const options: ScoringOptions = {
				context: {
					recentFiles: ["test1.ts", "test2.ts"],
				},
			}

			const result = scorer.score(items, options)

			// Within same recency group, higher original scores should remain higher
			const test1Items = result.filter((r) => r.filePath === "test1.ts")
			const test2Items = result.filter((r) => r.filePath === "test2.ts")

			expect(test1Items[0].finalScore).toBeGreaterThan(test1Items[1].finalScore)
			expect(test2Items[0].finalScore).toBeGreaterThan(test2Items[1].finalScore)
		})

		it("should apply reasonable boost magnitudes", () => {
			const originalScore = 0.8
			const item = createItem("test.ts", originalScore)

			const options: ScoringOptions = {
				context: {
					recentFiles: ["test.ts"],
				},
			}

			const result = scorer.score([item], options)

			// Boost should be noticeable but not overwhelming
			expect(result[0].finalScore).toBeGreaterThan(originalScore)
			expect(result[0].finalScore).toBeLessThan(originalScore * 1.5) // Max 50% boost
		})
	})
})

// Helper function to create test items
function createItem(filePath: string, score: number): RetrievedItem {
	return {
		id: `test-${Math.random()}`,
		content: "test content",
		filePath,
		startLine: 1,
		endLine: 5,
		score,
		source: "vector",
		type: "function",
	} as RetrievedItem
}

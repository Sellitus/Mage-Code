import { ProximityScorer } from "../proximityScorer"
import { RetrievedItem, ScoringOptions } from "../../types"

describe("ProximityScorer", () => {
	let scorer: ProximityScorer

	beforeEach(() => {
		scorer = new ProximityScorer()
	})

	describe("normalize", () => {
		it("should clamp values to 0-1 range", () => {
			expect(scorer.normalize(-0.5)).toBe(0)
			expect(scorer.normalize(0.5)).toBe(0.5)
			expect(scorer.normalize(1.5)).toBe(1)
		})
	})

	describe("score", () => {
		it("should not modify scores when no current file is provided", () => {
			const items = [createItem("test1.ts", 1, 5, 0.8), createItem("test2.ts", 10, 15, 0.6)]

			const result = scorer.score(items, {})

			expect(result[0].finalScore).toBe(0.8)
			expect(result[1].finalScore).toBe(0.6)
		})

		it("should boost scores for items in current file based on proximity", () => {
			const currentFile = "test.ts"
			const items = [
				createItem(currentFile, 1, 5, 0.8), // Close to start
				createItem(currentFile, 500, 505, 0.8), // Middle
				createItem(currentFile, 990, 995, 0.8), // Far
				createItem("other.ts", 1, 5, 0.8), // Different file
			]

			const options: ScoringOptions = {
				context: {
					currentFile,
				},
			}

			const result = scorer.score(items, options)

			// Closer items should get higher boost
			expect(result[0].finalScore).toBeGreaterThan(result[1].finalScore)
			expect(result[1].finalScore).toBeGreaterThan(result[2].finalScore)
			// Different file should get no boost
			expect(result[3].finalScore).toBe(0.8)
		})

		it("should handle previously scored items", () => {
			const currentFile = "test.ts"
			const items = [
				{
					...createItem(currentFile, 1, 5, 0.8),
					finalScore: 0.9, // Already scored
				},
			]

			const options: ScoringOptions = {
				context: {
					currentFile,
				},
			}

			const result = scorer.score(items, options)

			// Should apply boost to finalScore instead of original score
			expect(result[0].finalScore).toBeGreaterThan(0.9)
		})

		it("should maintain relative ordering within proximity groups", () => {
			const currentFile = "test.ts"
			const items = [
				createItem(currentFile, 1, 5, 0.8), // High score, close
				createItem(currentFile, 2, 6, 0.6), // Lower score, close
				createItem(currentFile, 500, 505, 0.9), // Highest score, far
				createItem(currentFile, 501, 506, 0.7), // Medium score, far
			]

			const options: ScoringOptions = {
				context: {
					currentFile,
				},
			}

			const result = scorer.score(items, options)

			// Within similar proximity, higher original scores should remain higher
			expect(result[0].finalScore).toBeGreaterThan(result[1].finalScore)
			expect(result[2].finalScore).toBeGreaterThan(result[3].finalScore)
		})
	})
})

// Helper function to create test items
function createItem(filePath: string, startLine: number, endLine: number, score: number): RetrievedItem {
	return {
		id: `test-${Math.random()}`,
		content: "test content",
		filePath,
		startLine,
		endLine,
		score,
		source: "vector",
		type: "function",
	} as RetrievedItem
}

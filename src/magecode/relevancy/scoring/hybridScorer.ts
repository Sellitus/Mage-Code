import { RetrievedItem, ScoredItem, ScoringOptions, IScorer } from "../types"
import { ProximityScorer, RecencyScorer } from "./index"
import { logger } from "../../../utils/logging" // Corrected import path to directory index

type SourceType = "vector" | "graph" | "lexical"
type Weights = Record<SourceType, number>

/**
 * Combines and ranks results from multiple retrievers using configurable weights
 * and additional scoring factors like proximity and recency.
 */
export class HybridScorer {
	/** Default weights for different sources */
	private readonly DEFAULT_WEIGHTS: Weights = {
		vector: 0.6,
		graph: 0.3,
		lexical: 0.1,
	}

	/** Dampening factor for combined scores */
	private readonly COMBINE_DAMPENING = 0.8

	/** Additional scorers for boost factors */
	private readonly scorers: Map<string, IScorer>

	constructor() {
		this.scorers = new Map<string, IScorer>()
		this.scorers.set("proximity", new ProximityScorer())
		this.scorers.set("recency", new RecencyScorer())
	}

	/**
	 * Score and rank a list of retrieved items
	 */
	scoreItems(items: RetrievedItem[], query: string, options: ScoringOptions): ScoredItem[] {
		if (items.length === 0) return []

		const weights = options.weights ?? this.DEFAULT_WEIGHTS

		// 1. Calculate initial weighted score
		let scoredItems: ScoredItem[] = items.map((item) => {
			const weight = weights[item.source as SourceType] ?? 0 // Default to 0 if source unknown
			const initialScore = (item.score ?? 0) * weight // Use item.score, default to 0 if undefined
			return {
				...item,
				finalScore: initialScore,
			}
		})

		// 2. Apply boost factors
		if (options.boost) {
			for (const [boostType, boostEnabled] of Object.entries(options.boost)) {
				if (boostEnabled) {
					const scorer = this.scorers.get(boostType)
					if (scorer) {
						try {
							// Apply the scorer. It might modify scores or reorder/filter items.
							// We assume the scorer returns a new array with updated finalScores.
							scoredItems = scorer.score(scoredItems, options)
						} catch (error) {
							logger.error(`Error applying ${boostType} scorer:`, error)
							// Decide if we should continue or re-throw
						}
					} else {
						logger.warn(`Boost requested for unknown scorer type: ${boostType}`)
					}
				}
			}
		}

		// 3. Remove duplicates (combining scores)
		const uniqueItems = this.removeDuplicates(scoredItems)

		// 4. Sort by final score (descending)
		uniqueItems.sort((a, b) => b.finalScore - a.finalScore)

		return uniqueItems
	}

	/**
	 * Remove duplicate items and combine their scores
	 */
	private removeDuplicates(items: ScoredItem[]): ScoredItem[] {
		const uniqueMap = new Map<string, ScoredItem>()

		for (const item of items) {
			const key = this.getUniqueKey(item)
			const existing = uniqueMap.get(key)

			if (existing) {
				// Combine scores using dampening factor
				const summed = existing.finalScore + item.finalScore
				const finalScore = Math.round(summed * this.COMBINE_DAMPENING * 1000) / 1000

				// Keep the item with the higher original score before weighting/boosting if needed,
				// or merge metadata if necessary. Here, we just update the score.
				uniqueMap.set(key, {
					...existing, // Keep metadata from the first encountered item
					finalScore,
					// Optionally combine or prioritize other fields like 'reasoning'
				})
			} else {
				uniqueMap.set(key, item)
			}
		}

		return Array.from(uniqueMap.values())
	}

	/**
	 * Generate a unique key for a code item
	 */
	private getUniqueKey(item: RetrievedItem): string {
		// Ensure consistent key generation even if start/endLine are undefined
		return `${item.filePath}:${item.startLine ?? -1}:${item.endLine ?? -1}:${item.type}`
	}
}

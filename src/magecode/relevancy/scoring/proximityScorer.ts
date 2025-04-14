import { RetrievedItem, ScoredItem, ScoringOptions, IScorer } from "../types"

/**
 * Type guard to check if an item is already scored
 */
function isScoredItem(item: RetrievedItem): item is ScoredItem {
	return "finalScore" in item
}

/**
 * Boosts scores for items that are closer to the current cursor position
 */
export class ProximityScorer implements IScorer {
	/** Maximum line distance to consider for proximity scoring */
	private readonly MAX_DISTANCE = 1000

	/** Weight applied to proximity boost (0 to 1) */
	private readonly PROXIMITY_WEIGHT = 0.2

	/**
	 * Normalize a raw proximity score to [0, 1] range
	 * @param score Raw proximity score
	 */
	normalize(score: number): number {
		return Math.max(0, Math.min(1, score))
	}

	/**
	 * Score items based on their proximity to current cursor position
	 * @param items Items to score
	 * @param options Scoring options containing cursor context
	 */
	score(items: RetrievedItem[], options: ScoringOptions): ScoredItem[] {
		const currentFile = options.context?.currentFile
		if (!currentFile) {
			// If no current file, just convert to ScoredItem without changes
			return items.map((item) => ({
				...item,
				finalScore: isScoredItem(item) ? item.finalScore : item.score,
			}))
		}

		return items.map((item) => {
			const proximityBoost = this.calculateProximityBoost(item, currentFile)
			const baseScore = isScoredItem(item) ? item.finalScore : item.score
			return {
				...item,
				finalScore: baseScore * (1 + proximityBoost),
			}
		})
	}

	/**
	 * Calculate proximity boost factor for an item
	 * @param item Item to calculate boost for
	 * @param currentFile Current file path
	 */
	private calculateProximityBoost(item: RetrievedItem, currentFile: string): number {
		// Items in different files get no proximity boost
		if (item.filePath !== currentFile) {
			return 0
		}

		// Calculate line distance
		const itemCenter = (item.startLine + item.endLine) / 2
		const distance = Math.min(this.MAX_DISTANCE, Math.abs(itemCenter))

		// Convert distance to a decay factor (1.0 at distance 0, approaching 0 as distance increases)
		const proximityFactor = Math.max(0, 1 - distance / this.MAX_DISTANCE)

		// Apply weight to keep the boost reasonable
		return proximityFactor * this.PROXIMITY_WEIGHT
	}
}

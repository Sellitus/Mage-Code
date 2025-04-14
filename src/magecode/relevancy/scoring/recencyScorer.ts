import { RetrievedItem, ScoredItem, ScoringOptions, IScorer } from "../types"

/**
 * Type guard to check if an item is already scored
 */
function isScoredItem(item: RetrievedItem): item is ScoredItem {
	return "finalScore" in item
}

/**
 * Boosts scores for items in recently modified files
 */
export class RecencyScorer implements IScorer {
	/** Weight applied to recency boost (0 to 1) */
	private readonly RECENCY_WEIGHT = 0.15

	/** Decay factor for recency boost */
	private readonly DECAY_FACTOR = 5

	/**
	 * Normalize a raw recency score to [0, 1] range
	 * @param score Raw recency score
	 */
	normalize(score: number): number {
		return Math.max(0, Math.min(1, score))
	}

	/**
	 * Score items based on how recently their files were modified
	 * @param items Items to score
	 * @param options Scoring options containing recent files context
	 */
	score(items: RetrievedItem[], options: ScoringOptions): ScoredItem[] {
		const recentFiles = options.context?.recentFiles
		if (!recentFiles?.length) {
			// If no recent files data, just convert to ScoredItem without changes
			return items.map((item) => ({
				...item,
				finalScore: isScoredItem(item) ? item.finalScore : item.score,
			}))
		}

		return items.map((item) => {
			const recencyBoost = this.calculateRecencyBoost(item, recentFiles)
			const baseScore = isScoredItem(item) ? item.finalScore : item.score
			return {
				...item,
				finalScore: baseScore * (1 + recencyBoost),
			}
		})
	}

	/**
	 * Calculate recency boost factor for an item based on its position in recent files
	 * @param item Item to calculate boost for
	 * @param recentFiles List of recently modified file paths
	 */
	private calculateRecencyBoost(item: RetrievedItem, recentFiles: string[]): number {
		// Check if the item's file is in the recent files list
		const fileIndex = recentFiles.indexOf(item.filePath)
		if (fileIndex === -1) {
			return 0
		}

		// More recent files (lower index) get higher boost
		// Use exponential decay based on position in recent files list
		const normalizedPosition = fileIndex / recentFiles.length
		const boost = Math.exp(-this.DECAY_FACTOR * normalizedPosition)

		// Apply weight to keep the boost reasonable
		return boost * this.RECENCY_WEIGHT
	}
}

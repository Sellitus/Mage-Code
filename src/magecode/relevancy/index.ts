import { RetrievedItem, ScoredItem, RetrievalOptions, ScoringOptions, IRetriever } from "./types"
import { HybridScorer } from "./scoring/hybridScorer"
import * as vscode from "vscode"

/**
 * Main facade for the relevancy system that coordinates retrievers and scoring
 */
export class RelevancyEngine implements vscode.Disposable {
	/**
	 * Create a new RelevancyEngine
	 * @param vectorRetriever Retriever for vector-based search
	 * @param graphRetriever Retriever for graph-based search
	 * @param hybridScorer Scorer for combining and ranking results
	 */
	constructor(
		private readonly vectorRetriever: IRetriever,
		private readonly graphRetriever: IRetriever,
		private readonly hybridScorer: HybridScorer,
	) {}

	/**
	 * Find relevant code items for a query
	 * @param query Search query
	 * @param options Retrieval options
	 * @returns Ranked list of relevant code items
	 */
	async findRelevantCode(query: string, options: RetrievalOptions): Promise<ScoredItem[]> {
		try {
			// Retrieve from all sources in parallel
			const [vectorResults, graphResults] = await Promise.all([
				this.safeRetrieve(this.vectorRetriever, query, options),
				this.safeRetrieve(this.graphRetriever, query, options),
			])

			// Combine all results
			const allResults = [...vectorResults, ...graphResults]

			// Early return if no results found
			if (allResults.length === 0) {
				return []
			}

			// Convert retrieval options to scoring options
			const scoringOptions: ScoringOptions = this.createScoringOptions(options)

			// Score and rank the combined results
			return this.hybridScorer.scoreItems(allResults, query, scoringOptions)
		} catch (error) {
			console.error("Error in RelevancyEngine.findRelevantCode:", error)
			throw new Error("Failed to find relevant code: " + (error as Error).message)
		}
	}

	/**
	 * Safely retrieve results from a retriever, handling errors gracefully
	 * @param retriever Retriever to use
	 * @param query Search query
	 * @param options Retrieval options
	 */
	private async safeRetrieve(
		retriever: IRetriever,
		query: string,
		options: RetrievalOptions,
	): Promise<RetrievedItem[]> {
		try {
			return await retriever.retrieve(query, options)
		} catch (error) {
			console.warn(`Retriever failed:`, error)
			return [] // Return empty array instead of failing completely
		}
	}

	/**
	 * Convert retrieval options to scoring options
	 * @param retrievalOptions Original retrieval options
	 */
	private createScoringOptions(retrievalOptions: RetrievalOptions): ScoringOptions {
		return {
			boost: {
				proximity: true, // Enable proximity boost by default
				recency: true, // Enable recency boost by default
			},
			context: {
				currentFile: retrievalOptions.cursorFile,
				// Add recent files if available in the future
				recentFiles: [],
			},
		}
	}

	/**
	 * Clean up any resources
	 */
	dispose(): void {
		// Clean up any resources if needed
	}
}

import { RetrievedItem, ScoredItem, RetrievalOptions, ScoringOptions, IRetriever } from "./types"
import { HybridScorer } from "./scoring/hybridScorer"
import * as vscode from "vscode"
import { logger } from "../utils/logging" // Import the logger

/**
 * Main facade for the relevancy system. Coordinates various retrievers (vector, graph, etc.)
 * and scoring mechanisms to find and rank code elements relevant to a given query and context.
 * Implements `vscode.Disposable` for potential future cleanup needs.
 */
export class RelevancyEngine implements vscode.Disposable {
	/**
	 * Creates an instance of RelevancyEngine.
	 * @param vectorRetriever - Retriever for vector-based similarity search.
	 * @param graphRetriever - Retriever for graph-based traversal search.
	 * @param hybridScorer - Scorer responsible for combining and ranking results from different retrievers.
	 */
	constructor(
		private readonly vectorRetriever: IRetriever,
		private readonly graphRetriever: IRetriever,
		private readonly hybridScorer: HybridScorer,
	) {}

	/**
	 * Finds and ranks relevant code items based on a query and retrieval options.
	 * It retrieves items from configured sources (vector, graph) in parallel,
	 * combines the results, and then scores them using the hybrid scorer.
	 *
	 * @param query - The search query string.
	 * @param options - Options controlling the retrieval process (e.g., limits, context).
	 * @returns A promise resolving to an array of scored and ranked relevant items.
	 * @throws {Error} If a critical error occurs during retrieval or scoring (retriever errors are handled gracefully).
	 */
	async findRelevantCode(query: string, options: RetrievalOptions): Promise<ScoredItem[]> {
		logger.info(`[RelevancyEngine] Finding relevant code for query: "${query.substring(0, 50)}..."`)
		logger.debug("[RelevancyEngine] Retrieval options:", options)
		try {
			// Retrieve from all sources in parallel
			const [vectorResults, graphResults] = await Promise.all([
				this.safeRetrieve(this.vectorRetriever, query, options),
				this.safeRetrieve(this.graphRetriever, query, options),
			])

			logger.debug(
				`[RelevancyEngine] Retrieved ${vectorResults.length} vector results, ${graphResults.length} graph results.`,
			)
			// Combine all results
			const allResults = [...vectorResults, ...graphResults]

			// Early return if no results found
			if (allResults.length === 0) {
				logger.info("[RelevancyEngine] No relevant items found by any retriever.")
				return []
			}

			// Convert retrieval options to scoring options
			const scoringOptions: ScoringOptions = this.createScoringOptions(options)

			// Score and rank the combined results
			const scoredItems = this.hybridScorer.scoreItems(allResults, query, scoringOptions)
			logger.info(`[RelevancyEngine] Scored ${scoredItems.length} items.`)
			logger.debug("[RelevancyEngine] Top scored items:", scoredItems.slice(0, 5)) // Log top 5 for debugging
			return scoredItems
		} catch (error) {
			// Catch errors not handled by safeRetrieve (e.g., scoring errors)
			logger.error("[RelevancyEngine] Critical error during findRelevantCode", error)
			// Re-throw wrapped error? Or return empty? For now, re-throw.
			throw new Error(`Failed to find relevant code: ${error instanceof Error ? error.message : String(error)}`)
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
			logger.warn(`Retriever failed`, error)
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
	 * Disposes of any resources held by the engine or its components if necessary.
	 * Currently, retrievers and scorers are assumed not to hold disposable resources directly,
	 * but this provides the standard mechanism.
	 */
	dispose(): void {
		logger.info("[RelevancyEngine] Disposing...")
		// If retrievers or scorers become disposable, add their disposal here.
		// e.g., if (this.vectorRetriever instanceof vscode.Disposable) this.vectorRetriever.dispose();
		logger.info("[RelevancyEngine] Disposed.")
	}
}

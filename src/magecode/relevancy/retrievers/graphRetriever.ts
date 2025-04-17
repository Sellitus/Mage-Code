import { IRetriever, RetrievedItem, RetrievalOptions } from "../types"
import { ILocalCodeIntelligence, GraphSearchResult } from "../../intelligence"
import { CodeElement } from "../../intelligence/types"
import * as vscode from "vscode"
import { logger } from "../../utils/logging" // Import the logger

/**
 * Retrieves code elements using graph traversal
 */
export class GraphRetriever implements IRetriever {
	/** Default maximum graph traversal distance */
	private readonly DEFAULT_MAX_DISTANCE = 3

	/** Default maximum results to return */
	private readonly DEFAULT_LIMIT = 20

	constructor(
		private readonly intelligence: ILocalCodeIntelligence,
		private readonly maxDistance: number = 3,
		private readonly maxResults: number = 20,
	) {}

	/**
	 * Retrieve relevant code elements using graph traversal
	 * @param query Search query
	 * @param options Retrieval options
	 */
	async retrieve(query: string, options: RetrievalOptions): Promise<RetrievedItem[]> {
		try {
			if (!options.cursorFile || options.cursorLine === undefined) {
				return [] // Graph retrieval requires cursor context
			}

			// Get code element at cursor position
			const elements = await this.intelligence.searchGraph(
				`${options.cursorFile}:${options.cursorLine}`,
				this.maxDistance,
				["calls", "imports", "defines", "uses"],
				options.limit || this.DEFAULT_LIMIT,
			)

			// Convert to RetrievedItems
			return elements.map((result) => this.convertToRetrievedItem(result))
		} catch (error) {
			logger.error("Graph retrieval error", error)
			return []
		}
	}

	/**
	 * Convert a graph search result to a RetrievedItem
	 */
	private convertToRetrievedItem(result: GraphSearchResult): RetrievedItem {
		return {
			id: result.element.id,
			name: result.element.name,
			content: result.element.content,
			filePath: result.element.filePath,
			startLine: result.element.startLine,
			endLine: result.element.endLine,
			// Convert distance to a similarity score (closer = higher score)
			score: 1 / (1 + result.distance),
			source: "graph",
			type: result.element.type,
		}
	}
}

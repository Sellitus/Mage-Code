import { IRetriever, RetrievedItem, RetrievalOptions } from "../types"
import { ILocalCodeIntelligence, VectorSearchResult } from "../../intelligence"
import { CodeElement } from "../../intelligence/types"
import * as vscode from "vscode"
import { logger } from "../../utils/logging" // Import the logger

/**
 * Retrieves code elements using vector similarity search
 */
export class VectorRetriever implements IRetriever {
	constructor(
		private readonly intelligence: ILocalCodeIntelligence,
		private readonly maxResults: number = 20,
		private readonly similarityThreshold: number = 0.6,
	) {}

	/**
	 * Retrieve relevant code elements using vector similarity search
	 * @param query Search query
	 * @param options Retrieval options
	 */
	async retrieve(query: string, options: RetrievalOptions): Promise<RetrievedItem[]> {
		try {
			// Get query embedding
			const queryEmbedding = await this.intelligence.generateEmbedding(query)

			// Search for similar vectors
			const results = await this.intelligence.searchVectors(
				queryEmbedding,
				options.limit || this.maxResults,
				this.similarityThreshold,
				options.fileTypes,
			)

			// Convert to RetrievedItems
			return results.map((result) => this.convertToRetrievedItem(result))
		} catch (error) {
			logger.error("Vector retrieval error", error)
			return []
		}
	}

	/**
	 * Convert a vector search result to a RetrievedItem
	 */
	private convertToRetrievedItem(result: VectorSearchResult): RetrievedItem {
		return {
			id: result.element.id,
			name: result.element.name,
			content: result.element.content,
			filePath: result.element.filePath,
			startLine: result.element.startLine,
			endLine: result.element.endLine,
			score: result.similarity,
			source: "vector",
			type: result.element.type,
		}
	}
}

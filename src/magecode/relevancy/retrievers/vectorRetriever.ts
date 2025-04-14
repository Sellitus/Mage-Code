import type { IRetriever, RetrievedItem, RetrievalOptions } from "../../interfaces"
import type { EmbeddingService } from "../../intelligence/embedding/embeddingService"
import type { VectorIndex } from "../../intelligence/vector/vectorIndex"
import type { DatabaseManager, CodeElement } from "../../intelligence/storage/databaseManager"

/**
 * VectorRetriever: Uses EmbeddingService and VectorIndex to find semantically similar code elements.
 */
export class VectorRetriever implements IRetriever {
	private embeddingService: EmbeddingService
	private vectorIndex: VectorIndex
	private databaseManager: DatabaseManager

	constructor(embeddingService: EmbeddingService, vectorIndex: VectorIndex, databaseManager: DatabaseManager) {
		this.embeddingService = embeddingService
		this.vectorIndex = vectorIndex
		this.databaseManager = databaseManager
	}

	/**
	 * Retrieves semantically similar code elements for a given query.
	 * @param query The user's search query.
	 * @param options Retrieval options (e.g., limit).
	 * @returns Promise of RetrievedItem[]
	 */
	async retrieve(query: string, options: RetrievalOptions): Promise<RetrievedItem[]> {
		// 1. Generate embedding for the query
		const [queryEmbedding] = await this.embeddingService.generateEmbeddings([query])
		if (!queryEmbedding) {
			throw new Error("Failed to generate embedding for query.")
		}

		// 2. Search the vector index
		const limit = options?.limit ?? 10
		const results = await this.vectorIndex.search(queryEmbedding, limit)

		// 3. For each result, fetch code element details from the database
		const retrievedItems: RetrievedItem[] = []
		for (const result of results) {
			// Convert result.id to number for DB lookup
			const codeElement: CodeElement | undefined = await this.databaseManager.getCodeElementById(
				Number(result.id),
			)
			if (!codeElement) {
				// Element might be missing if out of sync; skip it
				continue
			}
			retrievedItems.push({
				id: String(codeElement.id ?? result.id),
				content: codeElement.content ?? "",
				filePath: codeElement.file_path ?? "",
				startLine: codeElement.start_line ?? 0,
				endLine: codeElement.end_line ?? 0,
				score: result.score,
				source: "vector",
				type: codeElement.type ?? "",
				name: codeElement.name ?? "",
			})
		}
		return retrievedItems
	}
}

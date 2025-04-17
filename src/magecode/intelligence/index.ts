import { CodeElement } from "./types"
import { processAndStoreFile } from "./processAndStoreFile"
import * as vscode from "vscode"
import { logger } from "../utils/logging" // Import the logger
import { DatabaseManager } from "./storage/databaseManager" // Import DatabaseManager
import { MageParser } from "./parser" // Import MageParser
import { EmbeddingService } from "./embedding/embeddingService" // Import EmbeddingService
import { VectorIndex } from "./vector/vectorIndex" // Import VectorIndex
import { ConfigurationError, EmbeddingError, VectorIndexError } from "../utils/errors" // Import custom errors

export { processAndStoreFile }
export * from "./types"

/**
 * Result from a vector similarity search
 */
export interface VectorSearchResult {
	element: CodeElement
	similarity: number
}

/**
 * Result from a graph traversal search
 */
export interface GraphSearchResult {
	element: CodeElement
	distance: number
	path: string[]
}

/**
 * Core intelligence engine interface
 */
export interface ILocalCodeIntelligence {
	/**
	 * Initialize the intelligence engine
	 */
	initialize(context: vscode.ExtensionContext): Promise<void> // Add context for VectorIndex init

	/**
	 * Generate embedding vector for text
	 */
	generateEmbedding(text: string): Promise<Float32Array>

	/**
	 * Search for similar vectors
	 */
	searchVectors(
		queryVector: Float32Array,
		limit: number,
		threshold: number,
		fileTypes?: string[],
	): Promise<VectorSearchResult[]>

	/**
	 * Search for related elements through graph traversal
	 */
	searchGraph(
		startId: string,
		maxDistance: number,
		relationTypes: string[],
		limit: number,
	): Promise<GraphSearchResult[]>
}

/**
 * Implementation of the local code intelligence engine using dependency injection.
 */
export class LocalCodeIntelligenceEngine implements ILocalCodeIntelligence, vscode.Disposable {
	protected initialized = false
	protected disposables: vscode.Disposable[] = []

	// Injected dependencies
	private readonly databaseManager: DatabaseManager
	private readonly mageParser: MageParser
	private readonly embeddingService: EmbeddingService
	private readonly vectorIndex: VectorIndex

	constructor(
		databaseManager: DatabaseManager,
		mageParser: MageParser,
		embeddingService: EmbeddingService,
		vectorIndex: VectorIndex,
	) {
		this.databaseManager = databaseManager
		this.mageParser = mageParser
		this.embeddingService = embeddingService
		this.vectorIndex = vectorIndex

		// Add disposable dependencies to the list
		if (this.databaseManager && typeof this.databaseManager.dispose === "function") {
			this.disposables.push(this.databaseManager)
		}
		// MageParser doesn't have a dispose method currently
		// EmbeddingService doesn't have a dispose method currently
		if (this.vectorIndex && typeof this.vectorIndex.dispose === "function") {
			this.disposables.push(this.vectorIndex)
		}
	}

	async initialize(context: vscode.ExtensionContext): Promise<void> {
		if (this.initialized) {
			logger.info("LocalCodeIntelligenceEngine already initialized.")
			return
		}

		logger.info("Initializing LocalCodeIntelligenceEngine...")
		try {
			// Initialize parser first (needed for potential WASM loading)
			await MageParser.initialize() // Static initialization

			// Initialize other services concurrently
			await Promise.all([
				this.databaseManager.initialize(),
				this.embeddingService.initialize(),
				this.vectorIndex.initialize(context), // Pass context
			])

			this.initialized = true
			logger.info("LocalCodeIntelligenceEngine initialized successfully.")
		} catch (error: any) {
			const msg = "Failed to initialize LocalCodeIntelligenceEngine"
			logger.error(msg, error)
			// Clean up partially initialized resources if necessary (dispose methods handle this)
			this.dispose()
			// Re-throw specific errors or a generic one
			if (
				error instanceof ConfigurationError ||
				error instanceof EmbeddingError ||
				error instanceof VectorIndexError
			) {
				throw error
			}
			throw new ConfigurationError(msg, error)
		}
	}

	async generateEmbedding(text: string): Promise<Float32Array> {
		if (!this.initialized) {
			throw new Error("LocalCodeIntelligenceEngine not initialized")
		}
		try {
			// EmbeddingService returns number[][], we need Float32Array for a single text
			const embeddings = await this.embeddingService.generateEmbeddings([text])
			if (embeddings.length === 0) {
				// Should not happen for single non-empty text, but handle defensively
				throw new EmbeddingError("EmbeddingService returned no embedding for the provided text.")
			}
			// Convert number[] to Float32Array
			return new Float32Array(embeddings[0])
		} catch (error: any) {
			logger.error("Error generating embedding via EmbeddingService", error)
			// Re-throw or wrap error as needed
			if (error instanceof EmbeddingError) {
				throw error
			}
			throw new EmbeddingError("Failed to generate embedding", error)
		}
	}

	async searchVectors(
		queryVector: Float32Array,
		limit: number,
		threshold: number, // Note: Threshold not directly used by VectorIndex.search currently
		fileTypes?: string[], // Note: fileTypes not directly used by VectorIndex.search currently
	): Promise<VectorSearchResult[]> {
		if (!this.initialized) {
			throw new Error("LocalCodeIntelligenceEngine not initialized")
		}
		try {
			// 1. Search the vector index
			const searchResults = await this.vectorIndex.search(Array.from(queryVector), limit) // Convert Float32Array to number[]

			// 2. Filter by threshold (if needed, score interpretation depends on index type - L2 distance vs similarity)
			// Assuming lower score (distance) is better for now. Adjust if using similarity.
			const filteredResults = searchResults.filter((r) => r.score >= 0 && r.score <= threshold) // Example threshold filter

			// 3. Fetch CodeElement details from the database
			const finalResults: VectorSearchResult[] = []
			for (const result of filteredResults) {
				const element = await this.databaseManager.getCodeElementById(result.id)
				if (element) {
					// TODO: Filter by fileTypes if provided
					if (
						!fileTypes ||
						fileTypes.length === 0 ||
						fileTypes.some((ext) => element.filePath.endsWith(ext))
					) {
						finalResults.push({
							element: element,
							similarity: result.score, // Or 1 - result.score if distance
						})
					}
				} else {
					logger.warn(`Vector search result ID ${result.id} not found in database.`)
				}
			}

			return finalResults
		} catch (error: any) {
			logger.error("Error searching vectors", error)
			if (error instanceof VectorIndexError) {
				throw error
			}
			throw new VectorIndexError("Failed to search vectors", error)
		}
	}

	async searchGraph(
		startId: string,
		maxDistance: number,
		relationTypes: string[],
		limit: number,
	): Promise<GraphSearchResult[]> {
		if (!this.initialized) {
			throw new Error("LocalCodeIntelligenceEngine not initialized")
		}
		// TODO: Implement graph search delegation to DatabaseManager or a dedicated graph service
		logger.warn("LocalCodeIntelligenceEngine.searchGraph called - not implemented.")
		throw new Error("searchGraph not implemented in LocalCodeIntelligenceEngine.")
		// Example delegation (if DatabaseManager had the method):
		// try {
		//     return await this.databaseManager.searchGraph(startId, maxDistance, relationTypes, limit);
		// } catch (error: any) {
		//     logger.error("Error searching graph", error);
		//     throw new Error("Failed to search graph", { cause: error }); // Or a more specific error
		// }
	}

	dispose(): void {
		logger.info("Disposing LocalCodeIntelligenceEngine...")
		this.disposables.forEach((d) => {
			try {
				d.dispose()
			} catch (e) {
				logger.error("Error disposing dependency:", e)
			}
		})
		this.disposables = []
		this.initialized = false
		logger.info("LocalCodeIntelligenceEngine disposed.")
	}
}

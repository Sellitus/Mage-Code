import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
import { logger } from "../../utils/logging" // Import the logger
import { VectorIndexError, ConfigurationError } from "../../utils/errors" // Import custom errors
// import { IndexFlatL2 } from 'faiss-node'; // Placeholder - will uncomment/adjust later
// import { Voy } from 'voy-search'; // Placeholder - will uncomment/adjust later
// import debounce from 'lodash.debounce'; // Placeholder - will add if needed

type VectorMapping = Map<number, string> // Maps internal numeric ID to original element ID

/**
 * Manages the vector index (using FAISS or Voy) for similarity search.
 * Handles index loading/saving, mapping between internal/external IDs,
 * adding embeddings, searching, and removing embeddings by file.
 * Implements vscode.Disposable to ensure proper cleanup and saving on shutdown.
 */
export class VectorIndex implements vscode.Disposable {
	private index: any // Will hold FAISS or Voy instance (consider a more specific type/interface if possible)
	private mapping: VectorMapping = new Map() // Maps internal numeric ID -> original element ID string
	private fileToVectorIds: Map<string, Set<number>> = new Map() // Maps file path -> Set of internal numeric IDs
	private workspacePath: string | undefined
	private vectorDirPath: string | undefined
	private mappingPath: string | undefined
	private indexSavePath: string | undefined
	private initialized: boolean = false
	private debouncedSaveMapping: () => void = () => {} // Placeholder
	private debounceTimeout: NodeJS.Timeout | null = null // Store timeout ID for debounced save cancellation

	/**
	 * Creates an instance of VectorIndex. Determines workspace paths but does not initialize the index.
	 * @throws {ConfigurationError} If no workspace folder is found.
	 */
	constructor() {
		// Determine workspace path immediately
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (workspaceFolders && workspaceFolders.length > 0) {
			this.workspacePath = workspaceFolders[0].uri.fsPath
			this.vectorDirPath = path.join(this.workspacePath, ".magecode", "vectors")
			this.mappingPath = path.join(this.vectorDirPath, "mapping.json")
			// Index path depends on platform, set in initialize
		} else {
			const msg = "MageCode: No workspace folder found. VectorIndex cannot initialize."
			logger.error(msg)
			// Throw config error as this prevents initialization
			throw new ConfigurationError(msg)
		}

		// Initialize debounced function (example using a simple timeout)
		// Replace with lodash.debounce if added as dependency
		this.debouncedSaveMapping = () => {
			if (this.debounceTimeout) clearTimeout(this.debounceTimeout)
			this.debounceTimeout = setTimeout(() => {
				this.saveMapping().catch((err) => logger.error("Error saving mapping during debounce", err))
			}, 1000) // Save after 1 second of inactivity
		}
	}

	/**
	 * Initializes the VectorIndex. This includes:
	 * - Ensuring the vector storage directory exists.
	 * - Loading the ID mapping from disk.
	 * - Initializing the appropriate underlying vector index library (FAISS or Voy) based on the platform.
	 * - Loading the index data from disk if it exists.
	 * - Registering the instance for disposal with the extension context.
	 * @param context - The VS Code extension context.
	 * @throws {ConfigurationError} If workspace paths are missing.
	 * @throws {VectorIndexError} If directory creation, mapping load, or index initialization fails.
	 */
	async initialize(context: vscode.ExtensionContext): Promise<void> {
		if (!this.vectorDirPath || !this.mappingPath || !this.workspacePath) {
			// This should technically be caught by the constructor check, but belt-and-suspenders
			throw new ConfigurationError("VectorIndex cannot initialize without a workspace path.")
		}
		if (this.initialized) {
			logger.warn("VectorIndex already initialized.")
			return
		}

		logger.info("Initializing VectorIndex...")

		try {
			// 1. Create directory
			try {
				await fs.mkdir(this.vectorDirPath, { recursive: true })
				logger.info(`Vector directory ensured at: ${this.vectorDirPath}`)
			} catch (mkdirError: any) {
				throw new VectorIndexError(`Failed to create vector directory: ${this.vectorDirPath}`, mkdirError)
			}

			// 2. Load mapping
			await this.loadMapping() // loadMapping handles its own errors internally for now

			// 3. Initialize index based on platform
			const platform = process.platform
			try {
				if (platform === "win32" || platform === "darwin") {
					this.indexSavePath = path.join(this.vectorDirPath, "index.faiss")
					await this.initializeFaiss()
				} else {
					this.indexSavePath = path.join(this.vectorDirPath, "index.voy")
					await this.initializeVoy()
				}
			} catch (indexInitError: any) {
				throw new VectorIndexError(`Failed to initialize underlying vector index (${platform})`, indexInitError)
			}

			this.initialized = true
			context.subscriptions.push(this) // Register for disposal
			logger.info("VectorIndex initialized successfully.")
		} catch (error) {
			const msg = "Failed to initialize VectorIndex"
			// Log the original error if it's not already a VectorIndexError
			const cause = error instanceof VectorIndexError ? error.cause : error
			logger.error(msg, cause)
			vscode.window.showErrorMessage(
				`MageCode: Failed to initialize Vector Index. ${error instanceof Error ? error.message : error}`,
			)
			// Wrap in custom error if it's not already one
			if (error instanceof VectorIndexError || error instanceof ConfigurationError) {
				throw error
			} else {
				throw new VectorIndexError(msg, error)
			}
		}
	}

	private async initializeFaiss(): Promise<void> {
		// Placeholder for FAISS initialization logic
		logger.info(`Initializing FAISS index. Path: ${this.indexSavePath}`)
		// const { IndexFlatL2 } = await import('faiss-node'); // Dynamic import if needed
		// try {
		//     this.index = IndexFlatL2.read(this.indexSavePath);
		//     logger.info(`Loaded existing FAISS index from ${this.indexSavePath}`);
		// } catch (error) {
		//     logger.info(`No existing FAISS index found or error loading, creating new one. Error: ${error}`);
		//     const dimensions = 384; // Example dimension - should come from config or embedding model
		//     this.index = new IndexFlatL2(dimensions);
		// }
		// Mock implementation for now
		this.index = {
			add: async (vectors: number[][], ids: number[]) => {
				logger.debug(`FAISS Mock: Adding ${vectors.length} vectors.`)
			},
			search: async (vector: number[], k: number) => {
				logger.debug(`FAISS Mock: Searching for ${k} nearest neighbors.`)
				return []
			},
			write: async (path: string) => {
				logger.debug(`FAISS Mock: Writing index to ${path}`)
			},
			ntotal: () => this.mapping.size, // Simulate total vectors
		}
		await Promise.resolve() // Simulate async operation
	}

	private async initializeVoy(): Promise<void> {
		// Placeholder for Voy initialization logic
		logger.info(`Initializing Voy index. Path: ${this.indexSavePath}`)
		// const { Voy } = await import('voy-search'); // Dynamic import if needed
		// try {
		//     const buffer = await fs.readFile(this.indexSavePath);
		//     this.index = Voy.deserialize(buffer);
		//     logger.info(`Loaded existing Voy index from ${this.indexSavePath}`);
		// } catch (error) {
		//     logger.info(`No existing Voy index found or error loading, creating new one. Error: ${error}`);
		//     this.index = new Voy(); // Default config
		// }
		// Mock implementation for now
		this.index = {
			add: async (vectors: number[][], ids: number[]) => {
				logger.debug(`Voy Mock: Adding ${vectors.length} vectors.`)
			},
			search: async (vector: number[], k: number) => {
				logger.debug(`Voy Mock: Searching for ${k} nearest neighbors.`)
				return []
			},
			serialize: async () => {
				logger.debug(`Voy Mock: Serializing index.`)
				return Buffer.from("")
			},
			count: () => this.mapping.size, // Simulate total vectors
		}
		await Promise.resolve() // Simulate async operation
	}

	private async loadMapping(): Promise<void> {
		if (!this.mappingPath) return
		try {
			const mappingData = await fs.readFile(this.mappingPath, "utf-8")
			const parsed = JSON.parse(mappingData)
			// Support both old and new format for backward compatibility
			if (parsed && typeof parsed === "object" && parsed.mapping && parsed.fileToVectorIds) {
				this.mapping = new Map(parsed.mapping)
				this.fileToVectorIds = new Map(
					Object.entries(parsed.fileToVectorIds).map(([file, ids]) => [file, new Set(ids as number[])]),
				)
				logger.info(
					`Loaded mapping for ${this.mapping.size} vectors and fileToVectorIds for ${this.fileToVectorIds.size} files from ${this.mappingPath}`,
				)
			} else if (
				Array.isArray(parsed) &&
				parsed.every(
					(pair) =>
						Array.isArray(pair) &&
						pair.length === 2 &&
						typeof pair[0] === "number" &&
						typeof pair[1] === "string",
				)
			) {
				// Handle old format
				this.mapping = new Map(parsed as [number, string][])
				this.fileToVectorIds = new Map() // Initialize empty reverse map for old format
				logger.info(`Loaded old format mapping for ${this.mapping.size} vectors from ${this.mappingPath}`)
			} else {
				logger.warn(`Invalid mapping format found in ${this.mappingPath}. Initializing empty mapping.`)
				this.mapping = new Map()
				this.fileToVectorIds = new Map()
			}
		} catch (error: any) {
			if (error.code === "ENOENT") {
				logger.info(`Mapping file not found at ${this.mappingPath}. Initializing empty mapping.`)
				this.mapping = new Map()
				this.fileToVectorIds = new Map()
			} else {
				const msg = `Error loading mapping from ${this.mappingPath}`
				logger.error(msg, error)
				// Treat mapping load failure as potentially recoverable, initialize empty maps
				this.mapping = new Map()
				this.fileToVectorIds = new Map()
				// Optionally throw new VectorIndexError(msg, error) if mapping is critical
			}
		}
	}

	private async saveMapping(): Promise<void> {
		if (!this.mappingPath || !this.initialized) return // Don't save if not initialized
		if (process.env.NODE_ENV !== "test") {
			logger.info(`Saving mapping for ${this.mapping.size} vectors to ${this.mappingPath}...`)
		}
		try {
			const mappingArray = Array.from(this.mapping.entries())
			const fileToVectorIdsObj: Record<string, number[]> = {}
			for (const [file, ids] of this.fileToVectorIds.entries()) {
				fileToVectorIdsObj[file] = Array.from(ids)
			}
			const mappingJson = JSON.stringify({ mapping: mappingArray, fileToVectorIds: fileToVectorIdsObj }, null, 2)
			await fs.writeFile(this.mappingPath, mappingJson, "utf-8")
			if (process.env.NODE_ENV !== "test") {
				logger.info("Mapping saved successfully.")
			}
		} catch (error: any) {
			// Catch specific error type if possible
			if (process.env.NODE_ENV !== "test") {
				const msg = `Error saving mapping to ${this.mappingPath}`
				logger.error(msg, error)
			}
			// Consider notifying the user or implementing retry logic
			// Don't throw here, as it might happen during shutdown/debounce
		}
	}

	private async saveIndex(): Promise<void> {
		if (!this.index || !this.indexSavePath || !this.initialized) return
		logger.info(`Saving vector index to ${this.indexSavePath}...`)
		try {
			const platform = process.platform
			if (platform === "win32" || platform === "darwin") {
				// FAISS save
				if (typeof this.index.write === "function") {
					await this.index.write(this.indexSavePath)
				} else {
					logger.warn("FAISS index object does not have a 'write' method.")
				}
			} else {
				// Voy save
				if (typeof this.index.serialize === "function") {
					const buffer = await this.index.serialize()
					await fs.writeFile(this.indexSavePath, buffer)
				} else {
					logger.warn("Voy index object does not have a 'serialize' method.")
				}
			}
			logger.info("Vector index saved successfully.")
		} catch (error: any) {
			// Catch specific error type if possible
			const msg = `Error saving vector index to ${this.indexSavePath}`
			logger.error(msg, error)
			// Don't throw here, as it might happen during shutdown
		}
	}

	/**
	 * Adds multiple embeddings to the vector index and updates the mappings.
	 * Assigns new internal numeric IDs to the embeddings.
	 * Triggers a debounced save of the mapping file.
	 * @param embeddings - An array of objects, each containing the original element ID (`id`), the embedding vector (`vector`), and optionally the source file path (`filePath`).
	 * @throws {VectorIndexError} If the index is not initialized or if adding embeddings to the underlying index fails.
	 */
	async addEmbeddings(embeddings: { id: string; vector: number[]; filePath?: string }[]): Promise<void> {
		if (!this.initialized || !this.index) {
			throw new VectorIndexError("VectorIndex is not initialized.")
		}
		if (embeddings.length === 0) {
			return
		}

		logger.info(`Adding ${embeddings.length} embeddings...`)

		const vectors: number[][] = []
		const numericIds: number[] = []
		const newMappingEntries: [number, string][] = []
		const fileToIds: Map<string, number[]> = new Map()

		let currentMaxId = this.mapping.size > 0 ? Math.max(...this.mapping.keys()) : -1

		embeddings.forEach((embedding) => {
			currentMaxId++
			vectors.push(embedding.vector)
			numericIds.push(currentMaxId)
			newMappingEntries.push([currentMaxId, embedding.id])
			if (embedding.filePath) {
				if (!fileToIds.has(embedding.filePath)) fileToIds.set(embedding.filePath, [])
				fileToIds.get(embedding.filePath)!.push(currentMaxId)
			}
		})

		try {
			// Add to the actual index (FAISS or Voy)
			await this.index.add(vectors, numericIds)

			// Update the mapping *after* successful addition to index
			newMappingEntries.forEach(([numericId, elementId]) => {
				this.mapping.set(numericId, elementId)
			})

			// Update reverse mapping
			for (const [file, ids] of fileToIds.entries()) {
				if (!this.fileToVectorIds.has(file)) this.fileToVectorIds.set(file, new Set())
				const set = this.fileToVectorIds.get(file)!
				ids.forEach((id) => set.add(id))
			}

			logger.info(
				`Added ${embeddings.length} embeddings. Total vectors: ${this.mapping.size}. Updated fileToVectorIds for ${fileToIds.size} files.`,
			)

			// Trigger debounced save for the mapping
			this.debouncedSaveMapping()
		} catch (error: any) {
			// Catch specific error type if possible
			const msg = "Error adding embeddings to vector index"
			logger.error(msg, error)
			throw new VectorIndexError(msg, error) // Wrap and re-throw
		}
	}

	/**
	 * Performs a k-nearest neighbors search in the vector index.
	 * @param vector - The query vector.
	 * @param k - The number of nearest neighbors to retrieve.
	 * @returns A promise resolving to an array of search results, each containing the original element ID (`id`) and a similarity score (`score`).
	 * @throws {VectorIndexError} If the index is not initialized or if the search operation fails.
	 */
	async search(vector: number[], k: number): Promise<{ id: string; score: number }[]> {
		if (!this.initialized || !this.index) {
			throw new VectorIndexError("VectorIndex is not initialized.")
		}
		if (this.mapping.size === 0) {
			logger.info("Search called on empty index.")
			return []
		}

		logger.info(`Searching for ${k} nearest neighbors...`)

		try {
			// Perform search (adjust k if index size is smaller)
			const actualK = Math.min(k, this.mapping.size)
			// Assuming the underlying library returns { id: number; score: number } or { distance: number; index: number }
			const results: any[] = await this.index.search(vector, actualK)

			logger.debug("Raw search results:", results) // Use debug for potentially large/verbose output

			// Map results back to original IDs
			const mappedResults: { id: string; score: number }[] = []
			for (const result of results) {
				// Adapt based on actual library output structure
				const numericId = result.id ?? result.index ?? -1 // Use nullish coalescing
				const score = result.score ?? result.distance ?? -1 // Use nullish coalescing

				if (numericId !== -1) {
					const elementId = this.mapping.get(numericId)
					if (elementId) {
						mappedResults.push({ id: elementId, score: score })
					} else {
						logger.warn(`Search returned numeric ID ${numericId} not found in mapping.`)
					}
				}
			}

			logger.debug(`Mapped search results:`, mappedResults) // Use debug for potentially large/verbose output
			return mappedResults
		} catch (error: any) {
			// Catch specific error type if possible
			const msg = "Error searching vector index"
			logger.error(msg, error)
			throw new VectorIndexError(msg, error) // Wrap and re-throw
		}
	}

	/**
	 * Removes all embeddings associated with a specific file path from the index and mappings.
	 * Triggers a debounced save of the mapping file.
	 * Note: Actual removal from the underlying index might be skipped if the library doesn't support it (logs a warning).
	 * @param filePath - The absolute path of the file whose embeddings should be removed.
	 * @throws {VectorIndexError} If the index is not initialized or if removing embeddings fails.
	 */
	async removeEmbeddingsByFile(filePath: string): Promise<void> {
		if (!this.initialized || !this.index) {
			throw new VectorIndexError("VectorIndex is not initialized.")
		}
		const ids = this.fileToVectorIds.get(filePath)
		if (!ids || ids.size === 0) {
			logger.info(`No vectors found for file: ${filePath}`)
			return
		}
		try {
			// Remove from index (assume index has a remove method, otherwise this is a placeholder)
			if (typeof this.index.remove === "function") {
				await this.index.remove(Array.from(ids))
			} else {
				logger.warn("Underlying index does not support removal. Skipping index removal.")
			}
			// Remove from mapping and reverse mapping
			for (const id of ids) {
				this.mapping.delete(id)
			}
			this.fileToVectorIds.delete(filePath)
			logger.info(`Removed ${ids.size} vectors for file: ${filePath}`)
			this.debouncedSaveMapping()
		} catch (error: any) {
			// Catch specific error type if possible
			const msg = `Error removing embeddings for file ${filePath}`
			logger.error(msg, error)
			throw new VectorIndexError(msg, error) // Wrap and re-throw
		}
	}

	/**
	 * Disposes of resources held by the VectorIndex.
	 * Cancels any pending debounced saves, attempts to save the current mapping and index state,
	 * and clears internal references.
	 * Called automatically when the extension deactivates if added to `context.subscriptions`.
	 */
	dispose(): void {
		logger.info("Disposing VectorIndex...")
		// Cancel any pending debounced saves
		if (this.debounceTimeout) {
			clearTimeout(this.debounceTimeout)
			this.debounceTimeout = null
		}

		// Ensure final save of mapping and index
		// Run these synchronously if possible during dispose, or handle potential async issues
		// Note: These might still fail if called during shutdown, hence the catch without re-throw
		this.saveMapping().catch((err) => logger.error("Error during dispose saveMapping", err))
		this.saveIndex().catch((err) => logger.error("Error during dispose saveIndex", err))

		// Release index resources if necessary (depends on library)
		this.index = null // Allow garbage collection
		this.mapping.clear()
		this.fileToVectorIds.clear()
		this.initialized = false
		logger.info("VectorIndex disposed.")
	}
}

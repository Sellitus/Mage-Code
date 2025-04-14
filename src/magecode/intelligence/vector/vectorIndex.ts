import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
// import { IndexFlatL2 } from 'faiss-node'; // Placeholder - will uncomment/adjust later
// import { Voy } from 'voy-search'; // Placeholder - will uncomment/adjust later
// import debounce from 'lodash.debounce'; // Placeholder - will add if needed

// Define interfaces or types if needed (e.g., for mapping)
type VectorMapping = Map<number, string>

export class VectorIndex implements vscode.Disposable {
	private index: any // Will hold FAISS or Voy instance
	private mapping: VectorMapping = new Map()
	private fileToVectorIds: Map<string, Set<number>> = new Map()
	private workspacePath: string | undefined
	private vectorDirPath: string | undefined
	private mappingPath: string | undefined
	private indexSavePath: string | undefined
	private initialized: boolean = false
	private debouncedSaveMapping: () => void = () => {} // Placeholder

	constructor() {
		// Determine workspace path immediately
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (workspaceFolders && workspaceFolders.length > 0) {
			this.workspacePath = workspaceFolders[0].uri.fsPath
			this.vectorDirPath = path.join(this.workspacePath, ".magecode", "vectors")
			this.mappingPath = path.join(this.vectorDirPath, "mapping.json")
			// Index path depends on platform, set in initialize
		} else {
			console.error("MageCode: No workspace folder found. VectorIndex cannot initialize.")
			// Handle error appropriately - maybe throw or set an error state
		}

		// Initialize debounced function (example using a simple timeout)
		// Replace with lodash.debounce if added as dependency
		let debounceTimeout: NodeJS.Timeout | null = null
		this.debouncedSaveMapping = () => {
			if (debounceTimeout) clearTimeout(debounceTimeout)
			debounceTimeout = setTimeout(() => {
				this.saveMapping().catch((err) => console.error("Error saving mapping:", err))
			}, 1000) // Save after 1 second of inactivity
		}
	}

	async initialize(context: vscode.ExtensionContext): Promise<void> {
		if (!this.vectorDirPath || !this.mappingPath || !this.workspacePath) {
			throw new Error("VectorIndex cannot initialize without a workspace path.")
		}
		if (this.initialized) {
			console.warn("VectorIndex already initialized.")
			return
		}

		console.log("Initializing VectorIndex...")

		try {
			// 1. Create directory
			await fs.mkdir(this.vectorDirPath, { recursive: true })
			console.log(`Vector directory ensured at: ${this.vectorDirPath}`)

			// 2. Load mapping
			await this.loadMapping()

			// 3. Initialize index based on platform
			const platform = process.platform
			if (platform === "win32" || platform === "darwin") {
				this.indexSavePath = path.join(this.vectorDirPath, "index.faiss")
				await this.initializeFaiss()
			} else {
				this.indexSavePath = path.join(this.vectorDirPath, "index.voy")
				await this.initializeVoy()
			}

			this.initialized = true
			context.subscriptions.push(this) // Register for disposal
			console.log("VectorIndex initialized successfully.")
		} catch (error) {
			console.error("Failed to initialize VectorIndex:", error)
			vscode.window.showErrorMessage(
				`MageCode: Failed to initialize Vector Index. ${error instanceof Error ? error.message : error}`,
			)
			// Decide if we should throw or allow graceful degradation
			throw error // Re-throw for now
		}
	}

	private async initializeFaiss(): Promise<void> {
		// Placeholder for FAISS initialization logic
		console.log(`Initializing FAISS index. Path: ${this.indexSavePath}`)
		// const { IndexFlatL2 } = await import('faiss-node'); // Dynamic import if needed
		// try {
		//     this.index = IndexFlatL2.read(this.indexSavePath);
		//     console.log(`Loaded existing FAISS index from ${this.indexSavePath}`);
		// } catch (error) {
		//     console.log(`No existing FAISS index found or error loading, creating new one. Error: ${error}`);
		//     const dimensions = 384; // Example dimension - should come from config or embedding model
		//     this.index = new IndexFlatL2(dimensions);
		// }
		// Mock implementation for now
		this.index = {
			add: async (vectors: number[][], ids: number[]) => {
				console.log(`FAISS Mock: Adding ${vectors.length} vectors.`)
			},
			search: async (vector: number[], k: number) => {
				console.log(`FAISS Mock: Searching for ${k} nearest neighbors.`)
				return []
			},
			write: async (path: string) => {
				console.log(`FAISS Mock: Writing index to ${path}`)
			},
			ntotal: () => this.mapping.size, // Simulate total vectors
		}
		await Promise.resolve() // Simulate async operation
	}

	private async initializeVoy(): Promise<void> {
		// Placeholder for Voy initialization logic
		console.log(`Initializing Voy index. Path: ${this.indexSavePath}`)
		// const { Voy } = await import('voy-search'); // Dynamic import if needed
		// try {
		//     const buffer = await fs.readFile(this.indexSavePath);
		//     this.index = Voy.deserialize(buffer);
		//     console.log(`Loaded existing Voy index from ${this.indexSavePath}`);
		// } catch (error) {
		//     console.log(`No existing Voy index found or error loading, creating new one. Error: ${error}`);
		//     this.index = new Voy(); // Default config
		// }
		// Mock implementation for now
		this.index = {
			add: async (vectors: number[][], ids: number[]) => {
				console.log(`Voy Mock: Adding ${vectors.length} vectors.`)
			},
			search: async (vector: number[], k: number) => {
				console.log(`Voy Mock: Searching for ${k} nearest neighbors.`)
				return []
			},
			serialize: async () => {
				console.log(`Voy Mock: Serializing index.`)
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
				console.log(
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
				this.mapping = new Map(parsed as [number, string][])
				this.fileToVectorIds = new Map()
				console.log(`Loaded mapping for ${this.mapping.size} vectors from ${this.mappingPath}`)
			} else {
				console.warn(`Invalid mapping format found in ${this.mappingPath}. Initializing empty mapping.`)
				this.mapping = new Map()
				this.fileToVectorIds = new Map()
			}
		} catch (error: any) {
			if (error.code === "ENOENT") {
				console.log(`Mapping file not found at ${this.mappingPath}. Initializing empty mapping.`)
				this.mapping = new Map()
				this.fileToVectorIds = new Map()
			} else {
				console.error(`Error loading mapping from ${this.mappingPath}:`, error)
				this.mapping = new Map()
				this.fileToVectorIds = new Map()
			}
		}
	}

	private async saveMapping(): Promise<void> {
		if (!this.mappingPath || !this.initialized) return // Don't save if not initialized
		if (process.env.NODE_ENV !== "test") {
			console.log(`Saving mapping for ${this.mapping.size} vectors to ${this.mappingPath}...`)
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
				console.log("Mapping saved successfully.")
			}
		} catch (error) {
			if (process.env.NODE_ENV !== "test") {
				console.error(`Error saving mapping to ${this.mappingPath}:`, error)
			}
			// Consider notifying the user or implementing retry logic
		}
	}

	private async saveIndex(): Promise<void> {
		if (!this.index || !this.indexSavePath || !this.initialized) return
		console.log(`Saving vector index to ${this.indexSavePath}...`)
		try {
			const platform = process.platform
			if (platform === "win32" || platform === "darwin") {
				// FAISS save
				if (typeof this.index.write === "function") {
					await this.index.write(this.indexSavePath)
				} else {
					console.warn("FAISS index object does not have a 'write' method.")
				}
			} else {
				// Voy save
				if (typeof this.index.serialize === "function") {
					const buffer = await this.index.serialize()
					await fs.writeFile(this.indexSavePath, buffer)
				} else {
					console.warn("Voy index object does not have a 'serialize' method.")
				}
			}
			console.log("Vector index saved successfully.")
		} catch (error) {
			console.error(`Error saving vector index to ${this.indexSavePath}:`, error)
		}
	}

	async addEmbeddings(embeddings: { id: string; vector: number[]; filePath?: string }[]): Promise<void> {
		if (!this.initialized || !this.index) {
			throw new Error("VectorIndex is not initialized.")
		}
		if (embeddings.length === 0) {
			return
		}

		console.log(`Adding ${embeddings.length} embeddings...`)

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

			console.log(
				`Added ${embeddings.length} embeddings. Total vectors: ${this.mapping.size}. Updated fileToVectorIds for ${fileToIds.size} files.`,
			)

			// Trigger debounced save for the mapping
			this.debouncedSaveMapping()
		} catch (error) {
			console.error("Error adding embeddings to vector index:", error)
			throw error // Re-throw
		}
	}

	async search(vector: number[], k: number): Promise<{ id: string; score: number }[]> {
		if (!this.initialized || !this.index) {
			throw new Error("VectorIndex is not initialized.")
		}
		if (this.mapping.size === 0) {
			console.log("Search called on empty index.")
			return []
		}

		console.log(`Searching for ${k} nearest neighbors...`)

		try {
			// Perform search (adjust k if index size is smaller)
			const actualK = Math.min(k, this.mapping.size)
			const results: { id: number; score: number }[] | { distance: number; index: number }[] =
				await this.index.search(vector, actualK)

			console.log("Raw search results:", results)

			// Map results back to original IDs
			const mappedResults: { id: string; score: number }[] = []
			for (const result of results) {
				// Adapt based on actual library output structure
				const numericId = "id" in result ? result.id : "index" in result ? result.index : -1 // Adapt based on FAISS/Voy output
				const score = "score" in result ? result.score : "distance" in result ? result.distance : -1 // Adapt based on FAISS/Voy output

				if (numericId !== -1) {
					const elementId = this.mapping.get(numericId)
					if (elementId) {
						mappedResults.push({ id: elementId, score: score })
					} else {
						console.warn(`Search returned numeric ID ${numericId} not found in mapping.`)
					}
				}
			}

			console.log(`Mapped search results:`, mappedResults)
			return mappedResults
		} catch (error) {
			console.error("Error searching vector index:", error)
			throw error // Re-throw
		}
	}

	async removeEmbeddingsByFile(filePath: string): Promise<void> {
		if (!this.initialized || !this.index) {
			throw new Error("VectorIndex is not initialized.")
		}
		const ids = this.fileToVectorIds.get(filePath)
		if (!ids || ids.size === 0) {
			console.log(`No vectors found for file: ${filePath}`)
			return
		}
		// Remove from index (assume index has a remove method, otherwise this is a placeholder)
		if (typeof this.index.remove === "function") {
			await this.index.remove(Array.from(ids))
		} else {
			console.warn("Underlying index does not support removal. Skipping index removal.")
		}
		// Remove from mapping and reverse mapping
		for (const id of ids) {
			this.mapping.delete(id)
		}
		this.fileToVectorIds.delete(filePath)
		console.log(`Removed ${ids.size} vectors for file: ${filePath}`)
		this.debouncedSaveMapping()
	}

	dispose(): void {
		console.log("Disposing VectorIndex...")
		// Cancel any pending debounced saves
		// If using lodash: this.debouncedSaveMapping.cancel();
		// If using simple timeout: clearTimeout(debounceTimeout); // Need access to the timeout variable

		// Ensure final save of mapping and index
		// Run these synchronously if possible during dispose, or handle potential async issues
		this.saveMapping().catch((err) => console.error("Error during dispose saveMapping:", err))
		this.saveIndex().catch((err) => console.error("Error during dispose saveIndex:", err))

		// Release index resources if necessary (depends on library)
		this.index = null // Allow garbage collection
		this.mapping.clear()
		this.fileToVectorIds.clear()
		this.initialized = false
		console.log("VectorIndex disposed.")
	}
}

import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
// import PQueue from "p-queue" // Changed to dynamic import
import Piscina from "piscina"
import debounce from "lodash.debounce"
import ignore from "ignore"
// import { globby } from "globby" // Changed to dynamic import

import { DatabaseManager } from "../storage/databaseManager"
import { VectorIndex } from "../vector/vectorIndex"
import { EmbeddingService } from "../embedding/embeddingService"
import { MultiModelOrchestrator } from "../../orchestration" // Added import
import { ResourceGovernor, ResourceGovernorConfig } from "../../utils/resourceGovernor" // Corrected path
import { logger } from "../../utils/logging" // Corrected relative path relative to magecode/utils
import { sleep } from "../../../utils/sleep" // Correct path relative to src/utils
import { CodeElement } from "../../interfaces" // Import CodeElement type

// Interface for results coming back from the worker
interface SyncWorkerResult {
	filePath: string
	elements: CodeElement[] // Use imported CodeElement type
	relations: any[] // TODO: Define ElementRelation type if needed
	embeddings: { elementId: string; vector: number[] }[] // Worker returns elementId
	errors: { message: string; stack?: string }[] // Use serializable error format
}

export type SyncTask = { type: "add" | "update" | "delete"; path: string }

export interface SyncServiceOptions {
	workspaceFolders: readonly vscode.WorkspaceFolder[]
	filePatterns: string[] // Glob patterns for files to watch/index
	ignorePatterns?: string[] // Additional patterns to ignore
	debounceMs?: number
	governorConfig?: ResourceGovernorConfig
}

/**
 * Manages the synchronization of workspace files with the MageCode intelligence stores (database, vector index).
 * It performs an initial scan, watches for file changes, debounces events, uses a worker pool
 * for processing (parsing, embedding), and updates the stores accordingly.
 * Implements vscode.Disposable to clean up watchers and worker pools.
 */
export class SyncService implements vscode.Disposable {
	private readonly dbManager: DatabaseManager
	private readonly vectorIndex: VectorIndex
	private readonly options: SyncServiceOptions
	private readonly embeddingService: EmbeddingService
	private readonly mmo: MultiModelOrchestrator // Added member
	private readonly governor: ResourceGovernor
	private readonly workerPool: Piscina
	private queue: any // Type adjusted for dynamic import
	private watcher: vscode.FileSystemWatcher | undefined
	private ig: ignore.Ignore // For handling .gitignore and custom ignores
	private disposed = false
	private pendingTasks: Map<string, SyncTask> = new Map()
	private processPendingTasksDebounced: () => void

	/**
	 * Creates an instance of SyncService.
	 * @param dbManager - Instance of DatabaseManager.
	 * @param vectorIndex - Instance of VectorIndex.
	 * @param embeddingService - Instance of EmbeddingService.
	 * @param mmo - Instance of MultiModelOrchestrator (used for cache clearing).
	 * @param options - Configuration options for the sync service.
	 */
	constructor(
		dbManager: DatabaseManager,
		vectorIndex: VectorIndex,
		embeddingService: EmbeddingService,
		mmo: MultiModelOrchestrator, // Added parameter
		options: SyncServiceOptions,
	) {
		this.dbManager = dbManager
		this.vectorIndex = vectorIndex
		this.embeddingService = embeddingService
		this.mmo = mmo // Store instance
		this.options = options

		// Initialize Resource Governor
		this.governor = new ResourceGovernor(options.governorConfig)

		// Initialize Piscina Worker Pool
		const baselineConcurrency = this.governor.getBaselineConcurrency()
		const minConcurrency = this.governor.getMinConcurrency()
		this.workerPool = new Piscina({
			filename: path.resolve(__dirname, "syncWorker.js"), // Path to the compiled worker script
			minThreads: minConcurrency,
			maxThreads: baselineConcurrency,
			idleTimeout: 60000, // Shut down idle workers after 60 seconds
		})
		logger.info(`[SyncService] Worker pool initialized (Min: ${minConcurrency}, Max: ${baselineConcurrency})`)

		// PQueue will be initialized dynamically in initialize()
		// this.queue = new PQueue({ concurrency: 1 }) // Process one task check at a time

		// Initialize ignore instance
		this.ig = ignore()
		if (options.ignorePatterns) {
			this.ig.add(options.ignorePatterns)
		}

		// Debounce processing function
		this.processPendingTasksDebounced = debounce(() => this.processPendingTasks(), options.debounceMs || 500, {
			leading: false,
			trailing: true,
		})
	}

	/**
	 * Initializes the SyncService. This includes:
	 * - Loading ignore rules (.gitignore and custom).
	 * - Performing an initial scan of the workspace to identify files for processing.
	 * - Setting up the file system watcher to monitor subsequent changes.
	 * @returns A promise that resolves when initialization is complete.
	 */
	async initialize(): Promise<void> {
		logger.info("[SyncService] Initializing...")

		// Initialize PQueue dynamically
		const { default: PQueue } = await import("p-queue")
		this.queue = new PQueue({ concurrency: 1 })

		await this.loadIgnoreRules()

		// Initial Scan
		await this.initialScan()

		// Setup File Watcher
		this.setupWatcher()
		logger.info("[SyncService] Initialization complete.")
	}

	/**
	 * Loads .gitignore content from workspace folders.
	 */
	private async loadIgnoreRules(): Promise<void> {
		for (const folder of this.options.workspaceFolders) {
			const gitignorePath = path.join(folder.uri.fsPath, ".gitignore")
			try {
				const content = await fs.readFile(gitignorePath, "utf8")
				this.ig.add(content)
				logger.info(`[SyncService] Loaded .gitignore from ${folder.name}`)
			} catch (error: any) {
				if (error.code !== "ENOENT") {
					logger.warn(`[SyncService] Error reading .gitignore in ${folder.name}:`, error)
				}
			}
		}
	}

	/**
	 * Performs an initial scan of the workspace based on filePatterns.
	 */
	private async initialScan(): Promise<void> {
		logger.info("[SyncService] Starting initial workspace scan...")
		const { globby } = await import("globby") // Dynamic import
		let count = 0
		for (const folder of this.options.workspaceFolders) {
			const files = await globby(this.options.filePatterns, {
				cwd: folder.uri.fsPath,
				absolute: true,
				ignore: ["**/node_modules/**", "**/.git/**"], // Basic ignores
				gitignore: false, // We handle gitignore manually with `this.ig`
				dot: true,
			})

			for (const filePath of files) {
				const relativePath = path.relative(folder.uri.fsPath, filePath)
				// Check against combined ignore rules
				if (!this.ig.ignores(relativePath)) {
					this.addOrUpdatePendingTask({ type: "add", path: filePath })
					count++
				}
			}
		}
		logger.info(`[SyncService] Initial scan found ${count} files to process.`)
		// Trigger processing immediately after scan
		this.processPendingTasksDebounced()
	}

	/**
	 * Sets up the file system watcher.
	 */
	private setupWatcher(): void {
		// Create a unified glob pattern for the watcher
		// Note: Watcher operates on workspace level, patterns need careful construction
		// For simplicity, using a broad pattern and filtering later might be easier
		const pattern = "**/*" // Watch everything initially, filter later
		logger.info(`[SyncService] Setting up file watcher with pattern: ${pattern}`)
		this.watcher = vscode.workspace.createFileSystemWatcher(pattern, false, false, false)

		this.watcher.onDidChange((uri) => this.handleFileChange(uri, "update"))
		this.watcher.onDidCreate((uri) => this.handleFileChange(uri, "add"))
		this.watcher.onDidDelete((uri) => this.handleFileChange(uri, "delete"))
	}

	/**
	 * Handles file change events from the watcher.
	 */
	private handleFileChange(uri: vscode.Uri, type: "add" | "update" | "delete"): void {
		if (this.disposed) return
		const filePath = uri.fsPath

		// Determine relative path for ignore check
		let relativePath = filePath
		for (const folder of this.options.workspaceFolders) {
			if (filePath.startsWith(folder.uri.fsPath)) {
				relativePath = path.relative(folder.uri.fsPath, filePath)
				break
			}
		}

		// Check if the file should be ignored or doesn't match patterns (for non-delete)
		// TODO: Re-evaluate pattern matching here if watcher pattern is broad
		if (this.ig.ignores(relativePath)) {
			// logger.debug(`[SyncService] Ignoring change for ${filePath}`);
			return
		}

		logger.debug(`[SyncService] File change detected (${type}): ${filePath}`)
		this.addOrUpdatePendingTask({ type, path: filePath })
	}

	/**
	 * Adds or updates a task in the pending map and triggers debounced processing.
	 */
	private addOrUpdatePendingTask(task: SyncTask): void {
		const existing = this.pendingTasks.get(task.path)
		// Prioritize 'delete' > 'add' > 'update'
		if (task.type === "delete") {
			this.pendingTasks.set(task.path, task)
		} else if (task.type === "add" && (!existing || existing.type === "delete")) {
			this.pendingTasks.set(task.path, task)
		} else if (task.type === "update" && !existing) {
			// If file doesn't exist in pending, treat update as add
			this.pendingTasks.set(task.path, { ...task, type: "add" })
		} else if (task.type === "update" && existing && existing.type !== "delete") {
			// Keep existing add or update
		}
		this.processPendingTasksDebounced()
	}

	/**
	 * Processes all tasks currently in the pending map.
	 */
	private async processPendingTasks(): Promise<void> {
		if (this.disposed || this.pendingTasks.size === 0) {
			return
		}

		const tasksToProcess = Array.from(this.pendingTasks.values())
		this.pendingTasks.clear() // Clear pending tasks before adding to queue

		logger.info(`[SyncService] Processing ${tasksToProcess.length} pending tasks...`)

		for (const task of tasksToProcess) {
			this.queue.add(() => this.dispatchTask(task))
		}
	}

	/**
	 * Dispatches a single task: handles deletion or sends to worker pool.
	 */
	private async dispatchTask(task: SyncTask): Promise<void> {
		if (this.disposed) return

		// Clear relevant caches before processing
		try {
			this.embeddingService.clearCacheForFile(task.path) // Clears embedding cache (currently full clear)
			this.mmo.clearCache() // Clears MMO cache
			// TODO: Add relevancy cache clearing here when implemented
			logger.debug(`[SyncService] Cleared caches for file change: ${task.path}`)
		} catch (error) {
			logger.error(`[SyncService] Error clearing caches for ${task.path}`, error) // Removed colon
		}

		if (task.type === "delete") {
			logger.info(`[SyncService] Deleting data for: ${task.path}`)
			try {
				this.dbManager.deleteCodeElementsByFilePath(task.path) // Use the correct synchronous method
				await this.vectorIndex.removeEmbeddingsByFile(task.path) // Use existing method
				logger.info(`[SyncService] Successfully deleted data for: ${task.path}`) // Add success log
			} catch (error) {
				logger.error(`[SyncService] Error deleting data for ${task.path}`, error) // Removed colon
			}
			return
		}

		// Log start of processing for add/update
		logger.info(`[SyncService] Starting processing for (${task.type}): ${task.path}`)

		// Wait if system is under load
		while (!this.governor.canDispatchTask()) {
			if (this.disposed) return
			logger.debug("[SyncService] Governor indicates high load, waiting...")
			await sleep(1000) // Wait 1 second before checking again
		}

		logger.debug(`[SyncService] Dispatching task to worker pool: ${task.path}`)
		try {
			const result: SyncWorkerResult = await this.workerPool.run({ filePath: task.path })
			logger.debug(`[SyncService] Received results from worker for: ${result.filePath}`)

			if (result.errors.length > 0) {
				// Format errors for logger metadata
				const errorMeta = { workerErrors: result.errors.map((e) => e.message || String(e)) }
				logger.warn(`[SyncService] Worker reported errors for ${result.filePath}`, errorMeta)
			}

			// Update Database and Vector Index (on main thread)
			try {
				logger.debug(`[SyncService] Updating database for: ${result.filePath}`)
				// Assuming storeCodeElements handles upsert based on element ID
				this.dbManager.storeCodeElements(result.elements)
				// TODO: Handle relations if necessary: await this.dbManager.storeElementRelations(result.relations);

				if (result.embeddings.length > 0) {
					logger.debug(`[SyncService] Updating vector index for: ${result.filePath}`)
					// Map worker embedding format to vectorIndex format
					const embeddingsToAdd = result.embeddings.map((emb) => ({
						id: emb.elementId, // Map elementId to id
						vector: emb.vector,
						filePath: result.filePath, // Add filePath from the result context
					}))
					await this.vectorIndex.addEmbeddings(embeddingsToAdd)
				} else {
					logger.debug(`[SyncService] No embeddings returned from worker for: ${result.filePath}`)
				}

				logger.info(`[SyncService] Successfully updated data for: ${result.filePath}`)
			} catch (updateError) {
				logger.error(`[SyncService] Error updating DB/VectorIndex for ${result.filePath}`, updateError)
				// Decide if this error should halt further processing or just be logged
			}
		} catch (error) {
			logger.error(`[SyncService] Error processing task for ${task.path} in worker pool`, error)
		}
	}

	/**
	 * Disposes of resources used by the SyncService. This includes:
	 * - Stopping the file system watcher.
	 * - Stopping the resource governor's monitoring interval.
	 * - Clearing the task queue and pending tasks.
	 * - Destroying the worker pool.
	 */
	dispose() {
		if (this.disposed) return
		this.disposed = true
		logger.info("[SyncService] Disposing...")

		if (this.watcher) {
			this.watcher.dispose()
			logger.debug("[SyncService] File watcher disposed.")
		}
		this.governor.dispose() // Stops monitoring interval
		logger.debug("[SyncService] Resource governor disposed.")

		this.queue.clear()
		this.pendingTasks.clear()
		logger.debug("[SyncService] Task queue cleared.")

		// Gracefully destroy the worker pool
		this.workerPool
			.destroy()
			.then(() => logger.info("[SyncService] Worker pool destroyed."))
			.catch((err) => logger.error("[SyncService] Error destroying worker pool:", err))
	}
}

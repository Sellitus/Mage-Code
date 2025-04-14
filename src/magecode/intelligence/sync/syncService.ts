// LCIE SyncService: Watches files, queues changes, and runs the code intelligence pipeline.
// This is a scaffold for the full implementation.

import * as vscode from "vscode"
import PQueue from "p-queue"
import debounce from "lodash.debounce"
import ignore from "ignore"
import { MageParser } from "../parser"
import { DatabaseManager } from "../storage/databaseManager"
import { VectorIndex } from "../vector/vectorIndex"
import { EmbeddingService } from "../embedding/embeddingService"

export type SyncTask = { type: "add" | "update" | "delete"; path: string }

export interface SyncServiceOptions {
	filePatterns: string[]
	debounceMs?: number
	queueConcurrency?: number
}

export class SyncService implements vscode.Disposable {
	private parser: MageParser
	private dbManager: DatabaseManager
	private vectorIndex: VectorIndex
	private embeddingService: EmbeddingService
	private options: SyncServiceOptions
	private queue: PQueue
	private watcher: vscode.FileSystemWatcher | undefined
	private ig: ignore.Ignore
	private isProcessing = false
	private disposed = false
	private pendingTasks: Map<string, SyncTask> = new Map()

	constructor(
		parser: MageParser,
		dbManager: DatabaseManager,
		vectorIndex: VectorIndex,
		embeddingService: EmbeddingService,
		options: SyncServiceOptions,
	) {
		this.parser = parser
		this.dbManager = dbManager
		this.vectorIndex = vectorIndex
		this.embeddingService = embeddingService
		this.options = options
		this.queue = new PQueue({ concurrency: options.queueConcurrency || 2 })
		this.ig = ignore()
	}

	async initialize(context: vscode.ExtensionContext) {
		// TODO: Load .gitignore and set up ignore rules
		// TODO: Set up file watcher for options.filePatterns
		// TODO: Initial scan and queue all relevant files
		// TODO: Start processing loop
	}

	dispose() {
		this.disposed = true
		if (this.watcher) {
			this.watcher.dispose()
		}
		this.queue.clear()
	}
}

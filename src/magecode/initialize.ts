import * as vscode from "vscode"
import { registerModeChangeListener } from "./config/settings"
import { DatabaseManager } from "./intelligence/storage/databaseManager"
import { EmbeddingService } from "./intelligence/embedding/embeddingService"

export async function initializeMageCode(context: vscode.ExtensionContext) {
	// Register mode change listener for dynamic switching
	registerModeChangeListener(context)

	// Placeholder: Initialize other MageCode services here

	// Initialize DatabaseManager
	const databaseManager = new DatabaseManager()
	try {
		databaseManager.initialize() // Initialize is synchronous
		context.subscriptions.push(databaseManager)
		console.log("DatabaseManager initialized successfully.")
	} catch (error) {
		console.error("Failed to initialize DatabaseManager:", error)
		vscode.window.showErrorMessage("MageCode: Failed to initialize database. Some features might be unavailable.")
		// Depending on requirements, might want to prevent further MageCode initialization

		// Initialize VectorIndex
		const { VectorIndex } = await import("./intelligence/vector/vectorIndex")
		const vectorIndex = new VectorIndex()
		try {
			await vectorIndex.initialize(context)
			context.subscriptions.push(vectorIndex)
			console.log("VectorIndex initialized successfully.")
		} catch (error) {
			console.error("Failed to initialize VectorIndex:", error)
			vscode.window.showErrorMessage(
				"MageCode: Failed to initialize vector index. Semantic search may be unavailable.",
			)
			// Depending on requirements, might want to prevent further MageCode initialization
		}

		// Initialize EmbeddingService
		const embeddingService = EmbeddingService.getInstance()
		try {
			await embeddingService.initialize()
			console.log("EmbeddingService initialized successfully.")
		} catch (error) {
			console.error("Failed to initialize EmbeddingService:", error)
			vscode.window.showErrorMessage(
				"MageCode: Failed to initialize embedding service. Embedding features may be unavailable.",
			)
		}
	}

	// Placeholder: Register MageCode-specific commands and tools
	registerMageCodeCommands(context)
	registerMageCodeTools(context)

	console.log("MageCode mode initialized successfully")
}

// Placeholder functions for future implementation
export function registerMageCodeCommands(context: vscode.ExtensionContext) {
	// To be implemented
}

export function registerMageCodeTools(context: vscode.ExtensionContext) {
	// To be implemented
}

import * as vscode from "vscode"
import { registerModeChangeListener } from "./config/settings"
import { DatabaseManager } from "./intelligence/storage/databaseManager"

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

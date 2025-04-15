import * as vscode from "vscode"
import { MageCodeSettingsView } from "./settings/settingsViewProvider" // Added import
import { registerModeChangeListener } from "./config/settings"
import { FileReader } from "./tools/fileReader" // Added import
import { ToolRegistry } from "./tools/toolRegistry" // Added import
import { DatabaseManager } from "./intelligence/storage/databaseManager"
import { EmbeddingService } from "./intelligence/embedding/embeddingService"
import { CloudModelTier } from "./orchestration/tiers/cloudModelTier"
import { LocalModelTier } from "./orchestration/tiers/localModelTier"
import { MultiModelOrchestrator } from "./orchestration"
import { ModelRouter } from "./orchestration/router" // Added import
import { PromptService } from "./orchestration/prompt/promptService" // Added import
import { buildApiHandler, SingleCompletionHandler } from "../api"
import { ApiConfiguration } from "../shared/api"

export async function initializeMageCode(context: vscode.ExtensionContext) {
	// Register mode change listener for dynamic switching
	registerModeChangeListener(context)

	// Initialize DatabaseManager
	const databaseManager = new DatabaseManager()
	try {
		databaseManager.initialize() // Initialize is synchronous
		context.subscriptions.push(databaseManager)
		console.log("DatabaseManager initialized successfully.")
	} catch (error) {
		console.error("Failed to initialize DatabaseManager:", error)
		vscode.window.showErrorMessage("MageCode: Failed to initialize database. Some features might be unavailable.")
	}

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

	// Initialize LLM Services
	try {
		// Create ApiHandler (llm service)
		const config: ApiConfiguration = {
			apiProvider: "anthropic", // Default provider, should be configurable
			// Add other necessary configuration
		}
		const llmService = buildApiHandler(config)

		// Check if the service implements required interface
		if (!("completePrompt" in llmService)) {
			throw new Error("LLM service does not implement required SingleCompletionHandler interface")
		}

		// Initialize Cloud Tier
		const cloudTier = new CloudModelTier(llmService as SingleCompletionHandler & typeof llmService)

		// Initialize Local Tier
		const localTier = new LocalModelTier()
		try {
			await localTier.initialize(context.extensionPath)
			console.log("LocalModelTier initialized successfully.")
		} catch (error) {
			console.warn("Failed to initialize LocalModelTier:", error)
			vscode.window.showWarningMessage(
				"MageCode: Local model initialization failed. Falling back to cloud-only mode.",
			)
		}

		// Initialize Router and Prompt Service
		const modelRouter = new ModelRouter()
		const promptService = new PromptService()

		// Initialize Orchestrator with tiers, router, and prompt service
		const orchestrator = new MultiModelOrchestrator(cloudTier, localTier, modelRouter, promptService)
		context.subscriptions.push({
			dispose: () => {
				// Add cleanup if needed
			},
		})
		console.log("LLM Orchestrator initialized successfully.")
	} catch (error) {
		console.error("Failed to initialize LLM services:", error)
		vscode.window.showErrorMessage(
			"MageCode: Failed to initialize LLM services. Language model features may be unavailable.",
		)
	}

	// Register MageCode-specific commands and tools
	registerMageCodeCommands(context)
	registerMageCodeTools(context)

	console.log("MageCode mode initialized successfully")
}

// Placeholder functions for future implementation
export function registerMageCodeCommands(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand("magecode.showSettings", () => {
			// Create and show a new webview panel
			new MageCodeSettingsView(context.extensionUri)
		}),
	)
	console.log("MageCode commands registered.")
}

export function registerMageCodeTools(context: vscode.ExtensionContext) {
	// Instantiate the Tool Registry
	const toolRegistry = new ToolRegistry() // TODO: Make this instance accessible (e.g., return, export, singleton)

	// Instantiate and register tools
	const fileReader = new FileReader()
	toolRegistry.registerTool(fileReader)

	console.log("MageCode tools registered.")
	// Future tools will be registered here
}

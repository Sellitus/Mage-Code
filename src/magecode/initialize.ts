import * as vscode from "vscode"
import { MageCodeSettingsView } from "./settings/settingsViewProvider" // Added import
import { registerModeChangeListener } from "./config/settings"
import { FileReader } from "./tools/fileReader" // Added import
import { ToolRegistry } from "./tools/toolRegistry" // Added import
import { DatabaseManager } from "./intelligence/storage/databaseManager"
import { VectorIndex } from "./intelligence/vector/vectorIndex"
import { EmbeddingService } from "./intelligence/embedding/embeddingService"
import { CloudModelTier } from "./orchestration/tiers/cloudModelTier"
import { LocalModelTier } from "./orchestration/tiers/localModelTier"
import { MultiModelOrchestrator } from "./orchestration"
import { ModelRouter } from "./orchestration/router" // Added import
import { PromptService } from "./orchestration/prompt/promptService" // Added import
import { buildApiHandler, SingleCompletionHandler } from "../api"
import { ApiConfiguration } from "../shared/api"
import { logger } from "./utils/logging" // Import the logger
import { SyncService, SyncServiceOptions } from "./intelligence/sync/syncService" // Import SyncService
import { ResourceGovernor, ResourceGovernorConfig } from "./utils/resourceGovernor" // Import ResourceGovernor

export async function initializeMageCode(context: vscode.ExtensionContext) {
	// Register mode change listener for dynamic switching
	registerModeChangeListener(context)

	// Register logger disposal
	context.subscriptions.push(logger)

	// Initialize DatabaseManager
	const databaseManager = new DatabaseManager()
	try {
		databaseManager.initialize() // Initialize is synchronous
		context.subscriptions.push(databaseManager)
		logger.info("DatabaseManager initialized successfully.")
	} catch (error) {
		logger.error("Failed to initialize DatabaseManager", error)
		vscode.window.showErrorMessage("MageCode: Failed to initialize database. Some features might be unavailable.")
	}

	// Initialize VectorIndex
	const vectorIndex = new VectorIndex()
	try {
		await vectorIndex.initialize(context)
		context.subscriptions.push(vectorIndex)
		logger.info("VectorIndex initialized successfully.")
	} catch (error) {
		logger.error("Failed to initialize VectorIndex", error)
		vscode.window.showErrorMessage(
			"MageCode: Failed to initialize vector index. Semantic search may be unavailable.",
		)
	}

	// Initialize EmbeddingService
	const embeddingService = EmbeddingService.getInstance()
	try {
		await embeddingService.initialize()
		logger.info("EmbeddingService initialized successfully.")
	} catch (error) {
		logger.error("Failed to initialize EmbeddingService", error)
		vscode.window.showErrorMessage(
			"MageCode: Failed to initialize embedding service. Embedding features may be unavailable.",
		)
	}

	// Initialize LLM Services (needs orchestrator for SyncService)
	let orchestrator: MultiModelOrchestrator | undefined
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
			context.subscriptions.push(localTier) // Add localTier to subscriptions
			logger.info("LocalModelTier initialized successfully.")
		} catch (error) {
			logger.warn("Failed to initialize LocalModelTier", error)
			vscode.window.showWarningMessage(
				"MageCode: Local model initialization failed. Falling back to cloud-only mode.",
			)
		}

		// Initialize Router and Prompt Service
		const modelRouter = new ModelRouter()
		const promptService = new PromptService()

		// Initialize Orchestrator with tiers, router, and prompt service
		orchestrator = new MultiModelOrchestrator(cloudTier, localTier, modelRouter, promptService)
		// Note: Orchestrator itself doesn't seem disposable, but we add a placeholder subscription
		context.subscriptions.push({
			dispose: () => {
				logger.info("Disposing LLM Orchestrator related resources (if any).")
				// Add cleanup if needed
			},
		})
		logger.info("LLM Orchestrator initialized successfully.")
	} catch (error) {
		logger.error("Failed to initialize LLM services", error)
		vscode.window.showErrorMessage(
			"MageCode: Failed to initialize LLM services. Language model features may be unavailable.",
		)
		// If LLM services fail, orchestrator might be undefined. Handle this for SyncService.
	}

	// Initialize Resource Governor
	// TODO: Make governor config configurable via settings?
	// Using defaults defined within ResourceGovernor for now, but passing interval.
	const governorConfig: ResourceGovernorConfig = {
		checkIntervalMs: 5000, // Example interval
		// highLoadMarkRatio: 1.0, // Default in ResourceGovernor
		// maxMemoryMb: 1024,      // Default in ResourceGovernor
	}
	const resourceGovernor = new ResourceGovernor(governorConfig)
	context.subscriptions.push(resourceGovernor) // Add governor to subscriptions for its internal interval cleanup
	logger.info("ResourceGovernor initialized.")

	// Initialize SyncService (requires dependencies initialized above)
	if (databaseManager && vectorIndex && embeddingService && orchestrator && vscode.workspace.workspaceFolders) {
		const syncOptions: SyncServiceOptions = {
			workspaceFolders: vscode.workspace.workspaceFolders,
			// TODO: Make file patterns configurable?
			filePatterns: ["**/*.{ts,js,py,md,json,java,go,rb,php,cs,cpp,c,h,hpp,html,css,scss,less}"], // Example patterns
			ignorePatterns: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/out/**", "**/build/**"], // Example ignores
			debounceMs: 1000, // Example debounce time
			governorConfig: governorConfig, // Pass governor config
		}
		const syncService = new SyncService(
			databaseManager,
			vectorIndex,
			embeddingService,
			orchestrator, // Pass the initialized orchestrator
			syncOptions,
		)
		try {
			await syncService.initialize()
			context.subscriptions.push(syncService) // Add SyncService itself for disposal
			logger.info("SyncService initialized successfully.")
		} catch (error) {
			logger.error("Failed to initialize SyncService", error)
			vscode.window.showErrorMessage("MageCode: Failed to initialize file synchronization service.")
		}
	} else {
		logger.error(
			"Skipping SyncService initialization due to missing dependencies (DB, VectorIndex, Embeddings, Orchestrator, or Workspace).",
		)
		vscode.window.showWarningMessage(
			"MageCode: File synchronization service could not start due to missing components.",
		)
	}

	// Register MageCode-specific commands
	registerMageCodeCommands(context)
	// Tool registration is handled by the factory/dependency injection setup
	// registerMageCodeTools(context) // Remove this call

	logger.info("MageCode mode initialized successfully")
}

// Placeholder functions for future implementation
export function registerMageCodeCommands(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand("magecode.showSettings", () => {
			logger.info("Executing command: magecode.showSettings")
			// Create and show a new webview panel
			new MageCodeSettingsView(context.extensionUri)
		}),
	)
	logger.info("MageCode commands registered.")
}

// Remove this function as tool registration should happen where dependencies are created
// export function registerMageCodeTools(context: vscode.ExtensionContext) {
// ... (function content removed) ...
// }

import * as vscode from "vscode"

/**
 * Type for the agent mode setting
 */
export type AgentMode = "roo-code" | "codeweaver"

/**
 * Weights for different relevancy components
 */
export interface RelevancyWeights {
	graph: number
	vector: number
	lexical: number
	sourceBoost: number
}

/**
 * CodeWeaver-specific settings interface
 */
export interface CodeWeaverSpecificSettings {
	localEmbeddingModelFilename: string | null
	localLLMFilename: string | null
	maxContextSnippets: number
	relevancyWeights: RelevancyWeights
	syncConcurrency: number
}

/**
 * Complete CodeWeaver settings interface including enabled state
 */
export interface CodeWeaverSettings extends CodeWeaverSpecificSettings {
	enabled: boolean
}

// Helper to get VS Code configuration
function getConfiguration(configService?: any): vscode.WorkspaceConfiguration {
	if (configService?.getConfiguration) {
		return configService.getConfiguration()
	}
	return vscode.workspace.getConfiguration("roo-code")
}

/**
 * Retrieves the current agent mode from VS Code configuration
 */
export function getAgentMode(configService?: any): AgentMode {
	const config = getConfiguration(configService)
	try {
		const mode = config.get<AgentMode>("agentMode")
		return mode ?? "roo-code"
	} catch (error) {
		console.error("Failed to read agentMode setting, defaulting to 'roo-code'.", error)
		return "roo-code"
	}
}

/**
 * Retrieves CodeWeaver-specific settings from VS Code configuration
 */
export function getCodeWeaverSettings(configService?: any): CodeWeaverSettings {
	const config = getConfiguration(configService)
	const codeWeaverSubConfig = config.get<Partial<CodeWeaverSpecificSettings>>("codeweaver") ?? {}
	const mode = getAgentMode(configService)

	// Default weights for relevancy components
	const defaultWeights: RelevancyWeights = {
		graph: 1.0,
		vector: 0.6,
		lexical: 0.3,
		sourceBoost: 1.5,
	}

	// Merge the user's custom relevancy weights with defaults
	const relevancyWeights = {
		...defaultWeights,
		...(codeWeaverSubConfig.relevancyWeights ?? {}),
	}

	return {
		enabled: mode === "codeweaver",
		localEmbeddingModelFilename: codeWeaverSubConfig.localEmbeddingModelFilename ?? null,
		localLLMFilename: codeWeaverSubConfig.localLLMFilename ?? null,
		maxContextSnippets: codeWeaverSubConfig.maxContextSnippets ?? 15,
		relevancyWeights,
		syncConcurrency: codeWeaverSubConfig.syncConcurrency ?? 1,
	}
}

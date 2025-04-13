export type AgentMode = "roo-code" | "codeweaver"

export interface CodeWeaverSettings {
	mode: AgentMode
	model?: string
	temperature?: number
	maxTokens?: number
	apiProvider?: string
	anthropicApiKey?: string
	enabled?: boolean
	syncConcurrency?: number
	debugMode?: boolean
	telemetryEnabled?: boolean
	customModelsPath?: string
}

const defaultSettings: CodeWeaverSettings = {
	mode: "roo-code",
	model: "claude-2.1",
	temperature: 0.7,
	maxTokens: 4000,
	apiProvider: "anthropic",
	enabled: true,
	syncConcurrency: 1,
	debugMode: false,
	telemetryEnabled: true,
}

let currentSettings: CodeWeaverSettings = { ...defaultSettings }

/**
 * Gets the current CodeWeaver settings
 * @returns The current settings
 */
export function getCodeWeaverSettings(): CodeWeaverSettings {
	return { ...currentSettings }
}

/**
 * Gets the current agent mode
 * @returns The current agent mode
 */
export function getAgentMode(): AgentMode {
	return currentSettings.mode
}

/**
 * Sets the current agent mode
 * @param mode The mode to set
 */
export function setAgentMode(mode: AgentMode): void {
	currentSettings.mode = mode
}

/**
 * Gets all available agent modes
 * @returns Array of available modes
 */
export function getAvailableModes(): AgentMode[] {
	return ["roo-code", "codeweaver"]
}

/**
 * Checks if the given mode is valid
 * @param mode Mode to check
 * @returns true if valid, false otherwise
 */
export function isValidMode(mode: string): mode is AgentMode {
	return getAvailableModes().includes(mode as AgentMode)
}

/**
 * Updates CodeWeaver settings
 * @param settings Partial settings to update
 */
export function updateCodeWeaverSettings(settings: Partial<CodeWeaverSettings>): void {
	currentSettings = {
		...currentSettings,
		...settings,
	}
}

/**
 * Resets CodeWeaver settings to defaults
 */
export function resetCodeWeaverSettings(): void {
	currentSettings = { ...defaultSettings }
}

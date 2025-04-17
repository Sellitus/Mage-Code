import * as vscode from "vscode"
import { logger } from "../utils/logging" // Import the logger

export function isMageCodeEnabled(): boolean {
	return vscode.workspace.getConfiguration("mage-code").get("magecode.enabled", true)
}

/**
 * Gets the user's preference for model routing.
 * @returns The preference string (e.g., "auto", "forceLocal").
 */
export function getModelPreference(): string {
	return vscode.workspace.getConfiguration("mage-code").get("magecode.modelPreference", "auto")
}

/** Retrieves the configured path for the local ONNX model. */
export function getLocalModelPath(): string | null {
	return vscode.workspace.getConfiguration("mage-code").get("magecode.localProcessing.modelPath", null)
}

/** Retrieves the configured path for the local tokenizer model. */
export function getLocalTokenizerPath(): string | null {
	return vscode.workspace.getConfiguration("mage-code").get("magecode.localProcessing.tokenizerPath", null)
}

/** Retrieves the configured number of threads for local model inference. */
export function getLocalModelNumThreads(): number {
	return vscode.workspace.getConfiguration("mage-code").get("magecode.localProcessing.numThreads", 4)
}

/** Retrieves the configured maximum context length for the local model. */
export function getLocalModelMaxContextLength(): number {
	return vscode.workspace.getConfiguration("mage-code").get("magecode.localProcessing.maxContextLength", 2048)
}

export function registerModeChangeListener(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("mage-code.magecode.enabled")) {
				handleModeChange(isMageCodeEnabled())
			}
		}),
	)
}

function handleModeChange(enabled: boolean): void {
	logger.info(`[MageCode] Mode change detected. MageCode enabled: ${enabled}`)
}

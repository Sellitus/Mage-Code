import * as vscode from "vscode"

export function isMageCodeEnabled(): boolean {
	return vscode.workspace.getConfiguration("roo-code").get("magecode.enabled", true)
}

/**
 * Gets the user's preference for model routing.
 * @returns The preference string (e.g., "auto", "forceLocal").
 */
export function getModelPreference(): string {
	return vscode.workspace.getConfiguration("roo-code").get("magecode.modelPreference", "auto")
}

export function registerModeChangeListener(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("roo-code.magecode.enabled")) {
				handleModeChange(isMageCodeEnabled())
			}
		}),
	)
}

function handleModeChange(enabled: boolean): void {
	console.log(`[MageCode] Mode change detected. MageCode enabled: ${enabled}`)
}

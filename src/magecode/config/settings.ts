import * as vscode from "vscode"

export function isMageCodeEnabled(): boolean {
	return vscode.workspace.getConfiguration("roo-code").get("magecode.enabled", true)
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

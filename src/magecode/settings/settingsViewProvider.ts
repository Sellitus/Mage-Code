import * as vscode from "vscode"

export class MageCodeSettingsView {
	public static readonly viewType = "magecode.settingsView"

	private readonly _view: vscode.WebviewPanel
	private _disposables: vscode.Disposable[] = [] // Added for cleanup

	constructor(private readonly _extensionUri: vscode.Uri) {
		this._view = vscode.window.createWebviewPanel(
			MageCodeSettingsView.viewType,
			"MageCode Settings",
			vscode.ViewColumn.One, // Or vscode.ViewColumn.Beside
			this._getWebviewOptions(this._extensionUri),
		)

		this._view.webview.html = this._getWebviewContent(this._view.webview, this._extensionUri)
		this._setWebviewMessageListener(this._view.webview)

		// Clean up resources when the panel is closed
		this._view.onDidDispose(() => this.dispose(), null, this._disposables)
	}

	public dispose() {
		// Clean up our resources
		this._view.dispose()

		while (this._disposables.length) {
			const x = this._disposables.pop()
			if (x) {
				x.dispose()
			}
		}
	}

	private _getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
		return {
			enableScripts: true,
			// Restrict the webview to only load resources from the allowed directories
			localResourceRoots: [
				vscode.Uri.joinPath(extensionUri, "media"), // Keep if media assets are used
				vscode.Uri.joinPath(extensionUri, "webview-ui/build/assets"), // Updated path
			],
		}
	}

	private _getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
		// Note: The exact filenames (e.g., settings.js, settings.css) might need adjustment
		// after running the build, depending on Vite's output hashing/naming conventions.
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(extensionUri, "webview-ui", "build", "assets", "settings.js"), // Updated path
		)
		// Assuming Vite injects CSS or it's bundled in JS. If a separate CSS file is generated:
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(extensionUri, "webview-ui", "build", "assets", "settings.css"), // Example path, adjust if needed
		)
		// Nonce for Content Security Policy
		const nonce = getNonce()

		// Incorporate the HTML structure directly here
		return /*html*/ `
		<!DOCTYPE html>
		<html lang="en">
			<head>
				<meta charset="UTF-8">
                <!-- IMPORTANT: Adjust CSP based on actual needs, especially if loading external resources -->
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet"> <!-- Link to CSS if separate -->
				<title>MageCode Settings</title>
			</head>
			<body>
                <!-- The container div from settings.html -->
                <section id="settings-container" style="padding: 20px;">
                    <h2>MageCode Settings</h2>
                    <section style="margin-bottom: 15px;">
                        <vscode-checkbox id="enabled-checkbox">Enable MageCode</vscode-checkbox>
                        <p style="font-size: 0.9em; color: var(--vscode-descriptionForeground);">
                            Enable MageCode agent mode for enhanced token efficiency.
                        </p>
                    </section>
                    <section>
                         <label for="model-preference-dropdown">Model Preference:</label>
                         <vscode-dropdown id="model-preference-dropdown" style="width: 200px;">
                             <vscode-option value="auto">Auto</vscode-option>
                             <vscode-option value="preferLocal">Prefer Local</vscode-option>
                             <vscode-option value="preferCloud">Prefer Cloud</vscode-option>
                             <vscode-option value="forceLocal">Force Local</vscode-option>
                             <vscode-option value="forceCloud">Force Cloud</vscode-option>
                         </vscode-dropdown>
                         <p style="font-size: 0.9em; color: var(--vscode-descriptionForeground);">
                             Preference for routing LLM requests between local and cloud models.
                         </p>
                    </section>
                </section>
				<script type="module" nonce="${nonce}" src="${scriptUri}"></script>
			</body>
		</html>`
	}

	private _setWebviewMessageListener(webview: vscode.Webview) {
		const listener = webview.onDidReceiveMessage(
			// Assign listener to variable
			(message) => {
				const command = message.command
				const setting = message.setting
				const value = message.value

				switch (command) {
					case "getSettings":
						const config = vscode.workspace.getConfiguration("mage-code.magecode")
						const enabled = config.get<boolean>("enabled")
						const modelPreference = config.get<string>("modelPreference")

						webview.postMessage({
							type: "settings",
							enabled: enabled,
							modelPreference: modelPreference,
						})
						return
					case "updateSetting":
						const configuration = vscode.workspace.getConfiguration("mage-code.magecode")
						// Add validation for setting key and value if necessary
						configuration.update(setting, value, vscode.ConfigurationTarget.Global)
						return
				}
			},
			null,
			// this._disposables // Add listener to disposables - moved below
		)
		this._disposables.push(listener) // Add listener to disposables array
	}
}

// Helper function to generate nonce
function getNonce() {
	let text = ""
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length))
	}
	return text
}

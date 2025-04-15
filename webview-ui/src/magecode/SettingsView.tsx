import {
	provideVSCodeDesignSystem,
	vsCodeButton, // Keep if needed elsewhere, otherwise remove
	vsCodeCheckbox,
	vsCodeDropdown,
	vsCodeOption,
	// Removed incorrect VSCodeCheckbox, VSCodeDropdown imports
} from "@vscode/webview-ui-toolkit"

declare function acquireVsCodeApi(): {
	postMessage: (message: any) => void
	getState: () => any
	setState: (newState: any) => void
}

// Register components
provideVSCodeDesignSystem().register(
	vsCodeButton(), // Keep if needed
	vsCodeCheckbox(),
	vsCodeDropdown(),
	vsCodeOption(),
)

const vscode = acquireVsCodeApi()

// Get references to UI elements, casting to base HTML types
const enabledCheckbox = document.getElementById("enabled-checkbox") as HTMLInputElement | null
const modelPreferenceDropdown = document.getElementById("model-preference-dropdown") as HTMLSelectElement | null // Use HTMLSelectElement or a more specific type if available from toolkit

// Handle messages from the extension
window.addEventListener("message", (event) => {
	const message = event.data // Define type for message if known, e.g., { type: string; enabled?: boolean; modelPreference?: string }
	switch (message.type) {
		case "settings":
			// Update UI with received settings
			if (enabledCheckbox) {
				enabledCheckbox.checked = message.enabled ?? true // Default to true if undefined
			}
			if (modelPreferenceDropdown) {
				// For vscode-dropdown, setting value directly should work
				modelPreferenceDropdown.value = message.modelPreference ?? "auto" // Default to 'auto'
			}
			return
	}
})

// Request initial settings when the webview loads
vscode.postMessage({ type: "getSettings" })

// Add event listeners to send updates back to the extension
enabledCheckbox?.addEventListener("change", (event: Event) => {
	// Cast target to HTMLInputElement
	const target = event.target as HTMLInputElement
	vscode.postMessage({ type: "updateSetting", setting: "enabled", value: target.checked })
})

modelPreferenceDropdown?.addEventListener("change", (event: Event) => {
	// Cast target appropriately - vscode-dropdown might need a specific type or cast
	// Assuming it behaves like a standard select for value property
	const target = event.target as HTMLSelectElement
	vscode.postMessage({ type: "updateSetting", setting: "modelPreference", value: target.value })
})

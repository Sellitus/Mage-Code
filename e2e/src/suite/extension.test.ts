import * as assert from "assert"
import * as vscode from "vscode"

suite("Roo Code Extension", () => {
	test("Commands should be registered", async () => {
		const expectedCommands = [
			"mage-code.plusButtonClicked",
			"mage-code.mcpButtonClicked",
			"mage-code.historyButtonClicked",
			"mage-code.popoutButtonClicked",
			"mage-code.settingsButtonClicked",
			"mage-code.openInNewTab",
			"mage-code.explainCode",
			"mage-code.fixCode",
			"mage-code.improveCode",
		]

		const commands = await vscode.commands.getCommands(true)

		for (const cmd of expectedCommands) {
			assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`)
		}
	})
})

import {
	getCodeWeaverSettings,
	getAgentMode,
	setAgentMode,
	updateCodeWeaverSettings,
	resetCodeWeaverSettings,
	isValidMode,
	type AgentMode,
	type CodeWeaverSettings,
} from "../settings"

describe("CodeWeaver Settings", () => {
	beforeEach(() => {
		resetCodeWeaverSettings()
	})

	describe("getCodeWeaverSettings", () => {
		it("should return default settings initially", () => {
			const settings = getCodeWeaverSettings()
			expect(settings).toEqual({
				mode: "roo-code",
				model: "claude-2.1",
				temperature: 0.7,
				maxTokens: 4000,
				apiProvider: "anthropic",
				enabled: true,
				syncConcurrency: 1,
				debugMode: false,
				telemetryEnabled: true,
			})
		})

		it("should return a copy of settings", () => {
			const settings1 = getCodeWeaverSettings()
			const settings2 = getCodeWeaverSettings()
			expect(settings1).toEqual(settings2)
			expect(settings1).not.toBe(settings2)
		})
	})

	describe("getAgentMode", () => {
		it("should return roo-code by default", () => {
			expect(getAgentMode()).toBe("roo-code")
		})

		it("should return updated mode after setting", () => {
			setAgentMode("codeweaver")
			expect(getAgentMode()).toBe("codeweaver")
		})
	})

	describe("updateCodeWeaverSettings", () => {
		it("should update partial settings", () => {
			updateCodeWeaverSettings({
				mode: "codeweaver",
				temperature: 0.9,
				maxTokens: 8000,
			})

			const settings = getCodeWeaverSettings()
			expect(settings).toMatchObject({
				mode: "codeweaver",
				temperature: 0.9,
				maxTokens: 8000,
			})
		})

		it("should preserve unmodified settings", () => {
			const before = getCodeWeaverSettings()
			updateCodeWeaverSettings({
				temperature: 0.9,
			})
			const after = getCodeWeaverSettings()

			expect(after.mode).toBe(before.mode)
			expect(after.model).toBe(before.model)
			expect(after.temperature).toBe(0.9)
		})
	})

	describe("resetCodeWeaverSettings", () => {
		it("should restore default settings", () => {
			updateCodeWeaverSettings({
				mode: "codeweaver",
				temperature: 0.9,
				maxTokens: 8000,
				debugMode: true,
			})

			resetCodeWeaverSettings()

			expect(getCodeWeaverSettings()).toEqual({
				mode: "roo-code",
				model: "claude-2.1",
				temperature: 0.7,
				maxTokens: 4000,
				apiProvider: "anthropic",
				enabled: true,
				syncConcurrency: 1,
				debugMode: false,
				telemetryEnabled: true,
			})
		})
	})

	describe("isValidMode", () => {
		it("should return true for valid modes", () => {
			expect(isValidMode("roo-code")).toBe(true)
			expect(isValidMode("codeweaver")).toBe(true)
		})

		it("should return false for invalid modes", () => {
			expect(isValidMode("invalid-mode")).toBe(false)
			expect(isValidMode("")).toBe(false)
		})

		it("should type guard valid modes", () => {
			const mode = "roo-code"
			if (isValidMode(mode)) {
				const agentMode: AgentMode = mode // Should compile without error
				expect(agentMode).toBe("roo-code")
			}
		})
	})
})

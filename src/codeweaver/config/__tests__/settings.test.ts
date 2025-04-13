import * as vscode from "vscode"
import { getAgentMode, getCodeWeaverSettings } from "../settings"
import type { AgentMode, CodeWeaverSettings } from "../settings"

// Mock VS Code APIs
jest.mock("vscode", () => ({
	workspace: {
		getConfiguration: jest.fn(),
	},
}))

// Mock console.error for getAgentMode error case
console.error = jest.fn()

describe("CodeWeaver Configuration", () => {
	let mockGetConfiguration: jest.Mock

	beforeEach(() => {
		// Reset all mocks before each test
		jest.clearAllMocks()
		mockGetConfiguration = vscode.workspace.getConfiguration as jest.Mock
	})

	describe("getAgentMode", () => {
		it("returns 'roo-code' by default", () => {
			mockGetConfiguration.mockReturnValue({
				get: () => undefined,
			})
			expect(getAgentMode()).toBe("roo-code")
		})

		it("returns 'codeweaver' when configured", () => {
			mockGetConfiguration.mockReturnValue({
				get: () => "codeweaver",
			})
			expect(getAgentMode()).toBe("codeweaver")
		})

		it("handles errors and returns default", () => {
			mockGetConfiguration.mockReturnValue({
				get: () => {
					throw new Error("Test error")
				},
			})
			expect(getAgentMode()).toBe("roo-code")
			expect(console.error).toHaveBeenCalled()
		})

		it("uses provided config service when available", () => {
			const mockConfigService = {
				getConfiguration: () => ({
					get: () => "codeweaver",
				}),
			}
			expect(getAgentMode(mockConfigService)).toBe("codeweaver")
		})
	})

	describe("getCodeWeaverSettings", () => {
		it("returns default settings when no configuration exists", () => {
			mockGetConfiguration.mockReturnValue({
				get: (key: string) => (key === "agentMode" ? "roo-code" : undefined),
			})

			const settings = getCodeWeaverSettings()
			expect(settings).toEqual({
				enabled: false,
				localEmbeddingModelFilename: null,
				localLLMFilename: null,
				maxContextSnippets: 15,
				relevancyWeights: {
					graph: 1.0,
					vector: 0.6,
					lexical: 0.3,
					sourceBoost: 1.5,
				},
				syncConcurrency: 1,
			})
		})

		it("merges custom settings with defaults", () => {
			mockGetConfiguration.mockReturnValue({
				get: (key: string) => {
					if (key === "agentMode") return "codeweaver"
					if (key === "codeweaver")
						return {
							localEmbeddingModelFilename: "custom.onnx",
							maxContextSnippets: 20,
							relevancyWeights: {
								graph: 0.8,
								vector: 0.7,
								lexical: 0.4,
								sourceBoost: 1.2,
							},
						}
					return undefined
				},
			})

			const settings = getCodeWeaverSettings()
			expect(settings).toEqual({
				enabled: true,
				localEmbeddingModelFilename: "custom.onnx",
				localLLMFilename: null,
				maxContextSnippets: 20,
				relevancyWeights: {
					graph: 0.8,
					vector: 0.7,
					lexical: 0.4,
					sourceBoost: 1.2,
				},
				syncConcurrency: 1,
			})
		})

		it("uses provided config service when available", () => {
			const mockConfigService = {
				getConfiguration: () => ({
					get: (key: string) => {
						if (key === "agentMode") return "codeweaver"
						if (key === "codeweaver")
							return {
								syncConcurrency: 4,
							}
						return undefined
					},
				}),
			}

			const settings = getCodeWeaverSettings(mockConfigService)
			expect(settings.enabled).toBe(true)
			expect(settings.syncConcurrency).toBe(4)
		})
	})
})

import * as vscode from "vscode"
import { ClineProvider } from "../../../../core/webview/ClineProvider"
import { CodeWeaverAgentStub } from "../../../../codeweaver/agentStub"
import { CodeWeaverContextRetrieverStub } from "../../../../codeweaver/context/contextRetriever"
import { CodeWeaverLLMOrchestratorStub } from "../../../../codeweaver/orchestration/orchestrator"
import { RooCodeContextRetrieverStub } from "../../../../interfaces/rooCodeContextRetriever"
import { RooCodeLLMOrchestratorStub } from "../../../../interfaces/rooCodeLLMOrchestrator"
import { AgentDependencies } from "../../../../codeweaver/interfaces"

// Mock getAgentMode
jest.mock("../../../../codeweaver/config/settings", () => ({
	getAgentMode: jest.fn(),
}))

// Mock Cline constructor
jest.mock("../../cline", () => jest.fn())

// Mock MCP Hub/Server
jest.mock("../../../services/mcp/McpHub", () => ({
	McpHub: jest.fn().mockImplementation(() => ({
		registerClient: jest.fn(),
		unregisterClient: jest.fn(),
		getAllServers: jest.fn().mockReturnValue([]),
	})),
}))

jest.mock("../../../services/mcp/McpServerManager", () => ({
	McpServerManager: {
		getInstance: jest.fn().mockResolvedValue({
			registerClient: jest.fn(),
			unregisterClient: jest.fn(),
			getAllServers: jest.fn().mockReturnValue([]),
		}),
		unregisterProvider: jest.fn(),
	},
}))

// Mock ContextProxy
jest.mock("../../../core/config/ContextProxy", () => {
	return {
		ContextProxy: jest.fn().mockImplementation(() => ({
			initialize: jest.fn().mockResolvedValue(undefined),
			isInitialized: true,
			extensionUri: vscode.Uri.file("/mock/extension"),
			extensionMode: vscode.ExtensionMode.Test,
			getValues: jest.fn().mockReturnValue({}),
			getValue: jest.fn(),
			setValue: jest.fn(),
			setValues: jest.fn(),
			getProviderSettings: jest.fn().mockReturnValue({}),
			setProviderSettings: jest.fn(),
			resetAllState: jest.fn(),
		})),
	}
})

// Mock ProviderSettingsManager
jest.mock("../../../core/config/ProviderSettingsManager", () => {
	return {
		ProviderSettingsManager: jest.fn().mockImplementation(() => ({
			getModeConfigId: jest.fn().mockResolvedValue("default-config"),
			listConfig: jest.fn().mockResolvedValue([]),
			loadConfig: jest.fn().mockResolvedValue({}),
			setModeConfig: jest.fn(),
			saveConfig: jest.fn(),
			resetAllConfigs: jest.fn(),
		})),
	}
})

// Mock CustomModesManager
jest.mock("../../../core/config/CustomModesManager", () => {
	return {
		CustomModesManager: jest.fn().mockImplementation(() => ({
			getCustomModes: jest.fn().mockResolvedValue([]),
			resetCustomModes: jest.fn(),
			dispose: jest.fn(),
		})),
	}
})

// Mock telemetry service
jest.mock("../../../services/telemetry/TelemetryService", () => ({
	telemetryService: {
		setProvider: jest.fn(),
		captureTaskCreated: jest.fn(),
		captureCheckpointCreated: jest.fn(),
		captureCheckpointRestored: jest.fn(),
		captureCheckpointDiffed: jest.fn(),
		captureModeSwitch: jest.fn(),
		captureConversationMessage: jest.fn(),
		captureTaskRestarted: jest.fn(),
		captureToolUsage: jest.fn(),
	},
}))

// Mock extensions namespace
jest.mock("vscode", () => ({
	...jest.requireActual("vscode"),
	extensions: {
		getExtension: jest.fn().mockReturnValue({
			packageJSON: { version: "1.0.0" },
		}),
	},
	workspace: {
		onDidChangeConfiguration: jest.fn().mockReturnValue({ dispose: jest.fn() }),
		getConfiguration: jest.fn().mockReturnValue({
			get: jest.fn().mockReturnValue([]),
		}),
	},
	env: {
		language: "en",
		machineId: "test-machine-id",
	},
}))

describe("ClineProvider Mode Dispatch", () => {
	let provider: ClineProvider
	const mockContext = {
		globalStorageUri: { fsPath: "/mock/storage" },
		subscriptions: [],
		extension: {
			packageJSON: { version: "1.0.0" },
		},
	} as unknown as vscode.ExtensionContext

	const mockOutputChannel: vscode.OutputChannel = {
		name: "Mock Output",
		append: jest.fn(),
		appendLine: jest.fn(),
		clear: jest.fn(),
		show: jest.fn(),
		hide: jest.fn(),
		dispose: jest.fn(),
		replace: jest.fn(),
	}

	beforeEach(() => {
		jest.clearAllMocks()
		provider = new ClineProvider(mockContext, mockOutputChannel)
	})

	afterEach(() => {
		// Clean up provider
		provider.dispose()
	})

	it("should initialize MCP hub on construction", () => {
		expect(require("../../../services/mcp/McpServerManager").McpServerManager.getInstance).toHaveBeenCalledWith(
			mockContext,
			provider,
		)
	})

	it("should create Cline agent with Roo Code stubs when in roo-code mode", async () => {
		// Setup
		const { getAgentMode } = require("../../../../codeweaver/config/settings")
		getAgentMode.mockReturnValue("roo-code")

		// Act
		await provider.initClineWithTask("Test prompt")

		// Assert
		expect(getAgentMode).toHaveBeenCalled()
		expect(RooCodeContextRetrieverStub).toHaveBeenCalled()
		expect(RooCodeLLMOrchestratorStub).toHaveBeenCalled()
		const Cline = require("../../cline")
		expect(Cline).toHaveBeenCalled()
		expect(CodeWeaverAgentStub).not.toHaveBeenCalled()
	})

	it("should create CodeWeaver agent with CodeWeaver stubs when in codeweaver mode", async () => {
		// Setup
		const { getAgentMode } = require("../../../../codeweaver/config/settings")
		getAgentMode.mockReturnValue("codeweaver")

		// Act
		await provider.initClineWithTask("Test prompt")

		// Assert
		expect(getAgentMode).toHaveBeenCalled()
		expect(CodeWeaverContextRetrieverStub).toHaveBeenCalled()
		expect(CodeWeaverLLMOrchestratorStub).toHaveBeenCalled()
		expect(CodeWeaverAgentStub).toHaveBeenCalled()
		const Cline = require("../../cline")
		expect(Cline).not.toHaveBeenCalled()
	})

	it("should pass correct dependencies to agents", async () => {
		// Setup
		const { getAgentMode } = require("../../../../codeweaver/config/settings")
		getAgentMode.mockReturnValue("codeweaver")

		// Mock dependencies factory
		const mockDependencies: AgentDependencies = {
			logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
			contextRetriever: { getContext: jest.fn() },
			llmOrchestrator: { makeApiRequest: jest.fn() },
		}

		// Mock the internal dependencies creation using type assertion
		const providerWithInternals = provider as unknown as {
			createAgentDependencies(mode: string): Promise<AgentDependencies>
		}
		const originalCreateDeps = providerWithInternals.createAgentDependencies
		providerWithInternals.createAgentDependencies = jest.fn().mockResolvedValue(mockDependencies)

		// Act
		await provider.initClineWithTask("Test prompt")

		// Assert
		expect(providerWithInternals.createAgentDependencies).toHaveBeenCalledWith("codeweaver")
		expect(CodeWeaverAgentStub).toHaveBeenCalledWith(
			expect.any(Object), // config
			mockDependencies, // dependencies
		)

		// Restore original method
		providerWithInternals.createAgentDependencies = originalCreateDeps
	})

	it("should handle missing dependencies gracefully", async () => {
		// Setup
		const { getAgentMode } = require("../../../../codeweaver/config/settings")
		getAgentMode.mockReturnValue("codeweaver")

		// Mock dependencies factory to return undefined
		const providerWithInternals = provider as unknown as {
			createAgentDependencies(mode: string): Promise<AgentDependencies | undefined>
		}
		const originalCreateDeps = providerWithInternals.createAgentDependencies
		providerWithInternals.createAgentDependencies = jest.fn().mockResolvedValue(undefined)

		// Act & Assert
		await expect(provider.initClineWithTask("Test prompt")).rejects.toThrow(/Failed to create dependencies/)

		// Restore original method
		providerWithInternals.createAgentDependencies = originalCreateDeps
	})

	it("should cleanup MCP hub on disposal", async () => {
		const mockMcpHub = {
			registerClient: jest.fn(),
			unregisterClient: jest.fn().mockResolvedValue(undefined),
			getAllServers: jest.fn().mockReturnValue([]),
		}

		const McpServerManager = require("../../../services/mcp/McpServerManager").McpServerManager
		McpServerManager.getInstance.mockResolvedValue(mockMcpHub)
		await provider.dispose()

		expect(mockMcpHub.unregisterClient).toHaveBeenCalled()
		expect(McpServerManager.unregisterProvider).toHaveBeenCalledWith(provider)
	})
})

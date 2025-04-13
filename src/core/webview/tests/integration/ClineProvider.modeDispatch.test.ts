import { jest } from "@jest/globals"
import "../testSetup"
import * as vscode from "vscode"
import { ClineProvider } from "../../ClineProvider"
import { CodeWeaverAgentStub } from "../../../../codeweaver/agentStub"
import { CodeWeaverContextRetrieverStub } from "../../../../codeweaver/context/contextRetriever"
import { CodeWeaverLLMOrchestratorStub } from "../../../../codeweaver/orchestration/orchestrator"
import { RooCodeContextRetrieverStub } from "../../../../interfaces/rooCodeContextRetriever"
import { RooCodeLLMOrchestratorStub } from "../../../../interfaces/rooCodeLLMOrchestrator"
import { AgentDependencies } from "../../../../codeweaver/interfaces"
import { createMockMcpHub, createMockDependencies, createEmptyMock, createAsyncMock } from "../testTypes"

// Mock getAgentMode
jest.mock("../../../../codeweaver/config/settings", () => ({
	getAgentMode: jest.fn(),
}))

// Mock Cline constructor
jest.mock("../../Cline", () => ({
	Cline: jest.fn(),
}))

// Mock MCP Hub/Server with type assertions
jest.mock("../../../services/mcp/McpHub", () => ({
	McpHub: jest.fn().mockImplementation(() => createMockMcpHub()),
}))

jest.mock("../../../services/mcp/McpServerManager", () => ({
	McpServerManager: {
		getInstance: createAsyncMock(createMockMcpHub()),
		unregisterProvider: createEmptyMock(),
	},
}))

// Mock ContextProxy with type assertions
jest.mock("../../../config/ContextProxy", () => {
	return {
		ContextProxy: jest.fn().mockImplementation(() => ({
			initialize: createAsyncMock(undefined),
			isInitialized: true,
			extensionUri: vscode.Uri.file("/mock/extension"),
			extensionMode: vscode.ExtensionMode.Test,
			getValues: jest.fn().mockReturnValue({
				mode: "default",
			}),
			getValue: createEmptyMock(),
			setValue: createEmptyMock(),
			setValues: createEmptyMock(),
			getProviderSettings: jest.fn().mockReturnValue({
				apiProvider: "anthropic",
			}),
			setProviderSettings: createEmptyMock(),
			resetAllState: createEmptyMock(),
		})),
	}
})

// Mock ProviderSettingsManager
jest.mock("../../../config/ProviderSettingsManager", () => {
	return {
		ProviderSettingsManager: jest.fn().mockImplementation(() => ({
			getModeConfigId: createAsyncMock("default-config"),
			listConfig: createAsyncMock([]),
			loadConfig: createAsyncMock({ apiProvider: "anthropic" }),
			setModeConfig: createEmptyMock(),
			saveConfig: createEmptyMock(),
			resetAllConfigs: createEmptyMock(),
		})),
	}
})

// Mock CustomModesManager
jest.mock("../../../config/CustomModesManager", () => {
	return {
		CustomModesManager: jest.fn().mockImplementation(() => ({
			getCustomModes: createAsyncMock([]),
			resetCustomModes: createEmptyMock(),
			dispose: createEmptyMock(),
		})),
	}
})

// Mock telemetry service
jest.mock("../../../services/telemetry/TelemetryService", () => ({
	telemetryService: {
		setProvider: createEmptyMock(),
		captureTaskCreated: createEmptyMock(),
		captureCheckpointCreated: createEmptyMock(),
		captureCheckpointRestored: createEmptyMock(),
		captureCheckpointDiffed: createEmptyMock(),
		captureModeSwitch: createEmptyMock(),
		captureConversationMessage: createEmptyMock(),
		captureTaskRestarted: createEmptyMock(),
		captureToolUsage: createEmptyMock(),
	},
}))

// Mock registerCommands
jest.mock("../../../activate/registerCommands", () => ({
	setPanel: createEmptyMock(),
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
		const { Cline } = require("../../Cline")

		// Act
		await provider.initClineWithTask("Test prompt")

		// Assert
		expect(getAgentMode).toHaveBeenCalled()
		expect(RooCodeContextRetrieverStub).toHaveBeenCalled()
		expect(RooCodeLLMOrchestratorStub).toHaveBeenCalled()
		expect(Cline).toHaveBeenCalled()
		expect(CodeWeaverAgentStub).not.toHaveBeenCalled()
	})

	it("should create CodeWeaver agent with CodeWeaver stubs when in codeweaver mode", async () => {
		// Setup
		const { getAgentMode } = require("../../../../codeweaver/config/settings")
		getAgentMode.mockReturnValue("codeweaver")
		const { Cline } = require("../../Cline")

		// Act
		await provider.initClineWithTask("Test prompt")

		// Assert
		expect(getAgentMode).toHaveBeenCalled()
		expect(CodeWeaverContextRetrieverStub).toHaveBeenCalled()
		expect(CodeWeaverLLMOrchestratorStub).toHaveBeenCalled()
		expect(CodeWeaverAgentStub).toHaveBeenCalled()
		expect(Cline).not.toHaveBeenCalled()
	})

	it("should pass correct dependencies to agents", async () => {
		// Setup
		const { getAgentMode } = require("../../../../codeweaver/config/settings")
		getAgentMode.mockReturnValue("codeweaver")

		// Mock dependencies factory
		const mockDependencies = createMockDependencies()

		// Cast as any to bypass type checking for the test
		const providerWithInternals = provider as any
		const originalCreateDeps = providerWithInternals.createAgentDependencies
		providerWithInternals.createAgentDependencies = createAsyncMock(mockDependencies)

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

		// Cast as any to bypass type checking for the test
		const providerWithInternals = provider as any
		const originalCreateDeps = providerWithInternals.createAgentDependencies
		providerWithInternals.createAgentDependencies = createAsyncMock(undefined)

		// Act & Assert
		await expect(provider.initClineWithTask("Test prompt")).rejects.toThrow(/Failed to create dependencies/)

		// Restore original method
		providerWithInternals.createAgentDependencies = originalCreateDeps
	})

	it("should cleanup MCP hub on disposal", async () => {
		const localMcpHub = createMockMcpHub()

		const McpServerManager = require("../../../services/mcp/McpServerManager").McpServerManager
		McpServerManager.getInstance.mockResolvedValue(localMcpHub)
		await provider.dispose()

		expect(localMcpHub.unregisterClient).toHaveBeenCalled()
		expect(McpServerManager.unregisterProvider).toHaveBeenCalledWith(provider)
	})

	it("should emit events when Cline is created", async () => {
		// Setup
		const { getAgentMode } = require("../../../../codeweaver/config/settings")
		getAgentMode.mockReturnValue("roo-code")

		// Create spy on emit
		const emitSpy = jest.spyOn(provider, "emit")

		// Act
		await provider.initClineWithTask("Test prompt")

		// Assert
		expect(emitSpy).toHaveBeenCalledWith("clineCreated", expect.any(Object))
	})
})

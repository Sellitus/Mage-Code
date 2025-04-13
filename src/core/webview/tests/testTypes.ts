import { jest } from "@jest/globals"

// Mock types for McpHub
export interface MockMcpHub {
	registerClient: jest.Mock
	unregisterClient: jest.Mock
	getAllServers: jest.Mock
}

export interface MockConfig {
	apiProvider?: string
	anthropicApiKey?: string
	[key: string]: any
}

export interface ApiConfiguration extends MockConfig {}

export type Mode = "default" | "roo-code" | "codeweaver"

// Logger method signatures
export interface Logger {
	info(message: string): void
	warn(message: string): void
	error(message: string): void
	debug(message: string): void
}

// Context retriever signature
export interface ContextRetriever {
	getContext(taskDescription: string, editorState: any, history?: any[], tokenLimit?: number): Promise<any>
}

// LLM orchestrator signature
export interface LLMOrchestrator {
	makeApiRequest(prompt: any[], options: any, cancellationToken?: any): Promise<any>
}

// Mock dependencies for testing
export interface AgentDependenciesMock {
	logger: {
		info: jest.Mock
		warn: jest.Mock
		error: jest.Mock
		debug: jest.Mock
	}
	contextRetriever: {
		getContext: jest.Mock
	}
	llmOrchestrator: {
		makeApiRequest: jest.Mock
	}
}

// Helper function to create mock MCPHub
export function createMockMcpHub(): MockMcpHub {
	return {
		registerClient: jest.fn().mockImplementation(() => Promise.resolve()),
		unregisterClient: jest.fn().mockImplementation(() => Promise.resolve()),
		getAllServers: jest.fn().mockImplementation(() => []),
	}
}

// Helper function to create mock dependencies
export function createMockDependencies(): AgentDependenciesMock {
	return {
		logger: {
			info: jest.fn().mockImplementation(() => undefined),
			warn: jest.fn().mockImplementation(() => undefined),
			error: jest.fn().mockImplementation(() => undefined),
			debug: jest.fn().mockImplementation(() => undefined),
		},
		contextRetriever: {
			getContext: jest.fn().mockImplementation(() => Promise.resolve({})),
		},
		llmOrchestrator: {
			makeApiRequest: jest.fn().mockImplementation(() => Promise.resolve({})),
		},
	}
}

// Helper function to create an empty mock
export function createEmptyMock(): jest.Mock {
	return jest.fn().mockImplementation(() => undefined)
}

// Helper function to create a mock that returns a promise
export function createAsyncMock<T>(returnValue: T): jest.Mock {
	return jest.fn().mockImplementation(() => Promise.resolve(returnValue))
}

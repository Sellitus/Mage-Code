import { jest } from "@jest/globals"

// Mock Node.js modules
jest.mock("events", () => ({
	__esModule: true,
	default: jest.fn().mockImplementation(() => ({
		emit: jest.fn(),
		on: jest.fn(),
		once: jest.fn(),
		removeListener: jest.fn(),
		removeAllListeners: jest.fn(),
	})),
}))

// Mock VS Code
const mockVSCode = {
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
		uriScheme: "vscode",
	},
	EventEmitter: class {
		constructor() {}
		event = jest.fn()
		fire = jest.fn()
		dispose = jest.fn()
	},
	Uri: {
		file: (path: string) => ({
			fsPath: path,
			scheme: "file",
			path: path,
		}),
	},
	ExtensionMode: {
		Test: 3,
	},
	window: {
		createOutputChannel: jest.fn().mockReturnValue({
			appendLine: jest.fn(),
			clear: jest.fn(),
			dispose: jest.fn(),
		}),
	},
	commands: {
		executeCommand: jest.fn(),
	},
}

jest.mock("vscode", () => mockVSCode)

export { mockVSCode }

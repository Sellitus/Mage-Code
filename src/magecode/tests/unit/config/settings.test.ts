import * as vscode from "vscode"
import { isMageCodeEnabled, registerModeChangeListener } from "../../../config/settings"
import { logger } from "../../../utils/logging" // Import logger to mock it

// Mock the vscode API
jest.mock(
	"vscode",
	() => ({
		workspace: {
			getConfiguration: jest.fn(),
			onDidChangeConfiguration: jest.fn(),
		},
		// Mock other vscode parts if needed by the functions under test or mocks
		ConfigurationTarget: {}, // Example if needed
		Uri: {}, // Example if needed
		EventEmitter: jest.fn(() => ({
			event: jest.fn(),
			fire: jest.fn(),
			dispose: jest.fn(),
		})),
	}),
	{ virtual: true },
)

// Mock the logger
jest.mock("../../../utils/logging", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
}))

describe("MageCode Settings", () => {
	let mockGetConfiguration: jest.Mock
	let mockOnDidChangeConfiguration: jest.Mock
	let mockConfiguration: { get: jest.Mock }
	let mockLoggerInfo: jest.Mock

	beforeEach(() => {
		// Reset mocks before each test
		jest.clearAllMocks()

		// Setup mock implementations
		mockGetConfiguration = vscode.workspace.getConfiguration as jest.Mock
		mockOnDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration as jest.Mock
		mockLoggerInfo = logger.info as jest.Mock

		mockConfiguration = {
			get: jest.fn(),
		}
		mockGetConfiguration.mockReturnValue(mockConfiguration)
	})

	describe("isMageCodeEnabled", () => {
		it("should return true when setting is true", () => {
			mockConfiguration.get.mockImplementation((key: string, defaultValue: any) => {
				if (key === "magecode.enabled") {
					return true
				}
				return defaultValue
			})
			expect(isMageCodeEnabled()).toBe(true)
			expect(mockGetConfiguration).toHaveBeenCalledWith("roo-code")
			expect(mockConfiguration.get).toHaveBeenCalledWith("magecode.enabled", true)
		})

		it("should return false when setting is false", () => {
			mockConfiguration.get.mockImplementation((key: string, defaultValue: any) => {
				if (key === "magecode.enabled") {
					return false
				}
				return defaultValue
			})
			expect(isMageCodeEnabled()).toBe(false)
			expect(mockGetConfiguration).toHaveBeenCalledWith("roo-code")
			expect(mockConfiguration.get).toHaveBeenCalledWith("magecode.enabled", true)
		})

		it("should return true (default) when setting is not present", () => {
			mockConfiguration.get.mockImplementation((key: string, defaultValue: any) => {
				// Simulate setting not being present by returning the default value
				return defaultValue
			})
			expect(isMageCodeEnabled()).toBe(true)
			expect(mockGetConfiguration).toHaveBeenCalledWith("roo-code")
			expect(mockConfiguration.get).toHaveBeenCalledWith("magecode.enabled", true)
		})
	})

	describe("registerModeChangeListener", () => {
		let mockContext: vscode.ExtensionContext
		let mockPush: jest.Mock
		let listenerCallback: (e: vscode.ConfigurationChangeEvent) => any

		beforeEach(() => {
			mockPush = jest.fn()
			mockContext = {
				subscriptions: {
					push: mockPush,
				},
				// Add other mock properties/methods to ExtensionContext if needed
			} as any

			// Capture the listener passed to onDidChangeConfiguration
			mockOnDidChangeConfiguration.mockImplementation((listener) => {
				listenerCallback = listener
				return { dispose: jest.fn() } // Return a mock disposable
			})

			registerModeChangeListener(mockContext)
		})

		it("should register a configuration change listener", () => {
			expect(mockOnDidChangeConfiguration).toHaveBeenCalledTimes(1)
			expect(typeof listenerCallback).toBe("function")
			expect(mockPush).toHaveBeenCalledTimes(1) // Check if the disposable was pushed
		})

		it("should call handleModeChange with true when setting changes to enabled", () => {
			// Simulate setting being enabled before change
			mockConfiguration.get.mockImplementation((key: string, defaultValue: any) => {
				if (key === "magecode.enabled") return true
				return defaultValue
			})

			// Simulate the configuration change event
			const mockEvent: vscode.ConfigurationChangeEvent = {
				affectsConfiguration: jest.fn((section: string) => {
					return section === "roo-code.magecode.enabled"
				}),
			}
			listenerCallback(mockEvent)

			expect(mockEvent.affectsConfiguration).toHaveBeenCalledWith("roo-code.magecode.enabled")
			expect(mockLoggerInfo).toHaveBeenCalledWith("[MageCode] Mode change detected. MageCode enabled: true")
		})

		it("should call handleModeChange with false when setting changes to disabled", () => {
			// Simulate setting being disabled after change
			mockConfiguration.get.mockImplementation((key: string, defaultValue: any) => {
				if (key === "magecode.enabled") return false
				return defaultValue
			})

			// Simulate the configuration change event
			const mockEvent: vscode.ConfigurationChangeEvent = {
				affectsConfiguration: jest.fn((section: string) => {
					return section === "roo-code.magecode.enabled"
				}),
			}
			listenerCallback(mockEvent)

			expect(mockEvent.affectsConfiguration).toHaveBeenCalledWith("roo-code.magecode.enabled")
			expect(mockLoggerInfo).toHaveBeenCalledWith("[MageCode] Mode change detected. MageCode enabled: false")
		})

		it("should not call handleModeChange if the relevant setting did not change", () => {
			// Simulate the configuration change event for a different setting
			const mockEvent: vscode.ConfigurationChangeEvent = {
				affectsConfiguration: jest.fn((section: string) => {
					return section === "roo-code.someOtherSetting"
				}),
			}
			listenerCallback(mockEvent)

			expect(mockEvent.affectsConfiguration).toHaveBeenCalledWith("roo-code.magecode.enabled")
			expect(mockLoggerInfo).not.toHaveBeenCalled()
		})
	})
})

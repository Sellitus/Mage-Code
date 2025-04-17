import * as vscode from "vscode"
import { isMageCodeEnabled } from "../../config/settings"

// Mock the vscode API
jest.mock(
	"vscode",
	() => ({
		workspace: {
			getConfiguration: jest.fn(),
		},
		// Add other mocks as needed
	}),
	{ virtual: true },
)

describe("MageCode Settings", () => {
	let getConfigurationMock: jest.Mock

	beforeEach(() => {
		// Reset mocks before each test
		getConfigurationMock = vscode.workspace.getConfiguration as jest.Mock
		getConfigurationMock.mockClear()
	})

	it("isMageCodeEnabled should return true by default", () => {
		// Mock getConfiguration to return a mock config object
		const mockConfig = {
			get: jest.fn().mockImplementation((key, defaultValue) => {
				if (key === "magecode.enabled") {
					return defaultValue // Simulate setting not being present, use default
				}
				return undefined
			}),
		}
		getConfigurationMock.mockReturnValue(mockConfig)

		expect(isMageCodeEnabled()).toBe(true)
		expect(getConfigurationMock).toHaveBeenCalledWith("mage-code")
		expect(mockConfig.get).toHaveBeenCalledWith("magecode.enabled", true)
	})

	it("isMageCodeEnabled should return the configured value (true)", () => {
		const mockConfig = {
			get: jest.fn().mockImplementation((key) => {
				if (key === "magecode.enabled") {
					return true // Simulate setting is explicitly true
				}
				return undefined
			}),
		}
		getConfigurationMock.mockReturnValue(mockConfig)

		expect(isMageCodeEnabled()).toBe(true)
		expect(mockConfig.get).toHaveBeenCalledWith("magecode.enabled", true)
	})

	it("isMageCodeEnabled should return the configured value (false)", () => {
		const mockConfig = {
			get: jest.fn().mockImplementation((key) => {
				if (key === "magecode.enabled") {
					return false // Simulate setting is explicitly false
				}
				return undefined
			}),
		}
		getConfigurationMock.mockReturnValue(mockConfig)

		expect(isMageCodeEnabled()).toBe(false)
		expect(mockConfig.get).toHaveBeenCalledWith("magecode.enabled", true)
	})
})

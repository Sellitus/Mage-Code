import { DatabaseManager, type CodeElement } from "../databaseManager"
import * as vscode from "vscode"
import * as fs from "fs"
import * as path from "path"
// Import the type only, the implementation will be mocked
import type BetterSqlite3 from "better-sqlite3"

// Mock vscode and fs modules
// Define a mutable variable for workspace folders to allow modification in tests
let mockWorkspaceFolders: vscode.WorkspaceFolder[] | undefined = [
	{
		uri: {
			fsPath: "/mock/workspace",
		} as vscode.Uri, // Cast to satisfy type, mock doesn't need full Uri implementation
		name: "mock-workspace",
		index: 0,
	},
]

jest.mock("vscode", () => ({
	Disposable: class Disposable {
		// eslint-disable-next-line @typescript-eslint/no-empty-function
		dispose() {}
	},
	workspace: {
		// Use a getter to access the mutable mockWorkspaceFolders
		get workspaceFolders() {
			return mockWorkspaceFolders
		},
		// Add other workspace properties if needed by the code under test
	},
	window: {
		showErrorMessage: jest.fn(),
	},
	// Add other top-level vscode properties if needed
}))

jest.mock("fs", () => ({
	// eslint-disable-next-line @typescript-eslint/no-empty-function
	mkdirSync: jest.fn(),
	// Add other fs functions if needed by DatabaseManager, though initialize primarily uses mkdirSync
}))

// Mock the better-sqlite3 module
const mockStatement = {
	get: jest.fn(),
	all: jest.fn(),
	run: jest.fn(),
}
// Mock transaction to immediately execute the passed function
// Mock the function returned by db.transaction()
// This function will receive the actual data array when called
const mockTransactionExecutor = jest.fn()

const mockDbInstance = {
	prepare: jest.fn(() => mockStatement),
	exec: jest.fn(),
	// Return a function that takes the user's transaction function
	// transaction itself receives the user's function
	transaction: jest.fn((userFunction) => {
		// When the executor is called, it should run the user's function
		mockTransactionExecutor.mockImplementation((...args) => {
			// Clear previous run calls specific to this transaction execution
			mockStatement.run.mockClear()
			// Execute the user's function with the arguments passed to the executor
			userFunction(...args)
		})
		// Return the mock executor function
		return mockTransactionExecutor
	}),
	close: jest.fn(),
	open: true, // Start as open
}

// The actual mock implementation
jest.mock("better-sqlite3", () => {
	return jest.fn().mockImplementation(() => {
		// Reset mocks for each new instance if needed, though typically one instance per test
		mockStatement.get.mockClear()
		mockStatement.all.mockClear()
		mockStatement.run.mockClear()
		mockDbInstance.prepare.mockClear()
		mockDbInstance.exec.mockClear()
		mockDbInstance.transaction.mockClear()
		mockTransactionExecutor.mockClear() // Also clear the executor mock
		mockDbInstance.close.mockClear()
		mockDbInstance.open = true // Ensure it's reset to open
		return mockDbInstance
	})
})

describe("DatabaseManager", () => {
	let dbManager: DatabaseManager
	let mockMkdirSync: jest.Mock
	// No longer need direct access to a real DB instance in most tests
	// let db: BetterSqlite3.Database

	beforeEach(() => {
		// Reset mocks before each test
		// Reset vscode mock parts
		;(vscode.window.showErrorMessage as jest.Mock).mockClear()
		// Reset the workspace folders to the default mock for each test
		mockWorkspaceFolders = [
			{
				uri: { fsPath: "/mock/workspace" } as vscode.Uri,
				name: "mock-workspace",
				index: 0,
			},
		]

		// Reset fs mock
		mockMkdirSync = fs.mkdirSync as jest.Mock
		// Restore default implementation for fs.mkdirSync (in case a test mocked it to throw)
		mockMkdirSync.mockImplementation(undefined) // Or jest.fn() if default is just a simple mock
		mockMkdirSync.mockClear()

		// Restore default implementation for the Database constructor mock
		const DatabaseMock = require("better-sqlite3")
		DatabaseMock.mockImplementation(() => {
			// Reset internal mock states for the DB instance
			mockStatement.get.mockClear()
			mockStatement.all.mockClear()
			mockStatement.run.mockClear()
			mockDbInstance.prepare.mockClear()
			mockDbInstance.exec.mockClear()
			mockDbInstance.transaction.mockClear()
			mockTransactionExecutor.mockClear() // Also clear the executor mock
			mockDbInstance.close.mockClear()
			mockDbInstance.open = true
			return mockDbInstance
		})
		DatabaseMock.mockClear() // Clear calls to the constructor itself

		// Clear other mocks
		;(vscode.window.showErrorMessage as jest.Mock).mockClear()

		// Create a new instance for each test, which will get the mocked DB
		dbManager = new DatabaseManager()
	})

	afterEach(() => {
		// No need to close the mock DB or restore constructor
		// Dispose the manager if initialize was called
		dbManager.dispose()
	})

	describe("initialize", () => {
		it("should create the .magecode/intelligence directory", () => {
			dbManager.initialize()
			const expectedPath = path.join("/mock/workspace", ".magecode", "intelligence")
			expect(mockMkdirSync).toHaveBeenCalledWith(expectedPath, { recursive: true })
		})

		it("should create a database instance", () => {
			dbManager.initialize()
			// Check if the mocked constructor was called
			const DatabaseMock = require("better-sqlite3")
			expect(DatabaseMock).toHaveBeenCalledWith(
				path.join("/mock/workspace", ".magecode", "intelligence", "intelligence.db"),
				{ verbose: console.log },
			)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((dbManager as any).db).toBeDefined()
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((dbManager as any).db.open).toBe(true) // Check mock property
		})

		it("should run migrations and create table and index", () => {
			dbManager.initialize()
			// Check if migrations were executed via the mock
			expect(mockDbInstance.exec).toHaveBeenCalledTimes(2)
			expect(mockDbInstance.exec).toHaveBeenCalledWith(
				expect.stringContaining("CREATE TABLE IF NOT EXISTS code_elements"),
			)
			expect(mockDbInstance.exec).toHaveBeenCalledWith(
				expect.stringContaining("CREATE INDEX IF NOT EXISTS idx_code_elements_file_path"),
			)
		})

		it("should throw an error if workspaceFolders is empty", () => {
			// Modify the mock state for this specific test
			mockWorkspaceFolders = undefined
			expect(() => dbManager.initialize()).toThrow(
				"MageCode: Cannot initialize database without an open workspace.",
			)
			// No need to restore mockWorkspaceFolders here, beforeEach handles it for the next test
		})

		it("should throw if mkdirSync fails", () => {
			const mkdirError = new Error("Permission denied")
			mockMkdirSync.mockImplementation(() => {
				throw mkdirError
			})
			expect(() => dbManager.initialize()).toThrow(
				"MageCode: Failed to create storage directory. Permission denied",
			)
		})

		it("should throw if database connection fails", () => {
			const dbError = new Error("Disk full")
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			// Modify the top-level mock's behavior for this specific test
			const DatabaseMock = require("better-sqlite3")
			DatabaseMock.mockImplementationOnce(() => {
				throw dbError
			})
			expect(() => dbManager.initialize()).toThrow("MageCode: Failed to open database. Disk full")
		})
	})

	describe("with initialized DB", () => {
		const element1: CodeElement = {
			file_path: "/test/file1.ts",
			type: "function",
			name: "func1",
			content: "() => {}",
			start_line: 1,
			end_line: 3,
			last_modified: Date.now(),
		}
		const element2: CodeElement = {
			file_path: "/test/file1.ts",
			type: "variable",
			name: "var1",
			content: " = 1",
			start_line: 5,
			end_line: 5,
			last_modified: Date.now(),
		}
		const element3: CodeElement = {
			file_path: "/test/file2.ts",
			type: "class",
			name: "MyClass",
			content: "class {}",
			start_line: 10,
			end_line: 20,
			last_modified: Date.now(),
		}

		// Remove nested beforeEach; initialize() will be called in each test

		describe("storeCodeElements", () => {
			it("should insert multiple elements in a transaction", () => {
				dbManager.initialize() // Initialize here
				const elementsToStore = [element1, element2]
				// Spy on the transaction method
				// Transaction is now mocked at the top level

				dbManager.storeCodeElements(elementsToStore)

				// Check if the transaction function was called
				expect(mockDbInstance.transaction).toHaveBeenCalledTimes(1)
				// Check if the prepare method was called (inside storeCodeElements)
				expect(mockDbInstance.prepare).toHaveBeenCalledWith(
					expect.stringContaining("INSERT OR REPLACE INTO code_elements"),
				)
				// Check if the statement's run method was called within the transaction
				// The mockTransaction immediately calls the function passed to it
				expect(mockStatement.run).toHaveBeenCalledTimes(elementsToStore.length)
				expect(mockStatement.run).toHaveBeenCalledWith(expect.objectContaining({ name: element1.name }))
				expect(mockStatement.run).toHaveBeenCalledWith(expect.objectContaining({ name: element2.name }))
			})

			it("should replace an element if ID is provided and exists", () => {
				dbManager.initialize() // Initialize here
				// Insert initial element
				// Mock prepare/run for the initial insert if needed, or assume it works
				mockStatement.run.mockClear() // Clear previous calls if any
				// Simulate initial insert for setup (doesn't actually insert in mock)
				dbManager.storeCodeElements([element1])
				const initialId = 1 // Assume an ID for testing replace

				// Clear mocks before the call under test
				mockStatement.run.mockClear()
				mockDbInstance.prepare.mockClear()
				mockDbInstance.transaction.mockClear()

				// Create updated element with the same ID
				const updatedElement1: CodeElement = {
					...element1,
					id: initialId,
					content: "updated content",
					last_modified: Date.now() + 1000, // Ensure different timestamp
				}

				dbManager.storeCodeElements([updatedElement1])

				// Check that storeCodeElements was called with the updated element
				expect(mockDbInstance.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT OR REPLACE"))
				expect(mockStatement.run).toHaveBeenCalledTimes(1)
				expect(mockStatement.run).toHaveBeenCalledWith(
					expect.objectContaining({
						id: initialId,
						name: updatedElement1.name,
						content: "updated content",
					}),
				)
			})

			it("should insert a new element if ID is provided but does not exist", () => {
				dbManager.initialize() // Initialize here
				const elementWithNonExistentId: CodeElement = {
					...element1,
					id: 999, // Non-existent ID
				}
				dbManager.storeCodeElements([elementWithNonExistentId])

				// Check mocks
				expect(mockDbInstance.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT OR REPLACE"))
				expect(mockStatement.run).toHaveBeenCalledTimes(1)
				expect(mockStatement.run).toHaveBeenCalledWith(
					expect.objectContaining({ id: 999, name: element1.name }),
				)
			})

			it("should handle empty array gracefully", () => {
				dbManager.initialize() // Initialize here
				expect(() => dbManager.storeCodeElements([])).not.toThrow()
				// Check mocks - prepare shouldn't be called if array is empty
				expect(mockDbInstance.prepare).not.toHaveBeenCalled()
			})
		})

		describe("getCodeElementById", () => {
			it("should retrieve an element by its ID", () => {
				dbManager.initialize() // Initialize here
				// Arrange: Mock the 'get' method to return element1 when called with ID 1
				const targetId = 1
				mockStatement.get.mockReturnValueOnce(element1) // Simulate finding the element

				// Act
				const retrieved = dbManager.getCodeElementById(targetId)

				// Assert
				expect(mockDbInstance.prepare).toHaveBeenCalledWith("SELECT * FROM code_elements WHERE id = ?")
				expect(mockStatement.get).toHaveBeenCalledWith(targetId)
				expect(retrieved).toEqual(element1)
			})

			it("should return undefined for a non-existent ID", () => {
				dbManager.initialize() // Initialize here
				// Arrange: Mock 'get' to return undefined
				mockStatement.get.mockReturnValueOnce(undefined)
				// Act
				const retrieved = dbManager.getCodeElementById(999)
				// Assert
				expect(mockDbInstance.prepare).toHaveBeenCalledWith("SELECT * FROM code_elements WHERE id = ?")
				expect(mockStatement.get).toHaveBeenCalledWith(999)
				expect(retrieved).toBeUndefined()
			})
		})

		describe("getCodeElementsByFilePath", () => {
			it("should retrieve all elements for a given file path, ordered by start_line", () => {
				dbManager.initialize() // Initialize here
				// Arrange: Mock 'all' to return elements for the specific path
				const filePath = "/test/file1.ts"
				const expectedElements = [element1, element2] // Assume these match the path
				mockStatement.all.mockReturnValueOnce(expectedElements)

				// Act
				const retrieved = dbManager.getCodeElementsByFilePath(filePath)

				// Assert
				expect(mockDbInstance.prepare).toHaveBeenCalledWith(
					"SELECT * FROM code_elements WHERE file_path = ? ORDER BY start_line",
				)
				expect(mockStatement.all).toHaveBeenCalledWith(filePath)
				expect(retrieved).toEqual(expectedElements)
			})

			it("should return an empty array if no elements match the file path", () => {
				dbManager.initialize() // Initialize here
				// Arrange: Mock 'all' to return empty array
				const filePath = "/test/nonexistent.ts"
				mockStatement.all.mockReturnValueOnce([])
				// Act
				const retrieved = dbManager.getCodeElementsByFilePath(filePath)
				// Assert
				expect(mockDbInstance.prepare).toHaveBeenCalledWith(
					"SELECT * FROM code_elements WHERE file_path = ? ORDER BY start_line",
				)
				expect(mockStatement.all).toHaveBeenCalledWith(filePath)
				expect(retrieved).toEqual([])
			})
		})

		describe("deleteCodeElementsByFilePath", () => {
			it("should delete all elements for a given file path", () => {
				dbManager.initialize() // Initialize here
				// Arrange: Mock 'run' to return info about changes
				const filePath = "/test/file1.ts"
				const changesCount = 2
				mockStatement.run.mockReturnValueOnce({ changes: changesCount, lastInsertRowid: 0 })

				// Act
				const deletedCount = dbManager.deleteCodeElementsByFilePath(filePath)

				// Assert
				expect(mockDbInstance.prepare).toHaveBeenCalledWith("DELETE FROM code_elements WHERE file_path = ?")
				expect(mockStatement.run).toHaveBeenCalledWith(filePath)
				expect(deletedCount).toBe(changesCount)
			})

			it("should return 0 if no elements match the file path", () => {
				dbManager.initialize() // Initialize here
				// Arrange: Mock 'run' to return 0 changes
				const filePath = "/test/file1.ts"
				mockStatement.run.mockReturnValueOnce({ changes: 0, lastInsertRowid: 0 })
				// Act
				const deletedCount = dbManager.deleteCodeElementsByFilePath(filePath)
				// Assert
				expect(mockDbInstance.prepare).toHaveBeenCalledWith("DELETE FROM code_elements WHERE file_path = ?")
				expect(mockStatement.run).toHaveBeenCalledWith(filePath)
				expect(deletedCount).toBe(0)
			})
		})
	}) // End describe 'with initialized DB'

	describe("dispose", () => {
		it("should close the database connection if open", () => {
			dbManager.initialize() // Open the connection
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const dbInstance = (dbManager as any).db // This is now the mock instance
			expect(dbInstance).toBeDefined()
			expect(dbInstance.open).toBe(true)

			dbManager.dispose()

			expect(mockDbInstance.close).toHaveBeenCalledTimes(1)
			// We don't explicitly set open to false in the mock, but we check close was called
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((dbManager as any).db).toBeUndefined() // Should be set to undefined
		})

		it("should not throw if dispose is called multiple times", () => {
			dbManager.initialize()
			dbManager.dispose()
			expect(() => dbManager.dispose()).not.toThrow()
		})

		it("should not throw if dispose is called before initialize", () => {
			expect(() => dbManager.dispose()).not.toThrow()
		})

		it("should not throw if initialize failed and dispose is called", () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			// Modify the top-level mock's behavior
			const DatabaseMock = require("better-sqlite3")
			DatabaseMock.mockImplementationOnce(() => {
				throw new Error("DB init failed")
			})
			try {
				dbManager.initialize()
			} catch (e) {
				// Expected failure
			}
			expect(() => dbManager.dispose()).not.toThrow()
		})
	})
})

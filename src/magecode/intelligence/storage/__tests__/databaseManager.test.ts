jest.mock("vscode") // Mock the entire vscode module

import { DatabaseManager } from "../databaseManager"
import { CodeElement, ElementType } from "../../types" // Updated import
import * as vscode from "vscode"
import * as fs from "fs"
import * as path from "path"
// Import the type only, the implementation will be mocked
import type BetterSqlite3 from "better-sqlite3"
import { DatabaseError } from "../../../utils/errors" // Import custom error

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

// This specific mock overrides the global one for this suite
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
		// Add the missing mock here for createOutputChannel
		createOutputChannel: jest.fn().mockReturnValue({
			appendLine: jest.fn(),
			show: jest.fn(),
			dispose: jest.fn(),
		}),
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
		// Reset vscode mock parts (accessing the mocked module)
		const mockedVscode = require("vscode")
		mockedVscode.window.showErrorMessage.mockClear()
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
				// The verbose option was removed, so don't expect it here anymore
				// { verbose: console.log },
			)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((dbManager as any).db).toBeDefined()
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((dbManager as any).db.open).toBe(true) // Check mock property
		})

		it("should run migrations and create table and index", () => {
			dbManager.initialize()
			// Check if migrations were executed via the mock (3 times: tables, indices, schema_version)
			expect(mockDbInstance.exec).toHaveBeenCalledTimes(3)
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
			// Expect DatabaseError with the correct message and cause
			expect(() => dbManager.initialize()).toThrow(
				new DatabaseError(
					`MageCode: Failed to create storage directory at ${path.join(
						"/mock/workspace",
						".magecode",
						"intelligence",
					)}`,
					mkdirError,
				),
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
			// Expect DatabaseError with the correct message and cause
			expect(() => dbManager.initialize()).toThrow(
				new DatabaseError(
					`MageCode: Failed to open or create database at ${path.join(
						"/mock/workspace",
						".magecode",
						"intelligence",
						"intelligence.db",
					)}`,
					dbError,
				),
			)
		})
	})

	describe("with initialized DB", () => {
		// Updated test data to match intelligence/types.ts CodeElement
		const element1: CodeElement = {
			id: "1",
			filePath: "/test/file1.ts",
			type: "function", // Valid ElementType
			name: "func1",
			content: "() => {}",
			startLine: 1,
			endLine: 3,
			// lastModified removed
			// startPosition removed
			// endPosition removed
		}
		const element2: CodeElement = {
			id: "2",
			filePath: "/test/file1.ts",
			type: "variable", // Valid ElementType
			name: "var1",
			content: " = 1",
			startLine: 5,
			endLine: 5,
			// lastModified removed
			// startPosition removed
			// endPosition removed
		}
		const element3: CodeElement = {
			id: "3",
			filePath: "/test/file2.ts",
			type: "class", // Valid ElementType
			name: "MyClass",
			content: "class {}",
			startLine: 10,
			endLine: 20,
			// lastModified removed
			// startPosition removed
			// endPosition removed
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
				const initialElement: CodeElement = { ...element1, id: "1" } // Explicit type
				dbManager.storeCodeElements([initialElement])
				const initialId = "1" // Use string ID

				// Clear mocks before the call under test
				mockStatement.run.mockClear()
				mockDbInstance.prepare.mockClear()
				mockDbInstance.transaction.mockClear()

				// Create updated element with the same ID
				const updatedElement1: CodeElement = {
					// Explicit type
					...element1,
					id: initialId, // Use string ID
					content: "updated content",
					// lastModified removed
				}

				dbManager.storeCodeElements([updatedElement1])

				// Check that storeCodeElements was called with the updated element
				expect(mockDbInstance.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT OR REPLACE"))
				expect(mockStatement.run).toHaveBeenCalledTimes(1)
				expect(mockStatement.run).toHaveBeenCalledWith(
					expect.objectContaining({
						id: initialId, // Use string ID
						name: updatedElement1.name,
						content: "updated content",
					}),
				)
			})

			it("should insert a new element if ID is provided but does not exist", () => {
				dbManager.initialize() // Initialize here
				const elementWithNonExistentId: CodeElement = {
					// Explicit type
					...element1,
					id: "999", // Non-existent ID
				}
				dbManager.storeCodeElements([elementWithNonExistentId])

				// Check mocks
				expect(mockDbInstance.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT OR REPLACE"))
				expect(mockStatement.run).toHaveBeenCalledTimes(1)
				expect(mockStatement.run).toHaveBeenCalledWith(
					expect.objectContaining({ id: "999", name: element1.name }),
				)
			})

			it("should handle empty array gracefully", () => {
				dbManager.initialize() // Initialize here
				expect(() => dbManager.storeCodeElements([])).not.toThrow()
				// Check mocks - prepare shouldn't be called if array is empty
				expect(mockDbInstance.prepare).not.toHaveBeenCalled()
			})
			it("should store and retrieve elements with parent_id and metadata", () => {
				dbManager.initialize()
				// Define elements using the correct CodeElement type
				const parentElementData: CodeElement = {
					id: "42",
					filePath: "/test/file3.ts",
					type: "class", // Valid ElementType
					name: "ParentClass",
					content: "class ParentClass {}",
					startLine: 0,
					endLine: 10,
					metadata: { visibility: "public" },
				}
				const childElementData: CodeElement = {
					id: "43",
					filePath: "/test/file3.ts",
					type: "method", // Valid ElementType
					name: "childMethod",
					content: "method() {}",
					startLine: 2,
					endLine: 4,
					parentId: "42",
					metadata: { returnType: "void" },
				}

				dbManager.storeCodeElements([parentElementData, childElementData])

				// Check that run was called with data matching the DB schema
				expect(mockStatement.run).toHaveBeenCalledWith(
					expect.objectContaining({
						id: "42",
						file_path: "/test/file3.ts",
						type: "class",
						name: "ParentClass",
						content: "class ParentClass {}",
						start_line: 0,
						end_line: 10,
						parent_id: null, // parentId is null for parent
						metadata: JSON.stringify({ visibility: "public" }),
						// last_modified will be Date.now()
					}),
				)
				expect(mockStatement.run).toHaveBeenCalledWith(
					expect.objectContaining({
						id: "43",
						file_path: "/test/file3.ts",
						type: "method",
						name: "childMethod",
						content: "method() {}",
						start_line: 2,
						end_line: 4,
						parent_id: "42", // parentId is set for child
						metadata: JSON.stringify({ returnType: "void" }),
						// last_modified will be Date.now()
					}),
				)
			})
		})

		describe("getCodeElementById", () => {
			it("should retrieve an element by its ID", () => {
				dbManager.initialize() // Initialize here
				const targetId = "1"
				// Mock SQL row result format with snake_case keys
				const mockDbRow = {
					id: "1",
					content: "() => {}",
					file_path: "/test/file1.ts",
					type: "function",
					name: "func1",
					start_line: 1,
					end_line: 3,
					last_modified: Date.now(),
					metadata: JSON.stringify({ test: true }),
				}
				mockStatement.get.mockReturnValueOnce(mockDbRow)

				// Act
				const retrieved = dbManager.getCodeElementById(targetId)

				// Assert
				expect(mockDbInstance.prepare).toHaveBeenCalledWith("SELECT * FROM code_elements WHERE id = ?")
				expect(mockStatement.get).toHaveBeenCalledWith(targetId)
				// Assert against the expected CodeElement structure (no lastModified, start/endPosition)
				expect(retrieved).toEqual({
					id: mockDbRow.id,
					content: mockDbRow.content,
					filePath: mockDbRow.file_path,
					type: mockDbRow.type as ElementType, // Cast type from DB
					name: mockDbRow.name,
					startLine: mockDbRow.start_line,
					endLine: mockDbRow.end_line,
					// lastModified removed
					// startPosition removed
					// endPosition removed
					metadata: JSON.parse(mockDbRow.metadata),
					parentId: undefined, // Assuming parent_id was null in mockDbRow
				})
			})

			it("should return undefined for a non-existent ID", () => {
				dbManager.initialize() // Initialize here
				// Arrange: Mock 'get' to return undefined
				mockStatement.get.mockReturnValueOnce(undefined)
				// Act
				const retrieved = dbManager.getCodeElementById("999")
				// Assert
				expect(mockDbInstance.prepare).toHaveBeenCalledWith("SELECT * FROM code_elements WHERE id = ?")
				expect(mockStatement.get).toHaveBeenCalledWith("999")
				expect(retrieved).toBeUndefined()
			})
		})

		describe("getCodeElementsByFilePath", () => {
			it("should retrieve all elements for a given file path, ordered by start_line", () => {
				dbManager.initialize() // Initialize here
				const filePath = "/test/file1.ts"
				// Mock SQL row results with snake_case keys
				const mockDbRows = [
					{
						id: "1",
						content: "() => {}",
						file_path: filePath,
						type: "function",
						name: "func1",
						start_line: 1,
						end_line: 3,
						last_modified: Date.now(),
						metadata: JSON.stringify({ test: true }),
					},
					{
						id: "2",
						content: " = 1",
						file_path: filePath,
						type: "variable",
						name: "var1",
						start_line: 5,
						end_line: 5,
						last_modified: Date.now(),
						metadata: null,
					},
				]
				mockStatement.all.mockReturnValueOnce(mockDbRows)

				// Act
				const retrieved = dbManager.getCodeElementsByFilePath(filePath)

				// Assert
				expect(mockDbInstance.prepare).toHaveBeenCalledWith(
					"SELECT * FROM code_elements WHERE file_path = ? ORDER BY start_line",
				)
				expect(mockStatement.all).toHaveBeenCalledWith(filePath)
				// Assert against the expected CodeElement structure
				expect(retrieved).toEqual(
					mockDbRows.map((row) => ({
						id: row.id,
						content: row.content,
						filePath: row.file_path,
						type: row.type as ElementType, // Cast type from DB
						name: row.name,
						startLine: row.start_line,
						endLine: row.end_line,
						// lastModified removed
						// startPosition removed
						// endPosition removed
						metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
						parentId: undefined, // Assuming parent_id was null in mockDbRows
					})),
				)
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

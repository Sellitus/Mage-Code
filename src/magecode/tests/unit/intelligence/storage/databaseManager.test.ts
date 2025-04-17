import * as vscode from "vscode"
import * as fs from "fs"
import * as path from "path"
import Database from "better-sqlite3"
import { DatabaseManager } from "../../../../intelligence/storage/databaseManager"
import { CodeElement, ElementType } from "../../../../intelligence/types" // Updated import
import { logger } from "../../../../utils/logging"
import { ConfigurationError, DatabaseError } from "../../../../utils/errors"

// --- Mocks ---
jest.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [], // Default to no workspace
		getConfiguration: jest.fn(), // Add mocks for other vscode APIs if needed
	},
	Uri: {
		file: jest.fn((p) => ({ fsPath: p })), // Mock Uri.file
	},
}))

jest.mock("fs", () => ({
	mkdirSync: jest.fn(),
	// Add mocks for other fs functions if needed
}))

jest.mock("better-sqlite3")

jest.mock("../../../../utils/logging", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(), // Add debug if used by Database verbose logging
	},
}))
// --- End Mocks ---

describe("DatabaseManager", () => {
	let dbManager: DatabaseManager
	let mockDb: {
		exec: jest.Mock
		prepare: jest.Mock
		transaction: jest.Mock
		close: jest.Mock
		open: boolean
	}
	let mockStmt: {
		run: jest.Mock
		get: jest.Mock
		all: jest.Mock
	}

	const mockWorkspaceFolder = {
		uri: vscode.Uri.file("/test/workspace"),
		name: "test-workspace",
		index: 0,
	}
	const expectedDbPath = path.join(mockWorkspaceFolder.uri.fsPath, ".magecode", "intelligence", "intelligence.db")
	const expectedStorageDir = path.dirname(expectedDbPath)

	beforeEach(() => {
		jest.clearAllMocks()

		// Setup mock DB and statement objects
		mockStmt = {
			run: jest.fn(),
			get: jest.fn(),
			all: jest.fn(),
		}
		mockDb = {
			exec: jest.fn(),
			prepare: jest.fn().mockReturnValue(mockStmt),
			transaction: jest.fn((fn) => fn), // Mock transaction to just execute the function
			close: jest.fn(),
			open: true, // Default to open
		}
		;(Database as unknown as jest.Mock).mockImplementation(() => mockDb)

		// Default workspace setup
		;(vscode.workspace.workspaceFolders as any) = [mockWorkspaceFolder]

		dbManager = new DatabaseManager()
	})

	afterEach(() => {
		// Ensure dispose is called if dbManager was initialized
		if ((dbManager as any).db) {
			dbManager.dispose()
		}
	})

	describe("initialize", () => {
		it("should throw ConfigurationError if no workspace folder is open", () => {
			;(vscode.workspace.workspaceFolders as any) = []
			expect(() => dbManager.initialize()).toThrow(ConfigurationError)
			expect(() => dbManager.initialize()).toThrow(
				"MageCode: Cannot initialize database without an open workspace.",
			)
			expect(logger.error).toHaveBeenCalledWith("MageCode: Cannot initialize database without an open workspace.")
		})

		it("should throw DatabaseError if mkdirSync fails", () => {
			const mkdirError = new Error("Permission denied")
			;(fs.mkdirSync as jest.Mock).mockImplementation(() => {
				throw mkdirError
			})
			expect(() => dbManager.initialize()).toThrow(DatabaseError)
			expect(() => dbManager.initialize()).toThrow(
				`MageCode: Failed to create storage directory at ${expectedStorageDir}`,
			)
			expect(logger.error).toHaveBeenCalledWith(
				expect.stringContaining("Failed to create storage directory"),
				mkdirError,
			)
		})

		it("should throw DatabaseError if Database constructor fails", () => {
			const dbError = new Error("Disk full")
			;(Database as unknown as jest.Mock).mockImplementation(() => {
				throw dbError
			})
			expect(() => dbManager.initialize()).toThrow(DatabaseError)
			expect(() => dbManager.initialize()).toThrow(
				`MageCode: Failed to open or create database at ${expectedDbPath}`,
			)
			expect(logger.error).toHaveBeenCalledWith(
				expect.stringContaining("Failed to open or create database"),
				dbError,
			)
		})

		it("should call mkdirSync, create Database, and run migrations on success", () => {
			// Mock runMigrations internally to prevent actual execution during this test
			const runMigrationsSpy = jest.spyOn(dbManager as any, "runMigrations").mockImplementation(() => {})

			dbManager.initialize()

			expect(fs.mkdirSync).toHaveBeenCalledWith(expectedStorageDir, { recursive: true })
			expect(Database).toHaveBeenCalledWith(expectedDbPath)
			expect(runMigrationsSpy).toHaveBeenCalledTimes(1)
			expect(logger.info).toHaveBeenCalledWith("Initializing DatabaseManager...")
			expect(logger.info).toHaveBeenCalledWith(`Ensured directory exists: ${expectedStorageDir}`)
			expect(logger.info).toHaveBeenCalledWith(`Database path set to: ${expectedDbPath}`)
			expect(logger.info).toHaveBeenCalledWith("Database connection opened successfully.")

			runMigrationsSpy.mockRestore() // Clean up spy
		})

		it("should throw DatabaseError if runMigrations fails", () => {
			const migrationError = new Error("Syntax error in SQL")
			// Mock runMigrations to throw an error
			const runMigrationsSpy = jest.spyOn(dbManager as any, "runMigrations").mockImplementation(() => {
				throw migrationError
			})

			expect(() => dbManager.initialize()).toThrow(migrationError) // The original error should propagate
			expect(logger.error).toHaveBeenCalledWith(
				expect.stringContaining("Failed to open or create database"), // Error occurs after DB connection but during migration
				migrationError,
			)

			runMigrationsSpy.mockRestore()
		})
	})

	describe("runMigrations (internal)", () => {
		// Note: Testing private methods is generally discouraged, but for critical setup like migrations...
		// We test its effects via initialize or mock it there. Here, we test its direct calls.
		it("should execute schema and index creation SQL", () => {
			dbManager.initialize() // Initialize to get a db instance
			expect(mockDb.exec).toHaveBeenCalledTimes(3) // CREATE TABLES, CREATE INDICES, schema_version
			expect(mockDb.exec).toHaveBeenCalledWith(
				expect.stringContaining("CREATE TABLE IF NOT EXISTS code_elements"),
			)
			expect(mockDb.exec).toHaveBeenCalledWith(
				expect.stringContaining("CREATE TABLE IF NOT EXISTS element_relations"),
			)
			expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining("CREATE INDEX IF NOT EXISTS"))
			expect(mockDb.exec).toHaveBeenCalledWith(
				expect.stringContaining("CREATE TABLE IF NOT EXISTS schema_version"),
			)
			expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining("INSERT OR REPLACE INTO schema_version"))
		})

		it("should log error and not execute if db is not available", () => {
			// Access private method for testing (use with caution)
			;(dbManager as any).runMigrations()
			expect(logger.error).toHaveBeenCalledWith("Migration skipped: Database connection is not available.")
			expect(mockDb.exec).not.toHaveBeenCalled()
		})

		it("should throw DatabaseError if db.exec fails", () => {
			const execError = new Error("SQL error")
			mockDb.exec.mockImplementation(() => {
				throw execError
			})

			// Need to initialize first to set up the db instance
			expect(() => dbManager.initialize()).toThrow(DatabaseError)
			expect(() => dbManager.initialize()).toThrow("MageCode: Failed during database migration")
			expect(logger.error).toHaveBeenCalledWith("MageCode: Failed during database migration", execError)
		})
	})

	describe("storeCodeElements", () => {
		// Updated test data to match intelligence/types.ts CodeElement
		const testElements: CodeElement[] = [
			// Explicit type annotation
			{
				id: "id1",
				filePath: "/test/file1.ts",
				type: "function", // Valid ElementType
				name: "func1",
				content: "() => {}",
				startLine: 1,
				endLine: 1,
				// lastModified removed
				// startPosition removed
				// endPosition removed
			},
			{
				id: "id2",
				filePath: "/test/file1.ts",
				type: "class", // Valid ElementType
				name: "Class1",
				content: "class {}",
				startLine: 5,
				endLine: 10,
				// lastModified removed
				parentId: "id1", // Example parent
				metadata: { exported: true }, // Example metadata
				// startPosition removed
				// endPosition removed
			},
		]

		beforeEach(() => {
			dbManager.initialize() // Ensure DB is ready
		})

		it("should throw DatabaseError if db is not available", () => {
			dbManager.dispose() // Close the DB
			expect(() => dbManager.storeCodeElements(testElements)).toThrow(DatabaseError)
			expect(() => dbManager.storeCodeElements(testElements)).toThrow(
				"Cannot store elements: Database connection is not available.",
			)
		})

		it("should return early if no elements are provided", () => {
			dbManager.storeCodeElements([])
			expect(mockDb.prepare).not.toHaveBeenCalled()
			expect(logger.info).toHaveBeenCalledWith("No elements provided to store.")
		})

		it("should prepare statement and run transaction", () => {
			dbManager.storeCodeElements(testElements)
			expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT OR REPLACE INTO code_elements"))
			expect(mockDb.transaction).toHaveBeenCalledTimes(1)
			// Transaction mock directly calls the function, so stmt.run is called inside
			expect(mockStmt.run).toHaveBeenCalledTimes(testElements.length)
		})

		it("should map CodeElement properties to database columns", () => {
			const now = Date.now()
			jest.spyOn(Date, "now").mockReturnValue(now)
			dbManager.storeCodeElements([testElements[1]]) // Store the second element with parent/metadata

			const expectedDbRow = {
				id: "id2",
				file_path: "/test/file1.ts",
				type: "class",
				name: "Class1",
				content: "class {}",
				start_line: 5,
				end_line: 10,
				last_modified: now, // Should use Date.now() as input doesn't have lastModified
				parent_id: "id1",
				metadata: JSON.stringify({ exported: true }),
			}
			;(Date.now as jest.Mock).mockRestore()

			expect(mockStmt.run).toHaveBeenCalledWith(expectedDbRow)
		})

		it("should use Date.now() for last_modified if not provided", () => {
			const now = Date.now()
			jest.spyOn(Date, "now").mockReturnValue(now)

			// Define explicitly without spread, ensuring type matches
			const elementToStore: CodeElement = {
				id: "id1", // From testElements[0]
				filePath: "/test/file1.ts",
				type: "function",
				name: "func1",
				content: "() => {}",
				startLine: 1,
				endLine: 1,
			}
			const elementsToStore: CodeElement[] = [elementToStore] // Create array

			dbManager.storeCodeElements(elementsToStore) // Pass the correctly typed array

			expect(mockStmt.run).toHaveBeenCalledWith(
				expect.objectContaining({
					last_modified: now,
					id: "id1", // Verify correct element was processed
				}),
			)
			;(Date.now as jest.Mock).mockRestore()
		})

		it("should log error if transaction fails", () => {
			const storeError = new Error("Constraint failed")
			mockStmt.run.mockImplementation(() => {
				throw storeError
			})
			// Transaction mock will propagate the error

			// We don't expect storeCodeElements to throw by default, just log
			// Pass the correctly typed testElements array directly
			dbManager.storeCodeElements(testElements)

			expect(logger.error).toHaveBeenCalledWith("MageCode: Failed to store code elements", storeError)
		})

		// Add tests specifically for upsert logic if needed
		it("should replace an existing element when storing with the same ID", () => {
			const initialElement: CodeElement = {
				// Explicit type
				id: "upsert-test",
				filePath: "/test/upsert.ts",
				type: "function", // Valid ElementType
				name: "oldFunc",
				content: "old content",
				startLine: 1,
				endLine: 1,
			}
			const updatedElement: CodeElement = {
				// Explicit type
				id: "upsert-test", // Same ID
				filePath: "/test/upsert.ts",
				type: "function", // Valid ElementType
				name: "newFunc", // Updated name
				content: "new content", // Updated content
				startLine: 1,
				endLine: 1,
			}

			dbManager.storeCodeElements([initialElement])
			dbManager.storeCodeElements([updatedElement])

			// Expect stmt.run to have been called twice with the same ID
			expect(mockStmt.run).toHaveBeenCalledTimes(2)
			expect(mockStmt.run).toHaveBeenCalledWith(expect.objectContaining({ id: "upsert-test", name: "oldFunc" }))
			expect(mockStmt.run).toHaveBeenCalledWith(expect.objectContaining({ id: "upsert-test", name: "newFunc" }))
		})

		it("should handle elements with non-existent IDs during replace (effectively inserts)", () => {
			const elementWithNonExistentId: CodeElement = {
				// Explicit type
				id: "non-existent-id",
				filePath: "/test/new.ts",
				type: "variable", // Valid ElementType
				name: "newVar",
				content: "let newVar;",
				startLine: 0,
				endLine: 0,
			}
			dbManager.storeCodeElements([elementWithNonExistentId])
			expect(mockStmt.run).toHaveBeenCalledWith(expect.objectContaining({ id: "non-existent-id" }))
		})

		it("should correctly store elements with parent IDs", () => {
			const parentElement: CodeElement = {
				// Explicit type
				id: "parent-1",
				filePath: "/test/hierarchy.ts",
				type: "class", // Valid ElementType
				name: "ParentClass",
				content: "class ParentClass {}",
				startLine: 1,
				endLine: 3,
			}
			const childElement: CodeElement = {
				// Explicit type
				id: "child-1",
				filePath: "/test/hierarchy.ts",
				type: "method", // Valid ElementType
				name: "childMethod",
				content: "childMethod() {}",
				startLine: 2,
				endLine: 2,
				parentId: "parent-1", // Link to parent
			}
			dbManager.storeCodeElements([parentElement, childElement])
			expect(mockStmt.run).toHaveBeenCalledWith(expect.objectContaining({ id: "parent-1", parent_id: null }))
			expect(mockStmt.run).toHaveBeenCalledWith(expect.objectContaining({ id: "child-1", parent_id: "parent-1" }))
		})
	})

	describe("getCodeElementById", () => {
		const testId = "test-id"
		// dbRow still contains last_modified as it comes from DB
		const dbRow: any = {
			id: testId,
			file_path: "/test/file.js",
			type: "variable", // This should be cast to ElementType
			name: "myVar",
			content: "const myVar = 1;",
			start_line: 10,
			end_line: 10,
			last_modified: 1678880000000,
			parent_id: null,
			metadata: JSON.stringify({ type: "const" }),
		}

		beforeEach(() => {
			dbManager.initialize()
		})

		it("should throw DatabaseError if db is not available", () => {
			dbManager.dispose()
			expect(() => dbManager.getCodeElementById(testId)).toThrow(DatabaseError)
			expect(() => dbManager.getCodeElementById(testId)).toThrow(
				"Cannot get element by ID: Database connection is not available.",
			)
		})

		it("should prepare statement and call get with id", () => {
			dbManager.getCodeElementById(testId)
			expect(mockDb.prepare).toHaveBeenCalledWith("SELECT * FROM code_elements WHERE id = ?")
			expect(mockStmt.get).toHaveBeenCalledWith(testId)
		})

		it("should return undefined if element is not found", () => {
			mockStmt.get.mockReturnValue(undefined)
			const result = dbManager.getCodeElementById(testId)
			expect(result).toBeUndefined()
		})

		it("should map database row to CodeElement object", () => {
			mockStmt.get.mockReturnValue(dbRow)
			const result = dbManager.getCodeElementById(testId)

			// Expected element matches intelligence/types.ts CodeElement
			const expectedElement: CodeElement = {
				id: testId,
				filePath: "/test/file.js",
				type: "variable", // Casted type
				name: "myVar",
				content: "const myVar = 1;",
				startLine: 10,
				endLine: 10,
				// lastModified removed
				// startPosition removed
				// endPosition removed
				parentId: undefined, // Map null to undefined
				metadata: { type: "const" }, // Parsed JSON
			}
			expect(result).toEqual(expectedElement)
		})

		it("should handle null metadata", () => {
			mockStmt.get.mockReturnValue({ ...dbRow, metadata: null })
			const result = dbManager.getCodeElementById(testId)
			expect(result?.metadata).toBeUndefined()
		})

		it("should log error and return undefined if stmt.get fails", () => {
			const getError = new Error("Query failed")
			mockStmt.get.mockImplementation(() => {
				throw getError
			})

			const result = dbManager.getCodeElementById(testId)

			expect(result).toBeUndefined()
			expect(logger.error).toHaveBeenCalledWith(
				`MageCode: Failed to retrieve code element with ID ${testId}`,
				getError,
			)
		})
	})

	describe("getCodeElementsByFilePath", () => {
		const testFilePath = "/test/path/file.py"
		// dbRows still contain last_modified
		const dbRows: any[] = [
			{
				id: "id1",
				file_path: testFilePath,
				type: "function", // Cast to ElementType
				name: "func1",
				content: "def func1(): pass",
				start_line: 5,
				end_line: 6,
				last_modified: 1678880000000,
				parent_id: null,
				metadata: null,
			},
			{
				id: "id2",
				file_path: testFilePath,
				type: "class", // Cast to ElementType
				name: "MyClass",
				content: "class MyClass: pass",
				start_line: 1,
				end_line: 2,
				last_modified: 1678880000000,
				parent_id: null,
				metadata: null,
			},
		]

		beforeEach(() => {
			dbManager.initialize()
		})

		it("should throw DatabaseError if db is not available", () => {
			dbManager.dispose()
			expect(() => dbManager.getCodeElementsByFilePath(testFilePath)).toThrow(DatabaseError)
			expect(() => dbManager.getCodeElementsByFilePath(testFilePath)).toThrow(
				"Cannot get elements by file path: Database connection is not available.",
			)
		})

		it("should prepare statement and call all with file path", () => {
			dbManager.getCodeElementsByFilePath(testFilePath)
			expect(mockDb.prepare).toHaveBeenCalledWith(
				"SELECT * FROM code_elements WHERE file_path = ? ORDER BY start_line",
			)
			expect(mockStmt.all).toHaveBeenCalledWith(testFilePath)
		})

		it("should return empty array if no elements are found", () => {
			mockStmt.all.mockReturnValue([])
			const result = dbManager.getCodeElementsByFilePath(testFilePath)
			expect(result).toEqual([])
		})

		it("should map database rows to CodeElement objects, ordered by start_line", () => {
			// Return rows out of order to test sorting in query
			mockStmt.all.mockReturnValue([dbRows[0], dbRows[1]])
			const result = dbManager.getCodeElementsByFilePath(testFilePath)

			expect(result).toHaveLength(2)
			// Expect order based on start_line (id2 then id1)
			expect(result[0].id).toBe("id2")
			expect(result[1].id).toBe("id1")
			// Spot check mapping
			expect(result[0].name).toBe("MyClass")
			expect(result[1].name).toBe("func1")
			expect(result[0].type).toBe("class")
			expect(result[1].type).toBe("function")
			// Remove checks for properties no longer on the type
			// expect(result[0].startPosition).toEqual({ line: 1, column: 0 })
			// expect(result[1].startPosition).toEqual({ line: 5, column: 0 })
		})

		it("should log error and return empty array if stmt.all fails", () => {
			const allError = new Error("Query failed")
			mockStmt.all.mockImplementation(() => {
				throw allError
			})

			const result = dbManager.getCodeElementsByFilePath(testFilePath)

			expect(result).toEqual([])
			expect(logger.error).toHaveBeenCalledWith(
				`MageCode: Failed to retrieve code elements for file ${testFilePath}`,
				allError,
			)
		})
	})

	describe("deleteCodeElementsByFilePath", () => {
		const testFilePath = "/test/delete/me.txt"

		beforeEach(() => {
			dbManager.initialize()
		})

		it("should throw DatabaseError if db is not available", () => {
			dbManager.dispose()
			expect(() => dbManager.deleteCodeElementsByFilePath(testFilePath)).toThrow(DatabaseError)
			expect(() => dbManager.deleteCodeElementsByFilePath(testFilePath)).toThrow(
				"Cannot delete elements: Database connection is not available.",
			)
		})

		it("should prepare statement and call run with file path", () => {
			dbManager.deleteCodeElementsByFilePath(testFilePath)
			expect(mockDb.prepare).toHaveBeenCalledWith("DELETE FROM code_elements WHERE file_path = ?")
			expect(mockStmt.run).toHaveBeenCalledWith(testFilePath)
		})

		it("should return the number of changes reported by the statement", () => {
			const changes = 5
			mockStmt.run.mockReturnValue({ changes, lastInsertRowid: 0 }) // Mock the info object
			const result = dbManager.deleteCodeElementsByFilePath(testFilePath)
			expect(result).toBe(changes)
			expect(logger.info).toHaveBeenCalledWith(`Deleted ${changes} elements for file: ${testFilePath}`)
		})

		it("should log error and return 0 if stmt.run fails", () => {
			const runError = new Error("Delete failed")
			mockStmt.run.mockImplementation(() => {
				throw runError
			})

			const result = dbManager.deleteCodeElementsByFilePath(testFilePath)

			expect(result).toBe(0)
			expect(logger.error).toHaveBeenCalledWith(
				`MageCode: Failed to delete code elements for file ${testFilePath}`,
				runError,
			)
		})
	})

	describe("dispose", () => {
		it("should close the database connection if open", () => {
			dbManager.initialize() // Ensure DB is initialized and open
			expect(mockDb.open).toBe(true) // Assume it's open after init

			dbManager.dispose()

			expect(mockDb.close).toHaveBeenCalledTimes(1)
			expect((dbManager as any).db).toBeUndefined() // Check if internal ref is cleared
			expect(logger.info).toHaveBeenCalledWith("Closing database connection...")
			expect(logger.info).toHaveBeenCalledWith("Database connection closed.")
		})

		it("should not attempt to close if connection is already closed or undefined", () => {
			// Case 1: DB not initialized
			dbManager.dispose()
			expect(mockDb.close).not.toHaveBeenCalled()

			// Case 2: DB initialized then closed
			dbManager.initialize()
			mockDb.open = false // Simulate already closed
			dbManager.dispose()
			// close() should only be called once from the initialize->dispose cycle if it was open
			expect(mockDb.close).toHaveBeenCalledTimes(0) // Should not be called again if already closed

			// Case 3: DB initialized, closed manually, then dispose called
			jest.clearAllMocks() // Reset mocks for clarity
			dbManager.initialize()
			mockDb.open = true
			mockDb.close.mockImplementation(() => {
				mockDb.open = false
			}) // Simulate close changing state
			;(dbManager as any).db.close() // Manual close
			expect(mockDb.close).toHaveBeenCalledTimes(1)
			dbManager.dispose() // Call dispose again
			expect(mockDb.close).toHaveBeenCalledTimes(1) // Should not call close again
		})

		it("should handle errors during close (optional, depends on better-sqlite3 behavior)", () => {
			const closeError = new Error("Error closing DB")
			mockDb.close.mockImplementation(() => {
				throw closeError
			})
			dbManager.initialize()

			// Depending on desired behavior, dispose might swallow or log the error
			// For now, assume it logs (though the current implementation doesn't explicitly catch close errors)
			expect(() => dbManager.dispose()).not.toThrow() // Assuming dispose doesn't re-throw close errors
			// If logging was added around db.close(), test for logger.error here
			expect(mockDb.close).toHaveBeenCalledTimes(1)
		})
	})
})

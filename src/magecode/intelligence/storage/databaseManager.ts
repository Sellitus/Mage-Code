import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import Database, { type Database as Db } from "better-sqlite3" // Use type import for clarity

// Basic interface for code elements (can be expanded later)
export interface CodeElement {
	id?: number // Optional because it's generated by the DB
	file_path: string
	type: string
	name: string
	content: string // Or potentially store AST snippet, etc.
	start_line: number
	end_line: number
	last_modified: number // Unix timestamp (milliseconds recommended for JS Date compatibility)
}

export class DatabaseManager implements vscode.Disposable {
	private db: Db | undefined
	private dbPath: string = ""

	/**
	 * Initializes the database connection, creates necessary directories, and runs migrations.
	 * Throws an error if the workspace cannot be determined or the database cannot be opened.
	 */
	public initialize(): void {
		console.log("Initializing DatabaseManager...")

		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders || workspaceFolders.length === 0) {
			throw new Error("MageCode: Cannot initialize database without an open workspace.")
		}
		const rootPath = workspaceFolders[0].uri.fsPath

		const magecodeDir = path.join(rootPath, ".magecode")
		const storageDir = path.join(magecodeDir, "intelligence") // Store DB within .magecode/intelligence

		try {
			// Ensure the full path exists
			fs.mkdirSync(storageDir, { recursive: true })
			console.log(`Ensured directory exists: ${storageDir}`)
		} catch (error: any) {
			console.error(`MageCode: Failed to create storage directory at ${storageDir}`, error)
			throw new Error(`MageCode: Failed to create storage directory. ${error.message}`)
		}

		this.dbPath = path.join(storageDir, "intelligence.db")
		console.log(`Database path set to: ${this.dbPath}`)

		try {
			this.db = new Database(this.dbPath, { verbose: console.log }) // Add verbose logging for debugging
			console.log("Database connection opened successfully.")
			this.runMigrations()
		} catch (error: any) {
			console.error(`MageCode: Failed to open or create database at ${this.dbPath}`, error)
			this.db = undefined // Ensure db is undefined on failure
			throw new Error(`MageCode: Failed to open database. ${error.message}`)
		}
	}

	/**
	 * Runs necessary database migrations to set up or update the schema.
	 */
	private runMigrations(): void {
		if (!this.db) {
			console.error("Migration skipped: Database connection is not available.")
			return
		}
		console.log("Running database migrations...")

		try {
			// Schema for code elements
			const createTableSql = `
                CREATE TABLE IF NOT EXISTS code_elements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_path TEXT NOT NULL,
                    type TEXT NOT NULL,
                    name TEXT NOT NULL,
                    content TEXT,
                    start_line INTEGER NOT NULL,
                    end_line INTEGER NOT NULL,
                    last_modified INTEGER NOT NULL
                );
            `
			this.db.exec(createTableSql)
			console.log("Table 'code_elements' ensured.")

			// Index for faster file path lookups
			const createIndexSql = `
                CREATE INDEX IF NOT EXISTS idx_code_elements_file_path
                ON code_elements (file_path);
            `
			this.db.exec(createIndexSql)
			console.log("Index 'idx_code_elements_file_path' ensured.")

			console.log("Database migrations completed successfully.")
		} catch (error: any) {
			console.error("MageCode: Failed during database migration:", error)
			// Depending on the error, might want to throw or handle differently
			throw new Error(`MageCode: Database migration failed. ${error.message}`)
		}
	}

	/**
	 * Stores multiple code elements in the database using a transaction.
	 * Replaces existing elements based on primary key (id) if provided, otherwise inserts.
	 * Note: better-sqlite3's INSERT OR REPLACE uses unique constraints, not just PK.
	 * If you need true upsert based on a different key (e.g., file_path + name + type),
	 * you might need a different strategy or adjust the schema/query.
	 * For now, assuming we fetch existing IDs first or rely on PK replacement.
	 *
	 * @param elements An array of CodeElement objects to store.
	 */
	public storeCodeElements(elements: CodeElement[]): void {
		if (!this.db) {
			console.error("Cannot store elements: Database connection is not available.")
			// Optionally throw an error or return a status
			return
		}
		if (elements.length === 0) {
			console.log("No elements provided to store.")
			return
		}

		console.log(`Storing ${elements.length} code elements...`)

		// Using INSERT OR REPLACE requires a unique constraint or PK.
		// If elements have IDs, it will replace. If not, it inserts.
		// Consider adding a UNIQUE constraint on (file_path, type, name, start_line) if needed for upserts without ID.
		const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO code_elements
            (id, file_path, type, name, content, start_line, end_line, last_modified)
            VALUES
            (@id, @file_path, @type, @name, @content, @start_line, @end_line, @last_modified)
        `)

		try {
			const insertMany = this.db.transaction((elems: CodeElement[]) => {
				for (const elem of elems) {
					// Ensure last_modified is an integer (Unix timestamp in ms)
					const elementToStore = {
						...elem,
						last_modified: Math.floor(elem.last_modified), // Ensure integer
					}
					stmt.run(elementToStore)
				}
			})

			insertMany(elements)
			console.log(`Successfully stored ${elements.length} code elements.`)
		} catch (error: any) {
			console.error("MageCode: Failed to store code elements:", error)
			// Optionally re-throw or handle
		}
	}

	/**
	 * Retrieves a single code element by its primary key (ID).
	 *
	 * @param id The ID of the code element to retrieve.
	 * @returns The CodeElement object if found, otherwise undefined.
	 */
	public getCodeElementById(id: number): CodeElement | undefined {
		if (!this.db) {
			console.error("Cannot get element by ID: Database connection is not available.")
			return undefined
		}

		try {
			const stmt = this.db.prepare("SELECT * FROM code_elements WHERE id = ?")
			const result = stmt.get(id) as CodeElement | undefined
			return result
		} catch (error: any) {
			console.error(`MageCode: Failed to retrieve code element with ID ${id}:`, error)
			return undefined
		}
	}

	/**
	 * Retrieves all code elements associated with a specific file path.
	 *
	 * @param filePath The path of the file to retrieve elements for.
	 * @returns An array of CodeElement objects found for the file path.
	 */
	public getCodeElementsByFilePath(filePath: string): CodeElement[] {
		if (!this.db) {
			console.error("Cannot get elements by file path: Database connection is not available.")
			return []
		}

		try {
			const stmt = this.db.prepare("SELECT * FROM code_elements WHERE file_path = ? ORDER BY start_line")
			const results = stmt.all(filePath) as CodeElement[]
			return results
		} catch (error: any) {
			console.error(`MageCode: Failed to retrieve code elements for file ${filePath}:`, error)
			return []
		}
	}

	/**
	 * Deletes all code elements associated with a specific file path.
	 * Useful when a file is deleted or needs a full refresh.
	 *
	 * @param filePath The path of the file whose elements should be deleted.
	 * @returns The number of rows deleted.
	 */
	public deleteCodeElementsByFilePath(filePath: string): number {
		if (!this.db) {
			console.error("Cannot delete elements: Database connection is not available.")
			return 0
		}

		console.log(`Deleting code elements for file: ${filePath}`)
		try {
			const stmt = this.db.prepare("DELETE FROM code_elements WHERE file_path = ?")
			const info = stmt.run(filePath)
			console.log(`Deleted ${info.changes} elements for file: ${filePath}`)
			return info.changes
		} catch (error: any) {
			console.error(`MageCode: Failed to delete code elements for file ${filePath}:`, error)
			return 0
		}
	}

	/**
	 * Closes the database connection when the extension is deactivated.
	 */
	public dispose(): void {
		if (this.db && this.db.open) {
			console.log("Closing database connection...")
			this.db.close()
			this.db = undefined
			console.log("Database connection closed.")
		}
	}
}

import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import Database, { type Database as Db } from "better-sqlite3" // Use type import for clarity
import { CodeElement, ElementType } from "../types" // Import CodeElement/ElementType from intelligence types
import { ElementRelation } from "../../interfaces" // Import ElementRelation from interfaces
import { logger } from "../../utils/logging" // Import the logger
import { DatabaseError, ConfigurationError } from "../../utils/errors" // Import custom errors

interface DatabaseRow {
	id: string
	file_path: string
	type: string
	name: string
	content: string
	start_line: number
	end_line: number
	last_modified: number
	parent_id: string | null
	metadata: string | null
}

/**
 * Manages the SQLite database connection and operations for storing code intelligence data.
 * Handles initialization, migrations, and CRUD operations for code elements and relations.
 * Implements vscode.Disposable to ensure the database connection is closed properly.
 */
export class DatabaseManager implements vscode.Disposable {
	private db: Db | undefined
	private dbPath: string = ""

	/**
	 * Initializes the DatabaseManager. This involves:
	 * - Determining the database path within the workspace's `.magecode` directory.
	 * - Ensuring the storage directory exists.
	 * - Opening the SQLite database connection.
	 * - Running necessary schema migrations.
	 * @throws {ConfigurationError} If no workspace folder is open.
	 * @throws {DatabaseError} If the storage directory cannot be created or the database connection fails.
	 */
	public initialize(): void {
		logger.info("Initializing DatabaseManager...")

		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders || workspaceFolders.length === 0) {
			const msg = "MageCode: Cannot initialize database without an open workspace."
			logger.error(msg)
			throw new ConfigurationError(msg) // Use ConfigurationError
		}
		const rootPath = workspaceFolders[0].uri.fsPath

		const magecodeDir = path.join(rootPath, ".magecode")
		const storageDir = path.join(magecodeDir, "intelligence") // Store DB within .magecode/intelligence

		try {
			// Ensure the full path exists
			fs.mkdirSync(storageDir, { recursive: true })
			logger.info(`Ensured directory exists: ${storageDir}`)
		} catch (error: any) {
			const msg = `MageCode: Failed to create storage directory at ${storageDir}`
			logger.error(msg, error)
			throw new DatabaseError(msg, error) // Use DatabaseError
		}

		this.dbPath = path.join(storageDir, "intelligence.db")
		logger.info(`Database path set to: ${this.dbPath}`)

		try {
			// Remove verbose console logging, rely on logger.debug if needed elsewhere
			this.db = new Database(this.dbPath /* { verbose: logger.debug } */)
			logger.info("Database connection opened successfully.")
			this.runMigrations()
		} catch (error: any) {
			const msg = `MageCode: Failed to open or create database at ${this.dbPath}`
			logger.error(msg, error)
			this.db = undefined // Ensure db is undefined on failure
			throw new DatabaseError(msg, error) // Use DatabaseError
		}
	}

	/**
	 * Runs necessary database migrations to set up or update the schema.
	 */
	private runMigrations(): void {
		if (!this.db) {
			logger.error("Migration skipped: Database connection is not available.")
			return
		}
		logger.info("Running database migrations...")

		try {
			// Schema for code elements
			const createTableSql = `
				DROP TABLE IF EXISTS code_elements_old;
				-- Create new table with TEXT IDs
				CREATE TABLE IF NOT EXISTS code_elements (
					id TEXT PRIMARY KEY,
					file_path TEXT NOT NULL,
					type TEXT NOT NULL,
					name TEXT NOT NULL,
					content TEXT,
					start_line INTEGER NOT NULL,
					end_line INTEGER NOT NULL,
					last_modified INTEGER NOT NULL,
					parent_id TEXT,
					metadata TEXT,
					FOREIGN KEY(parent_id) REFERENCES code_elements(id)
				);

				CREATE TABLE IF NOT EXISTS element_relations (
					source_id TEXT NOT NULL,
					target_id TEXT NOT NULL,
					relation_type TEXT NOT NULL,
					PRIMARY KEY (source_id, target_id, relation_type)
				);
			`
			this.db.exec(createTableSql)
			logger.info("Tables 'code_elements' and 'element_relations' ensured.")

			// Indices for faster lookups
			const createIndexSql = `
				CREATE INDEX IF NOT EXISTS idx_code_elements_file_path
					ON code_elements (file_path);
				CREATE INDEX IF NOT EXISTS idx_code_elements_parent_id
					ON code_elements (parent_id);
				CREATE INDEX IF NOT EXISTS idx_code_elements_type
					ON code_elements (type);

				CREATE INDEX IF NOT EXISTS idx_element_relations_source_id
					ON element_relations (source_id);
				CREATE INDEX IF NOT EXISTS idx_element_relations_target_id
					ON element_relations (target_id);
				CREATE INDEX IF NOT EXISTS idx_element_relations_relation_type
					ON element_relations (relation_type);
			`
			this.db.exec(createIndexSql)
			logger.info("Indices for 'code_elements' and 'element_relations' ensured.")

			// Add version tracking for future migrations
			this.db.exec(`
				CREATE TABLE IF NOT EXISTS schema_version (
					version INTEGER PRIMARY KEY,
					applied_at INTEGER NOT NULL
				);
				INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (1, ${Date.now()});
			`)
			logger.info("Schema version table ensured.")

			logger.info("Database migrations completed successfully.")
		} catch (error: any) {
			const msg = "MageCode: Failed during database migration"
			logger.error(msg, error)
			// Depending on the error, might want to throw or handle differently
			throw new DatabaseError(msg, error) // Use DatabaseError
		}
	}

	/**
	 * Stores multiple code elements in the database using a transaction.
	 * Replaces existing elements based on primary key (id) if provided, otherwise inserts.
	 * Note: better-sqlite3's INSERT OR REPLACE uses unique constraints, not just PK.
	 * If you need true upsert based on a different key (e.g., file_path + name + type),
	 * you might need a different strategy or adjust the schema/query.
	 * For now, assuming we fetch existing IDs first or rely on PK replacement.
	 * @param elements - An array of CodeElement objects to store.
	 * @throws {DatabaseError} If the database connection is not available.
	 */
	public storeCodeElements(elements: CodeElement[]): void {
		if (!this.db) {
			// Throw an error instead of just logging and returning
			throw new DatabaseError("Cannot store elements: Database connection is not available.")
		}
		if (elements.length === 0) {
			logger.info("No elements provided to store.")
			return
		}

		logger.info(`Storing ${elements.length} code elements...`)

		// Using INSERT OR REPLACE requires a unique constraint or PK.
		// If elements have IDs, it will replace. If not, it inserts.
		// Consider adding a UNIQUE constraint on (file_path, type, name, start_line) if needed for upserts without ID.
		const stmt = this.db.prepare(`
	INSERT OR REPLACE INTO code_elements
	(id, file_path, type, name, content, start_line, end_line, last_modified, parent_id, metadata)
	VALUES
	(@id, @file_path, @type, @name, @content, @start_line, @end_line, @last_modified, @parent_id, @metadata)
`)

		try {
			const insertMany = this.db.transaction((elems: CodeElement[]) => {
				for (const elem of elems) {
					// Convert from camelCase interface to snake_case DB schema
					const elementToStore = {
						id: elem.id,
						file_path: elem.filePath,
						type: elem.type,
						name: elem.name,
						content: elem.content,
						start_line: elem.startLine,
						end_line: elem.endLine,
						last_modified: Date.now(), // Use current time as lastModified doesn't exist on input type
						parent_id: elem.parentId ?? null,
						metadata: elem.metadata ? JSON.stringify(elem.metadata) : null,
					}
					stmt.run(elementToStore)
				}
			})

			insertMany(elements)
			logger.info(`Successfully stored ${elements.length} code elements.`)
		} catch (error: any) {
			const msg = "MageCode: Failed to store code elements"
			logger.error(msg, error)
			// Optionally re-throw or handle, for now just log
			// Consider throwing new DatabaseError(msg, error) if callers should handle this
		}
	}

	/**
	 * Retrieves a single code element by its primary key (ID).
	 *
	 * @param id - The unique identifier of the code element.
	 * @returns The `CodeElement` object if found, otherwise `undefined`.
	 * @throws {DatabaseError} If the database connection is not available.
	 */
	public getCodeElementById(id: string): CodeElement | undefined {
		// Return type uses the imported CodeElement
		if (!this.db) {
			// Throw an error instead of just logging and returning
			throw new DatabaseError("Cannot get element by ID: Database connection is not available.")
		}

		try {
			const stmt = this.db.prepare("SELECT * FROM code_elements WHERE id = ?")
			const row = stmt.get(id) as DatabaseRow | undefined
			if (!row) return undefined

			// Convert database row to CodeElement with proper property names
			const result: CodeElement = {
				id: row.id,
				filePath: row.file_path,
				type: row.type as ElementType, // Cast string to ElementType
				name: row.name,
				content: row.content,
				startLine: row.start_line,
				endLine: row.end_line,
				// lastModified: row.last_modified, // Property doesn't exist on target type
				// startPosition: { line: row.start_line, column: 0 }, // Property doesn't exist on target type
				// endPosition: { line: row.end_line, column: 0 }, // Property doesn't exist on target type
				parentId: row.parent_id ?? undefined,
				metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
			}
			return result
		} catch (error: any) {
			const msg = `MageCode: Failed to retrieve code element with ID ${id}`
			logger.error(msg, error)
			// Optionally re-throw or handle, for now just log and return undefined
			// Consider throwing new DatabaseError(msg, error)
			return undefined
		}
	}

	/**
	 * Retrieves all code elements associated with a specific file path.
	 *
	 * @param filePath - The absolute path of the file.
	 * @returns An array of `CodeElement` objects associated with the file, ordered by start line. Returns an empty array if none are found or an error occurs during retrieval (errors are logged).
	 * @throws {DatabaseError} If the database connection is not available.
	 */
	public getCodeElementsByFilePath(filePath: string): CodeElement[] {
		// Return type uses the imported CodeElement
		if (!this.db) {
			// Throw an error instead of just logging and returning
			throw new DatabaseError("Cannot get elements by file path: Database connection is not available.")
		}

		try {
			const stmt = this.db.prepare("SELECT * FROM code_elements WHERE file_path = ? ORDER BY start_line")
			const rows = stmt.all(filePath) as DatabaseRow[]
			return rows.map(
				(row): CodeElement => ({
					// Explicit return type for map callback
					id: row.id,
					filePath: row.file_path,
					type: row.type as ElementType, // Cast string to ElementType
					name: row.name,
					content: row.content,
					startLine: row.start_line,
					endLine: row.end_line,
					// lastModified: row.last_modified, // Property doesn't exist on target type
					// startPosition: { line: row.start_line, column: 0 }, // Property doesn't exist on target type
					// endPosition: { line: row.end_line, column: 0 }, // Property doesn't exist on target type
					parentId: row.parent_id ?? undefined,
					metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
				}),
			)
		} catch (error: any) {
			const msg = `MageCode: Failed to retrieve code elements for file ${filePath}`
			logger.error(msg, error)
			// Optionally re-throw or handle, for now just log and return empty array
			// Consider throwing new DatabaseError(msg, error)
			return []
		}
	}

	/**
	 * Deletes all code elements associated with a specific file path.
	 * Useful when a file is deleted or needs a full refresh.
	 *
	 * @param filePath - The absolute path of the file whose elements should be deleted.
	 * @returns The number of element rows deleted. Returns 0 if an error occurs (error is logged).
	 * @throws {DatabaseError} If the database connection is not available.
	 */
	public deleteCodeElementsByFilePath(filePath: string): number {
		if (!this.db) {
			// Throw an error instead of just logging and returning
			throw new DatabaseError("Cannot delete elements: Database connection is not available.")
		}

		logger.info(`Deleting code elements for file: ${filePath}`)
		try {
			const stmt = this.db.prepare("DELETE FROM code_elements WHERE file_path = ?")
			const info = stmt.run(filePath)
			logger.info(`Deleted ${info.changes} elements for file: ${filePath}`)
			return info.changes
		} catch (error: any) {
			const msg = `MageCode: Failed to delete code elements for file ${filePath}`
			logger.error(msg, error)
			// Optionally re-throw or handle, for now just log and return 0
			// Consider throwing new DatabaseError(msg, error)
			return 0
		}
	}

	/**
	 * Closes the database connection if it is open.
	 * This method is called automatically when the extension is deactivated
	 * if the DatabaseManager instance is added to the `context.subscriptions`.
	 */
	public dispose(): void {
		if (this.db && this.db.open) {
			logger.info("Closing database connection...")
			this.db.close()
			this.db = undefined
			logger.info("Database connection closed.")
		}
	}
}

import { MageParser } from "./parser/index"
import { DatabaseManager, CodeElement } from "./storage/databaseManager"
import type { ParsedFile } from "../interfaces"

/**
 * Processes a file: parses, extracts code elements, and stores them in the database.
 * @param filePath Absolute path to the file.
 * @param parser MageParser instance (must be initialized).
 * @param dbManager DatabaseManager instance (must be initialized).
 */
export async function processAndStoreFile(
	filePath: string,
	parser: MageParser,
	dbManager: DatabaseManager,
): Promise<{ success: boolean; error?: string }> {
	try {
		const parsedFile: ParsedFile = await parser.parseFile(filePath)
		if (!parsedFile.ast || parsedFile.errors.length > 0) {
			return { success: false, error: parsedFile.errors.map((e) => e.message).join("; ") }
		}
		// Map canonical CodeElement[] to storage CodeElement[]
		const now = Date.now()
		// NOTE: parent_id is set to null for now, as we do not have numeric DB IDs at extraction time.
		// TODO: After insertion, update child elements with correct parent_id if needed.
		const elements: import("./storage/databaseManager").CodeElement[] = parser
			.extractCodeElements(parsedFile)
			.map((el) => ({
				// id is omitted (let DB assign if needed)
				file_path: el.filePath,
				type: el.type,
				name: el.name,
				content: el.content,
				start_line: typeof el.startLine === "number" ? el.startLine : (el.startPosition?.line ?? 0),
				end_line: typeof el.endLine === "number" ? el.endLine : (el.endPosition?.line ?? 0),
				last_modified: now,
				parent_id: null,
				metadata: el.metadata ?? null,
			}))
		dbManager.storeCodeElements(elements)
		return { success: true }
	} catch (err: any) {
		return { success: false, error: err?.message || String(err) }
	}
}

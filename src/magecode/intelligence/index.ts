import { MageParser } from "./parser/index"
import { DatabaseManager } from "./storage/databaseManager"
import type { ParsedFile, CodeElement } from "../interfaces"

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
		const { elements } = parser.extractCodeElements(parsedFile)
		const dbElements = elements.map((el) => ({
			id: el.id,
			filePath: el.filePath,
			type: el.type,
			name: el.name,
			content: el.content,
			startLine: el.startLine,
			endLine: el.endLine,
			lastModified: now,
			startPosition: el.startPosition,
			endPosition: el.endPosition,
			parentId: el.parentId,
			metadata: el.metadata,
		}))
		dbManager.storeCodeElements(dbElements)
		return { success: true }
	} catch (err: any) {
		return { success: false, error: err?.message || String(err) }
	}
}

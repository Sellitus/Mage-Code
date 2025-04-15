import * as fs from "fs"
import * as path from "path"
import { MageParser } from "../parser" // Adjust path as needed
import { EmbeddingService } from "../embedding/embeddingService" // Adjust path as needed
import { CodeElement, ElementRelation, ParsedFile } from "../../interfaces" // Adjust path as needed
import { logger } from "../../../utils/logging" // Corrected path

// Interfaces for task data and results (can be refined)
interface SyncWorkerTask {
	filePath: string
}

interface SyncWorkerResult {
	filePath: string
	elements: CodeElement[]
	relations: ElementRelation[]
	embeddings: { elementId: string; vector: number[] }[] // Example structure
	errors: Error[]
}

let isInitialized = false
let parser: MageParser | null = null
let embeddingService: EmbeddingService | null = null

/**
 * Initializes the services needed by the worker.
 * Should be called once per worker instance.
 */
async function initializeWorker(): Promise<void> {
	if (isInitialized) return

	try {
		logger.info("[SyncWorker] Initializing...")
		await MageParser.initialize() // Initialize Tree-sitter
		parser = new MageParser()

		embeddingService = EmbeddingService.getInstance()
		await embeddingService.initialize() // Initialize ONNX Runtime and tokenizer

		isInitialized = true
		logger.info("[SyncWorker] Initialization complete.")
	} catch (error: any) {
		logger.error("[SyncWorker] Initialization failed:", error)
		// Prevent worker from processing if init fails
		isInitialized = false
		throw new Error(`SyncWorker initialization failed: ${error.message}`)
	}
}

/**
 * Processes a single file: reads, parses, extracts elements, generates embeddings.
 * This function is intended to be called by Piscina.
 * @param task - The task data containing the file path.
 * @returns The processing results.
 */
export default async function processFileTask(task: SyncWorkerTask): Promise<SyncWorkerResult> {
	const { filePath } = task
	const results: SyncWorkerResult = {
		filePath,
		elements: [],
		relations: [],
		embeddings: [],
		errors: [],
	}

	try {
		// Ensure services are initialized (idempotent)
		await initializeWorker()
		if (!isInitialized || !parser || !embeddingService) {
			throw new Error("Worker services not available after initialization attempt.")
		}

		logger.debug(`[SyncWorker] Processing file: ${filePath}`)

		// 1. Parse the file
		const parsedFile: ParsedFile = await parser.parseFile(filePath)
		if (parsedFile.errors.length > 0) {
			// Format errors for logger metadata
			const errorMeta = { parserErrors: parsedFile.errors.map((e) => e.message || String(e)) }
			logger.warn(`[SyncWorker] Parsing errors for ${filePath}`, errorMeta)
			// Decide if we proceed despite errors, for now, we continue but log
			results.errors.push(...parsedFile.errors.map((e) => new Error(e.message)))
		}
		if (!parsedFile.ast) {
			logger.warn(`[SyncWorker] No AST generated for ${filePath}, skipping element extraction/embedding.`)
			return results // Return early if no AST
		}

		// 2. Extract code elements
		const { elements, relations } = parser.extractCodeElements(parsedFile)
		results.elements = elements
		results.relations = relations
		logger.debug(
			`[SyncWorker] Extracted ${elements.length} elements and ${relations.length} relations from ${filePath}`,
		)

		// 3. Generate embeddings (Placeholder logic: embed content of functions/classes)
		const elementsToEmbed = elements.filter((el) => ["function", "class", "method"].includes(el.type))
		if (elementsToEmbed.length > 0) {
			const textsToEmbed = elementsToEmbed.map((el) => el.content) // Use full content for now
			const vectors = await embeddingService.generateEmbeddings(textsToEmbed)

			elementsToEmbed.forEach((el, index) => {
				results.embeddings.push({ elementId: el.id, vector: vectors[index] })
			})
			logger.debug(`[SyncWorker] Generated ${results.embeddings.length} embeddings for ${filePath}`)
		}

		logger.info(`[SyncWorker] Successfully processed file: ${filePath}`)
	} catch (error: any) {
		logger.error(`[SyncWorker] Error processing file ${filePath}:`, error)
		results.errors.push(error instanceof Error ? error : new Error(String(error)))
	}

	return results
}

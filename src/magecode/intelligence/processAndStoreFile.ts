import { CodeElement, ParseOptions, ParseResult } from "./types"
import { LocalCodeIntelligenceEngine, ILocalCodeIntelligence } from "./index"
import * as vscode from "vscode"

/**
 * Options for processing a file
 */
export interface ProcessFileOptions extends ParseOptions {
	/** Whether to generate embeddings */
	generateEmbeddings?: boolean
	/** Whether to update graph relationships */
	updateGraph?: boolean
	/** Whether to process imports */
	processImports?: boolean
}

/**
 * Result of processing a file
 */
export interface ProcessFileResult extends ParseResult {
	/** Whether embeddings were generated */
	embeddingsGenerated: boolean
	/** Whether graph was updated */
	graphUpdated: boolean
	/** Whether the operation was successful */
	success: boolean
	/** Any messages from the processing */
	messages?: string[]
}

/**
 * Process and store a file's contents in the intelligence engine
 * @param filePath Path to the file to process
 * @param intelligence Intelligence engine instance
 * @param options Processing options
 */
export async function processAndStoreFile(
	filePath: string,
	intelligence: ILocalCodeIntelligence,
	options: ProcessFileOptions = {},
): Promise<ProcessFileResult> {
	try {
		// Create a basic result with default values
		const result: ProcessFileResult = {
			elements: [],
			errors: [],
			filePath,
			timestamp: Date.now(),
			embeddingsGenerated: false,
			graphUpdated: false,
			success: true,
			messages: [],
		}

		// Try to parse the file
		let fileContent: string
		try {
			fileContent = await vscode.workspace.fs
				.readFile(vscode.Uri.file(filePath))
				.then((bytes) => new TextDecoder().decode(bytes))
		} catch (error) {
			result.success = false
			result.errors.push({
				message: `Failed to read file: ${error.message}`,
				type: "io",
			})
			return result
		}

		// Generate embeddings if requested
		if (options.generateEmbeddings) {
			try {
				await intelligence.generateEmbedding(fileContent)
				result.embeddingsGenerated = true
			} catch (error) {
				result.messages?.push(`Warning: Failed to generate embeddings: ${error.message}`)
			}
		}

		// Note: Graph updates would be implemented here
		if (options.updateGraph) {
			result.graphUpdated = false // Not implemented yet
		}

		return result
	} catch (error) {
		// Return a failed result if anything goes wrong
		return {
			elements: [],
			errors: [
				{
					message: error.message,
					type: "unknown",
				},
			],
			filePath,
			timestamp: Date.now(),
			embeddingsGenerated: false,
			graphUpdated: false,
			success: false,
			messages: [`Error: ${error.message}`],
		}
	}
}

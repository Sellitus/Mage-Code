import * as vscode from "vscode"
import { processAndStoreFile, ProcessFileOptions, ProcessFileResult } from "../../../intelligence/processAndStoreFile" // Corrected path
import { ILocalCodeIntelligence } from "../../../intelligence/index" // Corrected path
import { ParseError } from "../../../intelligence/types" // Corrected path

// --- Mocks ---
jest.mock("vscode", () => ({
	workspace: {
		fs: {
			readFile: jest.fn(),
		},
	},
	Uri: {
		file: jest.fn((p) => ({ fsPath: p })), // Simple mock for Uri.file
	},
}))

// Mock TextDecoder
global.TextDecoder = jest.fn().mockImplementation(() => ({
	decode: jest.fn((bytes) => Buffer.from(bytes).toString("utf8")), // Simulate decoding
})) as any

// Mock ILocalCodeIntelligence
const mockIntelligence: jest.Mocked<ILocalCodeIntelligence> = {
	initialize: jest.fn(),
	generateEmbedding: jest.fn(),
	searchVectors: jest.fn(), // Added missing interface method
	searchGraph: jest.fn(), // Added missing interface method
	// Removed findSimilarElements, getRelatedElements, dispose as they are not in the interface
}
// --- End Mocks ---

describe("processAndStoreFile", () => {
	const testFilePath = "/test/file.ts"
	const testFileContent = "const hello = 'world';"
	const testFileBytes = Buffer.from(testFileContent, "utf8")

	beforeEach(() => {
		jest.clearAllMocks()

		// Default success mock for readFile
		;(vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(testFileBytes)
		// Default success mock for generateEmbedding - return a mock Float32Array
		mockIntelligence.generateEmbedding.mockResolvedValue(new Float32Array([0.1, 0.2]))
	})

	it("should read file but not generate embeddings or update graph by default", async () => {
		const options: ProcessFileOptions = {}
		const result = await processAndStoreFile(testFilePath, mockIntelligence, options)

		expect(vscode.workspace.fs.readFile).toHaveBeenCalledWith(vscode.Uri.file(testFilePath))
		expect(mockIntelligence.generateEmbedding).not.toHaveBeenCalled()
		expect(result.success).toBe(true)
		expect(result.filePath).toBe(testFilePath)
		expect(result.embeddingsGenerated).toBe(false)
		expect(result.graphUpdated).toBe(false)
		expect(result.errors).toEqual([])
		expect(result.messages).toEqual([])
	})

	it("should call generateEmbedding when options.generateEmbeddings is true", async () => {
		const options: ProcessFileOptions = { generateEmbeddings: true }
		const result = await processAndStoreFile(testFilePath, mockIntelligence, options)

		expect(vscode.workspace.fs.readFile).toHaveBeenCalledTimes(1)
		expect(mockIntelligence.generateEmbedding).toHaveBeenCalledWith(testFileContent)
		expect(result.success).toBe(true)
		expect(result.embeddingsGenerated).toBe(true)
		expect(result.graphUpdated).toBe(false)
		expect(result.errors).toEqual([])
	})

	it("should set graphUpdated to false when options.updateGraph is true (as it's not implemented)", async () => {
		const options: ProcessFileOptions = { updateGraph: true }
		const result = await processAndStoreFile(testFilePath, mockIntelligence, options)

		expect(vscode.workspace.fs.readFile).toHaveBeenCalledTimes(1)
		expect(mockIntelligence.generateEmbedding).not.toHaveBeenCalled()
		expect(result.success).toBe(true)
		expect(result.embeddingsGenerated).toBe(false)
		expect(result.graphUpdated).toBe(false) // Stays false
		expect(result.errors).toEqual([])
	})

	it("should handle both generateEmbeddings and updateGraph options", async () => {
		const options: ProcessFileOptions = { generateEmbeddings: true, updateGraph: true }
		const result = await processAndStoreFile(testFilePath, mockIntelligence, options)

		expect(vscode.workspace.fs.readFile).toHaveBeenCalledTimes(1)
		expect(mockIntelligence.generateEmbedding).toHaveBeenCalledWith(testFileContent)
		expect(result.success).toBe(true)
		expect(result.embeddingsGenerated).toBe(true)
		expect(result.graphUpdated).toBe(false) // Stays false
		expect(result.errors).toEqual([])
	})

	it("should return failure result if file reading fails", async () => {
		const readError = new Error("Permission denied")
		;(vscode.workspace.fs.readFile as jest.Mock).mockRejectedValue(readError)
		const options: ProcessFileOptions = { generateEmbeddings: true } // Options shouldn't matter here

		const result = await processAndStoreFile(testFilePath, mockIntelligence, options)

		expect(mockIntelligence.generateEmbedding).not.toHaveBeenCalled()
		expect(result.success).toBe(false)
		expect(result.filePath).toBe(testFilePath)
		expect(result.embeddingsGenerated).toBe(false)
		expect(result.graphUpdated).toBe(false)
		expect(result.errors).toHaveLength(1)
		expect(result.errors[0]).toEqual({
			message: `Failed to read file: ${readError.message}`,
			type: "io",
		})
		expect(result.messages).toEqual([]) // No messages on hard failure
	})

	it("should add warning message but succeed if generateEmbedding fails", async () => {
		const embeddingError = new Error("Model not loaded")
		mockIntelligence.generateEmbedding.mockRejectedValue(embeddingError)
		const options: ProcessFileOptions = { generateEmbeddings: true }

		const result = await processAndStoreFile(testFilePath, mockIntelligence, options)

		expect(vscode.workspace.fs.readFile).toHaveBeenCalledTimes(1)
		expect(mockIntelligence.generateEmbedding).toHaveBeenCalledWith(testFileContent)
		expect(result.success).toBe(true) // Still considered success overall
		expect(result.filePath).toBe(testFilePath)
		expect(result.embeddingsGenerated).toBe(false) // Failed, so false
		expect(result.graphUpdated).toBe(false)
		expect(result.errors).toEqual([]) // Embedding error is not a primary error
		expect(result.messages).toHaveLength(1)
		expect(result.messages?.[0]).toBe(`Warning: Failed to generate embeddings: ${embeddingError.message}`)
	})

	it("should return failure result for unexpected errors during processing", async () => {
		const unexpectedError = new Error("Something unexpected happened")
		// Mock Date.now within the main try block to throw
		const originalDateNow = Date.now
		jest.spyOn(Date, "now")
			.mockImplementationOnce(() => {
				// First call (in result init) works
				return originalDateNow()
			})
			.mockImplementationOnce(() => {
				// Second call (e.g., before returning success) throws
				throw unexpectedError
			})

		const options: ProcessFileOptions = {}
		const result = await processAndStoreFile(testFilePath, mockIntelligence, options)

		expect(result.success).toBe(false)
		expect(result.filePath).toBe(testFilePath)
		expect(result.embeddingsGenerated).toBe(false)
		expect(result.graphUpdated).toBe(false)
		expect(result.errors).toHaveLength(1)
		expect(result.errors[0]).toEqual({
			message: unexpectedError.message,
			type: "unknown",
		})
		expect(result.messages).toHaveLength(1)
		expect(result.messages?.[0]).toBe(`Error: ${unexpectedError.message}`)

		// Restore Date.now mock
		;(Date.now as jest.Mock).mockRestore()
	})
})

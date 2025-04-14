import { processAndStoreFile } from "./processAndStoreFile"
import { ILocalCodeIntelligence } from "./index"
import * as vscode from "vscode"
import * as path from "path"

describe("processAndStoreFile", () => {
	let mockIntelligence: jest.Mocked<ILocalCodeIntelligence>
	let testFilePath: string

	beforeEach(() => {
		// Create mock intelligence engine
		mockIntelligence = {
			initialize: jest.fn().mockResolvedValue(undefined),
			generateEmbedding: jest.fn().mockResolvedValue(new Float32Array(384)),
			searchVectors: jest.fn().mockResolvedValue([]),
			searchGraph: jest.fn().mockResolvedValue([]),
		}

		// Set up test file path
		testFilePath = path.join(__dirname, "__fixtures__", "test.ts")
	})

	it("should process a file and return success result", async () => {
		// Mock workspace.fs.readFile
		jest.spyOn(vscode.workspace.fs, "readFile").mockResolvedValue(
			new TextEncoder().encode("function test() { return true; }"),
		)

		const result = await processAndStoreFile(testFilePath, mockIntelligence, {
			generateEmbeddings: true,
			updateGraph: true,
		})

		expect(result.success).toBe(true)
		expect(result.embeddingsGenerated).toBe(true)
		expect(result.errors).toHaveLength(0)
		expect(mockIntelligence.generateEmbedding).toHaveBeenCalled()
	})

	it("should handle file read errors gracefully", async () => {
		// Mock file read failure
		jest.spyOn(vscode.workspace.fs, "readFile").mockRejectedValue(new Error("File not found"))

		const result = await processAndStoreFile(testFilePath, mockIntelligence)

		expect(result.success).toBe(false)
		expect(result.errors).toHaveLength(1)
		expect(result.errors[0].message).toContain("Failed to read file")
		expect(mockIntelligence.generateEmbedding).not.toHaveBeenCalled()
	})

	it("should handle embedding generation errors gracefully", async () => {
		// Mock successful file read but failed embedding generation
		jest.spyOn(vscode.workspace.fs, "readFile").mockResolvedValue(
			new TextEncoder().encode("function test() { return true; }"),
		)
		mockIntelligence.generateEmbedding.mockRejectedValue(new Error("Embedding failed"))

		const result = await processAndStoreFile(testFilePath, mockIntelligence, {
			generateEmbeddings: true,
		})

		expect(result.success).toBe(true) // Operation still succeeds overall
		expect(result.embeddingsGenerated).toBe(false)
		expect(result.messages).toContain(expect.stringContaining("Failed to generate embeddings"))
	})
})

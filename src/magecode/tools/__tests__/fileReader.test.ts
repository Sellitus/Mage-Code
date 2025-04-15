// src/magecode/tools/__tests__/fileReader.test.ts

import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
import { FileReader } from "../fileReader"

// --- Mocks ---
// Mock the 'vscode' API
jest.mock(
	"vscode",
	() => ({
		workspace: {
			workspaceFolders: [
				{
					uri: {
						// Hard-code a path that works cross-platform
						fsPath: "/mock/workspace",
					},
				},
			],
		},
		window: {
			showErrorMessage: jest.fn(), // Mock if needed, though FileReader doesn't use it directly
		},
		Uri: {
			file: (p: string) => ({ fsPath: p }), // Mock Uri.file if needed elsewhere
		},
	}),
	{ virtual: true },
) // virtual: true is important for mocking Node built-ins or VS Code API

// Mock the 'fs/promises' module
jest.mock("fs/promises", () => ({
	readFile: jest.fn(),
}))

// Mock the 'path' module partially if needed, but usually direct use is fine in tests
// We rely on the actual path.join, path.normalize, path.isAbsolute etc.

// --- Test Suite ---
describe("FileReader Tool", () => {
	let fileReader: FileReader
	const mockWorkspaceRoot = "/mock/workspace" // Use the same hard-coded path
	const mockReadFile = fs.readFile as jest.Mock // Type assertion for mock control

	beforeEach(() => {
		fileReader = new FileReader()
		// Reset mocks before each test
		mockReadFile.mockClear()
		;(vscode.workspace.workspaceFolders as any) = [{ uri: { fsPath: mockWorkspaceRoot } }] // Reset workspace folder mock
		jest.spyOn(console, "error").mockImplementation(() => {}) // Suppress console.error during tests
		jest.spyOn(console, "warn").mockImplementation(() => {}) // Suppress console.warn during tests
	})

	afterEach(() => {
		jest.restoreAllMocks() // Restore console mocks
	})

	// --- Success Cases ---
	it("should read a file successfully with a valid relative path", async () => {
		const filePath = "src/test.txt"
		const fileContent = "This is the file content."
		const expectedAbsolutePath = path.join(mockWorkspaceRoot, filePath)
		mockReadFile.mockResolvedValue(fileContent)

		const result = await fileReader.execute({ path: filePath })

		expect(result).toBe(fileContent)
		expect(mockReadFile).toHaveBeenCalledTimes(1)
		expect(mockReadFile).toHaveBeenCalledWith(expectedAbsolutePath, "utf-8")
	})

	it("should read an empty file successfully", async () => {
		const filePath = "empty.txt"
		const expectedAbsolutePath = path.join(mockWorkspaceRoot, filePath)
		mockReadFile.mockResolvedValue("")

		const result = await fileReader.execute({ path: filePath })

		expect(result).toBe("")
		expect(mockReadFile).toHaveBeenCalledTimes(1)
		expect(mockReadFile).toHaveBeenCalledWith(expectedAbsolutePath, "utf-8")
	})

	it("should handle paths with ./ correctly", async () => {
		const filePath = "./src/./test.txt" // Path needing normalization
		const fileContent = "Content here."
		// path.join normalizes ./ and trailing slashes
		const expectedAbsolutePath = path.join(mockWorkspaceRoot, "src", "test.txt")
		mockReadFile.mockResolvedValue(fileContent)

		const result = await fileReader.execute({ path: filePath })

		expect(result).toBe(fileContent)
		expect(mockReadFile).toHaveBeenCalledWith(expectedAbsolutePath, "utf-8")
	})

	// --- Security Checks ---
	it("should return an error for absolute paths (Unix-style)", async () => {
		const absolutePath = "/etc/passwd"
		const result = await fileReader.execute({ path: absolutePath })

		expect(result).toContain("Error: Absolute paths are not allowed.")
		expect(result).toContain(absolutePath)
		expect(mockReadFile).not.toHaveBeenCalled()
	})

	it("should return an error for absolute paths (Windows-style)", async () => {
		const absolutePath = "C:\\Windows\\System32\\config.sam"
		const result = await fileReader.execute({ path: absolutePath })

		expect(result).toContain("Error: Absolute paths (including drive letters) are not allowed.")
		expect(result).toContain(absolutePath)
		expect(mockReadFile).not.toHaveBeenCalled()
	})

	it("should return an error for paths attempting directory traversal (../)", async () => {
		const traversalPath = "../outside_file.txt"
		const result = await fileReader.execute({ path: traversalPath })

		expect(result).toContain("Error: Path is outside the workspace boundaries.")
		expect(result).toContain(traversalPath)
		expect(mockReadFile).not.toHaveBeenCalled()
	})

	it("should return an error for complex paths attempting directory traversal", async () => {
		const traversalPath = "src/../../etc/passwd" // More complex traversal
		const result = await fileReader.execute({ path: traversalPath })

		expect(result).toContain("Error: Path is outside the workspace boundaries.")
		expect(result).toContain(traversalPath)
		expect(mockReadFile).not.toHaveBeenCalled()
	})

	// --- Error Handling ---
	it("should return an error if no workspace folder is open", async () => {
		;(vscode.workspace.workspaceFolders as any) = undefined // Simulate no workspace
		const result = await fileReader.execute({ path: "src/test.txt" })

		expect(result).toBe("Error: No workspace folder is open. Cannot read file.")
		expect(mockReadFile).not.toHaveBeenCalled()
	})

	it("should return an error for an empty path string", async () => {
		const result = await fileReader.execute({ path: "" })
		expect(result).toBe("Error: Invalid path provided. Path must be a non-empty string.")
		expect(mockReadFile).not.toHaveBeenCalled()
	})

	it("should return an error if path is not a string", async () => {
		const result = await fileReader.execute({ path: null as any }) // Force invalid type
		expect(result).toBe("Error: Invalid path provided. Path must be a non-empty string.")
		expect(mockReadFile).not.toHaveBeenCalled()
	})

	it('should return a "File not found" error for non-existent files (ENOENT)', async () => {
		const filePath = "nonexistent.txt"
		const expectedAbsolutePath = path.join(mockWorkspaceRoot, filePath)
		const error: NodeJS.ErrnoException = new Error("File not found")
		error.code = "ENOENT"
		mockReadFile.mockRejectedValue(error)

		const result = await fileReader.execute({ path: filePath })

		expect(result).toBe(`Error: File not found at path: ${filePath}`)
		expect(mockReadFile).toHaveBeenCalledWith(expectedAbsolutePath, "utf-8")
	})

	it('should return a "Permission denied" error (EACCES)', async () => {
		const filePath = "restricted.txt"
		const expectedAbsolutePath = path.join(mockWorkspaceRoot, filePath)
		const error: NodeJS.ErrnoException = new Error("Permission denied")
		error.code = "EACCES"
		mockReadFile.mockRejectedValue(error)

		const result = await fileReader.execute({ path: filePath })

		expect(result).toBe(`Error: Permission denied for file at path: ${filePath}`)
		expect(mockReadFile).toHaveBeenCalledWith(expectedAbsolutePath, "utf-8")
	})

	it("should return a generic error for other file system issues", async () => {
		const filePath = "problematic.txt"
		const expectedAbsolutePath = path.join(mockWorkspaceRoot, filePath)
		const errorMessage = "Disk is full"
		const error: NodeJS.ErrnoException = new Error(errorMessage)
		error.code = "ENOSPC" // Example of another error code
		mockReadFile.mockRejectedValue(error)

		const result = await fileReader.execute({ path: filePath })

		expect(result).toContain(`Error: Failed to read file at path: ${filePath}`)
		expect(result).toContain(errorMessage)
		expect(mockReadFile).toHaveBeenCalledWith(expectedAbsolutePath, "utf-8")
	})
})

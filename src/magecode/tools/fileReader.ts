// src/magecode/tools/fileReader.ts

import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
import { Tool } from "../interfaces/tool"

/**
 * A tool for reading the content of files within the VS Code workspace.
 * Includes security checks to prevent accessing files outside the workspace.
 */
export class FileReader implements Tool {
	public readonly name = "fileReader"
	public readonly description =
		"Reads the content of a specified file within the workspace. Requires a relative path."
	public readonly inputSchema = {
		type: "object" as const,
		properties: {
			path: {
				type: "string" as const,
				description: "The relative path to the file within the workspace.",
			},
		},
		required: ["path"],
	}

	/**
	 * Executes the file reading operation.
	 * @param args - An object containing the relative 'path' to the file.
	 * @returns A promise resolving to the file content as a string, or an error message string.
	 */
	public async execute(args: { path: string }): Promise<string> {
		const relativePath = args.path

		// Basic validation on input path
		if (!relativePath || typeof relativePath !== "string") {
			return "Error: Invalid path provided. Path must be a non-empty string."
		}

		// Security Check 1: Ensure the input path is relative
		if (path.isAbsolute(relativePath)) {
			return `Error: Absolute paths are not allowed. Please provide a relative path within the workspace. Path provided: ${relativePath}`
		}
		// Additional check for Windows drive letters just in case isAbsolute misses something unusual
		if (/^[a-zA-Z]:\\/.test(relativePath)) {
			return `Error: Absolute paths (including drive letters) are not allowed. Path provided: ${relativePath}`
		}

		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return "Error: No workspace folder is open. Cannot read file."
		}

		// For simplicity, use the first workspace folder. Multi-root workspaces might need refinement.
		const workspaceRootUri = workspaceFolders[0].uri
		const workspaceRootPath = workspaceRootUri.fsPath

		let absolutePath: string
		try {
			// Construct the absolute path
			absolutePath = path.join(workspaceRootPath, relativePath)

			// Security Check 2: Normalize and verify the path stays within the workspace root
			const normalizedPath = path.normalize(absolutePath)

			if (!normalizedPath.startsWith(workspaceRootPath)) {
				// Path traversal attempt detected!
				console.error(
					`Security Violation: Attempted file access outside workspace root. Workspace: ${workspaceRootPath}, Attempted Path: ${relativePath}, Resolved Normalized: ${normalizedPath}`,
				)
				return `Error: Path is outside the workspace boundaries. Access denied. Path provided: ${relativePath}`
			}
			// Optional: Check if the final resolved path is identical after normalization,
			// which can catch some edge cases like trailing slashes or dots.
			// if (normalizedPath !== absolutePath) {
			//    console.warn(`Path normalization changed the path: ${absolutePath} -> ${normalizedPath}`);
			// }
		} catch (error: any) {
			console.error(`Error constructing path: ${error.message}`, error)
			return `Error: Could not construct a valid file path. Path provided: ${relativePath}. Error: ${error.message}`
		}

		try {
			// Read the file content
			const content = await fs.readFile(absolutePath, "utf-8")
			return content
		} catch (error: any) {
			// Handle file system errors (e.g., not found, permissions)
			if (error.code === "ENOENT") {
				return `Error: File not found at path: ${relativePath}`
			} else if (error.code === "EACCES") {
				return `Error: Permission denied for file at path: ${relativePath}`
			} else {
				console.error(`Error reading file ${absolutePath}: ${error.message}`, error)
				return `Error: Failed to read file at path: ${relativePath}. Error: ${error.message}`
			}
		}
	}
}

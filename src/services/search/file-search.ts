import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import * as childProcess from "child_process"
import * as readline from "readline"
// Removed static import for fzf (ESM)
import { getBinPath } from "../ripgrep"

// Define the type for items used in search and fzf results
type SearchItem = {
	path: string
	type: "file" | "folder"
	label?: string
}

async function executeRipgrepForFiles(
	rgPath: string,
	workspacePath: string,
	limit: number = 5000,
): Promise<{ path: string; type: "file" | "folder"; label?: string }[]> {
	return new Promise((resolve, reject) => {
		const args = [
			"--files",
			"--follow",
			"--hidden",
			"-g",
			"!**/node_modules/**",
			"-g",
			"!**/.git/**",
			"-g",
			"!**/out/**",
			"-g",
			"!**/dist/**",
			workspacePath,
		]

		const rgProcess = childProcess.spawn(rgPath, args)
		const rl = readline.createInterface({
			input: rgProcess.stdout,
			crlfDelay: Infinity,
		})

		const fileResults: { path: string; type: "file" | "folder"; label?: string }[] = []
		const dirSet = new Set<string>() // Track unique directory paths
		let count = 0

		rl.on("line", (line) => {
			if (count < limit) {
				try {
					const relativePath = path.relative(workspacePath, line)

					// Add the file itself
					fileResults.push({
						path: relativePath,
						type: "file",
						label: path.basename(relativePath),
					})

					// Extract and store all parent directory paths
					let dirPath = path.dirname(relativePath)
					while (dirPath && dirPath !== "." && dirPath !== "/") {
						dirSet.add(dirPath)
						dirPath = path.dirname(dirPath)
					}

					count++
				} catch (error) {
					// Silently ignore errors processing individual paths
				}
			} else {
				rl.close()
				rgProcess.kill()
			}
		})

		let errorOutput = ""
		rgProcess.stderr.on("data", (data) => {
			errorOutput += data.toString()
		})

		rl.on("close", () => {
			if (errorOutput && fileResults.length === 0) {
				reject(new Error(`ripgrep process error: ${errorOutput}`))
			} else {
				// Convert directory set to array of directory objects
				const dirResults = Array.from(dirSet).map((dirPath) => ({
					path: dirPath,
					type: "folder" as const,
					label: path.basename(dirPath),
				}))

				// Combine files and directories and resolve
				resolve([...fileResults, ...dirResults])
			}
		})

		rgProcess.on("error", (error) => {
			reject(new Error(`ripgrep process error: ${error.message}`))
		})
	})
}

export async function searchWorkspaceFiles(
	query: string,
	workspacePath: string,
	limit: number = 20,
): Promise<SearchItem[]> {
	try {
		// Dynamically import fzf as it's an ESM module
		const { Fzf } = await import("fzf") // Removed byLengthAsc

		const vscodeAppRoot = vscode.env.appRoot
		const rgPath = await getBinPath(vscodeAppRoot)

		if (!rgPath) {
			throw new Error("Could not find ripgrep binary")
		}

		// Get all files and directories
		const allItems: SearchItem[] = await executeRipgrepForFiles(rgPath, workspacePath, 5000)

		// If no query, just return the top items
		if (!query.trim()) {
			return allItems.slice(0, limit)
		}

		// Define the structure for items passed to Fzf
		type FzfInputItem = {
			original: SearchItem
			searchStr: string
		}

		// Create search items for all files AND directories
		const searchItems: FzfInputItem[] = allItems.map((item) => ({
			original: item,
			searchStr: `${item.path} ${item.label || ""}`, // Combine path and label for searching
		}))

		// Run fzf search on all items
		const fzf = new Fzf<FzfInputItem[]>(searchItems, {
			selector: (item: FzfInputItem) => item.searchStr, // Added explicit type
			// Removed tiebreakers: [byLengthAsc],
			limit: limit,
		})

		// Define the structure for Fzf result entries
		type FzfResultEntry = {
			item: FzfInputItem
			// other fzf properties like score, positions, etc. might exist
		}

		// Get all matching results from fzf
		const fzfResults: SearchItem[] = fzf.find(query).map((result: FzfResultEntry) => result.item.original) // Added explicit type

		// Verify types of the shortest results
		const verifiedResults = await Promise.all(
			fzfResults.map(async (result: SearchItem) => {
				// Added explicit type
				const fullPath = path.join(workspacePath, result.path)
				// Verify if the path exists and is actually a directory or file
				try {
					if (fs.existsSync(fullPath)) {
						const isDirectory = fs.lstatSync(fullPath).isDirectory()
						return {
							...result,
							type: isDirectory ? ("folder" as const) : ("file" as const),
						}
					}
				} catch (statError) {
					// Ignore stat errors (e.g., permission denied) and keep original type
					console.warn(`Could not stat path ${fullPath}:`, statError)
				}
				// If path doesn't exist or stat fails, keep original type
				return result
			}),
		)
		// Removed duplicated/erroneous block from lines 182-191

		return verifiedResults
	} catch (error) {
		console.error("Error in searchWorkspaceFiles:", error)
		return []
	}
}

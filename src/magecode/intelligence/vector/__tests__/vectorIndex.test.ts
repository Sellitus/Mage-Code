/* Silence console.log and console.error globally in this test file to avoid Jest async log warnings */
const logSpy = jest.spyOn(console, "log").mockImplementation(() => {})
const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {})
afterAll(() => {
	logSpy.mockRestore()
	errorSpy.mockRestore()
})

import * as vscode from "vscode"
import * as fs from "fs/promises"
import path from "path"

// Mock the vector libraries and fs
jest.mock("fs/promises")
jest.mock("faiss-node", () => ({
	IndexFlatL2: jest.fn().mockImplementation(() => ({
		add: jest.fn(),
		search: jest.fn(),
		write: jest.fn(),
		ntotal: jest.fn(() => 0),
	})),
}))
jest.mock("voy-search", () => ({
	Voy: jest.fn().mockImplementation(() => ({
		add: jest.fn(),
		search: jest.fn(),

		serialize: jest.fn(),
		count: jest.fn(() => 0),
	})),
}))

const mockContext = {
	subscriptions: [],
} as unknown as vscode.ExtensionContext

// Mock VSCode workspaceFolders for VectorIndex constructor
beforeEach(() => {
	;(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: "/fake/workspace" } }]
})

describe("VectorIndex", () => {
	let VectorIndex: any
	let vectorIndex: any

	beforeAll(async () => {
		// Dynamic import to avoid hoisting issues with jest.mock
		VectorIndex = (await import("../vectorIndex")).VectorIndex
	})

	beforeEach(() => {
		jest.clearAllMocks()
		vectorIndex = new VectorIndex()
	})

	it("initializes and creates the vector directory", async () => {
		;(fs.mkdir as jest.Mock).mockResolvedValue(undefined)
		;(fs.readFile as jest.Mock).mockRejectedValue({ code: "ENOENT" }) // mapping.json not found

		await expect(vectorIndex.initialize(mockContext)).resolves.not.toThrow()
		expect(fs.mkdir).toHaveBeenCalled()
	})

	it("loads mapping if mapping.json exists", async () => {
		const mappingData = JSON.stringify([
			[0, "foo"],
			[1, "bar"],
		])
		;(fs.mkdir as jest.Mock).mockResolvedValue(undefined)
		;(fs.readFile as jest.Mock).mockResolvedValue(mappingData)

		await vectorIndex.initialize(mockContext)
		expect(vectorIndex["mapping"].size).toBe(2)
		expect(vectorIndex["mapping"].get(0)).toBe("foo")
		expect(vectorIndex["mapping"].get(1)).toBe("bar")
	})

	it("adds embeddings and updates mapping", async () => {
		;(fs.mkdir as jest.Mock).mockResolvedValue(undefined)
		;(fs.readFile as jest.Mock).mockRejectedValue({ code: "ENOENT" })
		await vectorIndex.initialize(mockContext)

		const addMock = jest.fn()
		vectorIndex["index"] = { add: addMock }

		await vectorIndex.addEmbeddings([
			{ id: "foo", vector: [1, 2, 3] },
			{ id: "bar", vector: [4, 5, 6] },
		])
		// Wait for debounced saveMapping to complete
		await new Promise((res) => setTimeout(res, 1100))
		expect(addMock).toHaveBeenCalled()
		expect(vectorIndex["mapping"].size).toBe(2)
		expect(Array.from(vectorIndex["mapping"].values())).toEqual(["foo", "bar"])
	})

	it("searches and maps results to element IDs", async () => {
		;(fs.mkdir as jest.Mock).mockResolvedValue(undefined)
		;(fs.readFile as jest.Mock).mockRejectedValue({ code: "ENOENT" })
		await vectorIndex.initialize(mockContext)

		// Add fake mapping
		vectorIndex["mapping"].set(0, "foo")
		vectorIndex["mapping"].set(1, "bar")
		// Mock search result
		vectorIndex["index"] = {
			search: jest.fn().mockResolvedValue([
				{ id: 1, score: 0.1 },
				{ id: 0, score: 0.2 },
			]),
		}

		const results = await vectorIndex.search([1, 2, 3], 2)
		expect(results).toEqual([
			{ id: "bar", score: 0.1 },
			{ id: "foo", score: 0.2 },
		])
	})

	it("returns empty array when searching empty index", async () => {
		;(fs.mkdir as jest.Mock).mockResolvedValue(undefined)
		;(fs.readFile as jest.Mock).mockRejectedValue({ code: "ENOENT" })
		await vectorIndex.initialize(mockContext)

		vectorIndex["mapping"].clear()
		const results = await vectorIndex.search([1, 2, 3], 2)
		expect(results).toEqual([])
	})

	it("persists mapping and index on dispose", async () => {
		;(fs.mkdir as jest.Mock).mockResolvedValue(undefined)
		;(fs.readFile as jest.Mock).mockRejectedValue({ code: "ENOENT" })
		;(fs.writeFile as jest.Mock).mockResolvedValue(undefined)
		await vectorIndex.initialize(mockContext)

		const saveMappingSpy = jest.spyOn(vectorIndex as any, "saveMapping")
		const saveIndexSpy = jest.spyOn(vectorIndex as any, "saveIndex")

		await vectorIndex.dispose()
		expect(saveMappingSpy).toHaveBeenCalled()
		expect(saveIndexSpy).toHaveBeenCalled()
	})
	it("tracks fileToVectorIds and removes embeddings by file", async () => {
		;(fs.mkdir as jest.Mock).mockResolvedValue(undefined)
		;(fs.readFile as jest.Mock).mockImplementation(() => Promise.reject({ code: "ENOENT" }))
		await vectorIndex.initialize(mockContext)

		const addMock = jest.fn()
		const removeMock = jest.fn()
		vectorIndex["index"] = { add: addMock, remove: removeMock }

		// Add embeddings for two files
		await vectorIndex.addEmbeddings([
			{ id: "foo1", vector: [1, 2, 3], filePath: "/file/a.js" },
			{ id: "foo2", vector: [4, 5, 6], filePath: "/file/a.js" },
			{ id: "bar1", vector: [7, 8, 9], filePath: "/file/b.js" },
		])
		await new Promise((res) => setTimeout(res, 1100))
		expect(addMock).toHaveBeenCalled()
		expect(vectorIndex["fileToVectorIds"].get("/file/a.js").size).toBe(2)
		expect(vectorIndex["fileToVectorIds"].get("/file/b.js").size).toBe(1)

		// Remove embeddings for /file/a.js
		await vectorIndex.removeEmbeddingsByFile("/file/a.js")
		expect(removeMock).toHaveBeenCalledWith(expect.arrayContaining([0, 1]))
		expect(vectorIndex["fileToVectorIds"].has("/file/a.js")).toBe(false)
		// /file/b.js should still exist
		expect(vectorIndex["fileToVectorIds"].has("/file/b.js")).toBe(true)

		// Wait for any pending async logs/saves to finish
		await new Promise((res) => setTimeout(res, 100))
	})
	it("tracks fileToVectorIds and removes embeddings by file", async () => {
		;(fs.mkdir as jest.Mock).mockResolvedValue(undefined)
		jest.spyOn(fs, "readFile").mockImplementation(() => Promise.reject({ code: "ENOENT" }))
		await vectorIndex.initialize(mockContext)

		const addMock = jest.fn()
		const removeMock = jest.fn()
		vectorIndex["index"] = { add: addMock, remove: removeMock }

		// Add embeddings for two files
		await vectorIndex.addEmbeddings([
			{ id: "foo1", vector: [1, 2, 3], filePath: "/file/a.js" },
			{ id: "foo2", vector: [4, 5, 6], filePath: "/file/a.js" },
			{ id: "bar1", vector: [7, 8, 9], filePath: "/file/b.js" },
		])
		await new Promise((res) => setTimeout(res, 1100))
		expect(addMock).toHaveBeenCalled()
		expect(vectorIndex["fileToVectorIds"].get("/file/a.js").size).toBe(2)
		expect(vectorIndex["fileToVectorIds"].get("/file/b.js").size).toBe(1)

		// Remove embeddings for /file/a.js
		await vectorIndex.removeEmbeddingsByFile("/file/a.js")
		expect(removeMock).toHaveBeenCalledWith(expect.arrayContaining([0, 1]))
		expect(vectorIndex["fileToVectorIds"].has("/file/a.js")).toBe(false)
		// /file/b.js should still exist
		expect(vectorIndex["fileToVectorIds"].has("/file/b.js")).toBe(true)
	})
})

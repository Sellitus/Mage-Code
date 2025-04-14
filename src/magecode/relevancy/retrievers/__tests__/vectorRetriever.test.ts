import { VectorRetriever } from "../vectorRetriever"
import type { EmbeddingService } from "../../../intelligence/embedding/embeddingService"
import type { VectorIndex } from "../../../intelligence/vector/vectorIndex"
import type { DatabaseManager, CodeElement } from "../../../intelligence/storage/databaseManager"
import type { RetrievedItem, RetrievalOptions } from "../../../interfaces"

describe("VectorRetriever", () => {
	let embeddingService: jest.Mocked<EmbeddingService>
	let vectorIndex: jest.Mocked<VectorIndex>
	let databaseManager: jest.Mocked<DatabaseManager>
	let retriever: VectorRetriever

	beforeEach(() => {
		embeddingService = {
			generateEmbeddings: jest.fn(),
		} as any

		vectorIndex = {
			search: jest.fn(),
		} as any

		databaseManager = {
			getCodeElementById: jest.fn(),
		} as any

		retriever = new VectorRetriever(embeddingService, vectorIndex, databaseManager)
	})

	it("retrieves relevant code elements using vector search", async () => {
		const query = "find function for user login"
		const options: RetrievalOptions = { limit: 2 }
		const fakeEmbedding = [0.1, 0.2, 0.3]

		// Mock embedding generation
		;(embeddingService.generateEmbeddings as jest.Mock).mockResolvedValue([fakeEmbedding])

		// Mock vector index search
		const vectorResults = [
			{ id: "1", score: 0.95 },
			{ id: "2", score: 0.85 },
		]
		;(vectorIndex.search as jest.Mock).mockResolvedValue(vectorResults)

		// Mock database results
		const codeElement1: CodeElement = {
			id: 1,
			content: "function login() { ... }",
			file_path: "/src/auth.js",
			start_line: 10,
			end_line: 20,
			type: "function",
			name: "login",
		} as any
		const codeElement2: CodeElement = {
			id: 2,
			content: "function logout() { ... }",
			file_path: "/src/auth.js",
			start_line: 22,
			end_line: 30,
			type: "function",
			name: "logout",
		} as any

		;(databaseManager.getCodeElementById as jest.Mock).mockImplementation((id: number) => {
			if (id === 1) return codeElement1
			if (id === 2) return codeElement2
			return undefined
		})

		const results: RetrievedItem[] = await retriever.retrieve(query, options)

		expect(embeddingService.generateEmbeddings).toHaveBeenCalledWith([query])
		expect(vectorIndex.search).toHaveBeenCalledWith(fakeEmbedding, 2)
		expect(databaseManager.getCodeElementById).toHaveBeenCalledWith(1)
		expect(databaseManager.getCodeElementById).toHaveBeenCalledWith(2)

		expect(results).toEqual([
			{
				id: "1",
				content: "function login() { ... }",
				filePath: "/src/auth.js",
				startLine: 10,
				endLine: 20,
				score: 0.95,
				source: "vector",
				type: "function",
				name: "login",
			},
			{
				id: "2",
				content: "function logout() { ... }",
				filePath: "/src/auth.js",
				startLine: 22,
				endLine: 30,
				score: 0.85,
				source: "vector",
				type: "function",
				name: "logout",
			},
		])
	})

	it("skips results missing from the database", async () => {
		const query = "find function for user login"
		const options: RetrievalOptions = { limit: 1 }
		const fakeEmbedding = [0.1, 0.2, 0.3]

		;(embeddingService.generateEmbeddings as jest.Mock).mockResolvedValue([fakeEmbedding])
		;(vectorIndex.search as jest.Mock).mockResolvedValue([{ id: "3", score: 0.7 }])
		;(databaseManager.getCodeElementById as jest.Mock).mockReturnValue(undefined)

		const results: RetrievedItem[] = await retriever.retrieve(query, options)

		expect(results).toEqual([])
	})
})

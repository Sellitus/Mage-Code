import { VectorRetriever } from "../vectorRetriever"
import { RetrievedItem, RetrievalOptions } from "../../types"
import { ILocalCodeIntelligence, VectorSearchResult } from "../../../intelligence"
import { ElementType } from "../../../intelligence/types"

describe("VectorRetriever", () => {
	let retriever: VectorRetriever
	let mockIntelligence: jest.Mocked<ILocalCodeIntelligence>

	beforeEach(() => {
		mockIntelligence = {
			initialize: jest.fn(),
			generateEmbedding: jest.fn(),
			searchVectors: jest.fn(),
			searchGraph: jest.fn(),
		}

		retriever = new VectorRetriever(mockIntelligence)
	})

	describe("retrieve", () => {
		it("should return empty array on error", async () => {
			mockIntelligence.generateEmbedding.mockRejectedValue(new Error("Test error"))

			const result = await retriever.retrieve("test query", {})

			expect(result).toEqual([])
			expect(mockIntelligence.generateEmbedding).toHaveBeenCalledWith("test query")
		})

		it("should convert vector search results to retrieved items", async () => {
			const mockEmbedding = new Float32Array(384)
			const query = "test query"
			const options: RetrievalOptions = {
				limit: 10,
				fileTypes: ["ts"],
			}

			const mockVectorResults: VectorSearchResult[] = [
				{
					element: {
						id: "test-1",
						name: "testFunction",
						content: "function testFunction() {}",
						filePath: "test.ts",
						startLine: 1,
						endLine: 3,
						type: "function" as ElementType,
					},
					similarity: 0.8,
				},
			]

			mockIntelligence.generateEmbedding.mockResolvedValue(mockEmbedding)
			mockIntelligence.searchVectors.mockResolvedValue(mockVectorResults)

			const results = await retriever.retrieve(query, options)

			expect(results).toHaveLength(1)
			expect(results[0]).toEqual({
				id: "test-1",
				name: "testFunction",
				content: "function testFunction() {}",
				filePath: "test.ts",
				startLine: 1,
				endLine: 3,
				score: 0.8,
				source: "vector",
				type: "function",
			})

			expect(mockIntelligence.generateEmbedding).toHaveBeenCalledWith(query)
			expect(mockIntelligence.searchVectors).toHaveBeenCalledWith(
				mockEmbedding,
				options.limit,
				expect.any(Number),
				options.fileTypes,
			)
		})

		it("should use default limit when not provided", async () => {
			const mockEmbedding = new Float32Array(384)
			mockIntelligence.generateEmbedding.mockResolvedValue(mockEmbedding)
			mockIntelligence.searchVectors.mockResolvedValue([])

			await retriever.retrieve("test query", {})

			expect(mockIntelligence.searchVectors).toHaveBeenCalledWith(
				mockEmbedding,
				20, // Default limit
				expect.any(Number),
				undefined,
			)
		})
	})
})

import * as fs from "fs"
import * as path from "path"
import Parser, { Language, Tree, SyntaxNode } from "web-tree-sitter"
import { MageParser } from "../../intelligence/parser" // Adjust path as needed
import { ParsedFile } from "../../interfaces"

// --- Mocks ---

// Mock the fs module
jest.mock("fs", () => ({
	existsSync: jest.fn(),
	promises: {
		readFile: jest.fn(),
	},
}))

// Mock the web-tree-sitter module
const mockParse = jest.fn()
const mockSetLanguage = jest.fn()
const mockRootNode = { hasError: false } as unknown as SyntaxNode // Default mock node
const mockTree = { rootNode: mockRootNode } as unknown as Tree

jest.mock("web-tree-sitter", () => {
	// Mock the Parser class constructor and methods
	const MockParser = jest.fn().mockImplementation(() => ({
		setLanguage: mockSetLanguage,
		parse: mockParse,
	}))

	// Mock static methods
	;(MockParser as any).init = jest.fn().mockResolvedValue(undefined)
	;(MockParser as any).Language = {
		load: jest.fn(),
	}

	return MockParser
})

// Mock path.join specifically for GRAMMARS_PATH resolution if needed,
// otherwise assume test runner handles __dirname correctly relative to dist/
// For simplicity, let's assume __dirname resolves correctly in the test context
// or mock it if tests fail due to path issues.
// jest.mock('path', () => ({
//   ...jest.requireActual('path'), // Keep original path functions
//   join: jest.fn((...args) => {
//     // Custom logic for GRAMMARS_PATH if needed, otherwise call original
//     if (args[0] === __dirname && args[1] === 'grammars') {
//       return `/mock/dist/grammars`; // Or appropriate mock path
//     }
//     return jest.requireActual('path').join(...args);
//   }),
// }));

// --- Test Suite ---

describe("MageParser", () => {
	let parserInstance: MageParser
	const mockGrammarPath = "/mock/dist/grammars" // Consistent mock path

	// Helper to reset mocks before each test
	const resetMocks = () => {
		jest.clearAllMocks()
		;(fs.existsSync as jest.Mock).mockReturnValue(true) // Default to file exists
		;(fs.promises.readFile as jest.Mock).mockResolvedValue("mock file content")
		;(Parser.Language.load as jest.Mock).mockResolvedValue({} as Language) // Mock successful load
		mockParse.mockReturnValue(mockTree) // Mock successful parse
		;(mockTree.rootNode as any).hasError = false // Reset error state
	}

	beforeAll(async () => {
		// Initialize the mocked Tree-sitter environment once
		await MageParser.initialize()
		expect(Parser.init).toHaveBeenCalledTimes(1)
	})

	beforeEach(() => {
		resetMocks()
		// Create a new instance for each test to isolate state if necessary
		// Note: Static caches (languageCache) persist across instances unless cleared
		MageParser["languageCache"].clear() // Clear static cache
		parserInstance = new MageParser()
	})

	// --- Tests ---

	it("should detect supported languages correctly", () => {
		expect((parserInstance as any).detectLanguage("test.js")).toBe("javascript")
		expect((parserInstance as any).detectLanguage("test.jsx")).toBe("javascript")
		expect((parserInstance as any).detectLanguage("test.ts")).toBe("typescript")
		expect((parserInstance as any).detectLanguage("test.tsx")).toBe("typescript")
		expect((parserInstance as any).detectLanguage("script.py")).toBe("python")
	})

	it("should return null for unsupported languages", () => {
		expect((parserInstance as any).detectLanguage("test.java")).toBeNull()
		expect((parserInstance as any).detectLanguage("test.txt")).toBeNull()
		expect((parserInstance as any).detectLanguage("test")).toBeNull()
	})

	it("should load and cache language WASM", async () => {
		const langName = "javascript"
		const wasmFileName = "tree-sitter-javascript.wasm"
		const expectedWasmPath = path.join(mockGrammarPath, wasmFileName) // Use consistent mock path

		// Mock path.join for this specific test if needed, otherwise ensure GRAMMARS_PATH resolves
		// For this test, let's explicitly mock path.join for grammar loading
		const actualPath = jest.requireActual("path")
		jest.spyOn(path, "join").mockImplementation((...args) => {
			if (args.length > 1 && args[1] === "grammars") {
				return actualPath.join(mockGrammarPath, args[2]) // Force mock path
			}
			return actualPath.join(...args)
		})

		;(fs.existsSync as jest.Mock).mockImplementation((p) => p === expectedWasmPath)
		const mockLang = { name: "mockJS" } as any // Using 'as any' as we don't need full Language properties here
		;(Parser.Language.load as jest.Mock).mockResolvedValue(mockLang)

		const loadedLang1 = await (parserInstance as any).loadLanguage(langName)
		expect(loadedLang1).toBe(mockLang)
		expect(fs.existsSync).toHaveBeenCalledWith(expectedWasmPath)
		expect(Parser.Language.load).toHaveBeenCalledWith(expectedWasmPath)
		expect(MageParser["languageCache"].get(langName)).toBe(mockLang)

		// Load again, should hit cache
		const loadedLang2 = await (parserInstance as any).loadLanguage(langName)
		expect(loadedLang2).toBe(mockLang)
		expect(Parser.Language.load).toHaveBeenCalledTimes(1) // Should not call load again

		jest.restoreAllMocks() // Restore path.join mock
	})

	it("should handle WASM file not found during loadLanguage", async () => {
		const langName = "python"
		;(fs.existsSync as jest.Mock).mockReturnValue(false) // Simulate file not found

		const loadedLang = await (parserInstance as any).loadLanguage(langName)
		expect(loadedLang).toBeNull()
		expect(Parser.Language.load).not.toHaveBeenCalled()
		expect(MageParser["languageCache"].has(langName)).toBe(false)
	})

	it("should get and cache parser instances", async () => {
		const langName = "typescript"
		const mockLang = { name: "mockTS" } as any // Using 'as any' as we don't need full Language properties here
		;(Parser.Language.load as jest.Mock).mockResolvedValue(mockLang)

		const parser1 = await (parserInstance as any).getParserForLanguage(langName)
		expect(parser1).toBeInstanceOf(Parser)
		expect(mockSetLanguage).toHaveBeenCalledWith(mockLang)
		expect((parserInstance as any).parserCache.get(langName)).toBe(parser1)

		// Get again, should hit cache
		const parser2 = await (parserInstance as any).getParserForLanguage(langName)
		expect(parser2).toBe(parser1)
		expect(Parser).toHaveBeenCalledTimes(1) // Constructor only called once
	})

	it("should parse a supported file successfully", async () => {
		const filePath = "/path/to/code.js"
		const fileContent = "const x = 1;"
		;(fs.promises.readFile as jest.Mock).mockResolvedValue(fileContent)

		const result = await parserInstance.parseFile(filePath)

		expect(result.path).toBe(filePath)
		expect(result.language).toBe("javascript")
		expect(result.ast).toBe(mockTree)
		expect(result.errors).toEqual([])
		expect(mockParse).toHaveBeenCalledWith(fileContent)
	})

	it("should return error for unsupported file type", async () => {
		const filePath = "/path/to/document.txt"
		const result = await parserInstance.parseFile(filePath)

		expect(result.path).toBe(filePath)
		expect(result.language).toBe("unknown")
		expect(result.ast).toBeNull()
		expect(result.errors.length).toBe(1)
		expect(result.errors[0].message).toContain("Unsupported file type: .txt")
		expect(fs.promises.readFile).not.toHaveBeenCalled()
	})

	it("should handle file read errors", async () => {
		const filePath = "/path/to/code.py"
		const readError = new Error("Permission denied")
		;(fs.promises.readFile as jest.Mock).mockRejectedValue(readError)

		const result = await parserInstance.parseFile(filePath)

		expect(result.path).toBe(filePath)
		expect(result.language).toBe("python")
		expect(result.ast).toBeNull()
		expect(result.errors.length).toBe(1)
		expect(result.errors[0].message).toContain("Failed to read file: Permission denied")
	})

	it("should handle parser loading errors", async () => {
		const filePath = "/path/to/code.ts"
		const loadError = new Error("Failed to load WASM")
		;(Parser.Language.load as jest.Mock).mockRejectedValue(loadError)

		const result = await parserInstance.parseFile(filePath)

		expect(result.path).toBe(filePath)
		expect(result.language).toBe("typescript")
		expect(result.ast).toBeNull()
		expect(result.errors.length).toBe(1)
		expect(result.errors[0].message).toContain("Failed to load parser for language: typescript")
	})

	it("should handle parsing errors (syntax errors)", async () => {
		const filePath = "/path/to/broken.js"
		const fileContent = "const x =;" // Syntax error
		;(fs.promises.readFile as jest.Mock).mockResolvedValue(fileContent)
		// Simulate parse throwing an error OR returning a tree with hasError = true
		// Option 1: Simulate parse throwing
		// const parseError = new Error('Syntax error');
		// mockParse.mockImplementation(() => { throw parseError; });

		// Option 2: Simulate tree with error flag
		;(mockTree.rootNode as any).hasError = true
		mockParse.mockReturnValue(mockTree)

		const result = await parserInstance.parseFile(filePath)

		expect(result.path).toBe(filePath)
		expect(result.language).toBe("javascript")
		// If parse throws, AST is null based on current handleParsingError
		// If tree has error flag, AST is returned but errors array is populated
		expect(result.ast).toBe(mockTree) // AST is returned
		expect(result.errors.length).toBe(1)
		expect(result.errors[0].message).toEqual("Parsing completed with errors.") // Message from current implementation
	})

	it("should handle parsing errors thrown by parser.parse", async () => {
		const filePath = "/path/to/throws.js"
		const fileContent = "valid content"
		;(fs.promises.readFile as jest.Mock).mockResolvedValue(fileContent)
		const parseError = new Error("Internal parser crash")
		;(parseError as any).location = { row: 5, column: 10 } // Add mock location
		mockParse.mockImplementation(() => {
			throw parseError
		})

		const result = await parserInstance.parseFile(filePath)

		expect(result.path).toBe(filePath)
		expect(result.language).toBe("javascript")
		expect(result.ast).toBeNull() // AST is null when parse throws
		expect(result.errors.length).toBe(1)
		expect(result.errors[0].message).toEqual("Internal parser crash")
		expect(result.errors[0].location).toEqual({ line: 5, column: 10 })
	})

	it("should parse an empty file successfully", async () => {
		const filePath = "/path/to/empty.ts"
		const fileContent = ""
		;(fs.promises.readFile as jest.Mock).mockResolvedValue(fileContent)
		;(mockTree.rootNode as any).hasError = false // Ensure no error for empty file parse
		mockParse.mockReturnValue(mockTree)

		const result = await parserInstance.parseFile(filePath)

		expect(result.path).toBe(filePath)
		expect(result.language).toBe("typescript")
		expect(result.ast).toBe(mockTree)
		expect(result.errors).toEqual([])
		expect(mockParse).toHaveBeenCalledWith(fileContent)
	})

	it("extractCodeElements should return empty array (placeholder)", () => {
		const mockParsedFile: ParsedFile = {
			path: "test.js",
			language: "javascript",
			ast: mockTree,
			errors: [],
		}
		expect(parserInstance.extractCodeElements(mockParsedFile)).toEqual([])
	})

	it("extractCodeElements should return empty array if AST is null", () => {
		const mockParsedFile: ParsedFile = {
			path: "test.js",
			language: "javascript",
			ast: null,
			errors: [{ message: "failed" }],
		}
		expect(parserInstance.extractCodeElements(mockParsedFile)).toEqual([])
	})

	it("extractCodeElements should return empty array if errors exist", () => {
		const mockParsedFile: ParsedFile = {
			path: "test.js",
			language: "javascript",
			ast: mockTree,
			errors: [{ message: "syntax error" }],
		}
		expect(parserInstance.extractCodeElements(mockParsedFile)).toEqual([])
	})
})

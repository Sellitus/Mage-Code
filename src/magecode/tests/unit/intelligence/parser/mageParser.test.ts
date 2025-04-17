import * as fs from "fs"
import * as path from "path"
import Parser, { Language, Tree, SyntaxNode } from "web-tree-sitter"
import { MageParser } from "../../../../intelligence/parser" // Adjust path based on actual file structure
import { CodeElement, ElementRelation, ParsedFile, ParserError } from "../../../../interfaces"
import { logger } from "../../../../utils/logging"
import { ConfigurationError, ParsingError } from "../../../../utils/errors"

// --- Mocks ---
jest.mock("fs", () => ({
	existsSync: jest.fn(),
	promises: {
		readFile: jest.fn(),
	},
}))

// Mock path partially, keeping original join/extname but allowing __dirname override if needed
const originalPath = jest.requireActual("path")
jest.mock("path", () => ({
	...originalPath,
	join: jest.fn((...args) => originalPath.join(...args)), // Keep original join by default
	extname: jest.fn((p) => originalPath.extname(p)), // Keep original extname
	// __dirname can be mocked if needed, but GRAMMARS_PATH calculation might be complex to mock perfectly.
	// We'll mock the fs.existsSync check for the wasm path instead.
}))

// Mock web-tree-sitter
let mockParserInstance: {
	parse: jest.Mock
	setLanguage: jest.Mock
	getLanguage: jest.Mock // Add if needed
}
let mockLanguageInstance: Language
let mockTreeInstance: Tree
let mockRootNode: Partial<SyntaxNode>

jest.mock("web-tree-sitter", () => {
	// Mock static methods/properties
	const mockStatic = {
		init: jest.fn(),
		Language: {
			load: jest.fn(),
		},
	}

	// Mock instance methods
	mockParserInstance = {
		parse: jest.fn(),
		setLanguage: jest.fn(),
		getLanguage: jest.fn(() => mockLanguageInstance),
	}

	// Use a class mock that returns the mock instance
	return jest.fn().mockImplementation(() => mockParserInstance)
})

// Mock logger
jest.mock("../../../../utils/logging", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}))
// --- End Mocks ---

describe("MageParser", () => {
	let mageParser: MageParser

	// Reset static properties and mocks before each test
	beforeEach(async () => {
		jest.clearAllMocks()
		;(MageParser as any).isInitialized = false // Reset static flag
		;(MageParser as any).languageCache.clear() // Reset static cache
		;(Parser.init as jest.Mock).mockResolvedValue(undefined) // Default success for init
		;(Parser.Language.load as jest.Mock).mockResolvedValue(mockLanguageInstance) // Default success for load
		;(fs.existsSync as jest.Mock).mockReturnValue(true) // Assume WASM exists by default
		;(fs.promises.readFile as jest.Mock).mockResolvedValue("file content") // Default success for read

		// Reset mock instances
		mockLanguageInstance = {} as Language // Simple mock object
		mockRootNode = {
			text: "file content",
			hasError: false,
			startPosition: { row: 0, column: 0 },
			endPosition: { row: 1, column: 0 },
		} // Basic mock node
		mockTreeInstance = { rootNode: mockRootNode as SyntaxNode } as Tree
		mockParserInstance.parse.mockReturnValue(mockTreeInstance)

		// Initialize before creating an instance for most tests
		await MageParser.initialize()
		mageParser = new MageParser()
	})

	describe("Static Initialization", () => {
		beforeEach(() => {
			// Reset initialization state specifically for these tests
			;(MageParser as any).isInitialized = false
			;(Parser.init as jest.Mock).mockClear()
		})

		it("should call Parser.init() on first initialize", async () => {
			await MageParser.initialize()
			expect(Parser.init).toHaveBeenCalledTimes(1)
			expect((MageParser as any).isInitialized).toBe(true)
		})

		it("should not call Parser.init() on subsequent initializes", async () => {
			await MageParser.initialize() // First call
			await MageParser.initialize() // Second call
			expect(Parser.init).toHaveBeenCalledTimes(1) // Still only called once
		})

		it("should throw ConfigurationError if Parser.init() fails", async () => {
			const initError = new Error("WASM init failed")
			;(Parser.init as jest.Mock).mockRejectedValue(initError)
			await expect(MageParser.initialize()).rejects.toThrow(ConfigurationError)
			await expect(MageParser.initialize()).rejects.toThrow("Failed to initialize Tree-sitter parser")
			expect(logger.error).toHaveBeenCalledWith("Failed to initialize Tree-sitter parser", initError)
			expect((MageParser as any).isInitialized).toBe(false)
		})

		it("should throw ConfigurationError if constructor called before initialize", () => {
			;(MageParser as any).isInitialized = false // Ensure not initialized
			expect(() => new MageParser()).toThrow(ConfigurationError)
			expect(() => new MageParser()).toThrow(
				"MageParser must be initialized using MageParser.initialize() before instantiation.",
			)
		})
	})

	describe("detectLanguage (private)", () => {
		// Test private method using 'any' cast
		const detect = (fp: string) => (mageParser as any).detectLanguage(fp)

		it("should detect javascript for .js", () => {
			expect(detect("file.js")).toBe("javascript")
		})
		it("should detect javascript for .jsx", () => {
			expect(detect("component.jsx")).toBe("javascript")
		})
		it("should detect typescript for .ts", () => {
			expect(detect("module.ts")).toBe("typescript")
		})
		it("should detect typescript for .tsx", () => {
			expect(detect("view.tsx")).toBe("typescript")
		})
		it("should detect python for .py", () => {
			expect(detect("script.py")).toBe("python")
		})
		it("should be case-insensitive", () => {
			expect(detect("FILE.JS")).toBe("javascript")
			expect(detect("Script.Py")).toBe("python")
		})
		it("should return null for unsupported extensions", () => {
			expect(detect("file.txt")).toBeNull()
			expect(detect("image.jpg")).toBeNull()
		})
		it("should return null for files without extensions", () => {
			expect(detect("README")).toBeNull()
		})
	})

	describe("loadLanguage (private)", () => {
		const load = (lang: string) => (mageParser as any).loadLanguage(lang)
		const wasmPath = (file: string) => path.join(__dirname, "grammars", file) // Helper for path checks

		it("should return cached language if available", async () => {
			const mockLang = {} as Language
			;(MageParser as any).languageCache.set("javascript", mockLang)
			const result = await load("javascript")
			expect(result).toBe(mockLang)
			expect(Parser.Language.load).not.toHaveBeenCalled()
		})

		it("should return null for unsupported language names", async () => {
			const result = await load("ruby")
			expect(result).toBeNull()
			expect(logger.warn).toHaveBeenCalledWith("Unsupported language requested: ruby")
			expect(Parser.Language.load).not.toHaveBeenCalled()
		})

		it("should throw ConfigurationError if WASM file does not exist", async () => {
			;(fs.existsSync as jest.Mock).mockReturnValue(false)
			const expectedWasmPath = wasmPath("tree-sitter-javascript.wasm")
			// The actual path join mock might resolve differently in test env vs runtime
			// We rely on the fs.existsSync mock being called with the expected *relative* path logic
			const expectedJoinArg2 = path.join("grammars", "tree-sitter-javascript.wasm")

			await expect(load("javascript")).rejects.toThrow(ConfigurationError)
			// Check the error message contains the expected relative path part
			await expect(load("javascript")).rejects.toThrow(expect.stringContaining(`WASM file not found at `))
			await expect(load("javascript")).rejects.toThrow(
				expect.stringContaining(expectedJoinArg2), // Check if the relative part is in the message
			)

			// Verify existsSync was called with a path ending correctly
			expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining(expectedJoinArg2))
			expect(Parser.Language.load).not.toHaveBeenCalled()
		})

		it("should call Parser.Language.load with correct WASM path", async () => {
			const expectedJoinArg2 = path.join("grammars", "tree-sitter-python.wasm")
			await load("python")
			expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining(expectedJoinArg2))
			expect(Parser.Language.load).toHaveBeenCalledWith(expect.stringContaining(expectedJoinArg2))
		})

		it("should cache the loaded language on success", async () => {
			const mockLang = {} as Language
			;(Parser.Language.load as jest.Mock).mockResolvedValue(mockLang)
			const result = await load("typescript")
			expect(result).toBe(mockLang)
			expect((MageParser as any).languageCache.get("typescript")).toBe(mockLang)
		})

		it("should return null and log error if Parser.Language.load fails", async () => {
			const loadError = new Error("Failed to fetch WASM")
			;(Parser.Language.load as jest.Mock).mockRejectedValue(loadError)
			const expectedJoinArg2 = path.join("grammars", "tree-sitter-javascript.wasm")

			const result = await load("javascript")

			expect(result).toBeNull()
			expect(logger.error).toHaveBeenCalledWith(
				expect.stringContaining(`Failed to load Tree-sitter grammar for javascript from `),
				loadError,
			)
			expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(expectedJoinArg2), loadError)
			expect((MageParser as any).languageCache.has("javascript")).toBe(false)
		})
	})

	describe("getParserForLanguage (private)", () => {
		const getParser = (lang: string) => (mageParser as any).getParserForLanguage(lang)

		it("should return cached parser if available", async () => {
			const mockParser = new (Parser as any)() // Create a mock instance using the mocked constructor
			;(mageParser as any).parserCache.set("javascript", mockParser)
			const result = await getParser("javascript")
			expect(result).toBe(mockParser)
			expect(Parser.Language.load).not.toHaveBeenCalled() // loadLanguage shouldn't be called
			expect(Parser).toHaveBeenCalledTimes(0) // Constructor shouldn't be called again (already called in beforeEach)
		})

		it("should return null if language cannot be loaded", async () => {
			// Mock loadLanguage to return null
			const loadLanguageSpy = jest.spyOn(mageParser as any, "loadLanguage").mockResolvedValue(null)
			const result = await getParser("unsupported-lang")
			expect(result).toBeNull()
			expect(loadLanguageSpy).toHaveBeenCalledWith("unsupported-lang")
			expect(Parser).toHaveBeenCalledTimes(0) // Constructor not called beyond beforeEach
			loadLanguageSpy.mockRestore()
		})

		it("should create, configure, and cache a new parser if not cached", async () => {
			const mockLang = {} as Language
			const loadLanguageSpy = jest.spyOn(mageParser as any, "loadLanguage").mockResolvedValue(mockLang)
			// Clear the specific cache entry potentially set in beforeEach
			;(mageParser as any).parserCache.delete("python")

			const result = await getParser("python")

			expect(loadLanguageSpy).toHaveBeenCalledWith("python")
			// Constructor is called once in beforeEach, and once here = 2 times total
			expect(Parser).toHaveBeenCalledTimes(1)
			expect(mockParserInstance.setLanguage).toHaveBeenCalledWith(mockLang)
			expect((mageParser as any).parserCache.get("python")).toBe(result)

			loadLanguageSpy.mockRestore()
		})
	})

	describe("parseFile", () => {
		const filePath = "/test/file.ts"

		it("should return error for unsupported file types", async () => {
			const unsupportedPath = "/test/file.txt"
			const result = await mageParser.parseFile(unsupportedPath)
			expect(result).toEqual({
				path: unsupportedPath,
				language: "unknown",
				ast: null,
				errors: [{ message: "Unsupported file type: .txt" }],
			})
			expect(logger.warn).toHaveBeenCalledWith(`Unsupported file type for parsing: ${unsupportedPath}`)
			expect(fs.promises.readFile).not.toHaveBeenCalled()
		})

		it("should return error if file reading fails", async () => {
			const readError = new Error("ENOENT")
			;(fs.promises.readFile as jest.Mock).mockRejectedValue(readError)
			const result = await mageParser.parseFile(filePath)
			expect(result).toEqual({
				path: filePath,
				language: "typescript",
				ast: null,
				errors: [{ message: `Failed to read file: ${readError.message}`, location: undefined }],
			})
			expect(logger.error).toHaveBeenCalledWith(`Error reading file ${filePath}`, readError)
		})

		it("should return error if parser loading fails", async () => {
			// Mock getParserForLanguage to return null
			const getParserSpy = jest.spyOn(mageParser as any, "getParserForLanguage").mockResolvedValue(null)
			const result = await mageParser.parseFile(filePath)
			expect(result).toEqual({
				path: filePath,
				language: "typescript",
				ast: null,
				errors: [{ message: "Failed to load parser for language: typescript" }],
			})
			expect(getParserSpy).toHaveBeenCalledWith("typescript")
			getParserSpy.mockRestore()
		})

		it("should throw ParsingError if parser.parse throws catastrophically", async () => {
			const parseError = new Error("Fatal parse error")
			mockParserInstance.parse.mockImplementation(() => {
				throw parseError
			})
			await expect(mageParser.parseFile(filePath)).rejects.toThrow(ParsingError)
			await expect(mageParser.parseFile(filePath)).rejects.toThrow(`Tree-sitter failed to parse ${filePath}`)
			expect(logger.error).toHaveBeenCalledWith(`Tree-sitter failed to parse ${filePath}`, parseError)
		})

		it("should return AST and empty errors on successful parse", async () => {
			const fileContent = "const x = 1;"
			;(fs.promises.readFile as jest.Mock).mockResolvedValue(fileContent)
			mockRootNode = { ...mockRootNode, text: fileContent, hasError: false }
			mockTreeInstance = { rootNode: mockRootNode as SyntaxNode } as Tree
			mockParserInstance.parse.mockReturnValue(mockTreeInstance)

			const result = await mageParser.parseFile(filePath)

			expect(result.path).toBe(filePath)
			expect(result.language).toBe("typescript")
			expect(result.ast).toBe(mockTreeInstance)
			expect(result.errors).toEqual([])
			expect(mockParserInstance.parse).toHaveBeenCalledWith(fileContent)
		})

		it("should return AST and non-fatal error if rootNode.hasError is true", async () => {
			mockRootNode = { ...mockRootNode, hasError: true }
			mockTreeInstance = { rootNode: mockRootNode as SyntaxNode } as Tree
			mockParserInstance.parse.mockReturnValue(mockTreeInstance)

			const result = await mageParser.parseFile(filePath)

			expect(result.ast).toBe(mockTreeInstance)
			expect(result.errors).toEqual([{ message: "Parsing completed with errors." }])
			expect(logger.warn).toHaveBeenCalledWith(`Parsing completed with errors in file: ${filePath}`)
		})
	})

	describe("extractCodeElements", () => {
		const filePath = "/test/extract.js"

		it("should return empty arrays if AST is null", () => {
			const parsedFile: ParsedFile = { path: filePath, language: "javascript", ast: null, errors: [] }
			const result = mageParser.extractCodeElements(parsedFile)
			expect(result).toEqual({ elements: [], relations: [] })
		})

		it("should return empty arrays and log warning if significant errors exist", () => {
			const parsedFile: ParsedFile = {
				path: filePath,
				language: "javascript",
				ast: mockTreeInstance, // AST might exist but errors are severe
				errors: [{ message: "Failed to read file" }],
			}
			const result = mageParser.extractCodeElements(parsedFile)
			expect(result).toEqual({ elements: [], relations: [] })
			expect(logger.warn).toHaveBeenCalledWith(
				`Skipping element extraction for ${filePath} due to parsing errors.`,
			)
		})

		it("should proceed if only 'Parsing completed with errors' message exists", () => {
			// Basic mock AST for traversal
			const mockFuncNode = {
				type: "function_declaration",
				text: "function hello() {}",
				startPosition: { row: 1, column: 0 },
				endPosition: { row: 1, column: 19 },
				namedChildCount: 1, // Simulate having a name child
				childForFieldName: jest.fn((field) => (field === "name" ? { text: "hello" } : null)),
				namedChild: jest.fn((i) => (i === 0 ? { text: "hello" } : null)), // Mock child access if needed by traverse
				descendantsOfType: jest.fn().mockReturnValue([]), // Mock descendantsOfType
			} as unknown as SyntaxNode

			mockRootNode = {
				text: "function hello() {}",
				hasError: true, // Indicate non-fatal error
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 2, column: 0 },
				namedChildCount: 1,
				namedChild: jest.fn((i) => (i === 0 ? mockFuncNode : null)),
			} as unknown as SyntaxNode
			mockTreeInstance = { rootNode: mockRootNode } as Tree

			const parsedFile: ParsedFile = {
				path: filePath,
				language: "javascript",
				ast: mockTreeInstance,
				errors: [{ message: "Parsing completed with errors." }], // Only non-fatal error
			}

			const result = mageParser.extractCodeElements(parsedFile)
			expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining("Skipping element extraction"))
			expect(result.elements.length).toBeGreaterThan(0) // Expect elements to be extracted
		})

		// --- More specific extraction tests ---
		// These require more detailed mock AST nodes

		it("should extract a simple function declaration", () => {
			const funcName = "myFunc"
			const funcContent = `function ${funcName}() { console.log('hello'); }`
			const startLine = 5
			const endLine = 7
			const mockNameNode = { text: funcName } as SyntaxNode
			const mockFuncNode = {
				type: "function_declaration",
				text: funcContent,
				startPosition: { row: startLine, column: 0 },
				endPosition: { row: endLine, column: 1 },
				namedChildCount: 1,
				childForFieldName: jest.fn((field) => (field === "name" ? mockNameNode : null)),
				namedChild: jest.fn().mockReturnValue(null), // No further named children in this simple case
				descendantsOfType: jest.fn().mockReturnValue([]), // No calls in this simple case
			} as unknown as SyntaxNode

			mockRootNode = {
				text: funcContent,
				hasError: false,
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 8, column: 0 },
				namedChildCount: 1,
				namedChild: jest.fn((i) => (i === 0 ? mockFuncNode : null)),
			} as unknown as SyntaxNode
			mockTreeInstance = { rootNode: mockRootNode } as Tree
			const parsedFile: ParsedFile = { path: filePath, language: "javascript", ast: mockTreeInstance, errors: [] }

			const result = mageParser.extractCodeElements(parsedFile)

			expect(result.elements).toHaveLength(1)
			const element = result.elements[0]
			expect(element).toEqual({
				id: `${filePath}#${funcName}@${startLine}`,
				filePath: filePath,
				type: "function",
				name: funcName,
				content: funcContent,
				startLine: startLine,
				endLine: endLine,
				startPosition: { line: startLine, column: 0 },
				endPosition: { line: endLine, column: 1 },
				parentId: undefined,
				metadata: undefined,
			})
			expect(result.relations).toEqual([])
		})

		it("should extract nested elements with parentId", () => {
			const className = "MyClass"
			const methodName = "myMethod"
			const classStart = 2
			const classEnd = 10
			const methodStart = 4
			const methodEnd = 6
			const classContent = `class ${className} {\n  ${methodName}() {}\n}`
			const methodContent = `${methodName}() {}`

			const mockMethodNameNode = { text: methodName } as SyntaxNode
			const mockMethodNode = {
				type: "method_definition",
				text: methodContent,
				startPosition: { row: methodStart, column: 2 },
				endPosition: { row: methodEnd, column: 3 },
				namedChildCount: 1,
				childForFieldName: jest.fn((field) => (field === "name" ? mockMethodNameNode : null)),
				namedChild: jest.fn().mockReturnValue(null),
				descendantsOfType: jest.fn().mockReturnValue([]),
			} as unknown as SyntaxNode

			const mockClassNameNode = { text: className } as SyntaxNode
			const mockClassNode = {
				type: "class_declaration",
				text: classContent,
				startPosition: { row: classStart, column: 0 },
				endPosition: { row: classEnd, column: 1 },
				namedChildCount: 2, // Name and body (containing method)
				childForFieldName: jest.fn((field) => (field === "name" ? mockClassNameNode : null)),
				// Simulate traversal finding the method node
				namedChild: jest.fn((i) => (i === 1 ? mockMethodNode : null)), // Assuming method is the second named child for simplicity
				descendantsOfType: jest.fn().mockReturnValue([]),
			} as unknown as SyntaxNode

			mockRootNode = {
				text: classContent,
				hasError: false,
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 11, column: 0 },
				namedChildCount: 1,
				namedChild: jest.fn((i) => (i === 0 ? mockClassNode : null)),
			} as unknown as SyntaxNode
			mockTreeInstance = { rootNode: mockRootNode } as Tree
			const parsedFile: ParsedFile = { path: filePath, language: "javascript", ast: mockTreeInstance, errors: [] }

			const result = mageParser.extractCodeElements(parsedFile)

			expect(result.elements).toHaveLength(2)
			const classElement = result.elements.find((e) => e.type === "class")
			const methodElement = result.elements.find((e) => e.type === "method")

			const expectedClassId = `${filePath}#${className}@${classStart}`
			const expectedMethodId = `${filePath}#${methodName}@${methodStart}`

			expect(classElement).toBeDefined()
			expect(methodElement).toBeDefined()

			expect(classElement?.id).toBe(expectedClassId)
			expect(classElement?.parentId).toBeUndefined()

			expect(methodElement?.id).toBe(expectedMethodId)
			expect(methodElement?.parentId).toBe(expectedClassId) // Check parent linkage
		})

		// Add more tests for relations (imports, inheritance, calls) with appropriate mock ASTs
	})
})

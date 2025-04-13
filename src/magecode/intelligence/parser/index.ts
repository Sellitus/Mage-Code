import * as fs from "fs"
import * as path from "path"
import Parser, { Language, Tree } from "web-tree-sitter"
import { CodeElement, ParsedFile, ParserError } from "../../interfaces" // Adjust path if needed

// Assuming the WASM files are copied to 'dist/grammars/' by esbuild
// The path needs to be relative to the extension's runtime location (dist/)
const GRAMMARS_PATH = path.join(__dirname, "grammars") // __dirname points to dist/

/**
 * Maps file extensions to Tree-sitter language names and WASM filenames.
 */
const languageMap: { [ext: string]: { languageName: string; wasmFile: string } } = {
	".js": { languageName: "javascript", wasmFile: "tree-sitter-javascript.wasm" },
	".jsx": { languageName: "javascript", wasmFile: "tree-sitter-javascript.wasm" }, // Often uses JS parser
	".ts": { languageName: "typescript", wasmFile: "tree-sitter-typescript.wasm" },
	".tsx": { languageName: "typescript", wasmFile: "tree-sitter-typescript.wasm" }, // Often uses TS parser
	".py": { languageName: "python", wasmFile: "tree-sitter-python.wasm" },
	// Add other supported languages here
}

export class MageParser {
	private static isInitialized = false
	private static languageCache: Map<string, Language> = new Map()
	private parserCache: Map<string, Parser> = new Map() // Cache parser instances per language

	constructor() {
		if (!MageParser.isInitialized) {
			throw new Error("MageParser must be initialized using MageParser.initialize() before instantiation.")
		}
	}

	/**
	 * Initializes the Tree-sitter parser environment. Must be called once.
	 */
	public static async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}
		try {
			await Parser.init()
			this.isInitialized = true
			console.log("Tree-sitter parser initialized successfully.")
		} catch (error) {
			console.error("Failed to initialize Tree-sitter parser:", error)
			throw error // Re-throw to indicate critical failure
		}
	}

	/**
	 * Detects the programming language based on file extension.
	 * @param filePath Absolute path to the file.
	 * @returns The language name (e.g., 'javascript') or null if unsupported.
	 */
	private detectLanguage(filePath: string): string | null {
		const ext = path.extname(filePath).toLowerCase()
		return languageMap[ext]?.languageName || null
	}

	/**
	 * Loads the Tree-sitter language grammar (WASM) for a given language name.
	 * Caches the loaded language for reuse.
	 * @param language The language name (e.g., 'javascript').
	 * @returns The loaded Language object or null if loading fails.
	 */
	private async loadLanguage(language: string): Promise<Language | null> {
		if (MageParser.languageCache.has(language)) {
			return MageParser.languageCache.get(language)!
		}

		const langConfig = Object.values(languageMap).find((config) => config.languageName === language)
		if (!langConfig) {
			console.warn(`Unsupported language requested: ${language}`)
			return null
		}

		const wasmPath = path.join(GRAMMARS_PATH, langConfig.wasmFile)

		try {
			console.log(`Loading Tree-sitter grammar for ${language} from ${wasmPath}`)
			if (!fs.existsSync(wasmPath)) {
				throw new Error(`WASM file not found at ${wasmPath}. Check esbuild config.`)
			}
			const loadedLanguage = await Parser.Language.load(wasmPath)
			MageParser.languageCache.set(language, loadedLanguage)
			console.log(`Successfully loaded grammar for ${language}`)
			return loadedLanguage
		} catch (error) {
			console.error(`Failed to load Tree-sitter grammar for ${language} from ${wasmPath}:`, error)
			return null
		}
	}

	/**
	 * Gets or creates a Tree-sitter Parser instance configured for the specified language.
	 * @param language The language name.
	 * @returns A Parser instance or null if the language couldn't be loaded.
	 */
	private async getParserForLanguage(language: string): Promise<Parser | null> {
		if (this.parserCache.has(language)) {
			return this.parserCache.get(language)!
		}

		const loadedLanguage = await this.loadLanguage(language)
		if (!loadedLanguage) {
			return null
		}

		const parser = new Parser()
		parser.setLanguage(loadedLanguage)
		this.parserCache.set(language, parser)
		return parser
	}

	/**
	 * Parses a file and returns its AST and any errors.
	 * @param filePath Absolute path to the file to parse.
	 * @returns A ParsedFile object.
	 */
	public async parseFile(filePath: string): Promise<ParsedFile> {
		const language = this.detectLanguage(filePath)

		if (!language) {
			return {
				path: filePath,
				language: "unknown",
				ast: null,
				errors: [{ message: `Unsupported file type: ${path.extname(filePath)}` }],
			}
		}

		let content: string
		try {
			content = await fs.promises.readFile(filePath, "utf8")
		} catch (readError: any) {
			console.error(`Error reading file ${filePath}:`, readError)
			return {
				path: filePath,
				language: language,
				ast: null,
				errors: [{ message: `Failed to read file: ${readError.message}` }],
			}
		}

		const parser = await this.getParserForLanguage(language)
		if (!parser) {
			return {
				path: filePath,
				language: language,
				ast: null,
				errors: [{ message: `Failed to load parser for language: ${language}` }],
			}
		}

		try {
			const ast = parser.parse(content)
			// Basic validation: Check if root node exists and has children (for non-empty files)
			const errors: ParserError[] = []
			if (ast.rootNode.hasError) {
				// TODO: Traverse tree to find specific error nodes if needed
				errors.push({ message: "Parsing completed with errors." })
			}

			return {
				path: filePath,
				language: language,
				ast: ast,
				errors: errors, // TODO: Enhance error reporting by traversing the tree for error nodes
			}
		} catch (parseError: any) {
			return this.handleParsingError(filePath, language, content, parseError)
		}
	}

	/**
	 * Handles errors during the parsing process.
	 * @param filePath Path of the file being parsed.
	 * @param language Detected language.
	 * @param content File content.
	 * @param error The error object thrown by the parser.
	 * @returns A ParsedFile object indicating failure.
	 */
	private handleParsingError(filePath: string, language: string, content: string, error: any): ParsedFile {
		console.warn(`Tree-sitter parsing error in ${filePath} (${language}): ${error.message}`)
		// Basic error reporting for now. Future enhancement: attempt partial parse or recovery.
		const parserError: ParserError = {
			message: error.message || "Unknown parsing error",
			// Attempt to extract location if available (structure might vary)
			location: error.location ? { line: error.location.row, column: error.location.column } : undefined,
		}
		return {
			path: filePath,
			language: language,
			ast: null, // Indicate catastrophic failure for now
			errors: [parserError],
		}
	}

	/**
	 * Placeholder method to extract code elements from a parsed file.
	 * Actual implementation will involve traversing the AST.
	 * @param parsedFile The result of parseFile.
	 * @returns An array of CodeElement objects (empty for now).
	 */
	public extractCodeElements(parsedFile: ParsedFile): CodeElement[] {
		if (!parsedFile.ast || parsedFile.errors.length > 0) {
			// Cannot reliably extract elements if parsing failed or had errors
			return []
		}

		const elements: CodeElement[] = []
		const filePath = parsedFile.path
		const source = parsedFile.ast.rootNode.text

		// Helper to generate unique IDs
		const makeId = (name: string, startLine: number) => `${filePath}#${name}@${startLine}`

		// Recursive AST traversal
		function traverse(node: any, parentId?: string): void {
			let type = ""
			let name = ""
			let metadata: Record<string, any> = {}

			// Identify code element types (expand as needed)
			switch (node.type) {
				case "function_declaration":
				case "function":
				case "method_definition":
				case "function_definition":
					type = node.type.includes("method") ? "method" : "function"
					name = node.childForFieldName?.("name")?.text || node.text
					break
				case "class_declaration":
				case "class_definition":
					type = "class"
					name = node.childForFieldName?.("name")?.text || node.text
					break
				case "variable_declaration":
				case "lexical_declaration":
				case "assignment":
					type = "variable"
					name = node.childForFieldName?.("name")?.text || node.text
					break
				case "import_statement":
					type = "import"
					name = node.text
					break
				default:
					break
			}

			if (type && name) {
				const id = makeId(name, node.startPosition.row)
				const element: CodeElement = {
					id,
					filePath,
					type,
					name,
					content: node.text,
					startLine: node.startPosition.row,
					endLine: node.endPosition.row,
					startPosition: node.startPosition,
					endPosition: node.endPosition,
					parentId,
					metadata,
				}
				elements.push(element)

				// Set this as parent for children
				parentId = id
			}

			// Traverse children
			for (let i = 0; i < node.namedChildCount; i++) {
				const child = node.namedChild(i)
				traverse(child, parentId)
			}
		}

		traverse(parsedFile.ast.rootNode)

		return elements
	}
}

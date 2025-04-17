import * as fs from "fs"
import * as path from "path"
import Parser, { Language, Tree } from "web-tree-sitter"
import { CodeElement, ElementRelation, ParsedFile, ParserError } from "../../interfaces" // Adjust path if needed
import { logger } from "../../utils/logging" // Import the logger
import { ParsingError, ConfigurationError } from "../../utils/errors" // Import custom errors

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
			// Initialization is critical, treat as configuration error
			throw new ConfigurationError(
				"MageParser must be initialized using MageParser.initialize() before instantiation.",
			)
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
			logger.info("Tree-sitter parser initialized successfully.")
		} catch (error: any) {
			const msg = "Failed to initialize Tree-sitter parser"
			logger.error(msg, error)
			throw new ConfigurationError(msg, error) // Initialization failure is critical
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
			logger.warn(`Unsupported language requested: ${language}`)
			return null
		}

		const wasmPath = path.join(GRAMMARS_PATH, langConfig.wasmFile)

		try {
			logger.info(`Loading Tree-sitter grammar for ${language} from ${wasmPath}`)
			if (!fs.existsSync(wasmPath)) {
				// Missing WASM file is a configuration/build issue
				throw new ConfigurationError(`WASM file not found at ${wasmPath}. Check build process.`)
			}
			const loadedLanguage = await Parser.Language.load(wasmPath)
			MageParser.languageCache.set(language, loadedLanguage)
			logger.info(`Successfully loaded grammar for ${language}`)
			return loadedLanguage
		} catch (error: any) {
			// Catch specific error type if possible
			const msg = `Failed to load Tree-sitter grammar for ${language} from ${wasmPath}`
			logger.error(msg, error)
			// Return null for graceful degradation, but log the error
			return null
			// Optionally: throw new ParsingError(msg, { cause: error, language });
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
			return null // Failure already logged by loadLanguage
		}

		const parser = new Parser()
		parser.setLanguage(loadedLanguage)
		this.parserCache.set(language, parser)
		return parser
	}

	/**
	 * Parses a file and returns its AST and any errors.
	 * Throws ParsingError if parsing fails catastrophically.
	 * Returns ParsedFile object which might contain non-fatal errors.
	 * @param filePath Absolute path to the file to parse.
	 * @returns A Promise resolving to a ParsedFile object.
	 */
	public async parseFile(filePath: string): Promise<ParsedFile> {
		const language = this.detectLanguage(filePath)

		// Handle unsupported language
		if (!language) {
			logger.warn(`Unsupported file type for parsing: ${filePath}`)
			return {
				path: filePath,
				language: "unknown", // Explicitly set language as unknown
				ast: null,
				errors: [{ message: `Unsupported file type: ${path.extname(filePath)}` }],
			}
		}

		// Handle file reading error
		let content: string
		try {
			content = await fs.promises.readFile(filePath, "utf8")
		} catch (readError: any) {
			const msg = `Failed to read file: ${readError.message}`
			logger.error(`Error reading file ${filePath}`, readError)
			// Return a ParsedFile with error, don't throw from here directly
			return {
				path: filePath,
				language: language, // language is guaranteed string here
				ast: null,
				errors: [{ message: msg, location: undefined }], // Use the ParserError structure
			}
		}

		// Handle parser loading error
		const parser = await this.getParserForLanguage(language)
		if (!parser) {
			// Failure already logged by getParserForLanguage/loadLanguage
			// Return error state.
			return {
				path: filePath,
				language: language, // language is guaranteed string here
				ast: null,
				errors: [{ message: `Failed to load parser for language: ${language}` }],
			}
		}

		// Handle parsing error
		try {
			const ast = parser.parse(content)
			const errors: ParserError[] = []
			if (ast.rootNode.hasError) {
				// TODO: Traverse tree to find specific error nodes if needed for better reporting
				logger.warn(`Parsing completed with errors in file: ${filePath}`)
				errors.push({ message: "Parsing completed with errors." })
			}

			// Successful parse (potentially with non-fatal errors)
			return {
				path: filePath,
				language: language, // language is guaranteed string here
				ast: ast,
				errors: errors,
			}
		} catch (parseError: any) {
			// Catastrophic parsing failure, throw custom error
			const msg = `Tree-sitter failed to parse ${filePath}`
			logger.error(msg, parseError)
			throw new ParsingError(msg, {
				cause: parseError,
				filePath: filePath,
				language: language, // language is guaranteed string here
			})
		}
	}

	/**
	 * Placeholder method to extract code elements from a parsed file.
	 * Actual implementation will involve traversing the AST.
	 * @param parsedFile The result of parseFile.
	 * @returns An object containing arrays of CodeElement and ElementRelation objects.
	 */
	public extractCodeElements(parsedFile: ParsedFile): { elements: CodeElement[]; relations: ElementRelation[] } {
		if (!parsedFile.ast || parsedFile.errors.some((e) => e.message !== "Parsing completed with errors.")) {
			// Cannot reliably extract elements if parsing failed catastrophically or had significant errors
			// Allow extraction if only the generic "Parsing completed with errors" message exists.
			if (parsedFile.errors.length > 0) {
				logger.warn(`Skipping element extraction for ${parsedFile.path} due to parsing errors.`)
			}
			return { elements: [], relations: [] }
		}

		const elements: CodeElement[] = []
		const relations: ElementRelation[] = []
		const filePath = parsedFile.path
		const source = parsedFile.ast.rootNode.text // Keep for reference if needed

		// Helper to generate unique IDs
		const makeId = (name: string, startLine: number) => `${filePath}#${name}@${startLine}`

		// Recursive AST traversal
		function traverse(node: Parser.SyntaxNode, parentId?: string): void {
			let type = ""
			let name = ""
			let metadata: Record<string, any> = {}

			// Identify code element types (expand as needed)
			switch (node.type) {
				case "function_declaration":
				case "function":
				case "method_definition":
				case "function_definition": // Python
					type = node.type.includes("method") || node.type.includes("definition") ? "method" : "function"
					// Adjust name extraction for different languages/nodes
					name =
						node.childForFieldName?.("name")?.text ||
						node.firstNamedChild?.text ||
						`anon@${node.startPosition.row}`
					// Extract function calls (example, might need refinement)
					const callExpressions: string[] = []
					node.descendantsOfType("call_expression").forEach((call: Parser.SyntaxNode) => {
						const calleeName = call.childForFieldName?.("function")?.text
						if (calleeName) {
							callExpressions.push(calleeName)
						}
					})
					if (callExpressions.length > 0) {
						metadata.calls = callExpressions
					}
					break
				case "class_declaration":
				case "class_definition": // Python
					type = "class"
					name = node.childForFieldName?.("name")?.text || `anonClass@${node.startPosition.row}`
					// Extract class inheritance (example)
					const superClassNode = node.childForFieldName?.("superclass") || node.child(2) // Python superclass position might differ
					const superClass = superClassNode?.text
					if (superClass && name !== `anonClass@${node.startPosition.row}`) {
						const sourceId = makeId(name, node.startPosition.row)
						// Target ID might need resolving if it's an import
						const targetId = makeId(superClass, 0) // Placeholder target ID
						relations.push({
							source_id: sourceId,
							target_id: targetId, // This needs proper resolution based on imports/scope
							relation_type: "inherits",
						})
					}
					break
				case "variable_declaration": // JS/TS
				case "lexical_declaration": // JS/TS
				case "assignment": // Python
					// This is complex, need to find the actual variable name(s)
					type = "variable"
					// Example: find identifier within declarator or left side of assignment
					const declarator = node.descendantsOfType("identifier")[0] // Simplistic example
					name = declarator?.text || `var@${node.startPosition.row}`
					break
				case "import_statement": {
					// JS/TS
					type = "import"
					name = node.text // Use the full import statement text as name for now
					const sourceId = makeId("module", node.startPosition.row) // ID for the current file
					const importPath = node.childForFieldName?.("source")?.text?.replace(/['"`]/g, "")
					if (importPath) {
						// Target ID needs resolution based on workspace structure
						const targetId = makeId(importPath, 0) // Placeholder target ID
						relations.push({
							source_id: sourceId,
							target_id: targetId, // Needs proper resolution
							relation_type: "imports",
						})
					}
					break
				}
				// Add cases for other languages/constructs as needed
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
					content: node.text, // Consider capturing only relevant parts or omitting for brevity
					startLine: node.startPosition.row, // Keep startLine for direct access
					endLine: node.endPosition.row, // Keep endLine for direct access
					startPosition: { line: node.startPosition.row, column: node.startPosition.column }, // Map row to line
					endPosition: { line: node.endPosition.row, column: node.endPosition.column }, // Map row to line
					parentId,
					metadata: Object.keys(metadata).length > 0 ? metadata : undefined, // Only add metadata if present
				}
				elements.push(element)

				// Set this as parent for children within this element
				parentId = id
			}

			// Traverse children
			for (let i = 0; i < node.namedChildCount; i++) {
				const child = node.namedChild(i)
				if (child) {
					// Ensure child is not null
					traverse(child, parentId)
				}
			}
		}

		if (parsedFile.ast.rootNode) {
			traverse(parsedFile.ast.rootNode)
		}

		return { elements, relations }
	}
}

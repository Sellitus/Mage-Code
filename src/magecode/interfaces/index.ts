import type { Tree } from "web-tree-sitter"
export interface IAgent {
	runTask(task: TaskInput): Promise<TaskResult>
	stop(): Promise<void>
}

export interface IContextRetriever {
	getContext(query: string, options: ContextOptions): Promise<RetrievedContext>
}

export interface ILLMOrchestrator {
	makeApiRequest(prompt: string, options: RequestOptions): Promise<LLMResponse>
}

// Placeholder types for now
export type TaskInput = any
export type TaskResult = any
export type ContextOptions = any
export type RetrievedContext = any
export type RequestOptions = any
export type LLMResponse = any

// --- Parser Specific Types ---

/** Represents a parsing error encountered by Tree-sitter. */
export interface ParserError {
	message: string
	location?: {
		line: number // 0-based line number
		column: number // 0-based column number
	}
	// Add other relevant error details if needed
}

/** Represents the result of parsing a single file. */
export interface ParsedFile {
	path: string // Absolute path to the file
	language: string // Detected language identifier (e.g., 'javascript', 'python')
	ast: Tree | null // The Tree-sitter Abstract Syntax Tree, null if parsing failed catastrophically
	errors: ParserError[] // Array of errors encountered during parsing
}

/** Represents a significant code element extracted from an AST (e.g., function, class, variable). */
export interface CodeElement {
	id: string // Unique identifier (e.g., filePath + ':' + name + '@' + startLine)
	filePath: string // Absolute path to the file containing the element
	type: string // Type of the element (e.g., 'function', 'class', 'method', 'variable', 'import')
	name: string // Name of the element (e.g., function name, class name)
	content: string // Full text content of the element
	startLine: number // 0-based start line number in the file
	endLine: number // 0-based end line number in the file
	startPosition: { line: number; column: number } // Precise start position
	endPosition: { line: number; column: number } // Precise end position
	parentId?: string // ID of the parent element, if any
	children?: CodeElement[] // Child elements (for hierarchical structure)
	metadata?: Record<string, any> // Additional metadata (e.g., visibility, return type)
	// Add other fields as needed based on analysis requirements
}

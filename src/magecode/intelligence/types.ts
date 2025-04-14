/**
 * Represents different types of code elements that can be analyzed
 */
export type ElementType =
	| "function"
	| "method"
	| "class"
	| "interface"
	| "variable"
	| "constant"
	| "module"
	| "namespace"
	| "type"
	| "enum"
	| "property"
	| "parameter"
	| "decorator"
	| "comment"
	| "import"
	| "export"

/**
 * Represents a parsed code element with its metadata
 */
export interface CodeElement {
	/** Unique identifier for this element */
	id: string
	/** Type of the code element */
	type: ElementType
	/** Name of the element */
	name: string
	/** Full textual content of the element */
	content: string
	/** Path to the file containing this element */
	filePath: string
	/** Start line in the file */
	startLine: number
	/** End line in the file */
	endLine: number
	/** Optional parent element ID */
	parentId?: string
	/** Optional metadata object */
	metadata?: Record<string, unknown>
}

/**
 * Represents options for parsing a file
 */
export interface ParseOptions {
	/** Whether to include comments in parsing */
	includeComments?: boolean
	/** Whether to parse nested elements */
	parseNested?: boolean
	/** File types to parse (e.g., ['ts', 'js']) */
	fileTypes?: string[]
	/** Maximum depth for nested parsing */
	maxDepth?: number
}

/**
 * Result from a parsing operation
 */
export interface ParseResult {
	/** List of parsed code elements */
	elements: CodeElement[]
	/** Any errors that occurred during parsing */
	errors: ParseError[]
	/** Path to the parsed file */
	filePath: string
	/** Timestamp of when the file was parsed */
	timestamp: number
}

/**
 * Represents a parsing error
 */
export interface ParseError {
	/** Error message */
	message: string
	/** Line number where error occurred */
	line?: number
	/** Column number where error occurred */
	column?: number
	/** Type of error */
	type: "syntax" | "unsupported" | "io" | "unknown"
	/** Additional error context */
	context?: Record<string, unknown>
}

/**
 * Base class for all MageCode specific errors.
 */
export class MageCodeError extends Error {
	public override readonly cause?: Error // Correct modifier order

	constructor(message: string, cause?: Error) {
		super(message)
		this.name = this.constructor.name // Set the error name to the class name
		this.cause = cause
		// Maintains proper stack trace in V8 environments (like Node.js)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor)
		}
	}
}

/**
 * Error during file parsing (e.g., Tree-sitter errors).
 */
export class ParsingError extends MageCodeError {
	public readonly filePath?: string
	public readonly language?: string

	constructor(message: string, options?: { cause?: Error; filePath?: string; language?: string }) {
		super(message, options?.cause)
		this.filePath = options?.filePath
		this.language = options?.language
	}
}

/**
 * Error during embedding generation or related operations.
 */
export class EmbeddingError extends MageCodeError {}

/**
 * Error during tool execution.
 */
export class ToolExecutionError extends MageCodeError {
	public readonly toolName?: string
	public readonly args?: any

	constructor(message: string, options?: { cause?: Error; toolName?: string; args?: any }) {
		super(message, options?.cause)
		this.toolName = options?.toolName
		this.args = options?.args
	}
}

/**
 * Error related to database operations (e.g., connection, query failures).
 */
export class DatabaseError extends MageCodeError {}

/**
 * Error related to vector index operations (e.g., initialization, search, add).
 */
export class VectorIndexError extends MageCodeError {}

/**
 * Error related to external API calls (e.g., LLM inference).
 */
export class ApiError extends MageCodeError {
	public readonly statusCode?: number

	constructor(message: string, options?: { cause?: Error; statusCode?: number }) {
		super(message, options?.cause)
		this.statusCode = options?.statusCode
	}
}

/**
 * Error related to configuration issues (e.g., missing settings, invalid values).
 */
export class ConfigurationError extends MageCodeError {}

/**
 * Error indicating an operation was cancelled or stopped prematurely.
 */
export class OperationCancelledError extends MageCodeError {
	constructor(message: string = "Operation cancelled") {
		super(message)
	}
}

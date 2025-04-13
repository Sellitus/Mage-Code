import * as vscode from "vscode"

/**
 * Configuration for a CodeWeaver task.
 */
export interface TaskConfig {
	/** Type of task being performed (e.g., 'refactor', 'explain', 'test') */
	taskType: string
	/** Model to use for the task (optional - uses default if not specified) */
	model?: string
	/** Additional task-specific options */
	options?: Record<string, unknown>
}

/**
 * Result of a CodeWeaver task.
 */
export interface TaskResult {
	/** Task output or response */
	output: string
	/** Any error that occurred during task execution */
	error?: Error
	/** Additional task-specific metadata */
	metadata?: Record<string, unknown>
}

/**
 * Dependencies injected into a CodeWeaver agent.
 */
export interface AgentDependencies {
	/** Logger instance for the agent */
	logger: {
		info: (message: string, ...args: unknown[]) => void
		warn: (message: string, ...args: unknown[]) => void
		error: (message: string, ...args: unknown[]) => void
		debug: (message: string, ...args: unknown[]) => void
	}
	/** Context retriever instance */
	contextRetriever: IContextRetriever
	/** LLM orchestrator instance */
	llmOrchestrator: ILLMOrchestrator
}

/**
 * Represents the current state of the editor.
 */
export interface EditorState {
	/** Path of the currently active file (if any) */
	filePath?: string
	/** Current cursor position */
	cursorPosition?: vscode.Position
	/** Current selection (if any) */
	selection?: vscode.Selection
	/** Currently visible ranges in the editor */
	visibleRanges?: readonly vscode.Range[]
}

/**
 * Represents a code snippet.
 */
export interface CodeSnippet {
	/** Path to the file containing the snippet */
	filePath: string
	/** Content of the snippet */
	content: string
	/** Starting line number in the file */
	startLine: number
	/** Ending line number in the file */
	endLine: number
	/** Relevancy score (optional) */
	score?: number
}

/**
 * Context retrieved for a task.
 */
export interface RetrievedContext {
	/** Array of relevant code snippets */
	snippets: CodeSnippet[]
	/** Optional interaction history */
	history?: {
		messages: LanguageModelChatMessage[]
		timestamp: number
	}[]
}

/**
 * Type alias for VS Code's chat message type.
 */
export type LanguageModelChatMessage = vscode.LanguageModelChatMessage

/**
 * Options for LLM requests.
 */
export interface LLMRequestOptions {
	/** Hint about the type of task being performed */
	taskTypeHint: string
	/** Optional parameters for the request */
	params?: {
		temperature?: number
		topP?: number
		maxTokens?: number
		stopSequences?: string[]
	}
	/** Preferred model to use */
	modelPreference?: string
}

/**
 * Type alias for VS Code's chat response type.
 */
export type LLMResponse = vscode.LanguageModelChatResponse

/**
 * Represents a chunk of a streamed LLM response.
 */
export interface LLMResponseStream {
	/** Content chunk */
	chunk?: string
	/** Error if one occurred */
	error?: Error
	/** Whether this is the final chunk */
	done?: boolean
}

/**
 * Input for context retrieval.
 */
export interface RetrievalInput {
	/** Task description or query */
	taskDescription: string
	/** Current editor state */
	editorState: EditorState
	/** Optional workspace path */
	workspacePath?: string
	/** Optional file extensions to consider */
	fileExtensions?: string[]
}

/**
 * Result from a retriever.
 */
export interface RetrieverResult {
	/** Unique identifier for the retrieved element */
	elementId: string
	/** Relevancy score */
	score: number
	/** Source information */
	source: {
		/** Type of source (e.g., 'file', 'git', 'workspace') */
		type: string
		/** Path or identifier for the source */
		path: string
	}
}

/**
 * Request for a tool call.
 */
export interface ToolCallRequest {
	/** Name of the tool to call */
	toolName: string
	/** Arguments for the tool call */
	arguments: Record<string, unknown>
	/** Additional context for the tool call */
	context?: {
		/** Editor state at time of call */
		editorState?: EditorState
		/** Previous tool results */
		previousResults?: ToolResultMessage[]
	}
}

/**
 * Result message from a tool call.
 */
export interface ToolResultMessage {
	/** Tool execution result */
	result?: unknown
	/** Error if one occurred */
	error?: Error
	/** Additional metadata about the tool execution */
	metadata?: Record<string, unknown>
}

/**
 * Interface for retrievers that can fetch relevant content.
 */
export interface IRetriever {
	/**
	 * Retrieve relevant content based on the provided input.
	 * @param input The retrieval input parameters
	 * @returns Promise resolving to an array of retrieval results
	 */
	retrieve(input: RetrievalInput): Promise<RetrieverResult[]>
}

/**
 * Interface for the context retrieval system.
 */
export interface IContextRetriever {
	/**
	 * Get relevant context for a task.
	 * @param taskDescription Description of the task being performed
	 * @param editorState Current state of the editor
	 * @param history Optional previous interaction history
	 * @param tokenLimit Optional maximum number of tokens to retrieve
	 * @returns Promise resolving to the retrieved context
	 */
	getContext(
		taskDescription: string,
		editorState: EditorState,
		history?: LanguageModelChatMessage[],
		tokenLimit?: number,
	): Promise<RetrievedContext>
}

/**
 * Interface for orchestrating LLM interactions.
 */
export interface ILLMOrchestrator {
	/**
	 * Make a request to the language model.
	 * @param prompt The messages to send to the model
	 * @param options Configuration options for the request
	 * @param cancellationToken Optional token for cancelling the request
	 * @returns Promise resolving to either a complete response or a stream of response chunks
	 */
	makeApiRequest(
		prompt: LanguageModelChatMessage[],
		options: LLMRequestOptions,
		cancellationToken?: vscode.CancellationToken,
	): Promise<LLMResponse | AsyncIterable<LLMResponseStream>>
}

/**
 * Interface for a CodeWeaver agent.
 */
export interface IAgent {
	/**
	 * Run a task with the given prompt and configuration.
	 * @param initialPrompt The initial prompt or task description
	 * @param taskConfig Configuration for the task
	 * @returns Promise resolving to the task result, or void if no explicit result
	 */
	runTask(initialPrompt: string, taskConfig: TaskConfig): Promise<TaskResult | void>
}

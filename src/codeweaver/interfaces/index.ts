export interface AgentDependencies {
	logger: Logger
	contextRetriever: IContextRetriever
	llmOrchestrator: ILLMOrchestrator
}

export interface CodeWeaverAgent {
	abortTask(): void
	api: any
	taskId: string
	instanceId: string
}

export interface Logger {
	info(message: string, ...args: any[]): void
	warn(message: string, ...args: any[]): void
	error(message: string, ...args: any[]): void
	debug(message: string, ...args: any[]): void
}

export interface IContextRetriever {
	getContext(
		taskDescription: string,
		editorState: EditorState,
		history?: LanguageModelChatMessage[],
		tokenLimit?: number,
	): Promise<RetrievedContext>
}

export interface ILLMOrchestrator {
	makeApiRequest(
		prompt: LanguageModelChatMessage[],
		options: LLMRequestOptions,
		cancellationToken?: any,
	): Promise<LLMResponse | AsyncIterable<LLMResponseStream>>
}

export interface RetrievedContext {
	relevantCode?: string
	filePath?: string
	metadata?: Record<string, any>
	snippets?: Array<{
		content: string
		filePath: string
		startLine?: number
		endLine?: number
		score?: number
	}>
}

export interface EditorState {
	currentFile?: string
	selectedText?: string
	visibleFiles?: string[]
	openFiles?: string[]
	recentFiles?: string[]
}

export type LanguageModelChatMessageRole = "system" | "user" | "assistant" | string

export interface LanguageModelChatMessage {
	role: LanguageModelChatMessageRole
	content: string
	name?: string
}

export interface LLMRequestOptions {
	temperature?: number
	maxTokens?: number
	model?: string
	stream?: boolean
}

export type LanguageModelChatResponse = {
	choices?: Array<{
		message: {
			content: string
			role: LanguageModelChatMessageRole
		}
	}>
}

export interface LLMResponse extends LanguageModelChatResponse {
	content: string
	metadata?: Record<string, any>
}

export interface LLMResponseStream {
	content: string
	done: boolean
	metadata?: Record<string, any>
}

export interface TaskConfig {
	mode?: string
	model?: string
	temperature?: number
	maxTokens?: number
	taskType?: string
}

export interface TaskResult {
	success: boolean
	message?: string
	data?: any
	output?: string
	error?: any
	metadata?: Record<string, any>
}

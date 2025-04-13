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

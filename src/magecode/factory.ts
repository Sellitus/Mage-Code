import { IContextRetriever, ILLMOrchestrator } from "./interfaces"

export interface MageCodeDependencies {
	contextRetriever: IContextRetriever | null
	llmOrchestrator: ILLMOrchestrator | null
	toolRegistry: any // Placeholder, will define type later
}

export function createMageCodeDependencies(): MageCodeDependencies {
	return {
		contextRetriever: null,
		llmOrchestrator: null,
		toolRegistry: null,
	}
}

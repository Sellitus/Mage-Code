import {
	ILLMOrchestrator,
	LanguageModelChatMessage,
	LLMRequestOptions,
	LLMResponse,
	LLMResponseStream,
} from "../interfaces"

export class CodeWeaverLLMOrchestratorStub implements ILLMOrchestrator {
	async makeApiRequest(
		prompt: LanguageModelChatMessage[],
		options: LLMRequestOptions,
		cancellationToken?: any,
	): Promise<LLMResponse | AsyncIterable<LLMResponseStream>> {
		return {
			content: "Mock LLM response",
			choices: [
				{
					message: {
						content: "Mock message content",
						role: "assistant",
					},
				},
			],
			metadata: { stub: true },
		}
	}
}

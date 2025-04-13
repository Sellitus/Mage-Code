import { IContextRetriever, EditorState, RetrievedContext, LanguageModelChatMessage } from "../interfaces"

export class CodeWeaverContextRetrieverStub implements IContextRetriever {
	async getContext(
		taskDescription: string,
		editorState: EditorState,
		history?: LanguageModelChatMessage[],
		tokenLimit?: number,
	): Promise<RetrievedContext> {
		return {
			relevantCode: "Mock relevant code",
			filePath: "mock/file/path.ts",
			snippets: [
				{
					content: "Mock code snippet",
					filePath: "mock/file/path.ts",
					startLine: 1,
					endLine: 5,
					score: 0.95,
				},
			],
			metadata: {
				stub: true,
				historyLength: history?.length ?? 0,
				tokenLimit,
			},
		}
	}
}

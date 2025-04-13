import { CodeWeaverAgent, TaskConfig, TaskResult, LanguageModelChatMessage } from "./interfaces"
import { AgentDependencies } from "./interfaces"

/**
 * A stub implementation of CodeWeaverAgent for testing
 */
export class CodeWeaverAgentStub implements CodeWeaverAgent {
	private isActive = true

	constructor(
		private readonly config: TaskConfig,
		private readonly dependencies: AgentDependencies,
	) {}

	public abortTask(): void {
		this.isActive = false
	}

	get api(): any {
		return {
			analyze: this.analyze.bind(this),
			execute: this.execute.bind(this),
			cleanup: this.cleanup.bind(this),
		}
	}

	get taskId(): string {
		return "mock-task-id"
	}

	get instanceId(): string {
		return "mock-instance-id"
	}

	private async analyze(message: LanguageModelChatMessage): Promise<TaskResult> {
		// Return a mock task result for analyze
		return {
			success: true,
			output: "Mock analysis result",
			metadata: { stub: true },
			message: "Analysis complete",
		}
	}

	private async execute(command: string): Promise<TaskResult> {
		// Return a mock task result for execute
		return {
			success: true,
			output: "Mock execution result",
			metadata: { stub: true },
			message: "Execution complete",
		}
	}

	private async cleanup(): Promise<TaskResult> {
		if (!this.isActive) {
			return {
				success: false,
				output: "Task was aborted",
				error: new Error("Task aborted"),
				metadata: { stub: true, error: true },
				message: "Task cleanup failed",
			}
		}

		return {
			success: true,
			output: "Mock cleanup result",
			metadata: { stub: true },
			message: "Cleanup complete",
		}
	}
}

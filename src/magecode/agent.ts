import { IAgent, TaskInput, TaskResult } from "./interfaces"
import { MageCodeDependencies } from "./factory"

export class MageCodeAgent implements IAgent {
	private deps: MageCodeDependencies

	constructor(deps: MageCodeDependencies) {
		this.deps = deps
	}

	async runTask(task: TaskInput): Promise<TaskResult> {
		// Placeholder implementation
		console.log("[MageCodeAgent] runTask called with:", task)
		return { result: "MageCodeAgent placeholder result", input: task }
	}

	async stop(): Promise<void> {
		// Placeholder implementation
		console.log("[MageCodeAgent] stop called")
	}
}

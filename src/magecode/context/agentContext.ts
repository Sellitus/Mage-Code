import * as vscode from "vscode"
import { TaskInput, RetrievedContext, TaskResult } from "../interfaces"

export interface TaskPlan {
	steps: Array<{
		description: string
		tools?: Array<{
			tool: string
			args: any
		}>
	}>
}

export interface ProgressInfo {
	type: "status" | "plan" | "step"
	message?: string
	stepNumber?: number
	totalSteps?: number
	description?: string
	plan?: TaskPlan
}

export class AgentContext {
	private task: TaskInput | null = null
	private retrievedContext: RetrievedContext | null = null
	private plan: TaskPlan | null = null
	private stopSignaled: boolean = false
	private toolResults: Map<string, any> = new Map()
	private stepResults: Array<string> = []
	private progress: vscode.Progress<ProgressInfo> | null = null

	async initialize(task: TaskInput, progress?: vscode.Progress<ProgressInfo>): Promise<void> {
		this.task = task
		this.retrievedContext = null
		this.plan = null
		this.stopSignaled = false
		this.toolResults.clear()
		this.stepResults = []
		this.progress = progress || null
	}

	setRetrievedContext(context: RetrievedContext): void {
		this.retrievedContext = context
	}

	getRetrievedContext(): RetrievedContext | null {
		return this.retrievedContext
	}

	setPlan(plan: TaskPlan): void {
		this.plan = plan
	}

	getPlan(): TaskPlan {
		if (!this.plan) {
			throw new Error("No plan has been set")
		}
		return this.plan
	}

	signalStop(): void {
		this.stopSignaled = true
	}

	shouldStop(): boolean {
		return this.stopSignaled
	}

	addToolResult(toolName: string, result: any): void {
		this.toolResults.set(toolName, result)
	}

	getToolResult(toolName: string): any | undefined {
		return this.toolResults.get(toolName)
	}

	addStepResult(stepIndex: number, result: string): void {
		this.stepResults[stepIndex] = result
	}

	getStepResult(stepIndex: number): string | undefined {
		return this.stepResults[stepIndex]
	}

	getAllStepResults(): Array<string> {
		return this.stepResults
	}

	reportProgress(info: ProgressInfo): void {
		if (this.progress) {
			this.progress.report(info)
		}
	}

	getTask(): TaskInput {
		if (!this.task) {
			throw new Error("No task has been initialized")
		}
		return this.task
	}

	/**
	 * Get a summary of the current context state
	 */
	getState(): string {
		return JSON.stringify(
			{
				hasTask: !!this.task,
				hasContext: !!this.retrievedContext,
				hasPlan: !!this.plan,
				toolResultsCount: this.toolResults.size,
				stepResultsCount: this.stepResults.length,
				isStopSignaled: this.stopSignaled,
			},
			null,
			2,
		)
	}
}

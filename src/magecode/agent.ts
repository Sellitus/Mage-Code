import * as vscode from "vscode"
import Ajv, { ErrorObject } from "ajv" // Use Ajv for JSON Schema validation
import { IAgent, TaskInput, TaskResult, IContextRetriever, ILLMOrchestrator } from "./interfaces"
import { MageCodeDependencies } from "./factory"
import { AgentContext, TaskPlan, ProgressInfo } from "./context/agentContext"
import { ProgressReporter } from "./utils/progress"
import { ToolRegistry } from "./tools/toolRegistry"
import { Tool } from "./interfaces/tool" // Tool interface defines inputSchema inline

export class MageCodeAgent implements IAgent {
	private contextRetriever: IContextRetriever
	private llmOrchestrator: ILLMOrchestrator
	private toolRegistry: ToolRegistry
	private context: AgentContext
	private isRunning: boolean = false

	constructor(deps: MageCodeDependencies) {
		// Ensure the contextRetriever implements IContextRetriever
		if (!this.isContextRetriever(deps.contextRetriever)) {
			throw new Error("contextRetriever must implement IContextRetriever")
		}
		this.contextRetriever = deps.contextRetriever
		this.llmOrchestrator = deps.llmOrchestrator
		this.toolRegistry = deps.toolRegistry
		this.context = new AgentContext()
	}

	private isContextRetriever(obj: any): obj is IContextRetriever {
		return obj && typeof obj.getContext === "function"
	}

	async runTask(task: TaskInput): Promise<TaskResult> {
		if (this.isRunning) {
			throw new Error("Agent is already running a task")
		}

		this.isRunning = true

		try {
			return await ProgressReporter.withProgress("Executing task", async (progress) => {
				// Initialize context with progress reporting
				await this.context.initialize(task, progress)

				// Report initial status
				this.context.reportProgress(ProgressReporter.status("Analyzing task and retrieving context..."))

				// Get relevant context
				const retrievedContext = await this.contextRetriever.getContext(task.query, {
					cursorFile: task.cursorFile,
					cursorLine: task.cursorLine,
					maxTokens: 4000,
					includeFileStructure: true,
				})

				this.context.setRetrievedContext(retrievedContext)

				// Plan approach
				this.context.reportProgress(ProgressReporter.status("Planning approach..."))

				await this.planApproach(task)

				// Execute plan
				const result = await this.executePlan()

				return {
					id: task.id,
					query: task.query,
					result,
					status: "completed",
				}
			})
		} catch (err) {
			console.error(`Task execution error: ${err}`)
			return {
				id: task.id,
				query: task.query,
				result: `Error: ${err instanceof Error ? err.message : String(err)}`,
				status: "error",
			}
		} finally {
			this.isRunning = false
		}
	}

	async stop(): Promise<void> {
		if (!this.isRunning) {
			return
		}

		this.context.signalStop()
		this.isRunning = false
	}

	private async planApproach(task: TaskInput): Promise<void> {
		const planningPrompt = this.constructPlanningPrompt(task)

		const planResponse = await this.llmOrchestrator.makeApiRequest(planningPrompt, {
			taskType: "planning",
			maxTokens: 1000,
			temperature: 0.2,
		})

		const plan = this.parsePlan(planResponse.content)
		this.context.setPlan(plan)

		// Report plan to user
		this.context.reportProgress(ProgressReporter.plan(plan))
	}

	private constructPlanningPrompt(task: TaskInput): string {
		const context = this.context.getRetrievedContext()
		const availableTools = this.toolRegistry.getAllTools()

		return `Task: ${task.query}

Available Context:
${JSON.stringify(context, null, 2)}

Available Tools:
${JSON.stringify(availableTools, null, 2)}

Create a detailed plan to accomplish this task. The plan should:
1. Break down the task into clear steps
2. Specify which tools to use for each step
3. Include any necessary validation or error handling

Format the response as a JSON object with a 'steps' array where each step has:
- description: String describing the step
- tools: Array of tool uses (optional), each with 'tool' name and 'args' object

Example format:
{
  "steps": [
    {
      "description": "First analyze the current file",
      "tools": [
        {
          "tool": "readFile",
          "args": {"path": "example.ts"}
        }
      ]
    }
  ]
}`
	}

	private parsePlan(content: string): TaskPlan {
		try {
			// Attempt to parse the plan as JSON
			const plan = JSON.parse(content)

			// Validate plan structure
			if (!Array.isArray(plan.steps)) {
				throw new Error("Plan must contain a steps array")
			}

			return plan
		} catch (err) {
			throw new Error(`Failed to parse plan: ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	private async executePlan(): Promise<string> {
		const plan = this.context.getPlan()
		let result = ""

		// Execute each step
		for (let i = 0; i < plan.steps.length; i++) {
			// Check if we should stop
			if (this.context.shouldStop()) {
				throw new Error("Task execution stopped by user")
			}

			const step = plan.steps[i]

			// Report current step
			this.context.reportProgress(ProgressReporter.step(i + 1, plan.steps.length, step.description))

			// Execute any tools for this step
			if (step.tools && step.tools.length > 0) {
				for (const toolUse of step.tools) {
					const tool = this.toolRegistry.getTool(toolUse.tool)
					if (!tool) {
						throw new Error(`Tool not found: ${toolUse.tool}`)
					}
					// Validate arguments against the tool's JSON schema using Ajv
					if (tool.inputSchema) {
						const ajv = new Ajv() // Consider making this a class member for efficiency
						const validate = ajv.compile(tool.inputSchema)
						const isValid = validate(toolUse.args)

						if (!isValid) {
							const errorMessages = (validate.errors ?? [])
								.map((e: ErrorObject) => `${e.instancePath || "root"} ${e.message}`)
								.join("; ")
							throw new Error(`Invalid arguments for tool ${toolUse.tool}: ${errorMessages}`)
						}
						// Args are valid, proceed with execution
						const toolResult = await tool.execute(toolUse.args)
						this.context.addToolResultForStep(i, toolUse.tool, toolUse.args, toolResult) // Use new context method
					} else {
						// Proceed without validation if no schema is defined
						console.warn(`Tool ${toolUse.tool} has no inputSchema defined. Skipping validation.`)
						const toolResult = await tool.execute(toolUse.args)
						this.context.addToolResultForStep(i, toolUse.tool, toolUse.args, toolResult) // Use new context method
					}
				}
			}

			// Generate step output using LLM
			const stepResponse = await this.llmOrchestrator.makeApiRequest(this.constructStepPrompt(step, i), {
				taskType: "execution",
				maxTokens: 2000,
				temperature: 0.5,
				systemPrompt: `You are executing step ${i + 1} of ${plan.steps.length}: ${step.description}`,
			})

			// Store step result
			this.context.addStepResult(i, stepResponse.content)

			// For the final step, use its output as the overall result
			if (i === plan.steps.length - 1) {
				result = stepResponse.content
			}
		}

		return result
	}

	private constructStepPrompt(step: TaskPlan["steps"][0], stepIndex: number): string {
		const task = this.context.getTask()
		const context = this.context.getRetrievedContext()
		const previousResults = this.context
			.getAllStepResults()
			.slice(0, stepIndex)
			.map((result, idx) => `Step ${idx + 1} Result: ${result}`)
			.join("\n\n")

		// Get tool results specifically for this step
		const currentStepToolResults = this.context.getToolResultsForStep(stepIndex)
		const toolResultsText =
			currentStepToolResults && currentStepToolResults.length > 0
				? currentStepToolResults
						.map(
							(call) =>
								`Tool: ${call.toolName}\nArgs: ${JSON.stringify(
									call.args,
									null,
									2,
								)}\nResult: ${JSON.stringify(call.result, null, 2)}`,
						)
						.join("\n---\n")
				: "No tools used in this step"

		return `Task: ${task.query}

Context:
${JSON.stringify(context, null, 2)}

Previous Steps:
${previousResults}

Current Step (${stepIndex + 1}):
${step.description}

Tool Results:
${toolResultsText}

Generate the appropriate output for this step. Consider:
1. The overall task goal
2. Results from previous steps
3. Available tool results
4. Current step requirements`
	}
}

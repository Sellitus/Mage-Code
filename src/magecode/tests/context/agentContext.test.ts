import { AgentContext, TaskPlan, ProgressInfo } from "../../context/agentContext"
import { TaskInput, RetrievedContext } from "../../interfaces"
import * as vscode from "vscode"

describe("AgentContext", () => {
	let context: AgentContext
	let mockProgress: vscode.Progress<ProgressInfo>
	let mockTask: TaskInput

	beforeEach(() => {
		context = new AgentContext()
		mockProgress = {
			report: jest.fn(),
		}
		mockTask = {
			id: "test-task",
			query: "test query",
			cursorFile: "test.ts",
			cursorLine: 1,
		}
	})

	describe("initialization", () => {
		it("should initialize with a task and optional progress", async () => {
			await context.initialize(mockTask, mockProgress)
			expect(context.getTask()).toEqual(mockTask)
		})

		it("should clear previous state on initialization", async () => {
			const mockContext: RetrievedContext = { relevantCode: [] }
			context.setRetrievedContext(mockContext)

			context.addToolResultForStep(0, "toolA", { arg: 1 }, { res: "a" }) // Add some state before re-init

			await context.initialize(mockTask)
			expect(context.getRetrievedContext()).toBeNull()
			expect(context.getToolResultsForStep(0)).toBeUndefined() // Check tool results are cleared
		})
	})

	describe("context management", () => {
		beforeEach(async () => {
			await context.initialize(mockTask)
		})

		it("should store and retrieve context", () => {
			const mockContext: RetrievedContext = { relevantCode: [] }
			context.setRetrievedContext(mockContext)
			expect(context.getRetrievedContext()).toEqual(mockContext)
		})

		it("should store and retrieve plan", () => {
			const mockPlan: TaskPlan = {
				steps: [
					{
						description: "test step",
						tools: [],
					},
				],
			}
			context.setPlan(mockPlan)
			expect(context.getPlan()).toEqual(mockPlan)
		})

		it("should throw when accessing plan before it is set", () => {
			expect(() => context.getPlan()).toThrow("No plan has been set")
		})
	})

	describe("progress reporting", () => {
		beforeEach(async () => {
			await context.initialize(mockTask, mockProgress)
		})

		it("should report progress when progress object is available", () => {
			const info: ProgressInfo = {
				type: "status",
				message: "test message",
			}
			context.reportProgress(info)
			expect(mockProgress.report).toHaveBeenCalledWith(info)
		})

		it("should not throw when reporting progress without progress object", async () => {
			await context.initialize(mockTask) // Initialize without progress
			expect(() => {
				context.reportProgress({ type: "status", message: "test" })
			}).not.toThrow()
		})
	})

	describe("step tool results", () => {
		beforeEach(async () => {
			await context.initialize(mockTask)
		})

		it("should store and retrieve tool results for a specific step", () => {
			const stepIndex = 0
			const toolName = "testTool"
			const args = { file: "a.ts" }
			const result = { content: "file content" }

			context.addToolResultForStep(stepIndex, toolName, args, result)
			const results = context.getToolResultsForStep(stepIndex)

			expect(results).toBeDefined()
			expect(results).toHaveLength(1)
			expect(results?.[0]).toEqual({ toolName, args, result })
		})

		it("should store multiple tool results for the same step", () => {
			const stepIndex = 1
			const tool1 = { toolName: "toolA", args: { x: 1 }, result: { y: 2 } }
			const tool2 = { toolName: "toolB", args: { z: 3 }, result: { w: 4 } }

			context.addToolResultForStep(stepIndex, tool1.toolName, tool1.args, tool1.result)
			context.addToolResultForStep(stepIndex, tool2.toolName, tool2.args, tool2.result)
			const results = context.getToolResultsForStep(stepIndex)

			expect(results).toBeDefined()
			expect(results).toHaveLength(2)
			expect(results).toEqual([tool1, tool2])
		})

		it("should return undefined for a step with no tool results", () => {
			expect(context.getToolResultsForStep(99)).toBeUndefined()
		})

		it("should store results for different steps independently", () => {
			const toolStep0 = { toolName: "tool0", args: { a: 0 }, result: { b: 0 } }
			const toolStep1 = { toolName: "tool1", args: { a: 1 }, result: { b: 1 } }

			context.addToolResultForStep(0, toolStep0.toolName, toolStep0.args, toolStep0.result)
			context.addToolResultForStep(1, toolStep1.toolName, toolStep1.args, toolStep1.result)

			expect(context.getToolResultsForStep(0)).toEqual([toolStep0])
			expect(context.getToolResultsForStep(1)).toEqual([toolStep1])
		})
	})

	describe("step results", () => {
		beforeEach(async () => {
			await context.initialize(mockTask)
		})

		it("should store and retrieve step results", () => {
			const stepIndex = 0
			const result = "Step completed successfully"

			context.addStepResult(stepIndex, result)
			expect(context.getStepResult(stepIndex)).toBe(result)
		})

		it("should maintain step result order", () => {
			context.addStepResult(0, "First step")
			context.addStepResult(2, "Third step")
			context.addStepResult(1, "Second step")

			expect(context.getAllStepResults()).toEqual(["First step", "Second step", "Third step"])
		})
	})

	describe("stop signal", () => {
		beforeEach(async () => {
			await context.initialize(mockTask)
		})

		it("should handle stop signaling", () => {
			expect(context.shouldStop()).toBe(false)
			context.signalStop()
			expect(context.shouldStop()).toBe(true)
		})

		it("should reset stop signal on initialization", async () => {
			context.signalStop()
			await context.initialize(mockTask)
			expect(context.shouldStop()).toBe(false)
		})
	})

	describe("state reporting", () => {
		it("should provide accurate state summary", async () => {
			await context.initialize(mockTask)
			const mockContext: RetrievedContext = { relevantCode: [] }
			const mockPlan: TaskPlan = { steps: [{ description: "test" }] }

			context.setRetrievedContext(mockContext)
			context.setPlan(mockPlan)
			context.addToolResultForStep(0, "tool1", { arg: "x" }, { res: "y" })
			context.addStepResult(0, "result")

			const state = JSON.parse(context.getState())
			expect(state).toEqual({
				hasTask: true,
				hasContext: true,
				hasPlan: true,
				stepToolResultsCount: 1, // Check the renamed property
				stepResultsCount: 1,
				isStopSignaled: false,
			})
		})
	})
})

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

			await context.initialize(mockTask)
			expect(context.getRetrievedContext()).toBeNull()
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

	describe("tool results", () => {
		beforeEach(async () => {
			await context.initialize(mockTask)
		})

		it("should store and retrieve tool results", () => {
			const toolName = "testTool"
			const result = { success: true }

			context.addToolResult(toolName, result)
			expect(context.getToolResult(toolName)).toEqual(result)
		})

		it("should return undefined for unknown tool results", () => {
			expect(context.getToolResult("nonexistent")).toBeUndefined()
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
			context.addToolResult("tool1", {})
			context.addStepResult(0, "result")

			const state = JSON.parse(context.getState())
			expect(state).toEqual({
				hasTask: true,
				hasContext: true,
				hasPlan: true,
				toolResultsCount: 1,
				stepResultsCount: 1,
				isStopSignaled: false,
			})
		})
	})
})

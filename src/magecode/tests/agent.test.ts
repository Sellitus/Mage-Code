import { MageCodeAgent } from "../agent"
import { AgentContext } from "../context/agentContext"
import { TaskInput, TaskResult, IContextRetriever } from "../interfaces"
import { createTestDependencies } from "../factory"
import { MageCodeDependencies } from "../factory"
import { RelevancyEngine } from "../relevancy"

describe("MageCodeAgent", () => {
	let agent: MageCodeAgent
	let dependencies: MageCodeDependencies

	beforeEach(async () => {
		dependencies = await createTestDependencies()
		agent = new MageCodeAgent(dependencies)

		// Cast contextRetriever to IContextRetriever for spying
		const contextRetriever = dependencies.contextRetriever as unknown as IContextRetriever
		jest.spyOn(contextRetriever, "getContext")

		// Add spy on llmOrchestrator.makeApiRequest
		jest.spyOn(dependencies.llmOrchestrator, "makeApiRequest")

		// Mock makeApiRequest to return a valid plan
		;(dependencies.llmOrchestrator.makeApiRequest as jest.Mock).mockResolvedValue({
			content: JSON.stringify({
				steps: [
					{
						description: "Test step",
						tools: [{ tool: "fileReader", args: { path: "test.ts" } }],
					},
				],
			}),
		})
	})

	describe("constructor", () => {
		it("should create instance with valid dependencies", () => {
			expect(agent).toBeInstanceOf(MageCodeAgent)
		})
	})

	describe("runTask", () => {
		const mockTask: TaskInput = {
			id: "test-1",
			query: "test query",
			cursorFile: "test.ts",
			cursorLine: 1,
		}

		it("should execute full task flow successfully", async () => {
			const result = await agent.runTask(mockTask)

			expect(result.status).toBe("completed")
			expect((dependencies.contextRetriever as unknown as IContextRetriever).getContext).toHaveBeenCalledWith(
				mockTask.query,
				expect.any(Object),
			)
			expect(dependencies.llmOrchestrator.makeApiRequest).toHaveBeenCalledTimes(2) // Plan + Step
		})

		it("should prevent concurrent task execution", async () => {
			// Start first task
			const firstTask = agent.runTask(mockTask)

			// Attempt to start second task
			await expect(agent.runTask(mockTask)).rejects.toThrow("Agent is already running a task")

			await firstTask // Clean up
		})

		it("should handle context retrieval failure", async () => {
			// Cast to IContextRetriever and then to jest.Mock for mocking
			const contextRetriever = dependencies.contextRetriever as unknown as IContextRetriever
			;(jest.spyOn(contextRetriever, "getContext") as jest.Mock).mockRejectedValueOnce(new Error("Context error"))

			const result = await agent.runTask(mockTask)

			expect(result.status).toBe("error")
			expect(result.result).toContain("Context error")
		})

		it("should handle plan parsing failure", async () => {
			// Mock invalid plan response
			;(dependencies.llmOrchestrator.makeApiRequest as jest.Mock).mockResolvedValueOnce({
				content: "invalid json",
			})

			const result = await agent.runTask(mockTask)

			expect(result.status).toBe("error")
			expect(result.result).toContain("Failed to parse plan")
		})

		it("should handle missing tool error", async () => {
			// Mock plan with non-existent tool
			;(dependencies.llmOrchestrator.makeApiRequest as jest.Mock).mockResolvedValueOnce({
				content: JSON.stringify({
					steps: [
						{
							description: "Test step",
							tools: [{ tool: "nonexistentTool", args: {} }],
						},
					],
				}),
			})

			const result = await agent.runTask(mockTask)

			expect(result.status).toBe("error")
			expect(result.result).toContain("Tool not found")
		})
	})

	describe("stop", () => {
		const mockTask: TaskInput = {
			id: "test-1",
			query: "test query",
			cursorFile: "test.ts",
			cursorLine: 1,
		}

		it("should handle stop request during execution", async () => {
			// Mock a long-running makeApiRequest
			;(dependencies.llmOrchestrator.makeApiRequest as jest.Mock).mockImplementationOnce(
				() => new Promise((resolve) => setTimeout(() => resolve({ content: "{}" }), 1000)),
			)

			// Start task
			const taskPromise = agent.runTask(mockTask)

			// Stop task
			await agent.stop()

			const result = await taskPromise

			expect(result.status).toBe("error")
			expect(result.result).toContain("stopped by user")
		})

		it("should do nothing if no task is running", async () => {
			await expect(agent.stop()).resolves.toBeUndefined()
		})
	})

	describe("plan execution", () => {
		const mockTask: TaskInput = {
			id: "test-1",
			query: "test query",
			cursorFile: "test.ts",
			cursorLine: 1,
		}

		it("should execute multi-step plans", async () => {
			// Mock a multi-step plan
			;(dependencies.llmOrchestrator.makeApiRequest as jest.Mock).mockResolvedValueOnce({
				content: JSON.stringify({
					steps: [
						{ description: "Step 1", tools: [{ tool: "fileReader", args: { path: "test1.ts" } }] },
						{ description: "Step 2", tools: [{ tool: "fileReader", args: { path: "test2.ts" } }] },
					],
				}),
			})

			// Mock step executions
			;(dependencies.llmOrchestrator.makeApiRequest as jest.Mock)
				.mockResolvedValueOnce({ content: "Step 1 result" })
				.mockResolvedValueOnce({ content: "Step 2 result" })

			const result = await agent.runTask(mockTask)

			expect(result.status).toBe("completed")
			expect(dependencies.llmOrchestrator.makeApiRequest).toHaveBeenCalledTimes(3) // Plan + 2 Steps
		})

		it("should handle steps without tools", async () => {
			// Mock a plan with no tools
			;(dependencies.llmOrchestrator.makeApiRequest as jest.Mock).mockResolvedValueOnce({
				content: JSON.stringify({
					steps: [{ description: "Step without tools" }],
				}),
			})

			const result = await agent.runTask(mockTask)

			expect(result.status).toBe("completed")
			expect(dependencies.llmOrchestrator.makeApiRequest).toHaveBeenCalledTimes(2) // Plan + Step
		})
	})
})

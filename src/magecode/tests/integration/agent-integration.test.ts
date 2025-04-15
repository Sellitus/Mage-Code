import * as vscode from "vscode"
import { MageCodeAgent } from "../../agent"
import { createTestDependencies, MageCodeDependencies } from "../../factory"
import { TaskInput, IContextRetriever } from "../../interfaces"
import { Tool } from "../../interfaces/tool"
import { FileReader } from "../../tools/fileReader"

describe("MageCode Agent Integration", () => {
	let dependencies: MageCodeDependencies
	let agent: MageCodeAgent
	let mockFileReader: jest.Mocked<Tool>

	beforeEach(async () => {
		// Create mock file reader
		mockFileReader = {
			name: "fileReader",
			description: "Reads file content",
			inputSchema: {
				type: "object",
				properties: {
					path: { type: "string" },
				},
				required: ["path"],
			},
			execute: jest.fn().mockResolvedValue("mock file content"),
		}

		// Create test dependencies
		dependencies = await createTestDependencies()

		// Register mock file reader
		dependencies.toolRegistry.registerTool(mockFileReader)

		// Create agent with test dependencies
		agent = new MageCodeAgent(dependencies)

		// Set up mocked responses for dependencies
		const contextRetriever = dependencies.contextRetriever as unknown as IContextRetriever
		jest.spyOn(contextRetriever, "getContext").mockResolvedValue({
			relevantCode: [
				{
					filePath: "test.ts",
					content: "existing code content",
					startLine: 1,
					endLine: 10,
				},
			],
		})

		jest.spyOn(dependencies.llmOrchestrator, "makeApiRequest").mockImplementation(async (prompt: string) => {
			if (prompt.includes("Create a detailed plan")) {
				// Return plan response
				return {
					content: JSON.stringify({
						steps: [
							{
								description: "Write the add function",
								tools: [
									{
										tool: "fileReader",
										args: { path: "test.ts" },
									},
								],
							},
						],
					}),
				}
			} else {
				// Return step execution response
				return {
					content: "function add(a: number, b: number): number {\n  return a + b;\n}",
				}
			}
		})
	})

	describe("Task Execution Pipeline", () => {
		const mockTask: TaskInput = {
			id: "test-integration-1",
			query: "Write a function that adds two numbers",
			cursorFile: "test.ts",
			cursorLine: 1,
		}

		it("should successfully process task through the full pipeline", async () => {
			// Set up progress reporting mock
			const progressSpy = jest.fn()
			const withProgressMock = (options: any, operation: any) => {
				return operation({ report: progressSpy })
			}
			;(vscode.window.withProgress as any) = jest.fn(withProgressMock)

			// Execute task
			const result = await agent.runTask(mockTask)

			// Verify task completed successfully
			expect(result.status).toBe("completed")

			// Verify context retrieval was called
			expect((dependencies.contextRetriever as unknown as IContextRetriever).getContext).toHaveBeenCalledWith(
				mockTask.query,
				expect.any(Object),
			)

			// Verify LLM calls for planning and execution
			expect(dependencies.llmOrchestrator.makeApiRequest).toHaveBeenCalledTimes(2)

			// Verify progress reporting
			expect(progressSpy).toHaveBeenCalled()
			expect(progressSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "status",
					message: expect.any(String),
				}),
			)
		})

		it("should handle pipeline errors gracefully", async () => {
			// Mock context retrieval error
			const contextRetriever = dependencies.contextRetriever as unknown as IContextRetriever
			jest.spyOn(contextRetriever, "getContext").mockRejectedValueOnce(new Error("Failed to access workspace"))

			const result = await agent.runTask(mockTask)

			expect(result.status).toBe("error")
			expect(result.result).toContain("Failed to access workspace")
		})

		it("should handle task interruption", async () => {
			// Mock long-running LLM operation
			jest.spyOn(dependencies.llmOrchestrator, "makeApiRequest").mockImplementationOnce(
				() => new Promise((resolve) => setTimeout(resolve, 1000)),
			)

			// Start task
			const taskPromise = agent.runTask(mockTask)

			// Stop task immediately
			await agent.stop()

			const result = await taskPromise

			expect(result.status).toBe("error")
			expect(result.result).toContain("stopped by user")
		})

		it("should maintain task state consistency", async () => {
			// Execute first task
			const firstResult = await agent.runTask(mockTask)
			expect(firstResult.status).toBe("completed")

			// Verify agent is ready for next task
			expect(agent["isRunning"]).toBe(false)

			// Execute second task
			const secondResult = await agent.runTask({
				...mockTask,
				id: "test-integration-2",
			})
			expect(secondResult.status).toBe("completed")
		})
	})

	describe("Tool Integration", () => {
		it("should correctly integrate with registered tools", async () => {
			// Mock plan that uses multiple tools
			jest.spyOn(dependencies.llmOrchestrator, "makeApiRequest").mockResolvedValueOnce({
				content: JSON.stringify({
					steps: [
						{
							description: "Read existing file",
							tools: [{ tool: "fileReader", args: { path: "test.ts" } }],
						},
					],
				}),
			})

			const result = await agent.runTask({
				id: "tool-test",
				query: "Read the test file",
				cursorFile: "test.ts",
				cursorLine: 1,
			})

			expect(result.status).toBe("completed")
			// Verify mock file reader was called
			expect(mockFileReader.execute).toHaveBeenCalledWith({ path: "test.ts" })
		})

		it("should handle missing tools gracefully", async () => {
			// Mock plan with non-existent tool
			jest.spyOn(dependencies.llmOrchestrator, "makeApiRequest").mockResolvedValueOnce({
				content: JSON.stringify({
					steps: [
						{
							description: "Use non-existent tool",
							tools: [{ tool: "nonexistentTool", args: {} }],
						},
					],
				}),
			})

			const result = await agent.runTask({
				id: "missing-tool-test",
				query: "Test missing tool",
				cursorFile: "test.ts",
				cursorLine: 1,
			})

			expect(result.status).toBe("error")
			expect(result.result).toContain("Tool not found")
		})
	})
})

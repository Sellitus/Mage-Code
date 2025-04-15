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
			execute: jest.fn().mockResolvedValue({ content: "mock file content" }), // Match expected result structure
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

		jest.spyOn(dependencies.llmOrchestrator, "makeApiRequest").mockImplementation(
			async (prompt: string, options?: any) => {
				// Default mock implementation, can be overridden in specific tests
				if (options?.taskType === "planning") {
					return {
						content: JSON.stringify({
							steps: [
								{
									description: "Default plan step",
									tools: [{ tool: "fileReader", args: { path: "default.ts" } }],
								},
							],
						}),
					}
				} else if (options?.taskType === "execution") {
					return { content: "Default execution result" }
				}
				return { content: "" } // Fallback
			},
		)
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
			// Also check context storage
			expect((agent as any).context.addToolResultForStep).toHaveBeenCalledWith(
				0, // stepIndex
				"fileReader",
				{ path: "test.ts" },
				{ content: "mock file content" }, // The result from the mock execute
			)
		})

		it("should validate tool arguments successfully", async () => {
			const validArgs = { path: "valid/path.ts" }
			// Mock plan specifically for this test
			jest.spyOn(dependencies.llmOrchestrator, "makeApiRequest").mockImplementation(async (prompt, options) => {
				if (options?.taskType === "planning") {
					return {
						content: JSON.stringify({
							steps: [
								{ description: "Use fileReader", tools: [{ tool: "fileReader", args: validArgs }] },
							],
						}),
					}
				} else if (options?.taskType === "execution") {
					return { content: "Execution done" }
				}
				return { content: "" }
			})

			const result = await agent.runTask({ id: "valid-args-test", query: "test", cursorFile: "f.ts" })

			expect(result.status).toBe("completed")
			expect(mockFileReader.execute).toHaveBeenCalledWith(validArgs)
		})

		it("should fail task on invalid tool arguments", async () => {
			const invalidArgs = { paht: "invalid/path.ts" } // Missing required 'path'
			// Mock plan specifically for this test
			jest.spyOn(dependencies.llmOrchestrator, "makeApiRequest").mockImplementation(async (prompt, options) => {
				if (options?.taskType === "planning") {
					return {
						content: JSON.stringify({
							steps: [
								{
									description: "Use fileReader invalidly",
									tools: [{ tool: "fileReader", args: invalidArgs }],
								},
							],
						}),
					}
				}
				// Execution should not be reached
				return { content: "" }
			})

			const result = await agent.runTask({ id: "invalid-args-test", query: "test", cursorFile: "f.ts" })

			expect(result.status).toBe("error")
			expect(result.result).toMatch(/Invalid arguments for tool fileReader:.*?must have required property 'path'/)
			expect(mockFileReader.execute).not.toHaveBeenCalled()
		})

		it("should pass correct tool results to subsequent step prompts", async () => {
			const step1ToolArgs = { path: "step1.ts" }
			const step1ToolResult = { content: "Content from step 1" }
			const step2ToolArgs = { path: "step2.ts", content: "new content" } // Assume a writeFile tool exists
			const step2ToolResult = { success: true }

			// Mock a writeFile tool
			const mockWriteFileTool: jest.Mocked<Tool> = {
				name: "writeFile",
				description: "Writes file content",
				inputSchema: {
					type: "object",
					properties: { path: { type: "string" }, content: { type: "string" } },
					required: ["path", "content"],
				},
				execute: jest.fn().mockResolvedValue(step2ToolResult),
			}
			dependencies.toolRegistry.registerTool(mockWriteFileTool) // Register it

			// Mock the plan
			jest.spyOn(dependencies.llmOrchestrator, "makeApiRequest").mockImplementation(async (prompt, options) => {
				if (options?.taskType === "planning") {
					return {
						content: JSON.stringify({
							steps: [
								{ description: "Step 1: Read", tools: [{ tool: "fileReader", args: step1ToolArgs }] },
								{ description: "Step 2: Write", tools: [{ tool: "writeFile", args: step2ToolArgs }] },
							],
						}),
					}
				} else if (options?.taskType === "execution") {
					// Check which step is being executed based on system prompt or content
					if (prompt.includes("Step 1: Read")) {
						return { content: "Step 1 execution done" }
					} else if (prompt.includes("Step 2: Write")) {
						// IMPORTANT: Check the prompt content here for previous results
						expect(prompt).toContain("Previous Steps:\nStep 1 Result: Step 1 execution done")
						expect(prompt).toContain("Tool Results:") // Check section exists
						expect(prompt).toContain(`Tool: ${mockWriteFileTool.name}`) // Check current tool info
						expect(prompt).toContain(`Args: ${JSON.stringify(step2ToolArgs, null, 2)}`)
						expect(prompt).toContain(`Result: ${JSON.stringify(step2ToolResult, null, 2)}`)
						// Crucially, it should NOT contain step 1's tool results in the "Tool Results:" section for step 2
						expect(prompt).not.toMatch(
							/Tool Results:[\s\S]*Tool: fileReader[\s\S]*Args: \{\s*"path": "step1\.ts"\s*\}[\s\S]*Result: \{\s*"content": "Content from step 1"\s*\}/,
						)
						return { content: "Step 2 execution done" }
					}
				}
				return { content: "" }
			})

			// Mock fileReader execute for step 1
			mockFileReader.execute.mockResolvedValueOnce(step1ToolResult)

			const result = await agent.runTask({ id: "multi-step-tool-test", query: "test", cursorFile: "f.ts" })

			expect(result.status).toBe("completed")
			expect(result.result).toBe("Step 2 execution done")
			expect(mockFileReader.execute).toHaveBeenCalledWith(step1ToolArgs)
			expect(mockWriteFileTool.execute).toHaveBeenCalledWith(step2ToolArgs)
			expect(dependencies.llmOrchestrator.makeApiRequest).toHaveBeenCalledTimes(3) // Plan + 2 steps
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

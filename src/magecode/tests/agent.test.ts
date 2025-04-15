import Ajv from "ajv" // Import Ajv for potential use in mocks if needed
import { MageCodeAgent } from "../agent"
import { AgentContext, TaskPlan } from "../context/agentContext"
import { TaskInput, TaskResult, IContextRetriever, ILLMOrchestrator } from "../interfaces"
import { Tool } from "../interfaces/tool"
import { createTestDependencies } from "../factory"
import { MageCodeDependencies } from "../factory"
import { ToolRegistry } from "../tools/toolRegistry"

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
		let mockTask: TaskInput
		let mockContext: AgentContext
		let mockToolRegistry: ToolRegistry
		let mockLlmOrchestrator: ILLMOrchestrator

		// Define mock tools
		const mockReadFileTool: Tool = {
			name: "readFile",
			description: "Reads a file",
			inputSchema: {
				type: "object",
				properties: { path: { type: "string" } },
				required: ["path"],
			},
			execute: jest.fn().mockResolvedValue({ content: "file content" }) as jest.Mock,
		}

		const mockWriteFileTool: Tool = {
			name: "writeFile",
			description: "Writes a file",
			inputSchema: {
				type: "object",
				properties: { path: { type: "string" }, content: { type: "string" } },
				required: ["path", "content"],
			},
			execute: jest.fn().mockResolvedValue({ success: true }) as jest.Mock,
		}

		const mockToolWithoutSchema: Tool = {
			name: "toolWithoutSchema",
			description: "A tool without a schema",
			inputSchema: { type: "object", properties: {} }, // Provide minimal schema to satisfy type
			execute: jest.fn().mockResolvedValue({ result: "ok" }) as jest.Mock,
		}

		beforeEach(async () => {
			// Reset mocks for dependencies before each test in this block
			dependencies = await createTestDependencies() // Recreate fresh dependencies
			agent = new MageCodeAgent(dependencies)

			// Assign mocks for easier access
			mockContext = (agent as any).context // Access private context for spying
			mockToolRegistry = dependencies.toolRegistry
			mockLlmOrchestrator = dependencies.llmOrchestrator

			mockTask = {
				id: "test-1",
				query: "test query",
				cursorFile: "test.ts",
				cursorLine: 1,
			}

			// Reset mocks on tools (casting execute to jest.Mock allows using mock methods)
			;(mockReadFileTool.execute as jest.Mock).mockClear().mockResolvedValue({ content: "file content" })
			;(mockWriteFileTool.execute as jest.Mock).mockClear().mockResolvedValue({ success: true })
			;(mockToolWithoutSchema.execute as jest.Mock).mockClear().mockResolvedValue({ result: "ok" })

			// Spy on context methods
			jest.spyOn(mockContext, "addToolResultForStep")
			jest.spyOn(mockContext, "getToolResultsForStep")
			jest.spyOn(mockContext, "shouldStop").mockReturnValue(false) // Default to not stopped

			// Spy on tool registry
			jest.spyOn(mockToolRegistry, "getTool").mockImplementation((toolName: string) => {
				if (toolName === mockReadFileTool.name) return mockReadFileTool
				if (toolName === mockWriteFileTool.name) return mockWriteFileTool
				if (toolName === mockToolWithoutSchema.name) return mockToolWithoutSchema
				return undefined
			})

			// Spy on LLM orchestrator
			jest.spyOn(mockLlmOrchestrator, "makeApiRequest")

			// Default mock for planning response (can be overridden in tests)
			;(mockLlmOrchestrator.makeApiRequest as jest.Mock).mockImplementation(async (prompt, options) => {
				if (options?.taskType === "planning") {
					return {
						content: JSON.stringify({
							steps: [{ description: "Default step", tools: [] }],
						}),
					}
				}
				if (options?.taskType === "execution") {
					return { content: "Default step execution result" }
				}
				return { content: "" } // Default fallback
			})
		})

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

			const multiStepResult = await agent.runTask(mockTask) // Renamed variable

			expect(multiStepResult.status).toBe("completed")
			expect(dependencies.llmOrchestrator.makeApiRequest).toHaveBeenCalledTimes(3) // Plan + 2 Steps
			// Mock step executions (adjust based on the number of steps in the plan mock)
			;(mockLlmOrchestrator.makeApiRequest as jest.Mock)
				.mockResolvedValueOnce({ content: "Step 1 result" }) // Step 1 execution
				.mockResolvedValueOnce({ content: "Step 2 result" }) // Step 2 execution

			const noToolsResult = await agent.runTask(mockTask) // Renamed variable

			expect(multiStepResult.status).toBe("completed")
			expect(multiStepResult.result).toBe("Step 2 result") // Final result is from the last step
			expect(mockLlmOrchestrator.makeApiRequest).toHaveBeenCalledTimes(3) // Plan + 2 Steps
			expect(mockReadFileTool.execute).toHaveBeenCalledTimes(2)
			expect(mockContext.addToolResultForStep).toHaveBeenCalledTimes(2)
			expect(mockContext.addToolResultForStep).toHaveBeenNthCalledWith(
				1,
				0, // stepIndex
				mockReadFileTool.name,
				{ path: "test1.ts" },
				{ content: "file content" },
			)
			expect(mockContext.addToolResultForStep).toHaveBeenNthCalledWith(
				2,
				1, // stepIndex
				mockReadFileTool.name,
				{ path: "test2.ts" },
				{ content: "file content" },
			)
		})

		it("should handle steps without tools", async () => {
			// Mock a plan with no tools for the step
			;(mockLlmOrchestrator.makeApiRequest as jest.Mock).mockImplementation(async (prompt, options) => {
				if (options?.taskType === "planning") {
					return {
						content: JSON.stringify({
							steps: [{ description: "Step without tools" }], // No tools array
						}),
					}
				}
				if (options?.taskType === "execution") {
					return { content: "Step finished" }
				}
				return { content: "" }
			})

			const noToolsResult = await agent.runTask(mockTask) // Use correct variable name

			expect(noToolsResult.status).toBe("completed") // Use correct variable name
			expect(noToolsResult.result).toBe("Step finished") // Use correct variable name
			expect(mockLlmOrchestrator.makeApiRequest).toHaveBeenCalledTimes(2) // Plan + 1 Step
			expect(mockContext.addToolResultForStep).not.toHaveBeenCalled()
		})

		it("should validate tool arguments successfully", async () => {
			const validArgs = { path: "valid/path.ts" }
			;(mockLlmOrchestrator.makeApiRequest as jest.Mock).mockImplementation(async (prompt, options) => {
				if (options?.taskType === "planning") {
					return {
						content: JSON.stringify({
							steps: [{ description: "Use readFile", tools: [{ tool: "readFile", args: validArgs }] }],
						}),
					}
				}
				if (options?.taskType === "execution") {
					return { content: "Read file successfully" }
				}
				return { content: "" }
			})

			const validationSuccessResult = await agent.runTask(mockTask) // Use correct variable name

			expect(validationSuccessResult.status).toBe("completed") // Use correct variable name
			expect(mockReadFileTool.execute).toHaveBeenCalledWith(validArgs)
			expect(mockContext.addToolResultForStep).toHaveBeenCalledWith(0, mockReadFileTool.name, validArgs, {
				content: "file content",
			})
		})

		it("should throw error on tool argument validation failure", async () => {
			const invalidArgs = { paht: "typo/path.ts" } // Missing 'path', has 'paht'
			;(mockLlmOrchestrator.makeApiRequest as jest.Mock).mockImplementation(async (prompt, options) => {
				if (options?.taskType === "planning") {
					return {
						content: JSON.stringify({
							steps: [{ description: "Use readFile", tools: [{ tool: "readFile", args: invalidArgs }] }],
						}),
					}
				}
				return { content: "" } // Execution won't happen
			})

			const validationFailResult = await agent.runTask(mockTask) // Use correct variable name

			expect(validationFailResult.status).toBe("error") // Use correct variable name
			expect(validationFailResult.result).toMatch(
				/Invalid arguments for tool readFile:.*?must have required property 'path'/,
			) // Use correct variable name
			expect(mockReadFileTool.execute).not.toHaveBeenCalled()
			expect(mockContext.addToolResultForStep).not.toHaveBeenCalled()
		})

		it("should execute tool without schema successfully", async () => {
			const args = { any: "data" }
			;(mockLlmOrchestrator.makeApiRequest as jest.Mock).mockImplementation(async (prompt, options) => {
				if (options?.taskType === "planning") {
					return {
						content: JSON.stringify({
							steps: [
								{
									description: "Use tool without schema",
									tools: [{ tool: "toolWithoutSchema", args: args }],
								},
							],
						}),
					}
				}
				if (options?.taskType === "execution") {
					return { content: "Tool executed" }
				}
				return { content: "" }
			})

			const noSchemaResult = await agent.runTask(mockTask) // Use correct variable name

			expect(noSchemaResult.status).toBe("completed") // Use correct variable name
			expect(mockToolWithoutSchema.execute).toHaveBeenCalledWith(args)
			expect(mockContext.addToolResultForStep).toHaveBeenCalledWith(0, mockToolWithoutSchema.name, args, {
				result: "ok",
			})
		})

		it("should handle tool execution errors", async () => {
			const executionError = new Error("Tool failed!") // Renamed variable
			;(mockReadFileTool.execute as jest.Mock).mockRejectedValueOnce(executionError)
			;(mockLlmOrchestrator.makeApiRequest as jest.Mock).mockImplementation(async (prompt, options) => {
				if (options?.taskType === "planning") {
					return {
						content: JSON.stringify({
							steps: [
								{
									description: "Use readFile",
									tools: [{ tool: "readFile", args: { path: "a.ts" } }],
								},
							],
						}),
					}
				}
				return { content: "" } // Execution won't happen after error
			})

			const toolExecErrorResult = await agent.runTask(mockTask) // Use correct variable name

			expect(toolExecErrorResult.status).toBe("error") // Use correct variable name
			expect(toolExecErrorResult.result).toContain("Tool failed!") // Use correct variable name
			expect(mockContext.addToolResultForStep).not.toHaveBeenCalled()
		})

		it("should construct step prompt with correct step-specific tool results", async () => {
			const plan: TaskPlan = {
				steps: [
					{
						description: "Step 1: Read file",
						tools: [{ tool: "readFile", args: { path: "file1.ts" } }],
					},
					{
						description: "Step 2: Write file",
						tools: [{ tool: "writeFile", args: { path: "file2.ts", content: "new" } }],
					},
				],
			}
			const readFileResult = { content: "content from file1" }
			const writeFileResult = { success: true }

			;(mockReadFileTool.execute as jest.Mock).mockResolvedValueOnce(readFileResult)
			;(mockWriteFileTool.execute as jest.Mock).mockResolvedValueOnce(writeFileResult)

			// Mock planning to return our specific plan
			;(mockLlmOrchestrator.makeApiRequest as jest.Mock).mockImplementation(async (prompt, options) => {
				if (options?.taskType === "planning") {
					return { content: JSON.stringify(plan) }
				}
				// Mock execution steps
				if (options?.taskType === "execution") {
					if (options.systemPrompt?.includes("Step 1")) {
						return { content: "Step 1 done" }
					}
					if (options.systemPrompt?.includes("Step 2")) {
						return { content: "Step 2 done" }
					}
				}
				return { content: "" }
			})

			await agent.runTask(mockTask)

			// Verify calls to LLM for execution steps
			const executionCalls = (mockLlmOrchestrator.makeApiRequest as jest.Mock).mock.calls.filter(
				(call) => call[1]?.taskType === "execution",
			)
			expect(executionCalls).toHaveLength(2)

			// Check prompt for Step 1
			const step1Prompt = executionCalls[0][0] as string
			expect(step1Prompt).toContain("Current Step (1): Step 1: Read file")
			expect(step1Prompt).toContain("Tool Results:")
			expect(step1Prompt).toContain(`Tool: ${mockReadFileTool.name}`)
			expect(step1Prompt).toContain(`Args: ${JSON.stringify({ path: "file1.ts" }, null, 2)}`)
			expect(step1Prompt).toContain(`Result: ${JSON.stringify(readFileResult, null, 2)}`)
			expect(step1Prompt).not.toContain(`Tool: ${mockWriteFileTool.name}`) // Should not contain step 2 results

			// Check prompt for Step 2
			const step2Prompt = executionCalls[1][0] as string
			expect(step2Prompt).toContain("Current Step (2): Step 2: Write file")
			expect(step2Prompt).toContain("Previous Steps:\nStep 1 Result: Step 1 done") // Check previous results
			expect(step2Prompt).toContain("Tool Results:")
			expect(step2Prompt).toContain(`Tool: ${mockWriteFileTool.name}`)
			expect(step2Prompt).toContain(`Args: ${JSON.stringify({ path: "file2.ts", content: "new" }, null, 2)}`)
			expect(step2Prompt).toContain(`Result: ${JSON.stringify(writeFileResult, null, 2)}`)
			expect(step2Prompt).not.toContain(`Tool: ${mockReadFileTool.name}`) // Should not contain step 1 results
		})

		it("should stop execution if stop signal is received during tool loop", async () => {
			const plan: TaskPlan = {
				steps: [
					{
						description: "Step 1: Multiple tools",
						tools: [
							{ tool: "readFile", args: { path: "file1.ts" } },
							{ tool: "writeFile", args: { path: "file2.ts", content: "new" } }, // This shouldn't run
						],
					},
				],
			}
			// Mock planning
			;(mockLlmOrchestrator.makeApiRequest as jest.Mock).mockImplementation(async (prompt, options) => {
				if (options?.taskType === "planning") {
					return { content: JSON.stringify(plan) }
				}
				return { content: "" } // Execution won't happen
			})

			// Signal stop after the first tool is retrieved but before its execution finishes (or just before second tool)
			jest.spyOn(mockToolRegistry, "getTool").mockImplementationOnce((toolName: string) => {
				// After getting the first tool (readFile), signal stop
				if (toolName === mockReadFileTool.name) {
					// Simulate stop signal being set *during* the tool loop
					jest.spyOn(mockContext, "shouldStop").mockReturnValue(true)
					return mockReadFileTool
				}
				return undefined // Should not reach here if stop works
			})

			// We need to refine the stop check simulation. Let's assume stop is checked *before* each tool execution loop iteration
			// Reset the getTool mock
			jest.spyOn(mockToolRegistry, "getTool").mockImplementation((toolName: string) => {
				if (toolName === mockReadFileTool.name) return mockReadFileTool
				if (toolName === mockWriteFileTool.name) return mockWriteFileTool
				return undefined
			})

			// Mock shouldStop to return true *after* the first tool execution completes
			;(mockReadFileTool.execute as jest.Mock).mockImplementationOnce(async () => {
				// Simulate work...
				await new Promise((res) => setTimeout(res, 10))
				// Now signal stop
				jest.spyOn(mockContext, "shouldStop").mockReturnValue(true)
				return { content: "read result" }
			})

			const stopSignalResult = await agent.runTask(mockTask) // Renamed variable

			expect(stopSignalResult.status).toBe("error")
			expect(stopSignalResult.result).toContain("stopped by user")
			expect(mockReadFileTool.execute).toHaveBeenCalledTimes(1) // First tool runs
			expect(mockWriteFileTool.execute).not.toHaveBeenCalled() // Second tool does not run
			expect(mockContext.addToolResultForStep).toHaveBeenCalledTimes(1) // Only first tool result added
			// Verify LLM execution call for the step was not made
			const executionCalls = (mockLlmOrchestrator.makeApiRequest as jest.Mock).mock.calls.filter(
				(call) => call[1]?.taskType === "execution",
			)
			expect(executionCalls).toHaveLength(0)
		})
	})
})

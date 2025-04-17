// src/magecode/tools/__tests__/toolRegistry.test.ts

import { ToolRegistry } from "../toolRegistry"
import { Tool, ToolDefinition } from "../../interfaces/tool"
import { logger } from "../../utils/logging" // Import logger to spy on it

// Mock Tool implementation for testing
class MockTool implements Tool {
	constructor(
		public name: string,
		public description: string = "Mock tool description",
	) {}

	public readonly inputSchema = {
		type: "object" as const,
		properties: {
			mockParam: { type: "string" as const },
		},
	}

	async execute(args: any): Promise<any> {
		return `Executed ${this.name} with args: ${JSON.stringify(args)}`
	}
}

describe("ToolRegistry", () => {
	let toolRegistry: ToolRegistry
	let mockTool1: MockTool
	let mockTool2: MockTool

	beforeEach(() => {
		// Create a fresh registry for each test
		toolRegistry = new ToolRegistry()
		mockTool1 = new MockTool("mockTool1", "Description for tool 1")
		mockTool2 = new MockTool("mockTool2", "Description for tool 2")
		// Suppress logger output during tests
		jest.spyOn(logger, "warn").mockImplementation(() => {})
		jest.spyOn(logger, "info").mockImplementation(() => {}) // Suppress registration logs
	})

	afterEach(() => {
		jest.restoreAllMocks() // Restore console mocks
	})

	it("should register a tool successfully", () => {
		toolRegistry.registerTool(mockTool1)
		expect(toolRegistry.hasTool("mockTool1")).toBe(true)
		expect(toolRegistry.getTool("mockTool1")).toBe(mockTool1)
	})

	it("should allow retrieving a registered tool", () => {
		toolRegistry.registerTool(mockTool1)
		const retrievedTool = toolRegistry.getTool("mockTool1")
		expect(retrievedTool).toBeDefined()
		expect(retrievedTool?.name).toBe("mockTool1")
	})

	it("should return undefined for a non-existent tool", () => {
		const retrievedTool = toolRegistry.getTool("nonExistentTool")
		expect(retrievedTool).toBeUndefined()
	})

	it("should correctly report if a tool exists", () => {
		toolRegistry.registerTool(mockTool1)
		expect(toolRegistry.hasTool("mockTool1")).toBe(true)
		expect(toolRegistry.hasTool("nonExistentTool")).toBe(false)
	})

	it("should overwrite an existing tool when registering with the same name (and log warning)", () => {
		const loggerWarnSpy = jest.spyOn(logger, "warn") // Spy on logger.warn
		const newMockTool1 = new MockTool("mockTool1", "New description")

		toolRegistry.registerTool(mockTool1) // Initial registration
		toolRegistry.registerTool(newMockTool1) // Overwrite

		expect(loggerWarnSpy).toHaveBeenCalledWith(
			// Check loggerWarnSpy
			'ToolRegistry: Tool with name "mockTool1" already registered. Overwriting.',
		)
		expect(toolRegistry.getTool("mockTool1")).toBe(newMockTool1) // Should be the new instance
		expect(toolRegistry.getTool("mockTool1")?.description).toBe("New description")
		// No need to restore spy here if using jest.restoreAllMocks() in afterEach
	})

	it("should return definitions of all registered tools", () => {
		toolRegistry.registerTool(mockTool1)
		toolRegistry.registerTool(mockTool2)

		const allTools = toolRegistry.getAllTools()
		expect(allTools).toHaveLength(2)

		const tool1Def = allTools.find((t) => t.name === "mockTool1")
		const tool2Def = allTools.find((t) => t.name === "mockTool2")

		expect(tool1Def).toBeDefined()
		expect(tool1Def?.description).toBe("Description for tool 1")
		expect(tool1Def?.inputSchema).toEqual(mockTool1.inputSchema)

		expect(tool2Def).toBeDefined()
		expect(tool2Def?.description).toBe("Description for tool 2")
		expect(tool2Def?.inputSchema).toEqual(mockTool2.inputSchema)
	})

	it("should return an empty array if no tools are registered", () => {
		const allTools = toolRegistry.getAllTools()
		expect(allTools).toHaveLength(0)
		expect(allTools).toEqual([])
	})
})

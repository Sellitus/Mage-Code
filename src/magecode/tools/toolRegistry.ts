// src/magecode/tools/toolRegistry.ts

import { Tool, ToolDefinition } from "../interfaces/tool"

/**
 * Manages the registration and retrieval of tools available to the agent.
 */
export class ToolRegistry {
	private readonly tools: Map<string, Tool> = new Map()

	/**
	 * Registers a new tool.
	 * Throws an error if a tool with the same name is already registered.
	 * @param tool - The tool instance to register.
	 */
	public registerTool(tool: Tool): void {
		if (this.hasTool(tool.name)) {
			// Consider whether to throw, warn, or allow overwriting based on project needs
			console.warn(`ToolRegistry: Tool with name "${tool.name}" already registered. Overwriting.`)
			// throw new Error(`ToolRegistry: Tool with name "${tool.name}" already registered.`);
		}
		this.tools.set(tool.name, tool)
		console.log(`ToolRegistry: Registered tool "${tool.name}"`)
	}

	/**
	 * Retrieves a tool by its unique name.
	 * @param name - The name of the tool to retrieve.
	 * @returns The tool instance, or undefined if not found.
	 */
	public getTool(name: string): Tool | undefined {
		return this.tools.get(name)
	}

	/**
	 * Checks if a tool with the given name is registered.
	 * @param name - The name of the tool to check.
	 * @returns True if the tool is registered, false otherwise.
	 */
	public hasTool(name: string): boolean {
		return this.tools.has(name)
	}

	/**
	 * Gets the definitions of all registered tools.
	 * @returns An array of ToolDefinition objects.
	 */
	public getAllTools(): ToolDefinition[] {
		const definitions: ToolDefinition[] = []
		for (const tool of this.tools.values()) {
			definitions.push({
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema,
			})
		}
		return definitions
	}
}

// Optional: Export a singleton instance if desired for the application
// export const toolRegistry = new ToolRegistry();

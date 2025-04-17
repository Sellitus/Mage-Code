// src/magecode/tools/toolRegistry.ts

import { Tool, ToolDefinition } from "../interfaces/tool"
import { logger } from "../utils/logging" // Import the logger

/**
 * Manages the registration and retrieval of tools available to the MageCode agent.
 * Allows tools conforming to the `Tool` interface to be registered and accessed by name.
 */
export class ToolRegistry {
	private readonly tools: Map<string, Tool> = new Map()

	/**
	 * Registers a new tool with the registry.
	 * If a tool with the same name already exists, it logs a warning and overwrites the existing tool.
	 * @param tool - The `Tool` instance to register.
	 */
	public registerTool(tool: Tool): void {
		if (this.hasTool(tool.name)) {
			// Consider whether to throw, warn, or allow overwriting based on project needs
			logger.warn(`ToolRegistry: Tool with name "${tool.name}" already registered. Overwriting.`)
			// throw new Error(`ToolRegistry: Tool with name "${tool.name}" already registered.`);
		}
		this.tools.set(tool.name, tool)
		logger.info(`ToolRegistry: Registered tool "${tool.name}"`)
	}

	/**
	 * Retrieves a registered tool instance by its unique name.
	 * @param name - The name of the tool to retrieve.
	 * @returns The `Tool` instance if found, otherwise `undefined`.
	 */
	public getTool(name: string): Tool | undefined {
		return this.tools.get(name)
	}

	/**
	/**
	 * Checks if a tool with the specified name has been registered.
	 * @param name - The name of the tool to check for.
	 * @returns `true` if a tool with the given name is registered, `false` otherwise.
	 */
	public hasTool(name: string): boolean {
		return this.tools.has(name)
	}

	/**
	 * Gets the definitions (name, description, input schema) of all registered tools.
	 * This is typically used to provide the LLM with a list of available tools.
	 * @returns An array of `ToolDefinition` objects.
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

// src/magecode/interfaces/tool.ts

/**
 * Represents the definition of a tool, typically used for listing available tools.
 */
export interface ToolDefinition {
	/**
	 * The unique name of the tool.
	 */
	name: string
	/**
	 * A brief description of what the tool does.
	 */
	description: string
	/**
	 * A schema defining the expected input arguments for the tool's execute method.
	 * Using a simple object structure for now, can be refined (e.g., JSON Schema).
	 */
	inputSchema: {
		type: "object"
		properties: {
			[key: string]: {
				type: string
				description?: string
				// Add other schema properties as needed (e.g., required, enum)
			}
		}
		required?: string[]
	}
}

/**
 * Represents an executable tool that the agent can use.
 */
export interface Tool extends ToolDefinition {
	/**
	 * Executes the tool's logic with the provided arguments.
	 * @param args - The arguments matching the tool's inputSchema.
	 * @returns A promise that resolves with the result of the tool's execution (often a string, but can be any type).
	 */
	execute(args: any): Promise<any>
}

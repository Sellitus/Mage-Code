/**
 * Represents a tool that can be executed by the agent
 */
export interface Tool {
	name: string
	description: string
	inputSchema: {
		type: string
		properties: Record<string, any>
		required?: string[]
	}
	execute(args: any): Promise<any>
}

/**
 * Public definition of a tool without implementation details
 */
export interface ToolDefinition {
	name: string
	description: string
	inputSchema: {
		type: string
		properties: Record<string, any>
		required?: string[]
	}
}

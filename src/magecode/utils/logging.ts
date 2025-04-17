import * as vscode from "vscode"

/**
 * A simple logger utility that writes to a dedicated VS Code output channel.
 * Uses a singleton pattern to ensure only one channel is created.
 */
class Logger {
	private static instance: Logger
	private readonly outputChannel: vscode.OutputChannel

	private constructor() {
		this.outputChannel = vscode.window.createOutputChannel("MageCode")
	}

	/**
	 * Gets the singleton instance of the Logger.
	 */
	public static getInstance(): Logger {
		if (!Logger.instance) {
			Logger.instance = new Logger()
		}
		return Logger.instance
	}

	private log(level: string, message: string, ...optionalParams: any[]): void {
		const timestamp = new Date().toISOString()
		const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`
		if (optionalParams.length > 0) {
			// Stringify objects for better readability in the output channel
			const formattedParams = optionalParams.map((param) =>
				typeof param === "object" ? JSON.stringify(param, null, 2) : param,
			)
			this.outputChannel.appendLine(`${formattedMessage} ${formattedParams.join(" ")}`)
		} else {
			this.outputChannel.appendLine(formattedMessage)
		}
	}

	/**
	 * Logs an informational message.
	 */
	public info(message: string, ...optionalParams: any[]): void {
		this.log("info", message, ...optionalParams)
	}

	/**
	 * Logs a warning message.
	 */
	public warn(message: string, ...optionalParams: any[]): void {
		this.log("warn", message, ...optionalParams)
	}

	/**
	 * Logs an error message.
	 */
	public error(message: string, error?: Error | any, ...optionalParams: any[]): void {
		let errorMessage = message
		if (error) {
			errorMessage += `\nError: ${error instanceof Error ? error.stack || error.message : JSON.stringify(error)}`
		}
		this.log("error", errorMessage, ...optionalParams)
	}

	/**
	 * Logs a debug message. (Consider adding a setting to enable/disable debug logs later)
	 */
	public debug(message: string, ...optionalParams: any[]): void {
		// For now, log debug messages like info. Add conditional logic based on settings later if needed.
		this.log("debug", message, ...optionalParams)
	}

	/**
	 * Reveals the output channel in the UI.
	 */
	public show(): void {
		this.outputChannel.show()
	}

	/**
	 * Disposes the output channel. Should be called on extension deactivation.
	 */
	public dispose(): void {
		this.outputChannel.dispose()
	}
}

// Export the singleton instance
export const logger = Logger.getInstance()

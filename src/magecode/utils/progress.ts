import * as vscode from "vscode"
import { ProgressInfo } from "../context/agentContext"

export class ProgressReporter {
	/**
	 * Creates a new progress operation with the given title
	 */
	static async withProgress<T>(
		title: string,
		operation: (progress: vscode.Progress<ProgressInfo>) => Promise<T>,
	): Promise<T> {
		return vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title,
				cancellable: true,
			},
			operation,
		)
	}

	/**
	 * Format a progress message for the current step
	 */
	static formatStepMessage(stepNumber: number, totalSteps: number, description: string): string {
		return `Step ${stepNumber}/${totalSteps}: ${description}`
	}

	/**
	 * Creates standard progress info for the status type
	 */
	static status(message: string): ProgressInfo {
		return {
			type: "status",
			message,
		}
	}

	/**
	 * Creates standard progress info for the plan type
	 */
	static plan(plan: any): ProgressInfo {
		return {
			type: "plan",
			plan,
		}
	}

	/**
	 * Creates standard progress info for a step
	 */
	static step(stepNumber: number, totalSteps: number, description: string): ProgressInfo {
		return {
			type: "step",
			stepNumber,
			totalSteps,
			description,
			message: this.formatStepMessage(stepNumber, totalSteps, description),
		}
	}
}

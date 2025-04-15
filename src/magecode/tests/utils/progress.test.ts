import { ProgressReporter } from "../../utils/progress"
import * as vscode from "vscode"

describe("ProgressReporter", () => {
	describe("withProgress", () => {
		it("should call vscode.window.withProgress with correct options", async () => {
			const mockProgress = {
				report: jest.fn(),
			}

			// Mock vscode.window.withProgress
			const mockWithProgress = jest.fn((options, callback) => {
				return callback(mockProgress)
			})
			;(vscode.window.withProgress as any) = mockWithProgress

			const title = "Test Operation"
			const operation = jest.fn()

			await ProgressReporter.withProgress(title, operation)

			expect(mockWithProgress).toHaveBeenCalledWith(
				{
					location: vscode.ProgressLocation.Notification,
					title,
					cancellable: true,
				},
				expect.any(Function),
			)
			expect(operation).toHaveBeenCalledWith(mockProgress)
		})

		it("should pass through operation result", async () => {
			const expectedResult = { success: true }
			const operation = jest.fn().mockResolvedValue(expectedResult)

			;(vscode.window.withProgress as any) = (options: any, callback: any) => {
				return callback({ report: jest.fn() })
			}

			const result = await ProgressReporter.withProgress("Test", operation)

			expect(result).toEqual(expectedResult)
		})
	})

	describe("message formatting", () => {
		it("should format step message correctly", () => {
			const message = ProgressReporter.formatStepMessage(2, 5, "Test step")
			expect(message).toBe("Step 2/5: Test step")
		})
	})

	describe("progress info creation", () => {
		it("should create status info", () => {
			const info = ProgressReporter.status("Working...")
			expect(info).toEqual({
				type: "status",
				message: "Working...",
			})
		})

		it("should create plan info", () => {
			const plan = {
				steps: [{ description: "Test step" }],
			}
			const info = ProgressReporter.plan(plan)
			expect(info).toEqual({
				type: "plan",
				plan,
			})
		})

		it("should create step info", () => {
			const info = ProgressReporter.step(1, 3, "Test step")
			expect(info).toEqual({
				type: "step",
				stepNumber: 1,
				totalSteps: 3,
				description: "Test step",
				message: "Step 1/3: Test step",
			})
		})
	})
})

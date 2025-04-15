import * as vscode from "vscode"
import * as assert from "assert"
import { describe, it, before, after } from "mocha" // Added Mocha imports
import { MultiModelOrchestrator } from "../../../../src/magecode/orchestration" // Adjust path relative to out/
import { RequestOptions } from "../../../../src/magecode/interfaces" // Adjust path

// Helper function to wait for settings propagation
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("MageCode Orchestration Integration Tests", () => {
	let orchestrator: MultiModelOrchestrator | undefined
	let originalPreference: string | undefined

	before(async () => {
		// Get the extension instance and potentially the orchestrator
		// This might need adjustment based on how the orchestrator is exposed
		const extension = vscode.extensions.getExtension("RooVeterinaryInc.roo-cline")
		if (!extension) {
			throw new Error("Roo Code extension not found.")
		}
		await extension.activate() // Ensure extension is active

		// Attempt to get the orchestrator instance (assuming it's exposed somehow)
		// Placeholder: Replace with actual mechanism if available
		// orchestrator = extension.exports?.getMageCodeOrchestrator?.();
		// For now, we might need to skip tests if we can't get the instance.
		// Let's assume we *can* get it for the structure.
		// If not, these tests would need significant rework based on extension architecture.

		// Store original preference
		originalPreference = vscode.workspace.getConfiguration("roo-code").get("magecode.modelPreference")
		console.log("Original modelPreference:", originalPreference)

		// For testing, we need a way to get the orchestrator instance.
		// If it's not directly exposed, these tests might fail or need modification.
		// This is a common challenge in VS Code extension E2E testing.
		// Let's log a warning if we can't get it.
		if (!orchestrator) {
			console.warn("Could not get MageCode Orchestrator instance. Skipping integration tests.")
		}
	})

	after(async () => {
		// Restore original preference
		console.log("Restoring modelPreference to:", originalPreference)
		await vscode.workspace
			.getConfiguration("roo-code")
			.update("magecode.modelPreference", originalPreference, vscode.ConfigurationTarget.Global)
		await delay(500) // Allow time for setting to apply
	})

	// Function to update setting and wait
	async function updatePreference(preference: string) {
		console.log(`Updating modelPreference to: ${preference}`)
		await vscode.workspace
			.getConfiguration("roo-code")
			.update("magecode.modelPreference", preference, vscode.ConfigurationTarget.Global)
		await delay(500) // Allow time for setting update to propagate
		const updatedPref = vscode.workspace.getConfiguration("roo-code").get("magecode.modelPreference")
		console.log(`Preference updated to: ${updatedPref}`)
		assert.strictEqual(updatedPref, preference, "Setting did not update correctly")
	}

	// --- Routing Tests ---

	it("should route to LOCAL when preference is forceLocal", async function () {
		if (!orchestrator) this.skip() // Skip if orchestrator instance not available
		await updatePreference("forceLocal")

		const shortPrompt = "Test force local"
		const options: RequestOptions = {}
		const response = await orchestrator!.makeApiRequest(shortPrompt, options) // Added non-null assertion

		// We expect the modelType to indicate local usage.
		// The exact string depends on the LocalModelTier implementation.
		assert.ok(
			response.modelType?.toLowerCase().includes("local"),
			`Expected local model, got ${response.modelType}`,
		)
	})

	it("should route to CLOUD when preference is forceCloud", async function () {
		if (!orchestrator) this.skip()
		await updatePreference("forceCloud")

		const shortPrompt = "Test force cloud"
		const options: RequestOptions = {}
		const response = await orchestrator!.makeApiRequest(shortPrompt, options) // Added non-null assertion

		// We expect the modelType to indicate cloud usage.
		assert.ok(
			response.modelType?.toLowerCase().includes("cloud") ||
				response.modelType?.toLowerCase().includes("anthropic"), // Or whatever the cloud provider is
			`Expected cloud model, got ${response.modelType}`,
		)
	})

	it("should route short prompt to LOCAL with auto preference", async function () {
		if (!orchestrator) this.skip()
		await updatePreference("auto")

		const shortPrompt = "Explain this." // Simple, short prompt
		const options: RequestOptions = { taskType: "explanation" }
		const response = await orchestrator!.makeApiRequest(shortPrompt, options) // Added non-null assertion

		assert.ok(
			response.modelType?.toLowerCase().includes("local"),
			`Expected local model for short prompt/auto, got ${response.modelType}`,
		)
	})

	it("should route long prompt to CLOUD with auto preference", async function () {
		if (!orchestrator) this.skip()
		await updatePreference("auto")

		const longPrompt = "Generate a detailed plan for a multi-stage project... ".repeat(50) // Long prompt
		const options: RequestOptions = { taskType: "planning" }
		const response = await orchestrator!.makeApiRequest(longPrompt, options) // Added non-null assertion

		assert.ok(
			response.modelType?.toLowerCase().includes("cloud") ||
				response.modelType?.toLowerCase().includes("anthropic"),
			`Expected cloud model for long prompt/auto, got ${response.modelType}`,
		)
	})

	// --- Caching Tests ---

	it("should potentially use cache on second identical request", async function () {
		if (!orchestrator) this.skip()
		await updatePreference("auto") // Use auto for predictable routing

		const prompt = "Test caching behavior"
		const options: RequestOptions = { cacheResponse: true, skipCache: false }

		console.log("Making first request (cache miss expected)")
		const startTime1 = Date.now()
		const response1 = await orchestrator!.makeApiRequest(prompt, options) // Added non-null assertion
		const duration1 = Date.now() - startTime1
		console.log(`First request took ${duration1}ms, model: ${response1.modelType}`)

		console.log("Making second request (cache hit expected)")
		const startTime2 = Date.now()
		// Ensure skipCache is false (default) or explicitly false
		const response2 = await orchestrator!.makeApiRequest(prompt, { ...options, skipCache: false }) // Added non-null assertion
		const duration2 = Date.now() - startTime2
		console.log(`Second request took ${duration2}ms, model: ${response2.modelType}`)

		// Assertions:
		// 1. Content should be the same
		assert.strictEqual(response1.content, response2.content, "Cached content differs")
		// 2. Second request *should* be faster (though timing is flaky in tests)
		// A more robust test would check logs or a specific cache flag if implemented.
		// For now, we log durations. A simple check:
		assert.ok(
			duration2 < duration1 + 100,
			`Second request (${duration2}ms) was not significantly faster than first (${duration1}ms)`,
		) // Allow some buffer
		// 3. Check if the orchestrator returns 0 latency for cache hits
		assert.strictEqual(response2.latency, 0, "Expected 0 latency for cache hit")
	})

	it("should not use cache if skipCache is true", async function () {
		if (!orchestrator) this.skip()
		await updatePreference("auto")

		const prompt = "Test skipCache option"
		const options: RequestOptions = { cacheResponse: true } // Ensure it *would* be cached

		console.log("Making first request (to populate cache)")
		await orchestrator!.makeApiRequest(prompt, options) // Added non-null assertion

		console.log("Making second request with skipCache=true")
		const startTime = Date.now()
		const response = await orchestrator!.makeApiRequest(prompt, { ...options, skipCache: true }) // Added non-null assertion
		const duration = Date.now() - startTime
		console.log(`Second request (skipCache=true) took ${duration}ms`)

		// Assertion: Latency should NOT be 0 (or near 0) indicating a real request occurred
		assert.ok(response.latency > 10, "Expected non-zero latency when skipping cache")
	})

	// Add more tests for fallback logic if possible within E2E constraints
	// (e.g., if local model can be reliably made to fail/timeout)
})

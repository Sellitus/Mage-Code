import * as os from "os"
import { ResourceGovernor, ResourceGovernorConfig } from "../resourceGovernor"
import { logger } from "../../../utils/logging" // Corrected relative path

// Mock the logger to prevent actual logging during tests
jest.mock("../../../utils/logging", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
		fatal: jest.fn(),
		child: jest.fn().mockReturnThis(),
		close: jest.fn(),
	},
}))

// Mock os module
jest.mock("os")

describe("ResourceGovernor", () => {
	let mockOs: jest.Mocked<typeof os>
	let memoryUsageSpy: jest.SpyInstance

	beforeAll(() => {
		// Initialize the spy once for the entire describe block
		memoryUsageSpy = jest.spyOn(process, "memoryUsage")
	})

	beforeEach(() => {
		// Reset mocks before each test
		jest.useFakeTimers()
		mockOs = os as jest.Mocked<typeof os>

		// Reset the spy's call history and set default return value for the test
		memoryUsageSpy.mockClear()
		memoryUsageSpy.mockReturnValue({ rss: 100 * 1024 * 1024 } as any) // Default 100MB RSS

		// Default mock implementations for os
		mockOs.cpus.mockReturnValue([{}, {}] as any) // Default to 2 cores
		mockOs.loadavg.mockReturnValue([0.5, 0.5, 0.5]) // Default low load

		// Clear logger mocks
		;(logger.info as jest.Mock).mockClear()
		;(logger.warn as jest.Mock).mockClear()
	})

	afterEach(() => {
		jest.useRealTimers()
		jest.clearAllMocks() // Clear other mocks like logger
	})

	afterAll(() => {
		// Restore the original implementation after all tests in the suite have run
		memoryUsageSpy.mockRestore()
	})

	it("should initialize with default configuration", () => {
		const governor = new ResourceGovernor()
		expect(governor.getBaselineConcurrency()).toBe(1) // Default: cpus - 1
		expect(governor.getMinConcurrency()).toBe(1)
		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Initialized"))
		governor.dispose() // Clean up timer
	})

	it("should initialize with custom configuration", () => {
		const config: ResourceGovernorConfig = {
			highLoadMarkRatio: 0.8,
			maxMemoryMb: 512,
			checkIntervalMs: 10000,
			minWorkers: 2,
			maxWorkers: 4,
		}
		mockOs.cpus.mockReturnValue([{}, {}, {}, {}, {}] as any) // 5 cores for this test
		const governor = new ResourceGovernor(config)
		expect(governor.getBaselineConcurrency()).toBe(4) // Custom maxWorkers
		expect(governor.getMinConcurrency()).toBe(2) // Custom minWorkers
		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Concurrency: 2-4"))
		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Max Memory: 512 MB"))
		governor.dispose()
	})

	it("should ensure maxWorkers is not less than minWorkers", () => {
		const config: ResourceGovernorConfig = {
			minWorkers: 3,
			maxWorkers: 2, // Lower than minWorkers
		}
		mockOs.cpus.mockReturnValue([{}, {}] as any) // 2 cores
		const governor = new ResourceGovernor(config)
		expect(governor.getBaselineConcurrency()).toBe(3) // Should be adjusted to minWorkers
		expect(governor.getMinConcurrency()).toBe(3)
		governor.dispose()
	})

	it("should start monitoring on initialization and check load immediately", () => {
		const setIntervalSpy = jest.spyOn(global, "setInterval")
		const governor = new ResourceGovernor()
		expect(setIntervalSpy).toHaveBeenCalledTimes(1)
		expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5000) // Default interval
		const clearIntervalSpy = jest.spyOn(global, "clearInterval")
		governor.dispose()
		expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
		setIntervalSpy.mockRestore()
		clearIntervalSpy.mockRestore()
	})

	describe("canDispatchTask", () => {
		it("should return true when system load is low", () => {
			mockOs.loadavg.mockReturnValue([0.2, 0.2, 0.2]) // Low load (0.2 < 2 * 1.0)
			memoryUsageSpy.mockReturnValue({ rss: 200 * 1024 * 1024 } as any) // Low memory (200MB < 1024MB)
			const governor = new ResourceGovernor()
			jest.advanceTimersByTime(5000) // Trigger interval check
			expect(governor.canDispatchTask()).toBe(true)
			governor.dispose()
		})

		it("should return false when CPU load exceeds threshold", () => {
			mockOs.loadavg.mockReturnValue([2.5, 2.5, 2.5]) // High load (2.5 >= 2 * 1.0)
			memoryUsageSpy.mockReturnValue({ rss: 200 * 1024 * 1024 } as any) // Low memory
			const governor = new ResourceGovernor()
			jest.advanceTimersByTime(5000) // Trigger interval check
			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining("System load status changed. Under Load: true"),
			)
			expect(governor.canDispatchTask()).toBe(false)
			governor.dispose()
		})

		it("should return true when load drops below thresholds", () => {
			// Initial high load
			mockOs.loadavg.mockReturnValue([3.0, 3.0, 3.0])
			const governor = new ResourceGovernor()
			jest.advanceTimersByTime(5000)
			expect(governor.canDispatchTask()).toBe(false)
			expect(logger.warn).toHaveBeenCalledTimes(1) // Initial change to true

			// Simulate load drop
			mockOs.loadavg.mockReturnValue([0.5, 0.5, 0.5])
			jest.advanceTimersByTime(5000) // Trigger next interval check
			expect(logger.warn).toHaveBeenCalledTimes(2) // Second change back to false
			expect(governor.canDispatchTask()).toBe(true)
			governor.dispose()
		})

		it("should return last known state if called while monitoring is inactive (after dispose)", () => {
			mockOs.loadavg.mockReturnValue([3.0, 3.0, 3.0]) // High load
			const governor = new ResourceGovernor()
			jest.advanceTimersByTime(5000)
			expect(governor.canDispatchTask()).toBe(false) // Should be under load

			governor.dispose()
			expect(governor.canDispatchTask()).toBe(false) // Should retain last state (under load)
		})
	})
})

import * as os from "os"
import * as process from "process"
import { logger } from "../../utils/logging" // Correct relative path

export interface ResourceGovernorConfig {
	/** CPU load average (1-minute) threshold to consider the system under high load. Relative to core count (e.g., 1.0 = 100% utilization per core). */
	highLoadMarkRatio?: number
	/** Maximum memory usage (RSS) in MB before considering the system under high load. */
	maxMemoryMb?: number
	/** Interval in milliseconds to check system load. */
	checkIntervalMs?: number
	/** Minimum number of workers to keep */
	minWorkers?: number
	/** Maximum number of workers (defaults to core count - 1) */
	maxWorkers?: number
}

// Define defaults without runtime calls
const DEFAULT_CONFIG_BASE: Omit<Required<ResourceGovernorConfig>, "maxWorkers"> = {
	highLoadMarkRatio: 1.0,
	maxMemoryMb: 1024,
	checkIntervalMs: 5000,
	minWorkers: 1,
	// maxWorkers will be calculated in constructor
}

export class ResourceGovernor {
	private config: Required<ResourceGovernorConfig>
	private coreCount: number
	private highLoadThreshold: number
	private maxMemoryBytes: number
	private checkIntervalId: NodeJS.Timeout | null = null
	private _isSystemUnderLoad = false // Internal state

	constructor(config: ResourceGovernorConfig = {}) {
		this.coreCount = os.cpus()?.length || 1 // Get core count safely
		const calculatedMaxWorkers = Math.max(1, this.coreCount - 1)

		// Combine base defaults, calculated default maxWorkers, and user config
		this.config = {
			...DEFAULT_CONFIG_BASE,
			maxWorkers: calculatedMaxWorkers, // Apply calculated default
			...config, // User config overrides defaults
		}

		this.highLoadThreshold = this.coreCount * this.config.highLoadMarkRatio
		this.maxMemoryBytes = this.config.maxMemoryMb * 1024 * 1024

		// Ensure final maxWorkers is not less than minWorkers
		this.config.maxWorkers = Math.max(this.config.minWorkers, this.config.maxWorkers)

		logger.info(
			`[ResourceGovernor] Initialized. Cores: ${this.coreCount}, Load Threshold: ${this.highLoadThreshold.toFixed(
				2,
			)}, Max Memory: ${this.config.maxMemoryMb} MB, Concurrency: ${this.config.minWorkers}-${
				this.config.maxWorkers
			}`,
		)

		// Start monitoring immediately
		this.startMonitoring()
	}

	/**
	 * Starts the periodic check of system load.
	 */
	public startMonitoring(): void {
		if (this.checkIntervalId) {
			logger.warn("[ResourceGovernor] Monitoring already started.")
			return
		}
		logger.info(`[ResourceGovernor] Starting monitoring interval (${this.config.checkIntervalMs}ms)...`)
		// Perform an initial check immediately
		this._checkSystemLoad()
		this.checkIntervalId = setInterval(() => {
			this._checkSystemLoad()
		}, this.config.checkIntervalMs)
	}

	/**
	 * Stops the periodic check of system load.
	 */
	public stopMonitoring(): void {
		if (this.checkIntervalId) {
			logger.info("[ResourceGovernor] Stopping monitoring interval.")
			clearInterval(this.checkIntervalId)
			this.checkIntervalId = null
		} else {
			logger.warn("[ResourceGovernor] Monitoring not active.")
		}
	}

	/**
	 * Checks the current system load and memory usage and updates the internal state.
	 */
	private _checkSystemLoad(): void {
		const loadAvg = os.loadavg()[0] // 1-minute average
		const memoryUsage = process.memoryUsage().rss // Resident Set Size in bytes

		const wasUnderLoad = this._isSystemUnderLoad
		this._isSystemUnderLoad = loadAvg >= this.highLoadThreshold || memoryUsage >= this.maxMemoryBytes

		if (this._isSystemUnderLoad !== wasUnderLoad) {
			logger.warn(
				`[ResourceGovernor] System load status changed. Under Load: ${
					this._isSystemUnderLoad
				}. LoadAvg: ${loadAvg.toFixed(2)}/${this.highLoadThreshold.toFixed(
					2,
				)}, Memory: ${(memoryUsage / 1024 / 1024).toFixed(0)}/${this.config.maxMemoryMb} MB`,
			)
		} else {
			logger.debug(
				`[ResourceGovernor] Load check. Under Load: ${
					this._isSystemUnderLoad
				}. LoadAvg: ${loadAvg.toFixed(2)}/${this.highLoadThreshold.toFixed(
					2,
				)}, Memory: ${(memoryUsage / 1024 / 1024).toFixed(0)}/${this.config.maxMemoryMb} MB`,
			)
		}
	}

	/**
	 * Returns the recommended baseline concurrency (max workers) based on configuration.
	 * Used for initial pool sizing.
	 */
	public getBaselineConcurrency(): number {
		return this.config.maxWorkers
	}

	/**
	 * Returns the minimum number of workers based on configuration.
	 */
	public getMinConcurrency(): number {
		return this.config.minWorkers
	}

	/**
	 * Indicates whether a new task can be dispatched based on the current system load.
	 * @returns `true` if the system is not considered under high load, `false` otherwise.
	 */
	public canDispatchTask(): boolean {
		// Always allow dispatching if monitoring hasn't started or stopped? Or default to false?
		// For now, assume monitoring is active when this is called.
		if (!this.checkIntervalId) {
			logger.warn("[ResourceGovernor] canDispatchTask called while monitoring is inactive. Assuming OK.")
			// return true; // Or maybe false to be safe? Let's return the last known state or default false.
			return !this._isSystemUnderLoad // Return last known state
		}
		return !this._isSystemUnderLoad
	}

	/**
	 * Cleans up resources, stopping the monitoring interval.
	 */
	public dispose(): void {
		this.stopMonitoring()
	}
}

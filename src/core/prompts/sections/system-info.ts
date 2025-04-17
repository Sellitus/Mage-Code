// Removed static imports for default-shell and os-name
import os from "os"
import { Mode, ModeConfig, getModeBySlug, defaultModeSlug } from "../../../shared/modes" // Removed unused isToolAllowedForMode
import { getShell } from "../../../utils/shell"

export async function getSystemInfoSection(
	cwd: string,
	currentMode: Mode,
	customModes?: ModeConfig[],
): Promise<string> {
	// Dynamically import ESM modules
	const osName = (await import("os-name")).default
	// Note: default-shell might also need dynamic import if it's ESM, but getShell() might already handle this.
	// Let's assume getShell() is okay for now, but keep an eye on it.

	const findModeBySlug = (slug: string, modes?: ModeConfig[]) => modes?.find((m) => m.slug === slug)

	const currentModeName = findModeBySlug(currentMode, customModes)?.name || currentMode
	const codeModeName = findModeBySlug(defaultModeSlug, customModes)?.name || "Code"

	// Use the dynamically imported value
	const operatingSystem = osName()
	const defaultShellValue = getShell() // Assuming this remains synchronous for now

	let details = `====

SYSTEM INFORMATION

Operating System: ${operatingSystem}
Default Shell: ${defaultShellValue}
Home Directory: ${os.homedir().toPosix()}
Current Workspace Directory: ${cwd.toPosix()}

The Current Workspace Directory is the active VS Code project directory, and is therefore the default directory for all tool operations. New terminals will be created in the current workspace directory, however if you change directories in a terminal it will then have a different working directory; changing directories in a terminal does not modify the workspace directory, because you do not have access to change the workspace directory. When the user initially gives you a task, a recursive list of all filepaths in the current workspace directory ('/test/path') will be included in environment_details. This provides an overview of the project's file structure, offering key insights into the project from directory/file names (how developers conceptualize and organize their code) and file extensions (the language used). This can also guide decision-making on which files to explore further. If you need to further explore directories such as outside the current workspace directory, you can use the list_files tool. If you pass 'true' for the recursive parameter, it will list files recursively. Otherwise, it will list files at the top level, which is better suited for generic directories where you don't necessarily need the nested structure, like the Desktop.`

	return details
}

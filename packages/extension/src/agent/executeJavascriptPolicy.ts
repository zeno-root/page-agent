export const EXECUTE_JAVASCRIPT_TIMEOUT_MS = 8_000
export const EXECUTE_JAVASCRIPT_MAX_RESULT_LENGTH = 4_000

interface ActionResult {
	success: boolean
	message: string
}

export async function runExecuteJavascriptWithPolicy(
	run: () => Promise<ActionResult>,
	options: { timeoutMs: number; maxLength: number }
): Promise<ActionResult> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<ActionResult>((resolve) => {
		timeoutId = setTimeout(() => {
			resolve({
				success: false,
				message: `❌ execute_javascript timeout after ${options.timeoutMs}ms`,
			})
		}, options.timeoutMs)
	})

	try {
		const result = await Promise.race([run(), timeout])
		return truncateActionResult(result, options.maxLength)
	} finally {
		if (timeoutId) clearTimeout(timeoutId)
	}
}

function truncateActionResult(result: ActionResult, maxLength: number): ActionResult {
	if (result.message.length <= maxLength) return result
	const omitted = result.message.length - maxLength
	return {
		...result,
		message: `${result.message.slice(0, maxLength)}... [truncated ${omitted} chars]`,
	}
}

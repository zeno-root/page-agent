export function shouldStopContentPolling(error: unknown): boolean {
	const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
	return (
		message.includes('Extension context invalidated') ||
		message.includes("Cannot read properties of undefined (reading 'local')") ||
		message.includes('Cannot read properties of undefined (reading "local")')
	)
}

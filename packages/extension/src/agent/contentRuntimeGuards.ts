function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : typeof error === 'string' ? error : ''
}

export function isExtensionContextInvalidatedError(error: unknown): boolean {
	return getErrorMessage(error).toLowerCase().includes('context invalidated')
}

export function getContentRuntimeErrorMessage(error: unknown): string {
	if (isExtensionContextInvalidatedError(error)) {
		return 'EXTENSION_CONTEXT_INVALIDATED: Extension context invalidated. Refresh the AIGC page to reconnect.'
	}
	return getErrorMessage(error) || 'Unknown extension error.'
}

export function shouldStopContentPolling(error: unknown): boolean {
	const message = getErrorMessage(error)
	return (
		isExtensionContextInvalidatedError(error) ||
		message.includes("Cannot read properties of undefined (reading 'local')") ||
		message.includes('Cannot read properties of undefined (reading "local")')
	)
}

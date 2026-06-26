import { describe, expect, it } from 'vitest'

import { getContentRuntimeErrorMessage, shouldStopContentPolling } from './contentRuntimeGuards'

describe('content runtime guards', () => {
	it('stops stale content-script polling after the extension context is invalidated', () => {
		expect(shouldStopContentPolling(new Error('Extension context invalidated.'))).toBe(true)
		expect(shouldStopContentPolling('Extension context invalidated.')).toBe(true)
		expect(
			shouldStopContentPolling(
				new Error('The message port closed because the extension context invalidated.')
			)
		).toBe(true)
	})

	it('stops polling when extension storage is no longer available', () => {
		expect(
			shouldStopContentPolling(
				new TypeError("Cannot read properties of undefined (reading 'local')")
			)
		).toBe(true)
		expect(shouldStopContentPolling('Cannot read properties of undefined (reading "local")')).toBe(
			true
		)
	})

	it('keeps polling for unrelated transient errors', () => {
		expect(shouldStopContentPolling(new Error('temporary storage failure'))).toBe(false)
		expect(shouldStopContentPolling(null)).toBe(false)
	})

	it('normalizes invalidated context errors for page bridge recovery', () => {
		expect(getContentRuntimeErrorMessage(new Error('Extension context invalidated.'))).toContain(
			'EXTENSION_CONTEXT_INVALIDATED'
		)
		expect(getContentRuntimeErrorMessage(new Error('temporary storage failure'))).toBe(
			'temporary storage failure'
		)
	})
})

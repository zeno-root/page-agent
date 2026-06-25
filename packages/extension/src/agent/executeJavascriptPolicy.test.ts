import { describe, expect, it } from 'vitest'

import { runExecuteJavascriptWithPolicy } from './executeJavascriptPolicy'

describe('runExecuteJavascriptWithPolicy', () => {
	it('truncates oversized JavaScript results', async () => {
		const result = await runExecuteJavascriptWithPolicy(
			() => Promise.resolve({ success: true, message: `result:${'x'.repeat(20)}` }),
			{ timeoutMs: 1_000, maxLength: 12 }
		)

		expect(result.success).toBe(true)
		expect(result.message.length).toBeLessThanOrEqual(80)
		expect(result.message).toContain('truncated')
	})

	it('returns a visible timeout result', async () => {
		const result = await runExecuteJavascriptWithPolicy(() => new Promise(() => {}), {
			timeoutMs: 1,
			maxLength: 4_000,
		})

		expect(result).toEqual({
			success: false,
			message: '❌ execute_javascript timeout after 1ms',
		})
	})
})

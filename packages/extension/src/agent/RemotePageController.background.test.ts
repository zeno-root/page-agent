import { afterEach, describe, expect, it, vi } from 'vitest'

import { handlePageControlMessage } from './RemotePageController.background'

function installChromeMock() {
	const scripting = {
		executeScript: vi.fn().mockResolvedValue([{ result: 'Example title' }]),
	}
	const tabs = {
		sendMessage: vi.fn().mockResolvedValue({ success: true, message: 'content response' }),
	}
	;(globalThis as any).chrome = { scripting, tabs }
	return { scripting, tabs }
}

function dispatch(action: string, payload: any = {}) {
	return new Promise<any>((resolve) => {
		const asyncResponse = handlePageControlMessage(
			{ type: 'PAGE_CONTROL', action, payload, targetTabId: 9 },
			{} as chrome.runtime.MessageSender,
			resolve
		)
		expect(asyncResponse).toBe(true)
	})
}

describe('handlePageControlMessage execute_javascript', () => {
	afterEach(() => {
		delete (globalThis as any).chrome
	})

	it('executes JavaScript through chrome.scripting instead of content script eval', async () => {
		const { scripting, tabs } = installChromeMock()

		await expect(
			dispatch('execute_javascript', {
				script: 'return document.title',
				timeoutMs: 8_000,
				maxLength: 4_000,
			})
		).resolves.toEqual({
			success: true,
			message: '✅ Executed JavaScript. Result: Example title',
		})

		expect(scripting.executeScript).toHaveBeenCalledWith(
			expect.objectContaining({
				target: { tabId: 9 },
				world: 'MAIN',
				args: ['return document.title'],
			})
		)
		expect(tabs.sendMessage).not.toHaveBeenCalled()
	})

	it('continues to proxy ordinary page control actions to the content script', async () => {
		const { tabs } = installChromeMock()

		await expect(dispatch('get_browser_state')).resolves.toEqual({
			success: true,
			message: 'content response',
		})

		expect(tabs.sendMessage).toHaveBeenCalledWith(9, {
			type: 'PAGE_CONTROL',
			action: 'get_browser_state',
			payload: {},
		})
	})
})

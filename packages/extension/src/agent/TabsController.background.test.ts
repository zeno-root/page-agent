import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleTabControlMessage } from './TabsController.background'

function installChromeMock(overrides: Partial<typeof chrome.tabs> = {}) {
	const tabs = {
		update: vi.fn().mockResolvedValue({ id: 7 }),
		reload: vi.fn().mockResolvedValue(undefined),
		goBack: vi.fn().mockResolvedValue(undefined),
		goForward: vi.fn().mockResolvedValue(undefined),
		captureVisibleTab: vi.fn().mockResolvedValue('data:image/png;base64,abc'),
		...overrides,
	}
	;(globalThis as any).chrome = {
		tabs,
		tabGroups: {},
		runtime: { onConnect: { addListener: vi.fn() } },
	}
	return tabs
}

function dispatch(action: string, payload: any = {}) {
	return new Promise<any>((resolve) => {
		const asyncResponse = handleTabControlMessage(
			{ type: 'TAB_CONTROL', action: action as any, payload },
			{} as chrome.runtime.MessageSender,
			resolve
		)
		expect(asyncResponse).toBe(true)
	})
}

describe('handleTabControlMessage tab operations', () => {
	afterEach(() => {
		delete (globalThis as any).chrome
	})

	it('activates, reloads, and navigates tabs through chrome.tabs', async () => {
		const tabs = installChromeMock()

		await expect(dispatch('activate_tab', { tabId: 7 })).resolves.toEqual({
			success: true,
			tabId: 7,
		})
		await expect(dispatch('reload_tab', { tabId: 7 })).resolves.toEqual({ success: true })
		await expect(dispatch('go_back', { tabId: 7 })).resolves.toEqual({ success: true })
		await expect(dispatch('go_forward', { tabId: 7 })).resolves.toEqual({ success: true })

		expect(tabs.update).toHaveBeenCalledWith(7, { active: true })
		expect(tabs.reload).toHaveBeenCalledWith(7)
		expect(tabs.goBack).toHaveBeenCalledWith(7)
		expect(tabs.goForward).toHaveBeenCalledWith(7)
	})

	it('captures the visible tab in the target window', async () => {
		const tabs = installChromeMock()

		await expect(dispatch('capture_visible_tab', { windowId: 3 })).resolves.toEqual({
			success: true,
			dataUrl: 'data:image/png;base64,abc',
		})

		expect(tabs.captureVisibleTab).toHaveBeenCalledWith(3, { format: 'png' })
	})
})

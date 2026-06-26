import { afterEach, describe, expect, it, vi } from 'vitest'

import { TabsController } from './TabsController'

function installChromeMock({ storedCurrentTabId = 8 }: { storedCurrentTabId?: number } = {}) {
	let windowTabs = [
		{
			id: 7,
			windowId: 1,
			url: 'https://active.test',
			title: 'Active',
			status: 'complete',
		},
		{
			id: 8,
			windowId: 1,
			url: 'https://target.test',
			title: 'Target',
			status: 'complete',
		},
	] as unknown as chrome.tabs.Tab[]
	const sendMessage = vi.fn(async (message: any) => {
		switch (message.action) {
			case 'get_active_tab':
				return { tab: { id: 7, windowId: 1, url: 'https://active.test', title: 'Active' } }
			case 'get_window_tabs':
				return {
					tabs: windowTabs,
				}
			case 'create_tab_group':
				return { success: true, groupId: 4 }
			case 'update_tab_group':
				return { success: true }
			default:
				return { success: true }
		}
	})
	const set = vi.fn(async () => undefined)
	const ports: {
		onMessage: { addListener: ReturnType<typeof vi.fn> }
		onDisconnect: { addListener: ReturnType<typeof vi.fn> }
		disconnect: ReturnType<typeof vi.fn>
		disconnectListener?: () => void
	}[] = []
	const connect = vi.fn(() => ({
		onMessage: { addListener: vi.fn() },
		onDisconnect: {
			addListener: vi.fn((listener: () => void) => {
				ports.at(-1)!.disconnectListener = listener
			}),
		},
		disconnect: vi.fn(),
	}))
	connect.mockImplementation(() => {
		const port = {
			onMessage: { addListener: vi.fn() },
			onDisconnect: {
				addListener: vi.fn((listener: () => void) => {
					port.disconnectListener = listener
				}),
			},
			disconnect: vi.fn(),
			disconnectListener: undefined as undefined | (() => void),
		}
		ports.push(port)
		return port
	})
	;(globalThis as any).chrome = {
		runtime: {
			sendMessage,
			connect,
		},
		storage: {
			local: {
				get: vi.fn(async () => ({ currentTabId: storedCurrentTabId })),
				set,
			},
		},
	}
	return {
		sendMessage,
		set,
		ports,
		setWindowTabs: (nextTabs: Partial<chrome.tabs.Tab>[]) => {
			windowTabs = nextTabs as chrome.tabs.Tab[]
		},
	}
}

describe('TabsController', () => {
	afterEach(() => {
		delete (globalThis as any).chrome
		vi.useRealTimers()
	})

	it('uses a stored visible target tab when initializing unrestricted tab tracking', async () => {
		const { set } = installChromeMock()
		const controller = new TabsController()

		await controller.init('inspect target tab', { experimentalIncludeAllTabs: true })

		expect(controller.currentTabId).toBe(8)
		expect(set).toHaveBeenLastCalledWith({ currentTabId: 8 })
	})

	it('backs off reconnects and refreshes tracked tabs after tab event port disconnect', async () => {
		vi.useFakeTimers()
		const { ports, set, setWindowTabs } = installChromeMock()
		const controller = new TabsController()

		await controller.init('inspect target tab', { experimentalIncludeAllTabs: true })
		expect(ports).toHaveLength(1)
		expect(controller.currentTabId).toBe(8)

		setWindowTabs([
			{
				id: 7,
				windowId: 1,
				url: 'https://active.test/updated',
				title: 'Active Updated',
				status: 'complete',
			},
		])

		ports[0].disconnectListener?.()
		expect(ports).toHaveLength(1)

		await vi.advanceTimersByTimeAsync(100)

		expect(ports).toHaveLength(2)
		expect(controller.currentTabId).toBe(7)
		expect(set).toHaveBeenLastCalledWith({ currentTabId: 7 })
	})

	it('does not write extension errors when tab event port retries are exhausted', async () => {
		vi.useFakeTimers()
		const { ports } = installChromeMock()
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
		const controller = new TabsController()

		await controller.init('inspect target tab', { experimentalIncludeAllTabs: true })

		for (let i = 0; i < 8; i += 1) {
			ports[i].disconnectListener?.()
			await vi.advanceTimersByTimeAsync(2_000)
		}

		expect(errorSpy).not.toHaveBeenCalledWith(
			'[TabsController]',
			'tab events port failed after 7 retries, giving up'
		)
	})
})

import { afterEach, describe, expect, it, vi } from 'vitest'

import { TabsController } from './TabsController'

function installChromeMock({ storedCurrentTabId = 8 }: { storedCurrentTabId?: number } = {}) {
	const sendMessage = vi.fn(async (message: any) => {
		switch (message.action) {
			case 'get_active_tab':
				return { tab: { id: 7, windowId: 1, url: 'https://active.test', title: 'Active' } }
			case 'get_window_tabs':
				return {
					tabs: [
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
					],
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
	const connect = vi.fn(() => ({
		onMessage: { addListener: vi.fn() },
		onDisconnect: { addListener: vi.fn() },
		disconnect: vi.fn(),
	}))
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
	return { sendMessage, set }
}

describe('TabsController', () => {
	afterEach(() => {
		delete (globalThis as any).chrome
	})

	it('uses a stored visible target tab when initializing unrestricted tab tracking', async () => {
		const { set } = installChromeMock()
		const controller = new TabsController()

		await controller.init('inspect target tab', { experimentalIncludeAllTabs: true })

		expect(controller.currentTabId).toBe(8)
		expect(set).toHaveBeenLastCalledWith({ currentTabId: 8 })
	})
})

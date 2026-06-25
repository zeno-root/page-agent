import { describe, expect, it, vi } from 'vitest'

import { createTabTools } from './tabTools'

describe('createTabTools', () => {
	it('exposes first-batch unrestricted browser tab tools', () => {
		const tools = createTabTools({} as any)

		expect(Object.keys(tools).sort()).toEqual([
			'activate_tab',
			'capture_visible_tab',
			'close_tab',
			'get_current_tab',
			'go_back',
			'go_forward',
			'list_tabs',
			'open_new_tab',
			'reload_tab',
			'switch_to_tab',
			'wait_until_tab_loaded',
		])
	})

	it('delegates new tab tools to TabsController methods', async () => {
		const tabsController = {
			listTabs: vi.fn().mockResolvedValue([{ id: 1, title: 'Home', url: 'https://example.test' }]),
			getCurrentTab: vi.fn().mockResolvedValue({ id: 1, title: 'Home' }),
			activateTab: vi.fn().mockResolvedValue('activated'),
			reloadTab: vi.fn().mockResolvedValue('reloaded'),
			goBack: vi.fn().mockResolvedValue('back'),
			goForward: vi.fn().mockResolvedValue('forward'),
			waitUntilTabLoaded: vi.fn().mockResolvedValue('loaded'),
			captureVisibleTab: vi.fn().mockResolvedValue('captured'),
		}
		const tools = createTabTools(tabsController as any)

		await expect(tools.list_tabs.execute({})).resolves.toContain('https://example.test')
		await expect(tools.get_current_tab.execute({})).resolves.toContain('Home')
		await expect(tools.activate_tab.execute({ tab_id: 1 })).resolves.toBe('activated')
		await expect(tools.reload_tab.execute({ tab_id: 1 })).resolves.toBe('reloaded')
		await expect(tools.go_back.execute({ tab_id: 1 })).resolves.toBe('back')
		await expect(tools.go_forward.execute({ tab_id: 1 })).resolves.toBe('forward')
		await expect(
			tools.wait_until_tab_loaded.execute({ tab_id: 1, timeout_ms: 8000 })
		).resolves.toBe('loaded')
		await expect(tools.capture_visible_tab.execute({})).resolves.toBe('captured')

		expect(tabsController.activateTab).toHaveBeenCalledWith(1)
		expect(tabsController.reloadTab).toHaveBeenCalledWith(1)
		expect(tabsController.goBack).toHaveBeenCalledWith(1)
		expect(tabsController.goForward).toHaveBeenCalledWith(1)
		expect(tabsController.waitUntilTabLoaded).toHaveBeenCalledWith(1, 8000)
		expect(tabsController.captureVisibleTab).toHaveBeenCalledWith()
	})
})

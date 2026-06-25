/**
 * Tab control tools for browser extension
 *
 * These tools allow the agent to manage multiple browser tabs:
 * - list_tabs: List tracked browser tabs
 * - get_current_tab: Return the current target tab
 * - open_new_tab: Open a new tab and set it as current
 * - switch_to_tab: Switch to an existing tab
 * - close_tab: Close a tab (optionally switch to another)
 * - activate/reload/back/forward/wait/capture: Operate real browser tabs
 */
import * as z from 'zod/v4'

import type { TabsController } from './TabsController'

/** Tool definition compatible with PageAgentCore customTools */
interface TabTool {
	description: string
	inputSchema: z.ZodType
	execute: (input: unknown) => Promise<string>
}

/**
 * Create tab control tools bound to a TabsManager instance.
 * These tools are injected into PageAgentCore via customTools config.
 */
export function createTabTools(tabsController: TabsController): Record<string, TabTool> {
	return {
		list_tabs: {
			description:
				'List all tabs currently tracked by Page Agent in this browser window, including tab IDs, titles, URLs, load status, and current target marker.',
			inputSchema: z.object({}),
			execute: async () => {
				try {
					const tabs = await tabsController.listTabs()
					return JSON.stringify(tabs, null, 2)
				} catch (error) {
					return `❌ Failed: ${error instanceof Error ? error.message : String(error)}`
				}
			},
		},

		get_current_tab: {
			description:
				'Return the current Page Agent target tab. All page operations are sent to this tab.',
			inputSchema: z.object({}),
			execute: async () => {
				try {
					const tab = await tabsController.getCurrentTab()
					return tab ? JSON.stringify(tab, null, 2) : 'No current tab selected.'
				} catch (error) {
					return `❌ Failed: ${error instanceof Error ? error.message : String(error)}`
				}
			},
		},

		open_new_tab: {
			description:
				'Open a new browser tab with the specified URL. The new tab becomes the current tab for all subsequent page operations.',
			inputSchema: z.object({
				url: z.string().describe('The URL to open in the new tab'),
			}),
			execute: async (input: unknown) => {
				const { url } = input as { url: string }
				try {
					return await tabsController.openNewTab(url)
				} catch (error) {
					return `❌ Failed: ${error instanceof Error ? error.message : String(error)}`
				}
			},
		},

		switch_to_tab: {
			description:
				'Switch to an existing tab by its ID. After switching, all page operations will target the new current tab. You can only switch to tabs in the tab list shown in browser state.',
			inputSchema: z.object({
				tab_id: z.number().int().describe('The tab ID to switch to'),
			}),
			execute: async (input: unknown) => {
				const { tab_id } = input as { tab_id: number }
				try {
					return await tabsController.switchToTab(tab_id)
				} catch (error) {
					return `❌ Failed: ${error instanceof Error ? error.message : String(error)}`
				}
			},
		},

		close_tab: {
			description:
				'Close a tab by its ID. Cannot close the initial tab. Optionally specify which tab to switch to after closing.',
			inputSchema: z.object({
				tab_id: z.number().int().describe('The tab ID to close'),
			}),
			execute: async (input: unknown) => {
				const { tab_id } = input as { tab_id: number }
				try {
					return await tabsController.closeTab(tab_id)
				} catch (error) {
					return `❌ Failed: ${error instanceof Error ? error.message : String(error)}`
				}
			},
		},

		activate_tab: {
			description:
				'Activate a tracked tab in the real browser window and set it as the current Page Agent target tab.',
			inputSchema: z.object({
				tab_id: z.number().int().describe('The tab ID to activate'),
			}),
			execute: async (input: unknown) => {
				const { tab_id } = input as { tab_id: number }
				try {
					return await tabsController.activateTab(tab_id)
				} catch (error) {
					return `❌ Failed: ${error instanceof Error ? error.message : String(error)}`
				}
			},
		},

		reload_tab: {
			description:
				'Reload the current target tab or a specified tracked tab. Use wait_until_tab_loaded after reload if the next step depends on the page being complete.',
			inputSchema: z.object({
				tab_id: z.number().int().optional().describe('Optional tab ID. Defaults to current tab.'),
			}),
			execute: async (input: unknown) => {
				const { tab_id } = (input || {}) as { tab_id?: number }
				try {
					return await tabsController.reloadTab(tab_id)
				} catch (error) {
					return `❌ Failed: ${error instanceof Error ? error.message : String(error)}`
				}
			},
		},

		go_back: {
			description: 'Navigate the current target tab or specified tracked tab backward.',
			inputSchema: z.object({
				tab_id: z.number().int().optional().describe('Optional tab ID. Defaults to current tab.'),
			}),
			execute: async (input: unknown) => {
				const { tab_id } = (input || {}) as { tab_id?: number }
				try {
					return await tabsController.goBack(tab_id)
				} catch (error) {
					return `❌ Failed: ${error instanceof Error ? error.message : String(error)}`
				}
			},
		},

		go_forward: {
			description: 'Navigate the current target tab or specified tracked tab forward.',
			inputSchema: z.object({
				tab_id: z.number().int().optional().describe('Optional tab ID. Defaults to current tab.'),
			}),
			execute: async (input: unknown) => {
				const { tab_id } = (input || {}) as { tab_id?: number }
				try {
					return await tabsController.goForward(tab_id)
				} catch (error) {
					return `❌ Failed: ${error instanceof Error ? error.message : String(error)}`
				}
			},
		},

		wait_until_tab_loaded: {
			description:
				'Wait until the current target tab or specified tracked tab reports status complete.',
			inputSchema: z.object({
				tab_id: z.number().int().optional().describe('Optional tab ID. Defaults to current tab.'),
				timeout_ms: z
					.number()
					.int()
					.positive()
					.optional()
					.describe('Optional timeout in milliseconds. Defaults to 4000.'),
			}),
			execute: async (input: unknown) => {
				const { tab_id, timeout_ms } = (input || {}) as { tab_id?: number; timeout_ms?: number }
				try {
					return await tabsController.waitUntilTabLoaded(tab_id, timeout_ms)
				} catch (error) {
					return `❌ Failed: ${error instanceof Error ? error.message : String(error)}`
				}
			},
		},

		capture_visible_tab: {
			description:
				'Capture the visible area of the active tab in the current browser window and return a bounded data URL summary.',
			inputSchema: z.object({}),
			execute: async () => {
				try {
					return await tabsController.captureVisibleTab()
				} catch (error) {
					return `❌ Failed: ${error instanceof Error ? error.message : String(error)}`
				}
			},
		},
	}
}

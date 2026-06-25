// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { initPageController } from './RemotePageController.content'

const pageControllerState = vi.hoisted(() => ({
	instances: [] as { disposed: boolean }[],
	throwOnConstruct: false,
}))

vi.mock('@page-agent/page-controller', () => {
	class PageController {
		disposed = false

		constructor() {
			if (pageControllerState.throwOnConstruct) {
				throw new Error('Extension context invalidated.')
			}
			pageControllerState.instances.push(this)
		}

		initMask() {}

		async showMask() {}

		hideMask() {}

		cleanUpHighlights() {}

		dispose() {
			this.disposed = true
		}

		async getBrowserState() {
			return { url: 'https://example.test/', title: 'Example', header: '', content: '', footer: '' }
		}
	}

	return { PageController }
})

function installChromeMock() {
	let listener: ((message: any, sender: any, sendResponse: any) => true | undefined) | null = null
	const sendMessage = vi.fn(async () => ({ tabId: 7 }))
	const get = vi.fn(async (key: string) => {
		const values: Record<string, unknown> = {
			agentHeartbeat: Date.now(),
			currentTabId: 7,
			isAgentRunning: true,
		}
		return { [key]: values[key] }
	})
	const addListener = vi.fn((callback) => {
		listener = callback
	})

	;(globalThis as any).chrome = {
		runtime: {
			id: 'extension-id',
			onMessage: { addListener },
			sendMessage,
		},
		storage: { local: { get } },
	}

	return {
		addListener,
		get listener() {
			return listener
		},
		sendMessage,
	}
}

describe('RemotePageController content script runtime guards', () => {
	afterEach(() => {
		vi.restoreAllMocks()
		vi.useRealTimers()
		delete (globalThis as any).chrome
		pageControllerState.instances = []
		pageControllerState.throwOnConstruct = false
	})

	it('skips startup when extension runtime APIs are unavailable', () => {
		vi.useFakeTimers()
		const setIntervalSpy = vi.spyOn(window, 'setInterval')
		;(globalThis as any).chrome = {}

		expect(() => initPageController()).not.toThrow()

		expect(setIntervalSpy).not.toHaveBeenCalled()
	})

	it('returns a controlled error when PageController creation sees an invalidated context', () => {
		const chromeMock = installChromeMock()
		initPageController()
		pageControllerState.throwOnConstruct = true

		const sendResponse = vi.fn()

		expect(() =>
			chromeMock.listener?.({ type: 'PAGE_CONTROL', action: 'get_browser_state' }, {}, sendResponse)
		).not.toThrow()
		expect(sendResponse).toHaveBeenCalledWith({
			error: 'Extension context invalidated.',
			success: false,
		})
	})
})

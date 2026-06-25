/**
 * content script for RemotePageController
 */
import { PageController } from '@page-agent/page-controller'

import { shouldStopContentPolling } from './contentRuntimeGuards'
import {
	EXECUTE_JAVASCRIPT_MAX_RESULT_LENGTH,
	EXECUTE_JAVASCRIPT_TIMEOUT_MS,
	runExecuteJavascriptWithPolicy,
} from './executeJavascriptPolicy'

export function initPageController() {
	let pageController: PageController | null = null
	let intervalID: number | null = null
	let stopped = false

	function stopContentRuntime() {
		stopped = true
		if (intervalID !== null) {
			window.clearInterval(intervalID)
			intervalID = null
		}
		if (pageController) {
			pageController.dispose()
			pageController = null
		}
	}

	const runtime = getChromeRuntime()
	const storageLocal = getChromeStorageLocal()
	if (!runtime || !storageLocal) return

	let myTabIdPromise: Promise<number | null>
	try {
		myTabIdPromise = runtime
			.sendMessage({ type: 'PAGE_CONTROL', action: 'get_my_tab_id' })
			.then((response) => {
				return (response as { tabId: number | null }).tabId
			})
			.catch((error) => {
				if (shouldStopContentPolling(error)) {
					stopContentRuntime()
				} else {
					console.error('[RemotePageController.ContentScript]: Failed to get my tab id', error)
				}
				return null
			})
	} catch (error) {
		if (!shouldStopContentPolling(error)) {
			console.error('[RemotePageController.ContentScript]: Failed to get my tab id', error)
		}
		return
	}

	function getPC(): PageController {
		if (!pageController) {
			pageController = new PageController({
				enableMask: false,
				viewportExpansion: 400,
			})
		}
		return pageController
	}

	intervalID = window.setInterval(async () => {
		if (stopped) return

		try {
			const storageLocal = getChromeStorageLocal()
			if (!storageLocal) {
				stopContentRuntime()
				return
			}

			const agentHeartbeat = (await storageLocal.get('agentHeartbeat')).agentHeartbeat
			const now = Date.now()
			const agentInTouch = typeof agentHeartbeat === 'number' && now - agentHeartbeat < 2_000

			const isAgentRunning = (await storageLocal.get('isAgentRunning')).isAgentRunning
			const currentTabId = (await storageLocal.get('currentTabId')).currentTabId

			const shouldShowMask =
				isAgentRunning && agentInTouch && currentTabId === (await myTabIdPromise)

			if (shouldShowMask) {
				const pc = getPC()
				pc.initMask()
				await pc.showMask()
			} else {
				// await getPC().hideMask()
				if (pageController) {
					pageController.hideMask()
					pageController.cleanUpHighlights()
				}
			}

			if (!isAgentRunning && agentInTouch) {
				if (pageController) {
					pageController.dispose()
					pageController = null
				}
			}
		} catch (error) {
			if (!shouldStopContentPolling(error)) {
				console.warn('[RemotePageController.ContentScript]: mask polling failed', error)
				return
			}

			stopContentRuntime()
		}
	}, 500)

	runtime.onMessage.addListener((message, sender, sendResponse): true | undefined => {
		if (!message || typeof message !== 'object' || message.type !== 'PAGE_CONTROL') {
			// sendResponse({
			// 	success: false,
			// 	error: `[RemotePageController.ContentScript]: Invalid message type: ${message.type}`,
			// })
			return
		}

		try {
			if (stopped) {
				sendContentError(sendResponse, 'Indofun AIGC assistant context is no longer active.')
				return true
			}

			const { action, payload } = message
			const methodName = getMethodName(action)
			const pc = getPC() as any

			switch (action) {
				case 'get_last_update_time':
				case 'get_browser_state':
				case 'update_tree':
				case 'clean_up_highlights':
				case 'click_element':
				case 'input_text':
				case 'hover_element':
				case 'press_key':
				case 'select_option':
				case 'scroll':
				case 'scroll_horizontally':
				case 'extract_page_text':
				case 'extract_structured_table':
				case 'upload_file':
					pc[methodName](...(payload || []))
						.then((result: any) => sendResponse(result))
						.catch((error: unknown) => handleContentError(error, sendResponse, stopContentRuntime))
					break
				case 'execute_javascript':
					runExecuteJavascriptWithPolicy(
						() => pc.executeJavascript(String(payload?.script || '')),
						{
							timeoutMs: Number(payload?.timeoutMs) || EXECUTE_JAVASCRIPT_TIMEOUT_MS,
							maxLength: Number(payload?.maxLength) || EXECUTE_JAVASCRIPT_MAX_RESULT_LENGTH,
						}
					)
						.then((result: any) => sendResponse(result))
						.catch((error: unknown) => handleContentError(error, sendResponse, stopContentRuntime))
					break

				default:
					sendResponse({
						success: false,
						error: `Unknown PAGE_CONTROL action: ${action}`,
					})
			}
		} catch (error) {
			handleContentError(error, sendResponse, stopContentRuntime)
		}

		return true
	})
}

function getChromeRuntime(): typeof chrome.runtime | null {
	if (typeof chrome === 'undefined') return null
	const runtime = chrome.runtime
	if (
		!runtime?.id ||
		typeof runtime.sendMessage !== 'function' ||
		typeof runtime.onMessage?.addListener !== 'function'
	) {
		return null
	}
	return runtime
}

function getChromeStorageLocal(): chrome.storage.StorageArea | null {
	if (typeof chrome === 'undefined') return null
	const storageLocal = chrome.storage?.local
	if (!storageLocal || typeof storageLocal.get !== 'function') return null
	return storageLocal
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message
	if (typeof error === 'string') return error
	return 'Unknown content script error'
}

function handleContentError(
	error: unknown,
	sendResponse: (response?: any) => void,
	stopContentRuntime: () => void
) {
	if (shouldStopContentPolling(error)) {
		stopContentRuntime()
	}
	sendContentError(sendResponse, getErrorMessage(error))
}

function sendContentError(sendResponse: (response?: any) => void, error: string) {
	try {
		sendResponse({ success: false, error })
	} catch (sendError) {
		if (!shouldStopContentPolling(sendError)) {
			console.warn('[RemotePageController.ContentScript]: failed to send response', sendError)
		}
	}
}

function getMethodName(action: string): string {
	switch (action) {
		case 'get_last_update_time':
			return 'getLastUpdateTime' as const
		case 'get_browser_state':
			return 'getBrowserState' as const
		case 'update_tree':
			return 'updateTree' as const
		case 'clean_up_highlights':
			return 'cleanUpHighlights' as const

		// DOM actions

		case 'click_element':
			return 'clickElement' as const
		case 'input_text':
			return 'inputText' as const
		case 'hover_element':
			return 'hoverElement' as const
		case 'press_key':
			return 'pressKey' as const
		case 'select_option':
			return 'selectOption' as const
		case 'scroll':
			return 'scroll' as const
		case 'scroll_horizontally':
			return 'scrollHorizontally' as const
		case 'extract_page_text':
			return 'extractPageText' as const
		case 'extract_structured_table':
			return 'extractStructuredTable' as const
		case 'upload_file':
			return 'uploadFile' as const
		case 'execute_javascript':
			return 'executeJavascript' as const

		default:
			return action
	}
}

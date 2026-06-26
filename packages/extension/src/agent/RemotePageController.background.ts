/**
 * background logics for RemotePageController
 * - redirect messages from RemotePageController(Agent, extension pages) to ContentScript
 */
import {
	EXECUTE_JAVASCRIPT_MAX_RESULT_LENGTH,
	EXECUTE_JAVASCRIPT_TIMEOUT_MS,
	runExecuteJavascriptWithPolicy,
} from './executeJavascriptPolicy'

export function handlePageControlMessage(
	message: { type: 'PAGE_CONTROL'; action: string; payload: any; targetTabId: number },
	sender: chrome.runtime.MessageSender,
	sendResponse: (response: unknown) => void
): true | undefined {
	const PREFIX = '[RemotePageController.background]'

	const debug = console.debug.bind(console, `\x1b[90m${PREFIX}\x1b[0m`)

	const { action, payload, targetTabId } = message

	if (action === 'get_my_tab_id') {
		debug('get_my_tab_id', sender.tab?.id)
		sendResponse({ tabId: sender.tab?.id || null })
		return
	}

	if (action === 'execute_javascript') {
		runExecuteJavascriptWithPolicy(
			() => executeJavascriptInTab(targetTabId, String(payload?.script || '')),
			{
				timeoutMs: Number(payload?.timeoutMs) || EXECUTE_JAVASCRIPT_TIMEOUT_MS,
				maxLength: Number(payload?.maxLength) || EXECUTE_JAVASCRIPT_MAX_RESULT_LENGTH,
			}
		)
			.then((result) => sendResponse(result))
			.catch((error) =>
				sendResponse({
					success: false,
					message: `❌ Error executing JavaScript: ${
						error instanceof Error ? error.message : String(error)
					}`,
				})
			)
		return true
	}

	// proxy to content script
	chrome.tabs
		.sendMessage(targetTabId, {
			type: 'PAGE_CONTROL',
			action,
			payload,
		})
		.then((result) => {
			sendResponse(result)
		})
		.catch((error) => {
			if (isMissingContentScriptReceiverError(error)) {
				sendResponse({
					success: false,
					error: 'NO_CONTENT_SCRIPT_RECEIVER: Target tab is not ready for Page Agent controls.',
				})
				return
			}
			console.error(PREFIX, error)
			sendResponse({
				success: false,
				error: error instanceof Error ? error.message : String(error),
			})
		})

	return true // async response
}

function isMissingContentScriptReceiverError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
	return message.includes('Could not establish connection') && message.includes('Receiving end')
}

async function executeJavascriptInTab(
	tabId: number,
	script: string
): Promise<{ success: boolean; message: string }> {
	const [result] = await chrome.scripting.executeScript({
		target: { tabId },
		world: 'MAIN',
		func: async (source: string) => {
			const asyncFunction = (0, eval)(`(async () => { ${source} })`)
			return asyncFunction()
		},
		args: [script],
	})

	return {
		success: true,
		message: `✅ Executed JavaScript. Result: ${formatJavascriptResult(result?.result)}`,
	}
}

function formatJavascriptResult(result: unknown): string {
	if (typeof result === 'undefined') return 'undefined'
	if (result === null) return 'null'
	if (typeof result === 'string') return result
	if (typeof result === 'number' || typeof result === 'boolean' || typeof result === 'bigint') {
		return result.toString()
	}
	try {
		return JSON.stringify(result) || '[unserializable result]'
	} catch {
		return '[unserializable result]'
	}
}

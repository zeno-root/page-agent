import { initPageController } from '@/agent/RemotePageController.content'
import {
	getContentRuntimeErrorMessage,
	shouldStopContentPolling,
} from '@/agent/contentRuntimeGuards'
import { shouldExposePageBridge } from '@/agent/pageBridgeAuth'

// import { DEMO_CONFIG } from '@/agent/constants'

const DEBUG_PREFIX = '[Content]'

export default defineContentScript({
	matches: ['<all_urls>'],
	runAt: 'document_end',

	main() {
		console.debug(`${DEBUG_PREFIX} Loaded on ${window.location.href}`)
		initPageController()
		void initializePageBridge()
	},
})

async function initializePageBridge() {
	try {
		// if auth token matches, expose agent to page
		const storageLocal = getChromeStorageLocal()
		if (!storageLocal) return
		const result = await storageLocal.get('PageAgentExtUserAuthToken')

		const extToken =
			typeof result.PageAgentExtUserAuthToken === 'string' ? result.PageAgentExtUserAuthToken : null
		const pageToken = localStorage.getItem('PageAgentExtUserAuthToken')
		if (
			!shouldExposePageBridge({
				href: window.location.href,
				extensionToken: extToken,
				pageToken,
			})
		) {
			return
		}

		console.log('[PageAgentExt]: Page bridge authorized. Exposing agent to page.')

		// add isolated world script
		await exposeAgentToPage()

		// add main-world script
		await injectScript('/main-world.js')
	} catch (error) {
		if (!shouldStopContentPolling(error)) {
			console.warn(`${DEBUG_PREFIX} Failed to initialize page bridge`, error)
		}
	}
}

function getChromeStorageLocal(): chrome.storage.StorageArea | null {
	if (typeof chrome === 'undefined') return null
	const storageLocal = chrome.storage?.local
	if (!storageLocal || typeof storageLocal.get !== 'function') return null
	return storageLocal
}

async function exposeAgentToPage() {
	const { MultiPageAgent } = await import('@/agent/MultiPageAgent')
	console.log('[PageAgentExt]: MultiPageAgent loaded')

	/**
	 * singleton MultiPageAgent to handle requests from the page
	 */
	let multiPageAgent: InstanceType<typeof MultiPageAgent> | null = null

	window.addEventListener('message', async (e) => {
		if (e.source !== window) return

		const data = e.data
		if (typeof data !== 'object' || data === null) return
		if (data.channel !== 'PAGE_AGENT_EXT_REQUEST') return

		const { action, payload, id } = data

		switch (action) {
			case 'execute': {
				// singleton check
				if (multiPageAgent && multiPageAgent.status === 'running') {
					window.postMessage(
						{
							channel: 'PAGE_AGENT_EXT_RESPONSE',
							id,
							action: 'execute_result',
							error: 'Agent is already running a task. Please wait until it finishes.',
						},
						'*'
					)
					return
				}

				try {
					const { task, config } = payload
					const { systemInstruction, ...agentConfig } = config

					// Dispose old instance before creating new one
					multiPageAgent?.dispose()

					multiPageAgent = new MultiPageAgent({
						...agentConfig,
						instructions: systemInstruction ? { system: systemInstruction } : undefined,
					})

					// events

					multiPageAgent.addEventListener('statuschange', (event) => {
						if (!multiPageAgent) return
						window.postMessage(
							{
								channel: 'PAGE_AGENT_EXT_RESPONSE',
								id,
								action: 'status_change_event',
								payload: multiPageAgent.status,
							},
							'*'
						)
					})

					multiPageAgent.addEventListener('activity', (event) => {
						if (!multiPageAgent) return
						window.postMessage(
							{
								channel: 'PAGE_AGENT_EXT_RESPONSE',
								id,
								action: 'activity_event',
								payload: (event as CustomEvent).detail,
							},
							'*'
						)
					})

					multiPageAgent.addEventListener('historychange', (event) => {
						if (!multiPageAgent) return
						window.postMessage(
							{
								channel: 'PAGE_AGENT_EXT_RESPONSE',
								id,
								action: 'history_change_event',
								payload: multiPageAgent.history,
							},
							'*'
						)
					})

					// result

					const result = await multiPageAgent.execute(task)

					window.postMessage(
						{
							channel: 'PAGE_AGENT_EXT_RESPONSE',
							id,
							action: 'execute_result',
							payload: result,
						},
						'*'
					)
				} catch (error) {
					window.postMessage(
						{
							channel: 'PAGE_AGENT_EXT_RESPONSE',
							id,
							action: 'execute_result',
							error: getContentRuntimeErrorMessage(error),
						},
						'*'
					)
				}

				break
			}

			case 'stop': {
				multiPageAgent?.stop()
				break
			}

			default:
				console.warn(`${DEBUG_PREFIX} Unknown action from page:`, action)
				break
		}
	})
}

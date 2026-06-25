import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const requireJavascript = process.argv.includes('--require-javascript')
const extensionPath =
	process.env.PAGE_AGENT_EXTENSION_PATH ||
	path.resolve(repoRoot, 'packages/extension/.output/chrome-mv3')

const require = createRequire(process.env.PLAYWRIGHT_REQUIRE_BASE || import.meta.url)
let chromium
try {
	;({ chromium } = require('playwright'))
} catch (error) {
	console.error(
		[
			'Cannot resolve the "playwright" package.',
			'Install it in a temp prefix and pass PLAYWRIGHT_REQUIRE_BASE, for example:',
			'  npm install --prefix /private/tmp/page-agent-pw playwright@1.61.1',
			'  PLAYWRIGHT_REQUIRE_BASE=/private/tmp/page-agent-pw/package.json npm run smoke:ext',
		].join('\n')
	)
	throw error
}

const html = `<!doctype html>
<html>
	<head><title>Page Agent Smoke</title></head>
	<body>
		<h1>Page Agent Smoke</h1>
		<button id="click-target">Click target</button>
		<input id="name-input" aria-label="Name input" />
		<input id="file-input" aria-label="Upload input" type="file" />
		<div id="click-result">not clicked</div>
		<div id="input-result">empty</div>
		<div id="file-result">no file</div>
		<table>
			<thead><tr><th>Name</th><th>Score</th></tr></thead>
			<tbody><tr><td>Alice</td><td>98</td></tr></tbody>
		</table>
		<script>
			document.getElementById('click-target').addEventListener('click', () => {
				document.getElementById('click-result').textContent = 'clicked'
			})
			document.getElementById('name-input').addEventListener('input', (event) => {
				document.getElementById('input-result').textContent = event.target.value
			})
			document.getElementById('file-input').addEventListener('change', (event) => {
				document.getElementById('file-result').textContent = event.target.files?.[0]?.name || 'no file'
			})
		</script>
	</body>
</html>`

const server = http.createServer((_request, response) => {
	response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
	response.end(html)
})

function listen(server) {
	return new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () => resolve(server.address().port))
	})
}

async function waitForExtensionWorker(context) {
	let [worker] = context.serviceWorkers()
	if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 10_000 })
	return worker
}

function extensionIdFromWorker(worker) {
	const match = worker.url().match(/^chrome-extension:\/\/([^/]+)\//)
	if (!match) throw new Error(`Cannot parse extension id from ${worker.url()}`)
	return match[1]
}

function extensionIdFromManifest(extensionPath) {
	const manifest = JSON.parse(readFileSync(path.join(extensionPath, 'manifest.json'), 'utf8'))
	if (!manifest.key) throw new Error('Extension manifest does not contain a deterministic key')
	const hash = crypto.createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest()
	return [...hash.subarray(0, 16)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')
		.replace(/[0-9a-f]/g, (char) => String.fromCharCode('a'.charCodeAt(0) + parseInt(char, 16)))
}

function findIndex(content, label) {
	const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const match = content.match(new RegExp(`\\[(\\d+)\\][^\\n]*${escaped}`, 'i'))
	if (!match) throw new Error(`Cannot find indexed element for ${label}. Content: ${content}`)
	return Number(match[1])
}

async function sendPageControl(extensionPage, targetTabId, action, payload) {
	return extensionPage.evaluate(
		({ targetTabId, action, payload }) =>
			chrome.runtime.sendMessage({
				type: 'PAGE_CONTROL',
				targetTabId,
				action,
				payload,
			}),
		{ targetTabId, action, payload }
	)
}

async function main() {
	const port = await listen(server)
	const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'page-agent-ext-smoke-'))
	let context

	try {
		const channel = process.env.PLAYWRIGHT_CHANNEL || undefined
		context = await chromium.launchPersistentContext(userDataDir, {
			...(channel ? { channel } : {}),
			headless: false,
			args: [
				`--disable-extensions-except=${extensionPath}`,
				`--load-extension=${extensionPath}`,
				'--no-first-run',
				'--no-default-browser-check',
				'--hide-crash-restore-bubble',
			],
		})

		const worker = await waitForExtensionWorker(context).catch(() => null)
		const extensionId = worker
			? extensionIdFromWorker(worker)
			: extensionIdFromManifest(extensionPath)
		const extensionPage = await context.newPage()
		await extensionPage.goto(`chrome-extension://${extensionId}/sidepanel.html`)
		await waitForExtensionWorker(context).catch(() => null)

		const page = await context.newPage()
		await page.goto(`http://127.0.0.1:${port}/`)
		await page.waitForLoadState('domcontentloaded')
		const targetTabId = await extensionPage.evaluate(
			(url) =>
				chrome.tabs.query({}).then((tabs) => {
					const tab = tabs.find((candidate) => candidate.url === url)
					if (!tab?.id) throw new Error(`Cannot find target tab for ${url}`)
					return tab.id
				}),
			page.url()
		)

		const browserState = await sendPageControl(extensionPage, targetTabId, 'get_browser_state')
		if (!browserState?.content)
			throw new Error(`Missing browser state: ${JSON.stringify(browserState)}`)

		const clickIndex = findIndex(browserState.content, 'Click target')
		const inputIndex = findIndex(browserState.content, 'Name input')
		const fileIndex = findIndex(browserState.content, 'Upload input')

		const clickResult = await sendPageControl(extensionPage, targetTabId, 'click_element', [
			clickIndex,
		])
		const inputResult = await sendPageControl(extensionPage, targetTabId, 'input_text', [
			inputIndex,
			'Codex smoke',
		])
		const fileResult = await sendPageControl(extensionPage, targetTabId, 'upload_file', [
			fileIndex,
			{
				name: 'smoke.txt',
				type: 'text/plain',
				contentBase64: 'U21va2U=',
				size: 5,
			},
		])
		const textResult = await sendPageControl(extensionPage, targetTabId, 'extract_page_text', [
			{ maxLength: 1000 },
		])
		const tableResult = await sendPageControl(
			extensionPage,
			targetTabId,
			'extract_structured_table',
			[{ maxLength: 1000 }]
		)
		const jsResult = await sendPageControl(extensionPage, targetTabId, 'execute_javascript', {
			script: 'return document.title',
			timeoutMs: 8000,
			maxLength: 4000,
		})

		try {
			await page.waitForFunction(
				() => document.getElementById('click-result').textContent === 'clicked'
			)
			await page.waitForFunction(
				() => document.getElementById('input-result').textContent === 'Codex smoke'
			)
			await page.waitForFunction(
				() => document.getElementById('file-result').textContent === 'smoke.txt'
			)
		} catch (error) {
			const domState = await page.evaluate(() => ({
				clickResult: document.getElementById('click-result')?.textContent,
				inputResult: document.getElementById('input-result')?.textContent,
				inputValue: document.getElementById('name-input')?.value,
				fileResult: document.getElementById('file-result')?.textContent,
				fileName: document.getElementById('file-input')?.files?.[0]?.name,
			}))
			throw new Error(
				`DOM assertion failed: ${JSON.stringify({
					domState,
					clickResult,
					inputResult,
					fileResult,
					textResult,
					tableResult,
					jsResult,
					error: error instanceof Error ? error.message : String(error),
				})}`
			)
		}

		const tabsResult = await extensionPage.evaluate(() =>
			chrome.runtime.sendMessage({
				type: 'TAB_CONTROL',
				action: 'get_window_tabs',
				payload: { windowId: chrome.windows.WINDOW_ID_CURRENT },
			})
		)
		if (!tabsResult?.success || !Array.isArray(tabsResult.tabs)) {
			throw new Error(`Tab list failed: ${JSON.stringify(tabsResult)}`)
		}

		const restrictedPage = await context.newPage()
		await restrictedPage.goto('chrome://settings/')
		const restrictedTabId = await extensionPage.evaluate(() =>
			chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]?.id)
		)
		const restrictedResult = await sendPageControl(
			extensionPage,
			restrictedTabId,
			'get_browser_state'
		)

		const summary = {
			extensionId,
			targetTabId,
			contentScript: Boolean(browserState.content.includes('Click target')),
			click: clickResult?.success === true,
			input: inputResult?.success === true,
			upload: fileResult?.success === true,
			text: textResult?.success === true && textResult.message.includes('Page Agent Smoke'),
			table: tableResult?.success === true && tableResult.message.includes('Alice'),
			javascript: jsResult?.success === true && jsResult.message.includes('Page Agent Smoke'),
			tabListCount: tabsResult.tabs.length,
			restrictedError: Boolean(restrictedResult?.error || restrictedResult?.success === false),
		}

		const optionalFields = requireJavascript ? [] : ['javascript']
		const failed = Object.entries(summary).filter(
			([key, value]) =>
				!['extensionId', 'targetTabId', 'tabListCount', ...optionalFields].includes(key) &&
				value !== true
		)
		if (failed.length > 0) {
			throw new Error(`Smoke assertions failed: ${JSON.stringify({ summary, jsResult, failed })}`)
		}

		console.log(JSON.stringify({ ...summary, jsResult }, null, 2))
	} finally {
		await context?.close().catch(() => {})
		await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
		server.close()
	}
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})

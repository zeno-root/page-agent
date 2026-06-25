import { afterEach, describe, expect, it, vi } from 'vitest'

import { RemotePageController } from './RemotePageController'

function installChromeMock() {
	const sendMessage = vi.fn(async () => ({
		success: true,
		message: '✅ Executed JavaScript. Result: Example',
	}))
	;(globalThis as any).chrome = {
		runtime: { sendMessage },
	}
	return { sendMessage }
}

function createTabsController(url = 'https://example.test/') {
	return {
		currentTabId: 9,
		getTabInfo: vi.fn(async () => ({ url, title: 'Example' })),
	} as any
}

const selectedUploadFile = {
	name: 'report.txt',
	type: 'text/plain',
	contentBase64: 'SGVsbG8=',
	size: 5,
}

describe('RemotePageController executeJavascript', () => {
	afterEach(() => {
		delete (globalThis as any).chrome
	})

	it('forwards execute_javascript to the current tab with timeout and result bounds', async () => {
		const { sendMessage } = installChromeMock()
		const controller = new RemotePageController(createTabsController())

		const result = await controller.executeJavascript('return document.title')

		expect(result).toEqual({ success: true, message: '✅ Executed JavaScript. Result: Example' })
		expect(sendMessage).toHaveBeenCalledWith({
			type: 'PAGE_CONTROL',
			action: 'execute_javascript',
			targetTabId: 9,
			payload: {
				script: 'return document.title',
				timeoutMs: 8_000,
				maxLength: 4_000,
			},
		})
	})

	it('rejects execute_javascript on browser-internal pages before sending a message', async () => {
		const { sendMessage } = installChromeMock()
		const controller = new RemotePageController(createTabsController('chrome://settings'))

		const result = await controller.executeJavascript('return document.title')

		expect(result.success).toBe(false)
		expect(result.message).toContain('Operation not allowed')
		expect(sendMessage).not.toHaveBeenCalled()
	})

	it('forwards keyboard and hover actions to the current tab', async () => {
		const { sendMessage } = installChromeMock()
		const controller = new RemotePageController(createTabsController())

		await controller.pressKey('Enter')
		await controller.hoverElement(3)

		expect(sendMessage).toHaveBeenCalledWith({
			type: 'PAGE_CONTROL',
			action: 'press_key',
			targetTabId: 9,
			payload: ['Enter'],
		})
		expect(sendMessage).toHaveBeenCalledWith({
			type: 'PAGE_CONTROL',
			action: 'hover_element',
			targetTabId: 9,
			payload: [3],
		})
	})

	it('forwards page text and table extraction actions to the current tab', async () => {
		const { sendMessage } = installChromeMock()
		const controller = new RemotePageController(createTabsController())

		await controller.extractPageText({ maxLength: 1200 })
		await controller.extractStructuredTable({ index: 3, maxLength: 1200 })

		expect(sendMessage).toHaveBeenCalledWith({
			type: 'PAGE_CONTROL',
			action: 'extract_page_text',
			targetTabId: 9,
			payload: [{ maxLength: 1200 }],
		})
		expect(sendMessage).toHaveBeenCalledWith({
			type: 'PAGE_CONTROL',
			action: 'extract_structured_table',
			targetTabId: 9,
			payload: [{ index: 3, maxLength: 1200 }],
		})
	})

	it('forwards the user-selected upload file to the current tab', async () => {
		const { sendMessage } = installChromeMock()
		const controller = new RemotePageController(createTabsController(), {
			getSelectedUploadFile: () => selectedUploadFile,
		})

		await controller.uploadFile(7)

		expect(sendMessage).toHaveBeenCalledWith({
			type: 'PAGE_CONTROL',
			action: 'upload_file',
			targetTabId: 9,
			payload: [7, selectedUploadFile],
		})
	})

	it('rejects upload_file when the user has not selected a file', async () => {
		const { sendMessage } = installChromeMock()
		const controller = new RemotePageController(createTabsController(), {
			getSelectedUploadFile: () => null,
		})

		const result = await controller.uploadFile(7)

		expect(result.success).toBe(false)
		expect(result.message).toContain('No upload file selected')
		expect(sendMessage).not.toHaveBeenCalled()
	})
})

import { describe, expect, it, vi } from 'vitest'

import { tools } from './index'

const signal = new AbortController().signal

describe('browser interaction tools', () => {
	it('delegates press_key to the page controller', async () => {
		const pageController = {
			pressKey: vi.fn(async () => ({ success: true, message: 'pressed Enter' })),
		}
		const pressKey = tools.get('press_key')

		await expect(
			pressKey?.execute.call({ pageController } as any, { key: 'Enter' }, { signal })
		).resolves.toBe('pressed Enter')

		expect(pageController.pressKey).toHaveBeenCalledWith('Enter')
	})

	it('delegates hover_element to the page controller', async () => {
		const pageController = {
			hoverElement: vi.fn(async () => ({ success: true, message: 'hovered 4' })),
		}
		const hoverElement = tools.get('hover_element')

		await expect(
			hoverElement?.execute.call({ pageController } as any, { index: 4 }, { signal })
		).resolves.toBe('hovered 4')

		expect(pageController.hoverElement).toHaveBeenCalledWith(4)
	})

	it('delegates extract_page_text to the page controller', async () => {
		const pageController = {
			extractPageText: vi.fn(async () => ({ success: true, message: 'page text' })),
		}
		const extractPageText = tools.get('extract_page_text')

		await expect(
			extractPageText?.execute.call({ pageController } as any, { max_length: 1200 }, { signal })
		).resolves.toBe('page text')

		expect(pageController.extractPageText).toHaveBeenCalledWith({ maxLength: 1200 })
	})

	it('delegates extract_structured_table to the page controller', async () => {
		const pageController = {
			extractStructuredTable: vi.fn(async () => ({ success: true, message: 'table json' })),
		}
		const extractStructuredTable = tools.get('extract_structured_table')

		await expect(
			extractStructuredTable?.execute.call(
				{ pageController } as any,
				{ index: 3, max_length: 1200 },
				{ signal }
			)
		).resolves.toBe('table json')

		expect(pageController.extractStructuredTable).toHaveBeenCalledWith({
			index: 3,
			maxLength: 1200,
		})
	})

	it('delegates upload_file to the page controller', async () => {
		const pageController = {
			uploadFile: vi.fn(async () => ({ success: true, message: 'uploaded selected file' })),
		}
		const uploadFile = tools.get('upload_file')

		await expect(
			uploadFile?.execute.call({ pageController } as any, { index: 7 }, { signal })
		).resolves.toBe('uploaded selected file')

		expect(pageController.uploadFile).toHaveBeenCalledWith(7)
	})
})

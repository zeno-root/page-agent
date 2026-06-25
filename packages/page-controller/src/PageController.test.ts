import { describe, expect, it } from 'vitest'

import { PageController } from './PageController'

describe('PageController', () => {
	it('constructs and exposes the current url', async () => {
		const controller = new PageController()
		expect(controller).toBeInstanceOf(PageController)
		expect(await controller.getCurrentUrl()).toBe(window.location.href)
	})

	describe('executeJavascript', () => {
		it('runs a script and returns its result', async () => {
			const controller = new PageController()
			const result = await controller.executeJavascript('return 1 + 2')
			expect(result, result.message).toMatchObject({ success: true })
			expect(result.message).toContain('3')
		})

		it('exposes the abort signal to the script scope', async () => {
			const controller = new PageController()
			const controllerSignal = new AbortController()
			controllerSignal.abort()

			const result = await controller.executeJavascript(
				'return signal.aborted',
				controllerSignal.signal
			)
			expect(result, result.message).toMatchObject({ success: true })
			expect(result.message).toContain('true')
		})

		it('reports a syntax error as a failed result', async () => {
			const controller = new PageController()
			const result = await controller.executeJavascript('return (')
			expect(result.success).toBe(false)
			expect(result.message).toContain('❌')
		})
	})

	describe('pressKey', () => {
		it('dispatches keyboard events to the focused element', async () => {
			document.body.innerHTML = '<input id="field" />'
			const input = document.getElementById('field') as HTMLInputElement
			const events: string[] = []
			input.addEventListener('keydown', (event) => events.push(`down:${event.key}`))
			input.addEventListener('keyup', (event) => events.push(`up:${event.key}`))
			input.focus()

			const controller = new PageController()
			const result = await controller.pressKey('Enter')

			expect(result).toMatchObject({ success: true })
			expect(events).toEqual(['down:Enter', 'up:Enter'])
		})
	})

	describe('hoverElement', () => {
		it('dispatches hover events to an indexed element', async () => {
			document.body.innerHTML = '<button id="target">Hover me</button>'
			const target = document.getElementById('target') as HTMLButtonElement
			const events: string[] = []
			target.addEventListener('mouseover', () => events.push('mouseover'))
			target.addEventListener('mouseenter', () => events.push('mouseenter'))

			const controller = new PageController()
			;(controller as any).selectorMap.set(4, { ref: target })
			;(controller as any).elementTextMap.set(4, 'Hover me')
			;(controller as any).isIndexed = true
			const result = await controller.hoverElement(4)

			expect(result, result.message).toMatchObject({ success: true })
			expect(events).toEqual(['mouseover', 'mouseenter'])
		})
	})

	describe('extractPageText', () => {
		it('extracts normalized page text without script content', async () => {
			document.body.innerHTML = `
				<main>
					<h1>Report</h1>
					<p>Revenue   grew</p>
					<script>secret()</script>
				</main>
			`
			const controller = new PageController()

			const result = await controller.extractPageText({ maxLength: 80 })

			expect(result).toMatchObject({ success: true })
			expect(result.message).toContain('Report Revenue grew')
			expect(result.message).not.toContain('secret')
		})
	})

	describe('extractStructuredTable', () => {
		it('extracts table headers and rows as bounded JSON', async () => {
			document.body.innerHTML = `
				<table>
					<thead><tr><th>Name</th><th>Score</th></tr></thead>
					<tbody><tr><td>Alice</td><td>98</td></tr></tbody>
				</table>
			`
			const controller = new PageController()

			const result = await controller.extractStructuredTable({ maxLength: 200 })

			expect(result).toMatchObject({ success: true })
			expect(result.message).toContain('"headers":["Name","Score"]')
			expect(result.message).toContain('"Alice"')
		})
	})

	describe('uploadFile', () => {
		it('injects a user-selected file into an indexed file input', async () => {
			document.body.innerHTML = '<input id="upload" type="file" />'
			const input = document.getElementById('upload') as HTMLInputElement
			const events: string[] = []
			input.addEventListener('input', () => events.push('input'))
			input.addEventListener('change', () => events.push('change'))

			const controller = new PageController()
			;(controller as any).selectorMap.set(8, { ref: input })
			;(controller as any).elementTextMap.set(8, 'Upload')
			;(controller as any).isIndexed = true

			const result = await controller.uploadFile(8, {
				name: 'report.txt',
				type: 'text/plain',
				contentBase64: 'SGVsbG8=',
				size: 5,
			})

			expect(result, result.message).toMatchObject({ success: true })
			expect(input.files?.[0]?.name).toBe('report.txt')
			expect(input.files?.[0]?.type).toBe('text/plain')
			expect(events).toEqual(['input', 'change'])
		})
	})
})

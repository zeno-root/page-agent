import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const wxtConfigSource = fs.readFileSync(path.resolve(__dirname, '../../wxt.config.js'), 'utf8')

describe('extension manifest permissions', () => {
	it('keeps the approved unrestricted permission set without unrelated sensitive permissions', () => {
		expect(wxtConfigSource).toContain("host_permissions: ['<all_urls>']")
		expect(wxtConfigSource).toContain(
			"permissions: ['tabs', 'tabGroups', 'sidePanel', 'storage', 'scripting']"
		)
		expect(wxtConfigSource).not.toContain("'cookies'")
		expect(wxtConfigSource).not.toContain("'history'")
		expect(wxtConfigSource).not.toContain("'downloads'")
	})
})

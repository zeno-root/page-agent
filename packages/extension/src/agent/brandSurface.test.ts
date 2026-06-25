import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const extensionRoot = path.resolve(__dirname, '../..')
const wxtConfigSource = fs.readFileSync(path.join(extensionRoot, 'wxt.config.js'), 'utf8')
const sidePanelSource = fs.readFileSync(
	path.join(extensionRoot, 'src/entrypoints/sidepanel/App.tsx'),
	'utf8'
)
const hubSource = fs.readFileSync(path.join(extensionRoot, 'src/entrypoints/hub/App.tsx'), 'utf8')
const configPanelSource = fs.readFileSync(
	path.join(extensionRoot, 'src/components/ConfigPanel.tsx'),
	'utf8'
)
const miscSource = fs.readFileSync(path.join(extensionRoot, 'src/components/misc.tsx'), 'utf8')
const llmSource = fs.readFileSync(path.join(extensionRoot, '../llms/src/index.ts'), 'utf8')

const enMessages = JSON.parse(
	fs.readFileSync(path.join(extensionRoot, 'public/_locales/en/messages.json'), 'utf8')
)
const zhMessages = JSON.parse(
	fs.readFileSync(path.join(extensionRoot, 'public/_locales/zh_CN/messages.json'), 'utf8')
)

const releaseSurfaceSource = [
	wxtConfigSource,
	sidePanelSource,
	hubSource,
	configPanelSource,
	miscSource,
	llmSource,
	JSON.stringify(enMessages),
	JSON.stringify(zhMessages),
].join('\n')

describe('indofun extension brand surface', () => {
	it('publishes the Chrome extension under Indofun AIGC branding', () => {
		expect(wxtConfigSource).toContain("default_locale: 'zh_CN'")
		expect(wxtConfigSource).toContain("homepage_url: 'https://aigc.indofun.com/'")
		expect(wxtConfigSource).toContain(
			"artifactTemplate: 'indofun-aigc-assistant-{{version}}-{{browser}}.zip'"
		)
		expect(wxtConfigSource).toContain("64: 'assets/indofun-aigc-64.png'")

		expect(enMessages.extName.message).toBe('Indofun AIGC Assistant')
		expect(zhMessages.extName.message).toBe('Indofun AIGC 助手')
		expect(zhMessages.extActionTitle.message).toBe('打开 Indofun AIGC 助手')
	})

	it('localizes user-visible extension UI and removes upstream open-source links', () => {
		expect(sidePanelSource).toContain('Indofun AIGC 助手')
		expect(configPanelSource).toContain('设置')
		expect(hubSource).toContain('Indofun AIGC 连接中心')
		expect(miscSource).toContain('/assets/indofun-aigc-256.png')

		expect(releaseSurfaceSource).not.toMatch(/github\.com\/alibaba\/page-agent/i)
		expect(releaseSurfaceSource).not.toMatch(/alibaba\.github\.io\/page-agent/i)
		expect(releaseSurfaceSource).not.toMatch(/Source Code|Built with|@Simon|MIT Open Source/i)
		expect(releaseSurfaceSource).not.toMatch(/Page Agent Ext|Page Agent Hub/i)
	})
})

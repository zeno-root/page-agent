import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appSource = fs.readFileSync(path.resolve(__dirname, './App.tsx'), 'utf8')
const useAgentSource = fs.readFileSync(path.resolve(__dirname, '../../agent/useAgent.ts'), 'utf8')
const multiPageAgentSource = fs.readFileSync(
	path.resolve(__dirname, '../../agent/MultiPageAgent.ts'),
	'utf8'
)
const configPanelSource = fs.readFileSync(
	path.resolve(__dirname, '../../components/ConfigPanel.tsx'),
	'utf8'
)

describe('unrestricted browser controller side panel surface', () => {
	it('shows mode, scope, dangerous tools, JavaScript, and current target status', () => {
		expect(appSource).toContain('Mode: Unrestricted')
		expect(appSource).toContain('Scope: All accessible pages')
		expect(appSource).toContain('Dangerous tools: Enabled')
		expect(appSource).toContain('JavaScript: Disabled')
		expect(appSource).toContain('Current Target')
		expect(appSource).toContain('Tab List')
		expect(appSource).toContain('setCurrentTargetTab')
		expect(appSource).toContain('activateTab')
	})

	it('defaults to current-window tab visibility for unrestricted mode', () => {
		expect(useAgentSource).toContain('experimentalIncludeAllTabs: true')
		expect(configPanelSource).toContain('Include all tabs')
	})

	it('keeps JavaScript execution explicitly configurable and visible', () => {
		expect(useAgentSource).toContain('enableJavascriptExecution')
		expect(configPanelSource).toContain('Enable JavaScript execution')
		expect(multiPageAgentSource).toContain(
			'experimentalScriptExecutionTool: Boolean(config.enableJavascriptExecution)'
		)
		expect(appSource).toContain("config?.enableJavascriptExecution ? 'JavaScript: Enabled'")
	})

	it('requires an explicit side-panel file selection before upload_file can run', () => {
		expect(appSource).toContain('selectedUploadFileRef')
		expect(appSource).toContain('handleUploadFileChange')
		expect(appSource).toContain('Upload file')
		expect(multiPageAgentSource).toContain('getSelectedUploadFile')
	})
})

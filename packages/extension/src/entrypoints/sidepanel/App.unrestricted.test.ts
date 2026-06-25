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
		expect(appSource).toContain('模式：全页控制')
		expect(appSource).toContain('范围：可访问页面')
		expect(appSource).toContain('高风险工具：已启用')
		expect(appSource).toContain('JavaScript：已关闭')
		expect(appSource).toContain('当前目标')
		expect(appSource).toContain('标签页列表')
		expect(appSource).toContain('setCurrentTargetTab')
		expect(appSource).toContain('activateTab')
	})

	it('defaults to current-window tab visibility for unrestricted mode', () => {
		expect(useAgentSource).toContain('experimentalIncludeAllTabs: true')
		expect(configPanelSource).toContain('包含所有标签页')
	})

	it('keeps JavaScript execution explicitly configurable and visible', () => {
		expect(useAgentSource).toContain('enableJavascriptExecution')
		expect(configPanelSource).toContain('允许执行 JavaScript')
		expect(multiPageAgentSource).toContain(
			'experimentalScriptExecutionTool: Boolean(config.enableJavascriptExecution)'
		)
		expect(appSource).toContain("config?.enableJavascriptExecution ? 'JavaScript：已启用'")
	})

	it('requires an explicit side-panel file selection before upload_file can run', () => {
		expect(appSource).toContain('selectedUploadFileRef')
		expect(appSource).toContain('handleUploadFileChange')
		expect(appSource).toContain('上传文件')
		expect(multiPageAgentSource).toContain('getSelectedUploadFile')
	})
})

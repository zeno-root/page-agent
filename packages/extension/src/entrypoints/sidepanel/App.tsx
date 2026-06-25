import type { UploadFilePayload } from '@page-agent/page-controller'
import {
	Camera,
	Crosshair,
	History,
	RefreshCw,
	Send,
	Settings,
	Square,
	Upload,
	X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ConfigPanel } from '@/components/ConfigPanel'
import { HistoryDetail } from '@/components/HistoryDetail'
import { HistoryList } from '@/components/HistoryList'
import { ActivityCard, EventCard } from '@/components/cards'
import { EmptyState, Logo, MotionOverlay, StatusDot } from '@/components/misc'
import { Button } from '@/components/ui/button'
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from '@/components/ui/input-group'
import { saveSession } from '@/lib/db'

import { useAgent } from '../../agent/useAgent'

type View =
	| { name: 'chat' }
	| { name: 'config' }
	| { name: 'history' }
	| { name: 'history-detail'; sessionId: string }

interface PanelTab {
	id: number
	title?: string
	url?: string
	status?: chrome.tabs.Tab['status']
	windowId?: number
	active?: boolean
}

interface UploadFileSummary {
	name: string
	size: number
	type?: string
}

const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024

export default function App() {
	const [view, setView] = useState<View>({ name: 'chat' })
	const [inputValue, setInputValue] = useState('')
	const [currentTarget, setCurrentTarget] = useState<PanelTab | null>(null)
	const [visibleTabs, setVisibleTabs] = useState<PanelTab[]>([])
	const [selectedUploadFileSummary, setSelectedUploadFileSummary] =
		useState<UploadFileSummary | null>(null)
	const historyRef = useRef<HTMLDivElement>(null)
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const uploadInputRef = useRef<HTMLInputElement>(null)
	const selectedUploadFileRef = useRef<UploadFilePayload | null>(null)

	const getSelectedUploadFile = useCallback(() => selectedUploadFileRef.current, [])

	const { status, history, activity, currentTask, config, execute, stop, configure } = useAgent({
		getSelectedUploadFile,
	})

	const refreshCurrentTarget = useCallback(async () => {
		const [result, activeTabs] = await Promise.all([
			chrome.storage.local.get('currentTabId'),
			chrome.tabs.query({ active: true, currentWindow: true }),
		])
		const activeTab = activeTabs[0]
		const windowId = activeTab?.windowId
		const tabs =
			typeof windowId === 'number'
				? await chrome.tabs.query({ windowId })
				: await chrome.tabs.query({ currentWindow: true })
		const panelTabs = tabs
			.filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
			.map(
				(tab): PanelTab => ({
					id: tab.id,
					title: tab.title,
					url: tab.url,
					status: tab.status,
					windowId: tab.windowId,
					active: tab.active,
				})
			)
		setVisibleTabs(panelTabs)

		const currentTabId = result.currentTabId
		if (typeof currentTabId !== 'number') {
			const fallbackTarget = panelTabs.find((tab) => tab.active) ?? null
			setCurrentTarget(fallbackTarget)
			return
		}

		const listedTarget = panelTabs.find((tab) => tab.id === currentTabId)
		if (listedTarget) {
			setCurrentTarget(listedTarget)
			return
		}

		setCurrentTarget({ id: currentTabId })
	}, [])

	useEffect(() => {
		refreshCurrentTarget().catch(console.error)
		const interval = window.setInterval(() => {
			refreshCurrentTarget().catch(console.error)
		}, 1_500)
		return () => window.clearInterval(interval)
	}, [refreshCurrentTarget])

	// Persist session when task finishes
	const prevStatusRef = useRef(status)
	useEffect(() => {
		const prev = prevStatusRef.current
		prevStatusRef.current = status

		if (
			prev === 'running' &&
			(status === 'completed' || status === 'error' || status === 'stopped') &&
			history.length > 0 &&
			currentTask
		) {
			saveSession({ task: currentTask, history, status }).catch((err) =>
				console.error('[SidePanel] Failed to save session:', err)
			)
		}
	}, [status, history, currentTask])

	// Auto-scroll to bottom on new events
	useEffect(() => {
		if (historyRef.current) {
			historyRef.current.scrollTop = historyRef.current.scrollHeight
		}
	}, [history, activity])

	const runTask = useCallback(
		(task: string) => {
			const normalizedTask = task.trim()
			if (!normalizedTask || status === 'running') return

			setInputValue('')
			setView({ name: 'chat' })

			execute(normalizedTask).catch((error) => {
				console.error('[SidePanel] Failed to execute task:', error)
			})
		},
		[execute, status]
	)

	const handleSubmit = useCallback(
		(e?: React.SyntheticEvent) => {
			e?.preventDefault()
			runTask(inputValue)
		},
		[inputValue, runTask]
	)

	const handleStop = useCallback(() => {
		console.log('[SidePanel] Stopping task...')
		stop()
	}, [stop])

	const activateCurrentTarget = useCallback(async () => {
		if (!currentTarget?.id) return
		await chrome.tabs.update(currentTarget.id, { active: true })
		await refreshCurrentTarget()
	}, [currentTarget?.id, refreshCurrentTarget])

	const setCurrentTargetTab = useCallback(
		async (tab: PanelTab) => {
			await chrome.storage.local.set({ currentTabId: tab.id })
			setCurrentTarget(tab)
			await refreshCurrentTarget()
		},
		[refreshCurrentTarget]
	)

	const activateTab = useCallback(
		async (tab: PanelTab) => {
			await chrome.storage.local.set({ currentTabId: tab.id })
			await chrome.tabs.update(tab.id, { active: true })
			await refreshCurrentTarget()
		},
		[refreshCurrentTarget]
	)

	const captureVisibleTab = useCallback(async () => {
		const windowId = currentTarget?.windowId
		if (!windowId) return
		const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
		console.info('[SidePanel] Captured visible tab', {
			tabId: currentTarget.id,
			windowId,
			length: dataUrl.length,
		})
	}, [currentTarget])

	const handleUploadFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.currentTarget.files?.[0] ?? null
		if (!file) {
			selectedUploadFileRef.current = null
			setSelectedUploadFileSummary(null)
			return
		}

		if (file.size > MAX_UPLOAD_FILE_BYTES) {
			selectedUploadFileRef.current = null
			setSelectedUploadFileSummary(null)
			event.currentTarget.value = ''
			window.alert(`文件过大，最大支持 ${formatBytes(MAX_UPLOAD_FILE_BYTES)}。`)
			return
		}

		const contentBase64 = await readFileBase64(file)
		selectedUploadFileRef.current = {
			name: file.name,
			type: file.type,
			contentBase64,
			size: file.size,
			lastModified: file.lastModified,
		}
		setSelectedUploadFileSummary({
			name: file.name,
			type: file.type,
			size: file.size,
		})
	}, [])

	const clearUploadFile = useCallback(() => {
		selectedUploadFileRef.current = null
		setSelectedUploadFileSummary(null)
		if (uploadInputRef.current) uploadInputRef.current.value = ''
	}, [])

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault()
			handleSubmit()
		}
	}

	// --- View routing ---

	if (view.name === 'config') {
		return (
			<ConfigPanel
				config={config}
				onSave={async (newConfig) => {
					await configure(newConfig)
					setView({ name: 'chat' })
				}}
				onClose={() => setView({ name: 'chat' })}
			/>
		)
	}

	if (view.name === 'history') {
		return (
			<HistoryList
				onSelect={(id) => setView({ name: 'history-detail', sessionId: id })}
				onBack={() => setView({ name: 'chat' })}
				onRerun={runTask}
			/>
		)
	}

	if (view.name === 'history-detail') {
		return (
			<HistoryDetail
				sessionId={view.sessionId}
				onBack={() => setView({ name: 'history' })}
				onRerun={runTask}
			/>
		)
	}

	// --- Chat view ---

	const isRunning = status === 'running'
	const showEmptyState = !currentTask && history.length === 0 && !isRunning

	return (
		<div className="relative flex flex-col h-screen bg-background">
			<MotionOverlay active={isRunning} />
			{/* Header */}
			<header className="flex items-center justify-between border-b px-3 py-2">
				<div className="flex items-center gap-2">
					<Logo className="size-5" />
					<span className="text-sm font-medium">Indofun AIGC 助手</span>
				</div>
				<div className="flex items-center gap-1">
					<StatusDot status={status} />
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={() => setView({ name: 'history' })}
						className="cursor-pointer"
						aria-label="历史记录"
						title="历史记录"
					>
						<History className="size-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={() => setView({ name: 'config' })}
						className="cursor-pointer"
						aria-label="设置"
						title="设置"
					>
						<Settings className="size-3.5" />
					</Button>
				</div>
			</header>

			{/* Content */}
			<main className="flex-1 overflow-hidden flex flex-col">
				{/* Current task */}
				{currentTask && (
					<div className="border-b px-3 py-2 bg-muted/30">
						<div className="text-[10px] text-muted-foreground uppercase tracking-wide">任务</div>
						<div className="text-xs font-medium truncate" title={currentTask}>
							{currentTask}
						</div>
					</div>
				)}

				<div className="border-b px-3 py-2 bg-muted/20 space-y-2">
					<div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
						<span>模式：全页控制</span>
						<span>范围：可访问页面</span>
						<span>高风险工具：已启用</span>
						<span>
							{config?.enableJavascriptExecution ? 'JavaScript：已启用' : 'JavaScript：已关闭'}
						</span>
					</div>
					<div className="text-[11px]">
						<div className="font-medium">当前目标</div>
						<div className="truncate text-muted-foreground" title={currentTarget?.url || ''}>
							{currentTarget
								? `[${currentTarget.id}] ${currentTarget.title || '(untitled)'} - ${
										currentTarget.url || '(url unavailable)'
									}`
								: '未选择目标'}
						</div>
					</div>
					<div className="flex items-center gap-1">
						<Button
							variant="outline"
							size="sm"
							className="h-7 text-[11px] cursor-pointer"
							onClick={() => refreshCurrentTarget().catch(console.error)}
							title="刷新标签页"
						>
							<RefreshCw className="size-3" />
							刷新
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="h-7 text-[11px] cursor-pointer"
							onClick={() => activateCurrentTarget().catch(console.error)}
							disabled={!currentTarget?.id}
							title="激活当前目标"
						>
							<Crosshair className="size-3" />
							激活
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="h-7 text-[11px] cursor-pointer"
							onClick={() => captureVisibleTab().catch(console.error)}
							disabled={!currentTarget?.windowId}
							title="截取当前可见标签页"
						>
							<Camera className="size-3" />
							截图
						</Button>
					</div>
					<div className="text-[11px] space-y-1">
						<div className="flex items-center justify-between">
							<div className="font-medium">标签页列表</div>
							<span className="text-[10px] text-muted-foreground">
								{visibleTabs.length} 个标签页
							</span>
						</div>
						<div className="max-h-28 overflow-y-auto rounded-md border bg-background/70 divide-y">
							{visibleTabs.length === 0 ? (
								<div className="px-2 py-2 text-muted-foreground">没有找到标签页</div>
							) : (
								visibleTabs.map((tab) => {
									const isCurrent = currentTarget?.id === tab.id
									return (
										<div
											key={tab.id}
											className={`grid grid-cols-[1fr_auto] items-center gap-1 px-2 py-1 ${
												isCurrent ? 'bg-primary/10' : ''
											}`}
										>
											<button
												type="button"
												className="min-w-0 text-left cursor-pointer"
												onClick={() => setCurrentTargetTab(tab).catch(console.error)}
												title={tab.url || ''}
											>
												<div className="truncate font-medium">
													[{tab.id}] {tab.title || '(未命名)'}
												</div>
												<div className="truncate text-[10px] text-muted-foreground">
													{tab.status || 'unknown'} - {tab.url || '(地址不可用)'}
												</div>
											</button>
											<Button
												variant={isCurrent ? 'default' : 'ghost'}
												size="icon-sm"
												className="size-6 cursor-pointer"
												onClick={() => activateTab(tab).catch(console.error)}
												title="激活标签页"
												aria-label={`激活标签页 ${tab.id}`}
											>
												<Crosshair className="size-3" />
											</Button>
										</div>
									)
								})
							)}
						</div>
					</div>
				</div>

				{/* History */}
				<div ref={historyRef} className="flex-1 overflow-y-auto p-3 space-y-2">
					{showEmptyState && <EmptyState />}

					{history.map((event, index) => (
						<EventCard key={index} event={event} />
					))}

					{/* Activity indicator at bottom */}
					{activity && <ActivityCard activity={activity} />}
				</div>
			</main>

			{/* Input */}
			<footer className="border-t p-3">
				<div className="mb-2 flex items-center gap-2 text-[11px]">
					<input
						ref={uploadInputRef}
						type="file"
						className="hidden"
						onChange={handleUploadFileChange}
					/>
					<Button
						variant="outline"
						size="sm"
						className="h-7 text-[11px] cursor-pointer"
						onClick={() => uploadInputRef.current?.click()}
						disabled={isRunning}
						title="选择上传文件"
					>
						<Upload className="size-3" />
						上传文件
					</Button>
					<div
						className="min-w-0 flex-1 truncate text-muted-foreground"
						title={selectedUploadFileSummary?.name || ''}
					>
						{selectedUploadFileSummary
							? `${selectedUploadFileSummary.name} - ${formatBytes(selectedUploadFileSummary.size)}`
							: '未选择上传文件'}
					</div>
					{selectedUploadFileSummary && (
						<Button
							variant="ghost"
							size="icon-sm"
							className="size-6 cursor-pointer"
							onClick={clearUploadFile}
							disabled={isRunning}
							title="清除上传文件"
							aria-label="清除上传文件"
						>
							<X className="size-3" />
						</Button>
					)}
				</div>
				<InputGroup className="relative rounded-lg">
					<InputGroupTextarea
						ref={textareaRef}
						placeholder="描述要执行的任务...（Enter 发送）"
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleKeyDown}
						disabled={isRunning}
						className="text-xs pr-12 min-h-10"
					/>
					<InputGroupAddon align="inline-end" className="absolute bottom-0 right-0">
						{isRunning ? (
							<InputGroupButton
								size="icon-sm"
								variant="destructive"
								onClick={handleStop}
								className="size-7"
								aria-label="停止任务"
								title="停止任务"
							>
								<Square className="size-3" />
							</InputGroupButton>
						) : (
							<InputGroupButton
								size="icon-sm"
								variant="default"
								onClick={() => handleSubmit()}
								disabled={!inputValue.trim()}
								className="size-7 cursor-pointer"
								aria-label="发送"
								title="发送"
							>
								<Send className="size-3" />
							</InputGroupButton>
						)}
					</InputGroupAddon>
				</InputGroup>
			</footer>
		</div>
	)
}

function readFileBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.addEventListener('load', () => {
			const result = typeof reader.result === 'string' ? reader.result : ''
			resolve(result.split(',')[1] || '')
		})
		reader.addEventListener('error', () => reject(reader.error || new Error('读取上传文件失败')))
		reader.readAsDataURL(file)
	})
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

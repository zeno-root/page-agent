import {
	Copy,
	CornerUpLeft,
	ExternalLink,
	Eye,
	EyeOff,
	FoldVertical,
	Loader2,
	UnfoldVertical,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import {
	DEMO_BASE_URL,
	DEMO_MODEL,
	INDOFUN_V18_PROXY_API_KEY_LABEL,
	INDOFUN_V18_PROXY_BASE_URL,
	INDOFUN_V18_PROXY_MODEL,
	isIndofunV18ProxyEndpoint,
} from '@/agent/constants'
import type { ExtConfig, LanguagePreference } from '@/agent/useAgent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

interface ConfigPanelProps {
	config: ExtConfig | null
	onSave: (config: ExtConfig) => Promise<void>
	onClose: () => void
}

export function ConfigPanel({ config, onSave, onClose }: ConfigPanelProps) {
	const [baseURL, setBaseURL] = useState(config?.baseURL || DEMO_BASE_URL)
	const [model, setModel] = useState(config?.model || DEMO_MODEL)
	const [apiKey, setApiKey] = useState(config?.apiKey)
	const [language, setLanguage] = useState<LanguagePreference>(config?.language)
	const [maxSteps, setMaxSteps] = useState(config?.maxSteps)
	const [systemInstruction, setSystemInstruction] = useState(config?.systemInstruction ?? '')
	const [experimentalLlmsTxt, setExperimentalLlmsTxt] = useState(
		config?.experimentalLlmsTxt ?? false
	)
	const [experimentalIncludeAllTabs, setExperimentalIncludeAllTabs] = useState(
		config?.experimentalIncludeAllTabs ?? false
	)
	const [enableJavascriptExecution, setEnableJavascriptExecution] = useState(
		config?.enableJavascriptExecution ?? false
	)
	const [disableNamedToolChoice, setDisableNamedToolChoice] = useState(
		config?.disableNamedToolChoice ?? false
	)
	const [advancedOpen, setAdvancedOpen] = useState(false)
	const [saving, setSaving] = useState(false)
	const [userAuthToken, setUserAuthToken] = useState('')
	const [copied, setCopied] = useState(false)
	const [showToken, setShowToken] = useState(false)
	const [showApiKey, setShowApiKey] = useState(false)
	const usingIndofunV18Proxy = isIndofunV18ProxyEndpoint(baseURL)

	const [prevConfig, setPrevConfig] = useState(config)
	if (prevConfig !== config) {
		setPrevConfig(config)
		setBaseURL(config?.baseURL || DEMO_BASE_URL)
		setModel(config?.model || DEMO_MODEL)
		setApiKey(config?.apiKey)
		setLanguage(config?.language)
		setMaxSteps(config?.maxSteps)
		setSystemInstruction(config?.systemInstruction ?? '')
		setExperimentalLlmsTxt(config?.experimentalLlmsTxt ?? false)
		setExperimentalIncludeAllTabs(config?.experimentalIncludeAllTabs ?? false)
		setEnableJavascriptExecution(config?.enableJavascriptExecution ?? false)
		setDisableNamedToolChoice(config?.disableNamedToolChoice ?? false)
	}

	// Poll for user auth token every second until found
	useEffect(() => {
		let interval: NodeJS.Timeout | null = null

		const fetchToken = async () => {
			const result = await chrome.storage.local.get('PageAgentExtUserAuthToken')
			const token = result.PageAgentExtUserAuthToken
			if (typeof token === 'string' && token) {
				setUserAuthToken(token)
				if (interval) {
					clearInterval(interval)
					interval = null
				}
			}
		}

		fetchToken()
		interval = setInterval(fetchToken, 1000)

		return () => {
			if (interval) clearInterval(interval)
		}
	}, [])

	const handleCopyToken = async () => {
		if (userAuthToken) {
			await navigator.clipboard.writeText(userAuthToken)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		}
	}

	const handleSave = async () => {
		setSaving(true)
		try {
			await onSave({
				apiKey,
				baseURL,
				model,
				language,
				maxSteps: maxSteps || undefined,
				systemInstruction: systemInstruction || undefined,
				experimentalLlmsTxt,
				experimentalIncludeAllTabs,
				enableJavascriptExecution,
				disableNamedToolChoice,
			})
		} finally {
			setSaving(false)
		}
	}

	const applyIndofunV18Proxy = () => {
		setBaseURL(INDOFUN_V18_PROXY_BASE_URL)
		setModel(INDOFUN_V18_PROXY_MODEL)
		setApiKey('')
	}

	return (
		<div className="flex flex-col gap-4 p-4 relative">
			<div className="flex items-center justify-between">
				<h2 className="text-base font-semibold">设置</h2>
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={onClose}
					className="absolute top-2 right-3 cursor-pointer"
					aria-label="返回"
				>
					<CornerUpLeft className="size-3.5" />
				</Button>
			</div>

			{/* User auth token */}
			<div className="flex flex-col gap-1.5 p-3 bg-muted/50 rounded-md border">
				<label htmlFor="user-auth-token" className="text-xs font-medium text-muted-foreground">
					用户授权 token
				</label>
				<p className="text-[10px] text-muted-foreground mb-1">
					用于授权 Indofun AIGC 页面调用本扩展。
				</p>
				<div className="flex gap-2 items-center">
					<Input
						id="user-auth-token"
						readOnly
						value={
							userAuthToken
								? showToken
									? userAuthToken
									: `${userAuthToken.slice(0, 4)}${'•'.repeat(userAuthToken.length - 8)}${userAuthToken.slice(-4)}`
								: '加载中...'
						}
						className="text-xs h-8 font-mono bg-background"
					/>
					<Button
						variant="outline"
						size="icon"
						className="h-8 w-8 shrink-0 cursor-pointer"
						onClick={() => setShowToken(!showToken)}
						disabled={!userAuthToken}
						aria-label={showToken ? '隐藏 token' : '显示 token'}
						aria-pressed={showToken}
					>
						{showToken ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
					</Button>
					<Button
						variant="outline"
						size="icon"
						className="h-8 w-8 shrink-0 cursor-pointer"
						onClick={handleCopyToken}
						disabled={!userAuthToken}
						aria-label="复制 token"
					>
						{copied ? <span className="">✓</span> : <Copy className="size-3" />}
					</Button>
					<span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
						{copied ? 'token 已复制' : ''}
					</span>
				</div>
			</div>

			{/* Hub link */}
			<a
				href="/hub.html"
				target="_blank"
				rel="noopener noreferrer"
				className="flex items-center justify-between p-3 rounded-md border bg-muted/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
			>
				打开 Indofun AIGC 连接中心
				<ExternalLink className="size-3" />
			</a>

			<div className="flex flex-col gap-1.5">
				<label htmlFor="base-url" className="text-xs text-muted-foreground">
					服务地址
				</label>
				<Input
					id="base-url"
					placeholder="http://localhost:4800/api/page-agent/llm-proxy"
					value={baseURL}
					onChange={(e) => setBaseURL(e.target.value)}
					className="text-xs h-8"
				/>
			</div>

			<Button
				variant="outline"
				size="sm"
				className="h-8 text-xs cursor-pointer"
				onClick={applyIndofunV18Proxy}
			>
				使用 v1.8 代理
			</Button>

			{usingIndofunV18Proxy && (
				<div className="p-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 text-[11px] text-muted-foreground leading-relaxed">
					v1.8 代理会把真实模型 Key 保留在服务端。请在下方粘贴当前登录 token。
				</div>
			)}

			<div className="flex flex-col gap-1.5">
				<label htmlFor="model" className="text-xs text-muted-foreground">
					模型
				</label>
				<Input
					id="model"
					placeholder="gpt-5.1"
					value={model}
					onChange={(e) => setModel(e.target.value)}
					className="text-xs h-8"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<label htmlFor="api-key" className="text-xs text-muted-foreground">
					{usingIndofunV18Proxy ? INDOFUN_V18_PROXY_API_KEY_LABEL : 'API Key'}
				</label>
				<div className="flex gap-2 items-center">
					<Input
						id="api-key"
						type={showApiKey ? 'text' : 'password'}
						placeholder={usingIndofunV18Proxy ? '粘贴 v1.8 登录 token' : 'sk-...'}
						value={apiKey}
						onChange={(e) => setApiKey(e.target.value)}
						className="text-xs h-8"
					/>
					<Button
						variant="outline"
						size="icon"
						className="h-8 w-8 shrink-0 cursor-pointer"
						onClick={() => setShowApiKey(!showApiKey)}
						aria-label={showApiKey ? '隐藏密钥' : '显示密钥'}
					>
						{showApiKey ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
					</Button>
				</div>
			</div>

			<div className="flex flex-col gap-1.5">
				<label className="text-xs text-muted-foreground">回复语言</label>
				<select
					value={language ?? ''}
					onChange={(e) => setLanguage((e.target.value || undefined) as LanguagePreference)}
					className="h-8 text-xs rounded-md border border-input bg-background px-2 cursor-pointer"
				>
					<option value="">跟随系统</option>
					<option value="en-US">English</option>
					<option value="zh-CN">中文</option>
				</select>
			</div>

			{/* Advanced Config */}
			<button
				type="button"
				onClick={() => setAdvancedOpen(!advancedOpen)}
				className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer mt-1 font-bold"
			>
				高级设置
				{advancedOpen ? <FoldVertical className="size-3" /> : <UnfoldVertical className="size-3" />}
			</button>

			{advancedOpen && (
				<>
					<div className="flex flex-col gap-1.5">
						<label htmlFor="max-steps" className="text-xs text-muted-foreground">
							最大步数
						</label>
						<Input
							id="max-steps"
							type="number"
							placeholder="40"
							min={1}
							max={200}
							value={maxSteps ?? ''}
							onChange={(e) => setMaxSteps(e.target.value ? Number(e.target.value) : undefined)}
							className="text-xs h-8 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<label className="text-xs text-muted-foreground">系统补充指令</label>
						<textarea
							placeholder="给助手补充额外执行要求..."
							value={systemInstruction}
							onChange={(e) => setSystemInstruction(e.target.value)}
							rows={3}
							className="text-xs rounded-md border border-input bg-background px-3 py-2 resize-y min-h-[60px]"
						/>
					</div>

					<label className="flex items-center justify-between cursor-pointer">
						<span className="text-xs text-muted-foreground">禁用指定工具选择</span>
						<Switch checked={disableNamedToolChoice} onCheckedChange={setDisableNamedToolChoice} />
					</label>

					<label className="flex items-center justify-between cursor-pointer">
						<span className="text-xs text-muted-foreground">启用 llms.txt 实验支持</span>
						<Switch checked={experimentalLlmsTxt} onCheckedChange={setExperimentalLlmsTxt} />
					</label>

					<label className="flex items-center justify-between cursor-pointer">
						<span className="text-xs text-muted-foreground">包含所有标签页</span>
						<Switch
							checked={experimentalIncludeAllTabs}
							onCheckedChange={setExperimentalIncludeAllTabs}
						/>
					</label>

					<label className="flex items-center justify-between cursor-pointer">
						<span className="text-xs text-muted-foreground">允许执行 JavaScript</span>
						<Switch
							checked={enableJavascriptExecution}
							onCheckedChange={setEnableJavascriptExecution}
						/>
					</label>
				</>
			)}

			<div className="flex gap-2 mt-2">
				<Button variant="outline" onClick={onClose} className="flex-1 h-8 text-xs cursor-pointer">
					取消
				</Button>
				<Button
					onClick={handleSave}
					disabled={saving}
					className="flex-1 h-8 text-xs cursor-pointer"
				>
					{saving ? <Loader2 className="size-3 animate-spin" /> : '保存'}
				</Button>
			</div>

			{/* Footer */}
			<div className="mt-4 mb-4 pt-4 border-t border-border/50 flex justify-between text-[10px] text-muted-foreground">
				<span>Indofun AIGC 浏览器助手</span>
				<span>
					版本 <span className="font-mono">v{__VERSION__}</span>
				</span>
			</div>
		</div>
	)
}

import type { LLMConfig } from '@page-agent/llms'

// Demo LLM for testing
export const DEMO_MODEL = 'qwen3.5-plus'
export const DEMO_BASE_URL = 'https://page-ag-testing-ohftxirgbn.cn-shanghai.fcapp.run'
// export const DEMO_API_KEY = 'NA'

export const DEMO_CONFIG: LLMConfig = {
	baseURL: DEMO_BASE_URL,
	model: DEMO_MODEL,
	// apiKey: DEMO_API_KEY,
}

export const INDOFUN_V18_PROXY_BASE_URL = 'http://localhost:4800/api/page-agent/llm-proxy'
export const INDOFUN_V18_PROXY_MODEL = 'server-configured'
export const INDOFUN_V18_PROXY_API_KEY_LABEL = 'v1.8 Auth Token'

export const INDOFUN_V18_PROXY_CONFIG: LLMConfig = {
	baseURL: INDOFUN_V18_PROXY_BASE_URL,
	model: INDOFUN_V18_PROXY_MODEL,
	apiKey: '',
}

/** Legacy testing endpoints that should be auto-migrated to DEMO_BASE_URL */
export const LEGACY_TESTING_ENDPOINTS = [
	'https://hwcxiuzfylggtcktqgij.supabase.co/functions/v1/llm-testing-proxy',
]

export function isTestingEndpoint(url: string): boolean {
	const normalized = url.replace(/\/+$/, '')
	return normalized === DEMO_BASE_URL || LEGACY_TESTING_ENDPOINTS.some((ep) => normalized === ep)
}

export function isIndofunV18ProxyEndpoint(url: string): boolean {
	const normalized = url.replace(/\/+$/, '')
	return /^https?:\/\/(localhost|127\.0\.0\.1):4800\/api\/page-agent\/llm-proxy$/.test(normalized)
}

export function migrateLegacyEndpoint(config: LLMConfig): LLMConfig {
	const normalized = config.baseURL.replace(/\/+$/, '')
	if (LEGACY_TESTING_ENDPOINTS.some((ep) => normalized === ep)) {
		return { ...DEMO_CONFIG }
	}
	return config
}

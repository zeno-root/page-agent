import { describe, expect, it } from 'vitest'

import {
	INDOFUN_V18_PROXY_API_KEY_LABEL,
	INDOFUN_V18_PROXY_BASE_URL,
	INDOFUN_V18_PROXY_CONFIG,
	INDOFUN_V18_PROXY_MODEL,
	isIndofunV18ProxyEndpoint,
} from './constants'

describe('indofun v1.8 proxy config', () => {
	it('exposes a server-key-safe v1.8 LLM proxy preset', () => {
		expect(INDOFUN_V18_PROXY_BASE_URL).toBe('http://localhost:4800/api/page-agent/llm-proxy')
		expect(INDOFUN_V18_PROXY_MODEL).toBe('server-configured')
		expect(INDOFUN_V18_PROXY_API_KEY_LABEL).toBe('v1.8 Auth Token')
		expect(INDOFUN_V18_PROXY_CONFIG).toEqual({
			baseURL: INDOFUN_V18_PROXY_BASE_URL,
			model: INDOFUN_V18_PROXY_MODEL,
			apiKey: '',
		})
	})

	it('recognizes local v1.8 proxy endpoints', () => {
		expect(isIndofunV18ProxyEndpoint('http://localhost:4800/api/page-agent/llm-proxy')).toBe(true)
		expect(isIndofunV18ProxyEndpoint('http://127.0.0.1:4800/api/page-agent/llm-proxy/')).toBe(true)
		expect(isIndofunV18ProxyEndpoint('https://api.openai.com/v1')).toBe(false)
	})
})

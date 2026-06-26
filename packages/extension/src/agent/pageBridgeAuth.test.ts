import { describe, expect, it } from 'vitest'

import { shouldExposePageBridge } from './pageBridgeAuth'

describe('content script page bridge authorization', () => {
	it('allows trusted Indofun AIGC origins without manual token pairing', () => {
		expect(
			shouldExposePageBridge({
				href: 'http://127.0.0.1:4800/',
				extensionToken: 'extension-token',
				pageToken: '',
			})
		).toBe(true)
		expect(
			shouldExposePageBridge({
				href: 'http://localhost:4800/',
				extensionToken: 'extension-token',
				pageToken: null,
			})
		).toBe(true)
		expect(
			shouldExposePageBridge({
				href: 'https://indofun.ai/',
				extensionToken: 'extension-token',
				pageToken: null,
			})
		).toBe(true)
		expect(
			shouldExposePageBridge({
				href: 'https://indofun.ai:3333/',
				extensionToken: 'extension-token',
				pageToken: null,
			})
		).toBe(true)
		expect(
			shouldExposePageBridge({
				href: 'https://www.indofun.ai/',
				extensionToken: 'extension-token',
				pageToken: null,
			})
		).toBe(true)
		expect(
			shouldExposePageBridge({
				href: 'https://api.indofun.ai/',
				extensionToken: 'extension-token',
				pageToken: null,
			})
		).toBe(true)
		expect(
			shouldExposePageBridge({
				href: 'https://aigc.indofun.ai/',
				extensionToken: 'extension-token',
				pageToken: null,
			})
		).toBe(false)
		expect(
			shouldExposePageBridge({
				href: 'https://staging.aigc.indofun.ai/',
				extensionToken: 'extension-token',
				pageToken: null,
			})
		).toBe(false)
		expect(
			shouldExposePageBridge({
				href: 'https://aigc.indofun.com/',
				extensionToken: 'extension-token',
				pageToken: null,
			})
		).toBe(false)
		expect(
			shouldExposePageBridge({
				href: 'https://other.indofun.com/',
				extensionToken: 'extension-token',
				pageToken: null,
			})
		).toBe(false)
	})

	it('keeps token pairing for non-trusted pages', () => {
		expect(
			shouldExposePageBridge({
				href: 'https://example.com/',
				extensionToken: 'extension-token',
				pageToken: 'extension-token',
			})
		).toBe(true)
		expect(
			shouldExposePageBridge({
				href: 'https://example.com/',
				extensionToken: 'extension-token',
				pageToken: '',
			})
		).toBe(false)
	})
})

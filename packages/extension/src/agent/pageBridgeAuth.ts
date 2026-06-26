const TRUSTED_AIGC_HOSTS = new Set(['localhost:4800', '127.0.0.1:4800'])
const TRUSTED_AIGC_DOMAIN = 'indofun.ai'

export function isTrustedIndofunAigcOrigin(href: string): boolean {
	try {
		const url = new URL(href)
		if (!['http:', 'https:'].includes(url.protocol)) return false
		if (url.hostname === TRUSTED_AIGC_DOMAIN || url.hostname.endsWith(`.${TRUSTED_AIGC_DOMAIN}`)) {
			return true
		}
		return TRUSTED_AIGC_HOSTS.has(url.host)
	} catch {
		return false
	}
}

export function shouldExposePageBridge({
	href,
	extensionToken,
	pageToken,
}: {
	href: string
	extensionToken: string | null | undefined
	pageToken: string | null | undefined
}): boolean {
	if (isTrustedIndofunAigcOrigin(href)) return true
	if (!extensionToken || !pageToken) return false
	return pageToken === extensionToken
}

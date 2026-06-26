#!/usr/bin/env node
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const DEFAULT_ENV_FILE = '/Users/indofun/Developer/indofun-aigc-v1.8/integration/.env'
const DEFAULT_OUTPUT_DIR = path.join(repoRoot, 'packages/extension/.output')
const DEFAULT_PREFIX = 'page-agent/releases/chrome'
const DEFAULT_LATEST_NAME = 'indofun-aigc-assistant-latest-chrome.zip'

export function publicCosUrl({ bucket, region, key }) {
	const encodedKey = String(key || '')
		.trim()
		.split('/')
		.filter(Boolean)
		.map((part) => encodeURIComponent(part))
		.join('/')
	if (!bucket || !region || !encodedKey) return ''
	return `https://${bucket}.cos.${region}.myqcloud.com/${encodedKey}`
}

export function findLatestExtensionZip(outputDir = DEFAULT_OUTPUT_DIR) {
	const entries = fs
		.readdirSync(outputDir, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => path.join(outputDir, entry.name))
		.filter((item) => /indofun-aigc-assistant-.+-chrome\.zip$/.test(path.basename(item)))
		.map((item) => ({ path: item, mtimeMs: fs.statSync(item).mtimeMs }))
		.sort((a, b) => b.mtimeMs - a.mtimeMs)
	if (!entries.length) {
		throw new Error(`No chrome extension zip found in ${outputDir}`)
	}
	return entries[0].path
}

export function createUploadPlan({
	zipPath,
	bucket,
	region,
	prefix = DEFAULT_PREFIX,
	latestKey,
} = {}) {
	if (!zipPath) throw new Error('zipPath is required')
	if (!bucket) throw new Error('COS_BUCKET is required')
	if (!region) throw new Error('COS_REGION is required')
	const versionedName = path.basename(zipPath)
	const cleanPrefix = String(prefix || DEFAULT_PREFIX).replace(/^\/+|\/+$/g, '')
	const safeLatestKey = latestKey || `${cleanPrefix}/${DEFAULT_LATEST_NAME}`
	const versionedKey = `${cleanPrefix}/${versionedName}`
	return {
		zipPath,
		bucket,
		region,
		versionedKey,
		latestKey: safeLatestKey,
		versionedUrl: publicCosUrl({ bucket, region, key: versionedKey }),
		latestUrl: publicCosUrl({ bucket, region, key: safeLatestKey }),
	}
}

export async function uploadPlannedObjects({ cos, plan }) {
	if (!cos || typeof cos.putObject !== 'function') throw new Error('COS client is required')
	const body = fs.readFileSync(plan.zipPath)
	const fileName = path.basename(plan.zipPath)
	const common = {
		Bucket: plan.bucket,
		Region: plan.region,
		Body: body,
		ContentType: 'application/zip',
		ContentDisposition: `attachment; filename="${fileName}"`,
	}
	for (const Key of [plan.versionedKey, plan.latestKey]) {
		await new Promise((resolve, reject) => {
			cos.putObject(
				{
					...common,
					Key,
					CacheControl: Key === plan.latestKey ? 'no-cache' : 'public, max-age=31536000, immutable',
				},
				(error, data) => (error ? reject(error) : resolve(data))
			)
		})
	}
	return {
		bucket: plan.bucket,
		region: plan.region,
		versionedKey: plan.versionedKey,
		latestKey: plan.latestKey,
		versionedUrl: plan.versionedUrl,
		latestUrl: plan.latestUrl,
		sizeBytes: body.length,
	}
}

function parseArgs(argv) {
	const args = { optional: false, dryRun: false }
	for (let index = 0; index < argv.length; index += 1) {
		const item = argv[index]
		if (item === '--optional') args.optional = true
		else if (item === '--dry-run') args.dryRun = true
		else if (item === '--env-file') args.envFile = argv[++index]
		else if (item === '--output-dir') args.outputDir = argv[++index]
		else if (item === '--zip') args.zipPath = argv[++index]
	}
	return args
}

function loadEnvFile(envFile) {
	const resolved = path.resolve(envFile)
	if (!fs.existsSync(resolved)) return {}
	return dotenv.parse(fs.readFileSync(resolved, 'utf8'))
}

async function createCosClient() {
	const mod = await import('cos-nodejs-sdk-v5')
	const COS = mod.default || mod
	return new COS({
		SecretId: process.env.COS_SECRET_ID,
		SecretKey: process.env.COS_SECRET_KEY,
	})
}

async function main() {
	const args = parseArgs(process.argv.slice(2))
	const envFile =
		args.envFile ||
		process.env.PAGE_AGENT_COS_ENV_FILE ||
		(fs.existsSync(DEFAULT_ENV_FILE) ? DEFAULT_ENV_FILE : path.join(repoRoot, '.env'))
	Object.assign(process.env, loadEnvFile(envFile), process.env)

	const bucket = process.env.COS_BUCKET
	const region = process.env.COS_REGION || 'ap-guangzhou'
	const prefix = process.env.PAGE_AGENT_EXTENSION_COS_PREFIX || DEFAULT_PREFIX
	const latestKey = process.env.PAGE_AGENT_EXTENSION_PACKAGE_KEY
	const missing = ['COS_SECRET_ID', 'COS_SECRET_KEY', 'COS_BUCKET'].filter(
		(key) => !process.env[key]
	)
	if (missing.length) {
		const message = `Skip COS upload: missing ${missing.join(', ')}`
		if (args.optional) {
			console.log(message)
			return
		}
		throw new Error(message)
	}

	const zipPath = args.zipPath || findLatestExtensionZip(args.outputDir || DEFAULT_OUTPUT_DIR)
	const plan = createUploadPlan({ zipPath, bucket, region, prefix, latestKey })
	if (args.dryRun) {
		console.log(JSON.stringify(plan, null, 2))
		return
	}

	const cos = await createCosClient()
	const result = await uploadPlannedObjects({ cos, plan })
	const outputPath = path.join(DEFAULT_OUTPUT_DIR, 'latest-extension-upload.json')
	fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`)
	console.log(`Uploaded extension zip to COS: ${result.latestUrl}`)
	console.log(`Versioned object: ${result.versionedKey}`)
	console.log(`Latest object: ${result.latestKey}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(error.message)
		process.exitCode = 1
	})
}

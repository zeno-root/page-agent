import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
	createUploadPlan,
	findLatestExtensionZip,
	publicCosUrl,
	uploadPlannedObjects,
} from './upload-extension-cos.mjs'

test('findLatestExtensionZip picks the newest chrome extension zip', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'page-agent-ext-'))
	const older = path.join(dir, 'indofun-aigc-assistant-1.9.0-chrome.zip')
	const newer = path.join(dir, 'indofun-aigc-assistant-1.10.0-chrome.zip')
	fs.writeFileSync(older, 'older')
	fs.writeFileSync(newer, 'newer')
	fs.utimesSync(older, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'))
	fs.utimesSync(newer, new Date('2026-01-02T00:00:00Z'), new Date('2026-01-02T00:00:00Z'))

	assert.equal(findLatestExtensionZip(dir), newer)
})

test('createUploadPlan builds stable latest and versioned COS objects', () => {
	const plan = createUploadPlan({
		zipPath: '/tmp/indofun-aigc-assistant-1.10.0-chrome.zip',
		bucket: 'ai-vault-guangzhou-1329603410',
		region: 'ap-guangzhou',
		prefix: 'page-agent/releases/chrome',
	})

	assert.equal(
		plan.latestKey,
		'page-agent/releases/chrome/indofun-aigc-assistant-latest-chrome.zip'
	)
	assert.equal(
		plan.versionedKey,
		'page-agent/releases/chrome/indofun-aigc-assistant-1.10.0-chrome.zip'
	)
	assert.equal(
		plan.latestUrl,
		'https://ai-vault-guangzhou-1329603410.cos.ap-guangzhou.myqcloud.com/page-agent/releases/chrome/indofun-aigc-assistant-latest-chrome.zip'
	)
})

test('uploadPlannedObjects uploads versioned and latest zip objects', async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'page-agent-upload-'))
	const zipPath = path.join(dir, 'indofun-aigc-assistant-1.10.0-chrome.zip')
	fs.writeFileSync(zipPath, 'zip-bytes')
	const plan = createUploadPlan({
		zipPath,
		bucket: 'ai-vault-guangzhou-1329603410',
		region: 'ap-guangzhou',
		prefix: 'page-agent/releases/chrome',
	})
	const uploads = []
	const cos = {
		putObject(options, callback) {
			uploads.push(options)
			callback(null, { statusCode: 200 })
		},
	}

	await uploadPlannedObjects({ cos, plan })

	assert.deepEqual(
		uploads.map((item) => item.Key),
		[plan.versionedKey, plan.latestKey]
	)
	assert.equal(uploads[0].ContentType, 'application/zip')
	assert.match(uploads[0].ContentDisposition, /attachment/)
	assert.equal(Buffer.isBuffer(uploads[0].Body), true)
})

test('publicCosUrl encodes unsafe path segments', () => {
	assert.equal(
		publicCosUrl({
			bucket: 'bucket-123',
			region: 'ap-guangzhou',
			key: 'page agent/releases/latest chrome.zip',
		}),
		'https://bucket-123.cos.ap-guangzhou.myqcloud.com/page%20agent/releases/latest%20chrome.zip'
	)
})

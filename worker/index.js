import {
  DEFAULT_PORTFOLIO,
  isSafeMediaOrLinkUrl,
  normalizePortfolioData,
} from '../src/data/defaultPortfolio.js'

const SESSION_COOKIE_NAME = 'sji_admin_session'
const SESSION_TTL_SECONDS = 60 * 60 * 12 // 12 hours
const MAX_LOGIN_FAILS = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000
const MAX_MEDIA_CHUNK_BYTES = 256 * 1024 // 256 KB per D1 BLOB chunk
const MAX_MEDIA_FILE_BYTES = 25 * 1024 * 1024 // 25 MB max per uploaded file
const MAX_PORTFOLIO_JSON_BYTES = 512 * 1024 // 512 KB sanity cap

const ALLOWED_MEDIA_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/pdf',
])

const schemaReadyByDb = new WeakSet()

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ...extraHeaders,
    },
  })
}

export function normalizeRoutePath(value) {
  if (typeof value !== 'string') return '/admin'
  let trimmed = value.trim()
  if (!trimmed) return '/admin'
  if (!trimmed.startsWith('/')) trimmed = `/${trimmed}`
  if (trimmed.length > 1) {
    trimmed = trimmed.replace(/\/+$/, '')
  }
  return trimmed
}

function base64UrlEncode(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < arr.length; i += chunk) {
    binary += String.fromCharCode(...arr.subarray(i, i + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') +
    '==='.slice((str.length + 3) % 4)
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

function constantTimeEqual(aBytes, bBytes) {
  if (!(aBytes instanceof Uint8Array) || !(bBytes instanceof Uint8Array)) {
    return false
  }
  if (aBytes.length !== bBytes.length || aBytes.length === 0) {
    return false
  }
  let diff = 0
  for (let i = 0; i < aBytes.length; i += 1) {
    diff |= aBytes[i] ^ bBytes[i]
  }
  return diff === 0
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  )
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') {
    return false
  }
  const parts = storedHash.trim().split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') {
    return false
  }
  const iterations = Number(parts[1])
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 100000) {
    return false
  }
  let salt
  let expected
  try {
    salt = base64UrlDecode(parts[2])
    expected = base64UrlDecode(parts[3])
  } catch {
    return false
  }
  if (salt.length < 8 || expected.length < 16) {
    return false
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    expected.length * 8
  )

  return constantTimeEqual(new Uint8Array(derived), expected)
}

async function ensureDatabaseReady(db) {
  if (!db) return false
  if (schemaReadyByDb.has(db)) return true

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS portfolio_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    )
    .run()

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS media_files (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        chunk_count INTEGER NOT NULL,
        chunk_size INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL
      )`
    )
    .run()

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS media_chunks (
        media_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        data BLOB NOT NULL,
        PRIMARY KEY (media_id, chunk_index)
      )`
    )
    .run()

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS internal_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    )
    .run()

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS login_attempts (
        ip_hash TEXT PRIMARY KEY,
        fail_count INTEGER NOT NULL,
        first_fail_at INTEGER NOT NULL,
        locked_until INTEGER NOT NULL
      )`
    )
    .run()

  const existing = await db
    .prepare('SELECT id FROM portfolio_state WHERE id = 1')
    .first()
  if (!existing) {
    const now = new Date().toISOString()
    await db
      .prepare(
        'INSERT OR IGNORE INTO portfolio_state (id, data_json, updated_at) VALUES (1, ?, ?)'
      )
      .bind(JSON.stringify(DEFAULT_PORTFOLIO), now)
      .run()
  }

  schemaReadyByDb.add(db)
  return true
}

async function getSessionSecret(env) {
  if (typeof env.SESSION_SECRET === 'string' && env.SESSION_SECRET.trim().length >= 16) {
    return env.SESSION_SECRET.trim()
  }
  if (!env.DB) {
    return null
  }
  await ensureDatabaseReady(env.DB)
  const row = await env.DB.prepare(
    'SELECT value FROM internal_config WHERE key = ?'
  )
    .bind('session_secret')
    .first()
  if (row?.value) {
    return row.value
  }
  const generatedBytes = new Uint8Array(32)
  crypto.getRandomValues(generatedBytes)
  const generated = base64UrlEncode(generatedBytes)
  const now = new Date().toISOString()
  await env.DB.prepare(
    'INSERT OR IGNORE INTO internal_config (key, value, updated_at) VALUES (?, ?, ?)'
  )
    .bind('session_secret', generated, now)
    .run()
  const finalRow = await env.DB.prepare(
    'SELECT value FROM internal_config WHERE key = ?'
  )
    .bind('session_secret')
    .first()
  return finalRow?.value || generated
}

async function signSessionToken(payloadObj, secret) {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payloadObj))
  const payloadB64 = base64UrlEncode(payloadBytes)
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payloadB64)
  )
  return `${payloadB64}.${base64UrlEncode(new Uint8Array(sig))}`
}

async function verifySessionToken(token, secret) {
  if (!token || !secret || typeof token !== 'string') return null
  const dotIdx = token.indexOf('.')
  if (dotIdx <= 0) return null
  const payloadB64 = token.slice(0, dotIdx)
  const sigB64 = token.slice(dotIdx + 1)

  let providedSig
  try {
    providedSig = base64UrlDecode(sigB64)
  } catch {
    return null
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const expectedSig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  )

  if (!constantTimeEqual(providedSig, expectedSig)) {
    return null
  }

  try {
    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64))
    const parsed = JSON.parse(payloadJson)
    if (!parsed || typeof parsed.exp !== 'number' || Date.now() > parsed.exp) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function parseCookies(cookieHeader) {
  const map = {}
  if (!cookieHeader) return map
  cookieHeader.split(';').forEach((part) => {
    const idx = part.indexOf('=')
    if (idx === -1) return
    const key = part.slice(0, idx).trim()
    const val = part.slice(idx + 1).trim()
    if (key) map[key] = val
  })
  return map
}

function buildCookieHeader(request, token, maxAgeSeconds) {
  const isHttps = new URL(request.url).protocol === 'https:'
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ]
  if (isHttps) {
    parts.push('Secure')
  }
  return parts.join('; ')
}

function assertSameOrigin(request) {
  const url = new URL(request.url)
  const origin = request.headers.get('Origin')
  if (origin && origin !== url.origin) {
    return false
  }
  const referer = request.headers.get('Referer')
  if (!origin && referer) {
    try {
      if (new URL(referer).origin !== url.origin) {
        return false
      }
    } catch {
      return false
    }
  }
  return true
}

async function getAuthenticatedSession(request, env) {
  if (!env.ADMIN_PASSWORD_HASH || !env.ADMIN_PASSWORD_HASH.trim()) {
    return null
  }
  const secret = await getSessionSecret(env)
  if (!secret) return null
  const cookies = parseCookies(request.headers.get('Cookie'))
  const token = cookies[SESSION_COOKIE_NAME]
  const payload = await verifySessionToken(token, secret)
  if (!payload) return null
  // Bind token to current password hash fingerprint so rotating ADMIN_PASSWORD_HASH invalidates all active sessions
  const expectedFingerprint = (await sha256Hex(env.ADMIN_PASSWORD_HASH.trim())).slice(0, 16)
  if (payload.ph !== expectedFingerprint) {
    return null
  }
  return payload
}

async function getClientIpHash(request, secret) {
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'local'
  return sha256Hex(`${ip}:${secret || 'sji-rate-limit'}`)
}

async function checkRateLimit(db, ipHash) {
  if (!db) return { blocked: false, retryAfterSec: 0 }
  const now = Date.now()
  const row = await db
    .prepare(
      'SELECT fail_count, first_fail_at, locked_until FROM login_attempts WHERE ip_hash = ?'
    )
    .bind(ipHash)
    .first()
  if (!row) return { blocked: false, retryAfterSec: 0 }
  if (row.locked_until && now < row.locked_until) {
    return {
      blocked: true,
      retryAfterSec: Math.max(1, Math.ceil((row.locked_until - now) / 1000)),
    }
  }
  return { blocked: false, retryAfterSec: 0 }
}

async function recordLoginFailure(db, ipHash) {
  if (!db) return
  const now = Date.now()
  const row = await db
    .prepare(
      'SELECT fail_count, first_fail_at, locked_until FROM login_attempts WHERE ip_hash = ?'
    )
    .bind(ipHash)
    .first()

  let failCount = 1
  let firstFailAt = now
  if (row && now - row.first_fail_at <= LOGIN_WINDOW_MS) {
    failCount = row.fail_count + 1
    firstFailAt = row.first_fail_at
  }
  const lockedUntil = failCount >= MAX_LOGIN_FAILS ? now + LOGIN_LOCKOUT_MS : 0

  await db
    .prepare(
      `INSERT INTO login_attempts (ip_hash, fail_count, first_fail_at, locked_until)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(ip_hash) DO UPDATE SET
         fail_count = excluded.fail_count,
         first_fail_at = excluded.first_fail_at,
         locked_until = excluded.locked_until`
    )
    .bind(ipHash, failCount, firstFailAt, lockedUntil)
    .run()
}

async function clearLoginFailures(db, ipHash) {
  if (!db) return
  await db
    .prepare('DELETE FROM login_attempts WHERE ip_hash = ?')
    .bind(ipHash)
    .run()
}

function validatePortfolioUrls(data) {
  const check = (value, allowMailto = false) => {
    if (!isSafeMediaOrLinkUrl(value, allowMailto)) {
      throw new Error(`Unsafe URL protocol detected: ${value}`)
    }
  }

  check(data.hero?.primaryCta?.href || '', true)
  check(data.hero?.secondaryCta?.href || '', true)
  check(data.about?.image?.src || '', false)

  for (const link of data.site?.navLinks || []) {
    check(link.href || '', false)
  }
  for (const project of data.projects || []) {
    check(project.liveUrl || '', false)
    if (project.logo?.src) check(project.logo.src, false)
  }
  for (const media of data.training?.media || []) {
    check(media.src || '', false)
  }
  for (const cred of data.credentials || []) {
    if (cred.attachment?.src) check(cred.attachment.src, false)
  }
  for (const extra of data.extras || []) {
    check(extra.liveUrl || '', false)
    check(extra.ctaHref || '', true)
    if (extra.logo?.src) check(extra.logo.src, false)
  }
  for (const action of data.contact?.actions || []) {
    check(action.href || '', true)
  }
}

async function readPortfolioFromDb(env) {
  if (!env.DB) {
    return {
      data: DEFAULT_PORTFOLIO,
      updatedAt: null,
      storage: 'fallback',
    }
  }
  await ensureDatabaseReady(env.DB)
  const row = await env.DB.prepare(
    'SELECT data_json, updated_at FROM portfolio_state WHERE id = 1'
  ).first()

  if (!row?.data_json) {
    return {
      data: DEFAULT_PORTFOLIO,
      updatedAt: null,
      storage: 'd1',
    }
  }

  try {
    const parsed = JSON.parse(row.data_json)
    return {
      data: normalizePortfolioData(parsed),
      updatedAt: row.updated_at,
      storage: 'd1',
    }
  } catch {
    return {
      data: DEFAULT_PORTFOLIO,
      updatedAt: row.updated_at || null,
      storage: 'd1',
    }
  }
}

function sanitizeFilename(name) {
  const base = String(name || 'upload')
    .split(/[/\\]/)
    .pop()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
  return base || 'upload'
}

function parseByteRange(rangeHeader, totalBytes) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
    return null
  }
  const spec = rangeHeader.slice('bytes='.length).split(',')[0].trim()
  const dashIdx = spec.indexOf('-')
  if (dashIdx === -1) return null

  const startStr = spec.slice(0, dashIdx).trim()
  const endStr = spec.slice(dashIdx + 1).trim()

  let start
  let end
  if (startStr === '') {
    const suffix = Number(endStr)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, totalBytes - suffix)
    end = totalBytes - 1
  } else {
    start = Number(startStr)
    end = endStr === '' ? totalBytes - 1 : Number(endStr)
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= totalBytes
  ) {
    return { invalid: true }
  }

  return {
    invalid: false,
    start,
    end: Math.min(end, totalBytes - 1),
  }
}

async function handleServeMedia(request, env, mediaId) {
  if (!env.DB) {
    return new Response('Storage unavailable', { status: 503 })
  }
  await ensureDatabaseReady(env.DB)

  const file = await env.DB.prepare(
    `SELECT id, filename, mime_type, byte_size, chunk_count, chunk_size, status
     FROM media_files WHERE id = ?`
  )
    .bind(mediaId)
    .first()

  if (!file || file.status !== 'ready') {
    return new Response('Media not found', { status: 404 })
  }

  const totalBytes = Number(file.byte_size)
  const chunkSize = Number(file.chunk_size) || MAX_MEDIA_CHUNK_BYTES
  const etag = `"${file.id}-${totalBytes}"`

  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }

  const headers = {
    'Content-Type': file.mime_type || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  }

  if (file.mime_type === 'image/svg+xml') {
    headers['Content-Security-Policy'] = "default-src 'none'; sandbox"
  }

  const rangeHeader = request.headers.get('Range')
  const parsedRange = parseByteRange(rangeHeader, totalBytes)

  if (parsedRange?.invalid) {
    return new Response('Range Not Satisfiable', {
      status: 416,
      headers: {
        'Content-Range': `bytes */${totalBytes}`,
      },
    })
  }

  const startByte = parsedRange ? parsedRange.start : 0
  const endByte = parsedRange ? parsedRange.end : Math.max(0, totalBytes - 1)
  const contentLength = totalBytes === 0 ? 0 : endByte - startByte + 1

  headers['Content-Length'] = String(contentLength)
  if (parsedRange) {
    headers['Content-Range'] = `bytes ${startByte}-${endByte}/${totalBytes}`
  }

  if (request.method === 'HEAD') {
    return new Response(null, {
      status: parsedRange ? 206 : 200,
      headers,
    })
  }

  const firstChunk = totalBytes === 0 ? 0 : Math.floor(startByte / chunkSize)
  const lastChunk = totalBytes === 0 ? -1 : Math.floor(endByte / chunkSize)
  let currentChunk = firstChunk

  const stream = new ReadableStream({
    async pull(controller) {
      if (currentChunk > lastChunk) {
        controller.close()
        return
      }
      const row = await env.DB.prepare(
        'SELECT data FROM media_chunks WHERE media_id = ? AND chunk_index = ?'
      )
        .bind(mediaId, currentChunk)
        .first()

      if (!row?.data) {
        controller.error(new Error('Missing media chunk'))
        return
      }

      const rawBytes =
        row.data instanceof Uint8Array
          ? row.data
          : new Uint8Array(row.data)

      const chunkGlobalStart = currentChunk * chunkSize
      const sliceStart = Math.max(0, startByte - chunkGlobalStart)
      const sliceEnd = Math.min(rawBytes.length, endByte - chunkGlobalStart + 1)

      if (sliceEnd > sliceStart) {
        controller.enqueue(rawBytes.subarray(sliceStart, sliceEnd))
      }

      currentChunk += 1
      if (currentChunk > lastChunk) {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: parsedRange ? 206 : 200,
    headers,
  })
}

async function handleApi(request, env, url) {
  const path = url.pathname

  if (path === '/api/health' && request.method === 'GET') {
    return jsonResponse({
      ok: true,
      storageAvailable: Boolean(env.DB),
      authConfigured: Boolean(env.ADMIN_PASSWORD_HASH?.trim()),
    })
  }

  if (path === '/api/portal-check' && request.method === 'GET') {
    const requestedPath = normalizeRoutePath(url.searchParams.get('path') || '/')
    const adminPath = normalizeRoutePath(env.ADMIN_PATH || '/admin')
    return jsonResponse({
      isAdminRoute: requestedPath === adminPath,
    })
  }

  if (path === '/api/portfolio' && request.method === 'GET') {
    const result = await readPortfolioFromDb(env)
    return jsonResponse(result)
  }

  if (path === '/api/admin/session' && request.method === 'GET') {
    const configured = Boolean(env.ADMIN_PASSWORD_HASH?.trim())
    const storageAvailable = Boolean(env.DB)
    const session = await getAuthenticatedSession(request, env)
    let mediaCount = 0
    let mediaBytes = 0

    if (session && env.DB) {
      await ensureDatabaseReady(env.DB)
      const stats = await env.DB.prepare(
        "SELECT COUNT(*) AS count, COALESCE(SUM(byte_size), 0) AS total_bytes FROM media_files WHERE status = 'ready'"
      ).first()
      mediaCount = Number(stats?.count || 0)
      mediaBytes = Number(stats?.total_bytes || 0)
    }

    return jsonResponse({
      authenticated: Boolean(session),
      configured,
      storageAvailable,
      customAdminPath: Boolean(env.ADMIN_PATH?.trim()),
      mediaCount,
      mediaBytes,
      maxMediaBytesPerFile: MAX_MEDIA_FILE_BYTES,
    })
  }

  if (path === '/api/admin/login' && request.method === 'POST') {
    if (!assertSameOrigin(request)) {
      return jsonResponse({ error: 'Invalid request origin.' }, 403)
    }
    if (!env.ADMIN_PASSWORD_HASH || !env.ADMIN_PASSWORD_HASH.trim()) {
      return jsonResponse(
        {
          error:
            'Admin password secret (ADMIN_PASSWORD_HASH) is not configured yet on Cloudflare.',
        },
        503
      )
    }
    if (!env.DB) {
      return jsonResponse(
        { error: 'Cloudflare D1 database binding (DB) is not available.' },
        503
      )
    }

    await ensureDatabaseReady(env.DB)
    const secret = await getSessionSecret(env)
    const ipHash = await getClientIpHash(request, secret)
    const limitState = await checkRateLimit(env.DB, ipHash)
    if (limitState.blocked) {
      return jsonResponse(
        {
          error: `Too many failed attempts. Try again in ${limitState.retryAfterSec} seconds.`,
          retryAfterSec: limitState.retryAfterSec,
        },
        429,
        { 'Retry-After': String(limitState.retryAfterSec) }
      )
    }

    let body
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ error: 'Invalid request payload.' }, 400)
    }

    const password = typeof body?.password === 'string' ? body.password : ''
    const valid = await verifyPassword(password, env.ADMIN_PASSWORD_HASH)
    if (!valid) {
      await recordLoginFailure(env.DB, ipHash)
      return jsonResponse({ error: 'Invalid admin password.' }, 401)
    }

    await clearLoginFailures(env.DB, ipHash)
    const fingerprint = (await sha256Hex(env.ADMIN_PASSWORD_HASH.trim())).slice(0, 16)
    const token = await signSessionToken(
      {
        sub: 'admin',
        ph: fingerprint,
        iat: Date.now(),
        exp: Date.now() + SESSION_TTL_SECONDS * 1000,
      },
      secret
    )

    return jsonResponse(
      { ok: true, authenticated: true },
      200,
      {
        'Set-Cookie': buildCookieHeader(request, token, SESSION_TTL_SECONDS),
      }
    )
  }

  if (path === '/api/admin/logout' && request.method === 'POST') {
    if (!assertSameOrigin(request)) {
      return jsonResponse({ error: 'Invalid request origin.' }, 403)
    }
    return jsonResponse(
      { ok: true, authenticated: false },
      200,
      {
        'Set-Cookie': buildCookieHeader(request, '', 0),
      }
    )
  }

  // All routes below require authenticated admin session
  const session = await getAuthenticatedSession(request, env)
  if (!session) {
    return jsonResponse({ error: 'Authentication required.' }, 401)
  }

  if (request.method !== 'GET' && !assertSameOrigin(request)) {
    return jsonResponse({ error: 'Invalid request origin.' }, 403)
  }

  if (!env.DB) {
    return jsonResponse(
      { error: 'Cloudflare D1 database binding (DB) is missing.' },
      503
    )
  }
  await ensureDatabaseReady(env.DB)

  if (path === '/api/admin/portfolio' && request.method === 'GET') {
    const result = await readPortfolioFromDb(env)
    return jsonResponse(result)
  }

  if (path === '/api/admin/portfolio' && request.method === 'PUT') {
    const rawText = await request.text()
    if (rawText.length > MAX_PORTFOLIO_JSON_BYTES) {
      return jsonResponse({ error: 'Portfolio payload exceeds 512 KB limit.' }, 413)
    }

    let parsed
    try {
      parsed = JSON.parse(rawText)
    } catch {
      return jsonResponse({ error: 'Invalid JSON payload.' }, 400)
    }

    const candidate = parsed?.data ? parsed.data : parsed
    const normalized = normalizePortfolioData(candidate)

    try {
      validatePortfolioUrls(normalized)
    } catch (error) {
      return jsonResponse({ error: error.message }, 400)
    }

    const now = new Date().toISOString()
    await env.DB.prepare(
      `INSERT INTO portfolio_state (id, data_json, updated_at)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         data_json = excluded.data_json,
         updated_at = excluded.updated_at`
    )
      .bind(JSON.stringify(normalized), now)
      .run()

    return jsonResponse({
      ok: true,
      data: normalized,
      updatedAt: now,
      storage: 'd1',
    })
  }

  if (path === '/api/admin/portfolio/reset' && request.method === 'POST') {
    const now = new Date().toISOString()
    await env.DB.prepare(
      `INSERT INTO portfolio_state (id, data_json, updated_at)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         data_json = excluded.data_json,
         updated_at = excluded.updated_at`
    )
      .bind(JSON.stringify(DEFAULT_PORTFOLIO), now)
      .run()

    return jsonResponse({
      ok: true,
      data: DEFAULT_PORTFOLIO,
      updatedAt: now,
      storage: 'd1',
    })
  }

  if (path === '/api/admin/media' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT id, filename, mime_type, byte_size, created_at
       FROM media_files
       WHERE status = 'ready'
       ORDER BY created_at DESC`
    ).all()

    const files = (results || []).map((row) => ({
      id: row.id,
      filename: row.filename,
      mimeType: row.mime_type,
      byteSize: Number(row.byte_size),
      createdAt: row.created_at,
      url: `/media/${row.id}/${encodeURIComponent(row.filename)}`,
    }))
    const totalBytes = files.reduce((sum, f) => sum + f.byteSize, 0)
    return jsonResponse({ files, totalBytes })
  }

  if (path === '/api/admin/media/init' && request.method === 'POST') {
    let body
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON payload.' }, 400)
    }

    const filename = sanitizeFilename(body?.filename)
    const mimeType = String(body?.mimeType || '').toLowerCase().trim()
    const byteSize = Number(body?.byteSize)

    if (!ALLOWED_MEDIA_MIME.has(mimeType)) {
      return jsonResponse(
        { error: `Unsupported file type: ${mimeType || 'unknown'}` },
        400
      )
    }
    if (!Number.isInteger(byteSize) || byteSize <= 0 || byteSize > MAX_MEDIA_FILE_BYTES) {
      return jsonResponse(
        {
          error: `File size must be between 1 byte and ${Math.round(MAX_MEDIA_FILE_BYTES / (1024 * 1024))} MB.`,
        },
        400
      )
    }

    // Clean stale aborted uploads older than 2 hours
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    await env.DB.prepare(
      "DELETE FROM media_chunks WHERE media_id IN (SELECT id FROM media_files WHERE status = 'pending' AND created_at < ?)"
    )
      .bind(cutoff)
      .run()
    await env.DB.prepare(
      "DELETE FROM media_files WHERE status = 'pending' AND created_at < ?"
    )
      .bind(cutoff)
      .run()

    const id = crypto.randomUUID().replace(/-/g, '')
    const chunkCount = Math.ceil(byteSize / MAX_MEDIA_CHUNK_BYTES)
    const now = new Date().toISOString()

    await env.DB.prepare(
      `INSERT INTO media_files (id, filename, mime_type, byte_size, chunk_count, chunk_size, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
      .bind(id, filename, mimeType, byteSize, chunkCount, MAX_MEDIA_CHUNK_BYTES, now)
      .run()

    return jsonResponse({
      id,
      filename,
      mimeType,
      byteSize,
      chunkCount,
      chunkSize: MAX_MEDIA_CHUNK_BYTES,
    })
  }

  const chunkMatch = path.match(/^\/api\/admin\/media\/([a-zA-Z0-9-]+)\/chunk\/(\d+)$/)
  if (chunkMatch && request.method === 'PUT') {
    const [, mediaId, indexStr] = chunkMatch
    const chunkIndex = Number(indexStr)

    const file = await env.DB.prepare(
      'SELECT id, chunk_count, status FROM media_files WHERE id = ?'
    )
      .bind(mediaId)
      .first()

    if (!file || file.status !== 'pending') {
      return jsonResponse({ error: 'Upload session not found.' }, 404)
    }
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= file.chunk_count) {
      return jsonResponse({ error: 'Invalid chunk index.' }, 400)
    }

    const buffer = await request.arrayBuffer()
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_MEDIA_CHUNK_BYTES) {
      return jsonResponse({ error: 'Invalid chunk payload size.' }, 400)
    }

    await env.DB.prepare(
      `INSERT INTO media_chunks (media_id, chunk_index, data)
       VALUES (?, ?, ?)
       ON CONFLICT(media_id, chunk_index) DO UPDATE SET data = excluded.data`
    )
      .bind(mediaId, chunkIndex, buffer)
      .run()

    return jsonResponse({ ok: true, chunkIndex })
  }

  const completeMatch = path.match(/^\/api\/admin\/media\/([a-zA-Z0-9-]+)\/complete$/)
  if (completeMatch && request.method === 'POST') {
    const mediaId = completeMatch[1]
    const file = await env.DB.prepare(
      'SELECT id, filename, mime_type, byte_size, chunk_count, created_at, status FROM media_files WHERE id = ?'
    )
      .bind(mediaId)
      .first()

    if (!file) {
      return jsonResponse({ error: 'Media record not found.' }, 404)
    }

    const countRow = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM media_chunks WHERE media_id = ?'
    )
      .bind(mediaId)
      .first()

    if (Number(countRow?.count || 0) !== Number(file.chunk_count)) {
      return jsonResponse({ error: 'Upload is missing one or more chunks.' }, 400)
    }

    await env.DB.prepare("UPDATE media_files SET status = 'ready' WHERE id = ?")
      .bind(mediaId)
      .run()

    return jsonResponse({
      ok: true,
      file: {
        id: file.id,
        filename: file.filename,
        mimeType: file.mime_type,
        byteSize: Number(file.byte_size),
        createdAt: file.created_at,
        url: `/media/${file.id}/${encodeURIComponent(file.filename)}`,
      },
    })
  }

  const deleteMatch = path.match(/^\/api\/admin\/media\/([a-zA-Z0-9-]+)$/)
  if (deleteMatch && request.method === 'DELETE') {
    const mediaId = deleteMatch[1]
    await env.DB.prepare('DELETE FROM media_chunks WHERE media_id = ?')
      .bind(mediaId)
      .run()
    await env.DB.prepare('DELETE FROM media_files WHERE id = ?')
      .bind(mediaId)
      .run()
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: 'API route not found.' }, 404)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url)
      } catch (error) {
        return jsonResponse(
          { error: error?.message || 'Internal worker error.' },
          500
        )
      }
    }

    if (url.pathname.startsWith('/media/') && (request.method === 'GET' || request.method === 'HEAD')) {
      const segment = url.pathname.slice('/media/'.length).split('/')[0]
      if (segment && /^[a-zA-Z0-9-]+$/.test(segment)) {
        return handleServeMedia(request, env, segment)
      }
      return new Response('Media not found', { status: 404 })
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request)
    }

    return new Response('Assets binding not configured.', { status: 404 })
  },
}

import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { PortfolioPage } from '../src/components/PortfolioPage.jsx'
import {
  DEFAULT_PORTFOLIO,
  isSafeMediaOrLinkUrl,
  normalizePortfolioData,
  parseProjectHttpUrl,
} from '../src/data/defaultPortfolio.js'
import {
  MAX_OWNER_REPLY_LENGTH,
  MAX_PROFILES_PER_REVIEW,
  MAX_RELATIONSHIP_LENGTH,
  MAX_REVIEWER_NAME_LENGTH,
  MAX_REVIEWER_ROLE_LENGTH,
  MAX_REVIEW_COMMENT_LENGTH,
  MIN_REVIEW_COMMENT_LENGTH,
  REVIEW_EDIT_WINDOW_MS,
  cleanPathSegments,
  computeReviewsSummary,
  isDisallowedHostname,
  isPlaceholderOrMissingAvatar,
  normalizeProfileLinks,
} from '../src/data/reviewsMeta.js'
import {
  buildJsonLdGraph,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  resolveCanonicalOrigin,
  resolveSeoMetadata,
  serializeJsonForHtml,
} from '../src/seo/portfolioSeo.js'

const SESSION_COOKIE_NAME = 'sji_admin_session'
const SESSION_TTL_SECONDS = 60 * 60 * 12 // 12 hours
const MAX_LOGIN_FAILS = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000
const MAX_MEDIA_CHUNK_BYTES = 256 * 1024 // 256 KB per D1 BLOB chunk
const MAX_MEDIA_FILE_BYTES = 25 * 1024 * 1024 // 25 MB max per uploaded file
const MAX_PORTFOLIO_JSON_BYTES = 512 * 1024 // 512 KB sanity cap
const MAX_REVIEW_BODY_BYTES = 320 * 1024 // 320 KB sanity cap (supports optional compressed avatar photo)
const REVIEW_MIN_FILL_MS = 2000 // Reject automated sub-2s form blasts
const REVIEW_CHALLENGE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours
const REVIEW_COOLDOWN_MS = 45 * 1000 // 45s between reviews per IP
const REVIEW_RATE_WINDOW_MS = 60 * 60 * 1000 // 1 hour window
const MAX_REVIEWS_PER_WINDOW = 4
const DEFAULT_REVIEWS_SETTINGS = {
  moderationMode: 'auto',
  publicSubmissionsEnabled: true,
}

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

function constantTimeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) {
    return false
  }
  const encoder = new TextEncoder()
  return constantTimeEqual(encoder.encode(a), encoder.encode(b))
}

function bytesToBase64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < arr.length; i += chunk) {
    binary += String.fromCharCode(...arr.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function sha256BytesHex(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const digest = await crypto.subtle.digest('SHA-256', arr)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Hex(text) {
  return sha256BytesHex(new TextEncoder().encode(text))
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

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        target_title TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        reviewer_name TEXT NOT NULL,
        reviewer_role TEXT NOT NULL DEFAULT '',
        relationship TEXT NOT NULL DEFAULT '',
        comment TEXT NOT NULL,
        profiles_json TEXT NOT NULL DEFAULT '[]',
        avatar_url TEXT NOT NULL DEFAULT '',
        avatar_checked_at TEXT NOT NULL DEFAULT '',
        edit_token_hash TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'approved',
        verified INTEGER NOT NULL DEFAULT 0,
        verified_label TEXT NOT NULL DEFAULT '',
        featured INTEGER NOT NULL DEFAULT 0,
        owner_reply TEXT NOT NULL DEFAULT '',
        owner_reply_at TEXT NOT NULL DEFAULT '',
        invite_id TEXT NOT NULL DEFAULT '',
        challenge_nonce TEXT NOT NULL DEFAULT '',
        ip_hash TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    )
    .run()

  await db
    .prepare(
      'CREATE INDEX IF NOT EXISTS idx_reviews_status_created ON reviews (status, created_at DESC)'
    )
    .run()

  await db
    .prepare(
      'CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews (target_type, target_id, status)'
    )
    .run()

  await db
    .prepare(
      'CREATE INDEX IF NOT EXISTS idx_reviews_nonce ON reviews (challenge_nonce)'
    )
    .run()

  try {
    await db
      .prepare(
        "ALTER TABLE reviews ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''"
      )
      .run()
  } catch {
    // Column already exists
  }

  try {
    await db
      .prepare(
        "ALTER TABLE reviews ADD COLUMN edit_token_hash TEXT NOT NULL DEFAULT ''"
      )
      .run()
  } catch {
    // Column already exists
  }

  try {
    await db
      .prepare(
        "ALTER TABLE reviews ADD COLUMN avatar_checked_at TEXT NOT NULL DEFAULT ''"
      )
      .run()
  } catch {
    // Column already exists
  }

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS review_invites (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        label TEXT NOT NULL DEFAULT 'Verified Collaborator',
        target_type TEXT NOT NULL DEFAULT '',
        target_id TEXT NOT NULL DEFAULT '',
        max_uses INTEGER NOT NULL DEFAULT 1,
        use_count INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        expires_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )`
    )
    .run()

  await db
    .prepare(
      'CREATE INDEX IF NOT EXISTS idx_review_invites_code ON review_invites (code)'
    )
    .run()

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS review_rate_limits (
        ip_hash TEXT PRIMARY KEY,
        submission_count INTEGER NOT NULL,
        window_start INTEGER NOT NULL,
        last_submitted_at INTEGER NOT NULL
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

function cleanSingleLine(value, maxLen) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

function cleanMultiline(value, maxLen) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLen)
}

function parseJsonArraySafe(raw) {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const AVATAR_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const ALLOWED_AVATAR_MIME_RE = /^image\/(jpeg|jpg|png|webp|gif|avif)\b/i
const GITHUB_RESERVED_PATHS = new Set([
  'about',
  'account',
  'collections',
  'contact',
  'customer-stories',
  'enterprise',
  'events',
  'explore',
  'features',
  'gist',
  'issues',
  'join',
  'login',
  'logout',
  'marketplace',
  'new',
  'notifications',
  'organizations',
  'orgs',
  'pricing',
  'pulls',
  'readme',
  'search',
  'security',
  'settings',
  'signup',
  'site',
  'sponsors',
  'team',
  'topics',
  'trending',
])

function serializePublicReview(row, options = {}) {
  const viewerIpHash = options?.viewerIpHash || ''
  const createdMs = Date.parse(row.created_at)
  const editExpiresAtMs = Number.isFinite(createdMs)
    ? createdMs + REVIEW_EDIT_WINDOW_MS
    : 0
  const withinWindow = editExpiresAtMs > Date.now()
  const canManage = Boolean(
    withinWindow &&
      viewerIpHash &&
      row.ip_hash &&
      constantTimeStringEqual(row.ip_hash, viewerIpHash)
  )

  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetTitle: row.target_title,
    rating: Number(row.rating),
    reviewerName: row.reviewer_name,
    reviewerRole: row.reviewer_role || '',
    relationship: row.relationship || '',
    comment: row.comment,
    profiles: parseJsonArraySafe(row.profiles_json),
    avatarUrl: row.avatar_url || '',
    verified: Boolean(row.verified),
    verifiedLabel: row.verified_label || (row.verified ? 'Verified Collaborator' : ''),
    featured: Boolean(row.featured),
    ownerReply: row.owner_reply || '',
    ownerReplyAt: row.owner_reply_at || '',
    createdAt: row.created_at,
    canManage,
    editExpiresAt: canManage ? new Date(editExpiresAtMs).toISOString() : '',
  }
}

async function readHtmlHeadChunk(response, maxBytes = 160 * 1024) {
  const reader = response.body?.getReader()
  if (!reader) {
    const full = await response.text()
    return full.slice(0, maxBytes)
  }
  const decoder = new TextDecoder()
  let accumulated = ''
  let totalBytes = 0
  try {
    while (totalBytes < maxBytes) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        totalBytes += value.byteLength
        accumulated += decoder.decode(value, { stream: true })
        const lower = accumulated.toLowerCase()
        if (
          lower.includes('</head>') &&
          (lower.includes('og:image') || lower.includes('twitter:image'))
        ) {
          break
        }
      }
    }
  } finally {
    try {
      await reader.cancel()
    } catch {
      // ignore cancel errors
    }
  }
  return accumulated
}

const AVATAR_RESOLVER_VERSION = 'v2'

const SOCIAL_PREVIEW_UAS = [
  'Twitterbot/1.0',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'WhatsApp/2.23.20.0',
  AVATAR_USER_AGENT,
]

const INLINE_EXPIRING_PLATFORMS = new Set([
  'linkedin',
  'instagram',
  'threads',
  'tiktok',
  'facebook',
  'telegram',
])

function detectAvatarPlatformFromHost(cleanHost, explicitPlatform = '') {
  if (cleanHost === 'github.com' || cleanHost.endsWith('.github.com')) return 'github'
  if (cleanHost === 'linkedin.com' || cleanHost.endsWith('.linkedin.com')) return 'linkedin'
  if (
    cleanHost === 'x.com' ||
    cleanHost === 'twitter.com' ||
    cleanHost.endsWith('.twitter.com')
  ) {
    return 'x'
  }
  if (cleanHost === 'instagram.com' || cleanHost.endsWith('.instagram.com')) return 'instagram'
  if (cleanHost === 'facebook.com' || cleanHost === 'm.facebook.com' || cleanHost === 'fb.com') {
    return 'facebook'
  }
  if (cleanHost === 'tiktok.com' || cleanHost.endsWith('.tiktok.com')) return 'tiktok'
  if (cleanHost === 'threads.net' || cleanHost === 'threads.com') return 'threads'
  if (cleanHost === 'youtube.com' || cleanHost === 'm.youtube.com' || cleanHost === 'youtu.be') {
    return 'youtube'
  }
  if (cleanHost === 'bsky.app') return 'bluesky'
  if (cleanHost === 't.me' || cleanHost === 'telegram.me') return 'telegram'
  if (cleanHost === 'medium.com' || cleanHost.endsWith('.medium.com')) return 'medium'
  if (cleanHost === 'twitch.tv' || cleanHost.endsWith('.twitch.tv')) return 'twitch'
  if (cleanHost === 'reddit.com' || cleanHost.endsWith('.reddit.com')) return 'reddit'
  if (cleanHost === 'gitlab.com') return 'gitlab'
  if (cleanHost === 'dev.to') return 'devto'
  if (cleanHost === 'pinterest.com' || cleanHost.endsWith('.pinterest.com')) return 'pinterest'
  if (cleanHost === 'dribbble.com') return 'dribbble'
  if (cleanHost === 'substack.com' || cleanHost.endsWith('.substack.com')) return 'substack'
  if (cleanHost === 'soundcloud.com') return 'soundcloud'
  return explicitPlatform || 'website'
}

function isLikelyGitHubIdenticonPng(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 28) return false
  // Check PNG signature (89 50 4E 47 0D 0A 1A 0A)
  if (
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return false
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  // GitHub generated identicons are 420x420 2-color block PNGs (~2-8 KB);
  // real uploaded PNG avatars on GitHub are resized to 460x460 or are much larger.
  return width === 420 && height === 420 && bytes.byteLength < 12000
}

async function fetchVerifiedImage(
  imageUrl,
  platform = '',
  { inlineIfSmall = false, maxInlineBytes = 160 * 1024 } = {}
) {
  // Generic pre-fetch check (platform-specific host check runs on finalUrl AFTER redirects)
  if (!imageUrl || isPlaceholderOrMissingAvatar(imageUrl)) return null
  let parsed
  try {
    parsed = new URL(imageUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (isDisallowedHostname(parsed.hostname)) return null

  try {
    const res = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': AVATAR_USER_AGENT,
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
      },
      signal: AbortSignal.timeout(4500),
    })
    if (!res.ok) return null
    const finalUrl = res.url || parsed.toString()
    if (isPlaceholderOrMissingAvatar(finalUrl, platform)) return null

    const contentType = (res.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase()
    if (!ALLOWED_AVATAR_MIME_RE.test(contentType)) return null

    const contentLengthHeader = Number(res.headers.get('content-length') || 0)
    // If we don't need to inline and the image is large (> 256 KB), accept the verified URL without buffering megabytes
    if (!inlineIfSmall && contentLengthHeader > 256 * 1024) {
      try {
        await res.body?.cancel()
      } catch {
        // ignore
      }
      return { url: finalUrl, bytes: null, contentType }
    }

    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength < 300) return null

    if (inlineIfSmall && buf.byteLength <= maxInlineBytes) {
      return {
        url: `data:${contentType};base64,${bytesToBase64(buf)}`,
        bytes: buf,
        contentType,
      }
    }
    return { url: finalUrl, bytes: buf, contentType }
  } catch {
    return null
  }
}

function extractMetaImageCandidates(html, baseOrigin) {
  const candidates = []
  const patterns = [
    /<meta\s+[^>]*property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/i,
    /<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image:secure_url["']/i,
    /<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    /<meta\s+[^>]*name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
    /<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i,
    /<meta\s+[^>]*property=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
    /<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']twitter:image(?::src)?["']/i,
    /"image"\s*:\s*\{[^}]*"contentUrl"\s*:\s*"([^"]+)"/i,
    /"avatar(?:Larger|Medium)"\s*:\s*"([^"]+)"/i,
  ]

  const seen = new Set()
  for (const regex of patterns) {
    const match = html.match(regex)
    if (!match?.[1]) continue
    let raw = match[1]
      .replace(/&amp;/g, '&')
      .replace(/\\u002F/gi, '/')
      .replace(/\\\//g, '/')
      .trim()
    if (!raw) continue
    try {
      if (raw.startsWith('//')) {
        raw = `https:${raw}`
      } else if (raw.startsWith('/')) {
        raw = new URL(raw, baseOrigin).toString()
      }
      if (!seen.has(raw)) {
        seen.add(raw)
        candidates.push(raw)
      }
    } catch {
      // ignore malformed URL
    }
  }
  return candidates
}

async function resolveGitHubAvatar(username) {
  const cleanUser = String(username || '').replace(/^@/, '').trim()
  if (!cleanUser || GITHUB_RESERVED_PATHS.has(cleanUser.toLowerCase())) return ''
  try {
    // Fetch user avatar and their generated identicon in parallel to detect accounts with no custom profile photo
    const avatarUrl = `https://github.com/${encodeURIComponent(cleanUser)}.png`
    const identiconUrl = `https://github.com/identicons/${encodeURIComponent(cleanUser)}.png`
    const [avatarInfo, identiconRes] = await Promise.all([
      fetchVerifiedImage(avatarUrl, 'github', { inlineIfSmall: false }),
      fetch(identiconUrl, {
        redirect: 'follow',
        headers: { 'User-Agent': AVATAR_USER_AGENT },
        signal: AbortSignal.timeout(3500),
      }).catch(() => null),
    ])

    if (!avatarInfo?.url) return ''

    if (avatarInfo.bytes) {
      if (isLikelyGitHubIdenticonPng(avatarInfo.bytes)) {
        return ''
      }
      if (identiconRes?.ok) {
        const identBytes = new Uint8Array(await identiconRes.arrayBuffer())
        if (identBytes.byteLength === avatarInfo.bytes.byteLength) {
          const [avatarHash, identHash] = await Promise.all([
            sha256BytesHex(avatarInfo.bytes),
            sha256BytesHex(identBytes),
          ])
          if (avatarHash === identHash) {
            return ''
          }
        }
      }
    }

    // Request a crisp, lightweight 200px size variant from GitHub's avatar CDN
    try {
      const u = new URL(avatarInfo.url)
      u.searchParams.set('s', '200')
      return u.toString()
    } catch {
      return avatarInfo.url
    }
  } catch {
    return ''
  }
}

async function resolveViaUnavatar(provider, handle, platform) {
  const cleanHandle = String(handle || '').replace(/^@/, '').trim()
  if (!cleanHandle) return ''
  const inlineExpiringCdn = INLINE_EXPIRING_PLATFORMS.has(platform)
  const jsonUrl = `https://unavatar.io/${encodeURIComponent(provider)}/${encodeURIComponent(cleanHandle)}?json&fallback=false`
  try {
    const res = await fetch(jsonUrl, {
      headers: { 'User-Agent': AVATAR_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return ''
    const data = await res.json().catch(() => null)
    let candidate = typeof data?.url === 'string' ? data.url.trim() : ''
    if (!candidate) return ''
    if (platform === 'x') {
      candidate = candidate.replace(/_normal(\.[a-z]+)$/i, '_200x200$1')
    }
    if (isPlaceholderOrMissingAvatar(candidate, platform)) return ''

    const verified = await fetchVerifiedImage(candidate, platform, {
      inlineIfSmall: inlineExpiringCdn,
    })
    if (verified?.url) return verified.url

    // Secondary fallback: fetch the already-validated image bytes through unavatar directly if CDN blocks Worker IP
    if (inlineExpiringCdn) {
      const directUrl = `https://unavatar.io/${encodeURIComponent(provider)}/${encodeURIComponent(cleanHandle)}?fallback=false`
      const directRes = await fetch(directUrl, {
        headers: {
          'User-Agent': AVATAR_USER_AGENT,
          Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(5000),
      })
      if (directRes.ok) {
        const contentType = (directRes.headers.get('content-type') || '')
          .split(';')[0]
          .trim()
          .toLowerCase()
        if (ALLOWED_AVATAR_MIME_RE.test(contentType)) {
          const buf = new Uint8Array(await directRes.arrayBuffer())
          if (buf.byteLength >= 300 && buf.byteLength <= 160 * 1024) {
            return `data:${contentType};base64,${bytesToBase64(buf)}`
          }
        }
      }
    }
  } catch {
    // Graceful fallback to HTML crawler
  }
  return ''
}

async function resolveXAvatar(handle) {
  const cleanHandle = String(handle || '').replace(/^@/, '').trim()
  if (!cleanHandle) return ''
  const viaUnavatar = await resolveViaUnavatar('x', cleanHandle, 'x')
  if (viaUnavatar) return viaUnavatar
  try {
    const res = await fetch(
      `https://api.fxtwitter.com/${encodeURIComponent(cleanHandle)}`,
      {
        headers: {
          'User-Agent': AVATAR_USER_AGENT,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(4000),
      }
    )
    if (!res.ok) return ''
    const data = await res.json().catch(() => null)
    let candidate = data?.user?.avatar_url || ''
    if (!candidate || isPlaceholderOrMissingAvatar(candidate, 'x')) return ''
    candidate = candidate.replace(/_normal(\.[a-z]+)$/i, '_200x200$1')
    const verified = await fetchVerifiedImage(candidate, 'x', {
      inlineIfSmall: false,
    })
    return verified?.url || ''
  } catch {
    return ''
  }
}

async function resolveBlueskyAvatar(actor) {
  const cleanActor = String(actor || '').replace(/^@/, '').trim()
  if (!cleanActor) return ''
  try {
    const res = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(cleanActor)}`,
      {
        headers: { 'User-Agent': AVATAR_USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(4000),
      }
    )
    if (!res.ok) return ''
    const data = await res.json().catch(() => null)
    const candidate = data?.avatar || ''
    if (!candidate || isPlaceholderOrMissingAvatar(candidate, 'bluesky')) return ''
    const verified = await fetchVerifiedImage(candidate, 'bluesky', {
      inlineIfSmall: false,
    })
    return verified?.url || ''
  } catch {
    return ''
  }
}

async function resolveGitLabAvatar(username) {
  const cleanUser = String(username || '').replace(/^@/, '').trim()
  if (!cleanUser) return ''
  try {
    const res = await fetch(
      `https://gitlab.com/api/v4/users?username=${encodeURIComponent(cleanUser)}`,
      {
        headers: { 'User-Agent': AVATAR_USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(4000),
      }
    )
    if (!res.ok) return ''
    const users = await res.json().catch(() => null)
    let candidate = Array.isArray(users) ? users[0]?.avatar_url || '' : ''
    if (!candidate) return ''
    // For Gravatar URLs, force d=404 so accounts without a custom Gravatar return 404 instead of an identicon
    try {
      const u = new URL(candidate)
      if (u.hostname.includes('gravatar.com')) {
        u.searchParams.set('d', '404')
        u.searchParams.set('s', '200')
        candidate = u.toString()
      }
    } catch {
      // ignore
    }
    const verified = await fetchVerifiedImage(candidate, 'gitlab', {
      inlineIfSmall: false,
    })
    return verified?.url || ''
  } catch {
    return ''
  }
}

async function resolveDevtoAvatar(username) {
  const cleanUser = String(username || '').replace(/^@/, '').trim()
  if (!cleanUser) return ''
  try {
    const res = await fetch(
      `https://dev.to/api/users/by_username?url=${encodeURIComponent(cleanUser)}`,
      {
        headers: { 'User-Agent': AVATAR_USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(4000),
      }
    )
    if (!res.ok) return ''
    const data = await res.json().catch(() => null)
    const candidate = data?.profile_image || ''
    if (!candidate || isPlaceholderOrMissingAvatar(candidate, 'devto')) return ''
    const verified = await fetchVerifiedImage(candidate, 'devto', {
      inlineIfSmall: false,
    })
    return verified?.url || ''
  } catch {
    return ''
  }
}

async function resolveRedditAvatar(username) {
  const cleanUser = String(username || '').replace(/^@/, '').trim()
  if (!cleanUser) return ''
  try {
    const res = await fetch(
      `https://unavatar.io/reddit/${encodeURIComponent(cleanUser)}?json&fallback=false`,
      {
        headers: { 'User-Agent': AVATAR_USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(4000),
      }
    )
    if (!res.ok) return ''
    const data = await res.json().catch(() => null)
    const candidate = data?.url || ''
    if (!candidate || isPlaceholderOrMissingAvatar(candidate, 'reddit')) return ''
    const verified = await fetchVerifiedImage(candidate, 'reddit', {
      inlineIfSmall: false,
    })
    return verified?.url || ''
  } catch {
    return ''
  }
}

async function resolveHtmlProfileAvatar(parsed, platform) {
  const inlineExpiringCdn = INLINE_EXPIRING_PLATFORMS.has(platform)
  // Social platforms serve full OG profile metadata to link-preview crawlers (Twitterbot, FacebookBot, WhatsApp)
  // while blocking generic browser UAs from datacenter IPs (e.g. LinkedIn HTTP 999).
  const userAgents =
    platform === 'website'
      ? [AVATAR_USER_AGENT, SOCIAL_PREVIEW_UAS[0]]
      : SOCIAL_PREVIEW_UAS

  for (const ua of userAgents) {
    try {
      const pageRes = await fetch(parsed.toString(), {
        headers: {
          'User-Agent': ua,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(4500),
      })
      if (!pageRes.ok) continue

      const htmlChunk = await readHtmlHeadChunk(pageRes, 160 * 1024)
      const candidates = extractMetaImageCandidates(htmlChunk, parsed.origin)
      if (candidates.length === 0) continue

      for (const candidate of candidates) {
        if (isPlaceholderOrMissingAvatar(candidate, platform)) continue
        const verified = await fetchVerifiedImage(candidate, platform, {
          inlineIfSmall: inlineExpiringCdn,
        })
        if (verified?.url) {
          return verified.url
        }
      }
      // If we got HTTP 200 and parsed metadata candidates, all of which were placeholders (no photo), don't retry more UAs
      return ''
    } catch {
      // try next User-Agent
    }
  }
  return ''
}

async function resolveAvatarFromProfileUrl(profileUrl, explicitPlatform = '') {
  if (!profileUrl || typeof profileUrl !== 'string') return ''
  try {
    const parsed = new URL(profileUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    if (isDisallowedHostname(parsed.hostname)) return ''

    const cleanHost = parsed.hostname.replace(/^www\./i, '').toLowerCase()
    const segments = cleanPathSegments(parsed.pathname)
    const platform = detectAvatarPlatformFromHost(cleanHost, explicitPlatform)

    if (platform === 'github') {
      if (!segments[0]) return ''
      return await resolveGitHubAvatar(segments[0])
    }
    if (platform === 'x') {
      if (!segments[0]) return ''
      return await resolveXAvatar(segments[0])
    }
    if (platform === 'linkedin') {
      const slug =
        (segments[0] === 'in' || segments[0] === 'company') && segments[1]
          ? segments[1]
          : segments[0]
      if (slug) {
        const viaUnavatar = await resolveViaUnavatar('linkedin', slug, 'linkedin')
        if (viaUnavatar) return viaUnavatar
      }
      return await resolveHtmlProfileAvatar(parsed, 'linkedin')
    }
    if (platform === 'youtube') {
      const handle = segments[0]?.startsWith('@')
        ? segments[0].slice(1)
        : (segments[0] === 'c' || segments[0] === 'user') && segments[1]
          ? segments[1]
          : ''
      if (handle) {
        const viaUnavatar = await resolveViaUnavatar('youtube', handle, 'youtube')
        if (viaUnavatar) return viaUnavatar
      }
      return await resolveHtmlProfileAvatar(parsed, 'youtube')
    }
    if (platform === 'tiktok') {
      const handle = segments[0] ? segments[0].replace(/^@/, '') : ''
      if (handle) {
        const viaUnavatar = await resolveViaUnavatar('tiktok', handle, 'tiktok')
        if (viaUnavatar) return viaUnavatar
      }
      return await resolveHtmlProfileAvatar(parsed, 'tiktok')
    }
    if (platform === 'telegram') {
      const handle = segments[0] ? segments[0].replace(/^@/, '') : ''
      if (handle) {
        const viaUnavatar = await resolveViaUnavatar('telegram', handle, 'telegram')
        if (viaUnavatar) return viaUnavatar
      }
      return await resolveHtmlProfileAvatar(parsed, 'telegram')
    }
    if (platform === 'twitch') {
      const handle = segments[0] ? segments[0].replace(/^@/, '') : ''
      if (handle) {
        const viaUnavatar = await resolveViaUnavatar('twitch', handle, 'twitch')
        if (viaUnavatar) return viaUnavatar
      }
      return await resolveHtmlProfileAvatar(parsed, 'twitch')
    }
    if (platform === 'dribbble') {
      const handle = segments[0] ? segments[0].replace(/^@/, '') : ''
      if (handle) {
        const viaUnavatar = await resolveViaUnavatar('dribbble', handle, 'dribbble')
        if (viaUnavatar) return viaUnavatar
      }
      return await resolveHtmlProfileAvatar(parsed, 'dribbble')
    }
    if (platform === 'substack') {
      const handle = cleanHost.endsWith('.substack.com')
        ? cleanHost.replace(/\.substack\.com$/, '')
        : segments[0]
          ? segments[0].replace(/^@/, '')
          : ''
      if (handle) {
        const viaUnavatar = await resolveViaUnavatar('substack', handle, 'substack')
        if (viaUnavatar) return viaUnavatar
      }
      return await resolveHtmlProfileAvatar(parsed, 'substack')
    }
    if (platform === 'soundcloud') {
      const handle = segments[0] ? segments[0].replace(/^@/, '') : ''
      if (handle) {
        const viaUnavatar = await resolveViaUnavatar('soundcloud', handle, 'soundcloud')
        if (viaUnavatar) return viaUnavatar
      }
      return await resolveHtmlProfileAvatar(parsed, 'soundcloud')
    }
    if (platform === 'bluesky') {
      const actor = segments[0] === 'profile' ? segments[1] : segments[0]
      if (!actor) return ''
      return await resolveBlueskyAvatar(actor)
    }
    if (platform === 'gitlab') {
      if (!segments[0]) return ''
      return await resolveGitLabAvatar(segments[0])
    }
    if (platform === 'devto') {
      if (!segments[0]) return ''
      return await resolveDevtoAvatar(segments[0])
    }
    if (platform === 'reddit') {
      const user =
        segments[0] === 'u' || segments[0] === 'user' ? segments[1] : ''
      if (!user) return ''
      return await resolveRedditAvatar(user)
    }

    return await resolveHtmlProfileAvatar(parsed, platform)
  } catch {
    // Graceful network/timeout fallback
  }
  return ''
}

async function resolveReviewerAvatar(uploadedPhoto, profiles = []) {
  if (typeof uploadedPhoto === 'string') {
    const trimmed = uploadedPhoto.trim()
    if (
      /^data:image\/(jpeg|jpg|png|webp|gif|avif);base64,/i.test(trimmed) &&
      trimmed.length <= 240 * 1024
    ) {
      return trimmed
    }
  }

  // Walk through all tagged profiles; skip any profile with no real photo so even if only the last has one, it gets used
  if (Array.isArray(profiles) && profiles.length > 0) {
    for (const entry of profiles) {
      const url = typeof entry === 'string' ? entry : entry?.url
      const platform = typeof entry === 'object' ? entry?.platform || '' : ''
      if (!url) continue
      const resolved = await resolveAvatarFromProfileUrl(url, platform)
      if (resolved) {
        return resolved
      }
    }
  }

  return ''
}

function serializeAdminReview(row) {
  return {
    ...serializePublicReview(row),
    status: row.status || 'approved',
    inviteUsed: Boolean(row.invite_id),
    updatedAt: row.updated_at || row.created_at,
  }
}

function serializeReviewInvite(row) {
  const maxUses = Number(row.max_uses || 0)
  const useCount = Number(row.use_count || 0)
  const isExpired = Boolean(row.expires_at && row.expires_at <= new Date().toISOString())
  const isExhausted = maxUses > 0 && useCount >= maxUses
  return {
    id: row.id,
    code: row.code,
    label: row.label || 'Verified Collaborator',
    targetType: row.target_type || '',
    targetId: row.target_id || '',
    maxUses,
    useCount,
    remainingUses: maxUses > 0 ? Math.max(0, maxUses - useCount) : null,
    active: Boolean(row.active) && !isExpired && !isExhausted,
    expired: isExpired,
    exhausted: isExhausted,
    expiresAt: row.expires_at || '',
    createdAt: row.created_at,
  }
}

function generateInviteCode(length = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length]
  }
  return out
}

async function getReviewsSettings(env) {
  if (!env.DB) return { ...DEFAULT_REVIEWS_SETTINGS }
  await ensureDatabaseReady(env.DB)
  const row = await env.DB.prepare(
    'SELECT value FROM internal_config WHERE key = ?'
  )
    .bind('reviews_settings')
    .first()
  if (!row?.value) {
    return { ...DEFAULT_REVIEWS_SETTINGS }
  }
  try {
    const parsed = JSON.parse(row.value)
    return {
      moderationMode: parsed?.moderationMode === 'manual' ? 'manual' : 'auto',
      publicSubmissionsEnabled: parsed?.publicSubmissionsEnabled !== false,
    }
  } catch {
    return { ...DEFAULT_REVIEWS_SETTINGS }
  }
}

async function saveReviewsSettings(env, nextSettings) {
  const normalized = {
    moderationMode: nextSettings?.moderationMode === 'manual' ? 'manual' : 'auto',
    publicSubmissionsEnabled: nextSettings?.publicSubmissionsEnabled !== false,
  }
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO internal_config (key, value, updated_at)
     VALUES ('reviews_settings', ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`
  )
    .bind(JSON.stringify(normalized), now)
    .run()
  return normalized
}

async function readApprovedReviewsAndSummary(db, viewerIpHash = '') {
  if (!db) {
    return {
      reviews: [],
      summary: computeReviewsSummary([]),
    }
  }
  await ensureDatabaseReady(db)
  const { results } = await db
    .prepare(
      `SELECT id, target_type, target_id, target_title, rating,
              reviewer_name, reviewer_role, relationship, comment,
              profiles_json, avatar_url, avatar_checked_at, verified,
              verified_label, featured, owner_reply, owner_reply_at,
              ip_hash, created_at
       FROM reviews
       WHERE status = 'approved'
       ORDER BY featured DESC, created_at DESC
       LIMIT 200`
    )
    .all()

  const rows = results || []

  // Lazily backfill avatars ONCE per resolver version for reviews that have tagged profiles but no stored avatar
  const versionPrefix = `${AVATAR_RESOLVER_VERSION}:`
  const uncheckedRows = rows
    .filter((row) => {
      if (row.avatar_url) return false
      if (String(row.avatar_checked_at || '').startsWith(versionPrefix)) {
        return false
      }
      return parseJsonArraySafe(row.profiles_json).length > 0
    })
    .slice(0, 5)

  if (uncheckedRows.length > 0) {
    const checkedStamp = `${versionPrefix}${new Date().toISOString()}`
    await Promise.all(
      uncheckedRows.map(async (row) => {
        try {
          const profiles = parseJsonArraySafe(row.profiles_json)
          const resolved = await resolveReviewerAvatar('', profiles)
          row.avatar_url = resolved || ''
          row.avatar_checked_at = checkedStamp
          await db
            .prepare(
              'UPDATE reviews SET avatar_url = ?, avatar_checked_at = ? WHERE id = ?'
            )
            .bind(row.avatar_url, checkedStamp, row.id)
            .run()
        } catch {
          // Never fail review feed if a profile fetch fails
        }
      })
    )
  }

  const reviews = rows.map((row) =>
    serializePublicReview(row, { viewerIpHash })
  )
  return {
    reviews,
    summary: computeReviewsSummary(reviews),
  }
}

async function issueReviewChallenge(secret) {
  if (!secret) return null
  return signSessionToken(
    {
      typ: 'review-challenge',
      iat: Date.now(),
      exp: Date.now() + REVIEW_CHALLENGE_TTL_MS,
      nonce: crypto.randomUUID(),
    },
    secret
  )
}

async function verifyReviewChallenge(token, secret) {
  if (!secret || !token) {
    return { ok: false, reason: 'missing' }
  }
  const payload = await verifySessionToken(token, secret)
  if (!payload || payload.typ !== 'review-challenge' || typeof payload.iat !== 'number' || !payload.nonce) {
    return { ok: false, reason: 'invalid' }
  }
  if (Date.now() - payload.iat < REVIEW_MIN_FILL_MS) {
    return { ok: false, reason: 'too-fast' }
  }
  return { ok: true, nonce: String(payload.nonce) }
}

async function checkReviewRateLimit(db, ipHash) {
  if (!db || !ipHash) return { blocked: false, retryAfterSec: 0 }
  const row = await db
    .prepare(
      'SELECT submission_count, window_start, last_submitted_at FROM review_rate_limits WHERE ip_hash = ?'
    )
    .bind(ipHash)
    .first()
  if (!row) return { blocked: false, retryAfterSec: 0 }

  const now = Date.now()
  const cooldownRemainingMs = REVIEW_COOLDOWN_MS - (now - Number(row.last_submitted_at || 0))
  if (cooldownRemainingMs > 0) {
    return {
      blocked: true,
      reason: 'cooldown',
      retryAfterSec: Math.max(1, Math.ceil(cooldownRemainingMs / 1000)),
    }
  }

  const windowElapsed = now - Number(row.window_start || 0)
  if (windowElapsed <= REVIEW_RATE_WINDOW_MS && Number(row.submission_count || 0) >= MAX_REVIEWS_PER_WINDOW) {
    return {
      blocked: true,
      reason: 'window',
      retryAfterSec: Math.max(1, Math.ceil((REVIEW_RATE_WINDOW_MS - windowElapsed) / 1000)),
    }
  }

  return { blocked: false, retryAfterSec: 0 }
}

async function recordReviewSubmission(db, ipHash) {
  if (!db || !ipHash) return
  const now = Date.now()
  const row = await db
    .prepare(
      'SELECT submission_count, window_start FROM review_rate_limits WHERE ip_hash = ?'
    )
    .bind(ipHash)
    .first()

  let submissionCount = 1
  let windowStart = now
  if (row && now - Number(row.window_start || 0) <= REVIEW_RATE_WINDOW_MS) {
    submissionCount = Number(row.submission_count || 0) + 1
    windowStart = Number(row.window_start || now)
  }

  await db
    .prepare(
      `INSERT INTO review_rate_limits (ip_hash, submission_count, window_start, last_submitted_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(ip_hash) DO UPDATE SET
         submission_count = excluded.submission_count,
         window_start = excluded.window_start,
         last_submitted_at = excluded.last_submitted_at`
    )
    .bind(ipHash, submissionCount, windowStart, now)
    .run()
}

async function verifyTurnstileIfConfigured(env, token, remoteIp) {
  const siteKey = env.TURNSTILE_SITE_KEY?.trim()
  const secretKey = env.TURNSTILE_SECRET_KEY?.trim()
  if (!siteKey || !secretKey) {
    return { required: false, ok: true }
  }
  if (!token || typeof token !== 'string') {
    return { required: true, ok: false }
  }
  try {
    const formData = new FormData()
    formData.append('secret', secretKey)
    formData.append('response', token)
    if (remoteIp) formData.append('remoteip', remoteIp)

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    })
    const result = await res.json().catch(() => null)
    return { required: true, ok: Boolean(result?.success) }
  } catch {
    return { required: true, ok: false }
  }
}

async function findActiveInviteByCode(db, rawCode) {
  const normalizedCode = String(rawCode || '').trim().toUpperCase()
  if (!normalizedCode || normalizedCode.length > 32) {
    return { invite: null, reason: 'Invalid invite code.' }
  }
  const row = await db
    .prepare('SELECT * FROM review_invites WHERE UPPER(code) = ?')
    .bind(normalizedCode)
    .first()
  if (!row || !row.active) {
    return { invite: null, reason: 'This invite link is inactive or no longer exists.' }
  }
  const nowIso = new Date().toISOString()
  if (row.expires_at && row.expires_at <= nowIso) {
    return { invite: null, reason: 'This invite link has expired.' }
  }
  const maxUses = Number(row.max_uses || 0)
  const useCount = Number(row.use_count || 0)
  if (maxUses > 0 && useCount >= maxUses) {
    return { invite: null, reason: 'This invite link has already been used.' }
  }
  return { invite: row, reason: '' }
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
  if (data.site?.seo?.canonicalUrl) check(data.site.seo.canonicalUrl, false)
  if (data.site?.seo?.ogImage) check(data.site.seo.ogImage, false)

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

const MAX_FAVICON_HTML_SCAN_BYTES = 64 * 1024
const MAX_FAVICON_IMAGE_BYTES = 2 * 1024 * 1024

export function isSafePublicFaviconUrl(rawUrl) {
  let parsed
  try {
    parsed = rawUrl instanceof URL ? rawUrl : new URL(String(rawUrl))
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return false
  }

  const host = parsed.hostname.toLowerCase().trim()
  if (
    !host ||
    !host.includes('.') ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.includes(':') ||
    host.startsWith('[')
  ) {
    return false
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split('.').map(Number)
    if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return false
    }
    const [a, b] = parts
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return false
    }
  }

  return true
}

export function detectValidImageMime(bytes, contentTypeHeader = '') {
  if (!(bytes instanceof Uint8Array)) return null
  if (bytes.byteLength < 4 || bytes.byteLength > MAX_FAVICON_IMAGE_BYTES) {
    return null
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png'
  }

  // ICO / CUR: 00 00 01 00 or 00 00 02 00
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    (bytes[2] === 0x01 || bytes[2] === 0x02) &&
    bytes[3] === 0x00
  ) {
    return 'image/x-icon'
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }

  // GIF: GIF87a / GIF89a
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return 'image/gif'
  }

  // WEBP: RIFF....WEBP
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }

  // BMP: BM
  if (bytes.byteLength >= 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp'
  }

  // AVIF: ....ftypavif
  if (
    bytes.byteLength >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70 &&
    bytes[8] === 0x61 &&
    bytes[9] === 0x76 &&
    bytes[10] === 0x69 &&
    bytes[11] === 0x66
  ) {
    return 'image/avif'
  }

  const headText = new TextDecoder()
    .decode(bytes.subarray(0, Math.min(bytes.byteLength, 512)))
    .replace(/^\uFEFF/, '')
    .trimStart()
    .toLowerCase()

  if (
    headText.startsWith('<!doctype html') ||
    headText.startsWith('<html') ||
    headText.startsWith('<head') ||
    headText.startsWith('<body') ||
    headText.startsWith('<script')
  ) {
    return null
  }

  if (headText.includes('<svg') && !headText.includes('<html')) {
    return 'image/svg+xml'
  }

  const normalizedCt = String(contentTypeHeader || '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  if (normalizedCt.startsWith('image/')) {
    return normalizedCt
  }

  return null
}

function decodeHtmlEntities(str = '') {
  return String(str)
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/g, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
}

function parseHtmlTagAttributes(tagHtml) {
  const attrs = {}
  const attrRegex =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  // Skip tag name itself
  attrRegex.exec(tagHtml)
  let match = attrRegex.exec(tagHtml)
  while (match) {
    const name = match[1].toLowerCase()
    const rawVal = match[2] ?? match[3] ?? match[4] ?? ''
    attrs[name] = decodeHtmlEntities(rawVal).trim()
    match = attrRegex.exec(tagHtml)
  }
  return attrs
}

function scoreIconCandidate({ rel = '', sizes = '', type = '', href = '' }) {
  const relLower = rel.toLowerCase()
  const tokens = relLower.split(/\s+/).filter(Boolean)
  const hasIconToken =
    tokens.includes('icon') ||
    tokens.includes('apple-touch-icon') ||
    tokens.includes('apple-touch-icon-precomposed') ||
    tokens.includes('fluid-icon') ||
    tokens.includes('mask-icon')

  if (!hasIconToken) return -1

  let score = 50
  if (
    tokens.includes('apple-touch-icon') ||
    tokens.includes('apple-touch-icon-precomposed')
  ) {
    score = 96
  } else if (tokens.includes('icon') && !tokens.includes('shortcut')) {
    score = 100
  } else if (tokens.includes('shortcut') && tokens.includes('icon')) {
    score = 88
  } else if (tokens.includes('fluid-icon')) {
    score = 85
  } else if (tokens.includes('mask-icon')) {
    score = 45
  }

  const typeLower = type.toLowerCase()
  const hrefLower = href.toLowerCase().split('?')[0]
  if (typeLower.includes('svg') || hrefLower.endsWith('.svg')) {
    score += 45
  } else if (
    typeLower.includes('png') ||
    typeLower.includes('webp') ||
    hrefLower.endsWith('.png') ||
    hrefLower.endsWith('.webp')
  ) {
    score += 35
  } else if (typeLower.includes('icon') || hrefLower.endsWith('.ico')) {
    score += 15
  }

  const sizesLower = sizes.toLowerCase().trim()
  if (sizesLower === 'any') {
    score += 40
  } else if (sizesLower) {
    let maxDim = 0
    for (const part of sizesLower.split(/\s+/)) {
      const dims = part.split('x').map(Number)
      if (dims.length === 2 && Number.isFinite(dims[0]) && dims[0] > maxDim) {
        maxDim = dims[0]
      }
    }
    if (maxDim >= 64 && maxDim <= 512) {
      score += 40
    } else if (maxDim >= 32 && maxDim < 64) {
      score += 25
    } else if (maxDim > 512) {
      score += 20
    } else if (maxDim > 0) {
      score += 10
    }
  }

  return score
}

export function extractIconLinksFromHtml(htmlText, baseUrl) {
  const headEndIdx = htmlText.search(/<\/head\s*>/i)
  const headSlice =
    headEndIdx !== -1 ? htmlText.slice(0, headEndIdx) : htmlText

  const scoredIcons = []
  let manifestUrl = null

  const linkRegex = /<link\b[^>]*>/gi
  let match = linkRegex.exec(headSlice)
  while (match) {
    const attrs = parseHtmlTagAttributes(match[0])
    const rel = (attrs.rel || '').toLowerCase()
    const href = (attrs.href || '').trim()

    if (href) {
      if (rel.split(/\s+/).includes('manifest') && !manifestUrl) {
        try {
          manifestUrl = new URL(href, baseUrl).href
        } catch {
          // ignore invalid manifest href
        }
      } else {
        const score = scoreIconCandidate({
          rel,
          sizes: attrs.sizes || '',
          type: attrs.type || '',
          href,
        })
        if (score >= 0) {
          if (href.startsWith('data:image/')) {
            scoredIcons.push({ href, score })
          } else {
            try {
              const resolvedHref = new URL(href, baseUrl).href
              if (isSafePublicFaviconUrl(resolvedHref)) {
                scoredIcons.push({ href: resolvedHref, score })
              }
            } catch {
              // ignore malformed icon href
            }
          }
        }
      }
    }
    match = linkRegex.exec(headSlice)
  }

  scoredIcons.sort((a, b) => b.score - a.score)
  const uniqueUrls = []
  const seen = new Set()
  for (const item of scoredIcons) {
    if (!seen.has(item.href)) {
      seen.add(item.href)
      uniqueUrls.push(item.href)
    }
  }

  return { iconUrls: uniqueUrls, manifestUrl }
}

async function readBoundedText(response, maxBytes = MAX_FAVICON_HTML_SCAN_BYTES) {
  if (!response.body) {
    const text = await response.text()
    return text.slice(0, maxBytes)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let totalBytes = 0
  let text = ''

  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read()
      if (done || !value) break
      const remaining = maxBytes - totalBytes
      const slice = value.byteLength > remaining ? value.subarray(0, remaining) : value
      totalBytes += slice.byteLength
      text += decoder.decode(slice, { stream: true })
      if (/<\/head\s*>/i.test(text)) {
        break
      }
    }
    text += decoder.decode()
  } finally {
    try {
      await reader.cancel()
    } catch {
      // ignore stream cancel errors
    }
  }

  return text
}

function decodeDataImageUri(dataUri) {
  if (typeof dataUri !== 'string' || !dataUri.startsWith('data:image/')) {
    return null
  }
  const commaIdx = dataUri.indexOf(',')
  if (commaIdx === -1) return null
  const meta = dataUri.slice(5, commaIdx)
  const payload = dataUri.slice(commaIdx + 1)
  const isBase64 = /;base64/i.test(meta)
  const declaredMime = meta.split(';')[0].trim().toLowerCase()

  try {
    let bytes
    if (isBase64) {
      const binary = atob(payload.trim())
      bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i)
      }
    } else {
      const decoded = decodeURIComponent(payload)
      bytes = new TextEncoder().encode(decoded)
    }
    const verifiedMime = detectValidImageMime(bytes, declaredMime)
    if (!verifiedMime) return null
    return { bytes, mimeType: verifiedMime }
  } catch {
    return null
  }
}

async function fetchVerifiedIconCandidate(candidateUrl) {
  if (!candidateUrl || typeof candidateUrl !== 'string') return null

  if (candidateUrl.startsWith('data:image/')) {
    return decodeDataImageUri(candidateUrl)
  }

  if (!isSafePublicFaviconUrl(candidateUrl)) {
    return null
  }

  try {
    const res = await fetch(candidateUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(3500),
      headers: {
        Accept:
          'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; chomkaTECH-PortfolioBot/1.0)',
      },
    })

    if (!res.ok) return null
    if (res.url && !isSafePublicFaviconUrl(res.url)) return null

    const contentLength = Number(res.headers.get('Content-Length') || 0)
    if (contentLength > MAX_FAVICON_IMAGE_BYTES) return null

    const buffer = await res.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const mimeType = detectValidImageMime(
      bytes,
      res.headers.get('Content-Type') || ''
    )
    if (!mimeType) return null

    return { bytes, mimeType }
  } catch {
    return null
  }
}

async function discoverSiteFaviconCandidates(targetParsed) {
  let finalOrigin = targetParsed.origin
  let finalHostname = targetParsed.hostname
  const htmlCandidates = []

  try {
    const res = await fetch(targetParsed.href, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(4000),
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; chomkaTECH-PortfolioBot/1.0)',
      },
    })

    if (res.url && isSafePublicFaviconUrl(res.url)) {
      const finalUrl = new URL(res.url)
      finalOrigin = finalUrl.origin
      finalHostname = finalUrl.hostname.toLowerCase()
    }

    const contentType = (res.headers.get('Content-Type') || '').toLowerCase()
    if (res.ok && contentType.startsWith('image/')) {
      const buffer = await res.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      const mimeType = detectValidImageMime(bytes, contentType)
      if (mimeType) {
        return {
          directImage: { bytes, mimeType },
          candidates: [],
        }
      }
    }

    if (
      res.ok &&
      (contentType.includes('text/html') ||
        contentType.includes('application/xhtml+xml'))
    ) {
      const htmlSlice = await readBoundedText(res, MAX_FAVICON_HTML_SCAN_BYTES)
      const baseUrl = res.url && isSafePublicFaviconUrl(res.url) ? res.url : targetParsed.href
      const { iconUrls, manifestUrl } = extractIconLinksFromHtml(
        htmlSlice,
        baseUrl
      )
      htmlCandidates.push(...iconUrls)

      if (htmlCandidates.length === 0 && manifestUrl && isSafePublicFaviconUrl(manifestUrl)) {
        try {
          const manifestRes = await fetch(manifestUrl, {
            method: 'GET',
            redirect: 'follow',
            signal: AbortSignal.timeout(2500),
            headers: { Accept: 'application/manifest+json,application/json,*/*' },
          })
          if (manifestRes.ok) {
            const manifestText = await readBoundedText(manifestRes, 64 * 1024)
            const manifest = JSON.parse(manifestText)
            if (Array.isArray(manifest?.icons)) {
              const scored = manifest.icons
                .filter((icon) => icon && typeof icon.src === 'string' && icon.src.trim())
                .map((icon) => ({
                  src: icon.src.trim(),
                  score: scoreIconCandidate({
                    rel: 'icon',
                    sizes: icon.sizes || '',
                    type: icon.type || '',
                    href: icon.src,
                  }),
                }))
                .sort((a, b) => b.score - a.score)

              for (const item of scored) {
                try {
                  const resolved = new URL(item.src, manifestRes.url || manifestUrl).href
                  if (isSafePublicFaviconUrl(resolved)) {
                    htmlCandidates.push(resolved)
                  }
                } catch {
                  // ignore invalid manifest icon src
                }
              }
            }
          }
        } catch {
          // ignore manifest fetch failures
        }
      }
    }
  } catch {
    // Fall back to origin + public favicon resolvers if HTML fetch fails
  }

  const originsToTry =
    finalOrigin !== targetParsed.origin
      ? [finalOrigin, targetParsed.origin]
      : [finalOrigin]

  const allCandidates = [...htmlCandidates]
  for (const origin of originsToTry) {
    allCandidates.push(
      `${origin}/favicon.svg`,
      `${origin}/favicon.png`,
      `${origin}/apple-touch-icon.png`,
      `${origin}/favicon.ico`
    )
  }

  allCandidates.push(
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(finalHostname)}.ico`,
    `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(finalOrigin)}`
  )

  const deduplicated = []
  const seen = new Set()
  for (const candidate of allCandidates) {
    if (!seen.has(candidate)) {
      seen.add(candidate)
      deduplicated.push(candidate)
    }
  }

  return {
    directImage: null,
    candidates: deduplicated,
  }
}

async function handleFaviconProxy(request, url) {
  const rawTarget = (url.searchParams.get('url') || '').trim()
  const targetParsed = parseProjectHttpUrl(rawTarget)
  if (!targetParsed || !isSafePublicFaviconUrl(targetParsed.href)) {
    return jsonResponse(
      { error: 'Please provide a valid public http(s) URL.' },
      400
    )
  }

  const cacheKeyUrl = new URL('/api/favicon', url.origin)
  cacheKeyUrl.searchParams.set('url', targetParsed.href)
  const cacheKey = new Request(cacheKeyUrl.href, { method: 'GET' })
  const edgeCache =
    typeof caches !== 'undefined' && caches?.default ? caches.default : null

  if (edgeCache) {
    try {
      const cached = await edgeCache.match(cacheKey)
      if (cached) {
        if (request.method === 'HEAD') {
          return new Response(null, {
            status: cached.status,
            headers: cached.headers,
          })
        }
        return cached
      }
    } catch {
      // ignore cache read error
    }
  }

  const { directImage, candidates } =
    await discoverSiteFaviconCandidates(targetParsed)

  let verified = directImage
  if (!verified) {
    for (const candidateUrl of candidates) {
      verified = await fetchVerifiedIconCandidate(candidateUrl)
      if (verified) break
    }
  }

  if (!verified) {
    return new Response('Favicon not found', {
      status: 404,
      headers: {
        'Cache-Control': 'public, max-age=600',
        'X-Robots-Tag': 'noindex',
      },
    })
  }

  const headers = {
    'Content-Type': verified.mimeType,
    'Content-Length': String(verified.bytes.byteLength),
    'Cache-Control':
      'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800',
    'X-Content-Type-Options': 'nosniff',
  }

  if (verified.mimeType === 'image/svg+xml') {
    headers['Content-Security-Policy'] =
      "default-src 'none'; style-src 'unsafe-inline'; sandbox"
  }

  const fullResponse = new Response(verified.bytes, {
    status: 200,
    headers,
  })

  if (edgeCache) {
    try {
      await edgeCache.put(cacheKey, fullResponse.clone())
    } catch {
      // ignore cache put error
    }
  }

  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers })
  }

  return fullResponse
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

  if (
    path === '/api/favicon' &&
    (request.method === 'GET' || request.method === 'HEAD')
  ) {
    return handleFaviconProxy(request, url)
  }

  if (path === '/api/reviews' && request.method === 'GET') {
    if (!env.DB) {
      return jsonResponse({
        reviews: [],
        summary: computeReviewsSummary([]),
        settings: DEFAULT_REVIEWS_SETTINGS,
        challengeToken: null,
        turnstileSiteKey: null,
        storageAvailable: false,
      })
    }

    await ensureDatabaseReady(env.DB)
    const secret = await getSessionSecret(env)
    const viewerIpHash = await getClientIpHash(request, secret)
    const [reviewPayload, settings, challengeToken] = await Promise.all([
      readApprovedReviewsAndSummary(env.DB, viewerIpHash),
      getReviewsSettings(env),
      issueReviewChallenge(secret),
    ])

    return jsonResponse({
      reviews: reviewPayload.reviews,
      summary: reviewPayload.summary,
      settings,
      challengeToken,
      turnstileSiteKey: env.TURNSTILE_SITE_KEY?.trim() || null,
      storageAvailable: true,
    })
  }

  if (path === '/api/reviews/invite' && request.method === 'GET') {
    if (!env.DB) {
      return jsonResponse({ valid: false, reason: 'Reviews database unavailable.' }, 503)
    }
    await ensureDatabaseReady(env.DB)
    const code = url.searchParams.get('code') || ''
    const { invite, reason } = await findActiveInviteByCode(env.DB, code)
    if (!invite) {
      return jsonResponse({ valid: false, reason })
    }
    const maxUses = Number(invite.max_uses || 0)
    const useCount = Number(invite.use_count || 0)
    return jsonResponse({
      valid: true,
      code: invite.code,
      label: invite.label || 'Verified Collaborator',
      targetType: invite.target_type || '',
      targetId: invite.target_id || '',
      remainingUses: maxUses > 0 ? Math.max(0, maxUses - useCount) : null,
    })
  }

  if (path === '/api/reviews' && request.method === 'POST') {
    if (!assertSameOrigin(request)) {
      return jsonResponse({ error: 'Invalid request origin.' }, 403)
    }
    if (!env.DB) {
      return jsonResponse(
        { error: 'Reviews storage is temporarily unavailable.' },
        503
      )
    }
    await ensureDatabaseReady(env.DB)

    const rawText = await request.text()
    if (rawText.length > MAX_REVIEW_BODY_BYTES) {
      return jsonResponse({ error: 'Review payload is too large.' }, 413)
    }

    let body
    try {
      body = JSON.parse(rawText)
    } catch {
      return jsonResponse({ error: 'Invalid JSON request payload.' }, 400)
    }

    if (
      typeof body?.sji_verification_code_trap === 'string' &&
      body.sji_verification_code_trap.trim().length > 0
    ) {
      return jsonResponse({ error: 'Submission rejected by spam check.' }, 400)
    }

    const secret = await getSessionSecret(env)
    const challenge = await verifyReviewChallenge(body?.challengeToken, secret)
    if (!challenge.ok) {
      const freshChallenge = await issueReviewChallenge(secret)
      return jsonResponse(
        {
          error:
            challenge.reason === 'too-fast'
              ? 'Please take a couple of seconds to review your feedback before submitting.'
              : 'Your review session expired. Please submit again.',
          challengeToken: freshChallenge,
        },
        400
      )
    }

    const reusedNonce = await env.DB.prepare(
      'SELECT id FROM reviews WHERE challenge_nonce = ?'
    )
      .bind(challenge.nonce)
      .first()
    if (reusedNonce) {
      const freshChallenge = await issueReviewChallenge(secret)
      return jsonResponse(
        {
          error: 'This review session was already submitted. Ready for a new review.',
          challengeToken: freshChallenge,
        },
        400
      )
    }

    const remoteIp =
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
      ''
    const turnstile = await verifyTurnstileIfConfigured(
      env,
      body?.turnstileToken,
      remoteIp
    )
    if (turnstile.required && !turnstile.ok) {
      return jsonResponse(
        { error: 'Human verification check failed. Please try again.' },
        400
      )
    }

    const ipHash = await getClientIpHash(request, secret)
    const rateState = await checkReviewRateLimit(env.DB, ipHash)
    if (rateState.blocked) {
      return jsonResponse(
        {
          error:
            rateState.reason === 'cooldown'
              ? `Please wait ${rateState.retryAfterSec} seconds before submitting another review.`
              : `Review rate limit reached. Try again in ${Math.ceil(rateState.retryAfterSec / 60)} minutes.`,
          retryAfterSec: rateState.retryAfterSec,
        },
        429,
        { 'Retry-After': String(rateState.retryAfterSec) }
      )
    }

    const settings = await getReviewsSettings(env)
    const rawInviteCode = typeof body?.inviteCode === 'string' ? body.inviteCode.trim() : ''
    let activeInvite = null
    if (rawInviteCode) {
      const lookup = await findActiveInviteByCode(env.DB, rawInviteCode)
      if (!lookup.invite) {
        return jsonResponse(
          { error: lookup.reason || 'Invalid or expired invite link.' },
          400
        )
      }
      activeInvite = lookup.invite
    } else if (!settings.publicSubmissionsEnabled) {
      return jsonResponse(
        { error: 'Public reviews currently require a collaborator invite link.' },
        403
      )
    }

    const portfolioResult = await readPortfolioFromDb(env)
    const visibleProjects = (portfolioResult.data?.projects || []).filter(
      (project) => project && project.visible !== false
    )

    const requestedTargetType =
      body?.targetType === 'project' ? 'project' : 'overall'
    const requestedTargetId =
      requestedTargetType === 'project'
        ? String(body?.targetId || '').trim()
        : 'overall'

    let targetTitle = 'Samuel John-Ibro (Overall)'
    if (requestedTargetType === 'project') {
      const matchedProject = visibleProjects.find((p) => p.id === requestedTargetId)
      if (!matchedProject) {
        return jsonResponse(
          { error: 'Please select a valid project or Overall portfolio.' },
          400
        )
      }
      targetTitle = matchedProject.title
    }

    const rating = Number(body?.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return jsonResponse({ error: 'Please choose a 1 to 5 star rating.' }, 400)
    }

    const reviewerName = cleanSingleLine(body?.reviewerName, MAX_REVIEWER_NAME_LENGTH)
    if (reviewerName.length < 2) {
      return jsonResponse(
        { error: 'Please enter your name (at least 2 characters).' },
        400
      )
    }

    const reviewerRole = cleanSingleLine(body?.reviewerRole, MAX_REVIEWER_ROLE_LENGTH)
    const relationship = cleanSingleLine(body?.relationship, MAX_RELATIONSHIP_LENGTH)
    const comment = cleanMultiline(body?.comment, MAX_REVIEW_COMMENT_LENGTH)
    if (comment.length < MIN_REVIEW_COMMENT_LENGTH) {
      return jsonResponse(
        {
          error: `Please write at least ${MIN_REVIEW_COMMENT_LENGTH} characters in your review.`,
        },
        400
      )
    }

    const rawProfiles = Array.isArray(body?.profiles) ? body.profiles : []
    const nonEmptyProfileInputs = rawProfiles.filter((entry) => {
      const u = typeof entry === 'string' ? entry : entry?.url
      return typeof u === 'string' && u.trim().length > 0
    })
    if (nonEmptyProfileInputs.length > MAX_PROFILES_PER_REVIEW) {
      return jsonResponse(
        { error: `You can attach up to ${MAX_PROFILES_PER_REVIEW} profile pages.` },
        400
      )
    }

    const { profiles, invalidUrls } = normalizeProfileLinks(rawProfiles)
    if (invalidUrls.length > 0) {
      return jsonResponse(
        {
          error:
            'One or more profile URLs look invalid. Use real public URLs like https://linkedin.com/in/username or https://github.com/username.',
        },
        400
      )
    }

    const duplicateWindowCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const duplicate = await env.DB.prepare(
      `SELECT id FROM reviews
       WHERE ip_hash = ? AND target_id = ? AND comment = ? AND created_at > ?`
    )
      .bind(ipHash, requestedTargetId, comment, duplicateWindowCutoff)
      .first()
    if (duplicate) {
      return jsonResponse(
        { error: 'This exact review has already been submitted.' },
        409
      )
    }

    const nowIso = new Date().toISOString()
    let verified = 0
    let verifiedLabel = ''
    let inviteId = ''
    let status = settings.moderationMode === 'manual' ? 'pending' : 'approved'

    if (activeInvite) {
      const inviteUpdate = await env.DB.prepare(
        `UPDATE review_invites
         SET use_count = use_count + 1
         WHERE id = ?
           AND active = 1
           AND (max_uses <= 0 OR use_count < max_uses)
           AND (expires_at = '' OR expires_at > ?)`
      )
        .bind(activeInvite.id, nowIso)
        .run()

      if (Number(inviteUpdate?.meta?.changes || 0) !== 1) {
        return jsonResponse(
          { error: 'This invite link has expired or reached its usage limit.' },
          400
        )
      }
      verified = 1
      verifiedLabel = activeInvite.label || 'Verified Collaborator'
      inviteId = activeInvite.id
      status = 'approved'
    }

    const reviewId = crypto.randomUUID().replace(/-/g, '')
    const editToken = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
    const editTokenHash = await sha256Hex(editToken)
    const avatarUrl = await resolveReviewerAvatar(body?.photo, profiles)

    await env.DB.prepare(
      `INSERT INTO reviews (
        id, target_type, target_id, target_title, rating,
        reviewer_name, reviewer_role, relationship, comment,
        profiles_json, avatar_url, avatar_checked_at, edit_token_hash, status, verified, verified_label, featured,
        owner_reply, owner_reply_at, invite_id, challenge_nonce,
        ip_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', '', ?, ?, ?, ?, ?)`
    )
      .bind(
        reviewId,
        requestedTargetType,
        requestedTargetId,
        targetTitle,
        rating,
        reviewerName,
        reviewerRole,
        relationship,
        comment,
        JSON.stringify(profiles),
        avatarUrl,
        `${AVATAR_RESOLVER_VERSION}:${nowIso}`,
        editTokenHash,
        status,
        verified,
        verifiedLabel,
        inviteId,
        challenge.nonce,
        ipHash,
        nowIso,
        nowIso
      )
      .run()

    await recordReviewSubmission(env.DB, ipHash)

    const insertedRow = await env.DB.prepare(
      `SELECT id, target_type, target_id, target_title, rating,
              reviewer_name, reviewer_role, relationship, comment,
              profiles_json, avatar_url, verified, verified_label, featured,
              owner_reply, owner_reply_at, ip_hash, created_at
       FROM reviews WHERE id = ?`
    )
      .bind(reviewId)
      .first()

    const [updatedFeed, freshChallenge] = await Promise.all([
      readApprovedReviewsAndSummary(env.DB, ipHash),
      issueReviewChallenge(secret),
    ])

    const editExpiresAt = new Date(
      Date.parse(nowIso) + REVIEW_EDIT_WINDOW_MS
    ).toISOString()

    return jsonResponse(
      {
        ok: true,
        status,
        review: insertedRow
          ? serializePublicReview(insertedRow, { viewerIpHash: ipHash })
          : null,
        editToken,
        editExpiresAt,
        reviews: updatedFeed.reviews,
        summary: updatedFeed.summary,
        challengeToken: freshChallenge,
        message:
          status === 'approved'
            ? 'Thank you! Your review is now live.'
            : 'Thank you! Your review has been submitted and is awaiting approval.',
      },
      201
    )
  }

  const clientReviewMatch = path.match(/^\/api\/reviews\/([a-zA-Z0-9-]+)$/)
  if (clientReviewMatch && clientReviewMatch[1] !== 'invite' && request.method === 'PATCH') {
    if (!assertSameOrigin(request)) {
      return jsonResponse({ error: 'Invalid request origin.' }, 403)
    }
    if (!env.DB) {
      return jsonResponse({ error: 'Reviews database is temporarily unavailable.' }, 503)
    }
    await ensureDatabaseReady(env.DB)

    const reviewId = clientReviewMatch[1]
    const existingRow = await env.DB.prepare('SELECT * FROM reviews WHERE id = ?')
      .bind(reviewId)
      .first()
    if (!existingRow) {
      return jsonResponse({ error: 'Review not found.' }, 404)
    }

    const createdAtMs = Date.parse(existingRow.created_at)
    const elapsedMs = Date.now() - createdAtMs
    if (!Number.isFinite(createdAtMs) || elapsedMs > REVIEW_EDIT_WINDOW_MS) {
      return jsonResponse(
        {
          error:
            'The 5-minute edit window has expired. Only the site admin can edit or remove this review now.',
        },
        403
      )
    }

    const rawText = await request.text()
    if (rawText.length > MAX_REVIEW_BODY_BYTES) {
      return jsonResponse({ error: 'Review payload is too large.' }, 413)
    }

    let body
    try {
      body = JSON.parse(rawText)
    } catch {
      return jsonResponse({ error: 'Invalid JSON request payload.' }, 400)
    }

    const secret = await getSessionSecret(env)
    const viewerIpHash = await getClientIpHash(request, secret)
    const editToken = String(body?.editToken || '').trim()
    let authorized = false
    if (editToken && existingRow.edit_token_hash) {
      const tokenHash = await sha256Hex(editToken)
      if (constantTimeStringEqual(tokenHash, existingRow.edit_token_hash)) {
        authorized = true
      }
    }
    if (!authorized && viewerIpHash && existingRow.ip_hash) {
      if (constantTimeStringEqual(viewerIpHash, existingRow.ip_hash)) {
        authorized = true
      }
    }
    if (!authorized) {
      return jsonResponse(
        {
          error:
            'Only the browser or IP address that submitted this review can edit it during the 5-minute window.',
        },
        403
      )
    }

    const rating = Number(body?.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return jsonResponse({ error: 'Please choose a 1 to 5 star rating.' }, 400)
    }

    const reviewerName = cleanSingleLine(body?.reviewerName, MAX_REVIEWER_NAME_LENGTH)
    if (reviewerName.length < 2) {
      return jsonResponse(
        { error: 'Please enter your name (at least 2 characters).' },
        400
      )
    }

    const reviewerRole = cleanSingleLine(body?.reviewerRole, MAX_REVIEWER_ROLE_LENGTH)
    const relationship = cleanSingleLine(body?.relationship, MAX_RELATIONSHIP_LENGTH)
    const comment = cleanMultiline(body?.comment, MAX_REVIEW_COMMENT_LENGTH)
    if (comment.length < MIN_REVIEW_COMMENT_LENGTH) {
      return jsonResponse(
        {
          error: `Please write at least ${MIN_REVIEW_COMMENT_LENGTH} characters in your review.`,
        },
        400
      )
    }

    const rawProfiles = Array.isArray(body?.profiles) ? body.profiles : []
    const nonEmptyProfileInputs = rawProfiles.filter((entry) => {
      const u = typeof entry === 'string' ? entry : entry?.url
      return typeof u === 'string' && u.trim().length > 0
    })
    if (nonEmptyProfileInputs.length > MAX_PROFILES_PER_REVIEW) {
      return jsonResponse(
        { error: `You can attach up to ${MAX_PROFILES_PER_REVIEW} profile pages.` },
        400
      )
    }

    const { profiles, invalidUrls } = normalizeProfileLinks(rawProfiles)
    if (invalidUrls.length > 0) {
      return jsonResponse(
        {
          error:
            'One or more profile URLs look invalid. Use real public URLs like https://linkedin.com/in/username or https://github.com/username.',
        },
        400
      )
    }

    const nextProfilesJson = JSON.stringify(profiles)
    const profilesChanged = nextProfilesJson !== (existingRow.profiles_json || '[]')
    let nextAvatarUrl = existingRow.avatar_url || ''
    if (
      typeof body?.photo === 'string' &&
      /^data:image\/(jpeg|jpg|png|webp|gif|avif);base64,/i.test(body.photo.trim())
    ) {
      nextAvatarUrl = await resolveReviewerAvatar(body.photo, profiles)
    } else if (body?.removePhoto === true) {
      nextAvatarUrl =
        profiles.length > 0 ? await resolveReviewerAvatar('', profiles) : ''
    } else if (profilesChanged || (!nextAvatarUrl && profiles.length > 0)) {
      if (!nextAvatarUrl || !nextAvatarUrl.startsWith('data:image/')) {
        nextAvatarUrl =
          profiles.length > 0 ? await resolveReviewerAvatar('', profiles) : ''
      }
    }

    const nowIso = new Date().toISOString()
    await env.DB.prepare(
      `UPDATE reviews
       SET rating = ?,
           reviewer_name = ?,
           reviewer_role = ?,
           relationship = ?,
           comment = ?,
           profiles_json = ?,
           avatar_url = ?,
           avatar_checked_at = ?,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(
        rating,
        reviewerName,
        reviewerRole,
        relationship,
        comment,
        nextProfilesJson,
        nextAvatarUrl,
        `${AVATAR_RESOLVER_VERSION}:${nowIso}`,
        nowIso,
        reviewId
      )
      .run()

    const updatedRow = await env.DB.prepare(
      `SELECT id, target_type, target_id, target_title, rating,
              reviewer_name, reviewer_role, relationship, comment,
              profiles_json, avatar_url, verified, verified_label, featured,
              owner_reply, owner_reply_at, ip_hash, created_at
       FROM reviews WHERE id = ?`
    )
      .bind(reviewId)
      .first()

    const updatedFeed = await readApprovedReviewsAndSummary(env.DB, viewerIpHash)

    return jsonResponse({
      ok: true,
      review: updatedRow
        ? serializePublicReview(updatedRow, { viewerIpHash })
        : null,
      reviews: updatedFeed.reviews,
      summary: updatedFeed.summary,
      message: 'Your review was updated successfully.',
    })
  }

  if (clientReviewMatch && clientReviewMatch[1] !== 'invite' && request.method === 'DELETE') {
    if (!assertSameOrigin(request)) {
      return jsonResponse({ error: 'Invalid request origin.' }, 403)
    }
    if (!env.DB) {
      return jsonResponse({ error: 'Reviews database is temporarily unavailable.' }, 503)
    }
    await ensureDatabaseReady(env.DB)

    const reviewId = clientReviewMatch[1]
    const existingRow = await env.DB.prepare('SELECT * FROM reviews WHERE id = ?')
      .bind(reviewId)
      .first()
    if (!existingRow) {
      return jsonResponse({ error: 'Review not found.' }, 404)
    }

    const createdAtMs = Date.parse(existingRow.created_at)
    const elapsedMs = Date.now() - createdAtMs
    if (!Number.isFinite(createdAtMs) || elapsedMs > REVIEW_EDIT_WINDOW_MS) {
      return jsonResponse(
        {
          error:
            'The 5-minute deletion window has expired. Only the site admin can remove this review now.',
        },
        403
      )
    }

    let body = {}
    try {
      body = await request.json()
    } catch {
      // Allow fallback if sent with empty body (e.g. IP-authorized deletion)
    }

    const secret = await getSessionSecret(env)
    const viewerIpHash = await getClientIpHash(request, secret)
    const editToken = String(body?.editToken || '').trim()
    let authorized = false
    if (editToken && existingRow.edit_token_hash) {
      const tokenHash = await sha256Hex(editToken)
      if (constantTimeStringEqual(tokenHash, existingRow.edit_token_hash)) {
        authorized = true
      }
    }
    if (!authorized && viewerIpHash && existingRow.ip_hash) {
      if (constantTimeStringEqual(viewerIpHash, existingRow.ip_hash)) {
        authorized = true
      }
    }
    if (!authorized) {
      return jsonResponse(
        {
          error:
            'Only the browser or IP address that submitted this review can delete it during the 5-minute window.',
        },
        403
      )
    }

    await env.DB.prepare('DELETE FROM reviews WHERE id = ?')
      .bind(reviewId)
      .run()

    const updatedFeed = await readApprovedReviewsAndSummary(env.DB, viewerIpHash)

    return jsonResponse({
      ok: true,
      deletedId: reviewId,
      reviews: updatedFeed.reviews,
      summary: updatedFeed.summary,
      message: 'Your review was deleted successfully.',
    })
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

  if (path === '/api/admin/reviews' && request.method === 'GET') {
    const [reviewsResult, invitesResult, settings] = await Promise.all([
      env.DB.prepare(
        `SELECT id, target_type, target_id, target_title, rating,
                reviewer_name, reviewer_role, relationship, comment,
                profiles_json, avatar_url, status, verified, verified_label, featured,
                owner_reply, owner_reply_at, invite_id, created_at, updated_at
         FROM reviews
         ORDER BY created_at DESC`
      ).all(),
      env.DB.prepare(
        'SELECT * FROM review_invites ORDER BY created_at DESC'
      ).all(),
      getReviewsSettings(env),
    ])

    const allReviews = (reviewsResult?.results || []).map(serializeAdminReview)
    const approvedReviews = allReviews.filter((r) => r.status === 'approved')
    const invites = (invitesResult?.results || []).map(serializeReviewInvite)

    return jsonResponse({
      reviews: allReviews,
      summary: computeReviewsSummary(approvedReviews),
      counts: {
        total: allReviews.length,
        approved: approvedReviews.length,
        pending: allReviews.filter((r) => r.status === 'pending').length,
        hidden: allReviews.filter((r) => r.status === 'hidden').length,
      },
      settings,
      invites,
    })
  }

  if (path === '/api/admin/reviews/settings' && request.method === 'PUT') {
    let body
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON payload.' }, 400)
    }
    const settings = await saveReviewsSettings(env, body)
    return jsonResponse({ ok: true, settings })
  }

  if (path === '/api/admin/reviews/invites' && request.method === 'POST') {
    let body
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON payload.' }, 400)
    }

    const label =
      cleanSingleLine(body?.label, 40) || 'Verified Collaborator'
    const targetType =
      body?.targetType === 'project'
        ? 'project'
        : body?.targetType === 'overall'
          ? 'overall'
          : ''
    const targetId =
      targetType === 'project'
        ? cleanSingleLine(body?.targetId, 80)
        : targetType === 'overall'
          ? 'overall'
          : ''
    const rawMaxUses = Number(body?.maxUses)
    const maxUses =
      Number.isInteger(rawMaxUses) && rawMaxUses >= 0 && rawMaxUses <= 500
        ? rawMaxUses
        : 1
    const rawDays = Number(body?.expiresInDays)
    const expiresAt =
      Number.isInteger(rawDays) && rawDays > 0 && rawDays <= 365
        ? new Date(Date.now() + rawDays * 24 * 60 * 60 * 1000).toISOString()
        : ''

    const id = crypto.randomUUID().replace(/-/g, '')
    const code = generateInviteCode(8)
    const nowIso = new Date().toISOString()

    await env.DB.prepare(
      `INSERT INTO review_invites (
        id, code, label, target_type, target_id,
        max_uses, use_count, active, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`
    )
      .bind(id, code, label, targetType, targetId, maxUses, expiresAt, nowIso)
      .run()

    const row = await env.DB.prepare('SELECT * FROM review_invites WHERE id = ?')
      .bind(id)
      .first()

    return jsonResponse({
      ok: true,
      invite: row ? serializeReviewInvite(row) : null,
    })
  }

  const deleteInviteMatch = path.match(/^\/api\/admin\/reviews\/invites\/([a-zA-Z0-9-]+)$/)
  if (deleteInviteMatch && request.method === 'DELETE') {
    const inviteId = deleteInviteMatch[1]
    await env.DB.prepare('DELETE FROM review_invites WHERE id = ?')
      .bind(inviteId)
      .run()
    return jsonResponse({ ok: true })
  }

  const adminReviewMatch = path.match(/^\/api\/admin\/reviews\/([a-zA-Z0-9-]+)$/)
  if (adminReviewMatch && request.method === 'PATCH') {
    const reviewId = adminReviewMatch[1]
    const existingRow = await env.DB.prepare('SELECT * FROM reviews WHERE id = ?')
      .bind(reviewId)
      .first()
    if (!existingRow) {
      return jsonResponse({ error: 'Review not found.' }, 404)
    }

    let body
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON payload.' }, 400)
    }

    const nextStatus = ['approved', 'pending', 'hidden'].includes(body?.status)
      ? body.status
      : existingRow.status
    const nextVerified =
      typeof body?.verified === 'boolean'
        ? body.verified
          ? 1
          : 0
        : Number(existingRow.verified || 0)
    const nextVerifiedLabel =
      typeof body?.verifiedLabel === 'string'
        ? cleanSingleLine(body.verifiedLabel, 40)
        : existingRow.verified_label || ''
    const nextFeatured =
      typeof body?.featured === 'boolean'
        ? body.featured
          ? 1
          : 0
        : Number(existingRow.featured || 0)

    let nextReply = existingRow.owner_reply || ''
    let nextReplyAt = existingRow.owner_reply_at || ''
    if (typeof body?.ownerReply === 'string') {
      nextReply = cleanMultiline(body.ownerReply, MAX_OWNER_REPLY_LENGTH)
      if (!nextReply) {
        nextReplyAt = ''
      } else if (nextReply !== (existingRow.owner_reply || '') || !nextReplyAt) {
        nextReplyAt = new Date().toISOString()
      }
    }

    const nowIso = new Date().toISOString()
    await env.DB.prepare(
      `UPDATE reviews
       SET status = ?,
           verified = ?,
           verified_label = ?,
           featured = ?,
           owner_reply = ?,
           owner_reply_at = ?,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(
        nextStatus,
        nextVerified,
        nextVerifiedLabel,
        nextFeatured,
        nextReply,
        nextReplyAt,
        nowIso,
        reviewId
      )
      .run()

    const updatedRow = await env.DB.prepare('SELECT * FROM reviews WHERE id = ?')
      .bind(reviewId)
      .first()

    return jsonResponse({
      ok: true,
      review: updatedRow ? serializeAdminReview(updatedRow) : null,
    })
  }

  if (adminReviewMatch && request.method === 'DELETE') {
    const reviewId = adminReviewMatch[1]
    await env.DB.prepare('DELETE FROM reviews WHERE id = ?')
      .bind(reviewId)
      .run()
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: 'API route not found.' }, 404)
}

const SECTION_REDIRECT_SLUGS = new Set([
  'about',
  'projects',
  'skills',
  'training',
  'credentials',
  'extras',
  'reviews',
  'contact',
])

function escapeHtmlAttr(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function fetchAppHtmlShell(env, url) {
  if (!env.ASSETS) return null
  const shellRequest = new Request(new URL('/', url.origin).href, {
    method: 'GET',
  })
  const res = await env.ASSETS.fetch(shellRequest)
  if (!res.ok) return null
  return res
}

function buildNotFoundHtml(origin, brandName = 'Samuel John-Ibro') {
  const safeBrand = escapeHtmlAttr(brandName)
  const safeOrigin = escapeHtmlAttr(`${origin}/`)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>404 — Page Not Found | ${safeBrand}</title>
    <meta name="robots" content="noindex, nofollow" />
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #070707;
        color: #f5f5f5;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
        padding: 24px;
        text-align: center;
      }
      .box {
        max-width: 480px;
        padding: 36px 28px;
        border: 1px solid rgba(163, 163, 163, 0.2);
        border-radius: 16px;
        background: rgba(18, 18, 18, 0.85);
      }
      .code {
        color: #c89b3c;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      h1 {
        margin: 12px 0;
        font-size: 1.75rem;
      }
      p {
        color: #9a9a9a;
        line-height: 1.6;
        margin-bottom: 24px;
      }
      a {
        display: inline-flex;
        align-items: center;
        padding: 11px 22px;
        border-radius: 999px;
        background: linear-gradient(135deg, #8b1b36 0%, #6b1228 100%);
        color: #f5f5f5;
        text-decoration: none;
        font-size: 0.85rem;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main class="box">
      <div class="code">404 — Not Found</div>
      <h1>Page not found</h1>
      <p>The requested URL does not exist on ${safeBrand}'s portfolio.</p>
      <a href="${safeOrigin}">Return to Portfolio →</a>
    </main>
  </body>
</html>`
}

async function renderAdminShellResponse(env, url) {
  const shellRes = await fetchAppHtmlShell(env, url)
  if (!shellRes) {
    return new Response('Assets binding not configured.', { status: 404 })
  }

  const transformed = new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent('Portfolio Studio — Admin')
      },
    })
    .on('meta[name="robots"]', {
      element(el) {
        el.setAttribute('content', 'noindex, nofollow, noarchive')
      },
    })
    .transform(shellRes)

  return new Response(transformed.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  })
}

async function renderPortfolioSsrResponse(request, env, url) {
  const shellRes = await fetchAppHtmlShell(env, url)
  if (!shellRes) {
    return new Response('Assets binding not configured.', { status: 404 })
  }

  const [{ data, updatedAt }, reviewsPayload] = await Promise.all([
    readPortfolioFromDb(env),
    env.DB
      ? readApprovedReviewsAndSummary(env.DB).catch(() => ({
          reviews: [],
          summary: computeReviewsSummary([]),
        }))
      : Promise.resolve({
          reviews: [],
          summary: computeReviewsSummary([]),
        }),
  ])

  const origin = resolveCanonicalOrigin(data, request.url, env)
  const seoMeta = resolveSeoMetadata(data, origin, env)
  const jsonLd = buildJsonLdGraph(
    data,
    origin,
    updatedAt,
    env,
    reviewsPayload.reviews
  )
  const renderYear = String(new Date().getUTCFullYear())

  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'X-Robots-Tag':
      'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }

  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers })
  }

  const ssrHtml = renderToString(
    createElement(PortfolioPage, {
      initialData: data,
      initialYear: renderYear,
      initialReviews: reviewsPayload.reviews,
      initialReviewsSummary: reviewsPayload.summary,
    })
  )

  const bootstrapPayload = serializeJsonForHtml({
    data,
    pathname: '/',
    year: renderYear,
    reviews: reviewsPayload.reviews,
    reviewsSummary: reviewsPayload.summary,
  })

  const extraHeadTags = [
    ...seoMeta.sameAs.map(
      (href) => `<link rel="me" href="${escapeHtmlAttr(href)}" />`
    ),
    ...(updatedAt
      ? [
          `<meta property="og:updated_time" content="${escapeHtmlAttr(updatedAt)}" />`,
        ]
      : []),
    ...(seoMeta.googleSiteVerification
      ? [
          `<meta name="google-site-verification" content="${escapeHtmlAttr(seoMeta.googleSiteVerification)}" />`,
        ]
      : []),
    ...(seoMeta.bingSiteVerification
      ? [
          `<meta name="msvalidate.01" content="${escapeHtmlAttr(seoMeta.bingSiteVerification)}" />`,
        ]
      : []),
    `<script id="sji-structured-data" type="application/ld+json">${serializeJsonForHtml(jsonLd)}</script>`,
    `<script>window.__PORTFOLIO_BOOTSTRAP__=${bootstrapPayload};</script>`,
  ].join('\n    ')

  const rewriter = new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent(seoMeta.title)
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute('content', seoMeta.description)
      },
    })
    .on('meta[name="author"]', {
      element(el) {
        el.setAttribute('content', seoMeta.author)
      },
    })
    .on('meta[name="keywords"]', {
      element(el) {
        el.setAttribute('content', seoMeta.keywordsContent)
      },
    })
    .on('meta[name="robots"]', {
      element(el) {
        el.setAttribute(
          'content',
          'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
        )
      },
    })
    .on('link[rel="canonical"]', {
      element(el) {
        el.setAttribute('href', seoMeta.canonicalUrl)
      },
    })
    .on('meta[property="og:type"]', {
      element(el) {
        el.setAttribute('content', 'profile')
      },
    })
    .on('meta[property="og:url"]', {
      element(el) {
        el.setAttribute('content', seoMeta.canonicalUrl)
      },
    })
    .on('meta[property="og:title"]', {
      element(el) {
        el.setAttribute('content', seoMeta.title)
      },
    })
    .on('meta[property="og:description"]', {
      element(el) {
        el.setAttribute('content', seoMeta.description)
      },
    })
    .on('meta[property="og:site_name"]', {
      element(el) {
        el.setAttribute('content', seoMeta.siteName)
      },
    })
    .on('meta[property="og:image"]', {
      element(el) {
        el.setAttribute('content', seoMeta.ogImageUrl)
      },
    })
    .on('meta[property="og:image:secure_url"]', {
      element(el) {
        el.setAttribute('content', seoMeta.ogImageUrl)
      },
    })
    .on('meta[property="og:image:alt"]', {
      element(el) {
        el.setAttribute('content', seoMeta.ogImageAlt)
      },
    })
    .on('meta[property="og:image:type"]', {
      element(el) {
        el.setAttribute('content', seoMeta.ogImageType)
      },
    })
    .on('meta[property="og:image:width"]', {
      element(el) {
        if (seoMeta.ogImageWidth) {
          el.setAttribute('content', seoMeta.ogImageWidth)
        } else {
          el.remove()
        }
      },
    })
    .on('meta[property="og:image:height"]', {
      element(el) {
        if (seoMeta.ogImageHeight) {
          el.setAttribute('content', seoMeta.ogImageHeight)
        } else {
          el.remove()
        }
      },
    })
    .on('meta[name="twitter:card"]', {
      element(el) {
        el.setAttribute('content', seoMeta.twitterCard)
      },
    })
    .on('meta[name="twitter:title"]', {
      element(el) {
        el.setAttribute('content', seoMeta.title)
      },
    })
    .on('meta[name="twitter:description"]', {
      element(el) {
        el.setAttribute('content', seoMeta.description)
      },
    })
    .on('meta[name="twitter:image"]', {
      element(el) {
        el.setAttribute('content', seoMeta.ogImageUrl)
      },
    })
    .on('meta[name="twitter:image:alt"]', {
      element(el) {
        el.setAttribute('content', seoMeta.ogImageAlt)
      },
    })
    .on('link[rel="me"]', {
      element(el) {
        el.remove()
      },
    })
    .on('script#sji-structured-data', {
      element(el) {
        el.remove()
      },
    })
    .on('head', {
      element(el) {
        el.append(extraHeadTags, { html: true })
      },
    })
    .on('#root', {
      element(el) {
        el.setInnerContent(ssrHtml, { html: true })
      },
    })

  const transformed = rewriter.transform(shellRes)
  return new Response(transformed.body, {
    status: 200,
    headers,
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url)
      } catch (error) {
        console.error(
          JSON.stringify({
            message: 'api_handler_error',
            path: url.pathname,
            error: error?.message || 'Internal worker error.',
          })
        )
        return jsonResponse(
          { error: error?.message || 'Internal worker error.' },
          500
        )
      }
    }

    if (
      url.pathname.startsWith('/media/') &&
      (request.method === 'GET' || request.method === 'HEAD')
    ) {
      const segment = url.pathname.slice('/media/'.length).split('/')[0]
      if (segment && /^[a-zA-Z0-9-]+$/.test(segment)) {
        return handleServeMedia(request, env, segment)
      }
      return new Response('Media not found', { status: 404 })
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      const normalizedPath = normalizeRoutePath(url.pathname)
      const adminPath = normalizeRoutePath(env.ADMIN_PATH || '/admin')

      if (normalizedPath === adminPath) {
        return renderAdminShellResponse(env, url)
      }

      if (url.pathname === '/robots.txt') {
        const { data } = await readPortfolioFromDb(env).catch(() => ({
          data: DEFAULT_PORTFOLIO,
        }))
        const origin = resolveCanonicalOrigin(data, request.url, env)
        const body = buildRobotsTxt(origin)
        return new Response(request.method === 'HEAD' ? null : body, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      }

      if (url.pathname === '/sitemap.xml') {
        const { data, updatedAt } = await readPortfolioFromDb(env).catch(
          () => ({
            data: DEFAULT_PORTFOLIO,
            updatedAt: null,
          })
        )
        const origin = resolveCanonicalOrigin(data, request.url, env)
        const xml = buildSitemapXml(data, origin, updatedAt)
        return new Response(request.method === 'HEAD' ? null : xml, {
          status: 200,
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
          },
        })
      }

      if (url.pathname === '/llms.txt') {
        const [{ data }, reviewsPayload] = await Promise.all([
          readPortfolioFromDb(env).catch(() => ({ data: DEFAULT_PORTFOLIO })),
          env.DB
            ? readApprovedReviewsAndSummary(env.DB).catch(() => ({
                reviews: [],
              }))
            : Promise.resolve({ reviews: [] }),
        ])
        const origin = resolveCanonicalOrigin(data, request.url, env)
        const body = buildLlmsTxt(data, origin, reviewsPayload.reviews)
        return new Response(request.method === 'HEAD' ? null : body, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
          },
        })
      }

      if (url.pathname === '/index.html' || url.pathname === '/home') {
        const { data } = await readPortfolioFromDb(env).catch(() => ({
          data: DEFAULT_PORTFOLIO,
        }))
        const origin = resolveCanonicalOrigin(data, request.url, env)
        return Response.redirect(`${origin}/`, 301)
      }

      const sectionSlug = normalizedPath.slice(1).toLowerCase()
      if (SECTION_REDIRECT_SLUGS.has(sectionSlug)) {
        const { data } = await readPortfolioFromDb(env).catch(() => ({
          data: DEFAULT_PORTFOLIO,
        }))
        const origin = resolveCanonicalOrigin(data, request.url, env)
        return Response.redirect(`${origin}/#${sectionSlug}`, 301)
      }

      if (url.pathname === '/') {
        try {
          return await renderPortfolioSsrResponse(request, env, url)
        } catch (error) {
          console.error(
            JSON.stringify({
              message: 'ssr_render_error',
              path: url.pathname,
              error: error?.message || 'SSR failed',
            })
          )
        }
      }
    }

    if (env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request)
      if (assetRes.status !== 404) {
        return assetRes
      }
    }

    const origin = resolveCanonicalOrigin(DEFAULT_PORTFOLIO, request.url, env)
    return new Response(
      request.method === 'HEAD' ? null : buildNotFoundHtml(origin),
      {
        status: 404,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      }
    )
  },
}

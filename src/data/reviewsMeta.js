export const MAX_PROFILES_PER_REVIEW = 4
export const MIN_REVIEW_COMMENT_LENGTH = 10
export const MAX_REVIEW_COMMENT_LENGTH = 1500
export const MAX_OWNER_REPLY_LENGTH = 800
export const MAX_REVIEWER_NAME_LENGTH = 80
export const MAX_REVIEWER_ROLE_LENGTH = 100
export const MAX_RELATIONSHIP_LENGTH = 40
export const MAX_PROFILE_URL_LENGTH = 300

export const RATING_LABELS = {
  1: 'Needs work',
  2: 'Fair',
  3: 'Good',
  4: 'Great',
  5: 'Exceptional',
}

export const REVIEW_RELATIONSHIPS = [
  'Client',
  'Collaborator',
  'Teammate',
  'Engineering Peer',
  'Training Attendee',
  'Product User',
  'Manager / Mentor',
]

export const PROFILE_PLATFORM_PRESETS = [
  {
    platform: 'linkedin',
    label: 'LinkedIn',
    placeholder: 'https://linkedin.com/in/your-profile',
  },
  {
    platform: 'github',
    label: 'GitHub',
    placeholder: 'https://github.com/your-username',
  },
  {
    platform: 'x',
    label: 'X',
    placeholder: 'https://x.com/your-handle',
  },
  {
    platform: 'website',
    label: 'Website',
    placeholder: 'https://yourwebsite.com',
  },
  {
    platform: 'instagram',
    label: 'Instagram',
    placeholder: 'https://instagram.com/your-handle',
  },
]

export function isDisallowedHostname(hostname) {
  const host = String(hostname || '').toLowerCase().trim()
  if (!host) return true
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true
  }
  // Reject IPv6 brackets and raw IPv4 addresses
  if (host.startsWith('[') || host.includes(':')) return true
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true
  if (!host.includes('.')) return true
  const tld = host.split('.').pop()
  if (!tld || tld.length < 2) return true
  return false
}

export function cleanPathSegments(pathname) {
  return String(pathname || '')
    .split('/')
    .map((seg) => seg.trim())
    .filter(Boolean)
}

export function isPlaceholderOrMissingAvatar(url, platform = '') {
  if (!url || typeof url !== 'string') return true
  const trimmed = url.trim()
  if (!trimmed) return true
  if (trimmed.startsWith('data:image/')) {
    return trimmed.startsWith('data:image/svg')
  }

  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    return true
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true

  const lower = trimmed.toLowerCase()
  const pathLower = parsed.pathname.toLowerCase()
  const hostLower = parsed.hostname.toLowerCase()

  // Reject vector icons, favicons, and generic brand graphics
  if (
    pathLower.endsWith('.svg') ||
    pathLower.endsWith('.ico') ||
    pathLower.includes('/favicon')
  ) {
    return true
  }

  const placeholderMarkers = [
    'ghost_person',
    'ghost-person',
    'default_profile',
    'default-profile',
    'identicon',
    'placeholder',
    'default-avatar',
    'default_avatar',
    'no-avatar',
    'no_avatar',
    'no-photo',
    'no_photo',
    'blank_profile',
    'blank-profile',
    'avatar-default',
    'avatar_default',
    'mystery-man',
    'mystery_man',
    'silhouette',
    'anonymous',
    'fallback',
    'generic-avatar',
    'generic_avatar',
    'd=mp',
    'd=mm',
    'd=identicon',
    'd=retro',
    'd=blank',
    'd=robohash',
    'd=wavatar',
    'd=monsterid',
    'static.licdn.com',
    'licdn.com/sc/',
    'linkedin-bug',
    'linkedin_logo',
    'linkedin-logo',
    'abs.twimg.com/sticky/default_profile_images',
    'abs.twimg.com/responsive-web',
    'abs.twimg.com/rweb',
    'twitter_logo',
    'twitter-logo',
    'x-logo',
    'x_logo',
    'static.cdninstagram.com',
    '44884218_345707102882519',
    'instagram_logo',
    'instagram-logo',
    'github.githubassets.com',
    'opengraph.githubassets.com',
    'identicons.github.com',
    'ibytedtos.com',
    'tiktok-logo',
    'tiktok_logo',
    'poster-square',
    'static.xx.fbcdn.net',
    '/rsrc.php/',
    'fb_icon',
    'facebook-logo',
    'telegram.org/img/',
    's.pinimg.com/images/',
    'default_open_graph',
    'user-default-pictures',
    '1*dmbnkd5d-u45r44go_cf0g',
    's.ytimg.com',
    'youtube.com/img/',
    'yt_1200.png',
    'redditstatic.com/avatars/defaults',
    'snoovatar',
    'threads_logo',
    'threads-logo',
  ]

  if (placeholderMarkers.some((marker) => lower.includes(marker))) {
    return true
  }

  // Platform-specific strict checks so we never grab a platform's brand logo or empty shell
  if (platform === 'linkedin') {
    if (!hostLower.endsWith('media.licdn.com')) {
      return true
    }
  } else if (platform === 'x') {
    if (
      !hostLower.endsWith('pbs.twimg.com') ||
      !pathLower.includes('/profile_images/')
    ) {
      return true
    }
  } else if (platform === 'github') {
    if (!hostLower.endsWith('avatars.githubusercontent.com')) {
      return true
    }
  } else if (platform === 'instagram' || platform === 'threads') {
    if (
      (!hostLower.includes('cdninstagram.com') &&
        !hostLower.includes('fbcdn.net')) ||
      hostLower.startsWith('static.')
    ) {
      return true
    }
  } else if (platform === 'facebook') {
    if (
      !hostLower.includes('fbcdn.net') ||
      hostLower.startsWith('static.')
    ) {
      return true
    }
  } else if (platform === 'tiktok') {
    if (!hostLower.includes('tiktokcdn')) {
      return true
    }
  } else if (platform === 'telegram') {
    if (
      !hostLower.includes('telesco.pe') &&
      !hostLower.includes('cdn-telegram.org')
    ) {
      return true
    }
  } else if (platform === 'youtube') {
    if (
      !hostLower.endsWith('yt3.googleusercontent.com') &&
      !hostLower.endsWith('yt3.ggpht.com')
    ) {
      return true
    }
  } else if (platform === 'twitch') {
    if (!hostLower.endsWith('jtvnw.net')) {
      return true
    }
  } else if (platform === 'bluesky') {
    if (!hostLower.endsWith('cdn.bsky.app')) {
      return true
    }
  }

  return false
}

export const MY_REVIEWS_STORAGE_KEY = 'sji_my_reviews_v1'
export const REVIEW_EDIT_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

export function saveMyReviewSession(reviewId, editToken, createdAt) {
  if (typeof window === 'undefined' || !reviewId || !editToken) return
  try {
    const existing = getMyReviewSessions()
    const createdMs = createdAt ? new Date(createdAt).getTime() : Date.now()
    const expiresAt = new Date(createdMs + REVIEW_EDIT_WINDOW_MS).toISOString()
    existing[reviewId] = {
      editToken,
      expiresAt,
      createdAt: new Date(createdMs).toISOString(),
    }
    window.localStorage.setItem(MY_REVIEWS_STORAGE_KEY, JSON.stringify(existing))
  } catch {
    // Ignore storage quota or access errors
  }
}

export function getMyReviewSessions() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(MY_REVIEWS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const now = Date.now()
    const valid = {}
    for (const [id, data] of Object.entries(parsed)) {
      if (
        data?.expiresAt &&
        new Date(data.expiresAt).getTime() > now &&
        data?.editToken
      ) {
        valid[id] = data
      }
    }
    return valid
  } catch {
    return {}
  }
}

export function removeMyReviewSession(reviewId) {
  if (typeof window === 'undefined' || !reviewId) return
  try {
    const existing = getMyReviewSessions()
    delete existing[reviewId]
    window.localStorage.setItem(MY_REVIEWS_STORAGE_KEY, JSON.stringify(existing))
  } catch {
    // Ignore
  }
}

export function formatRemainingSeconds(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function classifyProfileUrl(rawUrl, customLabel = '') {
  if (typeof rawUrl !== 'string') return null
  const trimmed = rawUrl.trim()
  if (!trimmed) return null
  if (trimmed.length > MAX_PROFILE_URL_LENGTH) return null
  if (/[\s<>"'`\\]/.test(trimmed)) return null

  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase()
    if (scheme !== 'http' && scheme !== 'https') {
      return null
    }
  }

  const candidate = schemeMatch ? trimmed : `https://${trimmed}`

  let parsed
  try {
    parsed = new URL(candidate)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null
  }
  if (parsed.username || parsed.password) {
    return null
  }
  if (isDisallowedHostname(parsed.hostname)) {
    return null
  }

  const cleanHost = parsed.hostname.replace(/^www\./i, '').toLowerCase()
  const segments = cleanPathSegments(parsed.pathname)
  const firstSeg = segments[0] || ''
  const secondSeg = segments[1] || ''
  const explicitLabel =
    typeof customLabel === 'string' ? customLabel.trim().slice(0, 32) : ''

  let platform = 'website'
  let label = 'Website'
  let handle = cleanHost

  if (cleanHost === 'linkedin.com' || cleanHost.endsWith('.linkedin.com')) {
    platform = 'linkedin'
    label = 'LinkedIn'
    if ((firstSeg === 'in' || firstSeg === 'company') && secondSeg) {
      handle = `/${firstSeg}/${secondSeg}`
    } else if (firstSeg) {
      handle = `/${firstSeg}`
    }
  } else if (cleanHost === 'github.com' || cleanHost.endsWith('.github.com')) {
    platform = 'github'
    label = 'GitHub'
    handle = firstSeg ? `@${firstSeg.replace(/^@/, '')}` : cleanHost
  } else if (
    cleanHost === 'x.com' ||
    cleanHost === 'twitter.com' ||
    cleanHost.endsWith('.twitter.com')
  ) {
    platform = 'x'
    label = 'X'
    handle = firstSeg ? `@${firstSeg.replace(/^@/, '')}` : cleanHost
  } else if (cleanHost === 'instagram.com' || cleanHost.endsWith('.instagram.com')) {
    platform = 'instagram'
    label = 'Instagram'
    handle = firstSeg ? `@${firstSeg.replace(/^@/, '')}` : cleanHost
  } else if (
    cleanHost === 'youtube.com' ||
    cleanHost === 'm.youtube.com' ||
    cleanHost === 'youtu.be'
  ) {
    platform = 'youtube'
    label = 'YouTube'
    handle = firstSeg ? firstSeg : cleanHost
  } else if (
    cleanHost === 'facebook.com' ||
    cleanHost === 'm.facebook.com' ||
    cleanHost === 'fb.com'
  ) {
    platform = 'facebook'
    label = 'Facebook'
    handle = firstSeg ? `@${firstSeg.replace(/^@/, '')}` : cleanHost
  } else if (cleanHost === 'tiktok.com' || cleanHost.endsWith('.tiktok.com')) {
    platform = 'tiktok'
    label = 'TikTok'
    handle = firstSeg ? `@${firstSeg.replace(/^@/, '')}` : cleanHost
  } else if (cleanHost === 'threads.net' || cleanHost === 'threads.com') {
    platform = 'threads'
    label = 'Threads'
    handle = firstSeg ? `@${firstSeg.replace(/^@/, '')}` : cleanHost
  } else if (cleanHost === 'bsky.app') {
    platform = 'bluesky'
    label = 'Bluesky'
    handle =
      firstSeg === 'profile' && secondSeg
        ? `@${secondSeg.replace(/^@/, '')}`
        : firstSeg
          ? `@${firstSeg.replace(/^@/, '')}`
          : cleanHost
  } else if (cleanHost === 't.me' || cleanHost === 'telegram.me') {
    platform = 'telegram'
    label = 'Telegram'
    handle = firstSeg ? `@${firstSeg.replace(/^@/, '')}` : cleanHost
  } else if (cleanHost === 'medium.com' || cleanHost.endsWith('.medium.com')) {
    platform = 'medium'
    label = 'Medium'
    handle = firstSeg ? `@${firstSeg.replace(/^@/, '')}` : cleanHost
  } else if (cleanHost === 'twitch.tv' || cleanHost.endsWith('.twitch.tv')) {
    platform = 'twitch'
    label = 'Twitch'
    handle = firstSeg ? `@${firstSeg.replace(/^@/, '')}` : cleanHost
  } else if (cleanHost === 'reddit.com' || cleanHost.endsWith('.reddit.com')) {
    platform = 'reddit'
    label = 'Reddit'
    handle =
      (firstSeg === 'u' || firstSeg === 'user') && secondSeg
        ? `u/${secondSeg}`
        : firstSeg || cleanHost
  } else if (cleanHost === 'gitlab.com') {
    platform = 'gitlab'
    label = 'GitLab'
    handle = firstSeg ? `@${firstSeg.replace(/^@/, '')}` : cleanHost
  } else if (cleanHost === 'dev.to') {
    platform = 'devto'
    label = 'DEV'
    handle = firstSeg ? `@${firstSeg.replace(/^@/, '')}` : cleanHost
  } else if (cleanHost === 'pinterest.com' || cleanHost.endsWith('.pinterest.com')) {
    platform = 'pinterest'
    label = 'Pinterest'
    handle = firstSeg ? `@${firstSeg.replace(/^@/, '')}` : cleanHost
  } else if (cleanHost === 'snapchat.com' || cleanHost.endsWith('.snapchat.com')) {
    platform = 'snapchat'
    label = 'Snapchat'
    handle =
      firstSeg === 'add' && secondSeg
        ? `@${secondSeg}`
        : firstSeg
          ? `@${firstSeg.replace(/^@/, '')}`
          : cleanHost
  } else if (
    cleanHost === 'behance.net' ||
    cleanHost === 'dribbble.com' ||
    cleanHost === 'figma.com' ||
    cleanHost === 'read.cv' ||
    cleanHost === 'bento.me' ||
    cleanHost === 'linktr.ee' ||
    cleanHost.endsWith('.substack.com') ||
    cleanHost === 'substack.com'
  ) {
    platform = 'portfolio'
    label =
      cleanHost === 'behance.net'
        ? 'Behance'
        : cleanHost === 'dribbble.com'
          ? 'Dribbble'
          : cleanHost === 'figma.com'
            ? 'Figma'
            : cleanHost === 'read.cv'
              ? 'Read.cv'
              : cleanHost === 'bento.me'
                ? 'Bento'
                : cleanHost === 'linktr.ee'
                  ? 'Linktree'
                  : 'Substack'
    handle = firstSeg ? `@${firstSeg.replace(/^@/, '')}` : cleanHost
  }

  if (explicitLabel && platform === 'website') {
    label = explicitLabel
  }

  const display =
    platform === 'website'
      ? segments.length > 0 && segments[0].length <= 24
        ? `${cleanHost}/${segments[0]}`
        : cleanHost
      : `${label} · ${handle}`

  return {
    url: parsed.toString(),
    platform,
    label,
    handle,
    display,
  }
}

export function normalizeProfileLinks(rawProfiles = []) {
  if (!Array.isArray(rawProfiles)) {
    return { profiles: [], invalidUrls: [] }
  }

  const profiles = []
  const invalidUrls = []
  const seenUrls = new Set()

  for (const entry of rawProfiles) {
    const rawUrl =
      typeof entry === 'string'
        ? entry
        : entry && typeof entry === 'object'
          ? entry.url
          : ''
    const customLabel =
      entry && typeof entry === 'object' ? entry.label || '' : ''

    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
      continue
    }

    const classified = classifyProfileUrl(rawUrl, customLabel)
    if (!classified) {
      invalidUrls.push(rawUrl.trim())
      continue
    }

    const dedupeKey = classified.url.replace(/\/+$/, '').toLowerCase()
    if (seenUrls.has(dedupeKey)) {
      continue
    }
    seenUrls.add(dedupeKey)
    profiles.push(classified)

    if (profiles.length >= MAX_PROFILES_PER_REVIEW) {
      break
    }
  }

  return { profiles, invalidUrls }
}

export function computeReviewsSummary(reviews = []) {
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  const byTarget = {}
  let totalCount = 0
  let totalRating = 0
  let verifiedCount = 0

  for (const review of reviews) {
    if (!review) continue
    const rating = Number(review.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) continue

    totalCount += 1
    totalRating += rating
    distribution[rating] = (distribution[rating] || 0) + 1
    if (review.verified) {
      verifiedCount += 1
    }

    const targetKey =
      review.targetType === 'overall' || review.targetId === 'overall'
        ? 'overall'
        : String(review.targetId || 'overall')

    if (!byTarget[targetKey]) {
      byTarget[targetKey] = {
        count: 0,
        totalRating: 0,
        average: 0,
      }
    }
    byTarget[targetKey].count += 1
    byTarget[targetKey].totalRating += rating
  }

  Object.keys(byTarget).forEach((key) => {
    const entry = byTarget[key]
    entry.average =
      entry.count > 0
        ? Number((entry.totalRating / entry.count).toFixed(1))
        : 0
  })

  return {
    totalCount,
    verifiedCount,
    averageRating:
      totalCount > 0 ? Number((totalRating / totalCount).toFixed(1)) : 0,
    distribution,
    byTarget,
  }
}

export function getReviewerInitials(name = '') {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return 'RV'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0] || ''}${words[words.length - 1][0] || ''}`.toUpperCase()
}

export function formatReviewDate(isoDate) {
  if (!isoDate) return ''
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) return ''
  try {
    return parsed.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })
  } catch {
    return isoDate.slice(0, 10)
  }
}

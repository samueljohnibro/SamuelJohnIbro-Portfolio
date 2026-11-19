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

function isDisallowedHostname(hostname) {
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

function cleanPathSegments(pathname) {
  return String(pathname || '')
    .split('/')
    .map((seg) => seg.trim())
    .filter(Boolean)
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
    cleanHost === 'behance.net' ||
    cleanHost === 'dribbble.com' ||
    cleanHost === 'figma.com' ||
    cleanHost === 'read.cv' ||
    cleanHost === 'bento.me'
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
              : 'Bento'
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

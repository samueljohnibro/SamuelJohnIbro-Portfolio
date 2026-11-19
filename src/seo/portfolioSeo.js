import {
  DEFAULT_PORTFOLIO,
  isProjectLive,
  sortProjectsByStatusAndTimeline,
} from '../data/defaultPortfolio.js'
import { computeReviewsSummary } from '../data/reviewsMeta.js'

export const DEFAULT_CANONICAL_ORIGIN = 'https://sji.sjip.workers.dev'

const LOCAL_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
])

export function stripMarkdownBold(text = '') {
  return String(text || '').replace(/\*\*([^*]+)\*\*/g, '$1')
}

export function serializeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function parseHttpOrigin(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null
  try {
    const parsed = new URL(rawUrl.trim())
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.origin
    }
  } catch {
    return null
  }
  return null
}

export function resolveCanonicalOrigin(portfolio, requestUrl = '', env = null) {
  const envOrigin =
    parseHttpOrigin(env?.CANONICAL_ORIGIN) || parseHttpOrigin(env?.SITE_URL)
  if (envOrigin) return envOrigin

  const configuredOrigin = parseHttpOrigin(portfolio?.site?.seo?.canonicalUrl)
  if (configuredOrigin) return configuredOrigin

  if (requestUrl) {
    try {
      const parsed = new URL(requestUrl)
      if (
        parsed.protocol === 'https:' &&
        !LOCAL_HOSTNAMES.has(parsed.hostname.toLowerCase())
      ) {
        return parsed.origin
      }
    } catch {
      // Ignore malformed requestUrl and fall back to default canonical origin
    }
  }

  return DEFAULT_CANONICAL_ORIGIN
}

export function toAbsoluteUrl(rawUrl, origin = DEFAULT_CANONICAL_ORIGIN) {
  if (typeof rawUrl !== 'string') return ''
  const trimmed = rawUrl.trim()
  if (!trimmed || trimmed.startsWith('#')) return ''
  if (/^(mailto|tel|javascript|data|blob):/i.test(trimmed)) return ''

  try {
    if (trimmed.startsWith('/')) {
      return new URL(trimmed, origin).href
    }
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href
    }
  } catch {
    return ''
  }
  return ''
}

function dedupeStrings(items = [], limit = 60) {
  const seen = new Set()
  const result = []
  for (const raw of items) {
    const cleaned = String(raw || '').trim()
    if (!cleaned) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(cleaned)
    if (result.length >= limit) break
  }
  return result
}

function extractFullName(portfolio) {
  const brandName = String(
    portfolio?.site?.brandName || DEFAULT_PORTFOLIO.site.brandName
  ).trim()
  const footerLeft = String(portfolio?.site?.footerLeft || '')
    .replace(/©/g, '')
    .replace(/\{year\}/gi, '')
    .replace(/\b\d{4}\b/g, '')
    .trim()

  const heroDesc = stripMarkdownBold(portfolio?.hero?.description || '')
  const introMatch = heroDesc.match(
    /\b(?:I'm|I am)\s+([A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){1,4})/
  )
  const fullNameFromHero = introMatch?.[1]?.trim() || ''

  const fullName =
    footerLeft && footerLeft.length >= brandName.length
      ? footerLeft
      : fullNameFromHero || 'Samuel Silachomka John-Ibro'

  return { brandName, fullName }
}

function extractContactAndSocialLinks(portfolio, origin) {
  const actions = (portfolio?.contact?.actions || []).filter(
    (action) => action && action.visible !== false && action.href
  )

  let email = ''
  const externalUrls = []

  for (const action of actions) {
    const href = String(action.href || '').trim()
    if (/^mailto:/i.test(href) && !email) {
      email = href.replace(/^mailto:/i, '').split('?')[0].trim()
      continue
    }
    const abs = toAbsoluteUrl(href, origin)
    if (abs && !abs.startsWith(origin)) {
      externalUrls.push(abs)
    }
  }

  for (const extra of portfolio?.extras || []) {
    if (!extra || extra.visible === false) continue
    for (const candidate of [extra.ctaHref, extra.liveUrl]) {
      const abs = toAbsoluteUrl(candidate, origin)
      if (abs && !abs.startsWith(origin)) {
        externalUrls.push(abs)
      }
    }
  }

  return {
    email,
    sameAs: dedupeStrings(externalUrls, 20),
  }
}

export function collectDynamicKeywords(portfolio) {
  const { brandName, fullName } = extractFullName(portfolio)
  const seo = portfolio?.site?.seo || {}
  const orgName = String(seo.organizationName || 'chomkaTECH™').trim()
  const orgPlain = orgName.replace(/™/g, '').trim()

  const candidates = [
    brandName,
    fullName,
    orgName,
    orgPlain,
    ...(Array.isArray(seo.aliases) ? seo.aliases : []),
    ...String(seo.keywords || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  ]

  if (portfolio?.hero?.eyebrow) {
    for (const part of String(portfolio.hero.eyebrow).split(/[•|,]/)) {
      candidates.push(part.trim())
    }
  }

  for (const group of portfolio?.skills || []) {
    if (!group || group.visible === false) continue
    for (const item of group.items || []) {
      candidates.push(item)
    }
  }

  for (const project of portfolio?.projects || []) {
    if (!project || project.visible === false) continue
    candidates.push(project.title)
    for (const tag of project.tags || []) {
      candidates.push(tag)
    }
  }

  if (portfolio?.training?.visible !== false) {
    if (portfolio.training?.metaValue) {
      candidates.push(portfolio.training.metaValue)
    }
    for (const detail of portfolio.training?.details || []) {
      if (detail?.visible !== false && detail?.title) {
        candidates.push(detail.title)
      }
    }
  }

  for (const cred of portfolio?.credentials || []) {
    if (!cred || cred.visible === false) continue
    candidates.push(cred.title)
    if (cred.institution && !cred.institution.includes('•')) {
      candidates.push(cred.institution)
    }
  }

  for (const extra of portfolio?.extras || []) {
    if (!extra || extra.visible === false) continue
    for (const tag of extra.tags || []) {
      candidates.push(tag)
    }
  }

  return dedupeStrings(candidates, 45)
}

function inferImageMimeType(imageUrl) {
  if (/\.webp(\?|$)/i.test(imageUrl)) return 'image/webp'
  if (/\.png(\?|$)/i.test(imageUrl)) return 'image/png'
  if (/\.avif(\?|$)/i.test(imageUrl)) return 'image/avif'
  return 'image/jpeg'
}

export function extractVerificationToken(rawValue) {
  const trimmed = String(rawValue || '').trim()
  if (!trimmed) return ''
  const match = trimmed.match(/content\s*=\s*["']([^"']+)["']/i)
  const token = (match?.[1] || trimmed).trim()
  return token.replace(/[\s<>"']/g, '')
}

export function resolveSeoMetadata(
  portfolio,
  origin = DEFAULT_CANONICAL_ORIGIN,
  env = null
) {
  const { brandName, fullName } = extractFullName(portfolio)
  const seo = portfolio?.site?.seo || {}
  const { email, sameAs } = extractContactAndSocialLinks(portfolio, origin)

  const title =
    String(seo.title || '').trim() || DEFAULT_PORTFOLIO.site.seo.title
  const description =
    stripMarkdownBold(seo.description || '').trim() ||
    DEFAULT_PORTFOLIO.site.seo.description

  const rawOgImage = String(seo.ogImage || '').trim() || '/og-image.jpg'
  const ogImageUrl =
    toAbsoluteUrl(rawOgImage, origin) || `${origin}/og-image.jpg`
  const isDefaultOgCard =
    rawOgImage === '/og-image.jpg' || ogImageUrl.endsWith('/og-image.jpg')

  const jobTitle =
    String(seo.jobTitle || '').trim() ||
    'Software Engineer & Founder of chomkaTECH™'
  const organizationName =
    String(seo.organizationName || '').trim() || 'chomkaTECH™'
  const location = String(seo.location || '').trim()
  const keywords = collectDynamicKeywords(portfolio)

  const aliases = dedupeStrings(
    [
      fullName,
      brandName,
      ...(Array.isArray(seo.aliases) ? seo.aliases : []),
      'Samuel Silachomka John-Ibro',
      'Samuel John-Ibro',
    ],
    12
  )

  const googleSiteVerification = extractVerificationToken(
    env?.GOOGLE_SITE_VERIFICATION || seo.googleSiteVerification || ''
  )
  const bingSiteVerification = extractVerificationToken(
    env?.BING_SITE_VERIFICATION || seo.bingSiteVerification || ''
  )

  return {
    brandName,
    fullName,
    aliases,
    title,
    description,
    canonicalUrl: `${origin}/`,
    origin,
    keywords,
    keywordsContent: keywords.join(', '),
    author: fullName,
    siteName: brandName,
    jobTitle,
    organizationName,
    location,
    email,
    sameAs,
    ogImageUrl,
    ogImageType: inferImageMimeType(ogImageUrl),
    ogImageWidth: isDefaultOgCard ? '1200' : '',
    ogImageHeight: isDefaultOgCard ? '630' : '',
    ogImageAlt: `${brandName} (${fullName}) — ${jobTitle}`,
    twitterCard: 'summary_large_image',
    googleSiteVerification,
    bingSiteVerification,
  }
}

export function buildJsonLdGraph(
  portfolio,
  origin = DEFAULT_CANONICAL_ORIGIN,
  updatedAt = null,
  env = null,
  approvedReviews = []
) {
  const meta = resolveSeoMetadata(portfolio, origin, env)
  const sortedProjects = sortProjectsByStatusAndTimeline(portfolio?.projects || [])
  const visibleExtras = (portfolio?.extras || []).filter(
    (item) => item && item.visible !== false
  )
  const visibleCredentials = (portfolio?.credentials || []).filter(
    (item) => item && item.visible !== false
  )
  const visibleSkills = (portfolio?.skills || []).filter(
    (item) => item && item.visible !== false
  )

  const knowsAbout = dedupeStrings(
    [
      ...visibleSkills.flatMap((group) => group.items || []),
      ...sortedProjects.flatMap((project) => project.tags || []),
      ...visibleExtras.flatMap((extra) => extra.tags || []),
    ],
    50
  )

  const portraitAbs = toAbsoluteUrl(portfolio?.about?.image?.src || '', origin)
  const personImages = dedupeStrings([portraitAbs, meta.ogImageUrl], 4)

  const alumniOf = visibleCredentials
    .filter(
      (cred) =>
        String(cred.label || '').toUpperCase().includes('DEGREE') &&
        cred.institution
    )
    .map((cred) => ({
      '@type': 'CollegeOrUniversity',
      name: cred.institution,
    }))

  const hasCredential = visibleCredentials.map((cred) => {
    const entry = {
      '@type': 'EducationalOccupationalCredential',
      name: cred.title,
      credentialCategory: cred.label || 'Credential',
      description: cred.description || undefined,
      recognizedBy: cred.institution
        ? {
            '@type': 'Organization',
            name: cred.institution,
          }
        : undefined,
      url: cred.attachment?.src
        ? toAbsoluteUrl(cred.attachment.src, origin) || undefined
        : undefined,
    }
    return JSON.parse(JSON.stringify(entry))
  })

  const personNode = {
    '@type': 'Person',
    '@id': `${origin}/#person`,
    name: meta.brandName,
    alternateName: meta.aliases.filter(
      (alias) => alias.toLowerCase() !== meta.brandName.toLowerCase()
    ),
    ...(meta.brandName.toLowerCase() === 'samuel john-ibro'
      ? {
          givenName: 'Samuel',
          additionalName: 'Silachomka',
          familyName: 'John-Ibro',
        }
      : {}),
    jobTitle: meta.jobTitle,
    description: meta.description,
    url: `${origin}/`,
    mainEntityOfPage: { '@id': `${origin}/#webpage` },
    image: personImages.length === 1 ? personImages[0] : personImages,
    ...(meta.email ? { email: `mailto:${meta.email}` } : {}),
    ...(meta.location
      ? { homeLocation: { '@type': 'Place', name: meta.location } }
      : {}),
    worksFor: { '@id': `${origin}/#organization` },
    ...(alumniOf.length > 0 ? { alumniOf } : {}),
    ...(hasCredential.length > 0 ? { hasCredential } : {}),
    ...(knowsAbout.length > 0 ? { knowsAbout } : {}),
    ...(meta.sameAs.length > 0 ? { sameAs: meta.sameAs } : {}),
  }

  const reviewsEnabled = portfolio?.reviewsSection?.visible !== false
  const validReviews =
    reviewsEnabled && Array.isArray(approvedReviews) ? approvedReviews : []
  const reviewsSummary =
    validReviews.length > 0 ? computeReviewsSummary(validReviews) : null

  const orgNode = {
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name: meta.organizationName,
    alternateName: meta.organizationName.replace(/™/g, '').trim(),
    url: `${origin}/`,
    founder: { '@id': `${origin}/#person` },
    description:
      'Software and technology company founded by Samuel John-Ibro focused on building practical digital products, cloud systems, AI solutions, and creative platforms.',
    ...(reviewsSummary && reviewsSummary.totalCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Number(reviewsSummary.averageRating.toFixed(1)),
            bestRating: 5,
            worstRating: 1,
            ratingCount: reviewsSummary.totalCount,
            reviewCount: reviewsSummary.totalCount,
          },
          review: validReviews.slice(0, 10).map((rev) => ({
            '@type': 'Review',
            author: {
              '@type': 'Person',
              name: rev.reviewerName || 'Verified Collaborator',
              ...(rev.reviewerRole ? { jobTitle: rev.reviewerRole } : {}),
            },
            datePublished: rev.createdAt
              ? String(rev.createdAt).split('T')[0]
              : undefined,
            reviewBody: rev.comment,
            reviewRating: {
              '@type': 'Rating',
              ratingValue: Number(rev.rating || 5),
              bestRating: 5,
              worstRating: 1,
            },
          })),
        }
      : {}),
  }

  const websiteNode = {
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    name: meta.brandName,
    alternateName: dedupeStrings(
      [meta.fullName, `${meta.brandName} Portfolio`, meta.organizationName],
      6
    ),
    url: `${origin}/`,
    description: meta.description,
    inLanguage: 'en',
    author: { '@id': `${origin}/#person` },
    publisher: { '@id': `${origin}/#person` },
  }

  const workItems = [
    ...sortedProjects.map((project) => ({
      title: project.title,
      description: project.description,
      url: toAbsoluteUrl(project.liveUrl || '', origin) || `${origin}/#projects`,
      image: toAbsoluteUrl(project.logo?.src || '', origin),
      keywords: (project.tags || []).join(', '),
      status: isProjectLive(project) ? 'Published' : 'In Development',
    })),
    ...visibleExtras.map((extra) => ({
      title: extra.title,
      description: extra.description,
      url:
        toAbsoluteUrl(extra.ctaHref || extra.liveUrl || '', origin) ||
        `${origin}/#extras`,
      image: toAbsoluteUrl(extra.logo?.src || '', origin),
      keywords: (extra.tags || []).join(', '),
      status: extra.isLive ? 'Published' : 'Featured',
    })),
  ]

  const projectsListNode =
    workItems.length > 0
      ? {
          '@type': 'ItemList',
          '@id': `${origin}/#projects`,
          name: portfolio?.projectsSection?.heading || 'Selected work',
          numberOfItems: workItems.length,
          itemListElement: workItems.map((item, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            item: {
              '@type': 'CreativeWork',
              name: item.title,
              description: stripMarkdownBold(item.description),
              url: item.url,
              ...(item.image ? { image: item.image } : {}),
              ...(item.keywords ? { keywords: item.keywords } : {}),
              creativeWorkStatus: item.status,
              creator: { '@id': `${origin}/#person` },
              inLanguage: 'en',
            },
          })),
        }
      : null

  const trainingImages = (portfolio?.training?.media || [])
    .filter((m) => m && m.visible !== false && m.type === 'image' && m.src)
    .map((m) => toAbsoluteUrl(m.src, origin))
    .filter(Boolean)

  const trainingNode =
    portfolio?.training?.visible !== false
      ? {
          '@type': 'Course',
          '@id': `${origin}/#training`,
          name: portfolio.training?.metaValue
            ? `AWS Cloud Computing Training — ${portfolio.training.metaValue}`
            : 'AWS Cloud Computing Training',
          description: stripMarkdownBold(portfolio.training?.description || ''),
          provider: { '@id': `${origin}/#person` },
          instructor: { '@id': `${origin}/#person` },
          about: ['Amazon Web Services', 'Cloud Computing', 'Technical Training'],
          inLanguage: 'en',
          ...(trainingImages.length > 0 ? { image: trainingImages } : {}),
        }
      : null

  const breadcrumbNode = {
    '@type': 'BreadcrumbList',
    '@id': `${origin}/#breadcrumb`,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: meta.brandName,
        item: `${origin}/`,
      },
    ],
  }

  const webpageNode = {
    '@type': ['ProfilePage', 'WebPage'],
    '@id': `${origin}/#webpage`,
    url: `${origin}/`,
    name: meta.title,
    description: meta.description,
    inLanguage: 'en',
    isPartOf: { '@id': `${origin}/#website` },
    about: { '@id': `${origin}/#person` },
    mainEntity: { '@id': `${origin}/#person` },
    breadcrumb: { '@id': `${origin}/#breadcrumb` },
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: meta.ogImageUrl,
      ...(meta.ogImageWidth ? { width: Number(meta.ogImageWidth) } : {}),
      ...(meta.ogImageHeight ? { height: Number(meta.ogImageHeight) } : {}),
    },
    ...(updatedAt ? { dateModified: updatedAt } : {}),
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: [
        'h1',
        '.hero-description',
        '.about-text p',
        '.contact-section p',
      ],
    },
  }

  const graph = [
    personNode,
    orgNode,
    websiteNode,
    webpageNode,
    breadcrumbNode,
    ...(projectsListNode ? [projectsListNode] : []),
    ...(trainingNode ? [trainingNode] : []),
  ]

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  }
}

export function buildRobotsTxt(origin = DEFAULT_CANONICAL_ORIGIN) {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /admin',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
}

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function buildSitemapXml(
  portfolio,
  origin = DEFAULT_CANONICAL_ORIGIN,
  updatedAt = null
) {
  const { brandName, fullName } = extractFullName(portfolio)
  const lastModDate =
    updatedAt && !Number.isNaN(Date.parse(updatedAt))
      ? new Date(updatedAt).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]

  const imageEntries = []
  const seenImages = new Set()
  const addImage = (rawSrc, title, caption = '') => {
    const abs = toAbsoluteUrl(rawSrc, origin)
    if (!abs || seenImages.has(abs)) return
    if (/\.pdf(\?|$|#)/i.test(abs)) return
    seenImages.add(abs)
    imageEntries.push({ loc: abs, title, caption })
  }

  addImage(
    '/og-image.jpg',
    `${brandName} — Software Engineer & Founder of chomkaTECH™`,
    `Official engineering portfolio preview for ${brandName} (${fullName})`
  )

  if (portfolio?.about?.visible !== false && portfolio?.about?.image?.src) {
    addImage(
      portfolio.about.image.src,
      `${brandName} Portrait`,
      portfolio.about.image.alt || `${brandName} (${fullName})`
    )
  }

  for (const project of portfolio?.projects || []) {
    if (project?.visible !== false && project?.logo?.src) {
      addImage(
        project.logo.src,
        `${project.title} — ${brandName}`,
        project.logo.alt || project.description
      )
    }
  }

  if (portfolio?.training?.visible !== false) {
    for (const media of portfolio.training?.media || []) {
      if (media?.visible !== false && media?.type === 'image' && media?.src) {
        addImage(
          media.src,
          media.alt || `Cloud Computing Training — ${brandName}`,
          portfolio.training?.description || ''
        )
      }
    }
  }

  for (const cred of portfolio?.credentials || []) {
    if (
      cred?.visible !== false &&
      cred?.attachment?.src &&
      cred.attachment.type !== 'pdf'
    ) {
      addImage(
        cred.attachment.src,
        `${cred.title} — ${brandName}`,
        cred.description || cred.institution || ''
      )
    }
  }

  for (const extra of portfolio?.extras || []) {
    if (extra?.visible !== false && extra?.logo?.src) {
      addImage(
        extra.logo.src,
        extra.title || brandName,
        extra.description || ''
      )
    }
  }

  const imageXml = imageEntries
    .map(
      (img) => `    <image:image>
      <image:loc>${escapeXml(img.loc)}</image:loc>${
        img.title
          ? `\n      <image:title>${escapeXml(img.title)}</image:title>`
          : ''
      }${
        img.caption
          ? `\n      <image:caption>${escapeXml(stripMarkdownBold(img.caption))}</image:caption>`
          : ''
      }
    </image:image>`
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${escapeXml(`${origin}/`)}</loc>
    <lastmod>${escapeXml(lastModDate)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
${imageXml}
  </url>
</urlset>
`
}

export function buildLlmsTxt(
  portfolio,
  origin = DEFAULT_CANONICAL_ORIGIN,
  approvedReviews = []
) {
  const meta = resolveSeoMetadata(portfolio, origin)
  const lines = [
    `# ${meta.brandName} (${meta.fullName})`,
    '',
    `> ${meta.description}`,
    '',
    `- **Canonical URL**: ${origin}/`,
    `- **Role**: ${meta.jobTitle}`,
    `- **Organization**: ${meta.organizationName}`,
    ...(meta.email ? [`- **Email**: ${meta.email}`] : []),
    ...(meta.sameAs.length > 0
      ? [`- **Verified Profiles**: ${meta.sameAs.join(' | ')}`]
      : []),
    '',
  ]

  if (portfolio?.hero?.headline || portfolio?.hero?.description) {
    lines.push('## Overview', '')
    if (portfolio.hero.eyebrow) lines.push(`- **Focus**: ${portfolio.hero.eyebrow}`)
    if (portfolio.hero.headline) {
      lines.push(`- **Headline**: ${portfolio.hero.headline}`)
    }
    if (portfolio.hero.description) {
      lines.push('', stripMarkdownBold(portfolio.hero.description))
    }
    lines.push('')
  }

  if (
    portfolio?.about?.visible !== false &&
    Array.isArray(portfolio?.about?.paragraphs) &&
    portfolio.about.paragraphs.length > 0
  ) {
    lines.push(`## ${portfolio.about.heading || 'About'}`, '')
    for (const p of portfolio.about.paragraphs) {
      lines.push(stripMarkdownBold(p), '')
    }
  }

  const projects = sortProjectsByStatusAndTimeline(portfolio?.projects || [])
  if (portfolio?.projectsSection?.visible !== false && projects.length > 0) {
    lines.push('## Projects', '')
    for (const project of projects) {
      const tags = (project.tags || []).join(', ')
      const status = isProjectLive(project) ? 'LIVE' : project.status || 'IN DEVELOPMENT'
      lines.push(
        `### ${project.title} (${status})`,
        stripMarkdownBold(project.description),
        ...(tags ? [`- **Stack**: ${tags}`] : []),
        ...(project.liveUrl ? [`- **URL**: ${project.liveUrl}`] : []),
        ''
      )
    }
  }

  const skills = (portfolio?.skills || []).filter((s) => s && s.visible !== false)
  if (portfolio?.skillsSection?.visible !== false && skills.length > 0) {
    lines.push('## Technical Skills', '')
    for (const group of skills) {
      lines.push(`- **${group.title}**: ${(group.items || []).join(', ')}`)
    }
    lines.push('')
  }

  if (portfolio?.training?.visible !== false) {
    lines.push('## Training & Speaking', '')
    if (portfolio.training.metaValue) {
      lines.push(`- **Partner**: ${portfolio.training.metaValue}`)
    }
    if (portfolio.training.description) {
      lines.push(stripMarkdownBold(portfolio.training.description))
    }
    for (const detail of portfolio.training?.details || []) {
      if (detail?.visible !== false) {
        lines.push(`- **${detail.title}**: ${stripMarkdownBold(detail.description)}`)
      }
    }
    lines.push('')
  }

  const credentials = (portfolio?.credentials || []).filter(
    (c) => c && c.visible !== false
  )
  if (
    portfolio?.credentialsSection?.visible !== false &&
    credentials.length > 0
  ) {
    lines.push('## Education & Credentials', '')
    for (const cred of credentials) {
      lines.push(
        `- **${cred.title}** (${cred.institution || cred.label}): ${stripMarkdownBold(cred.description)}`
      )
    }
    lines.push('')
  }

  const extras = (portfolio?.extras || []).filter((e) => e && e.visible !== false)
  if (portfolio?.extrasSection?.visible !== false && extras.length > 0) {
    lines.push('## Creative Work', '')
    if (portfolio.extrasSection?.intro) {
      lines.push(stripMarkdownBold(portfolio.extrasSection.intro), '')
    }
    for (const extra of extras) {
      lines.push(
        `### ${extra.title}`,
        stripMarkdownBold(extra.description),
        ...(extra.ctaHref || extra.liveUrl
          ? [`- **URL**: ${extra.ctaHref || extra.liveUrl}`]
          : []),
        ''
      )
    }
  }

  if (
    portfolio?.reviewsSection?.visible !== false &&
    Array.isArray(approvedReviews) &&
    approvedReviews.length > 0
  ) {
    const summary = computeReviewsSummary(approvedReviews)
    lines.push(
      '## Reviews & Testimonials',
      '',
      `- **Average Rating**: ${summary.averageRating.toFixed(1)} / 5.0 (${summary.totalCount} reviews)`,
      ''
    )
    for (const rev of approvedReviews.slice(0, 12)) {
      lines.push(
        `- **${rev.reviewerName}**${rev.reviewerRole ? ` (${rev.reviewerRole})` : ''} [${rev.rating}/5]: "${rev.comment}"`
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}

export const REPO_MEDIA_ASSETS = [
  {
    id: 'asset-profile',
    label: 'Samuel Profile Portrait',
    type: 'image',
    src: '/assets/samuel-profile.png',
    category: 'profile',
  },
  {
    id: 'asset-silachomka-logo',
    label: 'silachomka Logo',
    type: 'image',
    src: '/assets/silachomka-logo.png',
    category: 'logo',
  },
  {
    id: 'asset-fixroomaun-logo',
    label: 'FixRoomAUN Logo',
    type: 'image',
    src: '/assets/fixroomaun-logo.png',
    category: 'logo',
  },
  {
    id: 'asset-studio-logo',
    label: 'Studio Logo',
    type: 'image',
    src: '/assets/studio-logo.png',
    category: 'logo',
  },
  {
    id: 'asset-training-1',
    label: 'Cloud Computing Training 1',
    type: 'image',
    src: '/assets/Cloud Computing Training 1.png',
    category: 'training',
  },
  {
    id: 'asset-training-2',
    label: 'Cloud Computing Training 2',
    type: 'image',
    src: '/assets/Cloud Computing Training 2.png',
    category: 'training',
  },
  {
    id: 'asset-training-3',
    label: 'Cloud Computing Training 3 (Video)',
    type: 'video',
    src: '/assets/Cloud Computing Training 3.mp4',
    category: 'training',
  },
  {
    id: 'asset-training-4',
    label: 'Cloud Computing Training 4 (Video)',
    type: 'video',
    src: '/assets/Cloud Computing Training 4.mp4',
    category: 'training',
  },
  {
    id: 'asset-training-5',
    label: 'Cloud Computing Training 5',
    type: 'image',
    src: '/assets/Cloud Computing Training 5.png',
    category: 'training',
  },
  {
    id: 'asset-training-slides-1',
    label: 'Training Slides 1',
    type: 'image',
    src: '/assets/training slides 1.png',
    category: 'training',
  },
  {
    id: 'asset-training-slides-2',
    label: 'Training Slides 2',
    type: 'image',
    src: '/assets/training slides 2.png',
    category: 'training',
  },
]

export const DEFAULT_PORTFOLIO = {
  version: 1,
  site: {
    brandName: 'Samuel John-Ibro',
    navLinks: [
      { id: 'nav-about', label: 'About', href: '#about', visible: true },
      { id: 'nav-projects', label: 'Projects', href: '#projects', visible: true },
      { id: 'nav-skills', label: 'Skills', href: '#skills', visible: true },
      { id: 'nav-training', label: 'Training', href: '#training', visible: true },
      { id: 'nav-credentials', label: 'Credentials', href: '#credentials', visible: true },
      { id: 'nav-extras', label: 'Extras', href: '#extras', visible: true },
      { id: 'nav-reviews', label: 'Reviews', href: '#reviews', visible: true },
      { id: 'nav-contact', label: 'Contact', href: '#contact', visible: true },
    ],
    footerLeft: '© {year} Samuel Silachomka John-Ibro',
    footerRight: 'Built by chomkaTECH™',
    seo: {
      title: 'Samuel John-Ibro — Software Engineer & Founder of chomkaTECH™',
      description:
        'Official portfolio of Samuel John-Ibro (Samuel Silachomka John-Ibro) — Software Engineer, AWS-certified builder, QA tester, and Founder of chomkaTECH™.',
      canonicalUrl: '',
      keywords:
        'Samuel John-Ibro, Samuel Silachomka John-Ibro, chomkaTECH, Software Engineer, Software Developer, QA Tester, Quality Engineering, AWS Certified Cloud Practitioner, Cloud, AI, Backend Development, Flutter, JavaScript, Python, silachomka',
      aliases: [
        'Samuel Silachomka John-Ibro',
        'Samuel S. John-Ibro',
        'silachomka',
        'chomkaTECH',
        'chomkaTECH™',
      ],
      jobTitle: 'Software Engineer & Founder of chomkaTECH™',
      organizationName: 'chomkaTECH™',
      location: '',
      ogImage: '/og-image.jpg',
      googleSiteVerification: '',
      bingSiteVerification: '',
    },
  },
  hero: {
    eyebrow: 'SOFTWARE ENGINEER • FOUNDER • BUILDER • QA TESTER',
    headline: 'I build software that solves real problems.',
    accentPhrase: 'solves real problems.',
    description:
      "I'm Samuel John-Ibro (Samuel Silachomka John-Ibro), a Software Engineer and AWS-certified developer focused on software development, cloud, AI, backend systems, and quality engineering. I'm also the founder of chomkaTECH™, a software and technology company focused on building practical digital products and solutions.",
    primaryCta: {
      label: 'View my work',
      href: '#projects',
      newTab: false,
    },
    secondaryCta: {
      label: 'Get in touch',
      href: '#contact',
      newTab: false,
    },
  },
  about: {
    visible: true,
    label: '01 — ABOUT',
    heading: 'Building with purpose.',
    paragraphs: [
      'I approach software engineering with a focus on practical problem solving, continuous learning, and building systems that can create meaningful impact.',
      'I am the founder of **chomkaTECH™**, a software and technology company through which I explore ideas, develop digital products, and build technology designed around real problems and real users.',
      'My interests span software engineering, cloud technologies, backend development, artificial intelligence, and quality engineering. I enjoy taking an idea from concept through design, development, testing, and iteration.',
      'Through both my professional work and the products I build, my goal is to create software that is useful, reliable, thoughtfully engineered, and capable of growing beyond the initial idea.',
    ],
    image: {
      src: '/assets/samuel-profile.png',
      alt: 'Samuel John-Ibro (Samuel Silachomka John-Ibro) — Software Engineer & Founder of chomkaTECH™',
    },
  },
  projectsSection: {
    visible: true,
    label: '02 — PROJECTS',
    heading: 'Selected work.',
  },
  projects: [
    {
      id: 'silachomka',
      status: 'LIVE',
      isLive: true,
      date: '',
      logo: {
        src: '/assets/silachomka-logo.png',
        alt: 'silachomka logo',
      },
      title: 'silachomka',
      description:
        'Official artist platform and creative web experience engineered for music releases, an interactive beat store, visual archive, and sonic catalog under chomkaMUSIC™.',
      tags: ['JavaScript', 'React', 'Beat Store', 'Vercel'],
      liveUrl: 'https://silachomka.vercel.app',
      liveLabel: 'VIEW LIVE PROJECT',
      liveAriaLabel: 'Open silachomka live project',
      showPreview: true,
      developmentNote: '',
      visible: true,
    },
    {
      id: 'fixroomaun',
      status: 'LIVE',
      isLive: true,
      date: '',
      logo: {
        src: '/assets/fixroomaun-logo.png',
        alt: 'FixRoomAUN logo',
      },
      title: 'FixRoomAUN',
      description:
        'A smart campus maintenance platform designed to improve how students report maintenance issues and how staff manage, track, and resolve them.',
      tags: ['JavaScript', 'Supabase', 'Netlify'],
      liveUrl: 'https://fixroom-aun.netlify.app',
      liveLabel: 'VIEW LIVE PROJECT',
      liveAriaLabel: 'Open FixRoomAUN live project',
      showPreview: true,
      developmentNote: '',
      visible: true,
    },
    {
      id: 'orbit',
      status: 'IN DEVELOPMENT',
      isLive: false,
      date: '',
      logo: null,
      title: 'Orbit',
      description:
        'A software product being developed as part of the chomkaTECH™ ecosystem, focused on delivering a practical, polished, and thoughtfully engineered web experience.',
      tags: ['JavaScript', 'Web Development', 'Product Development'],
      liveUrl: '',
      liveLabel: 'VIEW LIVE PROJECT',
      liveAriaLabel: 'Open Orbit live project',
      showPreview: true,
      developmentNote: 'Product development in progress.',
      visible: true,
    },
    {
      id: 'studio',
      status: 'IN DEVELOPMENT',
      isLive: false,
      date: '',
      logo: {
        src: '/assets/studio-logo.png',
        alt: 'Studio logo',
      },
      title: 'Studio',
      description:
        'A cross-platform creative workspace being developed by chomkaTECH™ for musicians, producers, and vocalists to capture, organize, edit, and manage their creative work.',
      tags: ['Flutter', 'Supabase', 'Audio'],
      liveUrl: '',
      liveLabel: 'VIEW LIVE PROJECT',
      liveAriaLabel: 'Open Studio live project',
      showPreview: true,
      developmentNote: 'Product development in progress.',
      visible: true,
    },
  ],
  skillsSection: {
    visible: true,
    label: '03 — SKILLS',
    heading: 'Technical toolkit.',
  },
  skills: [
    {
      id: 'skill-development',
      title: 'Development',
      items: ['JavaScript', 'Python', 'Dart', 'Java', 'SQL', 'HTML', 'CSS'],
      visible: true,
    },
    {
      id: 'skill-frameworks',
      title: 'Frameworks & Platforms',
      items: ['Flutter', 'Supabase', 'Firebase', 'REST APIs', 'PostgreSQL'],
      visible: true,
    },
    {
      id: 'skill-cloud',
      title: 'Cloud & Infrastructure',
      items: ['AWS', 'Lambda', 'DynamoDB', 'Netlify', 'Git', 'GitHub'],
      visible: true,
    },
    {
      id: 'skill-quality',
      title: 'Quality & AI',
      items: ['Functional Testing', 'QA', 'Bug Reporting', 'AI Evaluation'],
      visible: true,
    },
  ],
  training: {
    visible: true,
    label: '04 — TRAINING',
    heading: 'Sharing knowledge.',
    description:
      'AWS Cloud Computing Training delivered for the staff of Management Edge LTD, bringing practical cloud concepts and AWS-focused knowledge into a professional learning environment.',
    metaLabel: 'PROFESSIONAL TRAINING',
    metaValue: 'Management Edge LTD',
    media: [
      {
        id: 'training-img-1',
        type: 'image',
        src: '/assets/Cloud Computing Training 1.png',
        alt: 'AWS Cloud Computing Training session at Management Edge LTD',
        visible: true,
      },
      {
        id: 'training-img-2',
        type: 'image',
        src: '/assets/Cloud Computing Training 2.png',
        alt: 'AWS Cloud Computing Training at Management Edge LTD',
        visible: true,
      },
      {
        id: 'training-vid-3',
        type: 'video',
        src: '/assets/Cloud Computing Training 3.mp4',
        maxDurationMs: 4000,
        alt: 'AWS Cloud Computing Training session at Management Edge LTD',
        visible: true,
      },
      {
        id: 'training-vid-4',
        type: 'video',
        src: '/assets/Cloud Computing Training 4.mp4',
        maxDurationMs: 4000,
        alt: 'AWS Cloud Computing Training session at Management Edge LTD',
        visible: true,
      },
      {
        id: 'training-img-5',
        type: 'image',
        src: '/assets/Cloud Computing Training 5.png',
        alt: 'AWS Cloud Computing Training session at Management Edge LTD',
        visible: true,
      },
      {
        id: 'training-slides-1',
        type: 'image',
        src: '/assets/training slides 1.png',
        alt: 'AWS Cloud Computing Training presentation slides',
        visible: true,
      },
      {
        id: 'training-slides-2',
        type: 'image',
        src: '/assets/training slides 2.png',
        alt: 'AWS Cloud Computing Training presentation slides',
        visible: true,
      },
    ],
    details: [
      {
        id: 'training-detail-role',
        label: 'ROLE',
        title: 'Cloud Computing Trainer',
        description:
          'Delivered an AWS-focused cloud computing training session for Management Edge LTD staff, translating technical cloud concepts into practical learning material.',
        visible: true,
      },
      {
        id: 'training-detail-focus',
        label: 'FOCUS',
        title: 'AWS & Cloud Computing',
        description:
          'The training material covered cloud computing concepts and AWS technologies in a structured professional learning environment.',
        visible: true,
      },
      {
        id: 'training-detail-exp',
        label: 'EXPERIENCE',
        title: 'Technical Communication',
        description:
          'This experience reflects another part of my work as an engineer and builder: understanding technical subjects and communicating them clearly to other people.',
        visible: true,
      },
    ],
  },
  credentialsSection: {
    visible: true,
    label: '05 — CREDENTIALS',
    heading: 'Education & credentials.',
    summary:
      'I continue expanding my technical capabilities through practical projects, professional testing, software development, technical training, and ongoing learning.',
  },
  credentials: [
      {
        id: 'cred-degree',
        label: 'DEGREE',
        title: 'B.Sc. Software Engineering',
        institution: 'American University of Nigeria',
        description:
          "Bachelor's degree in Software Engineering with a focus on software development, systems, and engineering fundamentals.",
        attachment: null,
        visible: true,
      },
      {
        id: 'cred-aws',
        label: 'CERTIFICATION',
        title: 'AWS Certified Cloud Practitioner',
        institution: 'Amazon Web Services',
        description:
          'Foundational AWS certification covering cloud concepts, services, security, architecture, and pricing.',
        attachment: null,
        visible: true,
      },
      {
        id: 'cred-isc2',
        label: 'PROFESSIONAL',
        title: 'ISC2 Candidate',
        institution: 'ISC2',
        description:
          'Professional cybersecurity pathway supporting continued development in security and technology practices.',
        attachment: null,
        visible: true,
      },
      {
        id: 'cred-tech',
        label: 'TECHNICAL',
        title: '27+ Technical Certifications',
        institution: 'Software • AI • Cloud • Development',
        description:
          'Certifications and training across Python, Java, C++, AI, Flutter, Firebase, data structures, and related technical disciplines.',
        attachment: null,
        visible: true,
      },
  ],
  extrasSection: {
    visible: true,
    label: '06 — EXTRAS',
    heading: 'Beyond code.',
    intro:
      'Outside of software engineering and cloud systems, I produce music, sound design, and audio-visual creative work as **silachomka**, exploring beats, Afro trap, and Afro highlife within chomkaMUSIC™ and Chomka Nation.',
  },
  extras: [
    {
      id: 'silachomka-extra',
      status: 'LIVE',
      isLive: true,
      logo: {
        src: '/assets/silachomka-logo.png',
        alt: 'silachomka logo',
      },
      title: 'silachomka — Official Artist Home',
      subtitle: 'Music Producer • Artist • chomkaMUSIC™',
      liveUrl: 'https://silachomka.vercel.app',
      showPreview: true,
      description:
        'My official artist website featuring music releases, beat store, production catalog, and creative projects across Afro trap, Afro highlife, and experimental sound.',
      tags: [
        'Music Production',
        'Beat Store',
        'chomkaMUSIC™',
        'Sound Design',
        'Creative Direction',
      ],
      ctaLabel: 'VISIT ARTIST SITE',
      ctaHref: 'https://silachomka.vercel.app/',
      ctaAriaLabel: 'Open silachomka official artist website in a new tab',
      visible: true,
    },
  ],
  reviewsSection: {
    visible: true,
    label: '07 — REVIEWS',
    heading: 'Words from collaborators.',
    intro:
      'Ratings and reviews from clients, teammates, training participants, and users — with tagged profile pages so you can verify who wrote each review.',
    showProjectBadges: true,
  },
  contact: {
    visible: true,
    label: '08 — CONTACT',
    heading: "Let's build something meaningful.",
    description:
      "I'm open to software engineering, QA/testing, AI, cloud, product development, and technical opportunities where I can contribute, solve problems, and continue growing as an engineer and builder.",
    actions: [
      {
        id: 'contact-email',
        label: 'Contact me →',
        href: 'mailto:samueljohnibrotech@gmail.com',
        variant: 'primary',
        newTab: true,
        visible: true,
      },
      {
        id: 'contact-linkedin',
        label: 'LinkedIn ↗',
        href: 'https://www.linkedin.com/in/samueljohnibro/',
        variant: 'secondary',
        newTab: true,
        visible: true,
      },
      {
        id: 'contact-github',
        label: 'GitHub ↗',
        href: 'https://github.com/samueljohnibro/',
        variant: 'secondary',
        newTab: true,
        visible: true,
      },
    ],
  },
}

export function clonePortfolioData(data = DEFAULT_PORTFOLIO) {
  return JSON.parse(JSON.stringify(data))
}

export const isProjectLive = (project) => {
  if (!project) return false
  if (typeof project.isLive === 'boolean') {
    return project.isLive
  }
  if (typeof project.status === 'string' && project.status.trim()) {
    return project.status.trim().toUpperCase() === 'LIVE'
  }
  return Boolean(project.liveUrl || project.url)
}

function parseProjectTimestamp(project) {
  const rawDate =
    project.date ?? project.releasedAt ?? project.timeline ?? project.createdAt
  if (typeof rawDate === 'number' && Number.isFinite(rawDate)) {
    return rawDate
  }
  if (typeof rawDate === 'string' && rawDate.trim()) {
    const parsed = Date.parse(rawDate.trim())
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }
  return null
}

/** Sort projects with LIVE first and latest-to-oldest within each status. */
export function sortProjectsByStatusAndTimeline(projects = []) {
  return projects
    .filter((project) => project && project.visible !== false)
    .map((project, index) => ({
      project,
      index,
      statusRank: isProjectLive(project) ? 0 : 1,
      timestamp: parseProjectTimestamp(project),
    }))
    .sort((a, b) => {
      if (a.statusRank !== b.statusRank) {
        return a.statusRank - b.statusRank
      }
      const aHasDate = a.timestamp !== null
      const bHasDate = b.timestamp !== null
      if (aHasDate !== bHasDate) {
        return aHasDate ? -1 : 1
      }
      if (aHasDate && bHasDate && a.timestamp !== b.timestamp) {
        return b.timestamp - a.timestamp
      }
      return a.index - b.index
    })
    .map(({ project }, position) => ({
      ...project,
      number: String(position + 1).padStart(2, '0'),
    }))
}

export function resolveHeadlineParts(headline = '', accentPhrase = '') {
  const full = String(headline || '')
  const accent = String(accentPhrase || '').trim()
  if (!accent) {
    return { before: full, accent: '', after: '' }
  }
  const idx = full.toLowerCase().indexOf(accent.toLowerCase())
  if (idx === -1) {
    return { before: full, accent: '', after: '' }
  }
  return {
    before: full.slice(0, idx),
    accent: full.slice(idx, idx + accent.length),
    after: full.slice(idx + accent.length),
  }
}

export function toEmbedUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null
  try {
    const parsed = new URL(rawUrl.trim())
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
    if (host === 'youtu.be') {
      const videoId = parsed.pathname.slice(1).split('/')[0]
      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}?rel=0`
      }
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname.startsWith('/embed/')) {
        return rawUrl.trim()
      }
      const v = parsed.searchParams.get('v')
      if (v) {
        return `https://www.youtube.com/embed/${v}?rel=0`
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        const shortId = parsed.pathname.split('/')[2]
        if (shortId) return `https://www.youtube.com/embed/${shortId}?rel=0`
      }
    }
    if (host === 'vimeo.com') {
      const vimeoId = parsed.pathname.slice(1).split('/')[0]
      if (vimeoId && /^\d+$/.test(vimeoId)) {
        return `https://player.vimeo.com/video/${vimeoId}`
      }
    }
    if (host === 'player.vimeo.com') {
      return rawUrl.trim()
    }
  } catch {
    return null
  }
  return null
}

export function isSafeMediaOrLinkUrl(value, allowMailto = false) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return true
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true
  if (trimmed.startsWith('#')) return true
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return true
    if (allowMailto && (parsed.protocol === 'mailto:' || parsed.protocol === 'tel:')) {
      return true
    }
    return false
  } catch {
    return false
  }
}

export function normalizePortfolioData(raw) {
  const base = clonePortfolioData(DEFAULT_PORTFOLIO)
  if (!raw || typeof raw !== 'object') {
    return base
  }

  const pickStr = (val, fallback = '') =>
    typeof val === 'string' ? val : fallback
  const pickBool = (val, fallback = true) =>
    typeof val === 'boolean' ? val : fallback

  if (raw.site && typeof raw.site === 'object') {
    base.site.brandName = pickStr(raw.site.brandName, base.site.brandName)
    base.site.footerLeft = pickStr(raw.site.footerLeft, base.site.footerLeft)
    base.site.footerRight = pickStr(raw.site.footerRight, base.site.footerRight)
    if (Array.isArray(raw.site.navLinks)) {
      base.site.navLinks = raw.site.navLinks
        .filter((item) => item && typeof item === 'object')
        .map((item, idx) => ({
          id: pickStr(item.id, `nav-${idx + 1}`),
          label: pickStr(item.label, 'Section'),
          href: pickStr(item.href, '#home'),
          visible: pickBool(item.visible, true),
        }))
    }
    if (raw.site.seo && typeof raw.site.seo === 'object') {
      base.site.seo.title = pickStr(raw.site.seo.title, base.site.seo.title)
      base.site.seo.description = pickStr(
        raw.site.seo.description,
        base.site.seo.description
      )
      base.site.seo.canonicalUrl = pickStr(
        raw.site.seo.canonicalUrl,
        base.site.seo.canonicalUrl
      )
      base.site.seo.keywords = pickStr(
        raw.site.seo.keywords,
        base.site.seo.keywords
      )
      if (Array.isArray(raw.site.seo.aliases)) {
        base.site.seo.aliases = raw.site.seo.aliases
          .map((item) => String(item).trim())
          .filter(Boolean)
      } else if (typeof raw.site.seo.aliases === 'string') {
        base.site.seo.aliases = raw.site.seo.aliases
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      }
      base.site.seo.jobTitle = pickStr(
        raw.site.seo.jobTitle,
        base.site.seo.jobTitle
      )
      base.site.seo.organizationName = pickStr(
        raw.site.seo.organizationName,
        base.site.seo.organizationName
      )
      base.site.seo.location = pickStr(
        raw.site.seo.location,
        base.site.seo.location
      )
      base.site.seo.ogImage = pickStr(
        raw.site.seo.ogImage,
        base.site.seo.ogImage
      )
      base.site.seo.googleSiteVerification = pickStr(
        raw.site.seo.googleSiteVerification,
        base.site.seo.googleSiteVerification
      )
      base.site.seo.bingSiteVerification = pickStr(
        raw.site.seo.bingSiteVerification,
        base.site.seo.bingSiteVerification
      )
    }
  }

  if (raw.hero && typeof raw.hero === 'object') {
    base.hero.eyebrow = pickStr(raw.hero.eyebrow, base.hero.eyebrow)
    base.hero.headline = pickStr(raw.hero.headline, base.hero.headline)
    base.hero.accentPhrase = pickStr(raw.hero.accentPhrase, base.hero.accentPhrase)
    base.hero.description = pickStr(raw.hero.description, base.hero.description)
    if (raw.hero.primaryCta && typeof raw.hero.primaryCta === 'object') {
      base.hero.primaryCta = {
        label: pickStr(raw.hero.primaryCta.label, base.hero.primaryCta.label),
        href: pickStr(raw.hero.primaryCta.href, base.hero.primaryCta.href),
        newTab: pickBool(raw.hero.primaryCta.newTab, false),
      }
    }
    if (raw.hero.secondaryCta && typeof raw.hero.secondaryCta === 'object') {
      base.hero.secondaryCta = {
        label: pickStr(raw.hero.secondaryCta.label, base.hero.secondaryCta.label),
        href: pickStr(raw.hero.secondaryCta.href, base.hero.secondaryCta.href),
        newTab: pickBool(raw.hero.secondaryCta.newTab, false),
      }
    }
  }

  if (raw.about && typeof raw.about === 'object') {
    base.about.visible = pickBool(raw.about.visible, true)
    base.about.label = pickStr(raw.about.label, base.about.label)
    base.about.heading = pickStr(raw.about.heading, base.about.heading)
    if (Array.isArray(raw.about.paragraphs)) {
      base.about.paragraphs = raw.about.paragraphs
        .map((p) => (typeof p === 'string' ? p : ''))
        .filter((p) => p.trim().length > 0)
    }
    if (raw.about.image && typeof raw.about.image === 'object') {
      base.about.image = {
        src: pickStr(raw.about.image.src, base.about.image.src),
        alt: pickStr(raw.about.image.alt, base.about.image.alt),
      }
    }
  }

  if (raw.projectsSection && typeof raw.projectsSection === 'object') {
    base.projectsSection.visible = pickBool(raw.projectsSection.visible, true)
    base.projectsSection.label = pickStr(
      raw.projectsSection.label,
      base.projectsSection.label
    )
    base.projectsSection.heading = pickStr(
      raw.projectsSection.heading,
      base.projectsSection.heading
    )
  }

  if (Array.isArray(raw.projects)) {
    base.projects = raw.projects
      .filter((p) => p && typeof p === 'object')
      .map((p, idx) => ({
        id: pickStr(p.id, `project-${idx + 1}`),
        status: pickStr(p.status, p.isLive ? 'LIVE' : 'IN DEVELOPMENT'),
        isLive: pickBool(p.isLive, false),
        date: pickStr(p.date, ''),
        logo:
          p.logo && typeof p.logo === 'object' && pickStr(p.logo.src, '').trim()
            ? {
                src: pickStr(p.logo.src, ''),
                alt: pickStr(p.logo.alt, `${pickStr(p.title, 'Project')} logo`),
              }
            : null,
        title: pickStr(p.title, 'Untitled Project'),
        description: pickStr(p.description, ''),
        tags: Array.isArray(p.tags)
          ? p.tags.map((t) => String(t).trim()).filter(Boolean)
          : [],
        liveUrl: pickStr(p.liveUrl ?? p.url, ''),
        liveLabel: pickStr(p.liveLabel, 'VIEW LIVE PROJECT'),
        liveAriaLabel: pickStr(p.liveAriaLabel, ''),
        showPreview: pickBool(p.showPreview, true),
        developmentNote: pickStr(p.developmentNote, ''),
        visible: pickBool(p.visible, true),
      }))
  }

  if (raw.skillsSection && typeof raw.skillsSection === 'object') {
    base.skillsSection.visible = pickBool(raw.skillsSection.visible, true)
    base.skillsSection.label = pickStr(
      raw.skillsSection.label,
      base.skillsSection.label
    )
    base.skillsSection.heading = pickStr(
      raw.skillsSection.heading,
      base.skillsSection.heading
    )
  }

  if (Array.isArray(raw.skills)) {
    base.skills = raw.skills
      .filter((s) => s && typeof s === 'object')
      .map((s, idx) => ({
        id: pickStr(s.id, `skill-${idx + 1}`),
        title: pickStr(s.title, 'Skill Group'),
        items: Array.isArray(s.items)
          ? s.items.map((i) => String(i).trim()).filter(Boolean)
          : [],
        visible: pickBool(s.visible, true),
      }))
  }

  if (raw.training && typeof raw.training === 'object') {
    base.training.visible = pickBool(raw.training.visible, true)
    base.training.label = pickStr(raw.training.label, base.training.label)
    base.training.heading = pickStr(raw.training.heading, base.training.heading)
    base.training.description = pickStr(
      raw.training.description,
      base.training.description
    )
    base.training.metaLabel = pickStr(
      raw.training.metaLabel,
      base.training.metaLabel
    )
    base.training.metaValue = pickStr(
      raw.training.metaValue,
      base.training.metaValue
    )
    if (Array.isArray(raw.training.media)) {
      base.training.media = raw.training.media
        .filter((m) => m && typeof m === 'object' && pickStr(m.src, '').trim())
        .map((m, idx) => ({
          id: pickStr(m.id, `training-media-${idx + 1}`),
          type:
            m.type === 'video' || m.type === 'embed' ? m.type : 'image',
          src: pickStr(m.src, ''),
          alt: pickStr(m.alt, 'Training media'),
          maxDurationMs:
            Number.isFinite(Number(m.maxDurationMs)) && Number(m.maxDurationMs) >= 1500
              ? Number(m.maxDurationMs)
              : 4000,
          visible: pickBool(m.visible, true),
        }))
    }
    if (Array.isArray(raw.training.details)) {
      base.training.details = raw.training.details
        .filter((d) => d && typeof d === 'object')
        .map((d, idx) => ({
          id: pickStr(d.id, `training-detail-${idx + 1}`),
          label: pickStr(d.label, 'DETAIL'),
          title: pickStr(d.title, ''),
          description: pickStr(d.description, ''),
          visible: pickBool(d.visible, true),
        }))
    }
  }

  if (raw.credentialsSection && typeof raw.credentialsSection === 'object') {
    base.credentialsSection.visible = pickBool(
      raw.credentialsSection.visible,
      true
    )
    base.credentialsSection.label = pickStr(
      raw.credentialsSection.label,
      base.credentialsSection.label
    )
    base.credentialsSection.heading = pickStr(
      raw.credentialsSection.heading,
      base.credentialsSection.heading
    )
    base.credentialsSection.summary = pickStr(
      raw.credentialsSection.summary,
      base.credentialsSection.summary
    )
  }

  if (Array.isArray(raw.credentials)) {
    base.credentials = raw.credentials
      .filter((c) => c && typeof c === 'object')
      .map((c, idx) => {
        const rawAttach = c.attachment
        const attachSrc =
          rawAttach && typeof rawAttach === 'object'
            ? pickStr(rawAttach.src, '').trim()
            : ''
        const inferPdf = /\.pdf(\?|$|#)/i.test(attachSrc)
        const attachType =
          rawAttach?.type === 'pdf' || (rawAttach?.type !== 'image' && inferPdf)
            ? 'pdf'
            : 'image'
        const validShapes = ['auto', 'square', 'circle', 'landscape', 'portrait']
        const attachShape =
          attachType === 'image' && validShapes.includes(rawAttach?.shape)
            ? rawAttach.shape
            : 'auto'
        return {
          id: pickStr(c.id, `cred-${idx + 1}`),
          label: pickStr(c.label, 'CREDENTIAL'),
          title: pickStr(c.title, ''),
          institution: pickStr(c.institution, ''),
          description: pickStr(c.description, ''),
          attachment: attachSrc
            ? {
                src: attachSrc,
                type: attachType,
                shape: attachShape,
                label: pickStr(
                  rawAttach.label,
                  inferPdf ? 'View Certificate (PDF)' : 'View Certificate'
                ),
              }
            : null,
          visible: pickBool(c.visible, true),
        }
      })
  }

  if (raw.extrasSection && typeof raw.extrasSection === 'object') {
    base.extrasSection.visible = pickBool(raw.extrasSection.visible, true)
    base.extrasSection.label = pickStr(
      raw.extrasSection.label,
      base.extrasSection.label
    )
    base.extrasSection.heading = pickStr(
      raw.extrasSection.heading,
      base.extrasSection.heading
    )
    base.extrasSection.intro = pickStr(
      raw.extrasSection.intro,
      base.extrasSection.intro
    )
  }

  if (Array.isArray(raw.extras)) {
    base.extras = raw.extras
      .filter((e) => e && typeof e === 'object')
      .map((e, idx) => ({
        id: pickStr(e.id, `extra-${idx + 1}`),
        status: pickStr(e.status, e.isLive ? 'LIVE' : 'FEATURED'),
        isLive: pickBool(e.isLive, true),
        logo:
          e.logo && typeof e.logo === 'object' && pickStr(e.logo.src, '').trim()
            ? {
                src: pickStr(e.logo.src, ''),
                alt: pickStr(e.logo.alt, `${pickStr(e.title, 'Extra')} logo`),
              }
            : null,
        title: pickStr(e.title, 'Creative Project'),
        subtitle: pickStr(e.subtitle, ''),
        liveUrl: pickStr(e.liveUrl, ''),
        showPreview: pickBool(e.showPreview, true),
        description: pickStr(e.description, ''),
        tags: Array.isArray(e.tags)
          ? e.tags.map((t) => String(t).trim()).filter(Boolean)
          : [],
        ctaLabel: pickStr(e.ctaLabel, 'VISIT SITE'),
        ctaHref: pickStr(e.ctaHref ?? e.liveUrl, ''),
        ctaAriaLabel: pickStr(e.ctaAriaLabel, ''),
        visible: pickBool(e.visible, true),
      }))
  }

  if (raw.reviewsSection && typeof raw.reviewsSection === 'object') {
    base.reviewsSection.visible = pickBool(raw.reviewsSection.visible, true)
    base.reviewsSection.label = pickStr(
      raw.reviewsSection.label,
      base.reviewsSection.label
    )
    base.reviewsSection.heading = pickStr(
      raw.reviewsSection.heading,
      base.reviewsSection.heading
    )
    base.reviewsSection.intro = pickStr(
      raw.reviewsSection.intro,
      base.reviewsSection.intro
    )
    base.reviewsSection.showProjectBadges = pickBool(
      raw.reviewsSection.showProjectBadges,
      true
    )
  } else {
    // Seamless upgrade for D1 portfolio states saved before Reviews existed
    const hasReviewsNav = base.site.navLinks.some(
      (link) => link?.href === '#reviews' || link?.id === 'nav-reviews'
    )
    if (!hasReviewsNav) {
      const contactIdx = base.site.navLinks.findIndex(
        (link) => link?.href === '#contact' || link?.id === 'nav-contact'
      )
      const reviewsNavLink = {
        id: 'nav-reviews',
        label: 'Reviews',
        href: '#reviews',
        visible: true,
      }
      if (contactIdx >= 0) {
        base.site.navLinks.splice(contactIdx, 0, reviewsNavLink)
      } else {
        base.site.navLinks.push(reviewsNavLink)
      }
    }
  }

  if (raw.contact && typeof raw.contact === 'object') {
    base.contact.visible = pickBool(raw.contact.visible, true)
    base.contact.label = pickStr(raw.contact.label, base.contact.label)
    if (!raw.reviewsSection && base.contact.label.trim() === '07 — CONTACT') {
      base.contact.label = '08 — CONTACT'
    }
    base.contact.heading = pickStr(raw.contact.heading, base.contact.heading)
    base.contact.description = pickStr(
      raw.contact.description,
      base.contact.description
    )
    if (Array.isArray(raw.contact.actions)) {
      base.contact.actions = raw.contact.actions
        .filter((a) => a && typeof a === 'object')
        .map((a, idx) => ({
          id: pickStr(a.id, `contact-action-${idx + 1}`),
          label: pickStr(a.label, 'Link'),
          href: pickStr(a.href, '#'),
          variant: a.variant === 'primary' ? 'primary' : 'secondary',
          newTab: pickBool(a.newTab, true),
          visible: pickBool(a.visible, true),
        }))
    }
  }

  return base
}

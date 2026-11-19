import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  DEFAULT_PORTFOLIO,
  normalizePortfolioData,
  resolveHeadlineParts,
  sortProjectsByStatusAndTimeline,
} from '../data/defaultPortfolio.js'
import { useMasonryGrid } from '../hooks/useMasonryGrid.js'
import { CredentialModal } from './CredentialModal.jsx'
import { CredentialsGrid } from './CredentialsGrid.jsx'
import { ProjectPreviewModal, ProjectSitePreview } from './ProjectPreview.jsx'
import { ProjectsGrid } from './ProjectsGrid.jsx'
import { SpaceBackground } from './SpaceBackground.jsx'
import { TrainingCarousel } from './TrainingCarousel.jsx'

const TYPEWRITER_SPEED = 55
const TYPEWRITER_RESTART_DELAY = 7000
const PORTFOLIO_FONT =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

/**
 * Measure exact visual line-break boundaries and heights for the full headline
 * inside its live CSS box so words type onto their final line without jumping.
 */
function measureHeroLineLayout(measureEl, fullText) {
  if (!measureEl || !fullText || typeof window === 'undefined') {
    return null
  }

  const totalRect = measureEl.getBoundingClientRect()
  if (totalRect.width <= 0 || totalRect.height <= 0) {
    return null
  }

  const computed = window.getComputedStyle(measureEl)
  const fontSize = parseFloat(computed.fontSize) || 16
  const parsedLineHeight = parseFloat(computed.lineHeight)
  const lineHeightPx = Number.isFinite(parsedLineHeight)
    ? parsedLineHeight
    : fontSize * 0.97
  const lineBreakThreshold = Math.max(8, lineHeightPx * 0.45)

  const walker = document.createTreeWalker(measureEl, NodeFilter.SHOW_TEXT)
  const textRuns = []
  let cursor = 0
  let currentNode = walker.nextNode()
  while (currentNode) {
    const len = currentNode.textContent ? currentNode.textContent.length : 0
    if (len > 0) {
      textRuns.push({ node: currentNode, start: cursor, end: cursor + len })
      cursor += len
    }
    currentNode = walker.nextNode()
  }

  if (textRuns.length === 0 || cursor !== fullText.length) {
    return null
  }

  const range = document.createRange()
  const lineStarts = []
  let currentLineTop = null
  let runIndex = 0

  for (let i = 0; i < fullText.length; i += 1) {
    if (/\s/.test(fullText[i])) continue

    while (runIndex < textRuns.length && i >= textRuns[runIndex].end) {
      runIndex += 1
    }
    const run = textRuns[runIndex]
    if (!run) break

    const localOffset = i - run.start
    range.setStart(run.node, localOffset)
    range.setEnd(run.node, localOffset + 1)
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue

    if (currentLineTop === null) {
      lineStarts.push(0)
      currentLineTop = rect.top
    } else if (rect.top - currentLineTop > lineBreakThreshold) {
      lineStarts.push(i)
      currentLineTop = rect.top
    }
  }

  if (lineStarts.length === 0) {
    return null
  }

  const lines = lineStarts.map((start, idx) => ({
    start,
    end: idx + 1 < lineStarts.length ? lineStarts[idx + 1] : fullText.length,
  }))
  const perLineHeight = totalRect.height / lines.length
  const heights = lines.map((_, idx) =>
    idx + 1 === lines.length ? totalRect.height : perLineHeight * (idx + 1)
  )

  return { lines, heights }
}

/**
 * Extract before/accent/after substrings for a single visual line slice.
 */
function sliceLineHeadlineParts(
  activeText,
  lineStart,
  lineEnd,
  beforeEnd,
  accentEnd
) {
  const clampedEnd = Math.min(activeText.length, lineEnd)
  if (clampedEnd <= lineStart) {
    return { before: '', accent: '', after: '' }
  }

  const sliceRange = (rangeStart, rangeEnd) => {
    const start = Math.max(lineStart, rangeStart)
    const end = Math.min(clampedEnd, rangeEnd)
    return end > start ? activeText.slice(start, end) : ''
  }

  return {
    before: sliceRange(0, beforeEnd),
    accent: sliceRange(beforeEnd, accentEnd),
    after: sliceRange(accentEnd, clampedEnd),
  }
}

function renderHeadlineParts(parts) {
  return (
    <>
      {parts.before && (
        <span className="hero-primary-text">{parts.before}</span>
      )}
      {parts.accent && (
        <span className="hero-accent-text">{parts.accent}</span>
      )}
      {parts.after && (
        <span className="hero-primary-text">{parts.after}</span>
      )}
    </>
  )
}

function areHeroLineLayoutsEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  if (a.text !== b.text || a.accent !== b.accent) return false
  if (a.lines.length !== b.lines.length) return false
  for (let i = 0; i < a.lines.length; i += 1) {
    if (
      a.lines[i].start !== b.lines[i].start ||
      a.lines[i].end !== b.lines[i].end ||
      Math.abs(a.heights[i] - b.heights[i]) > 0.25
    ) {
      return false
    }
  }
  return true
}

function isCompactViewport() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 900px), (pointer: coarse)').matches
  )
}

/** Render **bold** inline segments safely without raw HTML injection. */
function renderRichText(text) {
  if (typeof text !== 'string' || !text.includes('**')) {
    return text
  }
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((segment, index) => {
    if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
      return <strong key={index}>{segment.slice(2, -2)}</strong>
    }
    return segment
  })
}

export function PortfolioPage({ initialData = DEFAULT_PORTFOLIO }) {
  const [portfolio, setPortfolio] = useState(() =>
    normalizePortfolioData(initialData)
  )
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [expandedProject, setExpandedProject] = useState(null)
  const [expandedCredential, setExpandedCredential] = useState(null)

  const heroText = portfolio.hero.headline || DEFAULT_PORTFOLIO.hero.headline
  const staticHeroMode =
    typeof window === 'undefined' ||
    !('IntersectionObserver' in window) ||
    isCompactViewport()
  const [typedHeroText, setTypedHeroText] = useState('')
  const [heroLineLayout, setHeroLineLayout] = useState(null)

  const typewriterTimerRef = useRef(null)
  const heroSectionRef = useRef(null)
  const heroMeasureRef = useRef(null)
  const previewReturnFocusRef = useRef(null)
  const skillsGridRef = useRef(null)

  // Fetch live portfolio content from Worker/D1 on mount & listen for cross-tab admin publishes
  useEffect(() => {
    let active = true

    const loadLivePortfolio = async () => {
      try {
        const res = await fetch('/api/portfolio', {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) return
        const payload = await res.json()
        if (active && payload?.data) {
          setPortfolio(normalizePortfolioData(payload.data))
        }
      } catch {
        // Gracefully retain bundled default portfolio when API is unreachable
      }
    }

    loadLivePortfolio()

    let channel = null
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('sji-portfolio-updates')
      channel.onmessage = (event) => {
        if (event?.data?.type === 'portfolio-updated' && event.data.data) {
          setPortfolio(normalizePortfolioData(event.data.data))
        } else {
          loadLivePortfolio()
        }
      }
    }

    return () => {
      active = false
      channel?.close()
    }
  }, [])

  // Sync document SEO metadata dynamically
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (portfolio.site?.seo?.title) {
      document.title = portfolio.site.seo.title
    }
    if (portfolio.site?.seo?.description) {
      const meta = document.querySelector('meta[name="description"]')
      if (meta) {
        meta.setAttribute('content', portfolio.site.seo.description)
      }
    }
  }, [portfolio.site?.seo?.title, portfolio.site?.seo?.description])

  const clearTypewriterTimer = () => {
    if (typewriterTimerRef.current) {
      window.clearTimeout(typewriterTimerRef.current)
      typewriterTimerRef.current = null
    }
  }

  const handleOpenPreview = useCallback((project, triggerElement) => {
    previewReturnFocusRef.current = triggerElement || null
    setExpandedProject(project)
  }, [])

  const handleClosePreview = useCallback(() => {
    setExpandedProject(null)
    const triggerEl = previewReturnFocusRef.current
    previewReturnFocusRef.current = null
    if (triggerEl && typeof triggerEl.focus === 'function') {
      requestAnimationFrame(() => {
        triggerEl.focus()
      })
    }
  }, [])

  const handleOpenCredential = useCallback((credential, triggerElement) => {
    previewReturnFocusRef.current = triggerElement || null
    setExpandedCredential(credential)
  }, [])

  const handleCloseCredential = useCallback(() => {
    setExpandedCredential(null)
    const triggerEl = previewReturnFocusRef.current
    previewReturnFocusRef.current = null
    if (triggerEl && typeof triggerEl.focus === 'function') {
      requestAnimationFrame(() => {
        triggerEl.focus()
      })
    }
  }, [])

  const handleCardPointerMove = useCallback((event) => {
    if (event.pointerType === 'touch') return
    const card = event.target.closest(
      '.project-card, .credential-card, .extra-card, .skills-grid > div, .training-details > article'
    )
    if (!card) return
    const rect = card.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    card.style.setProperty('--spot-x', `${x}px`)
    card.style.setProperty('--spot-y', `${y}px`)
  }, [])

  useEffect(() => {
    if (isNavOpen || expandedProject || expandedCredential) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (expandedCredential) {
          handleCloseCredential()
        } else if (expandedProject) {
          handleClosePreview()
        } else {
          setIsNavOpen(false)
        }
      }
    }

    const handleResize = () => {
      if (window.innerWidth > 900) {
        setIsNavOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResize)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResize)
    }
  }, [
    isNavOpen,
    expandedProject,
    expandedCredential,
    handleClosePreview,
    handleCloseCredential,
  ])

  useEffect(() => {
    const heroElement = heroSectionRef.current
    if (!heroElement || staticHeroMode || !heroText) {
      return undefined
    }

    let isDisposed = false
    let isHeroVisible = false

    const startTypingCycle = () => {
      if (isDisposed || !isHeroVisible) return

      clearTypewriterTimer()
      setTypedHeroText('')

      let currentIndex = 0
      const typeNextCharacter = () => {
        if (isDisposed || !isHeroVisible) return

        currentIndex += 1
        setTypedHeroText(heroText.slice(0, currentIndex))

        if (currentIndex < heroText.length) {
          typewriterTimerRef.current = window.setTimeout(
            typeNextCharacter,
            TYPEWRITER_SPEED
          )
        } else {
          typewriterTimerRef.current = window.setTimeout(
            startTypingCycle,
            TYPEWRITER_RESTART_DELAY
          )
        }
      }

      typewriterTimerRef.current = window.setTimeout(
        typeNextCharacter,
        TYPEWRITER_SPEED
      )
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return

        if (entry.isIntersecting) {
          if (isHeroVisible) return
          isHeroVisible = true
          startTypingCycle()
        } else {
          isHeroVisible = false
          clearTypewriterTimer()
          setTypedHeroText('')
        }
      },
      { threshold: 0.35 }
    )

    observer.observe(heroElement)

    return () => {
      isDisposed = true
      isHeroVisible = false
      observer.disconnect()
      clearTypewriterTimer()
    }
  }, [heroText, staticHeroMode])

  const headlineSplit = useMemo(
    () => resolveHeadlineParts(heroText, portfolio.hero.accentPhrase),
    [heroText, portfolio.hero.accentPhrase]
  )

  useLayoutEffect(() => {
    const measureEl = heroMeasureRef.current
    if (staticHeroMode || !measureEl) {
      return undefined
    }

    let active = true
    const updateLineLayout = () => {
      if (!active) return
      const measured = measureHeroLineLayout(measureEl, heroText)
      if (!measured) return
      const nextLayout = {
        text: heroText,
        accent: portfolio.hero.accentPhrase,
        ...measured,
      }
      setHeroLineLayout((prev) =>
        areHeroLineLayoutsEqual(prev, nextLayout) ? prev : nextLayout
      )
    }

    let observer = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateLineLayout)
      observer.observe(measureEl)
    }

    Promise.resolve().then(updateLineLayout)

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(updateLineLayout).catch(() => {})
    }

    return () => {
      active = false
      observer?.disconnect()
    }
  }, [heroText, portfolio.hero.accentPhrase, staticHeroMode])

  const activeHeroText = staticHeroMode ? heroText : typedHeroText
  const typedLen = activeHeroText.length
  const beforeEnd = headlineSplit.before.length
  const accentEnd = beforeEnd + headlineSplit.accent.length

  const activeLineLayout =
    !staticHeroMode &&
    heroLineLayout &&
    heroLineLayout.text === heroText &&
    heroLineLayout.accent === portfolio.hero.accentPhrase
      ? heroLineLayout
      : null

  let activeLineCount = 1
  if (activeLineLayout) {
    for (let i = 1; i < activeLineLayout.lines.length; i += 1) {
      if (typedLen > activeLineLayout.lines[i].start) {
        activeLineCount = i + 1
      } else {
        break
      }
    }
  }

  const heroHeadingHeight = activeLineLayout
    ? activeLineLayout.heights[activeLineCount - 1]
    : null
  const renderedHeroLines = activeLineLayout
    ? activeLineLayout.lines
        .slice(0, activeLineCount)
        .map((line) =>
          sliceLineHeadlineParts(
            activeHeroText,
            line.start,
            line.end,
            beforeEnd,
            accentEnd
          )
        )
    : null
  const fallbackHeroParts = !renderedHeroLines
    ? sliceLineHeadlineParts(activeHeroText, 0, typedLen, beforeEnd, accentEnd)
    : null

  const sortedProjects = useMemo(
    () => sortProjectsByStatusAndTimeline(portfolio.projects),
    [portfolio.projects]
  )

  const visibleNavLinks = useMemo(
    () => (portfolio.site?.navLinks || []).filter((link) => link.visible !== false),
    [portfolio.site?.navLinks]
  )

  const visibleSkills = useMemo(
    () => (portfolio.skills || []).filter((item) => item.visible !== false),
    [portfolio.skills]
  )

  useMasonryGrid({
    gridRef: skillsGridRef,
    cardSelector: ':scope > div',
    gapCssVar: '--skills-gap',
    defaultGap: 18,
    items: visibleSkills,
  })

  const visibleTrainingMedia = useMemo(
    () =>
      (portfolio.training?.media || []).filter(
        (item) => item && item.visible !== false && item.src
      ),
    [portfolio.training?.media]
  )

  const trainingMediaKey = useMemo(
    () =>
      visibleTrainingMedia
        .map((m) => `${m.id}:${m.type}:${m.src}`)
        .join('|'),
    [visibleTrainingMedia]
  )

  const visibleTrainingDetails = useMemo(
    () =>
      (portfolio.training?.details || []).filter(
        (item) => item.visible !== false
      ),
    [portfolio.training?.details]
  )

  const visibleCredentials = useMemo(
    () =>
      (portfolio.credentials || []).filter((item) => item.visible !== false),
    [portfolio.credentials]
  )

  const visibleExtras = useMemo(
    () => (portfolio.extras || []).filter((item) => item.visible !== false),
    [portfolio.extras]
  )

  const visibleContactActions = useMemo(
    () =>
      (portfolio.contact?.actions || []).filter(
        (item) => item.visible !== false
      ),
    [portfolio.contact?.actions]
  )

  const currentYear = String(new Date().getFullYear())
  const footerLeftText = (
    portfolio.site?.footerLeft || '© {year} Samuel Silachomka John-Ibro'
  ).replace(/\{year\}/g, currentYear)
  const footerRightText =
    portfolio.site?.footerRight || 'Built by chomkaTECH™'

  return (
    <main
      className="portfolio-app"
      onPointerMove={handleCardPointerMove}
      style={{ fontFamily: PORTFOLIO_FONT }}
    >
      <SpaceBackground />

      <style>
        {`
          .portfolio-app,
          .portfolio-app *,
          .portfolio-app h1,
          .portfolio-app h2,
          .portfolio-app h3,
          .portfolio-app h4,
          .portfolio-app h5,
          .portfolio-app h6,
          .portfolio-app p,
          .portfolio-app a,
          .portfolio-app button,
          .portfolio-app span,
          .portfolio-app strong,
          .portfolio-app li {
            font-family: ${PORTFOLIO_FONT} !important;
          }

          .portfolio-app .hero-section h1 {
            position: relative;
            width: 100%;
          }

          .portfolio-app .hero-section h1.hero-headline-animated {
            transition: height 220ms cubic-bezier(0.22, 1, 0.36, 1);
          }

          .portfolio-app .hero-typewriter {
            display: block;
            font-family: ${PORTFOLIO_FONT} !important;
          }

          .portfolio-app .hero-line {
            display: block;
            white-space: nowrap;
          }

          .portfolio-app .hero-measure {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            display: block;
            visibility: hidden;
            pointer-events: none;
            user-select: none;
            z-index: -1;
          }

          .portfolio-app .hero-primary-text {
            color: #a3a3a3;
            text-shadow: 0 0 40px rgba(163, 163, 163, 0.12);
          }

          .portfolio-app .hero-accent-text {
            color: #c89b3c;
            text-shadow:
              0 0 28px rgba(200, 155, 60, 0.22),
              0 0 54px rgba(158, 42, 71, 0.14);
          }

          .portfolio-app .hero-cursor-anchor {
            display: inline-block;
            position: relative;
            width: 0;
            height: 0.86em;
            vertical-align: -0.05em;
            pointer-events: none;
          }

          .portfolio-app .hero-cursor {
            position: absolute;
            left: 0.09em;
            top: 0;
            width: 0.055em;
            height: 100%;
            background: #c89b3c;
            box-shadow:
              0 0 10px rgba(200, 155, 60, 0.78),
              0 0 22px rgba(158, 42, 71, 0.36);
            border-radius: 1px;
            opacity: 1;
            animation: portfolioHeroCursorBlink 0.8s steps(1, end) infinite;
            will-change: opacity;
          }

          @keyframes portfolioHeroCursorBlink {
            0% { opacity: 1; }
            49% { opacity: 1; }
            50% { opacity: 0; }
            99% { opacity: 0; }
            100% { opacity: 1; }
          }

          .portfolio-app .navbar {
            position: fixed !important;
            top: 0;
            left: 0;
            right: 0;
            transform: none;
            width: 100%;
            margin: 0 !important;
            padding: 20px max(24px, calc(50% - var(--max-width) / 2));
            gap: clamp(16px, 2.5vw, 30px);
            z-index: 1000;
            background: rgba(10, 10, 10, 0.78);
            border-bottom: 1px solid rgba(163, 163, 163, 0.14);
            backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
          }

          .portfolio-app .brand {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding-block: 4px;
            line-height: 1.2;
          }

          .portfolio-app .hero-section {
            padding-top: 150px;
          }

          .portfolio-app .project-status {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            min-height: 39px;
            padding: 0 13px;
            border: 1px solid rgba(163, 163, 163, 0.18);
            border-radius: 999px;
            background: rgba(24, 24, 24, 0.64);
            color: rgba(235, 235, 235, 0.9);
            font-size: 0.68rem;
            font-weight: 800;
            letter-spacing: 0.09em;
            line-height: 1;
            text-transform: uppercase;
            white-space: nowrap;
          }

          .portfolio-app .status-live {
            border-color: rgba(158, 42, 71, 0.46);
            background: rgba(110, 20, 41, 0.22);
            color: rgba(244, 224, 229, 0.96);
          }

          .portfolio-app .status-live::before {
            content: '';
            width: 7px;
            height: 7px;
            flex-shrink: 0;
            border-radius: 50%;
            background: #c89b3c;
            box-shadow:
              0 0 0 3px rgba(200, 155, 60, 0.14),
              0 0 8px rgba(223, 183, 101, 0.78),
              0 0 16px rgba(158, 42, 71, 0.45);
            animation: fixroomLivePulse 2s ease-in-out infinite;
          }

          @keyframes fixroomLivePulse {
            0%, 100% {
              opacity: 0.78;
              box-shadow:
                0 0 0 3px rgba(200, 155, 60, 0.1),
                0 0 7px rgba(223, 183, 101, 0.55),
                0 0 13px rgba(158, 42, 71, 0.34);
            }
            50% {
              opacity: 1;
              box-shadow:
                0 0 0 3px rgba(200, 155, 60, 0.18),
                0 0 10px rgba(223, 183, 101, 0.88),
                0 0 20px rgba(158, 42, 71, 0.52);
            }
          }

          .portfolio-app .fixroom-live-link {
            width: fit-content;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            margin-top: 20px;
            padding: 7px 11px;
            border: 1px solid rgba(158, 42, 71, 0.48);
            border-radius: 999px;
            background: rgba(110, 20, 41, 0.24);
            color: #f2dce1;
            font-size: 0.67rem;
            font-weight: 800;
            letter-spacing: 0.08em;
            line-height: 1;
            text-transform: uppercase;
            transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, color 0.2s ease;
          }

          .portfolio-app .fixroom-live-link:hover {
            transform: translateY(-2px);
            border-color: rgba(200, 155, 60, 0.56);
            background: rgba(139, 27, 54, 0.4);
            box-shadow: 0 0 20px rgba(158, 42, 71, 0.34);
            color: #ffffff;
          }

          .portfolio-app .fixroom-live-arrow {
            font-size: 0.8rem;
            line-height: 1;
          }

          .portfolio-app .nav-toggle {
            display: none;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 5px;
            width: 40px;
            height: 40px;
            padding: 0;
            background: rgba(24, 24, 24, 0.68);
            border: 1px solid rgba(163, 163, 163, 0.18);
            border-radius: 8px;
            cursor: pointer;
            z-index: 1002;
            transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
          }

          .portfolio-app .nav-toggle:hover {
            background: rgba(110, 20, 41, 0.24);
            border-color: rgba(200, 155, 60, 0.48);
          }

          .portfolio-app .nav-toggle-bar {
            display: block;
            width: 19px;
            height: 2px;
            background-color: var(--text);
            border-radius: 2px;
            transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease, background-color 0.2s ease;
            transform-origin: center;
          }

          .portfolio-app .nav-toggle:hover .nav-toggle-bar {
            background-color: var(--accent);
          }

          .portfolio-app .nav-toggle.active .nav-toggle-bar:nth-child(1) {
            transform: translateY(7px) rotate(45deg);
          }

          .portfolio-app .nav-toggle.active .nav-toggle-bar:nth-child(2) {
            opacity: 0;
            transform: scaleX(0);
          }

          .portfolio-app .nav-toggle.active .nav-toggle-bar:nth-child(3) {
            transform: translateY(-7px) rotate(-45deg);
          }

          .portfolio-app .nav-links {
            min-width: 0;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: clamp(14px, 2vw, 28px);
          }

          .portfolio-app .nav-links a {
            display: inline-flex;
            align-items: center;
            padding-block: 4px;
            color: var(--muted);
            font-size: 0.82rem;
            font-weight: 500;
            line-height: 1.2;
            white-space: nowrap;
            transition: color 0.2s ease, text-shadow 0.2s ease, opacity 0.2s ease;
          }

          .portfolio-app .nav-links a:hover {
            color: var(--text);
            text-shadow: 0 0 14px rgba(200, 155, 60, 0.38);
          }

          @media (max-width: 900px) {
            .portfolio-app .navbar {
              width: 100%;
              padding: 16px max(24px, calc(50% - var(--max-width) / 2));
            }

            .portfolio-app .nav-toggle {
              display: flex;
            }

            .portfolio-app .nav-links {
              position: fixed;
              top: 0;
              left: 0;
              width: 100vw;
              height: 100dvh;
              overflow-y: auto;
              background: rgba(10, 10, 10, 0.96);
              backdrop-filter: blur(22px);
              -webkit-backdrop-filter: blur(22px);
              flex-direction: column;
              justify-content: center;
              align-items: center;
              gap: 20px;
              padding: 80px 24px 40px;
              opacity: 0;
              pointer-events: none;
              transform: translateY(-16px);
              transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
              z-index: 1001;
            }

            .portfolio-app .nav-links.nav-links-open {
              opacity: 1;
              pointer-events: auto;
              transform: translateY(0);
            }

            .portfolio-app .nav-links a {
              font-size: 1.18rem;
              font-weight: 600;
              color: var(--muted);
              padding: 8px 18px;
              border-radius: 8px;
              transition: color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
            }

            .portfolio-app .nav-links a:hover,
            .portfolio-app .nav-links a:active {
              color: var(--accent);
              background: rgba(110, 20, 41, 0.22);
              transform: translateX(4px);
            }
          }

          @media (max-width: 768px) {
            .portfolio-app .navbar {
              padding: 16px max(16px, calc(50% - var(--max-width) / 2));
            }

            .portfolio-app .hero-section {
              padding-top: 125px;
            }
          }

          @media (max-width: 480px) {
            .portfolio-app .navbar {
              width: 100%;
              padding: 14px 16px;
            }

            .portfolio-app .hero-section {
              padding-top: 110px;
            }
          }

          .portfolio-app .extras-section {
            position: relative;
          }

          .portfolio-app .extras-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 20px;
            margin-top: 55px;
          }

          .portfolio-app .extra-card {
            position: relative;
            overflow: hidden;
            padding: 36px;
            display: flex;
            flex-direction: column;
            border: 1px solid var(--border);
            border-radius: 16px;
            background:
              radial-gradient(
                520px circle at var(--spot-x, 50%) var(--spot-y, 0%),
                rgba(212, 212, 212, 0.075),
                rgba(163, 163, 163, 0.035) 45%,
                transparent 75%
              ),
              linear-gradient(
                155deg,
                rgba(24, 24, 24, 0.76),
                rgba(12, 12, 12, 0.86)
              );
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            box-shadow:
              0 18px 46px -14px rgba(0, 0, 0, 0.72),
              inset 0 1px 0 rgba(255, 255, 255, 0.08);
            transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.3s ease, box-shadow 0.3s ease, background 0.3s ease;
          }

          .portfolio-app .extra-card:hover {
            transform: translateY(-5px);
            border-color: var(--border-hover);
            box-shadow:
              0 24px 60px -12px rgba(0, 0, 0, 0.88),
              0 0 34px -6px rgba(158, 42, 71, 0.16),
              inset 0 1px 0 rgba(200, 155, 60, 0.22);
          }

          .portfolio-app .extra-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 15px;
          }

          .portfolio-app .extra-number {
            color: var(--accent);
            font-size: 0.68rem;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-shadow: 0 0 12px rgba(200, 155, 60, 0.32);
          }

          .portfolio-app .extra-header-info {
            margin-top: 24px;
          }

          .portfolio-app .extra-card .project-preview {
            margin-top: 22px;
          }

          @media (min-width: 769px) {
            .portfolio-app .extra-card .project-preview-viewport {
              aspect-ratio: 16 / 9;
              max-height: 460px;
            }
          }

          .portfolio-app .extra-card h3 {
            color: var(--text);
            font-size: 1.45rem;
            letter-spacing: -0.035em;
            font-weight: 750;
          }

          .portfolio-app .extra-subtitle {
            margin-top: 6px;
            color: var(--accent);
            font-size: 0.84rem;
            font-weight: 600;
            letter-spacing: 0.02em;
          }

          .portfolio-app .extra-card > p:not(.extra-number):not(.extra-subtitle) {
            margin-top: 20px;
            color: var(--muted);
            font-size: 0.92rem;
            line-height: 1.8;
          }

          .portfolio-app .extra-live-link {
            display: inline-flex;
            width: fit-content;
            align-items: center;
            justify-content: center;
            gap: 7px;
            margin-top: 26px;
            padding: 8px 14px;
            border: 1px solid rgba(158, 42, 71, 0.48);
            border-radius: 999px;
            background: rgba(110, 20, 41, 0.24);
            color: #f2dce1;
            font-size: 0.72rem;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, color 0.2s ease;
          }

          .portfolio-app .extra-live-link:hover {
            transform: translateY(-2px);
            border-color: rgba(200, 155, 60, 0.56);
            background: rgba(139, 27, 54, 0.4);
            box-shadow: 0 0 22px rgba(158, 42, 71, 0.34);
            color: #ffffff;
          }

          .portfolio-app .extra-live-arrow {
            font-size: 0.85rem;
            line-height: 1;
          }

          @media (max-width: 760px) {
            .portfolio-app .extra-card {
              padding: 26px;
            }

            .portfolio-app .extra-card h3 {
              font-size: 1.25rem;
            }
          }

          .training-embed-frame {
            width: 100%;
            height: 100%;
            border: 0;
            display: block;
            background: #070707;
          }
        `}
      </style>

      <header className="navbar">
        <a
          href="#home"
          className="brand"
          onClick={() => setIsNavOpen(false)}
        >
          <span className="brand-orbit-icon" aria-hidden="true" />
          <span>{portfolio.site?.brandName || 'Samuel John-Ibro'}</span>
        </a>

        <button
          type="button"
          className={`nav-toggle ${isNavOpen ? 'active' : ''}`}
          onClick={() => setIsNavOpen((prev) => !prev)}
          aria-label={isNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isNavOpen}
        >
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
        </button>

        <nav className={`nav-links ${isNavOpen ? 'nav-links-open' : ''}`}>
          {visibleNavLinks.map((link) => (
            <a
              key={link.id}
              href={link.href}
              onClick={() => setIsNavOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </header>

      <section id="home" className="hero-section" ref={heroSectionRef}>
        {portfolio.hero?.eyebrow && (
          <p className="eyebrow">{portfolio.hero.eyebrow}</p>
        )}

        <h1
          aria-label={heroText}
          className={heroHeadingHeight !== null ? 'hero-headline-animated' : undefined}
          style={
            heroHeadingHeight !== null
              ? { height: `${heroHeadingHeight}px` }
              : undefined
          }
        >
          {!staticHeroMode && (
            <span
              className="hero-measure"
              aria-hidden="true"
              ref={heroMeasureRef}
            >
              {renderHeadlineParts(headlineSplit)}
            </span>
          )}

          <span className="hero-typewriter" aria-hidden="true">
            {renderedHeroLines
              ? renderedHeroLines.map((parts, idx) => {
                  const isCurrentLine = idx === renderedHeroLines.length - 1
                  const hasText = Boolean(
                    parts.before || parts.accent || parts.after
                  )
                  return (
                    <span key={idx} className="hero-line">
                      {renderHeadlineParts(parts)}
                      {isCurrentLine && !hasText && '\u200b'}
                      {isCurrentLine && (
                        <span className="hero-cursor-anchor" aria-hidden="true">
                          <span className="hero-cursor" />
                        </span>
                      )}
                    </span>
                  )
                })
              : (
                <>
                  {renderHeadlineParts(fallbackHeroParts)}
                  {!activeHeroText && '\u200b'}
                  <span className="hero-cursor-anchor" aria-hidden="true">
                    <span className="hero-cursor" />
                  </span>
                </>
              )}
          </span>
        </h1>

        {portfolio.hero?.description && (
          <p className="hero-description">
            {renderRichText(portfolio.hero.description)}
          </p>
        )}

        <div className="hero-actions">
          {portfolio.hero?.primaryCta?.label && (
            <a
              href={portfolio.hero.primaryCta.href || '#projects'}
              target={portfolio.hero.primaryCta.newTab ? '_blank' : undefined}
              rel={portfolio.hero.primaryCta.newTab ? 'noreferrer' : undefined}
              className="primary-button"
            >
              {portfolio.hero.primaryCta.label}
            </a>
          )}

          {portfolio.hero?.secondaryCta?.label && (
            <a
              href={portfolio.hero.secondaryCta.href || '#contact'}
              target={portfolio.hero.secondaryCta.newTab ? '_blank' : undefined}
              rel={portfolio.hero.secondaryCta.newTab ? 'noreferrer' : undefined}
              className="secondary-button"
            >
              {portfolio.hero.secondaryCta.label}
            </a>
          )}
        </div>
      </section>

      {portfolio.about?.visible !== false && (
        <section id="about" className="section about-section">
          <p className="section-label">{portfolio.about.label}</p>

          <div className="about-content">
            <div className="about-text">
              <h2>{portfolio.about.heading}</h2>

              {(portfolio.about.paragraphs || []).map((paragraph, idx) => (
                <p key={idx}>{renderRichText(paragraph)}</p>
              ))}
            </div>

            {portfolio.about.image?.src && (
              <div className="about-image">
                <img
                  src={portfolio.about.image.src}
                  alt={portfolio.about.image.alt || 'Profile portrait'}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {portfolio.projectsSection?.visible !== false && (
        <section id="projects" className="section">
          <p className="section-label">{portfolio.projectsSection.label}</p>
          <h2>{portfolio.projectsSection.heading}</h2>

          <ProjectsGrid
            projects={sortedProjects}
            isPreviewModalOpen={Boolean(expandedProject)}
            onOpenPreview={handleOpenPreview}
          />
        </section>
      )}

      {portfolio.skillsSection?.visible !== false && (
        <section id="skills" className="section">
          <p className="section-label">{portfolio.skillsSection.label}</p>
          <h2>{portfolio.skillsSection.heading}</h2>

          <div ref={skillsGridRef} className="skills-grid">
            {visibleSkills.map((group) => (
              <div key={group.id}>
                <h3>{group.title}</h3>
                <p>{(group.items || []).join(' • ')}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {portfolio.training?.visible !== false && (
        <section id="training" className="section training-section">
          <p className="section-label">{portfolio.training.label}</p>

          <div className="training-heading">
            <div>
              <h2>{portfolio.training.heading}</h2>
              <p>{renderRichText(portfolio.training.description)}</p>
            </div>

            {(portfolio.training.metaLabel || portfolio.training.metaValue) && (
              <div className="training-meta">
                <span>{portfolio.training.metaLabel}</span>
                <strong>{portfolio.training.metaValue}</strong>
              </div>
            )}
          </div>

          {visibleTrainingMedia.length > 0 && (
            <TrainingCarousel
              key={trainingMediaKey}
              mediaItems={visibleTrainingMedia}
            />
          )}

          {visibleTrainingDetails.length > 0 && (
            <div className="training-details">
              {visibleTrainingDetails.map((detail) => (
                <article key={detail.id}>
                  <p className="training-detail-label">{detail.label}</p>
                  <h3>{detail.title}</h3>
                  <p>{detail.description}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {portfolio.credentialsSection?.visible !== false && (
        <section id="credentials" className="section credentials-section">
          <p className="section-label">{portfolio.credentialsSection.label}</p>
          <h2>{portfolio.credentialsSection.heading}</h2>

          <CredentialsGrid
            credentials={visibleCredentials}
            onOpenCredential={handleOpenCredential}
          />

          {portfolio.credentialsSection.summary && (
            <p className="credentials-summary">
              {portfolio.credentialsSection.summary}
            </p>
          )}
        </section>
      )}

      {portfolio.extrasSection?.visible !== false && (
        <section id="extras" className="section extras-section">
          <p className="section-label">{portfolio.extrasSection.label}</p>
          <h2>{portfolio.extrasSection.heading}</h2>

          {portfolio.extrasSection.intro && (
            <p>{renderRichText(portfolio.extrasSection.intro)}</p>
          )}

          <div className="extras-grid">
            {visibleExtras.map((extra, index) => {
              const ctaUrl = extra.ctaHref || extra.liveUrl
              const showPreview =
                Boolean(extra.liveUrl) && extra.showPreview !== false

              return (
                <article key={extra.id} className="extra-card">
                  <div className="extra-top">
                    <p className="extra-number">
                      {String(index + 1).padStart(2, '0')}
                    </p>

                    {extra.status && (
                      <span
                        className={`project-status${extra.isLive ? ' status-live' : ''}`}
                      >
                        {extra.status}
                      </span>
                    )}
                  </div>

                  {extra.logo?.src && (
                    <div className="project-logo">
                      <img
                        src={extra.logo.src}
                        alt={extra.logo.alt || `${extra.title} logo`}
                      />
                    </div>
                  )}

                  <div className="extra-header-info">
                    <h3>{extra.title}</h3>
                    {extra.subtitle && (
                      <p className="extra-subtitle">{extra.subtitle}</p>
                    )}
                  </div>

                  {showPreview && (
                    <ProjectSitePreview
                      title={extra.title}
                      url={extra.liveUrl}
                      isPaused={Boolean(expandedProject)}
                      onExpand={(triggerEl) =>
                        handleOpenPreview(
                          {
                            id: extra.id,
                            title: extra.title,
                            liveUrl: extra.liveUrl,
                            isLive: Boolean(extra.isLive),
                          },
                          triggerEl
                        )
                      }
                    />
                  )}

                  <p>{renderRichText(extra.description)}</p>

                  {Array.isArray(extra.tags) && extra.tags.length > 0 && (
                    <div className="project-tags">
                      {extra.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  )}

                  {ctaUrl && (
                    <a
                      href={ctaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="extra-live-link"
                      aria-label={
                        extra.ctaAriaLabel || `Open ${extra.title} in a new tab`
                      }
                    >
                      <span>{extra.ctaLabel || 'VISIT SITE'}</span>
                      <span className="extra-live-arrow" aria-hidden="true">
                        ↗
                      </span>
                    </a>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      )}

      {portfolio.contact?.visible !== false && (
        <section id="contact" className="section contact-section">
          <p className="section-label">{portfolio.contact.label}</p>
          <h2>{portfolio.contact.heading}</h2>
          <p>{renderRichText(portfolio.contact.description)}</p>

          <div className="contact-actions">
            {visibleContactActions.map((action) => (
              <a
                key={action.id}
                href={action.href}
                target={action.newTab !== false ? '_blank' : undefined}
                rel={action.newTab !== false ? 'noreferrer' : undefined}
                className={
                  action.variant === 'primary'
                    ? 'primary-button'
                    : 'secondary-button'
                }
              >
                {action.label}
              </a>
            ))}
          </div>
        </section>
      )}

      <footer>
        <p>{footerLeftText}</p>
        <p>{footerRightText}</p>
      </footer>

      {expandedProject && (
        <ProjectPreviewModal
          key={expandedProject.id}
          project={expandedProject}
          onClose={handleClosePreview}
        />
      )}

      {expandedCredential && (
        <CredentialModal
          key={expandedCredential.id}
          credential={expandedCredential}
          onClose={handleCloseCredential}
        />
      )}
    </main>
  )
}

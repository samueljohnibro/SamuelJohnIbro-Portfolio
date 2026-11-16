import { useLayoutEffect, useRef } from 'react'
import { isProjectLive } from '../data/defaultPortfolio.js'
import { ProjectSitePreview } from './ProjectPreview.jsx'

const PROJECTS_MOBILE_QUERY = '(max-width: 900px)'
const PROJECTS_COLUMN_TIE_TOLERANCE_PX = 1

function chooseBestColumnAssignments(heights, gap, columnCount = 2) {
  const count = heights.length
  if (count === 0) return []
  if (count === 1 || columnCount <= 1) return Array(count).fill(0)

  const greedyPredict = (colHeights) => {
    let targetCol = 0
    for (let col = 1; col < columnCount; col += 1) {
      if (
        colHeights[col] <
        colHeights[targetCol] - PROJECTS_COLUMN_TIE_TOLERANCE_PX
      ) {
        targetCol = col
      }
    }
    return targetCol
  }

  if (count > 12 || columnCount !== 2) {
    const colHeights = Array(columnCount).fill(0)
    return heights.map((height) => {
      const col = greedyPredict(colHeights)
      colHeights[col] += height + gap
      return col
    })
  }

  const restCount = count - 2
  const totalMasks = 1 << restCount
  let bestAssignments = null
  let bestMaxHeight = Number.POSITIVE_INFINITY
  let bestImbalance = Number.POSITIVE_INFINITY
  let bestGreedyMatches = -1

  for (let mask = 0; mask < totalMasks; mask += 1) {
    const colHeights = [heights[0] + gap, heights[1] + gap]
    const candidate = [0, 1]
    let greedyMatches = 2

    for (let bit = 0; bit < restCount; bit += 1) {
      const cardIndex = bit + 2
      const greedyCol = greedyPredict(colHeights)
      const col = (mask >> bit) & 1

      if (col === greedyCol) {
        greedyMatches += 1
      }

      candidate.push(col)
      colHeights[col] += heights[cardIndex] + gap
    }

    const finalCol0 = colHeights[0] > 0 ? colHeights[0] - gap : 0
    const finalCol1 = colHeights[1] > 0 ? colHeights[1] - gap : 0
    const maxHeight = Math.max(finalCol0, finalCol1)
    const imbalance = Math.abs(finalCol0 - finalCol1)

    const isStrictlyShorter =
      maxHeight < bestMaxHeight - PROJECTS_COLUMN_TIE_TOLERANCE_PX
    const isNearTieHeight =
      Math.abs(maxHeight - bestMaxHeight) <= PROJECTS_COLUMN_TIE_TOLERANCE_PX
    const isBetterTieBreak =
      isNearTieHeight &&
      (imbalance < bestImbalance - PROJECTS_COLUMN_TIE_TOLERANCE_PX ||
        (Math.abs(imbalance - bestImbalance) <=
          PROJECTS_COLUMN_TIE_TOLERANCE_PX &&
          greedyMatches > bestGreedyMatches))

    if (isStrictlyShorter || isBetterTieBreak) {
      bestMaxHeight = maxHeight
      bestImbalance = imbalance
      bestGreedyMatches = greedyMatches
      bestAssignments = candidate
    }
  }

  return bestAssignments
}

export function ProjectsGrid({ projects, isPreviewModalOpen, onOpenPreview }) {
  const gridRef = useRef(null)

  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return undefined

    const mediaQuery = window.matchMedia(PROJECTS_MOBILE_QUERY)
    let frameId = null
    let isDisposed = false

    const resetMasonryStyles = (cards) => {
      grid.classList.remove('is-masonry')
      grid.style.removeProperty('height')

      cards.forEach((card) => {
        card.style.removeProperty('width')
        card.style.removeProperty('left')
        card.style.removeProperty('top')
      })
    }

    const updateLayout = () => {
      if (isDisposed) return

      const cards = Array.from(grid.querySelectorAll(':scope > .project-card'))
      if (cards.length === 0) {
        grid.classList.remove('is-masonry')
        grid.style.removeProperty('height')
        return
      }

      if (mediaQuery.matches) {
        resetMasonryStyles(cards)
        return
      }

      const computed = window.getComputedStyle(grid)
      const gap =
        Number.parseFloat(computed.getPropertyValue('--projects-gap')) ||
        Number.parseFloat(computed.columnGap) ||
        18
      const gridWidth = grid.getBoundingClientRect().width

      if (gridWidth <= 0) return

      const columnCount = 2
      const columnWidth = (gridWidth - gap * (columnCount - 1)) / columnCount
      const nextWidth = `${columnWidth}px`

      grid.classList.add('is-masonry')

      cards.forEach((card) => {
        if (card.style.width !== nextWidth) {
          card.style.width = nextWidth
        }
      })

      const heights = cards.map((card) => card.getBoundingClientRect().height)
      const assignments = chooseBestColumnAssignments(
        heights,
        gap,
        columnCount
      )
      const columnHeights = Array(columnCount).fill(0)

      cards.forEach((card, index) => {
        const targetColumn = assignments[index] ?? 0
        const nextLeft = `${targetColumn * (columnWidth + gap)}px`
        const y = columnHeights[targetColumn]
        const nextTop = `${y}px`

        if (card.style.left !== nextLeft) {
          card.style.left = nextLeft
        }
        if (card.style.top !== nextTop) {
          card.style.top = nextTop
        }

        columnHeights[targetColumn] = y + heights[index] + gap
      })

      const maxHeight = Math.max(
        0,
        ...columnHeights.map((colHeight) => (colHeight > 0 ? colHeight - gap : 0))
      )
      const nextHeight = `${Math.ceil(maxHeight)}px`
      if (grid.style.height !== nextHeight) {
        grid.style.height = nextHeight
      }
    }

    const scheduleLayout = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        updateLayout()
      })
    }

    updateLayout()

    let resizeObserver = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleLayout)
      resizeObserver.observe(grid)
      Array.from(grid.querySelectorAll(':scope > .project-card')).forEach(
        (card) => {
          resizeObserver.observe(card)
        }
      )
    }

    const handleMediaChange = () => {
      updateLayout()
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleMediaChange)
    } else {
      mediaQuery.addListener(handleMediaChange)
    }

    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!isDisposed) {
          updateLayout()
        }
      })
    }

    return () => {
      isDisposed = true
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleMediaChange)
      } else {
        mediaQuery.removeListener(handleMediaChange)
      }
    }
  }, [projects])

  return (
    <div ref={gridRef} className="projects-grid">
      {projects.map((project) => {
        const liveUrl = project.liveUrl || project.url || null
        const isLive = isProjectLive(project)
        const showPreview = Boolean(liveUrl) && project.showPreview !== false

        return (
          <article key={project.id} className="project-card">
            <div className="project-top">
              <p className="project-number">{project.number}</p>

              <span
                className={`project-status${isLive ? ' status-live' : ''}`}
              >
                {project.status}
              </span>
            </div>

            {project.logo?.src && (
              <div className="project-logo">
                <img
                  src={project.logo.src}
                  alt={project.logo.alt || `${project.title} logo`}
                />
              </div>
            )}

            <h3>{project.title}</h3>

            {showPreview && (
              <ProjectSitePreview
                title={project.title}
                url={liveUrl}
                isPaused={isPreviewModalOpen}
                onExpand={(triggerEl) =>
                  onOpenPreview({ ...project, liveUrl, isLive }, triggerEl)
                }
              />
            )}

            <p>{project.description}</p>

            {Array.isArray(project.tags) && project.tags.length > 0 && (
              <div className="project-tags">
                {project.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}

            {liveUrl ? (
              <a
                href={liveUrl}
                target="_blank"
                rel="noreferrer"
                className="fixroom-live-link"
                aria-label={
                  project.liveAriaLabel || `Open ${project.title} live project`
                }
              >
                <span>{project.liveLabel || 'VIEW LIVE PROJECT'}</span>

                <span className="fixroom-live-arrow" aria-hidden="true">
                  ↗
                </span>
              </a>
            ) : (
              project.developmentNote && (
                <p className="project-development-note">
                  {project.developmentNote}
                </p>
              )
            )}
          </article>
        )
      })}
    </div>
  )
}

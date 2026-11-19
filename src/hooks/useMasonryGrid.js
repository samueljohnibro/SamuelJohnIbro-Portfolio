import { useCallback, useLayoutEffect } from 'react'

const DEFAULT_MOBILE_QUERY = '(max-width: 900px)'
const COLUMN_TIE_TOLERANCE_PX = 1
const EXACT_SEARCH_MAX_ITEMS = 14
const BEAM_WIDTH = 64
const PAIRED_LEFT_TOLERANCE_PX = 40
const MAX_PAIRED_RTL_DROP_PX = 64
const MIN_UNPAIRED_RTL_DROP_PX = 88
const MAX_UNPAIRED_RTL_DROP_PX = 140

function getRightToLeftMinDrop(prevTop, prevHeight, lastLeftTop, lastLeftHeight) {
  if (lastLeftTop >= prevTop - PAIRED_LEFT_TOLERANCE_PX) {
    return Math.min(Math.max(1, lastLeftHeight), MAX_PAIRED_RTL_DROP_PX)
  }

  return Math.min(
    Math.max(1, prevHeight),
    Math.max(
      MIN_UNPAIRED_RTL_DROP_PX,
      Math.min(prevHeight * 0.38, MAX_UNPAIRED_RTL_DROP_PX)
    )
  )
}

function scoreState(state, gap, isFinal = false) {
  const endLeft = state.col0 > 0 ? state.col0 - gap : 0
  const endRight = state.col1 > 0 ? state.col1 - gap : 0
  const maxHeight = Math.max(endLeft, endRight)
  const imbalance = Math.abs(endLeft - endRight)
  const rightOverhang = Math.max(0, endRight - endLeft)

  return (
    maxHeight +
    0.35 * imbalance +
    2.0 * state.totalSlack +
    (isFinal ? 0.6 * rightOverhang : 0.15 * rightOverhang)
  )
}

function advanceTwoColumnState(state, index, col, height, gap) {
  const { col0, col1, prevCol, prevTop, prevHeight, lastLeftTop, lastLeftHeight } =
    state

  let top
  let slack = 0

  if (col === 0) {
    top = col0
    if (prevCol === 1) {
      const minDrop = getRightToLeftMinDrop(
        prevTop,
        prevHeight,
        lastLeftTop,
        lastLeftHeight
      )
      if (top < prevTop + minDrop - COLUMN_TIE_TOLERANCE_PX || top <= prevTop) {
        return null
      }
    }
  } else {
    top = col1
    if (prevCol === 0 && top < prevTop) {
      slack = prevTop - top
      top = prevTop
    }
  }

  const nextEnd = top + height + gap

  return {
    col0: col === 0 ? nextEnd : col0,
    col1: col === 1 ? nextEnd : col1,
    prevCol: col,
    prevTop: top,
    prevHeight: height,
    lastLeftTop: col === 0 ? top : lastLeftTop,
    lastLeftHeight: col === 0 ? height : lastLeftHeight,
    totalSlack: state.totalSlack + slack,
    naturalMatches: state.naturalMatches + (col === index % 2 ? 1 : 0),
    positions: [...state.positions, { col, top }],
  }
}

/**
 * Compute smart 2-column (or k-column) masonry coordinates that:
 * 1. Never stretch a sibling card in the same row.
 * 2. Strictly preserve visual top-to-bottom, left-to-right reading order:
 *    - Card i+1 can NEVER start higher than card i.
 *    - A left-column card following a right-column card must start clearly
 *      below the right-column card so later cards never appear before earlier ones.
 * 3. Pack shorter cards comfortably under the shorter column (e.g. placing 05
 *    under 04 beside a tall 03) to eliminate wasted empty voids while avoiding
 *    awkward right-hanging orphans when columns are already nearly level.
 */
export function computeOrderedMasonryLayout(heights, gap, columnCount = 2) {
  const count = heights.length
  if (count === 0) return { positions: [], maxHeight: 0 }

  if (columnCount <= 1 || count === 1) {
    let y = 0
    const positions = heights.map((height) => {
      const pos = { col: 0, top: y }
      y += height + gap
      return pos
    })
    return { positions, maxHeight: Math.max(0, y - gap) }
  }

  if (columnCount !== 2) {
    const columnHeights = Array(columnCount).fill(0)
    const positions = []

    for (let index = 0; index < count; index += 1) {
      const col = index % columnCount
      let top = columnHeights[col]

      if (index > 0) {
        const prev = positions[index - 1]
        if (col === 0) {
          if (top <= prev.top + COLUMN_TIE_TOLERANCE_PX) {
            top = Math.max(top, columnHeights[prev.col])
          }
        } else {
          top = Math.max(top, prev.top)
        }
      }

      positions.push({ col, top })
      columnHeights[col] = top + heights[index] + gap
    }

    const maxHeight = Math.max(
      0,
      ...columnHeights.map((colHeight) => (colHeight > 0 ? colHeight - gap : 0))
    )

    return { positions, maxHeight }
  }

  // First two cards always form the clean top left/right pair.
  const initialState = {
    col0: heights[0] + gap,
    col1: heights[1] + gap,
    prevCol: 1,
    prevTop: 0,
    prevHeight: heights[1],
    lastLeftTop: 0,
    lastLeftHeight: heights[0],
    totalSlack: 0,
    naturalMatches: 2,
    positions: [
      { col: 0, top: 0 },
      { col: 1, top: 0 },
    ],
  }

  let frontier = [initialState]
  const useExactSearch = count <= EXACT_SEARCH_MAX_ITEMS

  for (let index = 2; index < count; index += 1) {
    const height = heights[index]
    const nextFrontier = []

    for (let s = 0; s < frontier.length; s += 1) {
      const state = frontier[s]
      const leftNext = advanceTwoColumnState(state, index, 0, height, gap)
      if (leftNext) nextFrontier.push(leftNext)
      const rightNext = advanceTwoColumnState(state, index, 1, height, gap)
      if (rightNext) nextFrontier.push(rightNext)
    }

    if (!useExactSearch && nextFrontier.length > BEAM_WIDTH) {
      nextFrontier.sort((a, b) => {
        const scoreDiff = scoreState(a, gap, false) - scoreState(b, gap, false)
        if (Math.abs(scoreDiff) > COLUMN_TIE_TOLERANCE_PX) return scoreDiff
        return b.naturalMatches - a.naturalMatches
      })
      frontier = nextFrontier.slice(0, BEAM_WIDTH)
    } else {
      frontier = nextFrontier
    }
  }

  let best = frontier[0]
  let bestScore = Number.POSITIVE_INFINITY

  for (let s = 0; s < frontier.length; s += 1) {
    const candidate = frontier[s]
    const score = scoreState(candidate, gap, true)
    const isBetter =
      score < bestScore - COLUMN_TIE_TOLERANCE_PX ||
      (Math.abs(score - bestScore) <= COLUMN_TIE_TOLERANCE_PX &&
        candidate.naturalMatches > (best?.naturalMatches ?? -1))

    if (isBetter) {
      best = candidate
      bestScore = score
    }
  }

  const endLeft = best.col0 > 0 ? best.col0 - gap : 0
  const endRight = best.col1 > 0 ? best.col1 - gap : 0

  return {
    positions: best.positions,
    maxHeight: Math.max(0, endLeft, endRight),
  }
}

export function chooseBestColumnAssignments(heights, gap, columnCount = 2) {
  return computeOrderedMasonryLayout(heights, gap, columnCount).positions.map(
    (pos) => pos.col
  )
}

/**
 * Dynamically lays out 2-column masonry cards above mobile breakpoints so
 * editing one card never stretches its unedited sibling in the same row.
 */
export function useMasonryGrid({
  gridRef,
  cardSelector,
  mobileQuery = DEFAULT_MOBILE_QUERY,
  gapCssVar = '',
  defaultGap = 18,
  items = [],
}) {
  const measureAndPosition = useCallback(() => {
    const grid = gridRef.current
    if (!grid || typeof window === 'undefined') return

    const cards = Array.from(grid.querySelectorAll(cardSelector))
    const resetMasonryStyles = () => {
      grid.classList.remove('is-masonry')
      grid.style.removeProperty('height')

      cards.forEach((card) => {
        card.style.removeProperty('width')
        card.style.removeProperty('left')
        card.style.removeProperty('top')
      })
    }

    if (cards.length === 0) {
      grid.classList.remove('is-masonry')
      grid.style.removeProperty('height')
      return
    }

    const mediaQuery = window.matchMedia(mobileQuery)
    if (mediaQuery.matches) {
      resetMasonryStyles()
      return
    }

    const computed = window.getComputedStyle(grid)
    const gapFromVar = gapCssVar
      ? Number.parseFloat(computed.getPropertyValue(gapCssVar))
      : Number.NaN
    const gap =
      gapFromVar ||
      Number.parseFloat(computed.columnGap) ||
      defaultGap
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
    const { positions, maxHeight } = computeOrderedMasonryLayout(
      heights,
      gap,
      columnCount
    )

    cards.forEach((card, index) => {
      const pos = positions[index] || { col: 0, top: 0 }
      const nextLeft = `${pos.col * (columnWidth + gap)}px`
      const nextTop = `${pos.top}px`

      if (card.style.left !== nextLeft) {
        card.style.left = nextLeft
      }
      if (card.style.top !== nextTop) {
        card.style.top = nextTop
      }
    })

    const nextHeight = `${Math.ceil(maxHeight)}px`
    if (grid.style.height !== nextHeight) {
      grid.style.height = nextHeight
    }
  }, [cardSelector, defaultGap, gapCssVar, gridRef, mobileQuery])

  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid || typeof window === 'undefined') return undefined

    const mediaQuery = window.matchMedia(mobileQuery)
    let frameId = null
    let isDisposed = false

    const scheduleLayout = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        if (!isDisposed) {
          measureAndPosition()
        }
      })
    }

    measureAndPosition()

    let resizeObserver = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleLayout)
      resizeObserver.observe(grid)
      Array.from(grid.querySelectorAll(cardSelector)).forEach((card) => {
        resizeObserver.observe(card)
      })
    }

    const handleMediaChange = () => {
      measureAndPosition()
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleMediaChange)
    } else {
      mediaQuery.addListener(handleMediaChange)
    }

    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!isDisposed) {
          measureAndPosition()
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
  }, [cardSelector, gridRef, items, measureAndPosition, mobileQuery])

  return measureAndPosition
}

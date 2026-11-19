import { useCallback, useLayoutEffect } from 'react'

const DEFAULT_MOBILE_QUERY = '(max-width: 900px)'
const COLUMN_TIE_TOLERANCE_PX = 1

/**
 * Compute 2-column (or k-column) masonry coordinates while strictly preserving
 * top-to-bottom, left-to-right reading order:
 * - Cards never stretch their sibling in the same row.
 * - Card i+1 can NEVER start higher than card i.
 * - Left-column cards (even indices) always start strictly below the previous
 *   row's right-column card, so a later card can never appear left of an
 *   earlier card.
 */
export function computeOrderedMasonryLayout(heights, gap, columnCount = 2) {
  const count = heights.length
  if (count === 0) return { positions: [], maxHeight: 0 }

  if (columnCount <= 1) {
    let y = 0
    const positions = heights.map((height) => {
      const pos = { col: 0, top: y }
      y += height + gap
      return pos
    })
    return { positions, maxHeight: Math.max(0, y - gap) }
  }

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

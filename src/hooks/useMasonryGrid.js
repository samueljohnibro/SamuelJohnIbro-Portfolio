import { useCallback, useLayoutEffect } from 'react'

const DEFAULT_MOBILE_QUERY = '(max-width: 900px)'
const COLUMN_TIE_TOLERANCE_PX = 1

export function chooseBestColumnAssignments(heights, gap, columnCount = 2) {
  const count = heights.length
  if (count === 0) return []
  if (count === 1 || columnCount <= 1) return Array(count).fill(0)

  const greedyPredict = (colHeights) => {
    let targetCol = 0
    for (let col = 1; col < columnCount; col += 1) {
      if (
        colHeights[col] <
        colHeights[targetCol] - COLUMN_TIE_TOLERANCE_PX
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
      maxHeight < bestMaxHeight - COLUMN_TIE_TOLERANCE_PX
    const isNearTieHeight =
      Math.abs(maxHeight - bestMaxHeight) <= COLUMN_TIE_TOLERANCE_PX
    const isBetterTieBreak =
      isNearTieHeight &&
      (imbalance < bestImbalance - COLUMN_TIE_TOLERANCE_PX ||
        (Math.abs(imbalance - bestImbalance) <= COLUMN_TIE_TOLERANCE_PX &&
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
    const assignments = chooseBestColumnAssignments(heights, gap, columnCount)
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

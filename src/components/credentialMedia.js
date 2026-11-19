export const VALID_CREDENTIAL_SHAPES = new Set([
  'badge',
  'square',
  'circle',
  'landscape',
  'portrait',
])

export function classifyImageAspect(width, height) {
  if (!width || !height) {
    return { ratio: 1, autoShape: 'square' }
  }

  const ratio = Number((width / height).toFixed(3))
  let autoShape = 'square'
  if (ratio > 1.22) {
    autoShape = 'landscape'
  } else if (ratio < 0.82) {
    autoShape = 'portrait'
  }
  return { ratio, autoShape }
}

/**
 * Inspect corner alpha channels on a tiny offscreen canvas to detect
 * transparent-background badges (hexagons, shields, seals, circular emblems)
 * versus opaque rectangular certificates.
 */
export function detectTransparentBadge(imgEl) {
  if (
    typeof document === 'undefined' ||
    !imgEl ||
    !imgEl.naturalWidth ||
    !imgEl.naturalHeight
  ) {
    return false
  }

  const size = 24
  try {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false

    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(imgEl, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)

    const alphaAt = (x, y) => data[(y * size + x) * 4 + 3]

    const outerCorners = [
      alphaAt(0, 0),
      alphaAt(size - 1, 0),
      alphaAt(0, size - 1),
      alphaAt(size - 1, size - 1),
    ]
    const innerCorners = [
      alphaAt(1, 1),
      alphaAt(size - 2, 1),
      alphaAt(1, size - 2),
      alphaAt(size - 2, size - 2),
    ]

    const transparentOuterCount = outerCorners.filter((a) => a < 32).length
    const transparentInnerCount = innerCorners.filter((a) => a < 160).length

    return transparentOuterCount === 4 && transparentInnerCount >= 2
  } catch {
    return false
  }
}

import { useRef, useState } from 'react'
import { useMasonryGrid } from '../hooks/useMasonryGrid.js'

const VALID_SHAPES = new Set([
  'square',
  'circle',
  'landscape',
  'portrait',
])

function classifyImageAspect(width, height) {
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

function CredentialCard({ cred, onOpenCredential, onMediaLayout }) {
  const [measured, setMeasured] = useState(null)

  const attach = cred.attachment?.src ? cred.attachment : null
  const isPdf = attach?.type === 'pdf'
  const attachLabel =
    attach?.label || (isPdf ? 'View Certificate (PDF)' : 'View Certificate')

  const configuredShape =
    !isPdf && VALID_SHAPES.has(attach?.shape) ? attach.shape : null
  const activeMetrics =
    !isPdf && attach?.src && measured?.src === attach.src ? measured : null
  const effectiveShape = attach
    ? isPdf
      ? 'pdf'
      : configuredShape || activeMetrics?.autoShape || 'square'
    : null

  const cardClassName = attach
    ? `credential-card has-attachment has-attachment-${effectiveShape}`
    : 'credential-card'

  const attachmentStyle =
    !isPdf && activeMetrics?.ratio
      ? { '--attach-ratio': String(activeMetrics.ratio) }
      : undefined

  const handleImageLoad = (event) => {
    if (!attach?.src) return
    const { naturalWidth, naturalHeight } = event.currentTarget
    const { ratio, autoShape } = classifyImageAspect(
      naturalWidth,
      naturalHeight
    )
    setMeasured((prev) => {
      if (
        prev?.src === attach.src &&
        prev.ratio === ratio &&
        prev.autoShape === autoShape
      ) {
        return prev
      }
      return { src: attach.src, ratio, autoShape }
    })
    onMediaLayout?.()
  }

  const copyBlock = (
    <div className="credential-card-copy">
      {cred.label && <p className="credential-label">{cred.label}</p>}
      <h3>{cred.title}</h3>
      {cred.institution && (
        <p className="credential-institution">{cred.institution}</p>
      )}
      {cred.description && (
        <p className="credential-description">{cred.description}</p>
      )}
    </div>
  )

  return (
    <article className={cardClassName}>
      {attach ? (
        <div className="credential-card-layout">
          {copyBlock}

          <div
            className={`credential-attachment is-${effectiveShape}`}
            style={attachmentStyle}
          >
            {isPdf ? (
              <button
                type="button"
                className="credential-pdf-card"
                onClick={(e) => onOpenCredential(cred, e.currentTarget)}
              >
                <span className="credential-pdf-top">
                  <span className="credential-pdf-badge">PDF</span>
                  <span className="credential-pdf-expand" aria-hidden="true">
                    ⤢
                  </span>
                </span>
                <span className="credential-pdf-meta">
                  <strong>{attachLabel}</strong>
                  <span>Preview certificate</span>
                </span>
              </button>
            ) : (
              <button
                type="button"
                className="credential-attachment-preview"
                onClick={(e) => onOpenCredential(cred, e.currentTarget)}
                aria-label={`Inspect ${cred.title} certificate or badge`}
              >
                <span className="credential-attachment-frame">
                  <img
                    key={attach.src}
                    src={attach.src}
                    alt={`${cred.title} certificate or badge`}
                    decoding="async"
                    onLoad={handleImageLoad}
                  />
                </span>
                <span className="credential-attachment-hint">
                  <span>{attachLabel}</span>
                  <span aria-hidden="true">⤢</span>
                </span>
              </button>
            )}
          </div>
        </div>
      ) : (
        copyBlock
      )}
    </article>
  )
}

export function CredentialsGrid({ credentials, onOpenCredential }) {
  const gridRef = useRef(null)

  const measureAndPosition = useMasonryGrid({
    gridRef,
    cardSelector: ':scope > .credential-card',
    gapCssVar: '--credentials-gap',
    defaultGap: 16,
    items: credentials,
  })

  return (
    <div ref={gridRef} className="credentials-grid">
      {credentials.map((cred) => (
        <CredentialCard
          key={cred.id}
          cred={cred}
          onOpenCredential={onOpenCredential}
          onMediaLayout={measureAndPosition}
        />
      ))}
    </div>
  )
}

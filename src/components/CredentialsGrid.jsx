import { useCallback, useEffect, useRef, useState } from 'react'
import { useMasonryGrid } from '../hooks/useMasonryGrid.js'
import {
  VALID_CREDENTIAL_SHAPES,
  classifyImageAspect,
  detectTransparentBadge,
} from './credentialMedia.js'

function CredentialCard({ cred, onOpenCredential, onMediaLayout }) {
  const [measured, setMeasured] = useState(null)
  const imgRef = useRef(null)

  const attach = cred.attachment?.src ? cred.attachment : null
  const attachSrc = attach?.src || ''
  const isPdf = attach?.type === 'pdf'
  const attachLabel =
    attach?.label || (isPdf ? 'View Certificate (PDF)' : 'View Certificate')

  const configuredShape =
    !isPdf && VALID_CREDENTIAL_SHAPES.has(attach?.shape) ? attach.shape : null
  const activeMetrics =
    !isPdf && attachSrc && measured?.src === attachSrc ? measured : null
  const isAutoPending = !isPdf && !configuredShape && !activeMetrics
  const effectiveShape = attach
    ? isPdf
      ? 'pdf'
      : configuredShape ||
        (activeMetrics?.isTransparentBadge
          ? 'badge'
          : activeMetrics?.autoShape) ||
        'square'
    : null

  const cardClassName = attach
    ? `credential-card has-attachment has-attachment-${effectiveShape}`
    : 'credential-card'

  const attachmentStyle =
    !isPdf && activeMetrics?.ratio
      ? { '--attach-ratio': String(activeMetrics.ratio) }
      : undefined

  const inspectImage = useCallback(
    (imgEl) => {
      if (!attachSrc || !imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) {
        return
      }
      const { naturalWidth, naturalHeight } = imgEl
      const { ratio, autoShape } = classifyImageAspect(
        naturalWidth,
        naturalHeight
      )
      const isTransparentBadge = detectTransparentBadge(imgEl)
      setMeasured((prev) => {
        if (
          prev?.src === attachSrc &&
          prev.ratio === ratio &&
          prev.autoShape === autoShape &&
          prev.isTransparentBadge === isTransparentBadge
        ) {
          return prev
        }
        return { src: attachSrc, ratio, autoShape, isTransparentBadge }
      })
      onMediaLayout?.()
    },
    [attachSrc, onMediaLayout]
  )

  useEffect(() => {
    if (isPdf || !attachSrc || typeof window === 'undefined') return undefined
    const frameId = window.requestAnimationFrame(() => {
      const imgEl = imgRef.current
      if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
        inspectImage(imgEl)
      }
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [attachSrc, inspectImage, isPdf])

  const handleImageLoad = (event) => {
    inspectImage(event.currentTarget)
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
            className={`credential-attachment is-${effectiveShape}${isAutoPending ? ' is-auto-pending' : ''}`}
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
                    ref={imgRef}
                    key={attach.src}
                    src={attach.src}
                    alt={`${cred.title} certificate or badge`}
                    loading="lazy"
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

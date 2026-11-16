import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

function getPreviewHostname(url) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function ProjectSitePreview({ title, url, isPaused = false, onExpand }) {
  const [loadedUrl, setLoadedUrl] = useState(null)
  const isLoaded = !isPaused && loadedUrl === url
  const hostname = getPreviewHostname(url)

  const handleExpand = (event) => {
    onExpand(event.currentTarget)
  }

  return (
    <div className="project-preview">
      <div className="project-preview-bar">
        <div className="project-preview-meta">
          <div className="project-preview-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span className="project-preview-url" title={url}>
            {hostname}
          </span>
        </div>

        <button
          type="button"
          className="project-preview-expand"
          onClick={handleExpand}
          aria-label={`Expand live site preview for ${title}`}
        >
          <span>Expand</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M7.5 1.5H10.5V4.5M4.5 10.5H1.5V7.5M10.5 1.5L6.75 5.25M1.5 10.5L5.25 6.75"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="project-preview-viewport">
        {!isPaused && !isLoaded && (
          <div className="project-preview-loading" aria-hidden="true">
            Loading live preview...
          </div>
        )}

        <div className="project-preview-frame">
          {!isPaused && (
            <iframe
              src={url}
              title={`${title} site preview`}
              loading="eager"
              scrolling="no"
              tabIndex={-1}
              aria-hidden="true"
              onLoad={() => setLoadedUrl(url)}
              className={`project-preview-iframe${isLoaded ? ' is-loaded' : ''}`}
            />
          )}
        </div>

        <button
          type="button"
          className="project-preview-trigger"
          onClick={handleExpand}
          aria-label={`Open interactive preview of ${title}`}
        >
          <span className="project-preview-hint">
            Interactive preview ⤢
          </span>
        </button>
      </div>
    </div>
  )
}

export function ProjectPreviewModal({ project, onClose }) {
  const [viewportMode, setViewportMode] = useState('desktop')
  const [loadedId, setLoadedId] = useState(null)
  const closeButtonRef = useRef(null)
  const isLoaded = loadedId === project.id
  const hostname = getPreviewHostname(project.liveUrl)

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  const modalContent = (
    <div
      className="project-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className="project-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
      >
        <div className="project-modal-header">
          <div className="project-modal-title-group">
            {project.isLive && (
              <span className="project-modal-live-pill">LIVE</span>
            )}
            <h3 id="project-modal-title">{project.title}</h3>
            <span className="project-modal-url" title={project.liveUrl}>
              {hostname}
            </span>
          </div>

          <div className="project-modal-actions">
            <div
              className="project-modal-viewport-toggle"
              role="group"
              aria-label="Preview viewport size"
            >
              <button
                type="button"
                className={viewportMode === 'desktop' ? 'active' : ''}
                aria-pressed={viewportMode === 'desktop'}
                onClick={() => setViewportMode('desktop')}
              >
                Desktop
              </button>
              <button
                type="button"
                className={viewportMode === 'mobile' ? 'active' : ''}
                aria-pressed={viewportMode === 'mobile'}
                onClick={() => setViewportMode('mobile')}
              >
                Mobile
              </button>
            </div>

            <a
              href={project.liveUrl}
              target="_blank"
              rel="noreferrer"
              className="project-modal-open-link"
            >
              <span>Open site</span>
              <span aria-hidden="true">↗</span>
            </a>

            <button
              ref={closeButtonRef}
              type="button"
              className="project-modal-close"
              onClick={onClose}
              aria-label="Close site preview"
            >
              ✕
            </button>
          </div>
        </div>

        <div
          className={`project-modal-body${viewportMode === 'mobile' ? ' is-mobile' : ''}`}
        >
          <div
            className={`project-modal-stage${viewportMode === 'mobile' ? ' is-mobile' : ''}`}
          >
            {!isLoaded && (
              <div className="project-preview-loading" aria-hidden="true">
                Loading interactive preview...
              </div>
            )}
            <iframe
              src={project.liveUrl}
              title={`${project.title} interactive site preview`}
              onLoad={() => setLoadedId(project.id)}
              className={`project-modal-iframe${isLoaded ? ' is-loaded' : ''}`}
            />
          </div>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') {
    return modalContent
  }

  return createPortal(modalContent, document.body)
}

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export function CredentialModal({ credential, onClose }) {
  const closeButtonRef = useRef(null)

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  if (!credential?.attachment?.src) {
    return null
  }

  const { attachment } = credential
  const isPdf = attachment.type === 'pdf'

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
        className="project-modal credential-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="credential-modal-title"
      >
        <div className="project-modal-header">
          <div className="project-modal-title-group">
            {credential.label && (
              <span className="project-modal-live-pill">{credential.label}</span>
            )}
            <h3 id="credential-modal-title">{credential.title}</h3>
            {credential.institution && (
              <span className="project-modal-url">{credential.institution}</span>
            )}
          </div>

          <div className="project-modal-actions">
            <a
              href={attachment.src}
              target="_blank"
              rel="noreferrer"
              className="project-modal-open-link"
            >
              <span>{isPdf ? 'Open PDF' : 'Open full image'}</span>
              <span aria-hidden="true">↗</span>
            </a>

            <button
              ref={closeButtonRef}
              type="button"
              className="project-modal-close"
              onClick={onClose}
              aria-label="Close certificate preview"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="project-modal-body credential-modal-body">
          {isPdf ? (
            <iframe
              src={attachment.src}
              title={`${credential.title} certificate PDF`}
              className="credential-modal-pdf"
            />
          ) : (
            <div className="credential-modal-image-wrap">
              <img
                src={attachment.src}
                alt={`${credential.title} certificate`}
                className="credential-modal-image"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') {
    return modalContent
  }

  return createPortal(modalContent, document.body)
}

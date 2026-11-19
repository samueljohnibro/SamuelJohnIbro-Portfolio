import { useRef, useState } from 'react'
import { FaviconCandidateImg } from '../components/ProjectLogo.jsx'
import { REPO_MEDIA_ASSETS } from '../data/defaultPortfolio.js'
import { formatBytes, uploadMediaFile } from './mediaUpload.js'

export function MediaField({
  label,
  value,
  onChange,
  accept = 'image/*',
  allowVideo = false,
  allowPdf = false,
  forcedType = null,
  allowClear = false,
  placeholder = 'https://... or /media/... or /assets/...',
  fallbackCandidates = [],
  fallbackHint = '',
  uploadedMedia = [],
  onMediaUploaded,
  onNotify,
}) {
  const fileInputRef = useRef(null)
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setIsUploading(true)
    setProgress(0)
    try {
      const uploaded = await uploadMediaFile(file, setProgress)
      onMediaUploaded?.(uploaded)
      let detectedType = 'image'
      if (uploaded.mimeType === 'application/pdf') {
        detectedType = 'pdf'
      } else if (uploaded.mimeType.startsWith('video/')) {
        detectedType = 'video'
      }
      onChange(uploaded.url, detectedType)
      onNotify?.(`Uploaded "${uploaded.filename}"`, 'success')
    } catch (error) {
      onNotify?.(error.message || 'Upload failed.', 'error')
    } finally {
      setIsUploading(false)
      setProgress(0)
    }
  }

  const isVideoPreview =
    allowVideo &&
    typeof value === 'string' &&
    /\.(mp4|webm|mov)(\?|$)/i.test(value)

  const isPdfPreview =
    allowPdf &&
    (forcedType === 'pdf' ||
      (typeof value === 'string' && /\.pdf(\?|$|#)/i.test(value)))

  const combinedLibrary = [
    ...uploadedMedia.map((f) => {
      let type = 'image'
      if (f.mimeType === 'application/pdf') type = 'pdf'
      else if (f.mimeType?.startsWith('video/')) type = 'video'
      return {
        id: f.id,
        label: f.filename,
        src: f.url,
        type,
        badge: `Uploaded (${formatBytes(f.byteSize)})`,
      }
    }),
    ...REPO_MEDIA_ASSETS.map((a) => ({
      id: a.id,
      label: a.label,
      src: a.src,
      type: a.type,
      badge: 'Built-in asset',
    })),
  ].filter(
    (item) =>
      item.type === 'image' ||
      (allowVideo && item.type === 'video') ||
      (allowPdf && item.type === 'pdf')
  )

  const hasAutoFaviconFallback =
    !value && Array.isArray(fallbackCandidates) && fallbackCandidates.length > 0

  return (
    <div className="admin-media-box">
      {label && (
        <span className="admin-field-label">
          <span>{label}</span>
          {hasAutoFaviconFallback && (
            <span className="admin-field-hint" style={{ color: 'var(--accent)' }}>
              {fallbackHint || 'Auto-using site favicon'}
            </span>
          )}
        </span>
      )}

      <div className="admin-media-row">
        <div className="admin-media-thumb">
          {!value ? (
            hasAutoFaviconFallback ? (
              <FaviconCandidateImg
                candidates={fallbackCandidates}
                alt={label || 'Site favicon'}
                fallback={<span>None</span>}
                style={{ objectFit: 'contain', padding: '10px' }}
              />
            ) : (
              <span>None</span>
            )
          ) : isPdfPreview ? (
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>PDF</span>
          ) : isVideoPreview ? (
            <video src={value} muted playsInline />
          ) : (
            <img src={value} alt={label || 'Selected media'} />
          )}
        </div>

        <div className="admin-media-controls">
          <input
            type="text"
            className="admin-input"
            value={value || ''}
            onChange={(e) => {
              const nextVal = e.target.value
              const inferred =
                allowPdf && /\.pdf(\?|$|#)/i.test(nextVal) ? 'pdf' : undefined
              onChange(nextVal, inferred)
            }}
            placeholder={placeholder}
          />

          <div className="admin-media-buttons">
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              onChange={handleFileChange}
              hidden
            />

            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-gold"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? `Uploading ${progress}%...` : 'Upload File'}
            </button>

            <button
              type="button"
              className="admin-btn admin-btn-sm"
              onClick={() => setIsPickerOpen(true)}
            >
              Choose from Library
            </button>

            {allowClear && value && (
              <button
                type="button"
                className="admin-btn admin-btn-sm admin-btn-danger"
                onClick={() => onChange('')}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {isPickerOpen && (
        <div
          className="admin-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsPickerOpen(false)
          }}
        >
          <div className="admin-modal" role="dialog" aria-modal="true">
            <div className="admin-modal-header">
              <strong>Select Media Asset</strong>
              <button
                type="button"
                className="admin-btn admin-btn-sm"
                onClick={() => setIsPickerOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="admin-modal-body">
              <div className="admin-vault-grid">
                {combinedLibrary.map((asset) => (
                  <div key={asset.id} className="admin-vault-card">
                    <div className="admin-vault-preview">
                      {asset.type === 'pdf' ? (
                        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                          PDF DOCUMENT
                        </span>
                      ) : asset.type === 'video' ? (
                        <video src={asset.src} muted playsInline />
                      ) : (
                        <img src={asset.src} alt={asset.label} />
                      )}
                    </div>
                    <div className="admin-vault-meta">
                      <strong title={asset.label}>{asset.label}</strong>
                      <span>{asset.badge}</span>
                      <button
                        type="button"
                        className="admin-btn admin-btn-sm admin-btn-primary"
                        onClick={() => {
                          onChange(asset.src, asset.type)
                          setIsPickerOpen(false)
                        }}
                      >
                        Use Asset
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

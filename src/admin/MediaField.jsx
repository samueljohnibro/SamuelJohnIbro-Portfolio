import { useRef, useState } from 'react'
import { REPO_MEDIA_ASSETS } from '../data/defaultPortfolio.js'
import { formatBytes, uploadMediaFile } from './mediaUpload.js'

export function MediaField({
  label,
  value,
  onChange,
  accept = 'image/*',
  allowVideo = false,
  allowClear = false,
  placeholder = 'https://... or /media/... or /assets/...',
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
      const detectedType = uploaded.mimeType.startsWith('video/')
        ? 'video'
        : 'image'
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

  const combinedLibrary = [
    ...uploadedMedia.map((f) => ({
      id: f.id,
      label: f.filename,
      src: f.url,
      type: f.mimeType?.startsWith('video/') ? 'video' : 'image',
      badge: `Uploaded (${formatBytes(f.byteSize)})`,
    })),
    ...REPO_MEDIA_ASSETS.map((a) => ({
      id: a.id,
      label: a.label,
      src: a.src,
      type: a.type,
      badge: 'Built-in asset',
    })),
  ].filter((item) => allowVideo || item.type === 'image')

  return (
    <div className="admin-media-box">
      {label && <span className="admin-field-label">{label}</span>}

      <div className="admin-media-row">
        <div className="admin-media-thumb">
          {!value ? (
            <span>None</span>
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
            onChange={(e) => onChange(e.target.value)}
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
                      {asset.type === 'video' ? (
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

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  MAX_PROFILES_PER_REVIEW,
  MAX_REVIEWER_NAME_LENGTH,
  MAX_REVIEWER_ROLE_LENGTH,
  MAX_REVIEW_COMMENT_LENGTH,
  MIN_REVIEW_COMMENT_LENGTH,
  PROFILE_PLATFORM_PRESETS,
  REVIEW_RELATIONSHIPS,
  classifyProfileUrl,
  saveMyReviewSession,
} from '../data/reviewsMeta.js'
import { PlatformIcon } from './ProfilePlatformBadge.jsx'
import { StarSelector } from './StarRating.jsx'

function createProfileDraft(preset = PROFILE_PLATFORM_PRESETS[0]) {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    url: '',
    placeholder: preset?.placeholder || 'https://linkedin.com/in/your-profile',
    hintLabel: preset?.label || 'Profile URL',
  }
}

function compressAndCropAvatar(file, targetSize = 180) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = targetSize
          canvas.height = targetSize
          const ctx = canvas.getContext('2d')
          const minSide = Math.min(img.width, img.height)
          const sx = (img.width - minSide) / 2
          const sy = (img.height - minSide) / 2
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.86)
          resolve(dataUrl)
        } catch (err) {
          reject(err)
        }
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function ReviewModal({
  isOpen,
  onClose,
  projects = [],
  initialTarget = 'overall',
  lockTarget = false,
  inviteCode = '',
  inviteInfo = null,
  challengeToken = '',
  onChallengeRefresh,
  moderationMode = 'auto',
  publicSubmissionsEnabled = true,
  turnstileSiteKey = null,
  editingReview = null,
  onSubmitted,
}) {
  const isEditing = Boolean(editingReview?.id)
  const closeButtonRef = useRef(null)
  const turnstileContainerRef = useRef(null)
  const turnstileWidgetIdRef = useRef(null)

  const defaultTargetId = useMemo(() => {
    if (editingReview?.targetId) {
      return editingReview.targetId
    }
    if (
      initialTarget &&
      initialTarget !== 'overall' &&
      projects.some((p) => p.id === initialTarget)
    ) {
      return initialTarget
    }
    if (
      inviteInfo?.valid &&
      inviteInfo.targetType === 'project' &&
      projects.some((p) => p.id === inviteInfo.targetId)
    ) {
      return inviteInfo.targetId
    }
    return 'overall'
  }, [editingReview, initialTarget, inviteInfo, projects])

  const isTargetLocked = Boolean(isEditing || (lockTarget && defaultTargetId !== 'overall'))
  const [selectedTargetOverride, setSelectedTargetOverride] = useState(null)
  const selectedTarget = isTargetLocked
    ? defaultTargetId
    : (selectedTargetOverride ?? defaultTargetId)
  const [rating, setRating] = useState(() => Number(editingReview?.rating) || 5)
  const [reviewerName, setReviewerName] = useState(() => editingReview?.reviewerName || '')
  const [reviewerRole, setReviewerRole] = useState(() => editingReview?.reviewerRole || '')
  const [relationship, setRelationship] = useState(
    () => editingReview?.relationship || 'Collaborator'
  )
  const [comment, setComment] = useState(() => editingReview?.comment || '')
  const [profileInputs, setProfileInputs] = useState(() => {
    if (Array.isArray(editingReview?.profiles) && editingReview.profiles.length > 0) {
      return editingReview.profiles.map((p) => ({
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        url: p.url || '',
        placeholder: p.placeholder || 'https://linkedin.com/in/your-profile',
        hintLabel: p.label || 'Profile URL',
      }))
    }
    return [createProfileDraft(PROFILE_PLATFORM_PRESETS[0])]
  })
  const [photoDataUrl, setPhotoDataUrl] = useState('')
  const [photoPreview, setPhotoPreview] = useState(() => editingReview?.avatarUrl || '')
  const [removePhoto, setRemovePhoto] = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)

  const [honeypot, setHoneypot] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submittedResult, setSubmittedResult] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    closeButtonRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || isEditing || !turnstileSiteKey || typeof window === 'undefined') {
      return undefined
    }

    let cancelled = false

    const renderWidget = () => {
      if (
        cancelled ||
        !window.turnstile ||
        !turnstileContainerRef.current ||
        turnstileWidgetIdRef.current !== null
      ) {
        return
      }
      turnstileWidgetIdRef.current = window.turnstile.render(
        turnstileContainerRef.current,
        {
          sitekey: turnstileSiteKey,
          theme: 'dark',
          callback: (token) => {
            if (!cancelled) setTurnstileToken(token || '')
          },
          'expired-callback': () => {
            if (!cancelled) setTurnstileToken('')
          },
          'error-callback': () => {
            if (!cancelled) setTurnstileToken('')
          },
        }
      )
    }

    if (window.turnstile) {
      renderWidget()
    } else {
      const existingScript = document.querySelector(
        'script[data-sji-turnstile="true"]'
      )
      if (!existingScript) {
        const script = document.createElement('script')
        script.src =
          'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        script.async = true
        script.defer = true
        script.dataset.sjiTurnstile = 'true'
        script.onload = renderWidget
        document.head.appendChild(script)
      } else {
        existingScript.addEventListener('load', renderWidget)
      }
    }

    return () => {
      cancelled = true
      if (window.turnstile && turnstileWidgetIdRef.current !== null) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current)
        } catch {
          // ignore cleanup failures
        }
        turnstileWidgetIdRef.current = null
      }
    }
  }, [isOpen, isEditing, turnstileSiteKey])

  if (!isOpen) return null

  const activeProject =
    selectedTarget !== 'overall'
      ? projects.find((p) => p.id === selectedTarget) || null
      : null

  const isInviteActive = Boolean(inviteInfo?.valid && inviteCode)
  const submissionsBlocked = !isEditing && !publicSubmissionsEnabled && !isInviteActive

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, WebP).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB.')
      return
    }
    setPhotoLoading(true)
    setError('')
    try {
      const resized = await compressAndCropAvatar(file)
      setPhotoDataUrl(resized)
      setPhotoPreview(resized)
      setRemovePhoto(false)
    } catch {
      setError('Could not process selected image. Try another image.')
    } finally {
      setPhotoLoading(false)
    }
  }

  const handleRemovePhoto = () => {
    setPhotoDataUrl('')
    setPhotoPreview('')
    setRemovePhoto(true)
  }

  const addProfileRow = (preset) => {
    setProfileInputs((prev) => {
      const emptyIndex = prev.findIndex((row) => !row.url.trim())
      if (emptyIndex !== -1) {
        return prev.map((row, idx) =>
          idx === emptyIndex
            ? {
                ...row,
                placeholder: preset?.placeholder || row.placeholder,
                hintLabel: preset?.label || row.hintLabel,
              }
            : row
        )
      }
      if (prev.length >= MAX_PROFILES_PER_REVIEW) return prev
      return [...prev, createProfileDraft(preset)]
    })
  }

  const updateProfileRow = (key, nextUrl) => {
    setProfileInputs((prev) =>
      prev.map((row) => (row.key === key ? { ...row, url: nextUrl } : row))
    )
  }

  const removeProfileRow = (key) => {
    setProfileInputs((prev) => {
      const filtered = prev.filter((row) => row.key !== key)
      return filtered.length > 0
        ? filtered
        : [createProfileDraft(PROFILE_PLATFORM_PRESETS[0])]
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (submissionsBlocked) {
      setError('Public review submissions currently require an invite link.')
      return
    }

    const trimmedName = reviewerName.trim()
    if (trimmedName.length < 2) {
      setError('Please enter your name so others know who wrote the review.')
      return
    }

    const trimmedComment = comment.trim()
    if (trimmedComment.length < MIN_REVIEW_COMMENT_LENGTH) {
      setError(
        `Please share at least ${MIN_REVIEW_COMMENT_LENGTH} characters about your experience.`
      )
      return
    }

    const nonEmptyProfiles = profileInputs
      .map((row) => row.url.trim())
      .filter(Boolean)

    for (const rawUrl of nonEmptyProfiles) {
      if (!classifyProfileUrl(rawUrl)) {
        setError(
          `The profile link "${rawUrl}" doesn't look like a valid public URL (e.g. https://linkedin.com/in/yourname).`
        )
        return
      }
    }

    if (!isEditing && turnstileSiteKey && !turnstileToken) {
      setError('Please complete the verification check before submitting.')
      return
    }

    setSubmitting(true)
    try {
      let res
      let payload
      if (isEditing) {
        res = await fetch(`/api/reviews/${encodeURIComponent(editingReview.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            editToken: editingReview.editToken || '',
            rating,
            reviewerName: trimmedName,
            reviewerRole: reviewerRole.trim(),
            relationship,
            comment: trimmedComment,
            profiles: nonEmptyProfiles.map((url) => ({ url })),
            photo: photoDataUrl || undefined,
            removePhoto,
          }),
        })
        payload = await res.json().catch(() => ({}))
      } else {
        res = await fetch('/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetType: activeProject ? 'project' : 'overall',
            targetId: activeProject ? activeProject.id : 'overall',
            rating,
            reviewerName: trimmedName,
            reviewerRole: reviewerRole.trim(),
            relationship,
            comment: trimmedComment,
            profiles: nonEmptyProfiles.map((url) => ({ url })),
            photo: photoDataUrl || undefined,
            inviteCode: isInviteActive ? inviteCode : '',
            challengeToken,
            turnstileToken,
            sji_verification_code_trap: honeypot,
          }),
        })
        payload = await res.json().catch(() => ({}))
        if (payload?.challengeToken) {
          onChallengeRefresh?.(payload.challengeToken)
        }
        if (res.ok && payload?.review?.id && payload?.editToken) {
          saveMyReviewSession(
            payload.review.id,
            payload.editToken,
            payload.review.createdAt
          )
        }
      }

      if (!res.ok) {
        if (!isEditing && window.turnstile && turnstileWidgetIdRef.current !== null) {
          try {
            window.turnstile.reset(turnstileWidgetIdRef.current)
            setTurnstileToken('')
          } catch {
            // ignore
          }
        }
        throw new Error(
          payload?.error ||
            (isEditing
              ? 'Could not update your review. Please try again.'
              : 'Could not submit your review. Please try again.')
        )
      }

      setSubmittedResult(payload)
      onSubmitted?.(payload)
    } catch (err) {
      setError(err.message || 'Network error while submitting review.')
    } finally {
      setSubmitting(false)
    }
  }

  const modalContent = (
    <div
      className="project-modal-backdrop review-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onClose()
        }
      }}
    >
      <div
        className="project-modal review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
      >
        <div className="project-modal-header">
          <div className="project-modal-title-group">
            <span className="project-modal-live-pill">
              {isEditing ? '5-MINUTE EDIT WINDOW' : '5-STAR REVIEW'}
            </span>
            <h3 id="review-modal-title">
              {submittedResult
                ? isEditing
                  ? 'Review Updated'
                  : 'Review Submitted'
                : isEditing
                  ? `Edit Review · ${editingReview?.targetTitle || 'Samuel'}`
                  : activeProject
                    ? `Review ${activeProject.title}`
                    : 'Leave a Review'}
            </h3>
            <span className="project-modal-url">
              {isEditing
                ? 'Adjust your rating, text, profiles or avatar photo'
                : 'No login required'}
            </span>
          </div>

          <div className="project-modal-actions">
            <button
              ref={closeButtonRef}
              type="button"
              className="project-modal-close"
              onClick={onClose}
              aria-label="Close review modal"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="review-modal-body">
          {submittedResult ? (
            <div className="review-submitted-state">
              <div className="review-submitted-badge" aria-hidden="true">
                ★
              </div>
              <h4>
                {isEditing
                  ? 'Your review has been updated!'
                  : submittedResult.status === 'approved'
                    ? 'Your review is now live!'
                    : 'Review received for approval'}
              </h4>
              <p>
                {submittedResult.message ||
                  'Thank you for taking the time to share authentic feedback.'}
                {!isEditing &&
                  ' You can edit or delete your review for the next 5 minutes before it locks in.'}
              </p>

              {submittedResult.review && (
                <div className="review-submitted-summary">
                  <strong>{submittedResult.review.targetTitle}</strong>
                  <span>{submittedResult.review.rating} / 5 stars</span>
                  {submittedResult.review.profiles?.length > 0 && (
                    <span>
                      {submittedResult.review.profiles.length}{' '}
                      {submittedResult.review.profiles.length === 1
                        ? 'profile page'
                        : 'profile pages'}{' '}
                      tagged
                    </span>
                  )}
                </div>
              )}

              <div className="review-submitted-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={onClose}
                >
                  Back to Reviews
                </button>
              </div>
            </div>
          ) : (
            <form className="review-form" onSubmit={handleSubmit} noValidate>
              {isInviteActive && (
                <div className="review-invite-banner">
                  <strong>✓ {inviteInfo.label || 'Verified Collaborator'}</strong>
                  <span>
                    You opened a verified collaborator invitation link — your
                    review will carry this verified badge automatically.
                  </span>
                </div>
              )}

              {!isInviteActive && inviteCode && (
                <div className="review-notice-banner">
                  This collaborator invite link is expired or already used.{' '}
                  {publicSubmissionsEnabled
                    ? 'You can still submit a public review below.'
                    : 'Only active invite links can currently submit reviews.'}
                </div>
              )}

              {submissionsBlocked && (
                <div className="review-error-banner">
                  Reviews are currently restricted to active collaborator invite
                  links.
                </div>
              )}

              {isTargetLocked ? (
                <div className="review-locked-target">
                  <span className="review-locked-target-label">
                    {activeProject ? 'Reviewing project' : 'Reviewing'}
                  </span>
                  <strong className="review-locked-target-title">
                    {activeProject
                      ? activeProject.title
                      : editingReview?.targetTitle || 'Samuel John-Ibro (Overall)'}
                  </strong>
                  {activeProject?.status && (
                    <span className="review-locked-target-status">
                      {activeProject.status}
                    </span>
                  )}
                </div>
              ) : (
                <div className="review-form-group">
                  <span className="review-field-label">
                    What are you reviewing?
                  </span>
                  <div
                    className="review-target-pills"
                    role="radiogroup"
                    aria-label="Choose what to review"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selectedTarget === 'overall'}
                      className={`review-target-pill${selectedTarget === 'overall' ? ' is-selected' : ''}`}
                      onClick={() => setSelectedTargetOverride('overall')}
                      disabled={submitting}
                    >
                      <span className="review-target-pill-title">
                        Samuel John-Ibro (Overall)
                      </span>
                      <span className="review-target-pill-sub">
                        Engineering, QA &amp; collaboration
                      </span>
                    </button>

                    {projects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        role="radio"
                        aria-checked={selectedTarget === project.id}
                        className={`review-target-pill${selectedTarget === project.id ? ' is-selected' : ''}`}
                        onClick={() => setSelectedTargetOverride(project.id)}
                        disabled={submitting}
                      >
                        <span className="review-target-pill-title">
                          {project.title}
                        </span>
                        <span className="review-target-pill-sub">
                          {project.status || 'Project'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="review-form-group">
                <span className="review-field-label">5-Star Rating *</span>
                <StarSelector
                  value={rating}
                  onChange={setRating}
                  disabled={submitting}
                />
              </div>

              <div className="review-form-group">
                <label
                  htmlFor="review-comment-input"
                  className="review-field-label"
                >
                  <span>Your Review *</span>
                  <span className="review-field-counter">
                    {comment.length} / {MAX_REVIEW_COMMENT_LENGTH}
                  </span>
                </label>
                <textarea
                  id="review-comment-input"
                  className="review-textarea"
                  rows={4}
                  maxLength={MAX_REVIEW_COMMENT_LENGTH}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={submitting}
                  placeholder={
                    activeProject
                      ? `Share what you think of ${activeProject.title} or working with Samuel on it...`
                      : 'Share what it was like working with Samuel, collaborating on software, QA, or cloud training...'
                  }
                  required
                />
              </div>

              <div className="review-form-row-2">
                <div className="review-form-group">
                  <label
                    htmlFor="review-name-input"
                    className="review-field-label"
                  >
                    Your Name *
                  </label>
                  <input
                    id="review-name-input"
                    type="text"
                    className="review-input"
                    maxLength={MAX_REVIEWER_NAME_LENGTH}
                    value={reviewerName}
                    onChange={(e) => setReviewerName(e.target.value)}
                    disabled={submitting}
                    placeholder="e.g. Tunde Adeyemi"
                    required
                  />
                </div>

                <div className="review-form-group">
                  <label
                    htmlFor="review-role-input"
                    className="review-field-label"
                  >
                    Role / Company (optional)
                  </label>
                  <input
                    id="review-role-input"
                    type="text"
                    className="review-input"
                    maxLength={MAX_REVIEWER_ROLE_LENGTH}
                    value={reviewerRole}
                    onChange={(e) => setReviewerRole(e.target.value)}
                    disabled={submitting}
                    placeholder="e.g. Product Designer at StudioX"
                  />
                </div>
              </div>

              <div className="review-form-group">
                <span className="review-field-label">
                  How you worked together
                </span>
                <div className="review-relationship-pills">
                  {REVIEW_RELATIONSHIPS.map((rel) => (
                    <button
                      key={rel}
                      type="button"
                      className={`review-rel-pill${relationship === rel ? ' is-selected' : ''}`}
                      onClick={() => setRelationship(rel)}
                      disabled={submitting}
                    >
                      {rel}
                    </button>
                  ))}
                </div>
              </div>

              <div className="review-form-group">
                <div className="review-field-label">
                  <span>Profile Photo (optional)</span>
                  <span className="review-field-hint-inline">
                    Upload your picture or let us fetch it from your tagged profiles
                  </span>
                </div>

                <div className="review-photo-uploader">
                  {photoPreview ? (
                    <div className="review-photo-preview-box">
                      <img
                        src={photoPreview}
                        alt="Reviewer avatar preview"
                        className="review-photo-preview-img"
                      />
                      <div className="review-photo-preview-info">
                        <span className="review-photo-preview-label">
                          {photoDataUrl ? 'Attached custom photo' : 'Profile photo'}
                        </span>
                        <button
                          type="button"
                          className="review-photo-remove-btn"
                          onClick={handleRemovePhoto}
                          disabled={submitting}
                        >
                          ✕ Remove photo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="review-photo-upload-actions">
                      <label
                        htmlFor="review-photo-file-input"
                        className={`secondary-button review-photo-btn${photoLoading ? ' is-loading' : ''}`}
                      >
                        <span>📷 {photoLoading ? 'Processing...' : 'Attach Photo'}</span>
                      </label>
                      <input
                        id="review-photo-file-input"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        onChange={handlePhotoChange}
                        disabled={submitting || photoLoading}
                      />
                      <span className="review-photo-note">
                        If no photo is attached, we automatically check your tagged profiles and use the photo from any profile that has one.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="review-form-group">
                <div className="review-field-label">
                  <span>
                    Tag Your Real Profile Pages (optional, up to{' '}
                    {MAX_PROFILES_PER_REVIEW})
                  </span>
                  <span className="review-field-hint-inline">
                    So visitors can see who you are
                  </span>
                </div>

                <div className="review-profile-presets">
                  {PROFILE_PLATFORM_PRESETS.map((preset) => (
                    <button
                      key={preset.platform}
                      type="button"
                      className="review-preset-btn"
                      disabled={
                        submitting ||
                        profileInputs.length >= MAX_PROFILES_PER_REVIEW
                      }
                      onClick={() => addProfileRow(preset)}
                    >
                      <PlatformIcon platform={preset.platform} />
                      <span>+ {preset.label}</span>
                    </button>
                  ))}
                </div>

                <div className="review-profile-inputs">
                  {profileInputs.map((row, idx) => {
                    const trimmed = row.url.trim()
                    const parsed = trimmed ? classifyProfileUrl(trimmed) : null
                    return (
                      <div key={row.key} className="review-profile-input-block">
                        <div className="review-profile-input-row">
                          <input
                            type="url"
                            className="review-input"
                            value={row.url}
                            onChange={(e) =>
                              updateProfileRow(row.key, e.target.value)
                            }
                            disabled={submitting}
                            aria-label={`Profile link ${idx + 1}`}
                            placeholder={row.placeholder}
                          />
                          {(profileInputs.length > 1 || trimmed) && (
                            <button
                              type="button"
                              className="review-profile-remove"
                              onClick={() => removeProfileRow(row.key)}
                              disabled={submitting}
                              aria-label="Remove profile link"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {trimmed && parsed && (
                          <div className="review-profile-preview-ok">
                            <PlatformIcon platform={parsed.platform} />
                            <span>
                              Tagged as <strong>{parsed.display}</strong>
                            </span>
                          </div>
                        )}

                        {trimmed && !parsed && (
                          <div className="review-profile-preview-err">
                            Enter a valid public URL (e.g.
                            https://linkedin.com/in/username)
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="review-hp-field" aria-hidden="true">
                <label htmlFor="sji-hp-trap">Leave blank</label>
                <input
                  id="sji-hp-trap"
                  name="sji_verification_code_trap"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>

              {!isEditing && turnstileSiteKey && (
                <div className="review-turnstile-wrap">
                  <div ref={turnstileContainerRef} />
                </div>
              )}

              {error && (
                <div className="review-error-banner" role="alert">
                  {error}
                </div>
              )}

              <div className="review-form-footer">
                <p className="review-form-note">
                  {isEditing
                    ? 'Editable for 5 minutes after submission before locking in.'
                    : isInviteActive || moderationMode !== 'manual'
                      ? 'Published directly — editable or deletable for 5 minutes.'
                      : 'Your review will appear as soon as Samuel approves it.'}
                </p>

                <div className="review-form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={onClose}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={submitting || submissionsBlocked}
                  >
                    {submitting
                      ? isEditing
                        ? 'Saving Changes...'
                        : 'Submitting...'
                      : isEditing
                        ? 'Save Changes ★'
                        : isInviteActive || moderationMode !== 'manual'
                          ? 'Publish Review ★'
                          : 'Submit Review ★'}
                  </button>
                </div>
              </div>
            </form>
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

import { useEffect, useRef, useState } from 'react'
import { resolveProjectLogo } from '../data/defaultPortfolio.js'

function ProjectLogoInner({ resolved, className, size }) {
  const [candidateIndex, setCandidateIndex] = useState(0)
  const imgRef = useRef(null)
  const candidates = resolved.candidates || []
  const currentSrc = candidates[candidateIndex]

  useEffect(() => {
    const img = imgRef.current
    if (!img || !img.complete) return undefined
    const failedBeforeHydration =
      img.naturalWidth === 0 ||
      (img.naturalWidth === 1 &&
        img.naturalHeight === 1 &&
        candidateIndex + 1 < candidates.length)
    if (!failedBeforeHydration) return undefined
    const timer = window.setTimeout(() => {
      setCandidateIndex((idx) => (idx === candidateIndex ? idx + 1 : idx))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [candidateIndex, candidates.length, currentSrc])

  if (!currentSrc) {
    return null
  }

  return (
    <div
      className={className}
      data-auto-favicon={resolved.isFallbackFavicon ? 'true' : undefined}
    >
      <img
        ref={imgRef}
        src={currentSrc}
        alt={resolved.alt}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onLoad={(event) => {
          const img = event.currentTarget
          if (
            img.naturalWidth === 1 &&
            img.naturalHeight === 1 &&
            candidateIndex + 1 < candidates.length
          ) {
            setCandidateIndex((idx) => idx + 1)
          }
        }}
        onError={() => {
          setCandidateIndex((idx) => idx + 1)
        }}
      />
    </div>
  )
}

export function ProjectLogo({
  item,
  fallbackUrl = '',
  className = 'project-logo',
  size = 52,
}) {
  const resolved = resolveProjectLogo(item, fallbackUrl)
  if (!resolved || !Array.isArray(resolved.candidates) || resolved.candidates.length === 0) {
    return null
  }

  return (
    <ProjectLogoInner
      key={resolved.candidates.join('|')}
      resolved={resolved}
      className={className}
      size={size}
    />
  )
}

function FaviconCandidateImgInner({ candidates, alt, fallback, style, className }) {
  const [candidateIndex, setCandidateIndex] = useState(0)
  const imgRef = useRef(null)
  const currentSrc = candidates[candidateIndex]

  useEffect(() => {
    const img = imgRef.current
    if (!img || !img.complete) return undefined
    const failedBeforeHydration =
      img.naturalWidth === 0 ||
      (img.naturalWidth === 1 &&
        img.naturalHeight === 1 &&
        candidateIndex + 1 < candidates.length)
    if (!failedBeforeHydration) return undefined
    const timer = window.setTimeout(() => {
      setCandidateIndex((idx) => (idx === candidateIndex ? idx + 1 : idx))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [candidateIndex, candidates.length, currentSrc])

  if (!currentSrc) {
    return fallback
  }

  return (
    <img
      ref={imgRef}
      src={currentSrc}
      alt={alt}
      style={style}
      className={className}
      loading="lazy"
      decoding="async"
      onLoad={(event) => {
        const img = event.currentTarget
        if (
          img.naturalWidth === 1 &&
          img.naturalHeight === 1 &&
          candidateIndex + 1 < candidates.length
        ) {
          setCandidateIndex((idx) => idx + 1)
        }
      }}
      onError={() => {
        setCandidateIndex((idx) => idx + 1)
      }}
    />
  )
}

export function FaviconCandidateImg({
  candidates = [],
  alt = 'Site favicon',
  fallback = null,
  style,
  className,
}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return fallback
  }

  return (
    <FaviconCandidateImgInner
      key={candidates.join('|')}
      candidates={candidates}
      alt={alt}
      fallback={fallback}
      style={style}
      className={className}
    />
  )
}

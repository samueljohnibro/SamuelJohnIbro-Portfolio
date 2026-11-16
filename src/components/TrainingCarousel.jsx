import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toEmbedUrl } from '../data/defaultPortfolio.js'

const SLIDE_IMAGE_DURATION_MS = 4000
const SLIDE_CLIP_DURATION_MS = 4000
const SLIDE_CLIP_DURATION_SEC = SLIDE_CLIP_DURATION_MS / 1000
const SLIDE_MIN_DWELL_MS = 3000
const SLIDE_TRANSITION_SAFETY_MS = 680
const DRAG_THRESHOLD_PX = 50

function shuffleMediaItems(items, avoidFirstId = null) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  if (avoidFirstId && copy.length > 1 && copy[0].id === avoidFirstId) {
    const swapIdx = 1 + Math.floor(Math.random() * (copy.length - 1))
    ;[copy[0], copy[swapIdx]] = [copy[swapIdx], copy[0]]
  }
  return copy
}

function normalizeSlideItem(item) {
  const embedSrc = toEmbedUrl(item.src)
  if (embedSrc) {
    return { ...item, type: 'embed', embedSrc }
  }
  return item
}

function buildInitialQueue(mediaItems) {
  const normalized = (mediaItems || [])
    .filter((item) => item && item.visible !== false && item.src)
    .map(normalizeSlideItem)
  const initialPlan = shuffleMediaItems(normalized)
  const readyImmediately = initialPlan.filter((item) => item.type !== 'video')
  if (readyImmediately.length > 0) {
    return readyImmediately
  }
  return initialPlan
}

async function waitWithAbort(ms, signal) {
  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function fetchCompleteVideoBlobUrl(item, signal) {
  const retryDelays = [1500, 3500]
  const resolvedSrc = item.src.startsWith('/') ? encodeURI(item.src) : item.src
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      const response = await fetch(resolvedSrc, {
        signal,
        cache: 'default',
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} while downloading ${item.src}`)
      }
      const contentType = (response.headers.get('content-type') || '').toLowerCase()
      if (contentType.includes('text/html')) {
        throw new Error(`Unexpected HTML response for ${item.src}`)
      }
      const contentEncoding = response.headers.get('content-encoding')
      const rawLength = response.headers.get('content-length')
      const expectedLength =
        rawLength && !contentEncoding ? Number(rawLength) : null

      const blob = await response.blob()
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      if (!blob || blob.size === 0) {
        throw new Error(`Empty blob downloaded for ${item.src}`)
      }
      if (
        Number.isFinite(expectedLength) &&
        expectedLength > 0 &&
        blob.size !== expectedLength
      ) {
        throw new Error(
          `Incomplete blob size (${blob.size} of ${expectedLength}) for ${item.src}`
        )
      }

      const typedBlob = blob.type
        ? blob
        : new Blob([blob], { type: 'video/mp4' })
      return URL.createObjectURL(typedBlob)
    } catch (error) {
      if (signal.aborted || error?.name === 'AbortError') {
        throw error
      }
      if (attempt >= retryDelays.length) {
        throw error
      }
      await waitWithAbort(retryDelays[attempt], signal)
    }
  }
  return null
}

function chooseRandomClipStart(durationSec, previousStartSec = null) {
  if (!Number.isFinite(durationSec) || durationSec <= SLIDE_CLIP_DURATION_SEC) {
    return 0
  }
  const tailMargin = durationSec > SLIDE_CLIP_DURATION_SEC + 0.25 ? 0.15 : 0
  const maxStart = Math.max(0, durationSec - SLIDE_CLIP_DURATION_SEC - tailMargin)
  if (maxStart <= 0.1) {
    return 0
  }

  let chosen
  if (!Number.isFinite(previousStartSec)) {
    chosen = Math.random() * maxStart
  } else {
    const minSeparation = Math.min(SLIDE_CLIP_DURATION_SEC, maxStart * 0.35)
    const leftEnd = Math.max(0, previousStartSec - minSeparation)
    const rightStart = Math.min(maxStart, previousStartSec + minSeparation)
    const rightSpan = Math.max(0, maxStart - rightStart)
    const totalSpan = leftEnd + rightSpan

    if (totalSpan <= 0.05) {
      chosen = (previousStartSec + maxStart * 0.5) % maxStart
    } else {
      const pick = Math.random() * totalSpan
      chosen = pick < leftEnd ? pick : rightStart + (pick - leftEnd)
    }
  }

  return Math.round(chosen * 1000) / 1000
}

async function extractVideoFrameFromBlob(blobUrl, signal, resolveClipPlan) {
  if (signal?.aborted) return { duration: null, clipStart: 0, poster: null }
  return new Promise((resolve) => {
    const tempVideo = document.createElement('video')
    let settled = false
    let resolvedDuration = null
    let resolvedClipStart = 0
    let targetSeekTime = 0.05

    const cleanup = () => {
      tempVideo.onloadedmetadata = null
      tempVideo.onloadeddata = null
      tempVideo.onseeked = null
      tempVideo.onerror = null
      tempVideo.pause()
      tempVideo.removeAttribute('src')
      tempVideo.load()
    }

    const finish = (poster) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', onAbort)
      cleanup()
      resolve({
        duration: resolvedDuration,
        clipStart: resolvedClipStart,
        poster,
      })
    }

    const onAbort = () => finish(null)
    signal?.addEventListener('abort', onAbort, { once: true })

    const timeoutId = setTimeout(() => finish(null), 2000)

    const captureFrame = () => {
      if (settled) return
      try {
        const vw = tempVideo.videoWidth
        const vh = tempVideo.videoHeight
        if (!vw || !vh) {
          finish(null)
          return
        }
        const maxWidth = 960
        const scale = vw > maxWidth ? maxWidth / vw : 1
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(vw * scale)
        canvas.height = Math.round(vh * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          finish(null)
          return
        }
        ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        finish(dataUrl && dataUrl.length > 200 ? dataUrl : null)
      } catch {
        finish(null)
      }
    }

    tempVideo.muted = true
    tempVideo.playsInline = true
    tempVideo.preload = 'auto'

    const seekAndCapture = () => {
      if (settled) return
      if (Math.abs(tempVideo.currentTime - targetSeekTime) < 0.03) {
        if (tempVideo.readyState >= 2) {
          captureFrame()
        } else {
          tempVideo.onloadeddata = () => {
            if (tempVideo.readyState >= 2) captureFrame()
          }
        }
        return
      }
      tempVideo.onseeked = () => {
        if (tempVideo.readyState >= 2) {
          captureFrame()
        } else {
          tempVideo.onloadeddata = () => {
            if (tempVideo.readyState >= 2) captureFrame()
          }
        }
      }
      try {
        tempVideo.currentTime = targetSeekTime
      } catch {
        captureFrame()
      }
    }

    tempVideo.onloadedmetadata = () => {
      if (settled) return
      resolvedDuration =
        Number.isFinite(tempVideo.duration) && tempVideo.duration > 0
          ? tempVideo.duration
          : null
      const plan =
        typeof resolveClipPlan === 'function'
          ? resolveClipPlan(resolvedDuration)
          : { clipStart: 0, seekTime: 0.05 }
      resolvedClipStart = Number.isFinite(plan?.clipStart) ? plan.clipStart : 0
      const rawSeek = Number.isFinite(plan?.seekTime)
        ? plan.seekTime
        : resolvedClipStart > 0.02
          ? resolvedClipStart
          : 0.05
      targetSeekTime =
        resolvedDuration !== null
          ? Math.max(0, Math.min(rawSeek, Math.max(0, resolvedDuration - 0.05)))
          : rawSeek
      seekAndCapture()
    }

    tempVideo.onerror = () => finish(null)
    tempVideo.src = blobUrl
  })
}

export function TrainingCarousel({ mediaItems = [] }) {
  const [queue, setQueue] = useState(() => buildInitialQueue(mediaItems))
  const [activeIndex, setActiveIndex] = useState(0)
  const [stage, setStage] = useState(null)
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const trackRef = useRef(null)
  const autoPlayTimerRef = useRef(null)
  const transitionTimerRef = useRef(null)
  const videoRefs = useRef({})
  const pointerStartRef = useRef(0)
  const dragOffsetRef = useRef(0)
  const isDraggingRef = useRef(false)
  const isTouchInteractionRef = useRef(false)
  const failedImageIdsRef = useRef(new Set())
  const lastClipStartByIdRef = useRef({})
  const mountControllerRef = useRef(null)
  const slideSettledAtRef = useRef(0)
  const activeSlideSessionRef = useRef({ key: null, playedMs: 0, resumedAt: null })
  const queueRef = useRef(queue)
  const activeIndexRef = useRef(activeIndex)
  const stageRef = useRef(stage)

  useEffect(() => {
    slideSettledAtRef.current = Date.now()
  }, [])

  useLayoutEffect(() => {
    queueRef.current = queue
    activeIndexRef.current = activeIndex
    stageRef.current = stage
  }, [queue, activeIndex, stage])

  const clearTimers = useCallback(() => {
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current)
      autoPlayTimerRef.current = null
    }
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current)
      transitionTimerRef.current = null
    }
  }, [])

  const pauseVideos = useCallback((resetOthersThanId = null) => {
    Object.entries(videoRefs.current).forEach(([id, video]) => {
      if (!video) return
      video.pause()
      if (resetOthersThanId !== null && id !== resetOthersThanId) {
        try {
          video.currentTime = 0
        } catch {
          // ignore
        }
      }
    })
  }, [])

  useEffect(() => {
    const normalizedItems = (mediaItems || [])
      .filter((item) => item && item.visible !== false && item.src)
      .map(normalizeSlideItem)
    const controller = new AbortController()
    mountControllerRef.current = controller
    const createdUrls = {}
    const preloadedImages = []

    const imageWarmList = normalizedItems
      .filter((item) => item.type === 'image')
      .map((item) => ({ id: item.id, src: item.src }))

    imageWarmList.forEach(({ id, src }) => {
      const img = new Image()
      if (id) {
        img.onerror = () => {
          failedImageIdsRef.current.add(id)
        }
        img.onload = () => {
          failedImageIdsRef.current.delete(id)
        }
      }
      img.src = src
      preloadedImages.push(img)
    })

    const videoItems = normalizedItems.filter((item) => item.type === 'video')
    videoItems.forEach((videoItem) => {
      fetchCompleteVideoBlobUrl(videoItem, controller.signal)
        .then(async (blobUrl) => {
          if (!blobUrl || controller.signal.aborted) {
            if (blobUrl) URL.revokeObjectURL(blobUrl)
            return
          }
          createdUrls[videoItem.id] = blobUrl
          const { duration, clipStart, poster } = await extractVideoFrameFromBlob(
            blobUrl,
            controller.signal,
            (videoDuration) => {
              const chosenStart = chooseRandomClipStart(
                videoDuration,
                lastClipStartByIdRef.current[videoItem.id]
              )
              lastClipStartByIdRef.current[videoItem.id] = chosenStart
              return {
                clipStart: chosenStart,
                seekTime:
                  chosenStart > 0.02
                    ? chosenStart
                    : Math.min(0.05, Math.max(0, (videoDuration || 1) - 0.1)),
              }
            }
          )
          if (controller.signal.aborted) {
            return
          }
          const clipMeta = {
            src: blobUrl,
            duration,
            clipStart,
            poster: poster || undefined,
          }
          setQueue((prev) => {
            const existingIdx = prev.findIndex((item) => item.id === videoItem.id)
            if (existingIdx !== -1) {
              return prev.map((item, idx) =>
                idx === existingIdx ? { ...item, ...clipMeta } : item
              )
            }

            const currentStage = stageRef.current
            const targetIdxInPrev = currentStage
              ? prev.findIndex((item) => item.id === currentStage.targetItem.id)
              : -1
            const minInsert = Math.min(
              Math.max(activeIndexRef.current, targetIdxInPrev) + 1,
              prev.length
            )
            const insertAt =
              minInsert +
              Math.floor(Math.random() * (prev.length - minInsert + 1))

            const nextQueue = [...prev]
            nextQueue.splice(insertAt, 0, {
              ...videoItem,
              ...clipMeta,
            })
            queueRef.current = nextQueue
            return nextQueue
          })
        })
        .catch((error) => {
          if (error?.name === 'AbortError') return
          // Fallback for external video URLs whose origin blocks CORS fetch:
          // insert direct URL so native <video> streaming still works.
          if (/^https?:\/\//i.test(videoItem.src)) {
            setQueue((prev) => {
              if (prev.some((item) => item.id === videoItem.id)) return prev
              const nextQueue = [...prev, videoItem]
              queueRef.current = nextQueue
              return nextQueue
            })
          }
        })
    })

    return () => {
      controller.abort()
      if (mountControllerRef.current === controller) {
        mountControllerRef.current = null
      }
      lastClipStartByIdRef.current = {}
      preloadedImages.forEach((img) => {
        img.onload = null
        img.onerror = null
      })
      Object.values(createdUrls).forEach((url) => URL.revokeObjectURL(url))
    }
  }, [mediaItems])

  const completeTransition = useCallback(
    (event) => {
      if (
        event &&
        (event.target !== trackRef.current || event.propertyName !== 'transform')
      ) {
        return
      }

      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current)
        transitionTimerRef.current = null
      }

      const finished = stageRef.current
      if (!finished || finished.phase !== 'animate') return

      const track = trackRef.current
      if (track) {
        track.classList.add('is-instant')
      }

      pauseVideos(finished.targetItem.id)

      const rotatedClips = []
      const rotatedById = {}
      if (finished.direction !== 'cancel') {
        activeSlideSessionRef.current = {
          key: null,
          playedMs: 0,
          resumedAt: null,
        }
        finished.items.forEach((slideItem) => {
          if (
            slideItem.id !== finished.targetItem.id &&
            slideItem.type === 'video' &&
            typeof slideItem.src === 'string' &&
            slideItem.src.startsWith('blob:')
          ) {
            const nextStart = chooseRandomClipStart(
              slideItem.duration,
              lastClipStartByIdRef.current[slideItem.id]
            )
            lastClipStartByIdRef.current[slideItem.id] = nextStart
            rotatedById[slideItem.id] = nextStart
            rotatedClips.push({ exited: slideItem, nextStart })
          }
        })
      }

      let resolvedIndex
      if (finished.reshuffledQueue || rotatedClips.length > 0) {
        let nextQueue
        if (finished.reshuffledQueue) {
          const currentLatest = queueRef.current
          const baseIds = new Set(finished.reshuffledQueue.map((item) => item.id))
          const extrasArrivedMidWrap = currentLatest.filter(
            (item) => !baseIds.has(item.id)
          )
          nextQueue = [...finished.reshuffledQueue]
          extrasArrivedMidWrap.forEach((videoItem) => {
            const insertAt =
              1 + Math.floor(Math.random() * Math.max(1, nextQueue.length))
            nextQueue.splice(Math.min(insertAt, nextQueue.length), 0, videoItem)
          })
        } else {
          nextQueue = [...queueRef.current]
        }

        if (rotatedClips.length > 0) {
          nextQueue = nextQueue.map((item) =>
            Object.prototype.hasOwnProperty.call(rotatedById, item.id)
              ? { ...item, clipStart: rotatedById[item.id], poster: undefined }
              : item
          )
        }

        queueRef.current = nextQueue
        setQueue(nextQueue)
        resolvedIndex = Math.max(
          0,
          nextQueue.findIndex((item) => item.id === finished.targetItem.id)
        )
      } else {
        const idx = queueRef.current.findIndex(
          (item) => item.id === finished.targetItem.id
        )
        resolvedIndex = idx !== -1 ? idx : 0
      }

      const activeSignal = mountControllerRef.current?.signal
      rotatedClips.forEach(({ exited, nextStart }) => {
        const seekTime =
          nextStart > 0.02
            ? nextStart
            : Math.min(0.05, Math.max(0, (exited.duration || 1) - 0.1))
        extractVideoFrameFromBlob(exited.src, activeSignal, () => ({
          clipStart: nextStart,
          seekTime,
        })).then(({ poster }) => {
          if (activeSignal?.aborted || !poster) return
          setQueue((prev) =>
            prev.map((item) =>
              item.id === exited.id && item.clipStart === nextStart
                ? { ...item, poster }
                : item
            )
          )
        })
      })

      activeIndexRef.current = resolvedIndex
      setActiveIndex(resolvedIndex)
      slideSettledAtRef.current = Date.now()
      stageRef.current = null
      setStage(null)
    },
    [pauseVideos]
  )

  const launchStage = useCallback(
    (nextStage) => {
      if (stageRef.current) return
      clearTimers()
      pauseVideos(null)
      stageRef.current = nextStage
      setStage(nextStage)
    },
    [clearTimers, pauseVideos]
  )

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return

    if (stage?.phase === 'prepare') {
      track.classList.add('is-instant')
      void track.offsetHeight
      track.classList.remove('is-instant')
      void track.offsetHeight

      const rafId = requestAnimationFrame(() => {
        setStage((prev) => {
          if (!prev || prev.phase !== 'prepare') return prev
          const animating = { ...prev, phase: 'animate' }
          stageRef.current = animating
          return animating
        })
      })
      return () => cancelAnimationFrame(rafId)
    }

    if (stage?.phase === 'animate') {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current)
      }
      transitionTimerRef.current = setTimeout(() => {
        completeTransition()
      }, SLIDE_TRANSITION_SAFETY_MS)
      return () => {
        if (transitionTimerRef.current) {
          clearTimeout(transitionTimerRef.current)
          transitionTimerRef.current = null
        }
      }
    }

    if (!stage && !isDragging && track.classList.contains('is-instant')) {
      void track.offsetHeight
      track.classList.remove('is-instant')
      void track.offsetHeight
    }
  }, [stage, isDragging, completeTransition])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && stageRef.current?.phase === 'animate') {
        completeTransition()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [completeTransition])

  const pickNextTargetIndex = useCallback((currentQueue, currentIdx) => {
    for (let step = 1; step < currentQueue.length; step += 1) {
      const candidateIdx = currentIdx + step
      if (candidateIdx >= currentQueue.length) break
      if (!failedImageIdsRef.current.has(currentQueue[candidateIdx].id)) {
        return candidateIdx
      }
    }
    return currentIdx + 1
  }, [])

  const pickPrevTargetIndex = useCallback((currentQueue, currentIdx) => {
    for (let step = 1; step <= currentIdx; step += 1) {
      const candidateIdx = currentIdx - step
      if (!failedImageIdsRef.current.has(currentQueue[candidateIdx].id)) {
        return candidateIdx
      }
    }
    return currentIdx - 1
  }, [])

  const nextSlide = useCallback(
    (startOffsetPx = 0) => {
      if (stageRef.current) return
      const currentQueue = queueRef.current
      const currentIdx = activeIndexRef.current
      const currentItem = currentQueue[currentIdx]
      if (!currentItem || currentQueue.length < 2) return

      const candidateIdx = pickNextTargetIndex(currentQueue, currentIdx)
      let targetItem
      let targetIndex
      let reshuffledQueue = null

      if (candidateIdx < currentQueue.length) {
        targetIndex = candidateIdx
        targetItem = currentQueue[targetIndex]
      } else {
        const healthyItems = currentQueue.filter(
          (item) =>
            item.id === currentItem.id ||
            !failedImageIdsRef.current.has(item.id)
        )
        const pool = healthyItems.length >= 2 ? healthyItems : currentQueue
        reshuffledQueue = shuffleMediaItems(pool, currentItem.id)
        targetIndex = 0
        targetItem = reshuffledQueue[0]
      }

      launchStage({
        direction: 'next',
        items: [currentItem, targetItem],
        startTransform: startOffsetPx
          ? `translate3d(${startOffsetPx}px, 0, 0)`
          : 'translate3d(0%, 0, 0)',
        targetTransform: 'translate3d(-100%, 0, 0)',
        targetItem,
        targetIndex,
        reshuffledQueue,
        phase: 'prepare',
      })
    },
    [launchStage, pickNextTargetIndex]
  )

  const prevSlide = useCallback(
    (startOffsetPx = 0) => {
      if (stageRef.current) return
      const currentQueue = queueRef.current
      const currentIdx = activeIndexRef.current
      const currentItem = currentQueue[currentIdx]
      if (!currentItem || currentQueue.length < 2) return

      let targetIndex
      let targetItem
      let reshuffledQueue = null

      if (currentIdx > 0) {
        const candidateIdx = pickPrevTargetIndex(currentQueue, currentIdx)
        targetIndex = candidateIdx >= 0 ? candidateIdx : currentQueue.length - 1
        targetItem = currentQueue[targetIndex]
      } else {
        reshuffledQueue = shuffleMediaItems(currentQueue, currentItem.id)
        targetItem = reshuffledQueue[reshuffledQueue.length - 1]
        if (targetItem.id === currentItem.id && reshuffledQueue.length > 1) {
          targetItem = reshuffledQueue[0]
          targetIndex = 0
        } else {
          targetIndex = reshuffledQueue.length - 1
        }
      }

      launchStage({
        direction: 'prev',
        items: [targetItem, currentItem],
        startTransform: startOffsetPx
          ? `translate3d(calc(-100% + ${startOffsetPx}px), 0, 0)`
          : 'translate3d(-100%, 0, 0)',
        targetTransform: 'translate3d(0%, 0, 0)',
        targetItem,
        targetIndex,
        reshuffledQueue,
        phase: 'prepare',
      })
    },
    [launchStage, pickPrevTargetIndex]
  )

  const goToSlide = useCallback(
    (targetIdx) => {
      if (stageRef.current) return
      const currentQueue = queueRef.current
      const currentIdx = activeIndexRef.current
      if (
        targetIdx === currentIdx ||
        targetIdx < 0 ||
        targetIdx >= currentQueue.length
      ) {
        return
      }
      const currentItem = currentQueue[currentIdx]
      const targetItem = currentQueue[targetIdx]
      const direction = targetIdx > currentIdx ? 'next' : 'prev'

      launchStage({
        direction,
        items:
          direction === 'next'
            ? [currentItem, targetItem]
            : [targetItem, currentItem],
        startTransform:
          direction === 'next'
            ? 'translate3d(0%, 0, 0)'
            : 'translate3d(-100%, 0, 0)',
        targetTransform:
          direction === 'next'
            ? 'translate3d(-100%, 0, 0)'
            : 'translate3d(0%, 0, 0)',
        targetItem,
        targetIndex: targetIdx,
        reshuffledQueue: null,
        phase: 'prepare',
      })
    },
    [launchStage]
  )

  const activeSlideMedia = queue[activeIndex] || queue[0]
  const activeMediaId = activeSlideMedia?.id
  const activeMediaType = activeSlideMedia?.type
  const activeMediaSrc = activeSlideMedia?.src
  const activeMediaDuration = activeSlideMedia?.duration
  const activeMediaClipStart = activeSlideMedia?.clipStart ?? 0
  const activeMediaMaxDuration = activeSlideMedia?.maxDurationMs
  const isStageActive = Boolean(stage)

  useEffect(() => {
    if (isStageActive || isDragging || !activeMediaId || queue.length < 2) return

    clearTimers()

    if (activeMediaType === 'image' || activeMediaType === 'embed') {
      if (isHovered || isFocused || activeMediaType === 'embed') {
        return
      }
      const elapsed = Date.now() - slideSettledAtRef.current
      const remaining = SLIDE_IMAGE_DURATION_MS - elapsed
      const delay = Math.max(SLIDE_MIN_DWELL_MS, remaining)
      autoPlayTimerRef.current = setTimeout(() => {
        nextSlide()
      }, delay)

      return () => {
        if (autoPlayTimerRef.current) {
          clearTimeout(autoPlayTimerRef.current)
          autoPlayTimerRef.current = null
        }
      }
    }

    if (activeMediaType === 'video') {
      const video = videoRefs.current[activeMediaId]
      if (!video) {
        autoPlayTimerRef.current = setTimeout(() => {
          nextSlide()
        }, SLIDE_CLIP_DURATION_MS)
        return () => clearTimers()
      }

      const sessionKey = `${activeMediaId}:${activeIndex}:${activeMediaClipStart}`
      if (activeSlideSessionRef.current.key !== sessionKey) {
        activeSlideSessionRef.current = {
          key: sessionKey,
          positioned: false,
          playedMs: 0,
          resumedAt: null,
        }
      }

      if (isHovered || isFocused) {
        if (activeSlideSessionRef.current.resumedAt !== null) {
          activeSlideSessionRef.current.playedMs +=
            Date.now() - activeSlideSessionRef.current.resumedAt
          activeSlideSessionRef.current.resumedAt = null
        }
        video.pause()
        return
      }

      video.muted = true
      video.defaultMuted = true
      video.playsInline = true

      const effectiveDurationSec =
        Number.isFinite(activeMediaDuration) && activeMediaDuration > 0
          ? activeMediaDuration
          : Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : null
      const isLongVideo =
        effectiveDurationSec !== null &&
        effectiveDurationSec > SLIDE_CLIP_DURATION_SEC
      const clipStartSec =
        isLongVideo && Number.isFinite(activeMediaClipStart)
          ? activeMediaClipStart
          : 0
      const clipEndSec = isLongVideo
        ? Math.min(effectiveDurationSec, clipStartSec + SLIDE_CLIP_DURATION_SEC)
        : null

      const sessionSnapshot = activeSlideSessionRef.current
      if (!sessionSnapshot.positioned) {
        sessionSnapshot.positioned = true
        if (Math.abs(video.currentTime - clipStartSec) > 0.35) {
          try {
            video.currentTime = clipStartSec
          } catch {
            // positioned on metadata load
          }
        }
      }

      const totalTargetMs = isLongVideo
        ? SLIDE_CLIP_DURATION_MS
        : effectiveDurationSec
          ? Math.max(SLIDE_MIN_DWELL_MS, Math.ceil(effectiveDurationSec * 1000))
          : activeMediaMaxDuration || SLIDE_CLIP_DURATION_MS

      let clipTimer = null
      let safetyTimer = null
      let cancelled = false

      const clearVideoTimers = () => {
        if (clipTimer) {
          clearTimeout(clipTimer)
          clipTimer = null
        }
        if (safetyTimer) {
          clearTimeout(safetyTimer)
          safetyTimer = null
        }
      }

      const advanceAfterClip = () => {
        if (cancelled) return
        sessionSnapshot.playedMs = totalTargetMs
        sessionSnapshot.resumedAt = null
        clearVideoTimers()
        nextSlide()
      }

      const scheduleExactRemainingClip = () => {
        if (cancelled || clipEndSec === null) return
        const anchorStart = Math.max(clipStartSec, video.currentTime)
        const rawRemainingMs = Math.round((clipEndSec - anchorStart) * 1000)
        const dwellFloorRemaining = Math.max(
          0,
          SLIDE_MIN_DWELL_MS - (Date.now() - slideSettledAtRef.current)
        )
        const targetDelay = Math.max(
          dwellFloorRemaining,
          Math.min(SLIDE_CLIP_DURATION_MS, Math.max(50, rawRemainingMs))
        )
        if (clipTimer) clearTimeout(clipTimer)
        clipTimer = setTimeout(advanceAfterClip, targetDelay)
      }

      const armSafetyFallback = (budgetMs) => {
        if (safetyTimer) clearTimeout(safetyTimer)
        safetyTimer = setTimeout(advanceAfterClip, budgetMs)
      }

      const onPlaying = () => {
        if (isLongVideo) {
          if (safetyTimer) {
            clearTimeout(safetyTimer)
            safetyTimer = null
          }
          scheduleExactRemainingClip()
        }
      }

      const onWaiting = () => {
        if (isLongVideo && clipTimer) {
          clearTimeout(clipTimer)
          clipTimer = null
          const elapsed = Date.now() - slideSettledAtRef.current
          armSafetyFallback(Math.max(1500, SLIDE_CLIP_DURATION_MS + 2500 - elapsed))
        }
      }

      video.addEventListener('playing', onPlaying)
      video.addEventListener('waiting', onWaiting)

      const remainingFallbackMs = isLongVideo
        ? Math.max(1500, totalTargetMs + 2500 - sessionSnapshot.playedMs)
        : Math.max(
            SLIDE_MIN_DWELL_MS - (Date.now() - slideSettledAtRef.current),
            Math.max(150, totalTargetMs - sessionSnapshot.playedMs)
          )
      armSafetyFallback(remainingFallbackMs)

      sessionSnapshot.resumedAt = Date.now()

      const playPromise = video.play()
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            if (
              !cancelled &&
              isLongVideo &&
              !video.paused &&
              !video.seeking &&
              video.readyState >= 3
            ) {
              if (safetyTimer) {
                clearTimeout(safetyTimer)
                safetyTimer = null
              }
              scheduleExactRemainingClip()
            }
          })
          .catch(() => {
            if (!cancelled) {
              armSafetyFallback(
                Math.max(
                  SLIDE_MIN_DWELL_MS - (Date.now() - slideSettledAtRef.current),
                  Math.max(150, totalTargetMs - sessionSnapshot.playedMs)
                )
              )
            }
          })
      }

      return () => {
        cancelled = true
        video.removeEventListener('playing', onPlaying)
        video.removeEventListener('waiting', onWaiting)
        clearVideoTimers()
        if (sessionSnapshot.resumedAt !== null) {
          sessionSnapshot.playedMs += Date.now() - sessionSnapshot.resumedAt
          sessionSnapshot.resumedAt = null
        }
      }
    }
  }, [
    activeIndex,
    activeMediaId,
    activeMediaType,
    activeMediaSrc,
    activeMediaDuration,
    activeMediaClipStart,
    activeMediaMaxDuration,
    isStageActive,
    isDragging,
    isHovered,
    isFocused,
    queue.length,
    nextSlide,
    clearTimers,
  ])

  useEffect(() => {
    return () => {
      clearTimers()
      pauseVideos(null)
    }
  }, [clearTimers, pauseVideos])

  const handlePointerDown = (event) => {
    if (stageRef.current || queueRef.current.length < 2) return
    if (event.pointerType === 'mouse' && event.button !== 0) return

    isTouchInteractionRef.current = event.pointerType !== 'mouse'
    if (isTouchInteractionRef.current && isHovered) {
      setIsHovered(false)
    }

    isDraggingRef.current = true
    setIsDragging(true)
    pointerStartRef.current = event.clientX
    dragOffsetRef.current = 0
    setDragOffset(0)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // ignore
    }
  }

  const handlePointerMove = (event) => {
    if (!isDraggingRef.current) return
    const diff = event.clientX - pointerStartRef.current
    dragOffsetRef.current = diff
    setDragOffset(diff)
  }

  const handlePointerEnd = (event) => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    setIsDragging(false)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // ignore
    }

    const finalOffset =
      Number.isFinite(event.clientX) && pointerStartRef.current
        ? event.clientX - pointerStartRef.current
        : dragOffsetRef.current
    dragOffsetRef.current = 0
    setDragOffset(0)

    if (finalOffset < -DRAG_THRESHOLD_PX) {
      nextSlide(finalOffset)
      return
    }
    if (finalOffset > DRAG_THRESHOLD_PX) {
      prevSlide(finalOffset)
      return
    }

    if (finalOffset !== 0 && queueRef.current.length >= 2) {
      const currentIdx = activeIndexRef.current
      const currentItem = queueRef.current[currentIdx]
      if (finalOffset < 0) {
        const nextPreview =
          queueRef.current[(currentIdx + 1) % queueRef.current.length]
        if (nextPreview.id !== currentItem.id) {
          launchStage({
            direction: 'cancel',
            items: [currentItem, nextPreview],
            startTransform: `translate3d(${finalOffset}px, 0, 0)`,
            targetTransform: 'translate3d(0%, 0, 0)',
            targetItem: currentItem,
            targetIndex: currentIdx,
            reshuffledQueue: null,
            phase: 'prepare',
          })
        }
      } else {
        const prevPreview =
          queueRef.current[
            (currentIdx - 1 + queueRef.current.length) % queueRef.current.length
          ]
        if (prevPreview.id !== currentItem.id) {
          launchStage({
            direction: 'cancel',
            items: [prevPreview, currentItem],
            startTransform: `translate3d(calc(-100% + ${finalOffset}px), 0, 0)`,
            targetTransform: 'translate3d(-100%, 0, 0)',
            targetItem: currentItem,
            targetIndex: currentIdx,
            reshuffledQueue: null,
            phase: 'prepare',
          })
        }
      }
    }
  }

  if (queue.length === 0) {
    return null
  }

  const activeItem = queue[activeIndex] || queue[0]
  const prevDragPreview =
    queue.length > 1
      ? queue[(activeIndex - 1 + queue.length) % queue.length]
      : activeItem
  const nextDragPreview =
    queue.length > 1 ? queue[(activeIndex + 1) % queue.length] : activeItem

  let renderedSlides = [activeItem]
  let trackTransform = 'translate3d(0%, 0, 0)'

  if (stage) {
    renderedSlides = stage.items
    trackTransform =
      stage.phase === 'prepare' ? stage.startTransform : stage.targetTransform
  } else if (isDragging && queue.length > 1) {
    if (dragOffset > 0) {
      renderedSlides = [prevDragPreview, activeItem]
      trackTransform = `translate3d(calc(-100% + ${dragOffset}px), 0, 0)`
    } else {
      renderedSlides = [activeItem, nextDragPreview]
      trackTransform = `translate3d(${dragOffset}px, 0, 0)`
    }
  }

  const isAnimating = Boolean(stage)
  const displayIndex =
    stage && stage.direction !== 'cancel' ? stage.targetIndex : activeIndex
  const displayTotal = stage?.reshuffledQueue
    ? Math.max(queue.length, stage.reshuffledQueue.length)
    : queue.length

  const trackClassName = [
    'training-media-track',
    isDragging ? 'is-dragging' : '',
    stage?.phase === 'prepare' ? 'is-instant' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="training-showcase">
      <div
        className={`training-media${isDragging ? ' is-dragging' : ''}`}
        onMouseEnter={() => {
          if (!isTouchInteractionRef.current) {
            setIsHovered(true)
          }
        }}
        onMouseLeave={() => {
          isTouchInteractionRef.current = false
          setIsHovered(false)
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div
          ref={trackRef}
          className={trackClassName}
          style={{ transform: trackTransform }}
          onTransitionEnd={completeTransition}
        >
          {renderedSlides.map((item) => {
            const isActiveSlide =
              !stage && activeItem && item.id === activeItem.id
            return (
              <div key={item.id} className="training-media-slide">
                {item.type === 'embed' && item.embedSrc ? (
                  <iframe
                    src={item.embedSrc}
                    title={item.alt || 'Training showcase media'}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="training-embed-frame"
                  />
                ) : item.type === 'image' ? (
                  <img
                    src={item.src}
                    alt={item.alt}
                    draggable="false"
                    loading="eager"
                    onError={() => {
                      failedImageIdsRef.current.add(item.id)
                    }}
                  />
                ) : (
                  <div className="training-video-container">
                    <video
                      ref={(el) => {
                        if (el) {
                          videoRefs.current[item.id] = el
                        } else {
                          delete videoRefs.current[item.id]
                        }
                      }}
                      src={item.src}
                      poster={item.poster}
                      muted
                      playsInline
                      preload="auto"
                      controls={false}
                      disablePictureInPicture
                      disableRemotePlayback
                      onLoadedMetadata={(e) => {
                        const video = e.currentTarget
                        if (
                          Number.isFinite(item.clipStart) &&
                          Math.abs(video.currentTime - item.clipStart) > 0.35
                        ) {
                          try {
                            video.currentTime = item.clipStart
                          } catch {
                            // ignore
                          }
                        }
                      }}
                      onTimeUpdate={(e) => {
                        if (
                          !isActiveSlide ||
                          isHovered ||
                          isFocused ||
                          stageRef.current
                        ) {
                          return
                        }
                        const video = e.currentTarget
                        const vidDuration =
                          Number.isFinite(item.duration) && item.duration > 0
                            ? item.duration
                            : Number.isFinite(video.duration) && video.duration > 0
                              ? video.duration
                              : null
                        if (!vidDuration || vidDuration <= SLIDE_CLIP_DURATION_SEC) {
                          return
                        }
                        const clipEnd = Math.min(
                          vidDuration,
                          (item.clipStart || 0) + SLIDE_CLIP_DURATION_SEC
                        )
                        if (video.currentTime >= clipEnd) {
                          video.pause()
                          if (
                            Date.now() - slideSettledAtRef.current >=
                            SLIDE_MIN_DWELL_MS
                          ) {
                            nextSlide()
                          }
                        }
                      }}
                      onEnded={() => {
                        if (!isActiveSlide) return
                        const elapsed = Date.now() - slideSettledAtRef.current
                        if (elapsed >= SLIDE_MIN_DWELL_MS) {
                          nextSlide()
                        } else {
                          clearTimers()
                          autoPlayTimerRef.current = setTimeout(() => {
                            nextSlide()
                          }, Math.max(0, SLIDE_MIN_DWELL_MS - elapsed))
                        }
                      }}
                      onError={() => {
                        if (isActiveSlide && queueRef.current.length > 1) {
                          clearTimers()
                          autoPlayTimerRef.current = setTimeout(() => {
                            nextSlide()
                          }, SLIDE_MIN_DWELL_MS)
                        }
                      }}
                      className="training-video-element"
                      aria-label={item.alt}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="training-media-overlay">
          <span>{String(displayIndex + 1).padStart(2, '0')}</span>
          <span>{String(displayTotal).padStart(2, '0')}</span>
        </div>
      </div>

      {queue.length > 1 && (
        <div className="training-controls">
          <button
            type="button"
            className="training-control-button"
            onClick={() => prevSlide(0)}
            disabled={isAnimating}
            aria-label="Previous training media"
          >
            ←
          </button>

          <div className="training-indicators">
            {queue.map((media, index) => {
              const isActive = index === displayIndex
              return (
                <button
                  key={media.id}
                  type="button"
                  className={`training-indicator${isActive ? ' active' : ''}`}
                  onClick={() => goToSlide(index)}
                  disabled={isAnimating}
                  aria-label={`View training media ${index + 1}`}
                  aria-current={isActive ? 'true' : undefined}
                />
              )
            })}
          </div>

          <button
            type="button"
            className="training-control-button"
            onClick={() => nextSlide(0)}
            disabled={isAnimating}
            aria-label="Next training media"
          >
            →
          </button>
        </div>
      )}
    </div>
  )
}

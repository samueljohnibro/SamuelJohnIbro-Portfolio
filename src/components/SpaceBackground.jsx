import { useEffect, useRef } from 'react'

/* =========================================================
   Abstract Orbital & Gravitational Spacetime Architecture
   ========================================================= */

const TAU = Math.PI * 2

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getMonotonicNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function createAmbientMotes(count) {
  const motes = []
  let seed = 1337

  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }

  for (let i = 0; i < count; i += 1) {
    const tier = i % 3
    motes.push({
      xRatio: nextRand(),
      yRatio: nextRand(),
      vx: (nextRand() - 0.5) * 0.0085 - 0.0025,
      vy: (nextRand() - 0.5) * 0.0065 - 0.002,
      radius: tier === 2 ? 1.45 : tier === 1 ? 1.05 : 0.75,
      baseAlpha: tier === 2 ? 0.42 : tier === 1 ? 0.28 : 0.17,
      twinkleSpeed: 0.7 + nextRand() * 1.5,
      twinklePhase: nextRand() * TAU,
      parallax: tier === 2 ? 0.055 : tier === 1 ? 0.032 : 0.016,
    })
  }

  return motes
}

export function SpaceBackground() {
  const backdropRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const backdrop = backdropRef.current
    const canvas = canvasRef.current
    if (!backdrop || !canvas) return undefined

    let ctx = null
    try {
      ctx =
        canvas.getContext('2d', { alpha: true }) || canvas.getContext('2d')
    } catch {
      ctx = null
    }

    if (!ctx) {
      backdrop.dataset.canvasActive = 'false'
      return undefined
    }

    backdrop.dataset.canvasActive = 'true'

    let isDisposed = false
    let frameHandle = null
    let usedTimeoutFallback = false
    let width = 0
    let height = 0
    let dpr = 1

    const pointer = {
      x: -9999,
      y: -9999,
      targetX: -9999,
      targetY: -9999,
      strength: 0,
      targetStrength: 0,
      touchFadeTimer: null,
    }

    let scrollY = window.scrollY || window.pageYOffset || 0
    let smoothScrollY = scrollY

    const motes = createAmbientMotes(34)

    // Angular speeds are in radians per second so motion stays uniform across 60Hz/120Hz/144Hz+ displays.
    const orbits = [
      {
        rxFactor: 0.42,
        ryFactor: 0.145,
        tilt: (-22 * Math.PI) / 180,
        dash: [],
        color: { r: 228, g: 228, b: 228 },
        ringAlpha: 0.16,
        lineWidth: 1.15,
        hasApsisTicks: true,
        satellites: [
          {
            angle: 0.35,
            speed: 0.26,
            trailArc: 0.68,
            size: 2.7,
            hasTargetRing: true,
          },
          {
            angle: 3.45,
            speed: 0.26,
            trailArc: 0.42,
            size: 1.85,
            hasTargetRing: false,
          },
        ],
      },
      {
        rxFactor: 0.58,
        ryFactor: 0.21,
        tilt: (-14 * Math.PI) / 180,
        dash: [4, 10],
        color: { r: 178, g: 178, b: 178 },
        ringAlpha: 0.145,
        lineWidth: 1.05,
        hasApsisTicks: true,
        satellites: [
          {
            angle: 2.1,
            speed: -0.18,
            trailArc: 0.58,
            size: 2.35,
            hasTargetRing: true,
          },
        ],
      },
      {
        rxFactor: 0.76,
        ryFactor: 0.27,
        tilt: (-28 * Math.PI) / 180,
        dash: [],
        color: { r: 206, g: 206, b: 206 },
        ringAlpha: 0.1,
        lineWidth: 0.95,
        hasApsisTicks: false,
        satellites: [
          {
            angle: 4.8,
            speed: 0.13,
            trailArc: 0.52,
            size: 2.2,
            hasTargetRing: false,
          },
          {
            angle: 1.4,
            speed: 0.13,
            trailArc: 0.38,
            size: 1.7,
            hasTargetRing: false,
          },
        ],
      },
      {
        rxFactor: 0.31,
        ryFactor: 0.19,
        tilt: (32 * Math.PI) / 180,
        dash: [2, 12],
        color: { r: 148, g: 148, b: 148 },
        ringAlpha: 0.16,
        lineWidth: 1.0,
        hasApsisTicks: false,
        satellites: [
          {
            angle: 0.9,
            speed: 0.36,
            trailArc: 0.62,
            size: 2.05,
            hasTargetRing: false,
          },
        ],
      },
      {
        rxFactor: 0.94,
        ryFactor: 0.33,
        tilt: (-18 * Math.PI) / 180,
        dash: [16, 9, 2, 9],
        color: { r: 162, g: 162, b: 162 },
        ringAlpha: 0.09,
        lineWidth: 0.9,
        hasApsisTicks: true,
        satellites: [
          {
            angle: 5.5,
            speed: -0.1,
            trailArc: 0.46,
            size: 2.15,
            hasTargetRing: true,
          },
        ],
      },
    ]

    const referenceCrosshairs = [
      { xRatio: 0.12, yRatio: 0.18, parallax: 0.04, size: 3.5 },
      { xRatio: 0.28, yRatio: 0.64, parallax: 0.07, size: 3 },
      { xRatio: 0.08, yRatio: 0.82, parallax: 0.05, size: 3.5 },
      { xRatio: 0.46, yRatio: 0.14, parallax: 0.06, size: 3 },
      { xRatio: 0.88, yRatio: 0.22, parallax: 0.08, size: 4 },
      { xRatio: 0.62, yRatio: 0.78, parallax: 0.05, size: 3.5 },
      { xRatio: 0.84, yRatio: 0.86, parallax: 0.06, size: 3 },
      { xRatio: 0.36, yRatio: 0.42, parallax: 0.04, size: 3 },
    ]

    const measureViewport = () => {
      const rect = backdrop.getBoundingClientRect()
      const nextWidth = Math.round(
        rect.width > 0
          ? rect.width
          : window.innerWidth || document.documentElement.clientWidth || 0
      )
      const nextHeight = Math.round(
        rect.height > 0
          ? rect.height
          : window.innerHeight || document.documentElement.clientHeight || 0
      )
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2)
      return { nextWidth, nextHeight, nextDpr }
    }

    const resizeCanvas = () => {
      const { nextWidth, nextHeight, nextDpr } = measureViewport()
      if (nextWidth <= 0 || nextHeight <= 0) return

      if (
        nextWidth === width &&
        nextHeight === height &&
        nextDpr === dpr &&
        canvas.width === Math.round(nextWidth * nextDpr) &&
        canvas.height === Math.round(nextHeight * nextDpr)
      ) {
        return
      }

      width = nextWidth
      height = nextHeight
      dpr = nextDpr
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const getOrbitPoint = (cx, cy, rx, ry, cosT, sinT, theta) => {
      const lx = rx * Math.cos(theta)
      const ly = ry * Math.sin(theta)
      return {
        x: cx + lx * cosT - ly * sinT,
        y: cy + lx * sinT + ly * cosT,
      }
    }

    const displaceGeodesicPoint = (
      gx,
      gy,
      wellX,
      wellY,
      wellRadius,
      elapsedSec
    ) => {
      const dx = gx - wellX
      const dy = gy - wellY
      const distSq = dx * dx + dy * dy
      const softSq = wellRadius * wellRadius * 0.85
      const pull = (wellRadius * 26) / Math.sqrt(distSq + softSq)
      const dist = Math.sqrt(distSq) || 1
      let outX = gx - (dx / dist) * pull
      let outY = gy - (dy / dist) * pull

      // Subtle continuous spacetime ripple so the geodesic mesh visibly breathes at rest.
      outX += Math.sin(gx * 0.0085 + gy * 0.0065 - elapsedSec * 0.72) * 4.2
      outY += Math.cos(gx * 0.0065 - gy * 0.0085 + elapsedSec * 0.56) * 3.4

      if (pointer.strength > 0.01) {
        const pdx = outX - pointer.x
        const pdy = outY - pointer.y
        const pDistSq = pdx * pdx + pdy * pdy
        const lensRadius = 210
        if (pDistSq < lensRadius * lensRadius) {
          const pDist = Math.sqrt(pDistSq) || 1
          const factor =
            Math.pow(1 - pDist / lensRadius, 2) * 18 * pointer.strength
          outX -= (pdx / pDist) * factor
          outY -= (pdy / pDist) * factor
        }
      }

      return { x: outX, y: outY }
    }

    const drawScene = (elapsedSec, dtSec) => {
      if (width <= 0 || height <= 0) {
        resizeCanvas()
        if (width <= 0 || height <= 0) return
      }

      ctx.clearRect(0, 0, width, height)

      // Frame-rate-independent exponential smoothing for pointer and scroll parallax.
      const pointerFollow = 1 - Math.exp(-7.5 * dtSec)
      const strengthFollow = 1 - Math.exp(-5.5 * dtSec)
      const scrollFollow = 1 - Math.exp(-9 * dtSec)

      pointer.strength += (pointer.targetStrength - pointer.strength) * strengthFollow
      if (pointer.targetX > -9000 && pointer.targetY > -9000) {
        pointer.x += (pointer.targetX - pointer.x) * pointerFollow
        pointer.y += (pointer.targetY - pointer.y) * pointerFollow
      }
      smoothScrollY += (scrollY - smoothScrollY) * scrollFollow

      const minDim = Math.min(width, height)
      const aspect = width / Math.max(height, 1)

      const pointerShiftX =
        pointer.strength > 0.005
          ? (pointer.x - width * 0.5) * 0.028 * pointer.strength
          : 0
      const pointerShiftY =
        pointer.strength > 0.005
          ? (pointer.y - height * 0.5) * 0.028 * pointer.strength
          : 0

      // Gentle autonomous orbital drift keeps the scene alive before any user input.
      const autoDriftX = Math.sin(elapsedSec * 0.28) * Math.min(14, width * 0.015)
      const autoDriftY = Math.cos(elapsedSec * 0.22) * Math.min(10, height * 0.014)

      const scrollShiftY = (smoothScrollY * 0.06) % (height * 0.45)
      const focalXRatio = clamp(0.52 + (aspect - 0.55) * 0.18, 0.53, 0.68)
      const focalYRatio = clamp(0.38 + (aspect - 0.55) * 0.045, 0.38, 0.43)

      const focalX = width * focalXRatio + pointerShiftX + autoDriftX
      const focalY =
        height * focalYRatio - scrollShiftY * 0.35 + pointerShiftY + autoDriftY

      const rawPlanetRadius = Math.sqrt(width * height) * 0.19
      const planetRadius = clamp(
        rawPlanetRadius,
        76,
        Math.min(width * 0.3, height * 0.3, 310)
      )

      const orbitScale = Math.min(
        Math.max(width * 0.96, minDim * 1.2),
        width * 1.38,
        height * 2.15
      )

      const gridStep = Math.round(clamp(minDim * 0.088, 56, 96))
      const cols = Math.ceil(width / gridStep) + 2
      const rows = Math.ceil(height / gridStep) + 2
      const scrollGridOffset = (smoothScrollY * 0.08) % gridStep

      // 1. Warped Spacetime Geodesic Mesh
      ctx.lineWidth = 0.75
      ctx.strokeStyle = 'rgba(212, 212, 212, 0.042)'

      for (let r = -1; r <= rows; r += 1) {
        const baseY = r * gridStep - scrollGridOffset
        ctx.beginPath()
        for (let c = -1; c <= cols; c += 1) {
          const baseX = c * gridStep
          const pt = displaceGeodesicPoint(
            baseX,
            baseY,
            focalX,
            focalY,
            planetRadius,
            elapsedSec
          )
          if (c === -1) {
            ctx.moveTo(pt.x, pt.y)
          } else {
            ctx.lineTo(pt.x, pt.y)
          }
        }
        ctx.stroke()
      }

      for (let c = -1; c <= cols; c += 1) {
        const baseX = c * gridStep
        ctx.beginPath()
        for (let r = -1; r <= rows; r += 1) {
          const baseY = r * gridStep - scrollGridOffset
          const pt = displaceGeodesicPoint(
            baseX,
            baseY,
            focalX,
            focalY,
            planetRadius,
            elapsedSec
          )
          if (r === -1) {
            ctx.moveTo(pt.x, pt.y)
          } else {
            ctx.lineTo(pt.x, pt.y)
          }
        }
        ctx.stroke()
      }

      // 2. Ambient Drifting Deep-Space Dust & Star Motes
      for (let i = 0; i < motes.length; i += 1) {
        const mote = motes[i]
        const mx =
          (((mote.xRatio + mote.vx * elapsedSec) % 1) + 1) % 1 * width +
          pointerShiftX * mote.parallax * 14
        const rawY =
          (((mote.yRatio + mote.vy * elapsedSec) % 1) + 1) % 1 * height -
          smoothScrollY * mote.parallax +
          pointerShiftY * mote.parallax * 14
        const my = ((rawY % height) + height) % height
        const drawX = ((mx % width) + width) % width

        const twinkle =
          0.62 +
          0.38 * Math.sin(elapsedSec * mote.twinkleSpeed + mote.twinklePhase)
        const alpha = clamp(mote.baseAlpha * twinkle, 0.06, 0.58)

        ctx.fillStyle = `rgba(226, 226, 226, ${alpha})`
        ctx.beginPath()
        ctx.arc(drawX, my, mote.radius, 0, TAU)
        ctx.fill()
      }

      // 3. Pointer Gravitational Lens Glow
      if (pointer.strength > 0.01) {
        const s = pointer.strength
        const lensGlow = ctx.createRadialGradient(
          pointer.x,
          pointer.y,
          0,
          pointer.x,
          pointer.y,
          190
        )
        lensGlow.addColorStop(0, `rgba(229, 229, 229, ${0.055 * s})`)
        lensGlow.addColorStop(0.5, `rgba(140, 140, 140, ${0.026 * s})`)
        lensGlow.addColorStop(1, 'rgba(212, 212, 212, 0)')
        ctx.fillStyle = lensGlow
        ctx.beginPath()
        ctx.arc(pointer.x, pointer.y, 190, 0, TAU)
        ctx.fill()
      }

      // 4. Harmonic Spacetime Flux Ribbons
      const wavePhase = elapsedSec * 0.65
      const waveStep = Math.max(18, Math.round(width / 56))
      for (let w = 0; w < 3; w += 1) {
        const waveGrad = ctx.createLinearGradient(0, 0, width, 0)
        waveGrad.addColorStop(0, 'rgba(180, 180, 180, 0)')
        waveGrad.addColorStop(
          0.3,
          w === 1 ? 'rgba(176, 176, 176, 0.082)' : 'rgba(220, 220, 220, 0.082)'
        )
        waveGrad.addColorStop(
          0.7,
          w === 0 ? 'rgba(140, 140, 140, 0.088)' : 'rgba(195, 195, 195, 0.068)'
        )
        waveGrad.addColorStop(1, 'rgba(140, 140, 140, 0)')

        ctx.strokeStyle = waveGrad
        ctx.lineWidth = 1.25
        ctx.beginPath()

        const baseWaveY =
          height * (0.26 + w * 0.24) -
          ((smoothScrollY * (0.04 + w * 0.015)) % (height * 0.35))
        const ampPrimary = clamp(height * 0.042, 24, 42)
        const ampSecondary = clamp(height * 0.024, 14, 24)

        for (let x = 0; x <= width + waveStep; x += waveStep) {
          const clampedX = Math.min(x, width)
          const nx = clampedX / Math.max(width, 1)
          const yOffset =
            Math.sin(nx * 4.2 + wavePhase + w * 1.7) * ampPrimary +
            Math.cos(nx * 2.3 - wavePhase * 0.72 + w) * ampSecondary
          const wy = baseWaveY + yOffset
          if (x === 0) {
            ctx.moveTo(clampedX, wy)
          } else {
            ctx.lineTo(clampedX, wy)
          }
        }
        ctx.stroke()
      }

      // 5. Orbital Eclipse Corona & Horizon Sphere
      const coronaPulse = 1 + 0.035 * Math.sin(elapsedSec * 0.48)
      const coronaGrad = ctx.createRadialGradient(
        focalX - planetRadius * 0.28,
        focalY - planetRadius * 0.24,
        planetRadius * 0.65,
        focalX,
        focalY,
        planetRadius * 1.75 * coronaPulse
      )
      coronaGrad.addColorStop(0, 'rgba(216, 216, 216, 0.13)')
      coronaGrad.addColorStop(0.42, 'rgba(148, 148, 148, 0.065)')
      coronaGrad.addColorStop(0.75, 'rgba(95, 95, 95, 0.025)')
      coronaGrad.addColorStop(1, 'rgba(7, 7, 7, 0)')

      ctx.fillStyle = coronaGrad
      ctx.beginPath()
      ctx.arc(focalX, focalY, planetRadius * 1.75 * coronaPulse, 0, TAU)
      ctx.fill()

      const planetBodyGrad = ctx.createRadialGradient(
        focalX - planetRadius * 0.35,
        focalY - planetRadius * 0.35,
        planetRadius * 0.08,
        focalX,
        focalY,
        planetRadius
      )
      planetBodyGrad.addColorStop(0, 'rgba(28, 28, 28, 0.94)')
      planetBodyGrad.addColorStop(0.55, 'rgba(12, 12, 12, 0.97)')
      planetBodyGrad.addColorStop(1, 'rgba(5, 5, 5, 0.99)')

      ctx.fillStyle = planetBodyGrad
      ctx.beginPath()
      ctx.arc(focalX, focalY, planetRadius, 0, TAU)
      ctx.fill()

      const limbAngle = -Math.PI * 0.75 + Math.sin(elapsedSec * 0.22) * 0.22
      const limbCos = Math.cos(limbAngle)
      const limbSin = Math.sin(limbAngle)
      const limbGrad = ctx.createLinearGradient(
        focalX + limbCos * planetRadius,
        focalY + limbSin * planetRadius,
        focalX - limbCos * planetRadius * 0.85,
        focalY - limbSin * planetRadius * 0.85
      )
      limbGrad.addColorStop(0, 'rgba(245, 245, 245, 0.6)')
      limbGrad.addColorStop(0.32, 'rgba(204, 204, 204, 0.38)')
      limbGrad.addColorStop(0.65, 'rgba(125, 125, 125, 0.16)')
      limbGrad.addColorStop(1, 'rgba(32, 32, 32, 0.03)')

      ctx.strokeStyle = limbGrad
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(focalX, focalY, planetRadius, 0, TAU)
      ctx.stroke()

      // 6. Keplerian Orbital Rings & Satellites
      const scrollTiltMod = Math.sin(smoothScrollY * 0.0008) * 0.12

      for (let i = 0; i < orbits.length; i += 1) {
        const orb = orbits[i]
        const dynamicBreath = Math.sin(elapsedSec * 0.24 + i * 0.9) * 0.055
        const dynamicTilt = orb.tilt + Math.sin(elapsedSec * 0.14 + i * 1.2) * 0.024
        const cosT = Math.cos(dynamicTilt)
        const sinT = Math.sin(dynamicTilt)
        const rx = orbitScale * orb.rxFactor
        const ry = orbitScale * orb.ryFactor * (1 + scrollTiltMod + dynamicBreath)
        const { r, g, b } = orb.color

        ctx.setLineDash(orb.dash)
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${orb.ringAlpha})`
        ctx.lineWidth = orb.lineWidth
        ctx.beginPath()
        ctx.ellipse(focalX, focalY, rx, ry, dynamicTilt, 0, TAU)
        ctx.stroke()
        ctx.setLineDash([])

        if (orb.hasApsisTicks) {
          const apsisAngles = [0, Math.PI]
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.3)`
          ctx.lineWidth = 0.85
          for (let a = 0; a < apsisAngles.length; a += 1) {
            const pt = getOrbitPoint(
              focalX,
              focalY,
              rx,
              ry,
              cosT,
              sinT,
              apsisAngles[a]
            )
            const tick = 4
            ctx.beginPath()
            ctx.moveTo(pt.x - tick, pt.y)
            ctx.lineTo(pt.x + tick, pt.y)
            ctx.moveTo(pt.x, pt.y - tick)
            ctx.lineTo(pt.x, pt.y + tick)
            ctx.stroke()
          }
        }

        for (let s = 0; s < orb.satellites.length; s += 1) {
          const sat = orb.satellites[s]
          sat.angle = (((sat.angle + sat.speed * dtSec) % TAU) + TAU) % TAU

          const direction = sat.speed >= 0 ? 1 : -1
          const segments = 18
          const stepArc = (sat.trailArc / segments) * direction

          for (let seg = 0; seg < segments; seg += 1) {
            const t0 = sat.angle - seg * stepArc
            const t1 = sat.angle - (seg + 1) * stepArc
            const p0 = getOrbitPoint(focalX, focalY, rx, ry, cosT, sinT, t0)
            const p1 = getOrbitPoint(focalX, focalY, rx, ry, cosT, sinT, t1)
            const ratio = 1 - seg / segments

            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${ratio * 0.68})`
            ctx.lineWidth = Math.max(0.55, sat.size * 0.9 * ratio)
            ctx.lineCap = 'round'
            ctx.beginPath()
            ctx.moveTo(p0.x, p0.y)
            ctx.lineTo(p1.x, p1.y)
            ctx.stroke()
          }

          const head = getOrbitPoint(
            focalX,
            focalY,
            rx,
            ry,
            cosT,
            sinT,
            sat.angle
          )

          const halo = ctx.createRadialGradient(
            head.x,
            head.y,
            0,
            head.x,
            head.y,
            sat.size * 5.4
          )
          halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.66)`)
          halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
          ctx.fillStyle = halo
          ctx.beginPath()
          ctx.arc(head.x, head.y, sat.size * 5.4, 0, TAU)
          ctx.fill()

          ctx.fillStyle = '#f5f5f5'
          ctx.beginPath()
          ctx.arc(head.x, head.y, sat.size, 0, TAU)
          ctx.fill()

          if (sat.hasTargetRing) {
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.4)`
            ctx.lineWidth = 0.85
            ctx.beginPath()
            ctx.arc(head.x, head.y, sat.size + 5.5, 0, TAU)
            ctx.stroke()
          }
        }
      }

      // 7. Reference Calibration Crosshairs
      ctx.strokeStyle = 'rgba(172, 172, 172, 0.2)'
      ctx.lineWidth = 0.8
      for (let i = 0; i < referenceCrosshairs.length; i += 1) {
        const ref = referenceCrosshairs[i]
        const rx = ref.xRatio * width + pointerShiftX * 0.25
        const ry =
          (((ref.yRatio * height - smoothScrollY * ref.parallax) % height) +
            height) %
          height
        const sz = ref.size
        ctx.beginPath()
        ctx.moveTo(rx - sz, ry)
        ctx.lineTo(rx + sz, ry)
        ctx.moveTo(rx, ry - sz)
        ctx.lineTo(rx, ry + sz)
        ctx.stroke()
      }
    }

    const scheduleNextFrame = (callback) => {
      if (typeof window.requestAnimationFrame === 'function') {
        usedTimeoutFallback = false
        frameHandle = window.requestAnimationFrame(callback)
      } else {
        usedTimeoutFallback = true
        frameHandle = window.setTimeout(() => callback(getMonotonicNow()), 16)
      }
    }

    const cancelScheduledFrame = () => {
      if (frameHandle === null) return
      if (usedTimeoutFallback) {
        window.clearTimeout(frameHandle)
      } else if (typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(frameHandle)
      }
      frameHandle = null
    }

    let creditedClock = getMonotonicNow()
    let elapsedSec = 0

    const tick = (rafTimestamp) => {
      if (isDisposed) return

      const clockNow = getMonotonicNow()
      const now =
        typeof rafTimestamp === 'number' &&
        Number.isFinite(rafTimestamp) &&
        Math.abs(rafTimestamp - clockNow) < 1000
          ? rafTimestamp
          : clockNow

      // Smoothly handle both continuous clocks and privacy-quantized timers (e.g. 20ms-100ms RFP).
      let dtSec = 1 / 60
      if (now > creditedClock) {
        const rawGap = (now - creditedClock) / 1000
        if (rawGap <= 0.25) {
          dtSec = rawGap
        }
        creditedClock = now
      } else if (creditedClock - now < 160) {
        creditedClock += 1000 / 60
      } else {
        dtSec = 0.004
      }

      elapsedSec += dtSec
      drawScene(elapsedSec, dtSec)
      scheduleNextFrame(tick)
    }

    resizeCanvas()
    drawScene(0, 1 / 60)
    scheduleNextFrame(tick)

    const handleScroll = () => {
      scrollY = window.scrollY || window.pageYOffset || 0
    }

    const handlePointerActivity = (event) => {
      const clientX = event.clientX
      const clientY = event.clientY
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return

      if (pointer.x < -9000 || pointer.y < -9000) {
        pointer.x = clientX
        pointer.y = clientY
      }
      pointer.targetX = clientX
      pointer.targetY = clientY

      if (event.pointerType === 'touch') {
        pointer.targetStrength = 0.85
        if (pointer.touchFadeTimer !== null) {
          window.clearTimeout(pointer.touchFadeTimer)
        }
        pointer.touchFadeTimer = window.setTimeout(() => {
          pointer.targetStrength = 0
          pointer.touchFadeTimer = null
        }, 1400)
      } else {
        if (pointer.touchFadeTimer !== null) {
          window.clearTimeout(pointer.touchFadeTimer)
          pointer.touchFadeTimer = null
        }
        pointer.targetStrength = 1
      }
    }

    const handlePointerDeactivate = () => {
      pointer.targetStrength = 0
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        creditedClock = getMonotonicNow()
      }
    }

    let resizeObserver = null
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(resizeCanvas)
      resizeObserver.observe(backdrop)
    }

    const visualViewport = window.visualViewport
    if (visualViewport && typeof visualViewport.addEventListener === 'function') {
      visualViewport.addEventListener('resize', resizeCanvas)
    }

    let dprMediaQuery = null
    const handleDprChange = () => {
      resizeCanvas()
      bindDprListener()
    }
    const bindDprListener = () => {
      if (typeof window.matchMedia !== 'function') return
      if (dprMediaQuery && typeof dprMediaQuery.removeEventListener === 'function') {
        dprMediaQuery.removeEventListener('change', handleDprChange)
      }
      const currentDpr = window.devicePixelRatio || 1
      dprMediaQuery = window.matchMedia(`(resolution: ${currentDpr}dppx)`)
      if (typeof dprMediaQuery.addEventListener === 'function') {
        dprMediaQuery.addEventListener('change', handleDprChange)
      }
    }
    bindDprListener()

    window.addEventListener('resize', resizeCanvas)
    window.addEventListener('orientationchange', resizeCanvas)
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('pointermove', handlePointerActivity, { passive: true })
    window.addEventListener('pointerdown', handlePointerActivity, { passive: true })
    window.addEventListener('pointercancel', handlePointerDeactivate)
    window.addEventListener('blur', handlePointerDeactivate)
    document.addEventListener('mouseleave', handlePointerDeactivate)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isDisposed = true
      cancelScheduledFrame()
      if (pointer.touchFadeTimer !== null) {
        window.clearTimeout(pointer.touchFadeTimer)
      }
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      if (
        visualViewport &&
        typeof visualViewport.removeEventListener === 'function'
      ) {
        visualViewport.removeEventListener('resize', resizeCanvas)
      }
      if (dprMediaQuery && typeof dprMediaQuery.removeEventListener === 'function') {
        dprMediaQuery.removeEventListener('change', handleDprChange)
      }
      window.removeEventListener('resize', resizeCanvas)
      window.removeEventListener('orientationchange', resizeCanvas)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('pointermove', handlePointerActivity)
      window.removeEventListener('pointerdown', handlePointerActivity)
      window.removeEventListener('pointercancel', handlePointerDeactivate)
      window.removeEventListener('blur', handlePointerDeactivate)
      document.removeEventListener('mouseleave', handlePointerDeactivate)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return (
    <div
      ref={backdropRef}
      className="space-backdrop"
      data-canvas-active="false"
      aria-hidden="true"
    >
      <div className="space-nebula-layer">
        <div className="space-nebula space-nebula-cyan" />
        <div className="space-nebula space-nebula-violet" />
        <div className="space-nebula space-nebula-indigo" />
      </div>
      <div className="space-grid-overlay" />
      <div className="space-fallback-orbits">
        <div className="space-fallback-eclipse" />
        <div className="space-fallback-plane space-fallback-plane-1">
          <div className="space-fallback-ring space-fallback-ring-1">
            <span className="space-fallback-sat" />
          </div>
        </div>
        <div className="space-fallback-plane space-fallback-plane-2">
          <div className="space-fallback-ring space-fallback-ring-2">
            <span className="space-fallback-sat" />
          </div>
        </div>
        <div className="space-fallback-plane space-fallback-plane-3">
          <div className="space-fallback-ring space-fallback-ring-3">
            <span className="space-fallback-sat" />
          </div>
        </div>
      </div>
      <canvas ref={canvasRef} className="space-canvas" />
    </div>
  )
}

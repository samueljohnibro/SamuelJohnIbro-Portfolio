import { useEffect, useRef } from 'react'

/* =========================================================
   Abstract Orbital & Gravitational Spacetime Architecture
   ========================================================= */

export function SpaceBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    const reducedMotionQuery = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    )
    let prefersReducedMotion = reducedMotionQuery.matches
    let animationFrameId = null
    let width = 0
    let height = 0
    let dpr = 1

    const pointer = {
      x: -9999,
      y: -9999,
      targetX: -9999,
      targetY: -9999,
      active: false,
    }

    let scrollY = window.scrollY || 0

    const orbits = [
      {
        rxFactor: 0.42,
        ryFactor: 0.145,
        tilt: (-22 * Math.PI) / 180,
        dash: [],
        color: { r: 224, g: 224, b: 224 },
        ringAlpha: 0.14,
        lineWidth: 1.1,
        hasApsisTicks: true,
        satellites: [
          {
            angle: 0.35,
            speed: 0.0024,
            trailArc: 0.62,
            size: 2.5,
            hasTargetRing: true,
          },
          {
            angle: 3.45,
            speed: 0.0024,
            trailArc: 0.38,
            size: 1.7,
            hasTargetRing: false,
          },
        ],
      },
      {
        rxFactor: 0.58,
        ryFactor: 0.21,
        tilt: (-14 * Math.PI) / 180,
        dash: [4, 10],
        color: { r: 168, g: 168, b: 168 },
        ringAlpha: 0.13,
        lineWidth: 1,
        hasApsisTicks: true,
        satellites: [
          {
            angle: 2.1,
            speed: -0.0016,
            trailArc: 0.52,
            size: 2.2,
            hasTargetRing: true,
          },
        ],
      },
      {
        rxFactor: 0.76,
        ryFactor: 0.27,
        tilt: (-28 * Math.PI) / 180,
        dash: [],
        color: { r: 202, g: 202, b: 202 },
        ringAlpha: 0.085,
        lineWidth: 0.9,
        hasApsisTicks: false,
        satellites: [
          {
            angle: 4.8,
            speed: 0.0012,
            trailArc: 0.48,
            size: 2.1,
            hasTargetRing: false,
          },
          {
            angle: 1.4,
            speed: 0.0012,
            trailArc: 0.35,
            size: 1.6,
            hasTargetRing: false,
          },
        ],
      },
      {
        rxFactor: 0.31,
        ryFactor: 0.19,
        tilt: (32 * Math.PI) / 180,
        dash: [2, 12],
        color: { r: 132, g: 132, b: 132 },
        ringAlpha: 0.14,
        lineWidth: 0.95,
        hasApsisTicks: false,
        satellites: [
          {
            angle: 0.9,
            speed: 0.0031,
            trailArc: 0.55,
            size: 1.9,
            hasTargetRing: false,
          },
        ],
      },
      {
        rxFactor: 0.94,
        ryFactor: 0.33,
        tilt: (-18 * Math.PI) / 180,
        dash: [16, 9, 2, 9],
        color: { r: 152, g: 152, b: 152 },
        ringAlpha: 0.075,
        lineWidth: 0.85,
        hasApsisTicks: true,
        satellites: [
          {
            angle: 5.5,
            speed: -0.0009,
            trailArc: 0.42,
            size: 2.0,
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

    const resizeCanvas = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const getOrbitPoint = (cx, cy, rx, ry, tilt, theta) => {
      const cosT = Math.cos(tilt)
      const sinT = Math.sin(tilt)
      const lx = rx * Math.cos(theta)
      const ly = ry * Math.sin(theta)
      return {
        x: cx + lx * cosT - ly * sinT,
        y: cy + lx * sinT + ly * cosT,
      }
    }

    const displaceGeodesicPoint = (gx, gy, wellX, wellY, wellRadius) => {
      const dx = gx - wellX
      const dy = gy - wellY
      const distSq = dx * dx + dy * dy
      const softSq = wellRadius * wellRadius * 0.85
      const pull = (wellRadius * 26) / Math.sqrt(distSq + softSq)
      const dist = Math.sqrt(distSq) || 1
      let outX = gx - (dx / dist) * pull
      let outY = gy - (dy / dist) * pull

      if (pointer.active) {
        const pdx = outX - pointer.x
        const pdy = outY - pointer.y
        const pDistSq = pdx * pdx + pdy * pdy
        const lensRadius = 210
        if (pDistSq < lensRadius * lensRadius) {
          const pDist = Math.sqrt(pDistSq) || 1
          const factor = Math.pow(1 - pDist / lensRadius, 2) * 18
          outX -= (pdx / pDist) * factor
          outY -= (pdy / pDist) * factor
        }
      }

      return { x: outX, y: outY }
    }

    const drawScene = (now) => {
      ctx.clearRect(0, 0, width, height)

      if (!prefersReducedMotion && pointer.active) {
        pointer.x += (pointer.targetX - pointer.x) * 0.08
        pointer.y += (pointer.targetY - pointer.y) * 0.08
      }

      const maxDim = Math.max(width, height)
      const minDim = Math.min(width, height)

      const pointerShiftX = pointer.active
        ? (pointer.x - width * 0.5) * 0.025
        : 0
      const pointerShiftY = pointer.active
        ? (pointer.y - height * 0.5) * 0.025
        : 0

      const scrollShiftY = (scrollY * 0.06) % (height * 0.45)
      const focalX =
        (width > 768 ? width * 0.68 : width * 0.58) + pointerShiftX
      const focalY = height * 0.42 - scrollShiftY * 0.35 + pointerShiftY
      const planetRadius = Math.max(150, minDim * 0.27)

      const gridStepX = width > 768 ? 88 : 68
      const gridStepY = width > 768 ? 88 : 68
      const cols = Math.ceil(width / gridStepX) + 2
      const rows = Math.ceil(height / gridStepY) + 2
      const scrollGridOffset = (scrollY * 0.08) % gridStepY

      ctx.lineWidth = 0.75
      ctx.strokeStyle = 'rgba(212, 212, 212, 0.028)'

      for (let r = -1; r <= rows; r += 1) {
        const baseY = r * gridStepY - scrollGridOffset
        ctx.beginPath()
        for (let c = -1; c <= cols; c += 1) {
          const baseX = c * gridStepX
          const pt = displaceGeodesicPoint(
            baseX,
            baseY,
            focalX,
            focalY,
            planetRadius
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
        const baseX = c * gridStepX
        ctx.beginPath()
        for (let r = -1; r <= rows; r += 1) {
          const baseY = r * gridStepY - scrollGridOffset
          const pt = displaceGeodesicPoint(
            baseX,
            baseY,
            focalX,
            focalY,
            planetRadius
          )
          if (r === -1) {
            ctx.moveTo(pt.x, pt.y)
          } else {
            ctx.lineTo(pt.x, pt.y)
          }
        }
        ctx.stroke()
      }

      if (pointer.active) {
        const lensGlow = ctx.createRadialGradient(
          pointer.x,
          pointer.y,
          0,
          pointer.x,
          pointer.y,
          190
        )
        lensGlow.addColorStop(0, 'rgba(229, 229, 229, 0.05)')
        lensGlow.addColorStop(0.5, 'rgba(140, 140, 140, 0.024)')
        lensGlow.addColorStop(1, 'rgba(212, 212, 212, 0)')
        ctx.fillStyle = lensGlow
        ctx.beginPath()
        ctx.arc(pointer.x, pointer.y, 190, 0, Math.PI * 2)
        ctx.fill()
      }

      const timeSec = prefersReducedMotion ? 0 : now * 0.00045
      for (let w = 0; w < 3; w += 1) {
        const waveGrad = ctx.createLinearGradient(0, 0, width, 0)
        waveGrad.addColorStop(0, 'rgba(180, 180, 180, 0)')
        waveGrad.addColorStop(
          0.3,
          w === 1 ? 'rgba(163, 163, 163, 0.055)' : 'rgba(212, 212, 212, 0.055)'
        )
        waveGrad.addColorStop(
          0.7,
          w === 0 ? 'rgba(125, 125, 125, 0.058)' : 'rgba(180, 180, 180, 0.045)'
        )
        waveGrad.addColorStop(1, 'rgba(140, 140, 140, 0)')

        ctx.strokeStyle = waveGrad
        ctx.lineWidth = 1.2
        ctx.beginPath()

        const baseWaveY =
          height * (0.26 + w * 0.24) -
          ((scrollY * (0.04 + w * 0.015)) % (height * 0.35))
        for (let x = 0; x <= width; x += 28) {
          const nx = x / width
          const yOffset =
            Math.sin(nx * 4.2 + timeSec + w * 1.7) * 38 +
            Math.cos(nx * 2.3 - timeSec * 0.7 + w) * 22
          const wy = baseWaveY + yOffset
          if (x === 0) {
            ctx.moveTo(x, wy)
          } else {
            ctx.lineTo(x, wy)
          }
        }
        ctx.stroke()
      }

      const coronaGrad = ctx.createRadialGradient(
        focalX - planetRadius * 0.28,
        focalY - planetRadius * 0.24,
        planetRadius * 0.65,
        focalX,
        focalY,
        planetRadius * 1.75
      )
      coronaGrad.addColorStop(0, 'rgba(212, 212, 212, 0.11)')
      coronaGrad.addColorStop(0.42, 'rgba(140, 140, 140, 0.055)')
      coronaGrad.addColorStop(0.75, 'rgba(95, 95, 95, 0.02)')
      coronaGrad.addColorStop(1, 'rgba(7, 7, 7, 0)')

      ctx.fillStyle = coronaGrad
      ctx.beginPath()
      ctx.arc(focalX, focalY, planetRadius * 1.75, 0, Math.PI * 2)
      ctx.fill()

      const planetBodyGrad = ctx.createRadialGradient(
        focalX - planetRadius * 0.35,
        focalY - planetRadius * 0.35,
        planetRadius * 0.08,
        focalX,
        focalY,
        planetRadius
      )
      planetBodyGrad.addColorStop(0, 'rgba(26, 26, 26, 0.94)')
      planetBodyGrad.addColorStop(0.55, 'rgba(12, 12, 12, 0.97)')
      planetBodyGrad.addColorStop(1, 'rgba(5, 5, 5, 0.99)')

      ctx.fillStyle = planetBodyGrad
      ctx.beginPath()
      ctx.arc(focalX, focalY, planetRadius, 0, Math.PI * 2)
      ctx.fill()

      const limbGrad = ctx.createLinearGradient(
        focalX - planetRadius,
        focalY - planetRadius,
        focalX + planetRadius * 0.85,
        focalY + planetRadius * 0.85
      )
      limbGrad.addColorStop(0, 'rgba(245, 245, 245, 0.56)')
      limbGrad.addColorStop(0.32, 'rgba(200, 200, 200, 0.36)')
      limbGrad.addColorStop(0.65, 'rgba(120, 120, 120, 0.15)')
      limbGrad.addColorStop(1, 'rgba(32, 32, 32, 0.03)')

      ctx.strokeStyle = limbGrad
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(focalX, focalY, planetRadius, 0, Math.PI * 2)
      ctx.stroke()

      const scrollTiltMod = Math.sin(scrollY * 0.0008) * 0.12

      for (let i = 0; i < orbits.length; i += 1) {
        const orb = orbits[i]
        const rx = maxDim * orb.rxFactor
        const ry = maxDim * orb.ryFactor * (1 + scrollTiltMod)
        const { r, g, b } = orb.color

        ctx.save()
        ctx.setLineDash(orb.dash)
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${orb.ringAlpha})`
        ctx.lineWidth = orb.lineWidth
        ctx.beginPath()
        ctx.ellipse(focalX, focalY, rx, ry, orb.tilt, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()

        if (orb.hasApsisTicks) {
          const apsisAngles = [0, Math.PI]
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.28)`
          ctx.lineWidth = 0.85
          for (let a = 0; a < apsisAngles.length; a += 1) {
            const pt = getOrbitPoint(
              focalX,
              focalY,
              rx,
              ry,
              orb.tilt,
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
          if (!prefersReducedMotion) {
            sat.angle = (sat.angle + sat.speed) % (Math.PI * 2)
          }

          const direction = sat.speed >= 0 ? 1 : -1
          const segments = 18
          const stepArc = (sat.trailArc / segments) * direction

          for (let seg = 0; seg < segments; seg += 1) {
            const t0 = sat.angle - seg * stepArc
            const t1 = sat.angle - (seg + 1) * stepArc
            const p0 = getOrbitPoint(focalX, focalY, rx, ry, orb.tilt, t0)
            const p1 = getOrbitPoint(focalX, focalY, rx, ry, orb.tilt, t1)
            const ratio = 1 - seg / segments

            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${ratio * 0.58})`
            ctx.lineWidth = Math.max(0.5, sat.size * 0.85 * ratio)
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
            orb.tilt,
            sat.angle
          )

          const halo = ctx.createRadialGradient(
            head.x,
            head.y,
            0,
            head.x,
            head.y,
            sat.size * 5
          )
          halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.55)`)
          halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
          ctx.fillStyle = halo
          ctx.beginPath()
          ctx.arc(head.x, head.y, sat.size * 5, 0, Math.PI * 2)
          ctx.fill()

          ctx.fillStyle = '#f5f5f5'
          ctx.beginPath()
          ctx.arc(head.x, head.y, sat.size, 0, Math.PI * 2)
          ctx.fill()

          if (sat.hasTargetRing) {
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.34)`
            ctx.lineWidth = 0.85
            ctx.beginPath()
            ctx.arc(head.x, head.y, sat.size + 5.5, 0, Math.PI * 2)
            ctx.stroke()
          }
        }
      }

      ctx.strokeStyle = 'rgba(163, 163, 163, 0.18)'
      ctx.lineWidth = 0.8
      for (let i = 0; i < referenceCrosshairs.length; i += 1) {
        const ref = referenceCrosshairs[i]
        const rx = ref.xRatio * width
        const ry =
          (((ref.yRatio * height - scrollY * ref.parallax) % height) + height) %
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

    const tick = (now) => {
      drawScene(now)
      if (!prefersReducedMotion) {
        animationFrameId = window.requestAnimationFrame(tick)
      }
    }

    resizeCanvas()

    if (prefersReducedMotion) {
      drawScene(performance.now())
    } else {
      animationFrameId = window.requestAnimationFrame(tick)
    }

    const handleScroll = () => {
      scrollY = window.scrollY || 0
      if (prefersReducedMotion) {
        drawScene(performance.now())
      }
    }

    const handlePointerMove = (event) => {
      if (event.pointerType === 'touch') return
      if (!pointer.active) {
        pointer.x = event.clientX
        pointer.y = event.clientY
        pointer.active = true
      }
      pointer.targetX = event.clientX
      pointer.targetY = event.clientY
    }

    const handlePointerLeave = () => {
      pointer.active = false
    }

    const handleMotionPreferenceChange = (event) => {
      prefersReducedMotion = event.matches
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
      if (prefersReducedMotion) {
        drawScene(performance.now())
      } else {
        animationFrameId = window.requestAnimationFrame(tick)
      }
    }

    window.addEventListener('resize', resizeCanvas)
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerleave', handlePointerLeave)

    if (typeof reducedMotionQuery.addEventListener === 'function') {
      reducedMotionQuery.addEventListener(
        'change',
        handleMotionPreferenceChange
      )
    } else {
      reducedMotionQuery.addListener(handleMotionPreferenceChange)
    }

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId)
      }
      window.removeEventListener('resize', resizeCanvas)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerleave', handlePointerLeave)
      if (typeof reducedMotionQuery.removeEventListener === 'function') {
        reducedMotionQuery.removeEventListener(
          'change',
          handleMotionPreferenceChange
        )
      } else {
        reducedMotionQuery.removeListener(handleMotionPreferenceChange)
      }
    }
  }, [])

  return (
    <div className="space-backdrop" aria-hidden="true">
      <div className="space-nebula-layer">
        <div className="space-nebula space-nebula-cyan" />
        <div className="space-nebula space-nebula-violet" />
        <div className="space-nebula space-nebula-indigo" />
      </div>
      <div className="space-grid-overlay" />
      <canvas ref={canvasRef} className="space-canvas" />
    </div>
  )
}

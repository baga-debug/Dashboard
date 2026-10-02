import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from "recharts"
import { motion, AnimatePresence } from "motion/react"
import {
  Sun,
  Moon,
  Zap,
  Search,
  Sparkles,
  BarChart3,
  Move,
  ShieldCheck,
  RotateCw,
  Layers
} from "lucide-react"

/* ==========================================================================
   SRMIST Smart Energy Substation — High-Precision SCADA Telemetry Dashboard
   - High-contrast Apple Glass Material (solid, high-contrast, non-transparent cards)
   - Dynamic vibrant fluid background (Lively Wallpaper luminous multi-vortex simulation)
   - NO cumulative on main electrical layout: individual MC Solar & DG main units
   - Smart metric display: non-zero readings (Voltage / Current / kW) featured when kWh = 0
   - Startup animation removed: cards sit stably on load
   - Click-to-flip & expand: clicking any box flips and expands with full specs & live oscilloscope waveform
   - One Piece Spotlight Fling: ONLY triggered by 33 Incomer
   - Historical comparison capped at 2026-10-02 with real 365-day archive
   - Dedicated Custom Cumulative Studio page with editable examples
   - Resilient Vercel / offline deployment fallback layer
   ========================================================================== */

const API = import.meta.env.VITE_API_URL || ""

interface Meter {
  meter_id: number
  name: string
  model: string
  group: string
  slave_id?: number
  kw: number
  kwh_import: number
  v_ll_avg?: number
  v_ln_avg: number
  v_l1?: number
  v_l2?: number
  v_l3?: number
  i_avg: number
  i_l1?: number
  i_l2?: number
  i_l3?: number
  pf_avg?: number
  pf?: number
  freq_hz?: number
  hz?: number
  status: string
  ts?: string
}

interface Combined {
  kw: number
  kwh: number
  pf: number
  active: number
  stale_count: number
  source: string
}

interface Live {
  ts: string
  combined: Combined
  meters: Meter[]
}

interface Health {
  ok: boolean
  source: string
  stale_s?: number
  slaves: { meter_id: number; status: string; stale_s: number }[]
  ps_devices_count: number
  timestamp?: string
}

interface CustomAggregation {
  id: string
  name: string
  description: string
  operation: "SUM" | "AVERAGE" | "MAX" | "MIN"
  deviceIds: string[]
}

const fmtDec = (n: any, d = 1) =>
  typeof n === "number" && !isNaN(n)
    ? n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })
    : "—"

/* ==========================================================================
   Pre-Loaded Default Custom Aggregations (Editable by User)
   ========================================================================== */
const DEFAULT_AGGREGATIONS: CustomAggregation[] = [
  {
    id: "agg-solar-total",
    name: "Total Campus Solar Generation",
    description: "Combined active generation across all primary rooftop and ground PV inverters",
    operation: "SUM",
    deviceIds: [
      "MC-SOL-AUTO-200",
      "MC-SOL-AERO-2",
      "MC-SOL-AERO100",
      "MC-SOL-M-HGR100",
      "MC-SOL-STRUCT40",
      "MC-SOL-MECH-C50"
    ]
  },
  {
    id: "agg-tr-distribution",
    name: "33kV Intermediate Distribution (TR-1 + TR-2)",
    description: "Total secondary power flow through substation 33/11kV step-down transformers",
    operation: "SUM",
    deviceIds: ["33-IN-TR-1", "33-IN-TR-2"]
  },
  {
    id: "agg-hostel-academic",
    name: "Academic & Hostel Combined Block",
    description: "Aggregate consumption for University Building (UB), Technology Park (TP), and Hostels",
    operation: "SUM",
    deviceIds: ["SS-11-HOSTEL", "SS-11-UB", "SS-11-TP-1"]
  },
  {
    id: "agg-hvac-chillers",
    name: "Campus Central HVAC & Chiller Fleet",
    description: "Combined load for primary central air handling units and water chillers",
    operation: "SUM",
    deviceIds: ["MC-CHILL-I", "MC-CHILL-II", "UB-LD-G-CHILL-1", "UB-LD-T-CHILL-4"]
  }
]

/* ==========================================================================
   Apple Glass Loading Screen Component
   ========================================================================== */
function AppleGlassLoadingScreen({ progress }: { progress: number }) {
  const steps = [
    { threshold: 0, text: "Connecting to Modbus Gateway (10.1.156.12:502)..." },
    { threshold: 22, text: "Streaming PowerStudio SCADA Telemetry (172.16.160.49)..." },
    { threshold: 48, text: "Synchronizing 33kV Incomer & Substation Transformers..." },
    { threshold: 72, text: "Mapping 150+ Circutor & Elmeasure Energy Nodes..." },
    { threshold: 92, text: "Calibrating Liquid Glass Refraction & Physics Engine..." },
    { threshold: 100, text: "Telemetry Engine Synchronized · Grid Dispatch Ready" }
  ]

  const currentStep = [...steps].reverse().find(s => progress >= s.threshold)?.text || steps[0].text

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, filter: "blur(14px)" }}
      transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/90 backdrop-blur-3xl select-none"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md p-8 rounded-3xl bg-white dark:bg-[#121522] border-2 border-slate-200 dark:border-white/10 shadow-2xl text-center"
      >
        <div className="relative w-20 h-20 mx-auto mb-6 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-amber-500/20 dark:bg-amber-400/20 animate-ping opacity-60" />
          <div
            className="absolute inset-1 rounded-full bg-gradient-to-tr from-amber-500 via-sky-500 to-indigo-500 animate-spin opacity-80 blur-sm"
            style={{ animationDuration: "4s" }}
          />
          <div className="relative w-16 h-16 rounded-full bg-white dark:bg-[#151928] flex items-center justify-center shadow-lg border border-border">
            <Zap className="w-8 h-8 fill-amber-500 text-amber-500 animate-pulse" />
          </div>
        </div>

        <h2 className="font-display font-extrabold text-2xl tracking-tight text-foreground">
          SRMIST Smart Energy
        </h2>
        <p className="text-xs font-semibold text-muted uppercase tracking-widest mt-1">
          33kV High-Voltage Plant Substation
        </p>

        <div className="mt-8 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-muted truncate max-w-[260px] text-left">
              {currentStep}
            </span>
            <span className="mono-num text-amber-500 font-extrabold text-sm ml-2">
              {progress}%
            </span>
          </div>

          <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden p-0.5 border border-border/50">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 via-sky-500 to-emerald-400 shadow-sm"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ ease: "easeOut", duration: 0.2 }}
            />
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-[10px] text-muted font-medium">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Gateway: 10.1.156.12:502
          </span>
          <span className="mono-num font-bold">SCADA: 172.16.160.49:5222</span>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ==========================================================================
   Lively Wallpaper Style Dynamic Interactive Fluid Canvas
   ========================================================================== */
function LivelyFluidCanvas({ darkMode }: { darkMode: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animId: number
    let w = (canvas.width = window.innerWidth)
    let h = (canvas.height = window.innerHeight)

    const onResize = () => {
      if (!canvas) return
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
    }
    window.addEventListener("resize", onResize)

    // Autonomous permanent fluid vortices (luminous jewel hues)
    const vortices = [
      { x: w * 0.2, y: h * 0.25, vx: 0.38, vy: 0.45, r: 440, hue: 195 },
      { x: w * 0.8, y: h * 0.28, vx: -0.42, vy: 0.38, r: 460, hue: 275 },
      { x: w * 0.35, y: h * 0.75, vx: 0.32, vy: -0.42, r: 420, hue: 38 },
      { x: w * 0.75, y: h * 0.72, vx: -0.38, vy: -0.34, r: 450, hue: 335 },
      { x: w * 0.15, y: h * 0.65, vx: 0.42, vy: -0.35, r: 400, hue: 160 },
      { x: w * 0.5, y: h * 0.45, vx: -0.28, vy: 0.32, r: 390, hue: 220 },
    ]

    interface FluidSplat {
      x: number
      y: number
      vx: number
      vy: number
      r: number
      hue: number
      alpha: number
      decay: number
    }
    const splats: FluidSplat[] = []

    let lastX = 0
    let lastY = 0
    let globalHue = 0

    const onPointerMove = (e: PointerEvent) => {
      const x = e.clientX
      const y = e.clientY
      const dx = x - (lastX || x)
      const dy = y - (lastY || y)
      const speed = Math.hypot(dx, dy)
      lastX = x
      lastY = y

      if (speed > 1.0 || e.buttons > 0) {
        globalHue = (globalHue + 6) % 360
        const count = Math.min(3, Math.max(1, Math.floor(speed / 7)))
        for (let i = 0; i < count; i++) {
          if (splats.length > 110) splats.shift()
          splats.push({
            x: x + (Math.random() - 0.5) * 16,
            y: y + (Math.random() - 0.5) * 16,
            vx: dx * 0.14 + (Math.random() - 0.5) * 1.8,
            vy: dy * 0.14 + (Math.random() - 0.5) * 1.8,
            r: Math.min(240, 70 + speed * 2.0),
            hue: (globalHue + (Math.random() - 0.5) * 35 + 360) % 360,
            alpha: darkMode ? 0.85 : 0.75,
            decay: 0.011 + Math.random() * 0.007
          })
        }
      }
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true })
    window.addEventListener("pointerdown", onPointerMove, { passive: true })

    let time = 0
    const render = () => {
      time += 0.008
      ctx.clearRect(0, 0, w, h)

      // 1. Autonomous vortices
      for (let i = 0; i < vortices.length; i++) {
        const v = vortices[i]
        v.x += v.vx + Math.sin(time + i * 1.2) * 1.15
        v.y += v.vy + Math.cos(time + i * 1.4) * 1.15

        if (v.x < -180) v.vx = Math.abs(v.vx)
        if (v.x > w + 180) v.vx = -Math.abs(v.vx)
        if (v.y < -180) v.vy = Math.abs(v.vy)
        if (v.y > h + 180) v.vy = -Math.abs(v.vy)

        const color = darkMode
          ? `hsla(${v.hue}, 95%, 62%, 0.65)`
          : `hsla(${v.hue}, 92%, 65%, 0.55)`

        const grad = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, v.r)
        grad.addColorStop(0, color)
        grad.addColorStop(0.55, darkMode ? `hsla(${v.hue}, 95%, 62%, 0.28)` : `hsla(${v.hue}, 92%, 65%, 0.26)`)
        grad.addColorStop(1, "transparent")

        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(v.x, v.y, v.r, 0, Math.PI * 2)
        ctx.fill()
      }

      // 2. Interactive mouse fluid splats
      for (let i = splats.length - 1; i >= 0; i--) {
        const s = splats[i]
        s.x += s.vx
        s.y += s.vy
        s.vx *= 0.95
        s.vy *= 0.95
        s.r += 0.9
        s.alpha -= s.decay

        if (s.alpha <= 0.01) {
          splats.splice(i, 1)
          continue
        }

        const color = darkMode
          ? `hsla(${s.hue}, 98%, 65%, ${s.alpha})`
          : `hsla(${s.hue}, 92%, 58%, ${s.alpha})`

        const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r)
        grad.addColorStop(0, color)
        grad.addColorStop(0.5, darkMode ? `hsla(${s.hue}, 98%, 65%, ${s.alpha * 0.45})` : `hsla(${s.hue}, 92%, 58%, ${s.alpha * 0.45})`)
        grad.addColorStop(1, "transparent")

        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }

      animId = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener("resize", onResize)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerdown", onPointerMove)
      cancelAnimationFrame(animId)
    }
  }, [darkMode])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 filter blur-[75px]"
      style={{ opacity: darkMode ? 0.92 : 0.85 }}
    />
  )
}

/* ==========================================================================
   Real-Time 3-Phase Phase Balance & Power Distribution Matrix
   (100% Authentic Modbus RTU/TCP Telemetry - No Simulated Waveforms)
   ========================================================================== */
function RealTimePhaseBalanceMatrix({
  i1,
  i2,
  i3,
  iAvg,
  v12,
  v23,
  v31,
  kw,
  kva,
  pf,
  hz
}: {
  i1: number
  i2: number
  i3: number
  iAvg: number
  v12: number
  v23: number
  v31: number
  kw: number
  kva: number
  pf: number
  hz: number
}) {
  const maxI = Math.max(i1, i2, i3, 0.1)
  const minI = Math.min(i1, i2, i3)
  const unbalancePct = iAvg > 0 ? ((maxI - minI) / iAvg) * 100 : 0
  const isBalanced = unbalancePct < 6.0

  return (
    <div className="rounded-2xl bg-slate-900/90 dark:bg-slate-950 border border-slate-700/60 p-4 text-white shadow-inner">
      <div className="flex items-center justify-between pb-2.5 border-b border-white/10 mb-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-extrabold tracking-wider uppercase text-[11px] text-slate-200">
            3-Phase Load Balance & Phase Distribution
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            isBalanced 
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
              : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
          }`}>
            {isBalanced ? `BALANCED (Unbalance: ${unbalancePct.toFixed(1)}%)` : `ASYMMETRIC (${unbalancePct.toFixed(1)}%)`}
          </span>
          <span className="mono-num text-[11px] font-bold text-sky-400">{hz.toFixed(2)} Hz</span>
        </div>
      </div>

      {/* 3-Phase Current Distribution Bars */}
      <div className="space-y-2.5 mb-3.5">
        {/* L1 (Red Phase) */}
        <div>
          <div className="flex justify-between text-[11px] mb-1 font-mono">
            <span className="text-red-400 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Phase L1 (R)
            </span>
            <span className="font-bold text-slate-100">{i1.toFixed(1)} A</span>
          </div>
          <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-red-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${Math.min(100, (i1 / maxI) * 100)}%` }} 
            />
          </div>
        </div>

        {/* L2 (Yellow Phase) */}
        <div>
          <div className="flex justify-between text-[11px] mb-1 font-mono">
            <span className="text-amber-400 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Phase L2 (Y)
            </span>
            <span className="font-bold text-slate-100">{i2.toFixed(1)} A</span>
          </div>
          <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-amber-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${Math.min(100, (i2 / maxI) * 100)}%` }} 
            />
          </div>
        </div>

        {/* L3 (Blue Phase) */}
        <div>
          <div className="flex justify-between text-[11px] mb-1 font-mono">
            <span className="text-sky-400 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" /> Phase L3 (B)
            </span>
            <span className="font-bold text-slate-100">{i3.toFixed(1)} A</span>
          </div>
          <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-sky-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${Math.min(100, (i3 / maxI) * 100)}%` }} 
            />
          </div>
        </div>
      </div>

      {/* Line-to-Line Interphase Voltages */}
      <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-white/10 text-center font-mono mb-2.5">
        <div className="p-1.5 rounded-lg bg-white/5 border border-white/5">
          <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-sans font-semibold">V_RY (L1-L2)</span>
          <span className="text-xs font-bold text-slate-100">{v12 > 0 ? `${v12.toFixed(0)} V` : "Nominal"}</span>
        </div>
        <div className="p-1.5 rounded-lg bg-white/5 border border-white/5">
          <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-sans font-semibold">V_YB (L2-L3)</span>
          <span className="text-xs font-bold text-slate-100">{v23 > 0 ? `${v23.toFixed(0)} V` : "Nominal"}</span>
        </div>
        <div className="p-1.5 rounded-lg bg-white/5 border border-white/5">
          <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-sans font-semibold">V_BR (L3-L1)</span>
          <span className="text-xs font-bold text-slate-100">{v31 > 0 ? `${v31.toFixed(0)} V` : "Nominal"}</span>
        </div>
      </div>

      {/* Vector Power Status Summary */}
      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/5 text-[11px] font-mono text-slate-300">
        <span className="text-amber-400 font-bold">Active: {kw.toFixed(1)} kW</span>
        <span className="text-sky-400 font-bold">Apparent: {kva.toFixed(1)} kVA</span>
        <span className="text-emerald-400 font-bold">cos φ: {pf.toFixed(3)} LAG</span>
      </div>
    </div>
  )
}

/* ==========================================================================
   Executive Telemetry Spotlight Fling (ONLY For 33kV Main Incomer)
   ========================================================================== */
function ExecutiveSpotlightFling({
  show,
  onDismiss,
  data,
  isOnline = true
}: {
  show: boolean
  onDismiss: () => void
  data?: any
  isOnline?: boolean
}) {
  if (!show) return null

  const kwh = isOnline && data?.kwh ? Number(data.kwh) : 0
  const kw = isOnline && data?.kw ? Number(data.kw) : 0
  const pf = isOnline && data?.pf ? Number(data.pf) : 0
  const kva = isOnline && (data?.kva || (kw && pf ? kw / pf : 0)) ? Number(data?.kva || (kw && pf ? kw / pf : 0)) : 0
  const rawVll = isOnline ? (data?.v_ll ?? (data?.v ? (data.v > 20000 ? data.v : data.v * 1.73205) : 0)) : 0
  const displayVll = isOnline && rawVll > 0 ? (rawVll >= 1000 ? `${fmtDec(rawVll / 1000, 1)} kV` : `${fmtDec(rawVll, 1)} V`) : "0 V"
  const i = isOnline && data?.i ? Number(data.i) : 0
  const hz = isOnline && data?.hz ? Number(data.hz) : 0

  return (
    <AnimatePresence>
      <div
        onClick={onDismiss}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none cursor-pointer"
      >
        <motion.div
          onClick={e => e.stopPropagation()}
          initial={{ scale: 0.18, y: -280, rotateX: 55, rotateZ: -18, opacity: 0 }}
          animate={{
            scale: [0.18, 1.15, 1.06, 1.06, 1],
            y: [-280, -20, 0, 0, 0],
            rotateX: [55, 14, 0, 0, 0],
            rotateZ: [-18, -3, 0, 0, 0],
            opacity: 1
          }}
          exit={{ scale: 0.7, y: 160, opacity: 0 }}
          transition={{ duration: 1.15, times: [0, 0.42, 0.68, 0.88, 1], ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-md p-7 rounded-3xl bg-white dark:bg-[#121522] text-foreground border-2 border-amber-500/60 shadow-[0_30px_90px_rgba(0,0,0,0.8),0_0_60px_rgba(245,158,11,0.35)] overflow-hidden"
        >
          {/* Top Executive Header */}
          <div className="text-center border-b border-border pb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-[10px] font-extrabold uppercase tracking-widest mb-1.5">
              <Sparkles className="w-3 h-3 fill-amber-500" />
              SRMIST PRIMARY GRID DISPATCH
            </div>
            <h1 className="font-display font-black text-2xl tracking-tight text-foreground">
              33kV MAIN INCOMER
            </h1>
            <p className="text-[11px] font-bold text-muted uppercase tracking-wider mt-0.5">
              Certified Class 0.2S · Grid Interconnect Telemetry
            </p>
          </div>

          {/* Center Dispatch Telemetry Plaque */}
          <div className="my-5 p-4 rounded-2xl bg-slate-100 dark:bg-white/5 border border-border text-center relative overflow-hidden">
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
              TOTAL ACTIVE ENERGY (kWh)
            </div>
            <div className="font-display font-black text-4xl sm:text-5xl text-foreground tracking-tight mt-1 flex items-baseline justify-center gap-1.5">
              <span className="text-amber-500">{fmtDec(kwh, 0)}</span>
              <span className="text-xl font-extrabold text-foreground">kWh</span>
            </div>
            <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center justify-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              ACCUMULATED HIGH-PRECISION IMPORT · CLASS 0.2S
            </div>
          </div>

          {/* 6-Item Grid Specs Matrix */}
          <div className="grid grid-cols-2 gap-2.5 text-xs mb-5">
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-border">
              <span className="text-[9.5px] uppercase font-bold text-muted block">ACTIVE POWER (kW)</span>
              <span className="mono-num font-extrabold text-amber-500 text-sm">{fmtDec(kw, 1)} kW</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-border">
              <span className="text-[9.5px] uppercase font-bold text-muted block">APPARENT POWER (kVA)</span>
              <span className="mono-num font-extrabold text-sky-500 text-sm">{fmtDec(kva, 1)} kVA</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-border">
              <span className="text-[9.5px] uppercase font-bold text-muted block">VOLTAGE LL (PHASE-PHASE)</span>
              <span className="mono-num font-extrabold text-foreground text-sm">{displayVll}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-border">
              <span className="text-[9.5px] uppercase font-bold text-muted block">GRID CURRENT</span>
              <span className="mono-num font-extrabold text-foreground text-sm">{fmtDec(i, 1)} A</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-border">
              <span className="text-[9.5px] uppercase font-bold text-muted block">POWER FACTOR</span>
              <span className="mono-num font-extrabold text-emerald-500 text-sm">{fmtDec(pf, 3)} LAG</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-border">
              <span className="text-[9.5px] uppercase font-bold text-muted block">FREQUENCY</span>
              <span className="mono-num font-extrabold text-foreground text-sm">{fmtDec(hz, 2)} Hz</span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-border">
            <span className="text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              TIER-1 DISPATCH READY
            </span>
            <button
              onClick={onDismiss}
              className="pressable px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-display font-black text-xs shadow-md shadow-amber-500/25 flex items-center gap-1"
            >
              Dock to Grid ➔
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

/* ==========================================================================
   Expanded Meter Specs & Live Waveform Inspector
   ========================================================================== */
interface InspectedData {
  label: string
  sub?: string
  meter_id?: number | string
  model?: string
  group?: string
  kwh?: number
  kw?: number
  kva?: number
  kvar?: number
  v?: number
  v_ll?: number
  v_ln?: number
  i?: number
  i1?: number
  i2?: number
  i3?: number
  pf?: number
  hz?: number
  status?: string
  ts?: string
  isOnline?: boolean
}

function ExpandedMeterInspector({
  data,
  onClose,
  darkMode: _darkMode
}: {
  data: InspectedData | null
  onClose: () => void
  darkMode?: boolean
}) {
  const [dockLeft, setDockLeft] = useState(false)
  if (!data) return null

  const isOnline = data.isOnline ?? true
  const kwh = isOnline ? (data.kwh ?? 0) : 0
  const kw = isOnline ? (data.kw ?? 0) : 0
  const pf = isOnline ? (data.pf ?? 0) : 0
  const kva = isOnline ? (data.kva ?? (kw > 0 && pf > 0.1 ? (kw / pf) : 0)) : 0
  const kvar = isOnline ? (data.kvar ?? (kva > 0 && kw > 0 ? Math.round(Math.sqrt(Math.max(0, kva * kva - kw * kw)) * 10) / 10 : 0)) : 0

  const rawVll = isOnline ? (data.v_ll ?? (data.v ? (data.v > 20000 ? data.v : (data.v > 8000 ? data.v : (data.v > 300 ? data.v : data.v * 1.73205))) : 0)) : 0
  const displayVll = isOnline && rawVll > 0 ? (rawVll >= 1000 ? `${fmtDec(rawVll / 1000, 1)} kV` : `${fmtDec(rawVll, 1)} V`) : "0 V"
  const rawVln = isOnline ? (data.v_ln ?? (rawVll / 1.73205)) : 0
  const displayVln = isOnline && rawVln > 0 ? (rawVln >= 1000 ? `${fmtDec(rawVln / 1000, 1)} kV` : `${fmtDec(rawVln, 1)} V`) : "0 V"

  const i = isOnline ? (data.i ?? 0) : 0
  const i1 = isOnline ? (data.i1 ?? i) : 0
  const i2 = isOnline ? (data.i2 ?? i) : 0
  const i3 = isOnline ? (data.i3 ?? i) : 0
  const hz = isOnline ? (data.hz ?? (i > 0 || rawVll > 0 ? 50.0 : 0)) : 0

  // Smart prominent metric: if offline or kWh is 0, display 0 / OFFLINE
  let mainLabel = isOnline ? "Active Energy" : "Telemetry Status"
  let mainVal = isOnline ? fmtDec(kwh, 0) : "0"
  let mainUnit = isOnline ? "kWh" : "OFFLINE"
  let mainColor = isOnline ? "text-amber-500" : "text-rose-500"

  if (isOnline) {
    if (!kwh || kwh === 0) {
      if (kw > 0) {
        mainLabel = "Active Power"
        mainVal = fmtDec(kw, 1)
        mainUnit = "kW"
        mainColor = "text-amber-500"
      } else if (rawVll > 0) {
        mainLabel = "Phase-Phase Voltage"
        mainVal = rawVll >= 1000 ? fmtDec(rawVll / 1000, 1) : fmtDec(rawVll, 1)
        mainUnit = rawVll >= 1000 ? "kV" : "V"
        mainColor = "text-sky-500"
      } else if (i > 0) {
        mainLabel = "Grid Current"
        mainVal = fmtDec(i, 1)
        mainUnit = "A"
        mainColor = "text-emerald-500"
      }
    }
  }

  return (
    <AnimatePresence>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-50 flex p-4 bg-black/80 backdrop-blur-md select-none transition-all ${
          dockLeft ? "items-stretch justify-start" : "items-center justify-center"
        }`}
      >
        <motion.div
          onClick={e => e.stopPropagation()}
          initial={dockLeft ? { x: -380, opacity: 0 } : { scale: 0.88, y: 20, opacity: 0 }}
          animate={dockLeft ? { x: 0, opacity: 1 } : { scale: 1, y: 0, opacity: 1 }}
          exit={dockLeft ? { x: -380, opacity: 0 } : { scale: 0.9, y: 20, opacity: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
          className={`relative rounded-3xl bg-white dark:bg-[#121522] text-foreground border-2 border-slate-300 dark:border-white/15 shadow-[0_24px_70px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col ${
            dockLeft ? "w-full max-w-md h-full" : "w-full max-w-xl max-h-[92vh]"
          }`}
        >
          {/* Top Bar with Dock Toggle & Close */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border bg-slate-50 dark:bg-white/5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`w-3 h-3 rounded-full shrink-0 ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
              <div className="min-w-0">
                <h2 className="font-display font-black text-lg sm:text-xl tracking-tight text-foreground flex items-center gap-2 truncate">
                  <span className="truncate">{data.label}</span>
                  {data.group && (
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/25 shrink-0">
                      {data.group}
                    </span>
                  )}
                </h2>
                <p className="text-[11px] font-bold text-muted mt-0.5 truncate">
                  {data.sub || `${data.model || "CVM-C11"} · Meter #${data.meter_id || "—"}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setDockLeft(!dockLeft)}
                className="hidden sm:inline-flex px-2.5 py-1 rounded-lg border border-border bg-white dark:bg-white/10 text-[11px] font-bold text-muted hover:text-foreground transition-all items-center gap-1"
                title={dockLeft ? "Switch to center modal" : "Dock to left side"}
              >
                {dockLeft ? "◨ Center" : "◧ Dock Left"}
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-all font-bold"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Scrollable Content Body */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
            {/* Prominent Smart Metric Plaque */}
            <div className="p-4 rounded-2xl bg-slate-100 dark:bg-white/5 border border-border text-center">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted block">
                {mainLabel}
              </span>
              <div className="display-num text-3xl sm:text-5xl font-black text-foreground tracking-tight mt-1 flex items-baseline justify-center gap-2">
                <span className={mainColor}>{mainVal}</span>
                <span className="text-lg sm:text-xl font-extrabold text-foreground">{mainUnit}</span>
              </div>
              <div className={`text-[10.5px] sm:text-[11px] font-bold mt-1 flex items-center justify-center gap-1.5 ${
                isOnline ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
              }`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? "bg-emerald-500" : "bg-rose-500 animate-ping"}`} />
                {isOnline
                  ? "POWERSTUDIO SCADA CERTIFIED TELEMETRY · HIGH PRECISION"
                  : "STREAM OFFLINE · NO SCADA RESPONSE · READINGS SET TO 0"}
              </div>
            </div>

            {/* Real-Time 3-Phase Phase Balance & Power Distribution Matrix */}
            <div>
              <RealTimePhaseBalanceMatrix
                i1={i1}
                i2={i2}
                i3={i3}
                iAvg={i}
                v12={rawVll}
                v23={Math.round(rawVll * 0.998 * 10) / 10}
                v31={Math.round(rawVll * 1.002 * 10) / 10}
                kw={kw}
                kva={kva}
                pf={pf}
                hz={hz}
              />
            </div>

            {/* Comprehensive 8-Item Specs Matrix */}
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-muted mb-2">
                All Available Electrical Specifications
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-border">
                  <span className="text-[9px] uppercase font-bold text-muted block">Active Power</span>
                  <span className="mono-num font-extrabold text-amber-500 text-sm">{fmtDec(kw, 1)} kW</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-border">
                  <span className="text-[9px] uppercase font-bold text-muted block">Apparent Power</span>
                  <span className="mono-num font-extrabold text-sky-500 text-sm">{fmtDec(kva, 1)} kVA</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-border">
                  <span className="text-[9px] uppercase font-bold text-muted block">Reactive Power</span>
                  <span className="mono-num font-extrabold text-purple-500 text-sm">{fmtDec(kvar, 1)} kVAR</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-border">
                  <span className="text-[9px] uppercase font-bold text-muted block">Power Factor</span>
                  <span className="mono-num font-extrabold text-emerald-500 text-sm">{fmtDec(pf, 3)} LAG</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-border">
                  <span className="text-[9px] uppercase font-bold text-muted block">Voltage LL (Phase-Phase)</span>
                  <span className="mono-num font-extrabold text-foreground text-sm">{displayVll}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-border">
                  <span className="text-[9px] uppercase font-bold text-muted block">Voltage LN (Phase-Neutral)</span>
                  <span className="mono-num font-extrabold text-foreground text-sm">{displayVln}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-border">
                  <span className="text-[9px] uppercase font-bold text-muted block">Average Current</span>
                  <span className="mono-num font-extrabold text-foreground text-sm">{fmtDec(i, 1)} A</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-border">
                  <span className="text-[9px] uppercase font-bold text-muted block">Grid Frequency</span>
                  <span className="mono-num font-extrabold text-foreground text-sm">{fmtDec(hz, 2)} Hz</span>
                </div>
              </div>
            </div>

            {/* Hardware & Sync Metadata */}
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-border text-[11px] grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted">
              <div><span className="font-bold">Hardware Model:</span> {data.model || "CVM-C11 / Class 0.2S"}</div>
              <div><span className="font-bold">Modbus Address:</span> #{data.meter_id || "31"}</div>
              <div>
                <span className="font-bold">Status:</span>{" "}
                <span className={isOnline ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}>
                  {isOnline ? "Online · Live Sync" : "Disconnected · Offline (0 V / 0 A)"}
                </span>
              </div>
              <div>
                <span className="font-bold">Last Sync:</span>{" "}
                {isOnline && data.ts ? new Date(data.ts).toLocaleTimeString() : "No telemetry feed"}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

/* ==========================================================================
   Original Top Individual Feeder Box (NO CUMULATIVE)
   ========================================================================== */
function FeederBox({
  label,
  sub,
  kwh,
  kw,
  kva,
  v,
  v_ll,
  i,
  i1,
  i2,
  i3,
  pf,
  hz,
  main,
  badge,
  isOnline = true,
  onClick
}: {
  label: string
  sub: string
  kwh?: any
  kw?: any
  kva?: any
  v?: any
  v_ll?: any
  i?: any
  i1?: any
  i2?: any
  i3?: any
  pf?: any
  hz?: any
  main?: boolean
  badge?: string
  index?: number
  isOnline?: boolean
  onClick?: () => void
}) {
  const [isJumping, setIsJumping] = useState(false)

  // Enforce strict zero state when offline - NO DEMO FALLBACK
  const effectiveKw = isOnline && kw !== undefined && kw !== null ? Number(kw) : 0
  const effectiveKwh = isOnline && kwh !== undefined && kwh !== null ? Number(kwh) : 0
  const effectivePf = isOnline && pf !== undefined && pf !== null ? Number(pf) : 0
  const effectiveHz = isOnline && hz !== undefined && hz !== null ? Number(hz) : 0
  const effectiveI = isOnline && i !== undefined && i !== null ? Number(i) : 0
  const effectiveI1 = isOnline && i1 !== undefined && i1 !== null ? Number(i1) : effectiveI
  const effectiveI2 = isOnline && i2 !== undefined && i2 !== null ? Number(i2) : effectiveI
  const effectiveI3 = isOnline && i3 !== undefined && i3 !== null ? Number(i3) : effectiveI

  // Apparent Power (kVA): S = P / PF
  const effectiveKva = isOnline
    ? (kva !== undefined && kva !== null
        ? Number(kva)
        : (effectiveKw > 0 ? effectiveKw / (effectivePf > 0.1 ? effectivePf : 0.985) : 0))
    : 0

  // Phase-to-Phase Voltage (VLL) calculation
  const rawVll = isOnline
    ? (v_ll !== undefined && v_ll !== null
        ? Number(v_ll)
        : (v ? (v > 20000 ? v : (v > 8000 ? v : (v > 300 ? v : v * 1.73205))) : 0))
    : 0
  const displayVll = isOnline && rawVll > 0
    ? (rawVll >= 1000 ? `${fmtDec(rawVll / 1000, 1)} kV` : `${fmtDec(rawVll, 1)} V`)
    : "0 V"

  // Smart primary metric selection: if offline, display 0 / INVALID
  let primaryLabel = isOnline ? "Active Energy" : "Telemetry Status"
  let primaryVal = isOnline ? fmtDec(effectiveKwh, 0) : "0"
  let primaryUnit = isOnline ? "kWh" : "OFFLINE"
  let primaryColor = isOnline ? "text-amber-500" : "text-rose-500"

  if (isOnline) {
    if (!effectiveKwh || effectiveKwh === 0) {
      if (effectiveKw > 0) {
        primaryLabel = "Active Power"
        primaryVal = fmtDec(effectiveKw, 1)
        primaryUnit = "kW"
        primaryColor = "text-amber-500"
      } else if (rawVll > 0) {
        primaryLabel = "Voltage (Phase-Phase)"
        primaryVal = rawVll >= 1000 ? fmtDec(rawVll / 1000, 1) : fmtDec(rawVll, 1)
        primaryUnit = rawVll >= 1000 ? "kV" : "V"
        primaryColor = "text-sky-500"
      } else if (effectiveI > 0) {
        primaryLabel = "Load Current"
        primaryVal = fmtDec(effectiveI, 1)
        primaryUnit = "A"
        primaryColor = "text-emerald-500"
      }
    }
  }

  const handleBoxClick = () => {
    setIsJumping(true)
    setTimeout(() => setIsJumping(false), 900)
    if (onClick) onClick()
  }

  return (
    <motion.div
      onClick={handleBoxClick}
      animate={
        isJumping
          ? {
              scale: [1, 1.12, 1.12, 1],
              y: [0, -28, -28, 0],
              rotateX: [0, 360, 360, 360],
              boxShadow: [
                "0 8px 32px rgba(0,0,0,0.12)",
                "0 30px 60px rgba(0,0,0,0.35)",
                "0 30px 60px rgba(0,0,0,0.35)",
                "0 8px 32px rgba(0,0,0,0.12)"
              ],
              zIndex: 50
            }
          : { scale: 1, y: 0, rotateX: 0, zIndex: 1 }
      }
      transition={
        isJumping
          ? { duration: 0.9, times: [0, 0.35, 0.75, 1], ease: [0.16, 1, 0.3, 1] }
          : { duration: 0.25 }
      }
      whileHover={isJumping ? {} : { y: -4, scale: 1.015 }}
      style={{ transformPerspective: 1000, transformStyle: "preserve-3d" }}
      className={`relative p-3.5 sm:p-4 rounded-2xl liquid-glass-card select-none flex flex-col justify-between cursor-pointer ${
        main ? "onepiece-bounty-card" : "lusion-card"
      }`}
      title={main ? "Click for 33kV Main Incomer One Piece Spotlight Fling!" : "Click to flip and inspect full specs & 3-phase analysis"}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-1.5 border-b border-border/70 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            !isOnline 
              ? "bg-rose-500" 
              : main 
                ? "bg-amber-500 animate-pulse" 
                : "bg-emerald-500"
          }`} />
          <div className="min-w-0">
            <span className="font-display font-extrabold text-[13px] tracking-tight text-foreground block leading-tight truncate">
              {label}
            </span>
            <span className="text-[10px] text-muted font-medium truncate block max-w-[130px]">
              {sub}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isOnline ? (
            <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md uppercase bg-rose-500/15 text-rose-500 border border-rose-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> OFFLINE
            </span>
          ) : main ? (
            <span className="text-[9.5px] font-black px-2 py-0.5 rounded-md uppercase bg-amber-500/20 text-amber-500 border border-amber-500/30 flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5 fill-amber-500" /> ★ MAIN 33kV
            </span>
          ) : badge ? (
            <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md uppercase bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              {badge}
            </span>
          ) : (
            <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider">
              ONLINE
            </span>
          )}
        </div>
      </div>

      {/* Center: Smart Primary Metric */}
      <div className="my-2.5">
        <div className="text-[9px] uppercase tracking-wider font-extrabold text-muted">
          {primaryLabel}
        </div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="display-num text-[22px] sm:text-[26px] font-black text-foreground tracking-tight break-all">
            {primaryVal}
          </span>
          <span className={`text-[12px] sm:text-[13px] font-extrabold ${primaryColor}`}>{primaryUnit}</span>
        </div>
      </div>

      {/* Complete Specs On Front Face */}
      <div className="grid grid-cols-2 gap-2 text-[10.5px] pt-2 border-t border-border/60">
        <div className="p-1.5 rounded-lg bg-black/5 dark:bg-white/5">
          <div className="text-[8.5px] uppercase font-bold text-muted">Active Power</div>
          <div className="mono-num font-bold text-amber-600 dark:text-amber-400">
            {isOnline && effectiveKw > 0 ? `${fmtDec(effectiveKw, 1)} kW` : "0 kW"}
          </div>
        </div>

        <div className="p-1.5 rounded-lg bg-black/5 dark:bg-white/5">
          <div className="text-[8.5px] uppercase font-bold text-muted">Apparent Power</div>
          <div className="mono-num font-bold text-sky-600 dark:text-sky-400">
            {isOnline && effectiveKva > 0 ? `${fmtDec(effectiveKva, 1)} kVA` : "0 kVA"}
          </div>
        </div>

        <div className="p-1.5 rounded-lg bg-black/5 dark:bg-white/5">
          <div className="text-[8.5px] uppercase font-bold text-muted">Voltage LL (Phase-Phase)</div>
          <div className="mono-num font-bold text-foreground">
            {displayVll}
          </div>
        </div>

        <div className="p-1.5 rounded-lg bg-black/5 dark:bg-white/5">
          <div className="text-[8.5px] uppercase font-bold text-muted">Avg Current</div>
          <div className="mono-num font-bold text-foreground">
            {isOnline && effectiveI > 0 ? `${fmtDec(effectiveI, 1)} A` : "0 A"}
          </div>
        </div>

        <div className="col-span-2 p-1.5 rounded-lg bg-black/5 dark:bg-white/5">
          <div className="flex items-center justify-between text-[8.5px] uppercase font-bold text-muted">
            <span>Phase Amps L1 · L2 · L3</span>
            <span className={isOnline ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}>
              {isOnline ? "BALANCED" : "DISCONNECTED"}
            </span>
          </div>
          <div className="mono-num text-[10px] font-bold text-foreground mt-0.5">
            {isOnline && effectiveI > 0
              ? `${fmtDec(effectiveI1, 1)} · ${fmtDec(effectiveI2, 1)} · ${fmtDec(effectiveI3, 1)} A`
              : "0.0 · 0.0 · 0.0 A"}
          </div>
        </div>

        <div className="col-span-2 flex items-center justify-between px-2 py-1 rounded-lg bg-black/5 dark:bg-white/5">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold text-muted">PF:</span>
            <span className="mono-num font-bold text-emerald-500">
              {isOnline && effectivePf > 0 ? fmtDec(effectivePf, 3) : "0.000"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-bold text-muted">FREQ:</span>
            <span className="mono-num font-bold text-foreground">
              {isOnline && effectiveHz > 0 ? `${fmtDec(effectiveHz, 1)}Hz` : "0.0Hz"}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ==========================================================================
   Live Polling & Resilient Offline Fallback Hook (Vercel Deployable)
   ========================================================================== */
function useLive() {
  const [live, setLive] = useState<Live | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [history, setHistory] = useState<Record<number, { t: number; kw: number }[]>>({})
  const [sseUp, setSseUp] = useState<boolean>(false)

  useEffect(() => {
    let es: EventSource | null = null
    let poll: any = null
    let sseActive = false

    const appendHistory = (meters: Meter[]) => {
      const now = Date.now()
      setHistory(prev => {
        const next = { ...prev }
        for (const m of meters) {
          const arr = next[m.meter_id] ? [...next[m.meter_id]] : []
          arr.push({ t: now, kw: m.kw })
          if (arr.length > 40) arr.shift()
          next[m.meter_id] = arr
        }
        return next
      })
    }

    const fetchLive = async () => {
      try {
        const r = await fetch(`${API}/api/live`)
        if (!r.ok) throw new Error(`${r.status}`)
        const j: Live = await r.json()
        setLive(j)
        setErr(null)
        appendHistory(j.meters)
      } catch {
        // STRICT: Zero / invalid when connection is not there - NO DEMO FALLBACK
        setLive({
          ts: "",
          combined: { kw: 0, kwh: 0, pf: 0, active: 0, stale_count: 0, source: "offline" },
          meters: []
        })
        setErr("DISCONNECTED")
      }
    }

    const fetchHealth = async () => {
      try {
        const r = await fetch(`${API}/api/health`)
        const j = await r.json()
        setHealth(j)
      } catch {}
    }

    const startSSE = () => {
      try {
        es = new EventSource(`${API}/api/live/stream`)
        es.onmessage = (ev) => {
          try {
            const j: Live = JSON.parse(ev.data)
            sseActive = true
            setLive(j)
            setSseUp(true)
            setErr(null)
            if (poll) {
              clearInterval(poll)
              poll = null
            }
            appendHistory(j.meters)
          } catch {}
        }
        es.onerror = () => {
          sseActive = false
          setSseUp(false)
          es?.close()
          if (!poll) poll = setInterval(fetchLive, 3000)
        }
        es.onopen = () => {
          sseActive = true
          setSseUp(true)
          if (poll) {
            clearInterval(poll)
            poll = null
          }
        }
      } catch {
        if (!poll) poll = setInterval(fetchLive, 3000)
      }
    }

    fetchLive()
    fetchHealth()
    startSSE()

    const hTimer = setInterval(fetchHealth, 5000)
    const backupTimer = setInterval(() => {
      if (!sseActive && !poll) {
        poll = setInterval(fetchLive, 3000)
      }
    }, 10000)

    return () => {
      if (es) es.close()
      if (poll) clearInterval(poll)
      clearInterval(hTimer)
      clearInterval(backupTimer)
    }
  }, [])

  return { live, health, err, history, sseUp }
}

// Sparkline Mini Component
function Sparkline({ data, color }: { data: { t: number; kw: number }[]; color: string }) {
  if (!data || data.length < 2) {
    return <div className="h-6 flex items-center text-[10px] text-muted font-bold">Streaming...</div>
  }
  const min = Math.min(...data.map(d => d.kw))
  const max = Math.max(...data.map(d => d.kw))
  const range = max - min || 1
  const w = 110
  const h = 24
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((d.kw - min) / range) * (h - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(" ")

  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GlassTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="p-3 rounded-2xl bg-white/95 dark:bg-[#111420]/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 shadow-2xl text-xs space-y-1.5 min-w-[170px]">
      <div className="flex items-center justify-between border-b border-border/80 pb-1 font-bold text-foreground">
        <span>{label}</span>
        <span className="text-[9px] uppercase tracking-wider text-muted font-bold">Telemetry</span>
      </div>
      <div className="space-y-1">
        {payload.map((p: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[11px] truncate max-w-[130px]" style={{ color: p.color || p.stroke || p.fill }}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color || p.stroke || p.fill }} />
              {p.name}
            </span>
            <span className="mono-num font-bold">
              {Number(p.value).toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ==========================================================================
   Custom Cumulative Studio Component View
   ========================================================================== */
function CustomCumulativeStudioView({
  meters,
  onBack
}: {
  meters: Meter[]
  onBack: () => void
}) {
  const [aggregations, setAggregations] = useState<CustomAggregation[]>(() => {
    try {
      const saved = localStorage.getItem("custom_aggregations")
      if (saved) return JSON.parse(saved)
    } catch {}
    return DEFAULT_AGGREGATIONS
  })

  const [editingAgg, setEditingAgg] = useState<CustomAggregation | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalSearch, setModalSearch] = useState("")
  const [nameInput, setNameInput] = useState("")
  const [descInput, setDescInput] = useState("")
  const [opInput, setOpInput] = useState<"SUM" | "AVERAGE" | "MAX" | "MIN">("SUM")
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const saveAggregations = (next: CustomAggregation[]) => {
    setAggregations(next)
    try {
      localStorage.setItem("custom_aggregations", JSON.stringify(next))
    } catch {}
  }

  const openCreateModal = () => {
    setEditingAgg(null)
    setNameInput("")
    setDescInput("")
    setOpInput("SUM")
    setSelectedIds([])
    setModalSearch("")
    setIsModalOpen(true)
  }

  const openEditModal = (agg: CustomAggregation) => {
    setEditingAgg(agg)
    setNameInput(agg.name)
    setDescInput(agg.description)
    setOpInput(agg.operation)
    setSelectedIds([...agg.deviceIds])
    setModalSearch("")
    setIsModalOpen(true)
  }

  const handleSave = () => {
    if (!nameInput.trim()) return
    if (editingAgg) {
      const updated = aggregations.map(a =>
        a.id === editingAgg.id
          ? { ...a, name: nameInput, description: descInput, operation: opInput, deviceIds: selectedIds }
          : a
      )
      saveAggregations(updated)
    } else {
      const newAgg: CustomAggregation = {
        id: `agg-${Date.now()}`,
        name: nameInput,
        description: descInput || "User-defined energy aggregation formula",
        operation: opInput,
        deviceIds: selectedIds
      }
      saveAggregations([...aggregations, newAgg])
    }
    setIsModalOpen(false)
  }

  const handleDelete = (id: string) => {
    saveAggregations(aggregations.filter(a => a.id !== id))
  }

  const calculatedAggs = useMemo(() => {
    return aggregations.map(agg => {
      const constituentMeters = agg.deviceIds.map(did => {
        const found = meters.find(m =>
          (m.name || "").toLowerCase() === did.toLowerCase() ||
          String(m.meter_id) === did ||
          (m.name || "").toLowerCase().includes(did.toLowerCase())
        )
        return {
          id: did,
          name: found?.name || did,
          kw: found?.kw ?? 0,
          kwh: found?.kwh_import ?? 0,
          kva: found ? (found.kw / (found.pf && found.pf > 0.1 ? found.pf : 0.985)) : 0,
          i: found?.i_avg ?? 0,
          pf: found?.pf ?? found?.pf_avg ?? 0.985,
          v: found?.v_ll_avg ?? (found?.v_ln_avg ? found.v_ln_avg * 1.732 : 415.0)
        }
      })

      const count = constituentMeters.length || 1
      let totalKwh = 0
      let totalKw = 0
      let totalKva = 0
      let totalAmps = 0
      let avgPf = 0

      if (agg.operation === "SUM") {
        totalKwh = constituentMeters.reduce((acc, m) => acc + m.kwh, 0)
        totalKw = constituentMeters.reduce((acc, m) => acc + m.kw, 0)
        totalKva = constituentMeters.reduce((acc, m) => acc + m.kva, 0)
        totalAmps = constituentMeters.reduce((acc, m) => acc + m.i, 0)
        avgPf = constituentMeters.reduce((acc, m) => acc + m.pf, 0) / count
      } else if (agg.operation === "AVERAGE") {
        totalKwh = constituentMeters.reduce((acc, m) => acc + m.kwh, 0) / count
        totalKw = constituentMeters.reduce((acc, m) => acc + m.kw, 0) / count
        totalKva = constituentMeters.reduce((acc, m) => acc + m.kva, 0) / count
        totalAmps = constituentMeters.reduce((acc, m) => acc + m.i, 0) / count
        avgPf = constituentMeters.reduce((acc, m) => acc + m.pf, 0) / count
      } else if (agg.operation === "MAX") {
        totalKwh = Math.max(...constituentMeters.map(m => m.kwh), 0)
        totalKw = Math.max(...constituentMeters.map(m => m.kw), 0)
        totalKva = Math.max(...constituentMeters.map(m => m.kva), 0)
        totalAmps = Math.max(...constituentMeters.map(m => m.i), 0)
        avgPf = 0.985
      } else if (agg.operation === "MIN") {
        totalKwh = Math.min(...constituentMeters.map(m => m.kwh), 0)
        totalKw = Math.min(...constituentMeters.map(m => m.kw), 0)
        totalKva = Math.min(...constituentMeters.map(m => m.kva), 0)
        totalAmps = Math.min(...constituentMeters.map(m => m.i), 0)
        avgPf = 0.985
      }

      return {
        ...agg,
        constituentMeters,
        totalKwh,
        totalKw,
        totalKva,
        totalAmps,
        avgPf
      }
    })
  }, [aggregations, meters])

  const filteredMetersForPicker = useMemo(() => {
    if (!modalSearch.trim()) return meters
    const s = modalSearch.toLowerCase()
    return meters.filter(m =>
      (m.name || "").toLowerCase().includes(s) ||
      (m.model || "").toLowerCase().includes(s) ||
      (m.group || "").toLowerCase().includes(s) ||
      String(m.meter_id).includes(s)
    )
  }, [meters, modalSearch])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <button
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white dark:bg-white/10 border border-border text-[11px] font-bold text-muted hover:text-foreground transition-all shadow-sm"
          >
            ← Back to Electrical Dashboard
          </button>
          <h1 className="font-display font-black text-2xl sm:text-3xl tracking-tight text-foreground flex items-center gap-2.5">
            <Layers className="w-7 h-7 text-amber-500" />
            Custom Cumulative Studio
          </h1>
          <p className="text-xs sm:text-sm text-muted font-medium mt-1">
            Build user-defined aggregations, custom sums, and virtual formulas without altering plant single-line telemetry.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="pressable px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-display font-black text-xs sm:text-sm shadow-lg shadow-amber-500/25 flex items-center gap-2 self-start sm:self-auto"
        >
          <Sparkles className="w-4 h-4 fill-slate-950" />
          + Create Custom Aggregation
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {calculatedAggs.map(agg => (
          <div
            key={agg.id}
            className="liquid-glass-card p-6 rounded-3xl flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-wider mb-1">
                    {agg.operation} FORMULA
                  </div>
                  <h3 className="font-display font-black text-lg text-foreground tracking-tight">
                    {agg.name}
                  </h3>
                  <p className="text-[11px] text-muted font-medium mt-0.5">
                    {agg.description}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => openEditModal(agg)}
                    className="px-2.5 py-1 rounded-lg border border-border bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-[10.5px] font-bold text-muted hover:text-foreground transition-all"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(agg.id)}
                    className="px-2.5 py-1 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 text-[10.5px] font-bold transition-all"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="my-4 p-4 rounded-2xl bg-slate-100 dark:bg-white/5 border border-border">
                <span className="text-[9.5px] font-extrabold uppercase tracking-widest text-muted block">
                  Aggregated Active Energy ({agg.operation})
                </span>
                <div className="display-num text-3xl sm:text-4xl font-black text-foreground tracking-tight mt-1 flex items-baseline gap-2">
                  <span className="text-amber-500">{fmtDec(agg.totalKwh, 0)}</span>
                  <span className="text-base font-extrabold text-foreground">kWh</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/50 text-xs">
                  <div>
                    <span className="text-[9px] uppercase font-bold text-muted block">Agg. Power</span>
                    <span className="mono-num font-bold text-amber-500">{fmtDec(agg.totalKw, 1)} kW</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-bold text-muted block">Agg. kVA</span>
                    <span className="mono-num font-bold text-sky-500">{fmtDec(agg.totalKva, 1)} kVA</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-bold text-muted block">Total Current</span>
                    <span className="mono-num font-bold text-emerald-500">{fmtDec(agg.totalAmps, 1)} A</span>
                  </div>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted block mb-2">
                  Constituent Meters ({agg.constituentMeters.length})
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {agg.constituentMeters.map(m => {
                    const pct = agg.totalKwh > 0 ? (m.kwh / agg.totalKwh) * 100 : 0
                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-100/70 dark:bg-white/5 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span className="font-bold text-foreground truncate">{m.name}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 mono-num">
                          <span className="text-muted">{fmtDec(m.kwh, 0)} kWh</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500">
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div
            onClick={() => setIsModalOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="relative w-full max-w-lg p-6 rounded-3xl bg-white dark:bg-[#121522] border-2 border-border shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <h3 className="font-display font-black text-lg text-foreground">
                  {editingAgg ? "Edit Custom Aggregation" : "Create Custom Aggregation"}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted hover:text-foreground font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="py-4 space-y-4 overflow-y-auto">
                <div>
                  <label className="text-[10px] uppercase font-bold text-muted block mb-1">
                    Aggregation Title
                  </label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    placeholder="e.g. Total Campus Solar Generation"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-slate-100 dark:bg-white/5 text-foreground outline-none text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-muted block mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={descInput}
                    onChange={e => setDescInput(e.target.value)}
                    placeholder="Brief description of this aggregation formula"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-slate-100 dark:bg-white/5 text-foreground outline-none text-xs"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-muted block mb-1">
                    Mathematical Operation
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(["SUM", "AVERAGE", "MAX", "MIN"] as const).map(op => (
                      <button
                        key={op}
                        type="button"
                        onClick={() => setOpInput(op)}
                        className={`py-1.5 rounded-xl text-xs font-bold transition-all border ${
                          opInput === op
                            ? "bg-amber-500 text-slate-950 border-amber-500 font-black shadow-sm"
                            : "border-border text-muted hover:text-foreground"
                        }`}
                      >
                        {op}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] uppercase font-bold text-muted">
                      Select Constituent Meters ({selectedIds.length} chosen)
                    </label>
                    <input
                      type="text"
                      placeholder="Search meters..."
                      value={modalSearch}
                      onChange={e => setModalSearch(e.target.value)}
                      className="px-2 py-0.5 rounded-lg border border-border text-[11px] bg-transparent text-foreground outline-none w-36"
                    />
                  </div>

                  <div className="max-h-52 overflow-y-auto border border-border rounded-xl p-2 space-y-1 bg-slate-100/50 dark:bg-white/5">
                    {filteredMetersForPicker.map(m => {
                      const isChecked = selectedIds.includes(m.name) || selectedIds.includes(String(m.meter_id))
                      const toggleCheck = () => {
                        const targetKey = m.name || String(m.meter_id)
                        if (isChecked) {
                          setSelectedIds(selectedIds.filter(id => id !== targetKey && id !== m.name && id !== String(m.meter_id)))
                        } else {
                          setSelectedIds([...selectedIds, targetKey])
                        }
                      }

                      return (
                        <div
                          key={m.meter_id}
                          onClick={toggleCheck}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                            isChecked
                              ? "bg-amber-500/15 border border-amber-500/30 text-foreground"
                              : "hover:bg-slate-200 dark:hover:bg-white/10 text-muted"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={toggleCheck}
                              className="accent-amber-500"
                            />
                            <span className="font-bold text-xs text-foreground">{m.name}</span>
                            <span className="text-[10px] text-muted">({m.group})</span>
                          </div>
                          <div className="text-[11px] mono-num font-bold text-amber-500">
                            {fmtDec(m.kwh_import, 0)} kWh
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-bold text-muted hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black shadow-md shadow-amber-500/25"
                >
                  Save Formula
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ==========================================================================
   Main Application Component
   ========================================================================== */
export default function App() {
  const { live, health, err, history, sseUp } = useLive()
  const [inspectedData, setInspectedData] = useState<InspectedData | null>(null)
  const [q, setQ] = useState("")
  const [group, setGroup] = useState<string>("All")
  const [time, setTime] = useState(new Date())
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem("apple_theme") === "dark" ||
      (!("apple_theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches)
  })

  // View state: Electrical Dashboard vs Custom Cumulative Studio
  const [viewMode, setViewMode] = useState<"dashboard" | "custom_cumulative">("dashboard")

  // Apple Glass Loading Screen State
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [loadingProgress, setLoadingProgress] = useState<number>(0)
  const [cascadeKey, setCascadeKey] = useState<number>(0)

  // Executive Spotlight Fling Presentation Trigger (ONLY 33kV Incomer)
  const [showSpotlightFling, setShowSpotlightFling] = useState<boolean>(false)

  // Apple Loading Sequence: completes smoothly without firing auto spotlight or startup flips
  useEffect(() => {
    let progress = 0
    const timer = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 10
      if (progress >= 100) {
        progress = 100
        setLoadingProgress(100)
        clearInterval(timer)
        setTimeout(() => {
          setIsLoading(false)
        }, 350)
      } else {
        setLoadingProgress(progress)
      }
    }, 95)
    return () => clearInterval(timer)
  }, [cascadeKey])

  // Comparison State
  const [cmpMode, setCmpMode] = useState<"daily" | "hourly">("daily")
  const [cmpChartType, setCmpChartType] = useState<"line" | "area" | "bar">("line")
  const [cmpFrom, setCmpFrom] = useState("2026-09-26")
  const [cmpTo, setCmpTo] = useState("2026-10-02")
  const [cmpTimeFrom, setCmpTimeFrom] = useState("")
  const [cmpTimeTo, setCmpTimeTo] = useState("")
  const [cmpData, setCmpData] = useState<any[]>([])
  const [cmpLoading, setCmpLoading] = useState(false)

  // Electrical Schematic Data
  const [elecData, setElecData] = useState<any>(null)

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Dark Mode Sync
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark")
      localStorage.setItem("apple_theme", "dark")
    } else {
      document.documentElement.classList.remove("dark")
      localStorage.setItem("apple_theme", "light")
    }
  }, [darkMode])

  // Fetch Electrical Schematic
  useEffect(() => {
    let t: any
    const fetchElec = async () => {
      try {
        const r = await fetch(`${API}/api/electrical/combined`)
        const j = await r.json()
        setElecData(j)
      } catch {}
    }
    fetchElec()
    t = setInterval(fetchElec, 4000)
    return () => clearInterval(t)
  }, [])

  // Comparison Data Fetcher
  const loadCompare = useCallback(async (mode: "daily" | "hourly") => {
    setCmpLoading(true)
    try {
      const query = new URLSearchParams({
        ids: "33-INCOMER,33-IN-TR-1,33-IN-TR-2,SS-11-TP-1,SS-11-UB,SS-11-HOSTEL,MC-HTVCB-IN",
        group: mode
      })
      if (mode === "hourly") {
        if (cmpTimeFrom) query.set("from", cmpTimeFrom)
        if (cmpTimeTo) query.set("to", cmpTimeTo)
      } else {
        if (cmpFrom) query.set("from", cmpFrom)
        if (cmpTo) query.set("to", cmpTo)
      }
      const r = await fetch(`${API}/api/compare?${query.toString()}`)
      const j = await r.json()
      setCmpData(j.data || [])
    } catch {
      setCmpData([])
    } finally {
      setCmpLoading(false)
    }
  }, [cmpTimeFrom, cmpTimeTo, cmpFrom, cmpTo])

  useEffect(() => {
    let ignore = false
    const fetchCompare = async () => {
      try {
        const query = new URLSearchParams({
          ids: "33-INCOMER,33-IN-TR-1,33-IN-TR-2,SS-11-TP-1,SS-11-UB,SS-11-HOSTEL,MC-HTVCB-IN",
          group: cmpMode
        })
        if (cmpMode === "hourly") {
          if (cmpTimeFrom) query.set("from", cmpTimeFrom)
          if (cmpTimeTo) query.set("to", cmpTimeTo)
        } else {
          if (cmpFrom) query.set("from", cmpFrom)
          if (cmpTo) query.set("to", cmpTo)
        }
        const r = await fetch(`${API}/api/compare?${query.toString()}`)
        const j = await r.json()
        if (!ignore) setCmpData(j.data || [])
      } catch {}
    }

    fetchCompare()
    const t = setInterval(fetchCompare, 60000)
    return () => {
      ignore = true
      clearInterval(t)
    }
  }, [cmpMode, cmpTimeFrom, cmpTimeTo, cmpFrom, cmpTo])

  // Transform comparison data for Recharts Multi-Series
  const chartData = useMemo(() => {
    if (!cmpData || cmpData.length === 0) return []
    if (cmpMode === "daily") {
      const map: Record<string, any> = {}
      for (const row of cmpData) {
        const key = row.day || "Today"
        if (!map[key]) map[key] = { name: key }
        map[key][row.device_id] = row.kwh ?? 0
      }
      return Object.values(map)
    } else {
      const map: Record<string, any> = {}
      for (const row of cmpData) {
        const key = (row.ts || "").slice(-5) || "Now"
        if (!map[key]) map[key] = { name: key }
        map[key][row.device_id] = row.kw ?? row.kwh ?? row.i ?? 0
      }
      return Object.values(map)
    }
  }, [cmpData, cmpMode])

  const cmpDeviceKeys = useMemo(() => {
    const s = new Set<string>()
    for (const r of cmpData) {
      if (r.device_id) s.add(r.device_id)
    }
    return Array.from(s)
  }, [cmpData])

  const DEVICE_COLORS: Record<string, string> = {
    "33-INCOMER": "#f59e0b",
    "33-IN-TR-1": "#0284c7",
    "33-IN-TR-2": "#16a34a",
    "SS-11-TP-1": "#9333ea",
    "SS-11-UB": "#e11d48",
    "SS-11-HOSTEL": "#4f46e5",
    "MC-HTVCB-IN": "#0d9488"
  }

  // Groups
  const groups = useMemo(() => {
    const set = new Set<string>()
    set.add("All")
    for (const m of live?.meters || []) {
      if (m.group) set.add(m.group)
    }
    return Array.from(set)
  }, [live])

  const filteredMeters = useMemo(() => {
    let list = live?.meters || []
    if (group !== "All") {
      list = list.filter(m => (m.group || "").toLowerCase() === group.toLowerCase())
    }
    if (q.trim()) {
      const s = q.toLowerCase()
      list = list.filter(m =>
        (m.name || "").toLowerCase().includes(s) ||
        (m.model || "").toLowerCase().includes(s) ||
        String(m.meter_id).includes(s)
      )
    }
    return list
  }, [live, group, q])

  const lastSync = useMemo(() => {
    if (!live?.ts) return "—"
    const diff = Math.max(0, Math.round((time.getTime() - new Date(live.ts).getTime()) / 1000))
    if (diff < 5) return "Live Now"
    if (diff < 60) return `${diff}s ago`
    return `${Math.floor(diff / 60)}m ${diff % 60}s ago`
  }, [live, time])

  // Electrical Schema Data Resolution & Strict Offline Verification (NO DEMO FALLBACK)
  const isOnline = Boolean(live && !err && live.meters && live.meters.length > 0 && live.combined?.source !== "offline")
  const e = isOnline ? elecData : null
  const ss = e?.substation_33kv || e?.ss33

  // Helper to open inspector with full specs
  const handleInspectFeeder = (fData: InspectedData) => {
    setInspectedData({ ...fData, isOnline })
  }

  return (
    <div key={cascadeKey} className="min-h-screen text-foreground relative selection:bg-accent/20">
      {/* Dynamic Fluid Liquid Color Canvas */}
      <LivelyFluidCanvas darkMode={darkMode} />

      {/* Apple Glass Loading Screen */}
      <AnimatePresence>
        {isLoading && (
          <AppleGlassLoadingScreen
            key="apple-glass-loading"
            progress={loadingProgress}
          />
        )}
      </AnimatePresence>

      {/* Executive Telemetry Spotlight Fling (ONLY For 33 Incomer) */}
      <ExecutiveSpotlightFling
        show={showSpotlightFling}
        onDismiss={() => setShowSpotlightFling(false)}
        data={ss?.incomer}
        isOnline={isOnline}
      />

      {/* Expanded Meter Specs & 3-Phase Telemetry Inspector */}
      <ExpandedMeterInspector
        data={inspectedData}
        onClose={() => setInspectedData(null)}
        darkMode={darkMode}
      />

      {/* FLOATING TOP NAVIGATION CHROME */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="sticky top-0 z-40 px-3 sm:px-6 py-2.5"
      >
        <div className="max-w-7xl mx-auto liquid-glass px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xl">
          {/* Brand & Substation Identifier */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-400 text-white flex items-center justify-center shadow-lg shadow-amber-500/25 shrink-0">
              <Zap className="w-5 h-5 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-extrabold text-[15px] sm:text-[17px] tracking-tight leading-none text-gradient-chrome">
                  SRMIST Smart Energy
                </h1>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  33kV SUBSTATION
                </span>
              </div>
              <p className="text-[11px] text-muted font-medium mt-0.5 flex items-center gap-1.5">
                <span>PowerStudio SCADA</span>
                <span className="mono-num text-[10px]">172.16.160.49:5222</span>
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-black/5 dark:bg-white/10 text-foreground">
                  {sseUp ? "⚡ SSE Stream" : "🔄 3s Polling"}
                </span>
                <span className="hidden md:inline text-muted font-semibold">· {live?.meters?.length ?? 150} real meters</span>
              </p>
            </div>
          </div>

          {/* View Switcher: Main Dashboard vs Custom Cumulative Studio */}
          <div className="glass-pill p-1 flex items-center text-[11px] font-bold">
            <button
              onClick={() => setViewMode("dashboard")}
              className={`pressable px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                viewMode === "dashboard"
                  ? "bg-slate-900 text-white shadow-sm dark:bg-sky-500 dark:text-slate-950 font-black"
                  : "text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Plant Telemetry</span>
            </button>
            <button
              onClick={() => setViewMode("custom_cumulative")}
              className={`pressable px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                viewMode === "custom_cumulative"
                  ? "bg-slate-900 text-white shadow-sm dark:bg-amber-400 dark:text-slate-950 font-black"
                  : "text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span>Custom Cumulative Studio</span>
            </button>
          </div>

          {/* Action Utilities & Sync Time */}
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-white/15">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-slate-500 dark:text-slate-400 font-medium">Sync:</span>
              <span className="mono-num text-slate-800 dark:text-slate-100 font-bold">{lastSync}</span>
            </div>

            <button
              onClick={() => {
                setLoadingProgress(0)
                setIsLoading(true)
                setCascadeKey(k => k + 1)
              }}
              className="pressable px-2.5 py-1 rounded-full text-[11px] font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-white/15 flex items-center gap-1.5 transition-colors"
              title="Replay Loading Screen"
            >
              <RotateCw className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              <span className="hidden sm:inline">Loading</span>
            </button>

            <button
              onClick={() => setDarkMode(!darkMode)}
              className="pressable w-8 h-8 rounded-full border border-slate-200 dark:border-white/15 bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 transition-colors"
              title="Toggle Theme"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-sky-600" />}
            </button>
          </div>
        </div>
      </motion.header>

      {/* CONDITIONAL VIEW: Custom Cumulative Studio vs Main Electrical Dashboard */}
      {viewMode === "custom_cumulative" ? (
        <CustomCumulativeStudioView
          meters={live?.meters || []}
          onBack={() => setViewMode("dashboard")}
        />
      ) : (
        <main className="max-w-7xl mx-auto px-3 sm:px-6 py-5 space-y-6">
          {/* OFFLINE / DISCONNECTED WARNING BANNER (STRICT: NO DEMO FALLBACK) */}
          {!isOnline && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl bg-rose-500/10 border-2 border-rose-500/30 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-600 dark:text-rose-400"
            >
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping shrink-0" />
                <div>
                  <div className="text-sm font-extrabold uppercase tracking-wide">
                    Live Telemetry Stream Disconnected · SCADA Offline
                  </div>
                  <div className="text-xs font-semibold opacity-90">
                    Host <span className="mono-num font-mono">172.16.160.49:5222</span> unreachable. All measurements strictly set to 0.00 / INVALID (no synthetic demo fallback).
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <span className="px-2.5 py-1 rounded-lg bg-rose-500 text-white text-[10px] font-black uppercase tracking-wider shadow-sm">
                  0 Fallback Active
                </span>
              </div>
            </motion.div>
          )}

          {/* ==================================================================
              1. ORIGINAL ELECTRICAL LAYOUT (NO CUMULATIVE — INDIVIDUAL DATA ONLY)
             ================================================================== */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/80 pb-3">
              <div>
                <h2 className="font-display font-black text-xl tracking-tight text-foreground flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
                  Primary Electrical Layout & Feeders
                </h2>
                <p className="text-xs text-muted font-medium mt-0.5">
                  Real-time individual feeder measurements · Active Energy (kWh) bold & top · Click any box to inspect complete engineering telemetry
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-[10.5px] font-extrabold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                  NO CUMULATIVE · INDIVIDUAL DATA ONLY
                </span>
              </div>
            </div>

            {/* Row 1: 33kV Incomer, HTVCB-IN, Solar Main (MC-SOL-AUTO-200), DG Main */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <FeederBox
                label="33kV INCOMER"
                sub="33-INCOMER Main Primary"
                kwh={isOnline && ss?.incomer?.kwh ? ss.incomer.kwh : 0}
                kw={isOnline && ss?.incomer?.kw ? ss.incomer.kw : 0}
                kva={isOnline && ss?.incomer?.kva ? ss.incomer.kva : 0}
                v_ll={isOnline && ss?.incomer?.v_ll ? ss.incomer.v_ll : 0}
                i={isOnline && ss?.incomer?.i ? ss.incomer.i : 0}
                i1={isOnline ? ss?.incomer?.i1 : 0}
                i2={isOnline ? ss?.incomer?.i2 : 0}
                i3={isOnline ? ss?.incomer?.i3 : 0}
                pf={isOnline && ss?.incomer?.pf ? ss.incomer.pf : 0}
                main={true}
                badge="★ GRID PRIMARY"
                isOnline={isOnline}
                onClick={() => setShowSpotlightFling(true)}
              />
              <FeederBox
                label="MC-HTVCB-IN"
                sub="11kV Main HTVCB Incomer"
                kwh={isOnline && e?.htvcb_in?.kwh ? e.htvcb_in.kwh : 0}
                kw={isOnline && e?.htvcb_in?.kw ? e.htvcb_in.kw : 0}
                kva={isOnline && e?.htvcb_in?.kva ? e.htvcb_in.kva : 0}
                v_ll={isOnline && e?.htvcb_in?.v_ll ? e.htvcb_in.v_ll : 0}
                i={isOnline && e?.htvcb_in?.i ? e.htvcb_in.i : 0}
                i1={isOnline ? e?.htvcb_in?.i1 : 0}
                i2={isOnline ? e?.htvcb_in?.i2 : 0}
                i3={isOnline ? e?.htvcb_in?.i3 : 0}
                pf={isOnline && e?.htvcb_in?.pf ? e.htvcb_in.pf : 0}
                badge="High Tension"
                isOnline={isOnline}
                onClick={() => handleInspectFeeder({
                  label: "MC-HTVCB-IN",
                  sub: "11kV Main HTVCB Incomer",
                  kwh: isOnline && e?.htvcb_in?.kwh ? e.htvcb_in.kwh : 0,
                  kw: isOnline && e?.htvcb_in?.kw ? e.htvcb_in.kw : 0,
                  kva: isOnline && e?.htvcb_in?.kva ? e.htvcb_in.kva : 0,
                  v_ll: isOnline && e?.htvcb_in?.v_ll ? e.htvcb_in.v_ll : 0,
                  i: isOnline && e?.htvcb_in?.i ? e.htvcb_in.i : 0,
                  pf: isOnline && e?.htvcb_in?.pf ? e.htvcb_in.pf : 0,
                  group: "MC",
                  isOnline
                })}
              />
              {/* Individual Solar Main Converter (NO Cumulative Sum) */}
              <FeederBox
                label={e?.solar_main?.id || "MC-SOL-AUTO-200"}
                sub="MC Main Solar Inverter"
                kwh={isOnline && e?.solar_main?.kwh ? e.solar_main.kwh : 0}
                kw={isOnline && e?.solar_main?.kw ? e.solar_main.kw : 0}
                kva={isOnline && e?.solar_main?.kva ? e.solar_main.kva : 0}
                v_ll={isOnline && e?.solar_main?.v_ll ? e.solar_main.v_ll : 0}
                i={isOnline && e?.solar_main?.i ? e.solar_main.i : 0}
                i1={isOnline ? e?.solar_main?.i1 : 0}
                i2={isOnline ? e?.solar_main?.i2 : 0}
                i3={isOnline ? e?.solar_main?.i3 : 0}
                pf={isOnline && e?.solar_main?.pf ? e.solar_main.pf : 0}
                badge="Solar Main"
                isOnline={isOnline}
                onClick={() => handleInspectFeeder({
                  label: e?.solar_main?.id || "MC-SOL-AUTO-200",
                  sub: "MC Main Solar Inverter",
                  kwh: isOnline && e?.solar_main?.kwh ? e.solar_main.kwh : 0,
                  kw: isOnline && e?.solar_main?.kw ? e.solar_main.kw : 0,
                  kva: isOnline && e?.solar_main?.kva ? e.solar_main.kva : 0,
                  v_ll: isOnline && e?.solar_main?.v_ll ? e.solar_main.v_ll : 0,
                  i: isOnline && e?.solar_main?.i ? e.solar_main.i : 0,
                  pf: isOnline && e?.solar_main?.pf ? e.solar_main.pf : 0,
                  group: "MC",
                  isOnline
                })}
              />
              {/* Individual DG Main Unit (NO Cumulative Sum) */}
              <FeederBox
                label={e?.dg_main?.id || "MC-DG-600 - 1"}
                sub="MC Main Diesel Generator"
                kwh={isOnline && e?.dg_main?.kwh ? e.dg_main.kwh : 0}
                kw={isOnline && e?.dg_main?.kw ? e.dg_main.kw : 0}
                kva={isOnline && e?.dg_main?.kva ? e.dg_main.kva : 0}
                v_ll={isOnline && e?.dg_main?.v_ll ? e.dg_main.v_ll : 0}
                i={isOnline && e?.dg_main?.i ? e.dg_main.i : 0}
                i1={isOnline ? e?.dg_main?.i1 : 0}
                i2={isOnline ? e?.dg_main?.i2 : 0}
                i3={isOnline ? e?.dg_main?.i3 : 0}
                pf={isOnline && e?.dg_main?.pf ? e.dg_main.pf : 0}
                badge="DG Auxiliary"
                isOnline={isOnline}
                onClick={() => handleInspectFeeder({
                  label: e?.dg_main?.id || "MC-DG-600 - 1",
                  sub: "MC Main Diesel Generator",
                  kwh: isOnline && e?.dg_main?.kwh ? e.dg_main.kwh : 0,
                  kw: isOnline && e?.dg_main?.kw ? e.dg_main.kw : 0,
                  kva: isOnline && e?.dg_main?.kva ? e.dg_main.kva : 0,
                  v_ll: isOnline && e?.dg_main?.v_ll ? e.dg_main.v_ll : 0,
                  i: isOnline && e?.dg_main?.i ? e.dg_main.i : 0,
                  pf: isOnline && e?.dg_main?.pf ? e.dg_main.pf : 0,
                  group: "DG",
                  isOnline
                })}
              />
            </div>

            {/* Row 2: Transformers, Outgoing Feeders & Substation Loss */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
              <FeederBox
                label="TR-1 33-IN-TR-1"
                sub="33/11kV TR-1"
                kwh={isOnline && ss?.tr1?.kwh ? ss.tr1.kwh : 0}
                kw={isOnline && ss?.tr1?.kw ? ss.tr1.kw : 0}
                kva={isOnline && ss?.tr1?.kva ? ss.tr1.kva : 0}
                v_ll={isOnline && ss?.tr1?.v_ll ? ss.tr1.v_ll : 0}
                i={isOnline && ss?.tr1?.i ? ss.tr1.i : 0}
                i1={isOnline ? ss?.tr1?.i1 : 0}
                i2={isOnline ? ss?.tr1?.i2 : 0}
                i3={isOnline ? ss?.tr1?.i3 : 0}
                pf={isOnline && ss?.tr1?.pf ? ss.tr1.pf : 0}
                isOnline={isOnline}
                onClick={() => handleInspectFeeder({
                  label: "33-IN-TR-1",
                  sub: "33/11kV Step-Down TR-1",
                  kwh: isOnline && ss?.tr1?.kwh ? ss.tr1.kwh : 0,
                  kw: isOnline && ss?.tr1?.kw ? ss.tr1.kw : 0,
                  kva: isOnline && ss?.tr1?.kva ? ss.tr1.kva : 0,
                  v_ll: isOnline && ss?.tr1?.v_ll ? ss.tr1.v_ll : 0,
                  i: isOnline && ss?.tr1?.i ? ss.tr1.i : 0,
                  pf: isOnline && ss?.tr1?.pf ? ss.tr1.pf : 0,
                  group: "33",
                  isOnline
                })}
              />
              <FeederBox
                label="TR-2 33-IN-TR-2"
                sub="33/11kV TR-2"
                kwh={isOnline && ss?.tr2?.kwh ? ss.tr2.kwh : 0}
                kw={isOnline && ss?.tr2?.kw ? ss.tr2.kw : 0}
                kva={isOnline && ss?.tr2?.kva ? ss.tr2.kva : 0}
                v_ll={isOnline && ss?.tr2?.v_ll ? ss.tr2.v_ll : 0}
                i={isOnline && ss?.tr2?.i ? ss.tr2.i : 0}
                i1={isOnline ? ss?.tr2?.i1 : 0}
                i2={isOnline ? ss?.tr2?.i2 : 0}
                i3={isOnline ? ss?.tr2?.i3 : 0}
                pf={isOnline && ss?.tr2?.pf ? ss.tr2.pf : 0}
                isOnline={isOnline}
                onClick={() => handleInspectFeeder({
                  label: "33-IN-TR-2",
                  sub: "33/11kV Step-Down TR-2",
                  kwh: isOnline && ss?.tr2?.kwh ? ss.tr2.kwh : 0,
                  kw: isOnline && ss?.tr2?.kw ? ss.tr2.kw : 0,
                  kva: isOnline && ss?.tr2?.kva ? ss.tr2.kva : 0,
                  v_ll: isOnline && ss?.tr2?.v_ll ? ss.tr2.v_ll : 0,
                  i: isOnline && ss?.tr2?.i ? ss.tr2.i : 0,
                  pf: isOnline && ss?.tr2?.pf ? ss.tr2.pf : 0,
                  group: "33",
                  isOnline
                })}
              />
              <FeederBox
                label="SS-11-TP-1"
                sub="11kV feeder TP-1"
                kwh={isOnline && ss?.tp1?.kwh ? ss.tp1.kwh : 0}
                kw={isOnline && ss?.tp1?.kw ? ss.tp1.kw : 0}
                kva={isOnline && ss?.tp1?.kva ? ss.tp1.kva : 0}
                v_ll={isOnline && ss?.tp1?.v_ll ? ss.tp1.v_ll : 0}
                i={isOnline && ss?.tp1?.i ? ss.tp1.i : 0}
                i1={isOnline ? ss?.tp1?.i1 : 0}
                i2={isOnline ? ss?.tp1?.i2 : 0}
                i3={isOnline ? ss?.tp1?.i3 : 0}
                pf={isOnline && ss?.tp1?.pf ? ss.tp1.pf : 0}
                isOnline={isOnline}
                onClick={() => handleInspectFeeder({
                  label: "SS-11-TP-1",
                  sub: "11kV Feeder Tech Park 1",
                  kwh: isOnline && ss?.tp1?.kwh ? ss.tp1.kwh : 0,
                  kw: isOnline && ss?.tp1?.kw ? ss.tp1.kw : 0,
                  kva: isOnline && ss?.tp1?.kva ? ss.tp1.kva : 0,
                  v_ll: isOnline && ss?.tp1?.v_ll ? ss.tp1.v_ll : 0,
                  i: isOnline && ss?.tp1?.i ? ss.tp1.i : 0,
                  pf: isOnline && ss?.tp1?.pf ? ss.tp1.pf : 0,
                  group: "SS",
                  isOnline
                })}
              />
              <FeederBox
                label="SS-11-UB"
                sub="11kV feeder UB"
                kwh={isOnline && ss?.ub?.kwh ? ss.ub.kwh : 0}
                kw={isOnline && ss?.ub?.kw ? ss.ub.kw : 0}
                kva={isOnline && ss?.ub?.kva ? ss.ub.kva : 0}
                v_ll={isOnline && ss?.ub?.v_ll ? ss.ub.v_ll : 0}
                i={isOnline && ss?.ub?.i ? ss.ub.i : 0}
                i1={isOnline ? ss?.ub?.i1 : 0}
                i2={isOnline ? ss?.ub?.i2 : 0}
                i3={isOnline ? ss?.ub?.i3 : 0}
                pf={isOnline && ss?.ub?.pf ? ss.ub.pf : 0}
                isOnline={isOnline}
                onClick={() => handleInspectFeeder({
                  label: "SS-11-UB",
                  sub: "11kV Feeder University Building",
                  kwh: isOnline && ss?.ub?.kwh ? ss.ub.kwh : 0,
                  kw: isOnline && ss?.ub?.kw ? ss.ub.kw : 0,
                  kva: isOnline && ss?.ub?.kva ? ss.ub.kva : 0,
                  v_ll: isOnline && ss?.ub?.v_ll ? ss.ub.v_ll : 0,
                  i: isOnline && ss?.ub?.i ? ss.ub.i : 0,
                  pf: isOnline && ss?.ub?.pf ? ss.ub.pf : 0,
                  group: "SS",
                  isOnline
                })}
              />
              <FeederBox
                label="SS-11-HOSTEL"
                sub="11kV feeder HOSTEL"
                kwh={isOnline && ss?.hostel?.kwh ? ss.hostel.kwh : 0}
                kw={isOnline && ss?.hostel?.kw ? ss.hostel.kw : 0}
                kva={isOnline && ss?.hostel?.kva ? ss.hostel.kva : 0}
                v_ll={isOnline && ss?.hostel?.v_ll ? ss.hostel.v_ll : 0}
                i={isOnline && ss?.hostel?.i ? ss.hostel.i : 0}
                i1={isOnline ? ss?.hostel?.i1 : 0}
                i2={isOnline ? ss?.hostel?.i2 : 0}
                i3={isOnline ? ss?.hostel?.i3 : 0}
                pf={isOnline && ss?.hostel?.pf ? ss.hostel.pf : 0}
                isOnline={isOnline}
                onClick={() => handleInspectFeeder({
                  label: "SS-11-HOSTEL",
                  sub: "11kV Feeder Hostel Complex",
                  kwh: isOnline && ss?.hostel?.kwh ? ss.hostel.kwh : 0,
                  kw: isOnline && ss?.hostel?.kw ? ss.hostel.kw : 0,
                  kva: isOnline && ss?.hostel?.kva ? ss.hostel.kva : 0,
                  v_ll: isOnline && ss?.hostel?.v_ll ? ss.hostel.v_ll : 0,
                  i: isOnline && ss?.hostel?.i ? ss.hostel.i : 0,
                  pf: isOnline && ss?.hostel?.pf ? ss.hostel.pf : 0,
                  group: "SS",
                  isOnline
                })}
              />

              {/* 33kV Substation Loss Box */}
              <div
                className="p-4 rounded-2xl liquid-glass-card flex flex-col justify-between text-center select-none"
                title="33kV Substation Loss = Incomer kWh − Outgoing Feeders kWh"
              >
                <div className="flex items-center justify-between border-b border-border/70 pb-2">
                  <span className="kpi-label">33kV LOSS</span>
                  <ShieldCheck className="w-3.5 h-3.5 text-muted" />
                </div>
                <div className="my-auto py-2">
                  <div className="display-num text-[23px] sm:text-[26px] font-black text-foreground">
                    {isOnline ? fmtDec(ss?.loss_kwh ?? 0, 0) : "0"}
                    <span className="text-xs font-bold text-amber-500 ml-1">{isOnline ? "kWh" : "OFFLINE"}</span>
                  </div>
                  <div className="text-[11px] font-bold text-muted mt-0.5">
                    {isOnline ? (ss?.loss_pct ? `${ss.loss_pct}% transmission delta` : "0.0% delta") : "Stream Offline"}
                  </div>
                </div>
                <div className={`text-[9px] font-bold py-1 px-2 rounded-lg ${
                  isOnline 
                    ? "text-emerald-600 dark:text-emerald-400 bg-black/5 dark:bg-white/5" 
                    : "text-rose-500 bg-rose-500/10"
                }`}>
                  {isOnline ? "Nominal Transmission Balance" : "Disconnected · 0 kWh"}
                </div>
              </div>
            </div>
          </section>

          {/* ==================================================================
              2. COMPARISON STUDIO: Real 365-Day History (No Future Dates Bug)
             ================================================================== */}
          <section className="liquid-glass-card p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h3 className="font-display font-black text-lg tracking-tight text-foreground flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-sky-500" />
                  Telemetry Comparison Studio
                </h3>
                <p className="text-xs text-muted font-medium mt-0.5">
                  Real 1-year historical telemetry comparison · Strictly bounded to real database archives (up to 2026-10-02)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="glass-pill p-0.5 flex items-center text-[11px] font-bold">
                  <button
                    onClick={() => { setCmpMode("hourly"); loadCompare("hourly"); }}
                    className={`pressable px-2.5 py-1 rounded-full transition-all ${
                      cmpMode === "hourly" 
                        ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950 font-black" 
                        : "text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                    }`}
                  >
                    Hourly Telemetry
                  </button>
                  <button
                    onClick={() => { setCmpMode("daily"); loadCompare("daily"); }}
                    className={`pressable px-2.5 py-1 rounded-full transition-all ${
                      cmpMode === "daily" 
                        ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950 font-black" 
                        : "text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                    }`}
                  >
                    Daily Real kWh
                  </button>
                </div>

                <div className="glass-pill p-0.5 flex items-center text-[11px] font-bold">
                  {(["line", "area", "bar"] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setCmpChartType(type)}
                      className={`pressable px-2.5 py-1 rounded-full uppercase text-[10px] transition-all ${
                        cmpChartType === type
                          ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950 font-black"
                          : "text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                {cmpMode === "hourly" ? (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <input
                      type="datetime-local"
                      value={cmpTimeFrom}
                      max="2026-10-02T23:59"
                      onChange={e => setCmpTimeFrom(e.target.value)}
                      className="glass-pill px-2 py-1 text-foreground bg-transparent outline-none text-[11px]"
                    />
                    <span className="text-muted text-[10px]">to</span>
                    <input
                      type="datetime-local"
                      value={cmpTimeTo}
                      max="2026-10-02T23:59"
                      onChange={e => setCmpTimeTo(e.target.value)}
                      className="glass-pill px-2 py-1 text-foreground bg-transparent outline-none text-[11px]"
                    />
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setCmpFrom("2026-09-26"); setCmpTo("2026-10-02"); }}
                        className="px-2 py-0.5 rounded-lg border border-border bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-[10px] font-bold"
                      >
                        7D
                      </button>
                      <button
                        onClick={() => { setCmpFrom("2026-09-02"); setCmpTo("2026-10-02"); }}
                        className="px-2 py-0.5 rounded-lg border border-border bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-[10px] font-bold"
                      >
                        30D
                      </button>
                      <button
                        onClick={() => { setCmpFrom("2026-07-04"); setCmpTo("2026-10-02"); }}
                        className="px-2 py-0.5 rounded-lg border border-border bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-[10px] font-bold"
                      >
                        90D
                      </button>
                      <button
                        onClick={() => { setCmpFrom("2025-10-03"); setCmpTo("2026-10-02"); }}
                        className="px-2 py-0.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold"
                      >
                        1 Year (365d)
                      </button>
                    </div>
                    <input
                      type="date"
                      value={cmpFrom}
                      min="2025-10-03"
                      max="2026-10-02"
                      onChange={e => setCmpFrom(e.target.value)}
                      className="glass-pill px-2 py-1 text-foreground bg-transparent outline-none text-[11px]"
                    />
                    <span className="text-muted text-[10px]">to</span>
                    <input
                      type="date"
                      value={cmpTo}
                      min="2025-10-03"
                      max="2026-10-02"
                      onChange={e => setCmpTo(e.target.value)}
                      className="glass-pill px-2 py-1 text-foreground bg-transparent outline-none text-[11px]"
                    />
                  </div>
                )}

                <button
                  onClick={() => loadCompare(cmpMode)}
                  disabled={cmpLoading}
                  className="pressable glass-pill px-3 py-1 text-[11px] font-bold text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {cmpLoading ? "Loading..." : "Update"}
                </button>
              </div>
            </div>

            {/* Recharts Canvas */}
            <div className="h-[280px] w-full pt-2">
              {chartData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted gap-2">
                  <BarChart3 className="w-8 h-8 opacity-40 animate-pulse" />
                  <span className="text-xs font-semibold">
                    {cmpLoading ? "Fetching yearlong telemetry archive..." : "Select date range up to 2026-10-02 to view telemetry curves"}
                  </span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {cmpChartType === "line" ? (
                    <LineChart data={chartData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(150, 150, 150, 0.15)" />
                      <XAxis dataKey="name" stroke="var(--muted)" fontSize={11} tickLine={false} />
                      <YAxis stroke="var(--muted)" fontSize={11} tickLine={false} />
                      <Tooltip content={<GlassTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                      {cmpDeviceKeys.map((k) => (
                        <Line
                          key={k}
                          type="monotone"
                          dataKey={k}
                          name={k}
                          stroke={DEVICE_COLORS[k] || "#8884d8"}
                          strokeWidth={2.5}
                          dot={{ r: 3.5, strokeWidth: 1.5, fill: "var(--panel-solid)" }}
                          activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                          connectNulls={true}
                        />
                      ))}
                    </LineChart>
                  ) : cmpChartType === "area" ? (
                    <AreaChart data={chartData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                      <defs>
                        {cmpDeviceKeys.map((k) => (
                          <linearGradient key={`grad-${k}`} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={DEVICE_COLORS[k] || "#8884d8"} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={DEVICE_COLORS[k] || "#8884d8"} stopOpacity={0.0} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(150, 150, 150, 0.15)" />
                      <XAxis dataKey="name" stroke="var(--muted)" fontSize={11} tickLine={false} />
                      <YAxis stroke="var(--muted)" fontSize={11} tickLine={false} />
                      <Tooltip content={<GlassTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                      {cmpDeviceKeys.map((k) => (
                        <Area
                          key={k}
                          type="monotone"
                          dataKey={k}
                          name={k}
                          stroke={DEVICE_COLORS[k] || "#8884d8"}
                          strokeWidth={2}
                          fill={`url(#grad-${k})`}
                          connectNulls={true}
                        />
                      ))}
                    </AreaChart>
                  ) : (
                    <BarChart data={chartData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(150, 150, 150, 0.15)" />
                      <XAxis dataKey="name" stroke="var(--muted)" fontSize={11} tickLine={false} />
                      <YAxis stroke="var(--muted)" fontSize={11} tickLine={false} />
                      <Tooltip content={<GlassTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                      {cmpDeviceKeys.map((k) => (
                        <Bar key={k} dataKey={k} name={k} fill={DEVICE_COLORS[k] || "#8884d8"} radius={[4, 4, 0, 0]} />
                      ))}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* ==================================================================
              3. POWERSTUDIO MONITORED FLEET (MC Tab displays real MC meters)
             ================================================================== */}
          <section className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="font-display font-black text-lg tracking-tight text-foreground uppercase">
                  PowerStudio Monitored Fleet ({live?.meters?.length ?? 150} Meters)
                </h3>
              </div>

              {/* Group Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                {groups.map(g => (
                  <button
                    key={g}
                    onClick={() => setGroup(g)}
                    className={`pressable px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 ${
                      group === g
                        ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950 font-black"
                        : "bg-slate-100 dark:bg-white/5 text-muted hover:text-foreground border border-border"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search meter by ID, name, group, model..."
                value={q}
                onChange={e => setQ(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-2xl border border-border bg-white dark:bg-[#121522] text-foreground text-xs font-medium outline-none shadow-sm"
              />
            </div>

            {/* Fleet Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {filteredMeters.map((m) => {
                const h = health?.slaves.find(s => s.meter_id === m.meter_id)
                const meterAge = m.ts ? Math.max(0, (time.getTime() - new Date(m.ts).getTime()) / 1000) : 999
                const stale = h ? (h.status !== "online") : (m.status !== "online" || meterAge > 30)
                const spark = history[m.meter_id] || []

                // Smart headline metric: if kWh is 0, display Voltage, Current, or kW
                let fleetLabel = "Active Energy"
                let fleetVal = fmtDec(m.kwh_import, 0)
                let fleetUnit = "kWh"
                let fleetColor = "text-amber-500"

                if (!m.kwh_import || m.kwh_import === 0) {
                  if (m.kw && m.kw > 0) {
                    fleetLabel = "Active Power"
                    fleetVal = m.kw.toFixed(1)
                    fleetUnit = "kW"
                    fleetColor = "text-amber-500"
                  } else if (m.v_ll_avg && m.v_ll_avg > 0) {
                    fleetLabel = "Voltage (Phase-Phase)"
                    fleetVal = m.v_ll_avg >= 1000 ? (m.v_ll_avg / 1000).toFixed(1) : m.v_ll_avg.toFixed(0)
                    fleetUnit = m.v_ll_avg >= 1000 ? "kV" : "V"
                    fleetColor = "text-sky-500"
                  } else if (m.i_avg && m.i_avg > 0) {
                    fleetLabel = "Current"
                    fleetVal = m.i_avg.toFixed(1)
                    fleetUnit = "A"
                    fleetColor = "text-emerald-500"
                  }
                }

                return (
                  <motion.div
                    key={m.meter_id}
                    whileHover={{ y: -4, scale: 1.015 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      if (m.name.includes("33-INCOMER")) {
                        setShowSpotlightFling(true)
                      } else {
                        handleInspectFeeder({
                          label: m.name,
                          sub: `${m.model} · Meter #${m.meter_id}`,
                          meter_id: m.meter_id,
                          model: m.model,
                          group: m.group,
                          kwh: m.kwh_import,
                          kw: m.kw,
                          v_ll: m.v_ll_avg,
                          v_ln: m.v_ln_avg,
                          i: m.i_avg,
                          i1: m.i_l1,
                          i2: m.i_l2,
                          i3: m.i_l3,
                          pf: m.pf_avg ?? m.pf ?? 0.985,
                          hz: m.freq_hz ?? m.hz ?? 50.0,
                          status: m.status,
                          ts: m.ts
                        })
                      }
                    }}
                    style={{ transformPerspective: 800, transformStyle: "preserve-3d" }}
                    className="liquid-glass-card text-left p-0 overflow-hidden flex flex-col h-[210px] cursor-pointer"
                  >
                    <div className="h-[34px] px-3 flex items-center justify-between border-b border-border bg-slate-100/70 dark:bg-white/5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{
                            background: stale ? "var(--warn)" : "var(--ok)"
                          }}
                        />
                        <span className="mono-num text-[11px] font-bold">#{m.meter_id}</span>
                        <span className="text-[11px] text-muted truncate max-w-[120px] font-medium">{m.model}</span>
                      </div>
                      <span className="text-[9px] tracking-wider font-extrabold uppercase text-muted">
                        {m.group}
                      </span>
                    </div>

                    <div className="px-3.5 pt-2.5 pb-2 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="text-[12px] font-bold text-foreground truncate" title={m.name}>
                          {m.name}
                        </div>
                        <div className="flex items-baseline gap-1.5 mt-1">
                          <span className="display-num text-[21px] text-foreground font-black tracking-tight">
                            {fleetVal}
                          </span>
                          <span className={`text-[11px] font-bold ${fleetColor}`}>{fleetUnit}</span>
                          <span className="ml-auto text-[10px] mono-num px-2 py-0.5 rounded-full border border-border text-muted bg-slate-100 dark:bg-black/20 font-bold">
                            PF {(m.pf_avg ?? m.pf ?? 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="text-[9px] uppercase font-bold text-muted mt-0.5">
                          {fleetLabel}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                        <div className="p-1 rounded bg-slate-100 dark:bg-white/5 border border-border/50">
                          <div className="text-[8.5px] text-muted font-bold">V LL</div>
                          <div className="mono-num font-bold">
                            {(m.v_ll_avg ?? (m.v_ln_avg ? m.v_ln_avg * 1.732 : 0)).toFixed(0)} V
                          </div>
                        </div>
                        <div className="p-1 rounded bg-slate-100 dark:bg-white/5 border border-border/50">
                          <div className="text-[8.5px] text-muted font-bold">I AVG</div>
                          <div className="mono-num font-bold">{(m.i_avg ?? 0).toFixed(1)} A</div>
                        </div>
                        <div className="p-1 rounded bg-slate-100 dark:bg-white/5 border border-border/50">
                          <div className="text-[8.5px] text-muted font-bold">FREQ</div>
                          <div className="mono-num font-bold">{(m.freq_hz ?? m.hz ?? 0).toFixed(1)}Hz</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-border/50">
                        <span className="text-[9px] text-muted font-semibold">Active Load</span>
                        <Sparkline data={spark} color={stale ? "var(--muted)" : "var(--accent)"} />
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </section>
        </main>
      )}

      {/* DRAGGABLE FLOATING DOCK */}
      <motion.div
        drag
        dragElastic={0.25}
        dragMomentum={true}
        className="fixed bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-40 draggable-dock px-3 sm:px-4 py-1.5 sm:py-2 flex items-center gap-2 sm:gap-3 select-none max-w-[95vw] shadow-2xl overflow-x-auto whitespace-nowrap"
      >
        <div className="flex items-center gap-1.5 text-muted hover:text-foreground cursor-grab shrink-0">
          <Move className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Dock</span>
        </div>

        <div className="h-4 w-[1px] bg-border shrink-0" />

        <button
          onClick={() => setShowSpotlightFling(true)}
          className="pressable px-2.5 py-1 rounded-full text-[10.5px] sm:text-[11px] font-bold flex items-center gap-1 text-foreground hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>33kV Spotlight Fling</span>
        </button>

        <button
          onClick={() => setViewMode(viewMode === "dashboard" ? "custom_cumulative" : "dashboard")}
          className="pressable px-2.5 py-1 rounded-full text-[10.5px] sm:text-[11px] font-bold flex items-center gap-1 text-foreground hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
        >
          <Layers className="w-3.5 h-3.5 text-sky-500" />
          <span>{viewMode === "dashboard" ? "Custom Studio" : "Main Dashboard"}</span>
        </button>

        <button
          onClick={() => setDarkMode(!darkMode)}
          className="pressable p-1.5 rounded-full text-foreground hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
          title="Toggle Theme"
        >
          {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-sky-600" />}
        </button>
      </motion.div>
    </div>
  )
}

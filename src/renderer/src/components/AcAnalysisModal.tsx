import React, { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import {
  X,
  Copy,
  Download,
  Check,
  Search,
  Activity,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RefreshCw,
  Table,
  TrendingUp,
  Columns,
} from "lucide-react"
import type { SimulationRunResult } from "../../../shared/simulation"
import { formatEngineering } from "../utils/engineeringFormat"
import { PALETTE_COLORS } from "./waveform/TraceConfigModal"

export interface AcAnalysisModalProps {
  isOpen: boolean
  onClose: () => void
  simulationResult: SimulationRunResult | null
  circuitTitle?: string
}

export interface AcSignalInfo {
  id: string
  name: string
  displayName: string
  category: "voltage" | "current"
  unit: string
  color: string
}

export interface AcTableRow {
  frequency: number
  signalName: string
  magDb: number
  magLinear: number
  phaseDeg: number
  real: number
  imag: number
  unit: string
}

export const AcAnalysisModal: React.FC<AcAnalysisModalProps> = ({
  isOpen,
  onClose,
  simulationResult,
  circuitTitle = "Circuit",
}) => {
  const { t } = useTranslation("common")
  const [activeTab, setActiveTab] = useState<"table" | "plot" | "split">("plot")
  const [formatMode, setFormatMode] = useState<"eng" | "sci" | "dec">("eng")
  const [copied, setCopied] = useState(false)
  const [tableSearch, setTableSearch] = useState("")
  const [tableSignalFilter, setTableSignalFilter] = useState<string>("all")
  const [isMaximized, setIsMaximized] = useState(false)

  // Pagination state for numerical table (avoids DOM overload)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)

  // Canvas ref for Bode plot & smooth cursor animation frame ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mouseMoveRafRef = useRef<number | null>(null)

  // Zoom & Pan state (frequency bounds)
  const [freqBounds, setFreqBounds] = useState<{ min: number; max: number } | null>(null)
  const [cursorX, setCursorX] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartX, setDragStartX] = useState<number | null>(null)

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  // Extract frequency array from simulationResult
  const frequencies = useMemo<number[]>(() => {
    if (!simulationResult || !simulationResult.data) return []
    const xName = simulationResult.xVariable || "frequency"
    return (
      simulationResult.data[xName] ||
      simulationResult.data["frequency"] ||
      simulationResult.data["Frequency"] ||
      []
    )
  }, [simulationResult])

  // Natural frequency range
  const naturalFreqRange = useMemo<{ min: number; max: number }>(() => {
    if (frequencies.length === 0) return { min: 1, max: 1e6 }
    let min = frequencies[0]
    let max = frequencies[frequencies.length - 1]
    if (min <= 0) min = 1
    if (max <= min) max = min * 10
    return { min, max }
  }, [frequencies])

  // Initialize or reset frequency bounds when simulation result changes
  useEffect(() => {
    if (frequencies.length > 0) {
      setFreqBounds(naturalFreqRange)
    }
  }, [frequencies, naturalFreqRange])

  // Extract base signals (voltages and currents)
  const availableSignals = useMemo<AcSignalInfo[]>(() => {
    if (!simulationResult || !simulationResult.data) return []

    const signals: AcSignalInfo[] = []
    const seenNames = new Set<string>()
    const xVar = (simulationResult.xVariable || "frequency").toLowerCase()

    let colorIdx = 0
    const rawVars = simulationResult.variables || []

    for (const v of rawVars) {
      const lower = v.name.toLowerCase()

      // Skip sweep variable, derivative vectors, and ground
      if (
        lower === xVar ||
        lower === "frequency" ||
        lower.endsWith("_db") ||
        lower.endsWith("_phase") ||
        lower.endsWith("_real") ||
        lower.endsWith("_imag") ||
        lower === "0" ||
        lower === "v(0)"
      ) {
        continue
      }

      // Check for voltage vs current
      const isCurrent =
        lower.startsWith("i(") ||
        lower.endsWith("#branch") ||
        (lower.startsWith("@") && lower.includes("[i"))

      let displayName = v.name.toUpperCase()
      if (lower.endsWith("#branch")) {
        displayName = `I(${lower.replace(/#branch$/, "").toUpperCase()})`
      } else if (lower.startsWith("@") && lower.includes("[")) {
        const match = lower.match(/^@([a-z0-9_]+)\[([a-z0-9_]+)\]$/)
        if (match) {
          displayName = `I(${match[1].toUpperCase()})`
        }
      }

      if (seenNames.has(displayName)) continue
      seenNames.add(displayName)

      signals.push({
        id: v.name,
        name: v.name,
        displayName,
        category: isCurrent ? "current" : "voltage",
        unit: isCurrent ? "A" : "V",
        color: PALETTE_COLORS[colorIdx % PALETTE_COLORS.length],
      })
      colorIdx++
    }

    return signals
  }, [simulationResult])

  // Selected signals state: default to all available voltage signals or all signals so all nodes are visible
  const [selectedSignalIds, setSelectedSignalIds] = useState<string[]>([])

  useEffect(() => {
    if (availableSignals.length > 0) {
      // Select all voltage signals so all circuit nodes are visible by default
      const voltages = availableSignals.filter((s) => s.category === "voltage").map((s) => s.id)
      if (voltages.length > 0) {
        setSelectedSignalIds(voltages)
      } else {
        setSelectedSignalIds(availableSignals.map((s) => s.id))
      }
    }
  }, [availableSignals])

  const toggleSignal = (id: string) => {
    setSelectedSignalIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    )
  }

  // Active selected signals
  const activeSigs = useMemo(
    () => availableSignals.filter((s) => selectedSignalIds.includes(s.id)),
    [availableSignals, selectedSignalIds],
  )

  // Active frequency bounds
  const currentBounds = freqBounds || naturalFreqRange

  // Helper for linear formatting
  const formatValue = useCallback(
    (val: number, unit: string) => {
      if (!isFinite(val)) return "0 " + unit
      if (formatMode === "sci") {
        return `${val.toExponential(4)} ${unit}`.trim()
      }
      if (formatMode === "dec") {
        return `${val.toFixed(6)} ${unit}`.trim()
      }
      return formatEngineering(val, unit, 4)
    },
    [formatMode],
  )

  // Construct table rows
  const tableRows = useMemo<AcTableRow[]>(() => {
    if (!simulationResult || !simulationResult.data || frequencies.length === 0) return []

    const rows: AcTableRow[] = []
    const targets =
      tableSignalFilter === "all"
        ? availableSignals
        : availableSignals.filter((s) => s.id === tableSignalFilter)

    for (let i = 0; i < frequencies.length; i++) {
      const freq = frequencies[i]
      for (const sig of targets) {
        const rawMag = simulationResult.data[sig.id]?.[i] ?? 0
        const magDb =
          simulationResult.data[`${sig.id}_db`]?.[i] ??
          20 * Math.log10(Math.max(rawMag, 1e-15))
        const phaseDeg = simulationResult.data[`${sig.id}_phase`]?.[i] ?? 0
        let real = simulationResult.data[`${sig.id}_real`]?.[i]
        let imag = simulationResult.data[`${sig.id}_imag`]?.[i]
        if (real === undefined || (real === 0 && imag === 0 && rawMag > 0)) {
          const rad = (phaseDeg * Math.PI) / 180
          real = rawMag * Math.cos(rad)
          imag = rawMag * Math.sin(rad)
        }

        rows.push({
          frequency: freq,
          signalName: sig.displayName,
          magDb,
          magLinear: rawMag,
          phaseDeg,
          real: real ?? 0,
          imag: imag ?? 0,
          unit: sig.unit,
        })
      }
    }

    return rows
  }, [simulationResult, frequencies, availableSignals, tableSignalFilter])

  // Filtered table rows
  const filteredTableRows = useMemo(() => {
    if (!tableSearch.trim()) return tableRows
    const q = tableSearch.toLowerCase().trim()
    return tableRows.filter(
      (r) =>
        r.signalName.toLowerCase().includes(q) ||
        r.frequency.toString().includes(q) ||
        formatEngineering(r.frequency, "Hz").toLowerCase().includes(q) ||
        r.magDb.toFixed(2).includes(q) ||
        r.phaseDeg.toFixed(1).includes(q),
    )
  }, [tableRows, tableSearch])

  // Reset page to 1 when filters or search change
  useEffect(() => {
    setCurrentPage(1)
  }, [tableSearch, tableSignalFilter, pageSize])

  const totalPages = Math.max(1, Math.ceil(filteredTableRows.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)

  // Paginated slice: renders max 50-100 rows in DOM to ensure instantaneous 60 FPS rendering
  const paginatedTableRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize
    return filteredTableRows.slice(start, start + pageSize)
  }, [filteredTableRows, safeCurrentPage, pageSize])

  // Copy table to clipboard
  const handleCopy = () => {
    if (filteredTableRows.length === 0) return

    const header = "Frequency (Hz)\tSignal\tMagnitude (dB)\tMagnitude (Linear)\tPhase (deg)\tReal\tImaginary"
    const rows = filteredTableRows.map((r) => {
      const fStr = formatEngineering(r.frequency, "Hz")
      const mDbStr = `${r.magDb.toFixed(3)} dB`
      const mLinStr = formatValue(r.magLinear, r.unit)
      const pStr = `${r.phaseDeg.toFixed(2)}°`
      const reStr = formatValue(r.real, r.unit)
      const imStr = formatValue(r.imag, r.unit)
      return `${fStr}\t${r.signalName}\t${mDbStr}\t${mLinStr}\t${pStr}\t${reStr}\t${imStr}`
    })

    const tsv = [header, ...rows].join("\n")
    navigator.clipboard.writeText(tsv).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Export CSV
  const handleExportCsv = () => {
    if (filteredTableRows.length === 0) return

    const escapeCsv = (str: string) => `"${String(str).replace(/"/g, '""')}"`
    const headers = [
      "Frequency_Hz",
      "Signal",
      "Magnitude_dB",
      "Magnitude_Linear",
      "Phase_deg",
      "Real",
      "Imaginary",
      "Unit",
    ]
      .map(escapeCsv)
      .join(",")

    const rows = filteredTableRows.map((r) =>
      [
        r.frequency,
        r.signalName,
        r.magDb.toFixed(4),
        r.magLinear.toExponential(6),
        r.phaseDeg.toFixed(4),
        r.real.toExponential(6),
        r.imag.toExponential(6),
        r.unit,
      ]
        .map((v) => escapeCsv(String(v)))
        .join(","),
    )

    const csvContent = [headers, ...rows].join("\r\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `ac_analysis_${circuitTitle.replace(/\s+/g, "_").toLowerCase()}_${Date.now()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Zoom handlers
  const handleZoom = (factor: number) => {
    if (!freqBounds) return
    const logMin = Math.log10(freqBounds.min)
    const logMax = Math.log10(freqBounds.max)
    const center = (logMin + logMax) / 2
    const halfSpan = ((logMax - logMin) / 2) * factor

    let newMin = Math.pow(10, center - halfSpan)
    let newMax = Math.pow(10, center + halfSpan)

    if (newMin < naturalFreqRange.min * 0.1) newMin = naturalFreqRange.min * 0.1
    if (newMax > naturalFreqRange.max * 10) newMax = naturalFreqRange.max * 10
    if (newMin >= newMax) return

    setFreqBounds({ min: newMin, max: newMax })
  }

  const handleResetZoom = () => {
    setFreqBounds(naturalFreqRange)
  }

  // Precalculate dynamic Y-axis bounds for Magnitude (dB) so cursor movements don't loop through all points
  const calculatedDbBounds = useMemo(() => {
    let minDb = -40
    let maxDb = 10

    if (activeSigs.length > 0 && simulationResult?.data) {
      let foundMin = Infinity
      let foundMax = -Infinity
      const minFreq = currentBounds.min
      const maxFreq = currentBounds.max
      for (const sig of activeSigs) {
        const dbArr = simulationResult.data[`${sig.id}_db`]
        if (!dbArr) continue
        for (let i = 0; i < frequencies.length; i++) {
          const f = frequencies[i]
          if (f >= minFreq && f <= maxFreq) {
            const val = dbArr[i]
            if (isFinite(val)) {
              if (val < foundMin) foundMin = val
              if (val > foundMax) foundMax = val
            }
          }
        }
      }
      if (foundMin < Infinity && foundMax > -Infinity) {
        const span = foundMax - foundMin || 20
        minDb = Math.floor((foundMin - span * 0.1) / 10) * 10
        maxDb = Math.ceil((foundMax + span * 0.1) / 10) * 10
        if (maxDb - minDb < 20) {
          maxDb = minDb + 20
        }
      }
    }
    return { minDb, maxDb }
  }, [activeSigs, simulationResult, currentBounds, frequencies])

  // Bode Plot Canvas Drawing Loop
  useEffect(() => {
    if (activeTab === "table") return
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const width = rect.width
    const height = rect.height

    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    // Layout configuration
    const marginLeft = 65
    const marginRight = 35
    const marginTop = 24
    const marginBottom = 30
    const gapBetweenPlots = 24

    const availableH = height - marginTop - marginBottom - gapBetweenPlots
    const paneH = availableH / 2
    const plotW = width - marginLeft - marginRight

    if (plotW <= 0 || paneH <= 0) return

    // Background
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, width, height)

    const minFreq = currentBounds.min
    const maxFreq = currentBounds.max
    const logMinF = Math.log10(minFreq)
    const logMaxF = Math.log10(maxFreq)
    const logSpanF = logMaxF - logMinF || 1

    const freqToX = (f: number) => {
      const logF = Math.log10(Math.max(f, 1e-15))
      return marginLeft + ((logF - logMinF) / logSpanF) * plotW
    }

    const xToFreq = (x: number) => {
      const frac = Math.max(0, Math.min(1, (x - marginLeft) / plotW))
      return Math.pow(10, logMinF + frac * logSpanF)
    }

    // 1. Dynamic Y-axis bounds for Magnitude (dB) from precalculated bounds
    const { minDb, maxDb } = calculatedDbBounds

    // 2. Fixed bounds for Phase (degrees)
    const minPhase = -180
    const maxPhase = 180

    // Coordinate conversion functions
    const magTop = marginTop
    const phaseTop = marginTop + paneH + gapBetweenPlots

    const magToY = (db: number) => {
      const frac = (db - minDb) / (maxDb - minDb || 1)
      return magTop + paneH - frac * paneH
    }

    const phaseToY = (deg: number) => {
      const frac = (deg - minPhase) / (maxPhase - minPhase || 1)
      return phaseTop + paneH - frac * paneH
    }

    // Draw Plot Areas
    ctx.strokeStyle = "#c0c0c0"
    ctx.lineWidth = 1

    // Pane 1: Magnitude Area
    ctx.fillStyle = "#fafafa"
    ctx.fillRect(marginLeft, magTop, plotW, paneH)
    ctx.strokeRect(marginLeft, magTop, plotW, paneH)

    // Pane 2: Phase Area
    ctx.fillRect(marginLeft, phaseTop, plotW, paneH)
    ctx.strokeRect(marginLeft, phaseTop, plotW, paneH)

    // --- Draw Frequency Grid Lines (Logarithmic) ---
    const startDecade = Math.floor(logMinF)
    const endDecade = Math.ceil(logMaxF)

    for (let dec = startDecade; dec <= endDecade; dec++) {
      for (let sub = 1; sub < 10; sub++) {
        const f = sub * Math.pow(10, dec)
        if (f < minFreq || f > maxFreq) continue

        const px = freqToX(f)
        const isDecade = sub === 1

        ctx.beginPath()
        ctx.strokeStyle = isDecade ? "#d0d0d0" : "#f0f0f0"
        ctx.lineWidth = isDecade ? 1 : 0.8
        if (!isDecade) {
          ctx.setLineDash([2, 2])
        } else {
          ctx.setLineDash([])
        }

        ctx.moveTo(px, magTop)
        ctx.lineTo(px, magTop + paneH)
        ctx.moveTo(px, phaseTop)
        ctx.lineTo(px, phaseTop + paneH)
        ctx.stroke()
        ctx.setLineDash([])

        if (isDecade) {
          ctx.fillStyle = "#333333"
          ctx.font = "10.5px 'Segoe UI', Tahoma, sans-serif"
          ctx.textAlign = "center"
          ctx.textBaseline = "top"
          ctx.fillText(formatEngineering(f, "Hz"), px, phaseTop + paneH + 5)
        }
      }
    }

    // --- Draw Magnitude Horizontal Grid Lines ---
    const dbStep = (maxDb - minDb) / 5 >= 20 ? 20 : 10
    const startDbGrid = Math.ceil(minDb / dbStep) * dbStep

    for (let db = startDbGrid; db <= maxDb; db += dbStep) {
      const py = magToY(db)
      const isZeroDb = Math.abs(db) < 1e-6

      ctx.beginPath()
      ctx.strokeStyle = isZeroDb ? "#888888" : "#e4e4e4"
      ctx.lineWidth = isZeroDb ? 1.2 : 0.8
      if (isZeroDb) {
        ctx.setLineDash([4, 2])
      } else {
        ctx.setLineDash([])
      }
      ctx.moveTo(marginLeft, py)
      ctx.lineTo(marginLeft + plotW, py)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.fillStyle = isZeroDb ? "#000000" : "#555555"
      ctx.font = isZeroDb ? "bold 10px 'Segoe UI', sans-serif" : "10px 'Segoe UI', sans-serif"
      ctx.textAlign = "right"
      ctx.textBaseline = "middle"
      ctx.fillText(`${db > 0 ? "+" : ""}${db} dB`, marginLeft - 8, py)
    }

    // --- Draw Phase Horizontal Grid Lines ---
    const phaseStep = 45
    for (let deg = minPhase; deg <= maxPhase; deg += phaseStep) {
      const py = phaseToY(deg)
      const isZeroDeg = deg === 0

      ctx.beginPath()
      ctx.strokeStyle = isZeroDeg ? "#888888" : "#e4e4e4"
      ctx.lineWidth = isZeroDeg ? 1.2 : 0.8
      if (isZeroDeg) {
        ctx.setLineDash([4, 2])
      } else {
        ctx.setLineDash([])
      }
      ctx.moveTo(marginLeft, py)
      ctx.lineTo(marginLeft + plotW, py)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.fillStyle = isZeroDeg ? "#000000" : "#555555"
      ctx.font = isZeroDeg ? "bold 10px 'Segoe UI', sans-serif" : "10px 'Segoe UI', sans-serif"
      ctx.textAlign = "right"
      ctx.textBaseline = "middle"
      ctx.fillText(`${deg > 0 ? "+" : ""}${deg}°`, marginLeft - 8, py)
    }

    // --- Plot Titles / Axis Labels ---
    ctx.fillStyle = "#005a9e"
    ctx.font = "bold 10.5px 'Segoe UI', Tahoma, sans-serif"
    ctx.textAlign = "left"
    ctx.textBaseline = "bottom"
    ctx.fillText("Magnitude (dB)", marginLeft + 6, magTop - 5)
    ctx.fillText("Phase (°)", marginLeft + 6, phaseTop - 5)

    // Bottom frequency axis label
    ctx.fillStyle = "#555555"
    ctx.font = "10.5px 'Segoe UI', Tahoma, sans-serif"
    ctx.textAlign = "center"
    ctx.fillText("Frequency (Logarithmic Scale)", marginLeft + plotW / 2, height - 4)

    // --- Plot Traces for Selected Signals ---
    for (const sig of activeSigs) {
      const dbData = simulationResult?.data[`${sig.id}_db`]
      const phaseData = simulationResult?.data[`${sig.id}_phase`]

      if (!dbData || !phaseData || frequencies.length === 0) continue

      // 1. Draw Magnitude Curve
      ctx.save()
      ctx.beginPath()
      ctx.rect(marginLeft, magTop, plotW, paneH)
      ctx.clip()

      ctx.beginPath()
      ctx.strokeStyle = sig.color
      ctx.lineWidth = 1.8
      let started = false

      for (let i = 0; i < frequencies.length; i++) {
        const f = frequencies[i]
        const db = dbData[i]
        if (!isFinite(f) || !isFinite(db)) continue

        const px = freqToX(f)
        const py = magToY(db)

        if (!started) {
          ctx.moveTo(px, py)
          started = true
        } else {
          ctx.lineTo(px, py)
        }
      }
      ctx.stroke()
      ctx.restore()

      // 2. Draw Phase Curve
      ctx.save()
      ctx.beginPath()
      ctx.rect(marginLeft, phaseTop, plotW, paneH)
      ctx.clip()

      ctx.beginPath()
      ctx.strokeStyle = sig.color
      ctx.lineWidth = 1.8
      started = false

      for (let i = 0; i < frequencies.length; i++) {
        const f = frequencies[i]
        const deg = phaseData[i]
        if (!isFinite(f) || !isFinite(deg)) continue

        const px = freqToX(f)
        const py = phaseToY(deg)

        if (!started) {
          ctx.moveTo(px, py)
          started = true
        } else {
          ctx.lineTo(px, py)
        }
      }
      ctx.stroke()
      ctx.restore()
    }

    // --- Interactive Cursor Tracking ---
    if (cursorX !== null && cursorX >= marginLeft && cursorX <= marginLeft + plotW) {
      const curFreq = xToFreq(cursorX)

      let closestIdx = 0
      let closestDist = Infinity
      for (let i = 0; i < frequencies.length; i++) {
        const dist = Math.abs(frequencies[i] - curFreq)
        if (dist < closestDist) {
          closestDist = dist
          closestIdx = i
        }
      }

      const activeF = frequencies[closestIdx]
      const snapX = freqToX(activeF)

      // Hairline
      ctx.beginPath()
      ctx.strokeStyle = "#ff0000"
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.moveTo(snapX, magTop)
      ctx.lineTo(snapX, magTop + paneH)
      ctx.moveTo(snapX, phaseTop)
      ctx.lineTo(snapX, phaseTop + paneH)
      ctx.stroke()
      ctx.setLineDash([])

      // Dots and readout
      const readoutItems: Array<{
        name: string
        color: string
        magDb: number
        magLinear: number
        phase: number
        unit: string
      }> = []

      for (const sig of activeSigs) {
        const db = simulationResult?.data[`${sig.id}_db`]?.[closestIdx] ?? 0
        const lin = simulationResult?.data[sig.id]?.[closestIdx] ?? 0
        const deg = simulationResult?.data[`${sig.id}_phase`]?.[closestIdx] ?? 0

        const my = magToY(db)
        ctx.beginPath()
        ctx.fillStyle = sig.color
        ctx.arc(snapX, my, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 1.5
        ctx.stroke()

        const py = phaseToY(deg)
        ctx.beginPath()
        ctx.fillStyle = sig.color
        ctx.arc(snapX, py, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 1.5
        ctx.stroke()

        readoutItems.push({
          name: sig.displayName,
          color: sig.color,
          magDb: db,
          magLinear: lin,
          phase: deg,
          unit: sig.unit,
        })
      }

      // Cursor Badge
      const badgeX = marginLeft + plotW - 240
      const badgeY = magTop + 6
      const badgeW = 232
      const badgeH = 20 + readoutItems.length * 17

      ctx.fillStyle = "rgba(255, 255, 255, 0.94)"
      ctx.strokeStyle = "#cccccc"
      ctx.lineWidth = 1
      ctx.fillRect(badgeX, badgeY, badgeW, badgeH)
      ctx.strokeRect(badgeX, badgeY, badgeW, badgeH)

      ctx.fillStyle = "#111827"
      ctx.font = "bold 10.5px 'Segoe UI', Tahoma, sans-serif"
      ctx.textAlign = "left"
      ctx.textBaseline = "top"
      ctx.fillText(`Freq: ${formatEngineering(activeF, "Hz", 4)}`, badgeX + 8, badgeY + 4)

      readoutItems.forEach((item, idx) => {
        const rowY = badgeY + 22 + idx * 17
        ctx.fillStyle = item.color
        ctx.fillRect(badgeX + 8, rowY + 3, 7, 7)

        ctx.fillStyle = "#1f2937"
        ctx.font = "10px 'Segoe UI', monospace"
        const text = `${item.name}: ${item.magDb >= 0 ? "+" : ""}${item.magDb.toFixed(2)} dB | ${item.phase.toFixed(1)}°`
        ctx.fillText(text, badgeX + 20, rowY + 1)
      })
    }

    // Drag zoom selection box
    if (isDragging && dragStartX !== null && cursorX !== null) {
      const left = Math.min(dragStartX, cursorX)
      const w = Math.abs(cursorX - dragStartX)
      ctx.fillStyle = "rgba(0, 90, 158, 0.12)"
      ctx.strokeStyle = "rgba(0, 90, 158, 0.6)"
      ctx.lineWidth = 1
      ctx.fillRect(left, magTop, w, paneH)
      ctx.strokeRect(left, magTop, w, paneH)
      ctx.fillRect(left, phaseTop, w, paneH)
      ctx.strokeRect(left, phaseTop, w, paneH)
    }
  }, [
    activeTab,
    currentBounds,
    frequencies,
    activeSigs,
    simulationResult,
    calculatedDbBounds,
    cursorX,
    isDragging,
    dragStartX,
  ])

  // Cleanup any pending rAF on unmount
  useEffect(() => {
    return () => {
      if (mouseMoveRafRef.current !== null) {
        cancelAnimationFrame(mouseMoveRafRef.current)
      }
    }
  }, [])

  // Mouse canvas handlers (rAF throttled to ensure silky-smooth 60 FPS without event flooding)
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left

    if (mouseMoveRafRef.current !== null) return
    mouseMoveRafRef.current = requestAnimationFrame(() => {
      setCursorX(x)
      mouseMoveRafRef.current = null
    })
  }

  const handleCanvasMouseLeave = () => {
    if (mouseMoveRafRef.current !== null) {
      cancelAnimationFrame(mouseMoveRafRef.current)
      mouseMoveRafRef.current = null
    }
    setCursorX(null)
    setIsDragging(false)
    setDragStartX(null)
  }

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    setIsDragging(true)
    setDragStartX(x)
  }

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || dragStartX === null) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left

    const marginLeft = 65
    const marginRight = 35
    const plotW = rect.width - marginLeft - marginRight

    if (Math.abs(x - dragStartX) > 15 && plotW > 0) {
      const minX = Math.min(dragStartX, x)
      const maxX = Math.max(dragStartX, x)

      const logMinF = Math.log10(currentBounds.min)
      const logMaxF = Math.log10(currentBounds.max)
      const logSpanF = logMaxF - logMinF

      const f1 = Math.pow(10, logMinF + ((minX - marginLeft) / plotW) * logSpanF)
      const f2 = Math.pow(10, logMinF + ((maxX - marginLeft) / plotW) * logSpanF)

      if (f1 > 0 && f2 > f1) {
        setFreqBounds({ min: f1, max: f2 })
      }
    }

    setIsDragging(false)
    setDragStartX(null)
  }

  const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 0.8 : 1.25
    handleZoom(factor)
  }

  if (!isOpen) return null

  // Reusable sub-views
  const renderPlotArea = () => (
    <div style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden", minHeight: 0 }}>
      {/* Left Panel: Signal Selection Checkboxes */}
      <div
        style={{
          width: "190px",
          background: "#f9f9f9",
          borderRight: "1px solid #d9d9d9",
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "4px" }}>
          <div style={{ fontSize: "11px", fontWeight: "bold", color: "#333333" }}>
            {t('acModal.signals', { selected: selectedSignalIds.length, total: availableSignals.length })}
          </div>
          <div style={{ display: "flex", gap: "3px" }}>
            <button
              onClick={() => setSelectedSignalIds(availableSignals.map((s) => s.id))}
              style={{
                fontSize: "10px",
                padding: "1px 5px",
                background: "#f0f0f0",
                border: "1px solid #c0c0c0",
                borderRadius: "2px",
                cursor: "pointer",
              }}
              title={t('acModal.selectAll')}
            >
              {t('acModal.btnAll')}
            </button>
            <button
              onClick={() => setSelectedSignalIds(availableSignals.filter((s) => s.category === "voltage").map((s) => s.id))}
              style={{
                fontSize: "10px",
                padding: "1px 5px",
                background: "#f0f0f0",
                border: "1px solid #c0c0c0",
                borderRadius: "2px",
                cursor: "pointer",
              }}
              title={t('acModal.selectAllVoltage')}
            >
              {t('acModal.btnV')}
            </button>
            <button
              onClick={() => setSelectedSignalIds([])}
              style={{
                fontSize: "10px",
                padding: "1px 5px",
                background: "#f0f0f0",
                border: "1px solid #c0c0c0",
                borderRadius: "2px",
                cursor: "pointer",
              }}
              title={t('acModal.clearAll')}
            >
              {t('acModal.btnNone')}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {availableSignals.map((sig) => {
            const isSelected = selectedSignalIds.includes(sig.id)
            return (
              <label
                key={sig.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                  fontSize: "11px",
                  cursor: "pointer",
                  userSelect: "none",
                  padding: "2px 4px",
                  borderRadius: "2px",
                  background: isSelected ? "#ffffff" : "transparent",
                  border: isSelected ? "1px solid #e0e0e0" : "1px solid transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSignal(sig.id)}
                  style={{ cursor: "pointer" }}
                />
                <span
                  style={{
                    width: "9px",
                    height: "9px",
                    borderRadius: "2px",
                    backgroundColor: sig.color,
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontWeight: isSelected ? 600 : 400, color: "#111827" }}>
                  {sig.displayName}
                </span>
                <span style={{ color: "#888888", fontSize: "10px", marginLeft: "auto" }}>
                  [{sig.unit}]
                </span>
              </label>
            )
          })}

          {availableSignals.length === 0 && (
            <div style={{ fontSize: "11px", color: "#888", fontStyle: "italic" }}>
              {t('acModal.noSignals')}
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: "auto",
            paddingTop: "6px",
            borderTop: "1px solid #e5e5e5",
            fontSize: "10px",
            color: "#666",
            lineHeight: 1.3,
          }}
        >
          <p style={{ margin: "0 0 2px 0" }}>{t('acModal.tipHover')}</p>
          <p style={{ margin: "0 0 2px 0" }}>{t('acModal.tipDrag')}</p>
          <p style={{ margin: "0" }}>{t('acModal.tipScroll')}</p>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          background: "#ffffff",
          minHeight: 0,
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", cursor: isDragging ? "ew-resize" : "crosshair" }}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
          onMouseDown={handleCanvasMouseDown}
          onMouseUp={handleCanvasMouseUp}
          onWheel={handleCanvasWheel}
        />
      </div>
    </div>
  )

  const renderTableArea = () => (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#ffffff",
        minHeight: 0,
      }}
    >
      <div style={{ flex: 1, overflow: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "11px",
            fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif",
          }}
        >
          <thead style={{ position: "sticky", top: 0, background: "#f0f0f0", zIndex: 1 }}>
            <tr style={{ borderBottom: "1px solid #c0c0c0" }}>
              <th style={{ padding: "5px 10px", textAlign: "left", fontWeight: 600 }}>{t('acModal.colFreq')}</th>
              <th style={{ padding: "5px 10px", textAlign: "left", fontWeight: 600 }}>{t('acModal.colSignal')}</th>
              <th style={{ padding: "5px 10px", textAlign: "right", fontWeight: 600 }}>{t('acModal.colMagDb')}</th>
              <th style={{ padding: "5px 10px", textAlign: "right", fontWeight: 600 }}>
                {t('acModal.colMagLinear', { format: formatMode.toUpperCase() })}
              </th>
              <th style={{ padding: "5px 10px", textAlign: "right", fontWeight: 600 }}>{t('acModal.colPhase')}</th>
              <th style={{ padding: "5px 10px", textAlign: "right", fontWeight: 600 }}>{t('acModal.colReal')}</th>
              <th style={{ padding: "5px 10px", textAlign: "right", fontWeight: 600 }}>{t('acModal.colImag')}</th>
            </tr>
          </thead>
          <tbody>
            {paginatedTableRows.map((row, idx) => {
              const globalIdx = (safeCurrentPage - 1) * pageSize + idx
              return (
                <tr
                  key={`${row.signalName}-${globalIdx}`}
                  style={{
                    borderBottom: "1px solid #f0f0f0",
                    backgroundColor: idx % 2 === 0 ? "#ffffff" : "#fcfcfc",
                  }}
                >
                  <td style={{ padding: "3.5px 10px", color: "#111827" }}>
                    {formatEngineering(row.frequency, "Hz", 4)}
                  </td>
                  <td style={{ padding: "3.5px 10px", fontWeight: 600, color: "#005a9e" }}>
                    {row.signalName}
                  </td>
                  <td
                    style={{
                      padding: "3.5px 10px",
                      textAlign: "right",
                      fontFamily: "monospace",
                      color: row.magDb < 0 ? "#dc2626" : "#15803d",
                    }}
                  >
                    {row.magDb >= 0 ? "+" : ""}
                    {row.magDb.toFixed(3)} dB
                  </td>
                  <td style={{ padding: "3.5px 10px", textAlign: "right", fontFamily: "monospace" }}>
                    {formatValue(row.magLinear, row.unit)}
                  </td>
                  <td style={{ padding: "3.5px 10px", textAlign: "right", fontFamily: "monospace" }}>
                    {row.phaseDeg.toFixed(2)}°
                  </td>
                  <td style={{ padding: "3.5px 10px", textAlign: "right", fontFamily: "monospace", color: "#555" }}>
                    {formatValue(row.real, row.unit)}
                  </td>
                  <td style={{ padding: "3.5px 10px", textAlign: "right", fontFamily: "monospace", color: "#555" }}>
                    {formatValue(row.imag, row.unit)}
                  </td>
                </tr>
              )
            })}

            {filteredTableRows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: "24px",
                    textAlign: "center",
                    color: "#888",
                    fontStyle: "italic",
                  }}
                >
                  {t('acModal.noDataMatch')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination & Row Count Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "5px 12px",
          background: "#f8f9fa",
          borderTop: "1px solid #e2e8f0",
          fontSize: "11px",
          color: "#475569",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>
            Showing {filteredTableRows.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1} –{" "}
            {Math.min(safeCurrentPage * pageSize, filteredTableRows.length)} of {filteredTableRows.length} rows
          </span>
          <span style={{ color: "#cbd5e1" }}>|</span>
          <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span>Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              style={{
                fontSize: "11px",
                padding: "1px 4px",
                borderRadius: "2px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                cursor: "pointer",
              }}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
          </label>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <button
            type="button"
            disabled={safeCurrentPage <= 1}
            onClick={() => setCurrentPage(1)}
            style={{
              padding: "2px 7px",
              fontSize: "11px",
              borderRadius: "2px",
              border: "1px solid #cbd5e1",
              background: safeCurrentPage <= 1 ? "#f1f5f9" : "#ffffff",
              color: safeCurrentPage <= 1 ? "#94a3b8" : "#1e293b",
              cursor: safeCurrentPage <= 1 ? "not-allowed" : "pointer",
            }}
          >
            « First
          </button>
          <button
            type="button"
            disabled={safeCurrentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            style={{
              padding: "2px 7px",
              fontSize: "11px",
              borderRadius: "2px",
              border: "1px solid #cbd5e1",
              background: safeCurrentPage <= 1 ? "#f1f5f9" : "#ffffff",
              color: safeCurrentPage <= 1 ? "#94a3b8" : "#1e293b",
              cursor: safeCurrentPage <= 1 ? "not-allowed" : "pointer",
            }}
          >
            ‹ Prev
          </button>
          <span style={{ padding: "0 6px", fontWeight: 600, color: "#0f172a" }}>
            Page {safeCurrentPage} of {totalPages}
          </span>
          <button
            type="button"
            disabled={safeCurrentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            style={{
              padding: "2px 7px",
              fontSize: "11px",
              borderRadius: "2px",
              border: "1px solid #cbd5e1",
              background: safeCurrentPage >= totalPages ? "#f1f5f9" : "#ffffff",
              color: safeCurrentPage >= totalPages ? "#94a3b8" : "#1e293b",
              cursor: safeCurrentPage >= totalPages ? "not-allowed" : "pointer",
            }}
          >
            Next ›
          </button>
          <button
            type="button"
            disabled={safeCurrentPage >= totalPages}
            onClick={() => setCurrentPage(totalPages)}
            style={{
              padding: "2px 7px",
              fontSize: "11px",
              borderRadius: "2px",
              border: "1px solid #cbd5e1",
              background: safeCurrentPage >= totalPages ? "#f1f5f9" : "#ffffff",
              color: safeCurrentPage >= totalPages ? "#94a3b8" : "#1e293b",
              cursor: safeCurrentPage >= totalPages ? "not-allowed" : "pointer",
            }}
          >
            Last »
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div
      className="sim-error-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ac-results-dialog-title"
    >
      <div
        className="sim-error-win-dialog"
        style={{
          width: isMaximized ? "98vw" : "980px",
          maxWidth: "98vw",
          height: isMaximized ? "96vh" : "700px",
          maxHeight: "96vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Classic Windows Titlebar */}
        <div className="sim-error-win-titlebar">
          <div className="sim-error-win-title">
            <span className="sim-error-win-title-icon" aria-hidden="true">
              <Activity size={13} color="#005a9e" />
            </span>
            <span id="ac-results-dialog-title" style={{ fontWeight: 600 }}>
              {t('acModal.title')}
            </span>
            <span style={{ color: "#666666", fontSize: "11px", marginLeft: "6px" }}>
              [{circuitTitle} • {t('acModal.pointsCount', { count: frequencies.length })}]
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              type="button"
              className="sim-error-win-close-btn"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? t('acModal.restore') : t('acModal.maximize')}
              style={{ width: "32px" }}
            >
              {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
            <button
              type="button"
              className="sim-error-win-close-btn"
              onClick={onClose}
              aria-label={t("actions.close")}
              title={`${t("actions.close")} (Esc)`}
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Toolbar & View Controls */}
        <div
          style={{
            background: "#f7f7f7",
            borderBottom: "1px solid #d9d9d9",
            padding: "5px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          {/* Left: View Mode Tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <button
              type="button"
              onClick={() => setActiveTab("table")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "3px 10px",
                fontSize: "11.5px",
                borderRadius: "3px",
                border: "1px solid",
                borderColor: activeTab === "table" ? "#005a9e" : "#cccccc",
                background: activeTab === "table" ? "#e1effe" : "#ffffff",
                color: activeTab === "table" ? "#005a9e" : "#333333",
                fontWeight: activeTab === "table" ? 600 : 400,
                cursor: "pointer",
              }}
            >
              <Table size={13} />
              {t('acModal.tabNumerical', { count: tableRows.length })}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("plot")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "3px 10px",
                fontSize: "11.5px",
                borderRadius: "3px",
                border: "1px solid",
                borderColor: activeTab === "plot" ? "#005a9e" : "#cccccc",
                background: activeTab === "plot" ? "#e1effe" : "#ffffff",
                color: activeTab === "plot" ? "#005a9e" : "#333333",
                fontWeight: activeTab === "plot" ? 600 : 400,
                cursor: "pointer",
              }}
            >
              <TrendingUp size={13} />
              {t('acModal.tabBode')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("split")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "3px 10px",
                fontSize: "11.5px",
                borderRadius: "3px",
                border: "1px solid",
                borderColor: activeTab === "split" ? "#005a9e" : "#cccccc",
                background: activeTab === "split" ? "#e1effe" : "#ffffff",
                color: activeTab === "split" ? "#005a9e" : "#333333",
                fontWeight: activeTab === "split" ? 600 : 400,
                cursor: "pointer",
              }}
              title={t('acModal.splitTooltip')}
            >
              <Columns size={13} />
              {t('acModal.tabSplit')}
            </button>
          </div>

          {/* Right Toolbar Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {activeTab !== "table" && (
              <>
                <button
                  type="button"
                  onClick={() => handleZoom(0.7)}
                  className="cfg-analysis-win-btn"
                  title={t('acModal.zoomInTooltip')}
                  style={{ display: "flex", alignItems: "center", gap: "4px", padding: "2px 7px", fontSize: "11px" }}
                >
                  <ZoomIn size={12} /> {t('acModal.zoomIn')}
                </button>
                <button
                  type="button"
                  onClick={() => handleZoom(1.4)}
                  className="cfg-analysis-win-btn"
                  title={t('acModal.zoomOutTooltip')}
                  style={{ display: "flex", alignItems: "center", gap: "4px", padding: "2px 7px", fontSize: "11px" }}
                >
                  <ZoomOut size={12} /> {t('acModal.zoomOut')}
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  className="cfg-analysis-win-btn"
                  title={t('acModal.zoomFitTooltip')}
                  style={{ display: "flex", alignItems: "center", gap: "4px", padding: "2px 7px", fontSize: "11px" }}
                >
                  <RefreshCw size={12} /> {t('acModal.zoomFit')}
                </button>
              </>
            )}

            {activeTab !== "plot" && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <label htmlFor="ac-signal-filter" style={{ fontSize: "11px", color: "#666" }}>
                    {t('acModal.signalFilter')}
                  </label>
                  <select
                    id="ac-signal-filter"
                    value={tableSignalFilter}
                    onChange={(e) => setTableSignalFilter(e.target.value)}
                    style={{
                      fontSize: "11px",
                      padding: "2px 6px",
                      border: "1px solid #c0c0c0",
                      background: "#fff",
                      borderRadius: "2px",
                    }}
                  >
                    <option value="all">{t('acModal.allSignals')}</option>
                    {availableSignals.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    placeholder={t('acModal.searchPlaceholder')}
                    style={{
                      padding: "2px 20px 2px 6px",
                      fontSize: "11px",
                      border: "1px solid #c0c0c0",
                      borderRadius: "2px",
                      width: "130px",
                    }}
                  />
                  <Search
                    size={11}
                    color="#888"
                    style={{ position: "absolute", right: "5px", top: "5px" }}
                  />
                </div>

                {/* Notation selector */}
                <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                  {(["eng", "sci", "dec"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setFormatMode(mode)}
                      style={{
                        padding: "2px 5px",
                        fontSize: "10px",
                        border: "1px solid",
                        borderColor: formatMode === mode ? "#005a9e" : "#ccc",
                        background: formatMode === mode ? "#005a9e" : "#fff",
                        color: formatMode === mode ? "#fff" : "#333",
                        cursor: "pointer",
                      }}
                    >
                      {mode.toUpperCase()}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleCopy}
                  className="cfg-analysis-win-btn"
                  title={t('acModal.copyTooltip')}
                  style={{ display: "flex", alignItems: "center", gap: "4px", padding: "2px 7px", fontSize: "11px" }}
                >
                  {copied ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                  {copied ? t('acModal.copied') : t('acModal.copy')}
                </button>

                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="cfg-analysis-win-btn"
                  title={t('acModal.exportTooltip')}
                  style={{ display: "flex", alignItems: "center", gap: "4px", padding: "2px 7px", fontSize: "11px" }}
                >
                  <Download size={12} /> {t('acModal.exportCsv')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content Body Area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          {activeTab === "table" && renderTableArea()}
          {activeTab === "plot" && renderPlotArea()}
          {activeTab === "split" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
              <div style={{ height: "48%", display: "flex", borderBottom: "2px solid #c0c0c0", minHeight: 0 }}>
                {renderPlotArea()}
              </div>
              <div style={{ height: "52%", display: "flex", flexDirection: "column", minHeight: 0 }}>
                {renderTableArea()}
              </div>
            </div>
          )}
        </div>

        {/* Footer Status Bar */}
        <div
          style={{
            background: "#f0f0f0",
            borderTop: "1px solid #d9d9d9",
            padding: "5px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "11px",
            color: "#444444",
          }}
        >
          <div>
            Frequency Range: {formatEngineering(naturalFreqRange.min, "Hz")} →{" "}
            {formatEngineering(naturalFreqRange.max, "Hz")} ({frequencies.length} points)
            {simulationResult?.elapsedMs !== undefined && (
              <span style={{ marginLeft: "12px", color: "#666" }}>
                Simulation elapsed: {simulationResult.elapsedMs} ms
              </span>
            )}
          </div>
          <button
            type="button"
            className="cfg-analysis-win-btn cfg-analysis-win-btn-primary"
            onClick={onClose}
            style={{ minWidth: "75px" }}
          >
            {t("actions.close", "Close")}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AcAnalysisModal

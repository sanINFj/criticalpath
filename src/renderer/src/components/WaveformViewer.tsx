import React, { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useTranslation, Trans } from "react-i18next"
import {
  ZoomIn,
  Move,
  Maximize2,
  Crosshair,
  Activity,
  Settings,
  Zap,
} from "lucide-react"
import type { SimulationRunResult } from "../../../shared/simulation"
import { formatEngineering } from "../utils/engineeringFormat"
import {
  evaluateWaveformExpression,
  type MathTraceDefinition,
} from "../utils/waveformMath"
import { computeWaveformFft, type FftResult } from "../utils/waveformFft"
import {
  type PlotSettings,
  type TraceConfig,
  type PlotAnnotation,
  loadPlotSettings,
  savePlotSettings,
  exportPlotSettingsJson,
  importPlotSettingsJson,
} from "../utils/waveformSettings"
import { PALETTE_COLORS } from "./waveform/TraceConfigModal"
import WaveformSettingsModal, { type WaveformSettingsTab } from "./waveform/WaveformSettingsModal"
import {
  calculateAutomaticMeasurements,
  type MeasurementsReport,
} from "../utils/automaticMeasurements"

// Distinct, vibrant LTspice trace color palette defaults
const TRACE_COLORS = PALETTE_COLORS

export interface CircuitNetInfo {
  netName: string
  signalName: string
  displayName: string
  pinCount: number
  connectedComponents: string[]
  isGround?: boolean
}

export interface WaveformViewerProps {
  simulationResult: SimulationRunResult | null
  isOpen: boolean
  onClose: () => void
  onClear: () => void
  height?: number
  onHeightChange?: (height: number) => void
  isMaximized?: boolean
  onToggleMaximize?: () => void
  availableNets?: CircuitNetInfo[]
  activeProbedSignal?: string | null
  onProbeSignal?: (signalName: string, netName?: string) => void
  isProbeToolActive?: boolean
  onToggleProbeTool?: () => void
  onHighlightNet?: (netName: string | null) => void
}

/**
 * Binary search + linear interpolation of a trace value at xTarget
 */
function interpolateAtX(xArr: number[], yArr: number[], xTarget: number): number {
  if (!xArr || xArr.length === 0 || !yArr || yArr.length === 0) return 0
  if (xTarget <= xArr[0]) return yArr[0]
  if (xTarget >= xArr[xArr.length - 1]) return yArr[yArr.length - 1]

  let low = 0
  let high = xArr.length - 1

  while (low <= high) {
    const mid = (low + high) >> 1
    if (xArr[mid] === xTarget) return yArr[mid]
    if (xArr[mid] < xTarget) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  const i0 = Math.max(0, high)
  const i1 = Math.min(xArr.length - 1, low)
  if (i0 === i1) return yArr[i0]

  const t = (xTarget - xArr[i0]) / (xArr[i1] - xArr[i0])
  return yArr[i0] + t * (yArr[i1] - yArr[i0])
}

export const WaveformViewer: React.FC<WaveformViewerProps> = ({
  simulationResult,
  isOpen,
  onClose,
  onClear,
  height = 360,
  onHeightChange,
  isMaximized: propIsMaximized,
  onToggleMaximize,
  availableNets = [],
  activeProbedSignal,
  onProbeSignal,
  isProbeToolActive = false,
  onToggleProbeTool,
  onHighlightNet,
}) => {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const probeDropdownRef = useRef<HTMLDivElement | null>(null)

  // Viewer display state
  const [internalMaximized, setInternalMaximized] = useState(false)
  const isMaximized = propIsMaximized !== undefined ? propIsMaximized : internalMaximized
  const [isMinimized, setIsMinimized] = useState(false)
  const [, setContainerSize] = useState({ width: 0, height: 0 })

  // Persistent plot settings
  const [plotSettings, setPlotSettings] = useState<PlotSettings>(() => loadPlotSettings())

  // Save settings whenever they change
  useEffect(() => {
    savePlotSettings(plotSettings)
  }, [plotSettings])

  // Traces selected for display
  const [selectedTraces, setSelectedTraces] = useState<string[]>([])
  const [useLogX, setUseLogX] = useState(false)

  // Interactive Tools: "zoom" (box/wheel zoom) vs "pan" (drag canvas)
  const [activeTool, setActiveTool] = useState<"zoom" | "pan">("zoom")

  // Modes
  const [cursorsEnabled, setCursorsEnabled] = useState(false)
  const [fftMode, setFftMode] = useState(false)

  // Probed node / wire interactive calculations state
  const [currentProbedSignal, setCurrentProbedSignal] = useState<string | null>(activeProbedSignal || null)
  const [isProbedHudVisible, setIsProbedHudVisible] = useState(true)
  const [isProbedHudCollapsed, setIsProbedHudCollapsed] = useState(false)
  const [isNetDropdownOpen, setIsNetDropdownOpen] = useState(false)
  const [netSearchQuery, setNetSearchQuery] = useState("")

  // Sync external probed signal from schematic clicks
  useEffect(() => {
    if (activeProbedSignal) {
      setCurrentProbedSignal(activeProbedSignal)
      setIsProbedHudVisible(true)
      setSelectedTraces((prev) => (prev.includes(activeProbedSignal) ? prev : [...prev, activeProbedSignal]))
    }
  }, [activeProbedSignal])

  // Close probe dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (probeDropdownRef.current && !probeDropdownRef.current.contains(e.target as HTMLElement)) {
        setIsNetDropdownOpen(false)
      }
    }
    if (isNetDropdownOpen) {
      document.addEventListener("mousedown", handleOutsideClick)
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [isNetDropdownOpen])



  // Consolidated Plot Settings & Tools Modal
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [settingsModalTab, setSettingsModalTab] = useState<WaveformSettingsTab>("traces")

  // Cursor locations in data space (X coordinate)
  const [cursor1X, setCursor1X] = useState<number | null>(null)
  const [cursor2X, setCursor2X] = useState<number | null>(null)
  const [activeCursorDrag, setActiveCursorDrag] = useState<1 | 2 | null>(null)

  // Manual / Zoom View Ranges in data coordinates
  const [viewXRange, setViewXRange] = useState<[number, number] | null>(null)
  // Per-pane Y ranges: pane 0, 1, 2
  const [paneYRanges, setPaneYRanges] = useState<
    Record<number, { left: [number, number] | null; right: [number, number] | null }>
  >({})

  // Mouse interaction state (box zoom & pan & hover)
  const [isBoxZooming, setIsBoxZooming] = useState(false)
  const [boxZoomStart, setBoxZoomStart] = useState<{ x: number; y: number } | null>(null)
  const [boxZoomCurrent, setBoxZoomCurrent] = useState<{ x: number; y: number } | null>(null)

  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState<{ x: number; y: number; xMin: number; xMax: number } | null>(null)

  const [mousePos, setMousePos] = useState<{ x: number; y: number; dataX: number; dataY: number } | null>(null)

  // Resizing state
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartY = useRef(0)
  const resizeStartHeight = useRef(height)

  // Extract variables & independent sweep vector
  const xVarName = useMemo(() => {
    if (!simulationResult) return ""
    if (simulationResult.xVariable) return simulationResult.xVariable
    if (simulationResult.variables.length > 0) return simulationResult.variables[0].name
    return "time"
  }, [simulationResult])

  const xData = useMemo(() => {
    if (!simulationResult?.data || !xVarName) return []
    return simulationResult.data[xVarName] || []
  }, [simulationResult, xVarName])

  // Build combined data lookup including custom math traces
  const combinedDataMap = useMemo(() => {
    const map: Record<string, number[]> = {}
    if (simulationResult?.data) {
      for (const k of Object.keys(simulationResult.data)) {
        map[k] = simulationResult.data[k]
        map[k.toLowerCase()] = simulationResult.data[k]
      }
    }

    // Ensure Ground reference (0 / v(0)) has a valid 0V array
    if (xData.length > 0 && !map["0"]) {
      const zeroArr = new Array(xData.length).fill(0)
      map["0"] = zeroArr
      map["v(0)"] = zeroArr
    }

    // Evaluate custom math traces
    plotSettings.customMathTraces.forEach((mt) => {
      const res = evaluateWaveformExpression(mt.expression, map, xVarName)
      if (res.success && res.data) {
        map[mt.name] = res.data
        map[mt.name.toLowerCase()] = res.data
      }
    })

    return map
  }, [simulationResult, plotSettings.customMathTraces, xVarName])

  // All plot-able traces (native variables + custom math traces)
  const allAvailableTraces = useMemo(() => {
    const list: Array<{ name: string; type: string; unit: string; isMath?: boolean }> = []
    if (simulationResult) {
      simulationResult.variables.forEach((v) => {
        if (v.name !== xVarName && v.index > 0 && simulationResult.data[v.name]?.length > 0) {
          list.push({
            name: v.name,
            type: v.type,
            unit: v.unit || (v.name.startsWith("i(") ? "A" : "V"),
            isMath: false,
          })
        }
      })
    }

    plotSettings.customMathTraces.forEach((mt) => {
      list.push({
        name: mt.name,
        type: "math",
        unit: mt.unit || "V",
        isMath: true,
      })
    })

    return list
  }, [simulationResult, xVarName, plotSettings.customMathTraces])



  // Analysis type & X-unit
  const xUnit = useMemo(() => {
    if (fftMode) return "Hz"
    if (xVarName === "time") return "s"
    if (xVarName === "frequency") return "Hz"
    if (xVarName.startsWith("v(") || xVarName.includes("sweep")) return "V"
    if (xVarName.startsWith("i(")) return "A"
    return ""
  }, [xVarName, fftMode])

  const isAcSweep = simulationResult?.analysisType === "ac" || xVarName === "frequency"

  // Automatically select primary traces when a new simulation run completes
  useEffect(() => {
    if (allAvailableTraces.length > 0 && selectedTraces.length === 0) {
      const defaultTraces = allAvailableTraces
        .filter((t) => {
          if (isAcSweep) {
            return t.name.includes("out") || (!t.name.endsWith("_phase") && t.name.startsWith("v("))
          }
          return t.name.startsWith("v(")
        })
        .slice(0, 3)
        .map((t) => t.name)

      if (defaultTraces.length > 0) {
        setSelectedTraces(defaultTraces)
      } else {
        setSelectedTraces([allAvailableTraces[0].name])
      }

      setUseLogX(isAcSweep)
      setViewXRange(null)
      setPaneYRanges({})
    }
  }, [simulationResult, isAcSweep, allAvailableTraces, selectedTraces.length])

  // FFT spectrum data calculated for currently selected traces
  const fftResultsMap = useMemo<Record<string, FftResult | null>>(() => {
    if (!fftMode || xData.length < 8) return {}
    const map: Record<string, FftResult | null> = {}
    selectedTraces.forEach((name) => {
      const yArr = combinedDataMap[name] || combinedDataMap[name.toLowerCase()]
      if (yArr && yArr.length >= 8) {
        map[name] = computeWaveformFft(xData, yArr, 1024, "hanning")
      }
    })
    return map
  }, [fftMode, selectedTraces, xData, combinedDataMap])

  // Helper to get trace configuration
  const getTraceConfig = useCallback(
    (name: string, index: number): TraceConfig => {
      const saved = plotSettings.traceConfigs[name]
      const defaultColor = TRACE_COLORS[index % TRACE_COLORS.length]
      return {
        color: saved?.color || defaultColor,
        lineWidth: saved?.lineWidth ?? 2,
        lineStyle: saved?.lineStyle || "solid",
        pane: saved?.pane ?? 0,
        visible: saved?.visible ?? true,
      }
    },
    [plotSettings.traceConfigs],
  )

  // List of available circuit nets and signals for dropdown
  const resolvedNetsList: CircuitNetInfo[] = useMemo(() => {
    if (availableNets && availableNets.length > 0) return availableNets
    return allAvailableTraces.map((t) => ({
      netName: t.name.replace(/^v\(|\)$/gi, ""),
      signalName: t.name,
      displayName: t.name.toUpperCase(),
      pinCount: 1,
      connectedComponents: [],
    }))
  }, [availableNets, allAvailableTraces])

  const filteredAvailableNets = useMemo(() => {
    if (!netSearchQuery.trim()) return resolvedNetsList
    const q = netSearchQuery.toLowerCase()
    return resolvedNetsList.filter(
      (n) =>
        n.netName.toLowerCase().includes(q) ||
        n.displayName.toLowerCase().includes(q) ||
        n.connectedComponents.some((c) => c.toLowerCase().includes(q)),
    )
  }, [resolvedNetsList, netSearchQuery])

  // Active probed trace identifier (explicitly probed or first selected trace)
  const activeProbedTrace = currentProbedSignal || (selectedTraces.length > 0 ? selectedTraces[0] : null)

  // Calculate live electrical measurements for the active probed wire/node
  const probedReport: MeasurementsReport | null = useMemo(() => {
    if (!activeProbedTrace || !simulationResult || !simulationResult.data) return null
    if (activeProbedTrace === "0") {
      return {
        signalName: "0 (GND)",
        analysisType: simulationResult.analysisType || "TRAN",
        pointCount: simulationResult.pointCount,
        measurements: [
          {
            id: "v_max",
            name: "Maximum Voltage",
            symbol: "Vmax",
            category: "transient",
            valueFormatted: "0.000 V",
            numericValue: 0,
            unit: "V",
            definition: "Ground Reference",
            status: "valid",
          },
          {
            id: "v_min",
            name: "Minimum Voltage",
            symbol: "Vmin",
            category: "transient",
            valueFormatted: "0.000 V",
            numericValue: 0,
            unit: "V",
            definition: "Ground Reference",
            status: "valid",
          },
          {
            id: "v_peak_to_peak",
            name: "Peak-to-Peak Voltage",
            symbol: "Vp-p",
            category: "transient",
            valueFormatted: "0.000 V",
            numericValue: 0,
            unit: "V",
            definition: "Ground Reference",
            status: "valid",
          },
          {
            id: "v_avg",
            name: "Average DC Voltage",
            symbol: "Vavg",
            category: "transient",
            valueFormatted: "0.000 V",
            numericValue: 0,
            unit: "V",
            definition: "Ground Reference",
            status: "valid",
          },
          {
            id: "v_rms",
            name: "RMS Voltage",
            symbol: "Vrms",
            category: "transient",
            valueFormatted: "0.000 V",
            numericValue: 0,
            unit: "V",
            definition: "Ground Reference",
            status: "valid",
          },
        ],
      }
    }
    return calculateAutomaticMeasurements(simulationResult, activeProbedTrace)
  }, [simulationResult, activeProbedTrace])

  // Key electrical figures computed for graph display HUD
  const probedKeyMetrics = useMemo(() => {
    if (!probedReport || probedReport.measurements.length === 0) return null

    const findVal = (idPrefix: string) => {
      const m = probedReport.measurements.find((x) => x.id.toLowerCase().includes(idPrefix.toLowerCase()))
      return m ? m.valueFormatted : "N/A"
    }

    const vpp = findVal("peak_to_peak") || findVal("v_pp")
    const vmax = findVal("max")
    const vmin = findVal("min")
    const vavg = findVal("avg") || findVal("dc")
    const vrms = findVal("rms")
    const freq = findVal("freq")
    const period = findVal("period")

    return { vpp, vmax, vmin, vavg, vrms, freq, period }
  }, [probedReport])

  // Real-time instantaneous value at mouse cursor
  const instantaneousProbedVal = useMemo(() => {
    if (!activeProbedTrace || !mousePos || !combinedDataMap[activeProbedTrace.toLowerCase()] || !xData.length) {
      return null
    }
    const val = interpolateAtX(xData, combinedDataMap[activeProbedTrace.toLowerCase()], mousePos.dataX)
    const unit = activeProbedTrace.toLowerCase().startsWith("i(") ? "A" : "V"
    return formatEngineering(val, unit)
  }, [activeProbedTrace, mousePos, combinedDataMap, xData])

  // Net wiring metadata for active probed node
  const matchedNetInfo = useMemo(() => {
    if (!activeProbedTrace || !availableNets) return null
    return availableNets.find(
      (n) =>
        n.signalName.toLowerCase() === activeProbedTrace.toLowerCase() ||
        n.netName.toLowerCase() === activeProbedTrace.toLowerCase() ||
        `v(${n.netName.toLowerCase()})` === activeProbedTrace.toLowerCase(),
    )
  }, [activeProbedTrace, availableNets])

  // Color matching trace on graph
  const activeProbedTraceColor = useMemo(() => {
    if (!activeProbedTrace) return "#38bdf8"
    const idx = allAvailableTraces.findIndex((t) => t.name.toLowerCase() === activeProbedTrace.toLowerCase())
    if (idx >= 0) {
      const cfg = getTraceConfig(activeProbedTrace, idx)
      return cfg.color || TRACE_COLORS[idx % TRACE_COLORS.length]
    }
    return "#38bdf8"
  }, [activeProbedTrace, allAvailableTraces, getTraceConfig])

  const handleSelectNet = (net: CircuitNetInfo) => {
    const signalName = net.signalName
    setCurrentProbedSignal(signalName)
    setIsProbedHudVisible(true)
    setIsNetDropdownOpen(false)

    setSelectedTraces((prev) => (prev.includes(signalName) ? prev : [...prev, signalName]))
    onProbeSignal?.(signalName, net.netName)
    onHighlightNet?.(net.netName)
  }

  // Compute natural bounds for independent X axis
  const naturalXBounds = useMemo(() => {
    if (fftMode) {
      // Bounds from FFT frequency vectors
      let maxF = 1000
      for (const k of Object.keys(fftResultsMap)) {
        const fft = fftResultsMap[k]
        if (fft && fft.frequencies.length > 0) {
          const top = fft.frequencies[fft.frequencies.length - 1]
          if (top > maxF) maxF = top
        }
      }
      return { minX: 0, maxX: maxF }
    }

    if (!xData || xData.length === 0) return { minX: 0, maxX: 1 }
    let minX = xData[0]
    let maxX = xData[xData.length - 1]
    if (minX > maxX) {
      const tmp = minX
      minX = maxX
      maxX = tmp
    }
    if (minX === maxX) {
      minX -= 1
      maxX += 1
    }
    return { minX, maxX }
  }, [xData, fftMode, fftResultsMap])

  // Compute natural Y bounds per pane
  const naturalPaneBounds = useMemo(() => {
    const panes: Record<
      number,
      { minLeftY: number; maxLeftY: number; hasLeft: boolean; minRightY: number; maxRightY: number; hasRight: boolean }
    > = {}

    for (let p = 0; p < plotSettings.panesCount; p++) {
      panes[p] = {
        minLeftY: Infinity,
        maxLeftY: -Infinity,
        hasLeft: false,
        minRightY: Infinity,
        maxRightY: -Infinity,
        hasRight: false,
      }
    }

    if (fftMode) {
      // In FFT mode, values are in dB (typically -120 to +20 dB)
      for (let p = 0; p < plotSettings.panesCount; p++) {
        panes[p] = {
          minLeftY: -100,
          maxLeftY: 20,
          hasLeft: true,
          minRightY: 0,
          maxRightY: 1,
          hasRight: false,
        }
      }
      return panes
    }

    selectedTraces.forEach((name, idx) => {
      const cfg = getTraceConfig(name, idx)
      const paneIdx = Math.min(plotSettings.panesCount - 1, Math.max(0, cfg.pane ?? 0))
      const arr = combinedDataMap[name] || combinedDataMap[name.toLowerCase()]
      if (!arr || arr.length === 0) return

      const isRightAxis = name.startsWith("i(") || name.endsWith("_phase")
      const targetPane = panes[paneIdx]

      for (let i = 0; i < arr.length; i++) {
        const val = arr[i]
        if (!isFinite(val)) continue
        if (isRightAxis) {
          targetPane.hasRight = true
          if (val < targetPane.minRightY) targetPane.minRightY = val
          if (val > targetPane.maxRightY) targetPane.maxRightY = val
        } else {
          targetPane.hasLeft = true
          if (val < targetPane.minLeftY) targetPane.minLeftY = val
          if (val > targetPane.maxLeftY) targetPane.maxLeftY = val
        }
      }
    })

    // Add padding to each pane
    for (let p = 0; p < plotSettings.panesCount; p++) {
      const b = panes[p]
      if (b.hasLeft) {
        const pad = (b.maxLeftY - b.minLeftY) * 0.08 || 0.5
        b.minLeftY -= pad
        b.maxLeftY += pad
      } else {
        b.minLeftY = -1
        b.maxLeftY = 5
      }

      if (b.hasRight) {
        const pad = (b.maxRightY - b.minRightY) * 0.08 || 0.001
        b.minRightY -= pad
        b.maxRightY += pad
      } else {
        b.minRightY = -0.01
        b.maxRightY = 0.01
      }
    }

    return panes
  }, [plotSettings.panesCount, selectedTraces, combinedDataMap, getTraceConfig, fftMode])

  // Active X Range (synchronized across all panes)
  const activeXRange: [number, number] =
    viewXRange || [naturalXBounds.minX, naturalXBounds.maxX]

  // Initialize cursor positions when cursors are turned on
  useEffect(() => {
    if (cursorsEnabled && cursor1X === null) {
      const span = activeXRange[1] - activeXRange[0]
      setCursor1X(activeXRange[0] + span * 0.25)
      setCursor2X(activeXRange[0] + span * 0.75)
    }
  }, [cursorsEnabled, activeXRange, cursor1X])

  // Resize handling
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    resizeStartY.current = e.clientY
    resizeStartHeight.current = height
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const delta = resizeStartY.current - e.clientY
      const newHeight = Math.max(180, Math.min(window.innerHeight - 150, resizeStartHeight.current + delta))
      onHeightChange?.(newHeight)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isResizing, onHeightChange])

  // Trace actions
  const toggleTrace = (name: string) => {
    setSelectedTraces((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name],
    )
    setCurrentProbedSignal(name)
    setIsProbedHudVisible(true)
  }

  const soloTrace = (name: string) => {
    setSelectedTraces([name])
    setCurrentProbedSignal(name)
    setIsProbedHudVisible(true)
  }

  const selectAllTraces = () => {
    setSelectedTraces(allAvailableTraces.map((t) => t.name))
  }

  const clearSelectedTraces = () => {
    setSelectedTraces([])
  }

  const resetZoom = () => {
    setViewXRange(null)
    setPaneYRanges({})
  }

  // Math traces management
  const handleAddMathTrace = (trace: MathTraceDefinition) => {
    setPlotSettings((prev) => ({
      ...prev,
      customMathTraces: [...prev.customMathTraces, trace],
    }))
    setSelectedTraces((prev) => (prev.includes(trace.name) ? prev : [...prev, trace.name]))
  }

  const handleRemoveMathTrace = (id: string) => {
    const target = plotSettings.customMathTraces.find((t) => t.id === id)
    setPlotSettings((prev) => ({
      ...prev,
      customMathTraces: prev.customMathTraces.filter((t) => t.id !== id),
    }))
    if (target) {
      setSelectedTraces((prev) => prev.filter((t) => t !== target.name))
    }
  }

  // Annotations management
  const handleAddAnnotation = (annotation: PlotAnnotation) => {
    setPlotSettings((prev) => ({
      ...prev,
      annotations: [...prev.annotations, annotation],
    }))
  }

  const handleRemoveAnnotation = (id: string) => {
    setPlotSettings((prev) => ({
      ...prev,
      annotations: prev.annotations.filter((a) => a.id !== id),
    }))
  }

  const handleClearAnnotations = () => {
    setPlotSettings((prev) => ({
      ...prev,
      annotations: [],
    }))
  }

  // Settings export/import
  const handleExportSettings = () => {
    exportPlotSettingsJson(plotSettings)
  }

  const handleImportSettingsClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        const loaded = await importPlotSettingsJson(file)
        setPlotSettings(loaded)
        alert("Plot configuration loaded successfully.")
      } catch (err: any) {
        alert("Failed to load plot settings: " + (err.message || String(err)))
      }
    }
    e.target.value = ""
  }

  // Monitor panel container resizing dynamically
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height: h } = entry.contentRect
        if (width > 0 && h > 0) {
          setContainerSize({ width, height: h })
        }
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Window control actions
  const handleToggleMinimize = () => {
    setIsMinimized((prev) => {
      const next = !prev
      if (next) {
        if (onToggleMaximize && isMaximized) {
          onToggleMaximize()
        } else {
          setInternalMaximized(false)
        }
      }
      return next
    })
  }

  const handleToggleMaximize = () => {
    if (onToggleMaximize) {
      onToggleMaximize()
    } else {
      setInternalMaximized((prev) => {
        const next = !prev
        if (next) setIsMinimized(false)
        return next
      })
    }
  }

  const handleHeaderDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return
    if (isMinimized) {
      setIsMinimized(false)
    } else {
      handleToggleMaximize()
    }
  }

  // -------------------------------------------------------------
  // CANVAS RENDERING ENGINE (Multi-Pane, Theme, Grid, Traces)
  // -------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const width = rect.width
    const heightPx = rect.height

    canvas.width = width * dpr
    canvas.height = heightPx * dpr
    ctx.scale(dpr, dpr)

    // Classic LTspice-style palette: white background, grey grid
    const palette = {
      appBg: "#ffffff",
      plotBg: "#ffffff",
      grid: "#cccccc",
      zeroLine: "#888888",
      axisText: "#000000",
      border: "#888888",
      crosshair: "rgba(0,0,0,0.5)",
    }

    // Outer viewer canvas background
    ctx.fillStyle = palette.appBg
    ctx.fillRect(0, 0, width, heightPx)

    // Layout margins for axes and tick labels
    const marginLeft = 70
    const hasAnyRight = Object.values(naturalPaneBounds).some((b) => b.hasRight)
    const marginRight = hasAnyRight ? 70 : 25
    const marginTop = 20
    const marginBottom = 34

    const plotW = Math.max(10, width - marginLeft - marginRight)
    const [xMin, xMax] = activeXRange

    // Coordinate transform: data X -> screen pixel X
    const xToScreen = (val: number): number => {
      if (useLogX && xMin > 0 && xMax > 0 && val > 0) {
        const logMin = Math.log10(xMin)
        const logMax = Math.log10(xMax)
        const norm = (Math.log10(val) - logMin) / (logMax - logMin)
        return marginLeft + norm * plotW
      }
      const norm = (val - xMin) / (xMax - xMin || 1)
      return marginLeft + norm * plotW
    }

    // Multi-pane vertical partitioning
    const panesCount = plotSettings.panesCount
    const paneGap = panesCount > 1 ? 14 : 0
    const totalPanesH = Math.max(10, heightPx - marginTop - marginBottom - (panesCount - 1) * paneGap)
    const paneH = totalPanesH / panesCount

    // Draw each pane
    for (let paneIdx = 0; paneIdx < panesCount; paneIdx++) {
      const paneTop = marginTop + paneIdx * (paneH + paneGap)
      const paneBounds = naturalPaneBounds[paneIdx] || {
        minLeftY: -1,
        maxLeftY: 5,
        hasLeft: true,
        minRightY: 0,
        maxRightY: 1,
        hasRight: false,
      }

      // Check for user-defined manual or zoom ranges on this pane
      const paneRangeOverride = paneYRanges[paneIdx]
      const yLeftMin = paneRangeOverride?.left ? paneRangeOverride.left[0] : paneBounds.minLeftY
      const yLeftMax = paneRangeOverride?.left ? paneRangeOverride.left[1] : paneBounds.maxLeftY

      const yRightMin = paneRangeOverride?.right ? paneRangeOverride.right[0] : paneBounds.minRightY
      const yRightMax = paneRangeOverride?.right ? paneRangeOverride.right[1] : paneBounds.maxRightY

      const yLeftToScreen = (val: number): number => {
        const norm = (val - yLeftMin) / (yLeftMax - yLeftMin || 1)
        return paneTop + (1 - norm) * paneH
      }

      const yRightToScreen = (val: number): number => {
        const norm = (val - yRightMin) / (yRightMax - yRightMin || 1)
        return paneTop + (1 - norm) * paneH
      }

      // 1. Pane Background
      ctx.fillStyle = palette.plotBg
      ctx.fillRect(marginLeft, paneTop, plotW, paneH)

      // 2. Horizontal Grid Lines & Y Tick Labels
      const numYDivs = 5
      ctx.font = "10px 'Segoe UI', Tahoma, Arial, sans-serif"

      for (let i = 0; i <= numYDivs; i++) {
        const frac = i / numYDivs
        const yVal = yLeftMin + frac * (yLeftMax - yLeftMin)
        const sy = paneTop + (1 - frac) * paneH

        // Grid line
        if (plotSettings.gridStyle !== "none") {
          ctx.beginPath()
          ctx.strokeStyle = palette.grid
          ctx.lineWidth = 1
          if (plotSettings.gridStyle === "dotted") ctx.setLineDash([2, 3])
          else if (plotSettings.gridStyle === "dashed") ctx.setLineDash([5, 4])
          else ctx.setLineDash([])

          ctx.moveTo(marginLeft, sy)
          ctx.lineTo(marginLeft + plotW, sy)
          ctx.stroke()
          ctx.setLineDash([])
        }

        // Left axis label
        ctx.fillStyle = palette.axisText
        ctx.textAlign = "right"
        ctx.textBaseline = "middle"
        const leftUnit = fftMode ? "dB" : isAcSweep && selectedTraces.some((t) => t.endsWith("_db")) ? "dB" : "V"
        ctx.fillText(formatEngineering(yVal, leftUnit), marginLeft - 8, sy)

        // Right axis label (Currents/Phase if present)
        if (paneBounds.hasRight && !fftMode) {
          const yRVal = yRightMin + frac * (yRightMax - yRightMin)
          ctx.fillStyle = "#38bdf8"
          ctx.textAlign = "left"
          const rUnit = selectedTraces.some((t) => t.endsWith("_phase")) ? "°" : "A"
          ctx.fillText(formatEngineering(yRVal, rUnit), marginLeft + plotW + 8, sy)
        }
      }

      // Zero-axis reference guide line (0V or 0A)
      if (yLeftMin < 0 && yLeftMax > 0 && !fftMode) {
        const zeroY = yLeftToScreen(0)
        ctx.beginPath()
        ctx.strokeStyle = palette.zeroLine
        ctx.setLineDash([4, 4])
        ctx.moveTo(marginLeft, zeroY)
        ctx.lineTo(marginLeft + plotW, zeroY)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // 3. Pane Label (if multi-pane)
      if (panesCount > 1) {
        ctx.fillStyle = "rgba(0,0,0,0.35)"
        ctx.font = "bold 9px 'Segoe UI', Tahoma, Arial, sans-serif"
        ctx.textAlign = "right"
        ctx.textBaseline = "top"
        ctx.fillText(`PANE ${paneIdx + 1}`, marginLeft + plotW - 6, paneTop + 6)
      }

      // 4. Pane Border
      ctx.strokeStyle = palette.border
      ctx.lineWidth = 1
      ctx.strokeRect(marginLeft, paneTop, plotW, paneH)

      // 5. Clip to this pane's area for trace and annotation rendering
      ctx.save()
      ctx.beginPath()
      ctx.rect(marginLeft, paneTop, plotW, paneH)
      ctx.clip()

      // Traces assigned to this pane
      selectedTraces.forEach((traceName, idx) => {
        const cfg = getTraceConfig(traceName, idx)
        if (cfg.visible === false) return
        const assignedPane = Math.min(panesCount - 1, Math.max(0, cfg.pane ?? 0))
        if (assignedPane !== paneIdx) return

        ctx.strokeStyle = cfg.color || TRACE_COLORS[idx % TRACE_COLORS.length]
        ctx.lineWidth = cfg.lineWidth || 2
        ctx.lineJoin = "round"

        if (cfg.lineStyle === "dashed") ctx.setLineDash([6, 4])
        else if (cfg.lineStyle === "dotted") ctx.setLineDash([2, 3])
        else ctx.setLineDash([])

        // Check if rendering FFT mode
        if (fftMode) {
          const fftRes = fftResultsMap[traceName]
          if (fftRes && fftRes.frequencies.length > 0) {
            ctx.beginPath()
            let started = false
            for (let fIdx = 0; fIdx < fftRes.frequencies.length; fIdx++) {
              const f = fftRes.frequencies[fIdx]
              const db = fftRes.magnitudesDb[fIdx]
              const px = xToScreen(f)
              const py = yLeftToScreen(db)

              if (!started) {
                ctx.moveTo(px, py)
                started = true
              } else {
                ctx.lineTo(px, py)
              }
            }
            ctx.stroke()
          }
          return
        }

        // Standard time-domain / frequency-domain trace
        const yArr = combinedDataMap[traceName] || combinedDataMap[traceName.toLowerCase()]
        if (!yArr || yArr.length === 0 || xData.length === 0) return

        const isRightAxis = traceName.startsWith("i(") || traceName.endsWith("_phase")
        const yFunc = isRightAxis ? yRightToScreen : yLeftToScreen

        ctx.beginPath()
        let started = false
        const len = Math.min(xData.length, yArr.length)

        for (let i = 0; i < len; i++) {
          const xv = xData[i]
          const yv = yArr[i]
          if (!isFinite(xv) || !isFinite(yv)) continue

          const px = xToScreen(xv)
          const py = yFunc(yv)

          if (!started) {
            ctx.moveTo(px, py)
            started = true
          } else {
            ctx.lineTo(px, py)
          }
        }
        ctx.stroke()

        // Subtle point dots for short sweeps
        if (len <= 40) {
          ctx.fillStyle = ctx.strokeStyle
          for (let i = 0; i < len; i++) {
            const px = xToScreen(xData[i])
            const py = yFunc(yArr[i])
            ctx.beginPath()
            ctx.arc(px, py, 3, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      })

      // 6. Draw Annotations assigned to this pane
      plotSettings.annotations.forEach((annot) => {
        if (annot.pane !== paneIdx) return
        const aColor = annot.color || "#f59e0b"

        if (annot.type === "refLineH") {
          // Horizontal reference line
          const sy = yLeftToScreen(annot.y)
          ctx.beginPath()
          ctx.strokeStyle = aColor
          ctx.lineWidth = 1.2
          ctx.setLineDash([4, 3])
          ctx.moveTo(marginLeft, sy)
          ctx.lineTo(marginLeft + plotW, sy)
          ctx.stroke()
          ctx.setLineDash([])

          if (annot.text) {
            ctx.fillStyle = aColor
            ctx.font = "bold 10px 'Segoe UI', sans-serif"
            ctx.textAlign = "left"
            ctx.textBaseline = "bottom"
            ctx.fillText(annot.text, marginLeft + 8, sy - 2)
          }
        } else if (annot.type === "refLineV") {
          // Vertical reference line
          const sx = xToScreen(annot.x)
          ctx.beginPath()
          ctx.strokeStyle = aColor
          ctx.lineWidth = 1.2
          ctx.setLineDash([4, 3])
          ctx.moveTo(sx, paneTop)
          ctx.lineTo(sx, paneTop + paneH)
          ctx.stroke()
          ctx.setLineDash([])

          if (annot.text) {
            ctx.fillStyle = aColor
            ctx.font = "bold 10px 'Segoe UI', sans-serif"
            ctx.textAlign = "left"
            ctx.textBaseline = "top"
            ctx.fillText(annot.text, sx + 4, paneTop + 6)
          }
        } else if (annot.type === "text") {
          // Text note badge
          const sx = xToScreen(annot.x)
          const sy = yLeftToScreen(annot.y)
          const label = annot.text || "Note"

          ctx.font = "bold 10.5px 'Segoe UI', sans-serif"
          const tw = ctx.measureText(label).width

          ctx.fillStyle = "rgba(15, 23, 42, 0.85)"
          ctx.fillRect(sx, sy - 14, tw + 10, 16)
          ctx.strokeStyle = aColor
          ctx.strokeRect(sx, sy - 14, tw + 10, 16)

          ctx.fillStyle = aColor
          ctx.textAlign = "left"
          ctx.textBaseline = "middle"
          ctx.fillText(label, sx + 5, sy - 6)
        } else if (annot.type === "arrow" && annot.x2 !== undefined && annot.y2 !== undefined) {
          // Arrow annotation
          const x1 = xToScreen(annot.x)
          const y1 = yLeftToScreen(annot.y)
          const x2 = xToScreen(annot.x2)
          const y2 = yLeftToScreen(annot.y2)

          ctx.strokeStyle = aColor
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()

          // Draw Arrowhead at (x2, y2)
          const angle = Math.atan2(y2 - y1, x2 - x1)
          const headLen = 8
          ctx.fillStyle = aColor
          ctx.beginPath()
          ctx.moveTo(x2, y2)
          ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6))
          ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6))
          ctx.closePath()
          ctx.fill()

          if (annot.text) {
            ctx.font = "bold 10px 'Segoe UI', sans-serif"
            ctx.fillStyle = aColor
            ctx.fillText(annot.text, x1 + 4, y1 - 4)
          }
        }
      })

      // Box Zoom selection preview within this pane
      if (isBoxZooming && boxZoomStart && boxZoomCurrent) {
        const bx = Math.min(boxZoomStart.x, boxZoomCurrent.x)
        const by = Math.min(boxZoomStart.y, boxZoomCurrent.y)
        const bw = Math.abs(boxZoomCurrent.x - boxZoomStart.x)
        const bh = Math.abs(boxZoomCurrent.y - boxZoomStart.y)

        ctx.fillStyle = "rgba(59, 130, 246, 0.18)"
        ctx.fillRect(bx, by, bw, bh)
        ctx.strokeStyle = "#3b82f6"
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        ctx.strokeRect(bx, by, bw, bh)
        ctx.setLineDash([])
      }

      ctx.restore()
    }

    // 7. Vertical X Grid Lines & Ticks (along bottom margin)
    const numXDivs = 8
    const totalPlotBottom = marginTop + totalPanesH + (panesCount - 1) * paneGap

    for (let i = 0; i <= numXDivs; i++) {
      const frac = i / numXDivs
      let xVal = xMin + frac * (xMax - xMin)
      let sx = marginLeft + frac * plotW

      if (useLogX && xMin > 0 && xMax > 0) {
        const logMin = Math.log10(xMin)
        const logMax = Math.log10(xMax)
        xVal = Math.pow(10, logMin + frac * (logMax - logMin))
        sx = xToScreen(xVal)
      }

      // Vertical grid lines across all panes
      if (plotSettings.gridStyle !== "none") {
        ctx.beginPath()
        ctx.strokeStyle = palette.grid
        ctx.lineWidth = 1
        if (plotSettings.gridStyle === "dotted") ctx.setLineDash([2, 3])
        else if (plotSettings.gridStyle === "dashed") ctx.setLineDash([5, 4])
        else ctx.setLineDash([])

        ctx.moveTo(sx, marginTop)
        ctx.lineTo(sx, totalPlotBottom)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // X tick label at bottom
      ctx.fillStyle = palette.axisText
      ctx.textAlign = "center"
      ctx.textBaseline = "top"
      ctx.fillText(formatEngineering(xVal, xUnit), sx, totalPlotBottom + 7)
    }

    // 8. Dual Cursors across all panes
    if (cursorsEnabled) {
      // Cursor 1 (Cyan)
      if (cursor1X !== null) {
        const c1ScreenX = xToScreen(cursor1X)
        ctx.strokeStyle = "#06b6d4"
        ctx.lineWidth = 1.5
        ctx.setLineDash([5, 3])
        ctx.beginPath()
        ctx.moveTo(c1ScreenX, marginTop)
        ctx.lineTo(c1ScreenX, totalPlotBottom)
        ctx.stroke()
        ctx.setLineDash([])

        // Top grab handle
        ctx.fillStyle = "#06b6d4"
        ctx.beginPath()
        ctx.arc(c1ScreenX, marginTop + 6, 5, 0, Math.PI * 2)
        ctx.fill()
      }

      // Cursor 2 (Amber)
      if (cursor2X !== null) {
        const c2ScreenX = xToScreen(cursor2X)
        ctx.strokeStyle = "#f59e0b"
        ctx.lineWidth = 1.5
        ctx.setLineDash([5, 3])
        ctx.beginPath()
        ctx.moveTo(c2ScreenX, marginTop)
        ctx.lineTo(c2ScreenX, totalPlotBottom)
        ctx.stroke()
        ctx.setLineDash([])

        // Bottom grab handle
        ctx.fillStyle = "#f59e0b"
        ctx.beginPath()
        ctx.arc(c2ScreenX, totalPlotBottom - 6, 5, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // 9. Mouse Tracking Crosshair
    if (
      mousePos &&
      mousePos.x >= marginLeft &&
      mousePos.x <= marginLeft + plotW &&
      mousePos.y >= marginTop &&
      mousePos.y <= totalPlotBottom &&
      !isBoxZooming &&
      !isPanning
    ) {
      ctx.strokeStyle = palette.crosshair
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.moveTo(mousePos.x, marginTop)
      ctx.lineTo(mousePos.x, totalPlotBottom)
      ctx.moveTo(marginLeft, mousePos.y)
      ctx.lineTo(marginLeft + plotW, mousePos.y)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [
    activeXRange,
    naturalPaneBounds,
    paneYRanges,
    selectedTraces,
    plotSettings,
    combinedDataMap,
    xData,
    useLogX,
    xUnit,
    isAcSweep,
    cursorsEnabled,
    cursor1X,
    cursor2X,
    isBoxZooming,
    boxZoomStart,
    boxZoomCurrent,
    isPanning,
    mousePos,
    fftMode,
    fftResultsMap,
    getTraceConfig,
  ])

  // Mouse event handlers for Zoom & Pan & Cursors
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const marginLeft = 70
    const hasAnyRight = Object.values(naturalPaneBounds).some((b) => b.hasRight)
    const marginRight = hasAnyRight ? 70 : 25
    const plotW = Math.max(10, rect.width - marginLeft - marginRight)

    // Check if clicking near Cursor 1 or Cursor 2
    if (cursorsEnabled && cursor1X !== null && cursor2X !== null) {
      const c1ScreenX =
        marginLeft + ((cursor1X - activeXRange[0]) / (activeXRange[1] - activeXRange[0] || 1)) * plotW
      const c2ScreenX =
        marginLeft + ((cursor2X - activeXRange[0]) / (activeXRange[1] - activeXRange[0] || 1)) * plotW

      if (Math.abs(x - c1ScreenX) < 12) {
        setActiveCursorDrag(1)
        return
      }
      if (Math.abs(x - c2ScreenX) < 12) {
        setActiveCursorDrag(2)
        return
      }
    }

    // Pan Tool Mode
    if (activeTool === "pan" || e.button === 1 || e.shiftKey) {
      setIsPanning(true)
      setPanStart({ x, y, xMin: activeXRange[0], xMax: activeXRange[1] })
      return
    }

    // Zoom Box Mode (Left Click)
    if (e.button === 0) {
      setIsBoxZooming(true)
      setBoxZoomStart({ x, y })
      setBoxZoomCurrent({ x, y })
    }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const marginLeft = 70
    const hasAnyRight = Object.values(naturalPaneBounds).some((b) => b.hasRight)
    const marginRight = hasAnyRight ? 70 : 25
    const plotW = Math.max(10, rect.width - marginLeft - marginRight)
    const norm = Math.max(0, Math.min(1, (x - marginLeft) / plotW))
    const currentDataX = activeXRange[0] + norm * (activeXRange[1] - activeXRange[0])

    setMousePos({ x, y, dataX: currentDataX, dataY: 0 })

    // Cursor Drag
    if (activeCursorDrag === 1) {
      setCursor1X(currentDataX)
      return
    }
    if (activeCursorDrag === 2) {
      setCursor2X(currentDataX)
      return
    }

    // Pan Dragging
    if (isPanning && panStart) {
      const dxPixels = x - panStart.x
      const span = panStart.xMax - panStart.xMin
      const dxData = -(dxPixels / plotW) * span
      setViewXRange([panStart.xMin + dxData, panStart.xMax + dxData])
      return
    }

    // Zoom Box Dragging
    if (isBoxZooming) {
      setBoxZoomCurrent({ x, y })
    }
  }

  const handleCanvasMouseUp = () => {
    if (activeCursorDrag) {
      setActiveCursorDrag(null)
      return
    }

    if (isPanning) {
      setIsPanning(false)
      setPanStart(null)
      return
    }

    if (isBoxZooming && boxZoomStart && boxZoomCurrent) {
      const dx = Math.abs(boxZoomCurrent.x - boxZoomStart.x)
      const dy = Math.abs(boxZoomCurrent.y - boxZoomStart.y)

      if (dx > 12 && dy > 12) {
        const canvas = canvasRef.current
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          const marginLeft = 70
          const hasAnyRight = Object.values(naturalPaneBounds).some((b) => b.hasRight)
          const marginRight = hasAnyRight ? 70 : 25
          const plotW = Math.max(10, rect.width - marginLeft - marginRight)

          const minBoxX = Math.min(boxZoomStart.x, boxZoomCurrent.x)
          const maxBoxX = Math.max(boxZoomStart.x, boxZoomCurrent.x)

          const normX0 = Math.max(0, Math.min(1, (minBoxX - marginLeft) / plotW))
          const normX1 = Math.max(0, Math.min(1, (maxBoxX - marginLeft) / plotW))

          const newXMin = activeXRange[0] + normX0 * (activeXRange[1] - activeXRange[0])
          const newXMax = activeXRange[0] + normX1 * (activeXRange[1] - activeXRange[0])

          setViewXRange([newXMin, newXMax])
        }
      }
    }

    setIsBoxZooming(false)
    setBoxZoomStart(null)
    setBoxZoomCurrent(null)
  }

  // Wheel zoom centered on cursor
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 0.8 : 1.25

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const marginLeft = 70
    const hasAnyRight = Object.values(naturalPaneBounds).some((b) => b.hasRight)
    const marginRight = hasAnyRight ? 70 : 25
    const plotW = Math.max(10, rect.width - marginLeft - marginRight)

    const norm = Math.max(0, Math.min(1, (x - marginLeft) / plotW))
    const centerVal = activeXRange[0] + norm * (activeXRange[1] - activeXRange[0])

    const halfSpan = ((activeXRange[1] - activeXRange[0]) * zoomFactor) / 2
    setViewXRange([centerVal - halfSpan, centerVal + halfSpan])
  }

  // Dual Cursors mathematical readout computations
  const cursorReadout = useMemo(() => {
    if (!cursorsEnabled || cursor1X === null || cursor2X === null) return null

    const dx = Math.abs(cursor2X - cursor1X)
    const invDx = dx > 1e-15 ? 1 / dx : 0

    // Primary trace measurement
    const primaryTrace = selectedTraces[0]
    let y1 = 0
    let y2 = 0
    let dy = 0
    let slope = 0

    if (primaryTrace) {
      const yArr = combinedDataMap[primaryTrace] || combinedDataMap[primaryTrace.toLowerCase()]
      if (yArr && xData.length > 0) {
        y1 = interpolateAtX(xData, yArr, cursor1X)
        y2 = interpolateAtX(xData, yArr, cursor2X)
        dy = y2 - y1
        slope = dx > 1e-15 ? dy / (cursor2X - cursor1X) : 0
      }
    }

    return {
      traceName: primaryTrace || "Trace",
      x1: cursor1X,
      y1,
      x2: cursor2X,
      y2,
      dx,
      invDx,
      dy,
      slope,
    }
  }, [cursorsEnabled, cursor1X, cursor2X, selectedTraces, combinedDataMap, xData])

  if (!isOpen) return null

  return (
    <section
      ref={containerRef}
      className={`waveform-panel ${isMaximized ? "maximized" : ""} ${isMinimized ? "minimized" : ""}`}
      style={{ height: isMaximized ? "100%" : isMinimized ? "38px" : `${height}px` }}
      aria-label="Interactive Waveform Viewer"
    >
      {/* Hidden file input for importing settings JSON */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* Resizing Handle Bar (Top Edge) */}
      {!isMaximized && !isMinimized && (
        <div
          className="waveform-resize-handle"
          onMouseDown={handleResizeMouseDown}
          title="Drag up/down to resize waveform panel"
        >
          <div className="resize-handle-bar" />
        </div>
      )}

      {/* Waveform Viewer Header Bar */}
      <header
        className="waveform-header"
        onDoubleClick={handleHeaderDoubleClick}
        title={isMinimized ? "Double-click to restore" : "Double-click to maximize/restore"}
      >
        <div className="waveform-header-left">
          <div className="waveform-title-badge">
            <span className="waveform-pulse-dot" />
            <span className="waveform-title">Waveform Viewer</span>
          </div>

          {isMinimized && (
            <span
              className="waveform-minimized-badge"
              onClick={handleToggleMinimize}
              title="Click to restore waveform viewer"
            >
              Minimized (Click to restore)
            </span>
          )}

          {simulationResult && !isMinimized && (
            <div className="waveform-meta-chips">
              <span className="waveform-chip waveform-chip-analysis">
                .{simulationResult.analysisType.toUpperCase()}
              </span>
              <span className="waveform-chip">
                {simulationResult.pointCount} pts
              </span>
              <span className="waveform-chip">
                {simulationResult.elapsedMs}ms
              </span>
            </div>
          )}
        </div>

        {/* Toolbar Controls */}
        <div className="waveform-header-actions">
          {/* Pan Tool vs Zoom Tool */}
          <button
            className={`waveform-tool-btn ${activeTool === "zoom" ? "active" : ""}`}
            onClick={() => setActiveTool("zoom")}
            title="Box Zoom Tool (Click and drag box to zoom)"
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <ZoomIn size={13} />
              {t('waveformToolbar.zoom')}
            </span>
          </button>

          <button
            className={`waveform-tool-btn ${activeTool === "pan" ? "active" : ""}`}
            onClick={() => setActiveTool("pan")}
            title="Pan Tool (Click and drag canvas to move viewport)"
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Move size={13} />
              {t('waveformToolbar.pan')}
            </span>
          </button>

          {/* Autoscale / Fit */}
          <button
            className="waveform-tool-btn"
            onClick={resetZoom}
            title="Autoscale / Fit all waveforms to view (Home)"
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Maximize2 size={13} />
              {t('waveformToolbar.fit')}
            </span>
          </button>

          <div className="waveform-header-divider" />

          {/* Probe Wire / Node Dropdown */}
          <div className="waveform-probe-dropdown-container" ref={probeDropdownRef}>
            <button
              className={`waveform-tool-btn ${isNetDropdownOpen ? "active" : ""}`}
              onClick={() => setIsNetDropdownOpen(!isNetDropdownOpen)}
              title="Select a circuit wire or node to plot and calculate its values on the graph"
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Crosshair size={13} style={{ color: "#0284c7" }} />
                <span>Probe Node/Wire</span>
                <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
              </span>
            </button>

            {isNetDropdownOpen && (
              <div className="waveform-probe-menu dropdown-menu">
                <input
                  type="text"
                  className="waveform-probe-search-input"
                  placeholder="Filter nodes or wires..."
                  value={netSearchQuery}
                  onChange={(e) => setNetSearchQuery(e.target.value)}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />

                <div className="waveform-probe-menu-section-title">Circuit Nets & Wires</div>
                {filteredAvailableNets.map((net) => {
                  const isProbed =
                    activeProbedTrace?.toLowerCase() === net.signalName.toLowerCase() ||
                    activeProbedTrace?.toLowerCase() === net.netName.toLowerCase()
                  return (
                    <button
                      key={net.netName}
                      className={`waveform-probe-menu-item ${isProbed ? "active" : ""}`}
                      onClick={() => handleSelectNet(net)}
                    >
                      <span>
                        <strong>{net.displayName}</strong>
                        {net.connectedComponents.length > 0 && (
                          <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.8 }}>
                            ({net.connectedComponents.slice(0, 3).join(", ")})
                          </span>
                        )}
                      </span>
                      <span className="probe-item-sub">
                        {net.pinCount} {net.pinCount === 1 ? "pin" : "pins"}
                      </span>
                    </button>
                  )
                })}

                {filteredAvailableNets.length === 0 && (
                  <div style={{ padding: "6px 8px", fontSize: 11, opacity: 0.6 }}>
                    No matching nets found
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Interactive Schematic Probe Mode Toggle */}
          <button
            className={`waveform-tool-btn ${isProbeToolActive ? "active probe-mode-active" : ""}`}
            onClick={onToggleProbeTool}
            title="Toggle Schematic Probe Mode (P): Click any wire or node directly on the schematic to plot and calculate its values"
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 12 }}>🎯</span>
              <span>{isProbeToolActive ? "Probe: Active" : "Probe Tool (P)"}</span>
            </span>
          </button>

          <div className="waveform-header-divider" />

          {/* Cursors Toggle */}
          <button
            className={`waveform-tool-btn ${cursorsEnabled ? "active" : ""}`}
            onClick={() => setCursorsEnabled(!cursorsEnabled)}
            title="Toggle Dual Cursors with Delta Measurements (ΔX, ΔY, 1/ΔX, Slope)"
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Crosshair size={13} />
              {t('waveformToolbar.cursors')}
            </span>
          </button>

          {/* FFT Spectrum Toggle */}
          <button
            className={`waveform-tool-btn ${fftMode ? "active" : ""}`}
            onClick={() => setFftMode(!fftMode)}
            title="Toggle Fast Fourier Transform (FFT) Power Spectrum View (dB vs Hz)"
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Activity size={13} />
              {t('waveformToolbar.fft')}
            </span>
          </button>

          <div className="waveform-header-divider" />

          {/* Single Consolidated Settings Section */}
          <button
            className="waveform-tool-btn"
            style={{ fontWeight: 700 }}
            onClick={() => {
              setSettingsModalTab("traces")
              setSettingsModalOpen(true)
            }}
            title="Open Waveform Plot Settings (Traces, Axes, Appearance, Math Expressions, Annotations, Export)"
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Settings size={13} />
              {t('waveformToolbar.plotSettings')}
            </span>
          </button>

          {/* Clear Plot */}
          <button
            className="waveform-tool-btn danger"
            onClick={() => {
              clearSelectedTraces()
              onClear()
            }}
            title="Clear all waveforms"
          >
            <span>{t('waveformToolbar.clear')}</span>
          </button>

          <div className="waveform-header-divider" />

          {/* Classic Windows Title Bar Control Buttons: Minimize, Maximize/Restore, Close */}
          <div className="waveform-window-controls" role="group" aria-label="Window Controls">
            <button
              className={`waveform-win-btn ${isMinimized ? "active" : ""}`}
              onClick={handleToggleMinimize}
              title={isMinimized ? t('waveformToolbar.restore') : t('waveformToolbar.minimize')}
              aria-label={isMinimized ? t('waveformToolbar.restore') : t('waveformToolbar.minimize')}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <line x1="1" y1="8" x2="9" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            <button
              className={`waveform-win-btn ${isMaximized ? "active" : ""}`}
              onClick={handleToggleMaximize}
              title={isMaximized ? t('waveformToolbar.restore') : t('waveformToolbar.maximize')}
              aria-label={isMaximized ? t('waveformToolbar.restore') : t('waveformToolbar.maximize')}
            >
              {isMaximized ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M3.5 1.5H8.5V6.5" stroke="currentColor" strokeWidth="1.2" />
                  <rect x="1.5" y="3.5" width="5" height="5" stroke="currentColor" strokeWidth="1.2" fill="none" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <rect x="1.5" y="1.5" width="7" height="7" stroke="currentColor" strokeWidth="1.2" fill="none" />
                </svg>
              )}
            </button>

            <button
              className="waveform-win-btn win-close"
              onClick={onClose}
              title={t('waveformToolbar.closeTooltip')}
              aria-label="Close"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Plot Body */}
      <div className="waveform-body-container" style={{ display: isMinimized ? "none" : "flex" }}>
        {/* Left / Top: Interactive Trace Selectors */}
        {/* Left / Top: Folder-based Signal Selector Bar */}
        <div className="waveform-trace-bar">
          {/* Active Plotted Trace Chips */}
          <div className="trace-chips-scroll">
            {selectedTraces.map((traceName) => {
              const traceMeta = allAvailableTraces.find((t) => t.name.toLowerCase() === traceName.toLowerCase())
              const idx = allAvailableTraces.findIndex((t) => t.name.toLowerCase() === traceName.toLowerCase())
              const cfg = getTraceConfig(traceName, idx >= 0 ? idx : 0)
              const color = cfg.color || TRACE_COLORS[0]
              const isProbed = activeProbedTrace?.toLowerCase() === traceName.toLowerCase()
              const isCurrent = traceName.toLowerCase().startsWith("i(") || traceMeta?.unit === "A"

              return (
                <div
                  key={traceName}
                  className={`trace-chip selected ${isProbed ? "probed" : ""}`}
                  onClick={() => {
                    setCurrentProbedSignal(traceName)
                    setIsProbedHudVisible(true)
                  }}
                  title={`Active trace ${traceName.toUpperCase()} (${isCurrent ? "Current A" : "Voltage V"}). Click to calculate on HUD.`}
                >
                  <span className="trace-color-dot" style={{ background: color }} />
                  <span className="trace-chip-name">
                    {isProbed ? `🎯 ${traceName.toUpperCase()}` : traceName.toUpperCase()}
                  </span>
                  <span className="trace-chip-unit">{traceMeta?.unit || (isCurrent ? "A" : "V")}</span>
                  {cfg.pane !== undefined && plotSettings.panesCount > 1 && (
                    <span style={{ fontSize: "9px", background: "rgba(255,255,255,0.15)", padding: "0 3px", borderRadius: "2px" }}>
                      P{cfg.pane + 1}
                    </span>
                  )}
                  <button
                    className="trace-chip-remove"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleTrace(traceName)
                    }}
                    title={`Unplot ${traceName.toUpperCase()}`}
                  >
                    ✕
                  </button>
                </div>
              )
            })}

            {selectedTraces.length === 0 && (
              <span className="no-traces-hint" style={{ fontSize: 11, color: "#666666" }}>
                Probe nets or components on the schematic to plot waveforms
              </span>
            )}
          </div>
        </div>

        {/* Center: Canvas Oscilloscope Viewport */}
        <div className="waveform-canvas-viewport">
          {simulationResult && simulationResult.pointCount > 0 ? (
            <canvas
              ref={canvasRef}
              className="waveform-canvas"
              style={{ cursor: activeTool === "pan" ? "grab" : "crosshair" }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={() => {
                setMousePos(null)
                if (isBoxZooming) setIsBoxZooming(false)
                if (isPanning) setIsPanning(false)
                if (activeCursorDrag) setActiveCursorDrag(null)
              }}
              onDoubleClick={resetZoom}
              onWheel={handleWheel}
            />
          ) : (
            <div className="waveform-empty-state">
              <div className="empty-state-icon" style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                <Zap size={36} strokeWidth={1.5} color="var(--accent, #38bdf8)" />
              </div>
              <div className="empty-state-title">{t('waveformToolbar.noDataTitle')}</div>
              <div className="empty-state-subtitle">
                <Trans
                  i18nKey="waveformToolbar.noDataSubtitle"
                  components={{ strong: <strong /> }}
                />
              </div>
            </div>
          )}

          {/* Interactive Probed Node / Wire Calculated Values HUD Overlay (Top-Left) */}
          {isProbedHudVisible && activeProbedTrace && probedReport && probedKeyMetrics && (
            <div className={`waveform-node-calc-hud ${isProbedHudCollapsed ? "collapsed" : ""}`}>
              <div className="node-hud-header">
                <div className="node-hud-title-wrap">
                  <span className="node-hud-dot" style={{ background: activeProbedTraceColor }} />
                  <span className="node-hud-title" title={`Signal: ${activeProbedTrace}`}>
                    🎯 {activeProbedTrace.toUpperCase()}
                  </span>
                  {matchedNetInfo && (
                    <span
                      className="node-hud-net-badge"
                      title={`Net: ${matchedNetInfo.netName} (${matchedNetInfo.pinCount} pins: ${matchedNetInfo.connectedComponents.join(", ")})`}
                    >
                      {matchedNetInfo.netName} ({matchedNetInfo.pinCount}p)
                    </span>
                  )}
                </div>

                <div className="node-hud-controls">
                  <button
                    className="node-hud-btn"
                    onClick={() => setIsProbedHudCollapsed(!isProbedHudCollapsed)}
                    title={isProbedHudCollapsed ? "Expand Calculated Values" : "Collapse HUD"}
                  >
                    {isProbedHudCollapsed ? "▼" : "▲"}
                  </button>
                  <button
                    className="node-hud-btn"
                    onClick={() => setIsProbedHudVisible(false)}
                    title="Dismiss Calculated Values HUD"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {!isProbedHudCollapsed && (
                <>
                  <div className="node-hud-metrics-grid">
                    <div className="node-hud-metric-item">
                      <span className="node-hud-metric-label">Vp-p</span>
                      <span className="node-hud-metric-val highlight-vpp">{probedKeyMetrics.vpp}</span>
                    </div>
                    <div className="node-hud-metric-item">
                      <span className="node-hud-metric-label">Vmax</span>
                      <span className="node-hud-metric-val">{probedKeyMetrics.vmax}</span>
                    </div>
                    <div className="node-hud-metric-item">
                      <span className="node-hud-metric-label">Vmin</span>
                      <span className="node-hud-metric-val">{probedKeyMetrics.vmin}</span>
                    </div>
                    <div className="node-hud-metric-item">
                      <span className="node-hud-metric-label">Vavg (DC)</span>
                      <span className="node-hud-metric-val">{probedKeyMetrics.vavg}</span>
                    </div>
                    <div className="node-hud-metric-item">
                      <span className="node-hud-metric-label">Vrms</span>
                      <span className="node-hud-metric-val">{probedKeyMetrics.vrms}</span>
                    </div>
                    {probedKeyMetrics.freq && probedKeyMetrics.freq !== "N/A" && (
                      <div className="node-hud-metric-item">
                        <span className="node-hud-metric-label">Frequency</span>
                        <span className="node-hud-metric-val">{probedKeyMetrics.freq}</span>
                      </div>
                    )}
                    {probedKeyMetrics.period && probedKeyMetrics.period !== "N/A" && (
                      <div className="node-hud-metric-item">
                        <span className="node-hud-metric-label">Period</span>
                        <span className="node-hud-metric-val">{probedKeyMetrics.period}</span>
                      </div>
                    )}
                    {instantaneousProbedVal && (
                      <div className="node-hud-metric-item">
                        <span className="node-hud-metric-label">V(cursor)</span>
                        <span className="node-hud-metric-val highlight-cursor">{instantaneousProbedVal}</span>
                      </div>
                    )}
                  </div>

                  <div className="node-hud-footer">
                    {matchedNetInfo && (
                      <button
                        className="node-hud-action-btn"
                        onClick={() => onHighlightNet?.(matchedNetInfo.netName)}
                        title="Highlight this net and its wires in the schematic canvas"
                      >
                        Highlight Wire
                      </button>
                    )}
                    <span style={{ fontSize: 9, opacity: 0.65 }}>
                      {probedReport.pointCount} pts · {probedReport.analysisType}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Interactive Dual Cursor Readout HUD Overlay */}
          {cursorsEnabled && cursorReadout && (
            <div className="waveform-cursor-hud">
              <div className="hud-header">
                <span className="hud-title">{t('waveformToolbar.cursorsReadout', { trace: cursorReadout.traceName.toUpperCase() })}</span>
              </div>
              <div className="hud-grid">
                <div className="hud-col cursor-1">
                  <span className="hud-label">{t('waveformToolbar.cursor1')}</span>
                  <span className="hud-val">X₁: {formatEngineering(cursorReadout.x1, xUnit)}</span>
                  <span className="hud-val">Y₁: {formatEngineering(cursorReadout.y1, "V")}</span>
                </div>
                <div className="hud-col cursor-2">
                  <span className="hud-label">{t('waveformToolbar.cursor2')}</span>
                  <span className="hud-val">X₂: {formatEngineering(cursorReadout.x2, xUnit)}</span>
                  <span className="hud-val">Y₂: {formatEngineering(cursorReadout.y2, "V")}</span>
                </div>
                <div className="hud-col delta">
                  <span className="hud-label">{t('waveformToolbar.delta')}</span>
                  <span className="hud-val">ΔX: {formatEngineering(cursorReadout.dx, xUnit)}</span>
                  <span className="hud-val">ΔY: {formatEngineering(cursorReadout.dy, "V")}</span>
                  {xUnit === "s" && cursorReadout.invDx > 0 && (
                    <span className="hud-val f-val">
                      1/ΔX: {formatEngineering(cursorReadout.invDx, "Hz")}
                    </span>
                  )}
                  {cursorReadout.slope !== 0 && (
                    <span className="hud-val">
                      {t('waveformToolbar.slope')} {formatEngineering(cursorReadout.slope, "V/s")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Hover Crosshair Coordinates Badge (Bottom-Right) */}
          {mousePos && (
            <div className="waveform-coords-badge">
              <span>X: {formatEngineering(mousePos.dataX, xUnit)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Unified Waveform Plot Settings & Tools Modal */}
      {settingsModalOpen && (
        <WaveformSettingsModal
          simulationResult={simulationResult}
          isOpen={settingsModalOpen}
          onClose={() => setSettingsModalOpen(false)}
          initialTab={settingsModalTab}
          plotSettings={plotSettings}
          onUpdatePlotSettings={setPlotSettings}
          allAvailableTraces={allAvailableTraces}
          selectedTraces={selectedTraces}
          onToggleTrace={toggleTrace}
          onSoloTrace={soloTrace}
          onSelectAllTraces={selectAllTraces}
          onClearTraces={clearSelectedTraces}
          xVarName={xVarName}
          xUnit={xUnit}
          xData={xData}
          combinedDataMap={combinedDataMap}
          activeXRange={activeXRange}
          naturalXRange={[naturalXBounds.minX, naturalXBounds.maxX]}
          naturalPaneBounds={naturalPaneBounds}
          useLogX={useLogX}
          onApplyAxisLimits={(limits) => {
            if (limits.xRange) setViewXRange(limits.xRange)
            if (limits.yLeftRange || limits.yRightRange) {
              setPaneYRanges((prev) => ({
                ...prev,
                0: { left: limits.yLeftRange, right: limits.yRightRange },
              }))
            }
            setUseLogX(limits.useLogX)
          }}
          onResetAutoAxes={resetZoom}
          onAddMathTrace={handleAddMathTrace}
          onRemoveMathTrace={handleRemoveMathTrace}
          onAddAnnotation={handleAddAnnotation}
          onRemoveAnnotation={handleRemoveAnnotation}
          onClearAnnotations={handleClearAnnotations}
          canvasRef={canvasRef}
          onExportSettings={handleExportSettings}
          onImportSettingsClick={handleImportSettingsClick}
        />
      )}
    </section>
  )
}

export default WaveformViewer

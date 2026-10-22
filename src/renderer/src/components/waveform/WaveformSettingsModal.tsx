import React, { useState, useMemo } from "react"
import { useTranslation } from "react-i18next"
import {
  Settings,
  X,
  Palette,
  Sliders,
  Eye,
  EyeOff,
  Tag,
  BarChart2,
  Download,
  Crosshair,
  FileText,
  FileSpreadsheet,
  Camera,
  Save,
  FolderOpen,
  Check,
  AlertTriangle,
} from "lucide-react"
import type { SimulationRunResult } from "../../../../shared/simulation"
import AutomaticMeasurementsPanel from "../AutomaticMeasurementsPanel"
import type {
  PlotSettings,
  PlotTheme,
  GridStyle,
  TraceConfig,
  PlotAnnotation,
} from "../../utils/waveformSettings"
import type { MathTraceDefinition } from "../../utils/waveformMath"
import { evaluateWaveformExpression } from "../../utils/waveformMath"
import { exportWaveformCsv, exportWaveformPng } from "../../utils/waveformExport"
import { formatEngineering } from "../../utils/engineeringFormat"
import { PALETTE_COLORS } from "./TraceConfigModal"

export type WaveformSettingsTab = "traces" | "axes" | "appearance" | "math" | "annotations" | "measurements" | "export"

export interface WaveformSettingsModalProps {
  simulationResult: SimulationRunResult | null
  isOpen: boolean
  onClose: () => void
  initialTab?: WaveformSettingsTab
  plotSettings: PlotSettings
  onUpdatePlotSettings: (updater: (prev: PlotSettings) => PlotSettings) => void
  allAvailableTraces: Array<{ name: string; type: string; unit: string; isMath?: boolean }>
  selectedTraces: string[]
  onToggleTrace: (name: string) => void
  onSoloTrace: (name: string) => void
  onSelectAllTraces: () => void
  onClearTraces: () => void
  xVarName: string
  xUnit: string
  xData: number[]
  combinedDataMap: Record<string, number[]>
  activeXRange: [number, number]
  naturalXRange: [number, number]
  naturalPaneBounds: Record<
    number,
    { minLeftY: number; maxLeftY: number; hasLeft: boolean; minRightY: number; maxRightY: number; hasRight: boolean }
  >
  useLogX: boolean
  onApplyAxisLimits: (limits: {
    xRange: [number, number] | null
    yLeftRange: [number, number] | null
    yRightRange: [number, number] | null
    useLogX: boolean
  }) => void
  onResetAutoAxes: () => void
  onAddMathTrace: (trace: MathTraceDefinition) => void
  onRemoveMathTrace: (id: string) => void
  onAddAnnotation: (annot: PlotAnnotation) => void
  onRemoveAnnotation: (id: string) => void
  onClearAnnotations: () => void
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  onExportSettings: () => void
  onImportSettingsClick: () => void
}

export const WaveformSettingsModal: React.FC<WaveformSettingsModalProps> = ({
  simulationResult,
  isOpen,
  onClose,
  initialTab = "traces",
  plotSettings,
  onUpdatePlotSettings,
  allAvailableTraces,
  selectedTraces,
  onToggleTrace,
  onSoloTrace,
  onSelectAllTraces,
  onClearTraces,
  xVarName,
  xUnit,
  xData,
  combinedDataMap,
  activeXRange,
  naturalXRange,
  naturalPaneBounds,
  useLogX,
  onApplyAxisLimits,
  onResetAutoAxes,
  onAddMathTrace,
  onRemoveMathTrace,
  onAddAnnotation,
  onRemoveAnnotation,
  onClearAnnotations,
  canvasRef,
  onExportSettings,
  onImportSettingsClick,
}) => {
  const { t } = useTranslation(['waveform', 'common'])
  const [activeTab, setActiveTab] = useState<WaveformSettingsTab>(initialTab)

  // --- Traces Tab State ---
  const [activeTraceName, setActiveTraceName] = useState<string>(allAvailableTraces[0]?.name || "")
  const activeTrace = allAvailableTraces.find((t) => t.name === activeTraceName) || allAvailableTraces[0]
  const currentTraceConfig = (activeTrace && plotSettings.traceConfigs[activeTrace.name]) || {}
  const isTraceSelected = activeTrace ? selectedTraces.includes(activeTrace.name) : false

  const updateTraceConfig = (name: string, config: Partial<TraceConfig>) => {
    onUpdatePlotSettings((prev) => ({
      ...prev,
      traceConfigs: {
        ...prev.traceConfigs,
        [name]: {
          ...(prev.traceConfigs[name] || {}),
          ...config,
        },
      },
    }))
  }

  // --- Axes Tab State ---
  const [isXAuto, setIsXAuto] = useState(false)
  const [xMinStr, setXMinStr] = useState(activeXRange[0].toString())
  const [xMaxStr, setXMaxStr] = useState(activeXRange[1].toString())

  const [isYLeftAuto, setIsYLeftAuto] = useState(false)
  const [yLeftMinStr, setYLeftMinStr] = useState((naturalPaneBounds[0]?.minLeftY ?? -1).toString())
  const [yLeftMaxStr, setYLeftMaxStr] = useState((naturalPaneBounds[0]?.maxLeftY ?? 5).toString())

  const [isYRightAuto, setIsYRightAuto] = useState(false)
  const [yRightMinStr, setYRightMinStr] = useState((naturalPaneBounds[0]?.minRightY ?? 0).toString())
  const [yRightMaxStr, setYRightMaxStr] = useState((naturalPaneBounds[0]?.maxRightY ?? 1).toString())

  const [logX, setLogX] = useState(useLogX)

  const handleApplyLimits = () => {
    const xMin = parseFloat(xMinStr)
    const xMax = parseFloat(xMaxStr)
    const yLMin = parseFloat(yLeftMinStr)
    const yLMax = parseFloat(yLeftMaxStr)
    const yRMin = parseFloat(yRightMinStr)
    const yRMax = parseFloat(yRightMaxStr)

    const newXRange: [number, number] | null =
      isXAuto || isNaN(xMin) || isNaN(xMax) || xMin >= xMax ? null : [xMin, xMax]

    const newYLeftRange: [number, number] | null =
      isYLeftAuto || isNaN(yLMin) || isNaN(yLMax) || yLMin >= yLMax ? null : [yLMin, yLMax]

    const newYRightRange: [number, number] | null =
      isYRightAuto || isNaN(yRMin) || isNaN(yRMax) || yRMin >= yRMax ? null : [yRMin, yRMax]

    onApplyAxisLimits({
      xRange: newXRange,
      yLeftRange: newYLeftRange,
      yRightRange: newYRightRange,
      useLogX: logX,
    })
  }

  // --- Math Tab State ---
  const [mathExpr, setMathExpr] = useState("")
  const [mathName, setMathName] = useState("")
  const [mathColor, setMathColor] = useState(PALETTE_COLORS[2])
  const [mathPane, setMathPane] = useState(0)

  const evalResult = useMemo(() => {
    if (!mathExpr.trim()) return null
    return evaluateWaveformExpression(mathExpr, combinedDataMap, xVarName)
  }, [mathExpr, combinedDataMap, xVarName])

  const handleInsertSignal = (sig: string) => {
    setMathExpr((prev) => prev + sig)
    if (!mathName) setMathName(mathExpr + sig)
  }

  const handleInsertOperator = (op: string) => {
    if (op === "abs()") setMathExpr((p) => p + "abs()")
    else if (op === "d()/dt") setMathExpr((p) => p + "d()/dt")
    else if (op === "integ()") setMathExpr((p) => p + "integ()")
    else if (op === "sqrt()") setMathExpr((p) => p + "sqrt()")
    else if (op === "log10()") setMathExpr((p) => p + "log10()")
    else setMathExpr((p) => p + ` ${op} `)
  }

  const handleAddNewMathTrace = () => {
    if (!evalResult || !evalResult.success) return
    const id = `math_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const finalName = mathName.trim() || mathExpr.trim()

    onAddMathTrace({
      id,
      name: finalName,
      expression: mathExpr.trim(),
      color: mathColor,
      lineWidth: 2,
      lineStyle: "solid",
      paneIndex: mathPane,
      unit: evalResult.unit || "V",
    })

    setMathExpr("")
    setMathName("")
  }

  // --- Annotations Tab State ---
  const [annotType, setAnnotType] = useState<"text" | "refLineH" | "refLineV" | "arrow">("text")
  const [annotX, setAnnotX] = useState((activeXRange[0] + (activeXRange[1] - activeXRange[0]) * 0.5).toString())
  const [annotY, setAnnotY] = useState("0")
  const [annotX2, setAnnotX2] = useState((activeXRange[0] + (activeXRange[1] - activeXRange[0]) * 0.6).toString())
  const [annotY2, setAnnotY2] = useState("1")
  const [annotText, setAnnotText] = useState("")
  const [annotColor, setAnnotColor] = useState("#f59e0b")
  const [annotPane, setAnnotPane] = useState(0)

  const handleAddNewAnnotation = () => {
    const x = parseFloat(annotX)
    const y = parseFloat(annotY)
    if (isNaN(x) || isNaN(y)) {
      alert("Please enter valid numeric X and Y coordinates.")
      return
    }

    const id = `annot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const newAnnot: PlotAnnotation = {
      id,
      type: annotType,
      pane: annotPane,
      x,
      y,
      text: annotText.trim(),
      color: annotColor,
    }

    if (annotType === "arrow") {
      newAnnot.x2 = parseFloat(annotX2) || x
      newAnnot.y2 = parseFloat(annotY2) || y
    }

    onAddAnnotation(newAnnot)
    setAnnotText("")
  }

  if (!isOpen) return null

  return (
    <div className="wf-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="wf-modal-window" onClick={(e) => e.stopPropagation()} style={{ width: "660px", maxWidth: "95vw" }}>
        {/* Header */}
        <div className="wf-modal-header">
          <div className="wf-modal-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Settings size={16} />
            {t('waveform:modalTitle')}
          </div>
          <button className="wf-modal-close" onClick={onClose} title={t('common:actions.close')} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} />
          </button>
        </div>

        {/* Tab Navigation Strip */}
        <div className="cfg-analysis-win-tabs" style={{ background: "#ebebeb", borderBottom: "1px solid #c0c0c0", padding: "4px 8px 0 8px" }}>
          <button
            type="button"
            className={`cfg-analysis-win-tab ${activeTab === "traces" ? "active" : ""}`}
            onClick={() => setActiveTab("traces")}
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <Palette size={13} />
            {t('waveform:tabs.traces')}
          </button>
          <button
            type="button"
            className={`cfg-analysis-win-tab ${activeTab === "axes" ? "active" : ""}`}
            onClick={() => setActiveTab("axes")}
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <Sliders size={13} />
            {t('waveform:tabs.axes')}
          </button>
          <button
            type="button"
            className={`cfg-analysis-win-tab ${activeTab === "appearance" ? "active" : ""}`}
            onClick={() => setActiveTab("appearance")}
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <Eye size={13} />
            {t('waveform:tabs.appearance')}
          </button>
          <button
            type="button"
            className={`cfg-analysis-win-tab ${activeTab === "math" ? "active" : ""}`}
            onClick={() => setActiveTab("math")}
          >
            𝑓(𝑥) {t('waveform:tabs.math')}
          </button>
          <button
            type="button"
            className={`cfg-analysis-win-tab ${activeTab === "annotations" ? "active" : ""}`}
            onClick={() => setActiveTab("annotations")}
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <Tag size={13} />
            {t('waveform:tabs.annotations')}
          </button>
          <button
            type="button"
            className={`cfg-analysis-win-tab ${activeTab === "measurements" ? "active" : ""}`}
            onClick={() => setActiveTab("measurements")}
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <BarChart2 size={13} />
            {t('waveform:tabs.measurements')}
          </button>
          <button
            type="button"
            className={`cfg-analysis-win-tab ${activeTab === "export" ? "active" : ""}`}
            onClick={() => setActiveTab("export")}
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <Download size={13} />
            {t('waveform:tabs.export')}
          </button>
        </div>

        {/* Modal Tab Body */}
        <div className="wf-modal-body" style={{ minHeight: "360px", padding: "16px" }}>
          {/* TAB 1: TRACES & COLORS */}
          {activeTab === "traces" && (
            <div style={{ display: "flex", gap: "16px" }}>
              {/* Left: Signals List */}
              <div style={{ width: "230px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>
                    {t('waveform:traces.availableSignals')}
                  </span>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button type="button" className="wf-mini-btn" onClick={onSelectAllTraces}>{t('waveform:traces.all')}</button>
                    <button type="button" className="wf-mini-btn" onClick={onClearTraces}>{t('waveform:traces.none')}</button>
                  </div>
                </div>

                <div className="wf-trace-list-box" style={{ height: "270px" }}>
                  {allAvailableTraces.map((tr, idx) => {
                    const trCfg = plotSettings.traceConfigs[tr.name] || {}
                    const isTrSelected = selectedTraces.includes(tr.name)
                    const color = trCfg.color || PALETTE_COLORS[idx % PALETTE_COLORS.length]
                    const isActive = tr.name === activeTraceName

                    return (
                      <div
                        key={tr.name}
                        className={`wf-trace-list-item ${isActive ? "active" : ""}`}
                        onClick={() => setActiveTraceName(tr.name)}
                      >
                        <input
                          type="checkbox"
                          checked={isTrSelected}
                          onChange={() => onToggleTrace(tr.name)}
                          onClick={(e) => e.stopPropagation()}
                          title="Show / Hide on plot"
                        />
                        <span className="wf-color-swatch-sm" style={{ background: color }} />
                        <span className="wf-trace-item-name">{tr.name.toUpperCase()}</span>
                        {trCfg.pane !== undefined && plotSettings.panesCount > 1 && (
                          <span className="wf-pane-tag">P{trCfg.pane + 1}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Right: Selected Trace Customizer */}
              {activeTrace ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #cbd5e1", paddingBottom: "6px" }}>
                    <div>
                      <strong style={{ fontSize: "14px", color: "#0f172a" }}>{activeTrace.name.toUpperCase()}</strong>
                      <span style={{ fontSize: "11px", color: "#64748b", marginLeft: "6px" }}>({activeTrace.unit || "V"})</span>
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        className={`wf-action-btn ${isTraceSelected ? "active" : ""}`}
                        onClick={() => onToggleTrace(activeTrace.name)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                      >
                        {isTraceSelected ? (
                          <>
                            <Eye size={13} />
                            <span>Visible</span>
                          </>
                        ) : (
                          <>
                            <EyeOff size={13} />
                            <span>Hidden</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        className="wf-action-btn"
                        onClick={() => onSoloTrace(activeTrace.name)}
                        title="Isolate this trace (solo)"
                        style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                      >
                        <Crosshair size={13} />
                        <span>Solo</span>
                      </button>
                    </div>
                  </div>

                  {/* Color Picker */}
                  <div className="wf-field-group">
                    <label className="wf-field-label">{t('waveform:traces.color')}:</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "6px" }}>
                      {PALETTE_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`wf-palette-btn ${currentTraceConfig.color === c ? "selected" : ""}`}
                          style={{ background: c }}
                          onClick={() => updateTraceConfig(activeTrace.name, { color: c })}
                          title={c}
                        />
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="color"
                        value={currentTraceConfig.color || "#10b981"}
                        onChange={(e) => updateTraceConfig(activeTrace.name, { color: e.target.value })}
                        style={{ width: "32px", height: "24px", border: "1px solid #cbd5e1", cursor: "pointer" }}
                      />
                      <input
                        type="text"
                        value={currentTraceConfig.color || "#10b981"}
                        onChange={(e) => updateTraceConfig(activeTrace.name, { color: e.target.value })}
                        className="wf-text-input"
                        style={{ width: "90px" }}
                      />
                    </div>
                  </div>

                  {/* Line Thickness */}
                  <div className="wf-field-group">
                    <label className="wf-field-label">{t('waveform:traces.width')}:</label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {[1, 2, 3, 4].map((w) => (
                        <button
                          key={w}
                          type="button"
                          className={`wf-option-btn ${(currentTraceConfig.lineWidth || 2) === w ? "active" : ""}`}
                          onClick={() => updateTraceConfig(activeTrace.name, { lineWidth: w })}
                        >
                          {w}px
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Line Style */}
                  <div className="wf-field-group">
                    <label className="wf-field-label">{t('waveform:traces.style')}:</label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {(["solid", "dashed", "dotted"] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          className={`wf-option-btn ${(currentTraceConfig.lineStyle || "solid") === st ? "active" : ""}`}
                          onClick={() => updateTraceConfig(activeTrace.name, { lineStyle: st })}
                          style={{ textTransform: "capitalize" }}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pane Assignment */}
                  {plotSettings.panesCount > 1 && (
                    <div className="wf-field-group">
                      <label className="wf-field-label">{t('waveform:traces.assignedPane')}:</label>
                      <div style={{ display: "flex", gap: "6px" }}>
                        {Array.from({ length: plotSettings.panesCount }).map((_, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className={`wf-option-btn ${(currentTraceConfig.pane ?? 0) === idx ? "active" : ""}`}
                            onClick={() => updateTraceConfig(activeTrace.name, { pane: idx })}
                          >
                            Pane {idx + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
                  {t('waveform:traces.selectToConfigure')}
                </div>
              )}

            </div>
          )}

          {/* TAB 2: AXES & SCALE */}
          {activeTab === "axes" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Horizontal X Axis */}
              <div className="wf-group-box">
                <legend className="wf-group-title">Horizontal (X) Axis [{xUnit || "Sweep"}]</legend>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={isXAuto}
                        onChange={(e) => setIsXAuto(e.target.checked)}
                      />
                      <span>Auto-scale X</span>
                    </label>

                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer", marginLeft: "auto" }}>
                      <input
                        type="checkbox"
                        checked={logX}
                        onChange={(e) => setLogX(e.target.checked)}
                      />
                      <span>Logarithmic scale (Log10)</span>
                    </label>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label className="wf-field-label">Min X:</label>
                      <input
                        type="number"
                        step="any"
                        disabled={isXAuto}
                        value={xMinStr}
                        onChange={(e) => setXMinStr(e.target.value)}
                        className="wf-text-input"
                      />
                      <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "2px" }}>
                        Natural: {formatEngineering(naturalXRange[0], xUnit)}
                      </div>
                    </div>
                    <div>
                      <label className="wf-field-label">Max X:</label>
                      <input
                        type="number"
                        step="any"
                        disabled={isXAuto}
                        value={xMaxStr}
                        onChange={(e) => setXMaxStr(e.target.value)}
                        className="wf-text-input"
                      />
                      <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "2px" }}>
                        Natural: {formatEngineering(naturalXRange[1], xUnit)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Vertical Left Y Axis */}
              <div className="wf-group-box">
                <legend className="wf-group-title">Left Vertical (Y) Axis [Voltages / dB]</legend>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={isYLeftAuto}
                      onChange={(e) => setIsYLeftAuto(e.target.checked)}
                    />
                    <span>Auto-scale Left Y</span>
                  </label>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label className="wf-field-label">Min Left Y:</label>
                      <input
                        type="number"
                        step="any"
                        disabled={isYLeftAuto}
                        value={yLeftMinStr}
                        onChange={(e) => setYLeftMinStr(e.target.value)}
                        className="wf-text-input"
                      />
                    </div>
                    <div>
                      <label className="wf-field-label">Max Left Y:</label>
                      <input
                        type="number"
                        step="any"
                        disabled={isYLeftAuto}
                        value={yLeftMaxStr}
                        onChange={(e) => setYLeftMaxStr(e.target.value)}
                        className="wf-text-input"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Vertical Right Y Axis (if applicable) */}
              {naturalPaneBounds[0]?.hasRight && (
                <div className="wf-group-box">
                  <legend className="wf-group-title">Right Vertical (Y) Axis [Currents / Phase]</legend>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={isYRightAuto}
                        onChange={(e) => setIsYRightAuto(e.target.checked)}
                      />
                      <span>Auto-scale Right Y</span>
                    </label>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label className="wf-field-label">Min Right Y:</label>
                        <input
                          type="number"
                          step="any"
                          disabled={isYRightAuto}
                          value={yRightMinStr}
                          onChange={(e) => setYRightMinStr(e.target.value)}
                          className="wf-text-input"
                        />
                      </div>
                      <div>
                        <label className="wf-field-label">Max Right Y:</label>
                        <input
                          type="number"
                          step="any"
                          disabled={isYRightAuto}
                          value={yRightMaxStr}
                          onChange={(e) => setYRightMaxStr(e.target.value)}
                          className="wf-text-input"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  type="button"
                  className="wf-secondary-btn"
                  onClick={() => {
                    setIsXAuto(true)
                    setIsYLeftAuto(true)
                    setIsYRightAuto(true)
                    onResetAutoAxes()
                  }}
                >
                  Reset to Natural Bounds (Fit)
                </button>
                <button type="button" className="wf-primary-btn" onClick={handleApplyLimits}>
                  Apply Axis Limits
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: VIEW & PANES */}
          {activeTab === "appearance" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Background Theme */}
              <div className="wf-group-box">
                <legend className="wf-group-title">Plot Background Theme</legend>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px", marginTop: "8px" }}>
                  {(
                    [
                      { id: "ltspice-black", label: "LTspice Black", desc: "Classic pitch-black oscilloscope background", color: "#000000" },
                      { id: "dark-navy", label: "Dark Navy", desc: "Deep dark modern engineering mode", color: "#090d16" },
                      { id: "classic-white", label: "Classic White", desc: "Clean publication and report background", color: "#ffffff" },
                      { id: "slate-gray", label: "Slate Gray", desc: "Balanced engineering benchtop palette", color: "#1e293b" },
                    ] as const
                  ).map((thm) => (
                    <div
                      key={thm.id}
                      onClick={() => onUpdatePlotSettings((p) => ({ ...p, theme: thm.id as PlotTheme }))}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "10px",
                        border: `2px solid ${plotSettings.theme === thm.id ? "#0078d7" : "#cbd5e1"}`,
                        borderRadius: "4px",
                        cursor: "pointer",
                        background: plotSettings.theme === thm.id ? "#eff6ff" : "#ffffff",
                      }}
                    >
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "4px",
                          background: thm.color,
                          border: "1px solid rgba(0,0,0,0.2)",
                          flexShrink: 0,
                        }}
                      />
                      <div>
                        <strong style={{ fontSize: "12px", color: "#0f172a" }}>{thm.label}</strong>
                        <div style={{ fontSize: "10.5px", color: "#64748b" }}>{thm.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Grid Style */}
              <div className="wf-group-box">
                <legend className="wf-group-title">Grid Line Style</legend>
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  {(["dotted", "solid", "dashed", "none"] as GridStyle[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      className={`wf-option-btn ${plotSettings.gridStyle === st ? "active" : ""}`}
                      onClick={() => onUpdatePlotSettings((p) => ({ ...p, gridStyle: st }))}
                      style={{ flex: 1, textTransform: "capitalize", padding: "8px" }}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Split Plot Panes */}
              <div className="wf-group-box">
                <legend className="wf-group-title">Multiple Plot Panes (LTspice Split Panes)</legend>
                <div style={{ fontSize: "11px", color: "#64748b", margin: "4px 0 8px 0" }}>
                  Divide the vertical plot area into stacked sub-panes sharing a synchronized horizontal axis.
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {([1, 2, 3] as const).map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      className={`wf-option-btn ${plotSettings.panesCount === cnt ? "active" : ""}`}
                      onClick={() => onUpdatePlotSettings((p) => ({ ...p, panesCount: cnt }))}
                      style={{ flex: 1, padding: "8px" }}
                    >
                      {cnt === 1 ? "1 Plot Pane (Standard)" : `${cnt} Split Panes`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: WAVEFORM MATH */}
          {activeTab === "math" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div className="wf-field-group">
                <label className="wf-field-label">Mathematical Expression:</label>
                <input
                  type="text"
                  className="wf-text-input"
                  style={{ fontFamily: "'JetBrains Mono', Consolas, monospace", fontSize: "13px" }}
                  placeholder="e.g. V(out) - V(in)  or  d(V(out))/dt  or  V(out)*I(R1)  or  integ(V(in))"
                  value={mathExpr}
                  onChange={(e) => {
                    setMathExpr(e.target.value)
                    if (!mathName || mathName === mathExpr) setMathName(e.target.value)
                  }}
                />
              </div>

              {/* Operators bar */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {["+", "-", "*", "/", "(", ")", "^2", "abs()", "d()/dt", "integ()", "sqrt()", "log10()"].map((op) => (
                  <button
                    key={op}
                    type="button"
                    className="wf-mini-btn"
                    onClick={() => handleInsertOperator(op)}
                  >
                    {op}
                  </button>
                ))}
              </div>

              {/* Available Signals chips */}
              <div>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                  Insert Signal:
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "4px", maxHeight: "65px", overflowY: "auto" }}>
                  {allAvailableTraces.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      className="wf-chip-btn"
                      onClick={() => handleInsertSignal(t.name)}
                    >
                      {t.name.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              {mathExpr.trim() && (
                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: "4px",
                    fontSize: "11.5px",
                    fontFamily: "'JetBrains Mono', Consolas, monospace",
                    background: evalResult?.success ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                    color: evalResult?.success ? "#059669" : "#dc2626",
                    border: `1px solid ${evalResult?.success ? "#10b981" : "#ef4444"}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {evalResult?.success ? (
                    <>
                      <Check size={13} style={{ flexShrink: 0 }} />
                      <span>Valid expression ({evalResult.data?.length || 0} points, unit: {evalResult.unit})</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                      <span>{evalResult?.error || "Invalid expression"}</span>
                    </>
                  )}
                </div>
              )}

              {/* Label & Pane */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "10px" }}>
                <div className="wf-field-group">
                  <label className="wf-field-label">Trace Display Label:</label>
                  <input
                    type="text"
                    className="wf-text-input"
                    placeholder="e.g. Diff_Out"
                    value={mathName}
                    onChange={(e) => setMathName(e.target.value)}
                  />
                </div>

                {plotSettings.panesCount > 1 && (
                  <div className="wf-field-group">
                    <label className="wf-field-label">Pane:</label>
                    <select
                      className="wf-select-input"
                      value={mathPane}
                      onChange={(e) => setMathPane(Number(e.target.value))}
                    >
                      {Array.from({ length: plotSettings.panesCount }).map((_, i) => (
                        <option key={i} value={i}>Pane {i + 1}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Color & Add Button */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: "6px" }}>
                  {PALETTE_COLORS.slice(0, 8).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`wf-palette-btn ${mathColor === c ? "selected" : ""}`}
                      style={{ background: c }}
                      onClick={() => setMathColor(c)}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="wf-primary-btn"
                  disabled={!evalResult?.success}
                  onClick={handleAddNewMathTrace}
                >
                  + Add Math Trace
                </button>
              </div>

              {/* Active Math Traces List */}
              {plotSettings.customMathTraces.length > 0 && (
                <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: "8px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                    Active Math Traces ({plotSettings.customMathTraces.length}):
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px", maxHeight: "90px", overflowY: "auto" }}>
                    {plotSettings.customMathTraces.map((mt) => (
                      <div
                        key={mt.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "3px 8px",
                          background: "#f1f5f9",
                          borderRadius: "4px",
                          fontSize: "11.5px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span className="wf-color-swatch-sm" style={{ background: mt.color }} />
                          <strong>{mt.name}</strong>
                          <code style={{ fontSize: "10.5px", color: "#64748b" }}>={mt.expression}</code>
                        </div>
                        <button
                          type="button"
                          className="wf-mini-btn danger"
                          onClick={() => onRemoveMathTrace(mt.id)}
                          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: ANNOTATIONS */}
          {activeTab === "annotations" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div className="wf-field-group">
                <label className="wf-field-label">Annotation Type:</label>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    type="button"
                    className={`wf-option-btn ${annotType === "text" ? "active" : ""}`}
                    onClick={() => setAnnotType("text")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                  >
                    <FileText size={13} />
                    <span>Text Note</span>
                  </button>
                  <button
                    type="button"
                    className={`wf-option-btn ${annotType === "refLineH" ? "active" : ""}`}
                    onClick={() => setAnnotType("refLineH")}
                  >
                    ━ Horizontal Line
                  </button>
                  <button
                    type="button"
                    className={`wf-option-btn ${annotType === "refLineV" ? "active" : ""}`}
                    onClick={() => setAnnotType("refLineV")}
                  >
                    ┃ Vertical Line
                  </button>
                  <button
                    type="button"
                    className={`wf-option-btn ${annotType === "arrow" ? "active" : ""}`}
                    onClick={() => setAnnotType("arrow")}
                  >
                    ↗ Arrow
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div className="wf-field-group">
                  <label className="wf-field-label">{annotType === "arrow" ? "Start X:" : "X Position:"}</label>
                  <input
                    type="number"
                    step="any"
                    className="wf-text-input"
                    value={annotX}
                    onChange={(e) => setAnnotX(e.target.value)}
                  />
                </div>
                <div className="wf-field-group">
                  <label className="wf-field-label">
                    {annotType === "refLineH" ? "Y Level (V/A):" : annotType === "arrow" ? "Start Y:" : "Y Position:"}
                  </label>
                  <input
                    type="number"
                    step="any"
                    className="wf-text-input"
                    value={annotY}
                    onChange={(e) => setAnnotY(e.target.value)}
                  />
                </div>
              </div>

              {annotType === "arrow" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div className="wf-field-group">
                    <label className="wf-field-label">End X (Arrowhead):</label>
                    <input
                      type="number"
                      step="any"
                      className="wf-text-input"
                      value={annotX2}
                      onChange={(e) => setAnnotX2(e.target.value)}
                    />
                  </div>
                  <div className="wf-field-group">
                    <label className="wf-field-label">End Y (Arrowhead):</label>
                    <input
                      type="number"
                      step="any"
                      className="wf-text-input"
                      value={annotY2}
                      onChange={(e) => setAnnotY2(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="wf-field-group">
                <label className="wf-field-label">Label / Text Content:</label>
                <input
                  type="text"
                  className="wf-text-input"
                  placeholder={
                    annotType === "refLineH"
                      ? "e.g. Threshold = 2.5V"
                      : annotType === "refLineV"
                        ? "e.g. Pulse Trigger"
                        : "e.g. Peak Voltage Node"
                  }
                  value={annotText}
                  onChange={(e) => setAnnotText(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {PALETTE_COLORS.slice(0, 8).map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`wf-palette-btn ${annotColor === c ? "selected" : ""}`}
                        style={{ background: c }}
                        onClick={() => setAnnotColor(c)}
                      />
                    ))}
                  </div>
                  {plotSettings.panesCount > 1 && (
                    <select
                      className="wf-select-input"
                      value={annotPane}
                      onChange={(e) => setAnnotPane(Number(e.target.value))}
                      style={{ fontSize: "11px", padding: "2px 6px" }}
                    >
                      {Array.from({ length: plotSettings.panesCount }).map((_, i) => (
                        <option key={i} value={i}>Pane {i + 1}</option>
                      ))}
                    </select>
                  )}
                </div>
                <button type="button" className="wf-primary-btn" onClick={handleAddNewAnnotation}>
                  + Add Annotation
                </button>
              </div>

              {/* Existing Annotations */}
              {plotSettings.annotations.length > 0 && (
                <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                      Existing Annotations ({plotSettings.annotations.length}):
                    </span>
                    <button type="button" className="wf-mini-btn danger" onClick={onClearAnnotations}>
                      Clear All
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "90px", overflowY: "auto" }}>
                    {plotSettings.annotations.map((annot) => (
                      <div
                        key={annot.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "3px 8px",
                          background: "#f1f5f9",
                          borderRadius: "4px",
                          fontSize: "11.5px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span className="wf-color-swatch-sm" style={{ background: annot.color || "#f59e0b" }} />
                          <span style={{ fontWeight: 600 }}>
                            {annot.type === "refLineH"
                              ? `Ref Line H @ Y=${annot.y}`
                              : annot.type === "refLineV"
                                ? `Ref Line V @ X=${annot.x}`
                                : annot.type === "arrow"
                                  ? `Arrow`
                                  : `Note`}
                          </span>
                          {annot.text && <span style={{ color: "#475569" }}>"{annot.text}"</span>}
                        </div>
                        <button
                          type="button"
                          className="wf-mini-btn danger"
                          onClick={() => onRemoveAnnotation(annot.id)}
                          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: AUTOMATIC MEASUREMENTS */}
          {activeTab === "measurements" && (
            <div style={{ margin: "-16px", minHeight: "360px" }}>
              <AutomaticMeasurementsPanel
                simulationResult={simulationResult}
                isOpen={true}
                activePlottedTraces={selectedTraces}
                embedded={true}
              />
            </div>
          )}

          {/* TAB: EXPORT & CONFIG */}
          {activeTab === "export" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Waveform Data & Image Export */}
              <div className="wf-group-box">
                <legend className="wf-group-title">Waveform Data & Image Export</legend>
                <div style={{ fontSize: "11px", color: "#64748b", margin: "4px 0 10px 0" }}>
                  Export plotted circuit simulation data and high-resolution plot images.
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    className="wf-primary-btn"
                    style={{ flex: 1, padding: "8px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    onClick={() =>
                      exportWaveformCsv(
                        xVarName,
                        xData,
                        selectedTraces,
                        combinedDataMap,
                        undefined,
                        "criticalpath_plot",
                      )
                    }
                  >
                    <FileSpreadsheet size={15} />
                    <span>Export Plotted Data to CSV</span>
                  </button>
                  <button
                    type="button"
                    className="wf-primary-btn"
                    style={{ flex: 1, padding: "8px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    onClick={() => exportWaveformPng(canvasRef.current, "criticalpath_plot")}
                  >
                    <Camera size={15} />
                    <span>Save High-Res PNG Image</span>
                  </button>
                </div>
              </div>

              {/* Plot Settings JSON Persistence */}
              <div className="wf-group-box">
                <legend className="wf-group-title">Plot Settings Configuration (JSON)</legend>
                <div style={{ fontSize: "11px", color: "#64748b", margin: "4px 0 10px 0" }}>
                  Save or load complete waveform configurations (theme, grid, colors, virtual math traces, annotations, and axis setups).
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    className="wf-secondary-btn"
                    style={{ flex: 1, padding: "8px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    onClick={onExportSettings}
                  >
                    <Save size={14} />
                    <span>Save Configuration (.json)</span>
                  </button>
                  <button
                    type="button"
                    className="wf-secondary-btn"
                    style={{ flex: 1, padding: "8px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    onClick={onImportSettingsClick}
                  >
                    <FolderOpen size={14} />
                    <span>Load Configuration (.json)</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="wf-modal-footer">
          <button type="button" className="wf-primary-btn" onClick={onClose}>
            {t('common:actions.close', 'Done')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default WaveformSettingsModal

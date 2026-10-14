import React, { useState, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import type { NetlistValidationError } from "../utils/spiceNetlist"
import type { SimulationRunResult, NgspiceEngineStatus } from "../../../shared/simulation"

export interface DiagnosticsPanelProps {
  isOpen: boolean
  onClose: () => void
  onClear: () => void
  simResult: SimulationRunResult | null
  simStatus: "idle" | "running" | "paused"
  analysisCommand: string
  validationErrors: NetlistValidationError[]
  validationWarnings: NetlistValidationError[]
  stats?: {
    componentCount: number
    netCount: number
    wireCount: number
    groundConnected: boolean
  }
  engineStatus?: NgspiceEngineStatus | null
  onLocateError?: (componentId?: string, netName?: string) => void
  onOpenWaveforms?: () => void
  height?: number
  onHeightChange?: (height: number) => void
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  isOpen,
  onClose,
  onClear,
  simResult,
  simStatus,
  analysisCommand,
  validationErrors,
  validationWarnings,
  stats,
  engineStatus,
  onLocateError,
  onOpenWaveforms,
  height = 240,
  onHeightChange,
}) => {
  const { t } = useTranslation('common')
  const [filterTab, setFilterTab] = useState<"all" | "errors" | "warnings" | "info">("all")
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartY = useRef(0)
  const resizeStartHeight = useRef(height)

  // Resizing logic
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
      const newHeight = Math.max(140, Math.min(window.innerHeight - 150, resizeStartHeight.current + delta))
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

  if (!isOpen) return null

  // Determine current overall simulation run state
  const hasValidationErrors = validationErrors.length > 0
  const isSimSuccess = simResult?.success === true
  const isSimFailed = Boolean(simResult && !simResult.success)

  const errorCount = validationErrors.length + (isSimFailed ? 1 : 0)
  const warningCount = validationWarnings.length

  return (
    <section
      className={`diag-win-panel ${isCollapsed ? "collapsed" : ""}`}
      style={{ height: isCollapsed ? "30px" : `${height}px` }}
      aria-label="Simulation Diagnostics Window"
    >
      {/* Resizing Splitter (Top Edge) */}
      {!isCollapsed && (
        <div
          className="diag-win-splitter"
          onMouseDown={handleResizeMouseDown}
          title="Drag up/down to resize diagnostics window"
        >
          <div className="diag-win-splitter-bar" />
        </div>
      )}

      {/* Classic Windows Dock Header Bar */}
      <header className="diag-win-header">
        <div className="diag-win-header-left">
          <button
            type="button"
            className="diag-win-collapse-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? t('diagnostics.expand') : t('diagnostics.collapse')}
          >
            {isCollapsed ? "▲" : "▼"}
          </button>

          <div className="diag-win-title-group">
            <span className="diag-win-title-icon" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="14" height="12" fill="#0055ea" />
                <path d="M4 6h8M4 9h6M4 12h4" stroke="#ffffff" strokeWidth="1.2" />
              </svg>
            </span>
            <span className="diag-win-title">{t('diagnostics.title')}</span>

            {simStatus === "running" ? (
              <span className="diag-win-status-badge running">{t('diagnostics.running')}</span>
            ) : isSimSuccess ? (
              <span className="diag-win-status-badge success">✓ {t('diagnostics.success')}</span>
            ) : isSimFailed || hasValidationErrors ? (
              <span className="diag-win-status-badge error">✕ {errorCount} Error{errorCount !== 1 ? "s" : ""}</span>
            ) : (
              <span className="diag-win-status-badge ready">{t('diagnostics.ready')}</span>
            )}
          </div>

          {!isCollapsed && (
            <div className="diag-win-filter-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={filterTab === "all"}
                className={`diag-win-tab-btn ${filterTab === "all" ? "active" : ""}`}
                onClick={() => setFilterTab("all")}
              >
                {t('diagnostics.tabs.all')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filterTab === "errors"}
                className={`diag-win-tab-btn ${filterTab === "errors" ? "active" : ""}`}
                onClick={() => setFilterTab("errors")}
              >
                {t('diagnostics.tabs.errors')} ({errorCount})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filterTab === "warnings"}
                className={`diag-win-tab-btn ${filterTab === "warnings" ? "active" : ""}`}
                onClick={() => setFilterTab("warnings")}
              >
                {t('diagnostics.tabs.warnings')} ({warningCount})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filterTab === "info"}
                className={`diag-win-tab-btn ${filterTab === "info" ? "active" : ""}`}
                onClick={() => setFilterTab("info")}
              >
                {t('diagnostics.tabs.info')}
              </button>
            </div>
          )}
        </div>

        {/* Header Right Actions */}
        <div className="diag-win-header-actions">
          {onOpenWaveforms && isSimSuccess && (
            <button
              type="button"
              className="diag-win-action-btn diag-win-action-btn-highlight"
              onClick={onOpenWaveforms}
              title="Open Waveform Viewer to plot results"
            >
              📈 {t('diagnostics.viewWaveforms')}
            </button>
          )}

          <button
            type="button"
            className="diag-win-action-btn"
            onClick={onClear}
            title="Clear diagnostics and simulation results"
          >
            {t('actions.clear')}
          </button>


          <button
            type="button"
            className="diag-win-close-btn"
            onClick={onClose}
            title="Close Diagnostics Window (F7)"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </header>

      {/* Main Content Area (Hidden if Collapsed) */}
      {!isCollapsed && (
        <div className="diag-win-body">
          {/* ===================================================
              1. LATEST RUN STATUS & SUMMARY FRAME
              =================================================== */}
          {simResult && isSimSuccess && (
            <div className="diag-win-summary-box success">
              <div className="diag-win-summary-header">
                <span className="diag-win-summary-title">✓ Simulation Finished Successfully</span>
                {onOpenWaveforms && (
                  <button
                    type="button"
                    className="diag-win-action-btn"
                    onClick={onOpenWaveforms}
                  >
                    Plot in Waveform Viewer ➔
                  </button>
                )}
              </div>
              <div className="diag-win-summary-grid">
                <div className="diag-win-summary-item">
                  <span className="diag-win-summary-label">Analysis:</span>
                  <span className="diag-win-summary-val">.{simResult.analysisType.toUpperCase()} ({analysisCommand})</span>
                </div>
                <div className="diag-win-summary-item">
                  <span className="diag-win-summary-label">Execution Time:</span>
                  <span className="diag-win-summary-val">{simResult.elapsedMs} ms</span>
                </div>
                <div className="diag-win-summary-item">
                  <span className="diag-win-summary-label">Results Captured:</span>
                  <span className="diag-win-summary-val">
                    {simResult.pointCount > 0
                      ? `${simResult.pointCount} data points calculated across ${simResult.variables.length} vectors`
                      : `${simResult.variables.length} operating point variables evaluated`}
                  </span>
                </div>
                <div className="diag-win-summary-item">
                  <span className="diag-win-summary-label">Solver Engine:</span>
                  <span className="diag-win-summary-val">{simResult.engineVersion || engineStatus?.version || "ngspice-44.2"}</span>
                </div>
              </div>
            </div>
          )}

          {isSimFailed && (
            <div className="diag-win-summary-box error">
              <div className="diag-win-summary-header">
                <span className="diag-win-summary-title">✕ Simulation Execution Failed</span>
              </div>
              <div className="diag-win-summary-msg">
                {simResult?.error || simResult?.stderr || "ngspice terminated with non-zero exit code"}
              </div>
            </div>
          )}

          {hasValidationErrors && (
            <div className="diag-win-summary-box warning">
              <div className="diag-win-summary-header">
                <span className="diag-win-summary-title">
                  ▲ Simulation Blocked by Circuit Validation ({validationErrors.length} issue{validationErrors.length > 1 ? "s" : ""})
                </span>
              </div>
              <div className="diag-win-summary-msg">
                Resolve the validation errors listed below to generate a valid SPICE netlist.
              </div>
            </div>
          )}

          {/* ===================================================
              2. DETAILED DIAGNOSTICS & MESSAGES LISTVIEW
              =================================================== */}
          <div className="diag-win-listview" role="list">
            {/* Validation Errors */}
            {(filterTab === "all" || filterTab === "errors") &&
              validationErrors.map((err, idx) => (
                <div key={`err-${idx}`} className="diag-win-row error" role="listitem">
                  <span className="diag-win-tag error">ERROR</span>
                  <span className="diag-win-code">{err.code}</span>
                  <div className="diag-win-row-body">
                    <div className="diag-win-row-msg">{err.message}</div>
                    {(err.componentLabel || err.componentId || err.netName) && (
                      <div className="diag-win-row-meta">
                        {err.componentLabel && <span>Component: <strong>{err.componentLabel}</strong></span>}
                        {err.pinName && <span>Pin: <strong>{err.pinName}</strong></span>}
                        {err.netName && <span>Net: <strong>{err.netName}</strong></span>}
                      </div>
                    )}
                    {err.suggestion && (
                      <div className="diag-win-row-suggestion">💡 {err.suggestion}</div>
                    )}
                  </div>
                  {err.componentId && onLocateError && (
                    <button
                      type="button"
                      className="diag-win-locate-btn"
                      onClick={() => onLocateError(err.componentId, err.netName)}
                      title="Center and highlight this component on canvas"
                    >
                      Locate Error
                    </button>
                  )}
                </div>
              ))}

            {/* Non-Blocking Validation Warnings */}
            {(filterTab === "all" || filterTab === "warnings") &&
              validationWarnings.map((warn, idx) => (
                <div key={`warn-${idx}`} className="diag-win-row warning" role="listitem">
                  <span className="diag-win-tag warning">WARNING</span>
                  <span className="diag-win-code">{warn.code}</span>
                  <div className="diag-win-row-body">
                    <div className="diag-win-row-msg">{warn.message}</div>
                    {(warn.componentLabel || warn.componentId || warn.netName) && (
                      <div className="diag-win-row-meta">
                        {warn.componentLabel && <span>Component: <strong>{warn.componentLabel}</strong></span>}
                        {warn.pinName && <span>Pin: <strong>{warn.pinName}</strong></span>}
                        {warn.netName && <span>Net: <strong>{warn.netName}</strong></span>}
                      </div>
                    )}
                    {warn.suggestion && (
                      <div className="diag-win-row-suggestion">💡 {warn.suggestion}</div>
                    )}
                  </div>
                  {warn.componentId && onLocateError && (
                    <button
                      type="button"
                      className="diag-win-locate-btn"
                      onClick={() => onLocateError(warn.componentId, warn.netName)}
                      title="Center and highlight this component on canvas"
                    >
                      Locate
                    </button>
                  )}
                </div>
              ))}

            {/* Run Info & Circuit Statistics */}
            {(filterTab === "all" || filterTab === "info") && (
              <div className="diag-win-row info" role="listitem">
                <span className="diag-win-tag info">INFO</span>
                <span className="diag-win-code">CIRCUIT_STATS</span>
                <div className="diag-win-row-body">
                  <div className="diag-win-row-msg">
                    Active schematic topology: {stats?.componentCount ?? 0} components, {stats?.netCount ?? 0} nets, {stats?.wireCount ?? 0} wire segments.
                  </div>
                  <div className="diag-win-row-meta">
                    <span>Ground (0V) Connected: <strong>{stats?.groundConnected ? "Yes (Node 0)" : "No"}</strong></span>
                    <span>ngspice Engine: <strong>{engineStatus?.available ? "Online (Verified)" : "Offline"}</strong></span>
                    {engineStatus?.executablePath && (
                      <span title={engineStatus.executablePath}>
                        Binary: <strong>{engineStatus.executablePath.split(/[/\\]/).pop()}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Empty state when no issues found */}
            {filterTab === "errors" && validationErrors.length === 0 && !isSimFailed && (
              <div className="diag-win-empty-hint">✓ Zero validation errors detected.</div>
            )}

            {filterTab === "warnings" && validationWarnings.length === 0 && (
              <div className="diag-win-empty-hint">✓ Zero warnings detected.</div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default DiagnosticsPanel

import React, { useState, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import {
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  X,
  Lightbulb,
  ArrowRight,
  Maximize2,
  Minimize2,
} from "lucide-react"
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
  isMaximized?: boolean
  onToggleMaximize?: () => void
}

const getTranslatedErrorMessage = (
  err: NetlistValidationError,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: any, options?: any) => string,
): string => {
  switch (err.code) {
    case "EMPTY_CIRCUIT":
      return t("validationRules.emptyCircuitMsg")
    case "MISSING_GROUND":
      if (err.message.toLowerCase().includes("not connected")) {
        return t("validationRules.groundNotConnectedMsg")
      }
      return t("validationRules.missingGroundMsg")
    case "UNSUPPORTED_COMPONENT":
      return t("validationRules.unsupportedCompMsg", {
        label: err.componentLabel || err.componentId || "",
      })
    case "DISCONNECTED_PIN":
      return t("validationRules.disconnectedPinMsg", {
        pin: err.pinName || "",
        label: err.componentLabel || err.componentId || "",
      })
    case "SHORT_CIRCUIT":
      return t("validationRules.shortCircuitMsg", {
        label: err.componentLabel || err.componentId || "",
      })
    case "DANGLING_NET":
      return t("validationRules.danglingNetMsg", {
        net: err.netName || "",
      })
    case "INVALID_VALUE":
      return t("validationRules.invalidValueMsg", {
        label: err.componentLabel || err.componentId || "",
      })
    default:
      return err.message
  }
}

const getTranslatedErrorSuggestion = (
  err: NetlistValidationError,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: any, options?: any) => string,
): string => {
  switch (err.code) {
    case "EMPTY_CIRCUIT":
      return t("validationRules.emptyCircuitSugg")
    case "MISSING_GROUND":
      if (err.message.toLowerCase().includes("not connected")) {
        return t("validationRules.groundNotConnectedSugg")
      }
      return t("validationRules.missingGroundSugg")
    case "UNSUPPORTED_COMPONENT":
      return t("validationRules.unsupportedCompSugg")
    case "DISCONNECTED_PIN":
      return t("validationRules.disconnectedPinSugg")
    case "SHORT_CIRCUIT":
      return t("validationRules.shortCircuitSugg")
    case "DANGLING_NET":
      return t("validationRules.danglingNetSugg")
    case "INVALID_VALUE":
      return t("validationRules.invalidValueSugg")
    default:
      return err.suggestion || ""
  }
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
  isMaximized: propIsMaximized,
  onToggleMaximize,
}) => {
  const { t } = useTranslation('common')
  const [filterTab, setFilterTab] = useState<"all" | "errors" | "warnings" | "info">("all")
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [internalMaximized, setInternalMaximized] = useState(false)
  const isMaximized = propIsMaximized !== undefined ? propIsMaximized : internalMaximized
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
      className={`diag-win-panel ${isCollapsed ? "collapsed" : ""} ${isMaximized ? "maximized" : ""}`}
      style={{ height: isMaximized ? "100%" : isCollapsed ? "30px" : `${height}px` }}
      aria-label="Simulation Diagnostics Window"
    >
      {/* Resizing Splitter (Top Edge) */}
      {!isCollapsed && !isMaximized && (
        <div
          className="diag-win-splitter"
          onMouseDown={handleResizeMouseDown}
          title={t('diagnostics.resizeSplitter')}
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
              <span className="diag-win-status-badge success" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <CheckCircle2 size={12} />
                <span>{t('diagnostics.success')}</span>
              </span>
            ) : isSimFailed || hasValidationErrors ? (
              <span className="diag-win-status-badge error" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <AlertCircle size={12} />
                <span>{t('diagnostics.errorsCount', { count: errorCount })}</span>
              </span>
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
              title={t('diagnostics.viewWaveformsTooltip')}
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <TrendingUp size={13} />
              <span>{t('diagnostics.viewWaveforms')}</span>
            </button>
          )}

          <button
            type="button"
            className="diag-win-action-btn"
            onClick={onClear}
            title={t('diagnostics.clearTooltip')}
          >
            {t('diagnostics.clear')}
          </button>


          <button
            type="button"
            className="diag-win-close-btn"
            onClick={() => {
              if (onToggleMaximize) {
                onToggleMaximize()
              } else {
                setInternalMaximized(!internalMaximized)
              }
            }}
            title={isMaximized ? t('diagnostics.restore') : t('diagnostics.maximize')}
            aria-label={isMaximized ? t('diagnostics.restore') : t('diagnostics.maximize')}
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          <button
            type="button"
            className="diag-win-close-btn"
            onClick={onClose}
            title={t('diagnostics.closeTooltip')}
            aria-label={t('diagnostics.closeTooltip')}
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={14} />
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
                <span className="diag-win-summary-title" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle2 size={15} color="#10b981" />
                  <span>{t('diagnostics.simFinishedSuccess')}</span>
                </span>
                {onOpenWaveforms && (
                  <button
                    type="button"
                    className="diag-win-action-btn"
                    onClick={onOpenWaveforms}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                  >
                    <span>{t('diagnostics.plotInWaveforms')}</span>
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>
              <div className="diag-win-summary-grid">
                <div className="diag-win-summary-item">
                  <span className="diag-win-summary-label">{t('diagnostics.analysisLabel')}</span>
                  <span className="diag-win-summary-val">.{simResult.analysisType.toUpperCase()} ({analysisCommand})</span>
                </div>
                <div className="diag-win-summary-item">
                  <span className="diag-win-summary-label">{t('diagnostics.executionTimeLabel')}</span>
                  <span className="diag-win-summary-val">{simResult.elapsedMs} ms</span>
                </div>
                <div className="diag-win-summary-item">
                  <span className="diag-win-summary-label">{t('diagnostics.resultsCapturedLabel')}</span>
                  <span className="diag-win-summary-val">
                    {simResult.pointCount > 0
                      ? t('diagnostics.dataPointsCaptured', { points: simResult.pointCount, vectors: simResult.variables.length })
                      : t('diagnostics.opPointEvaluated', { count: simResult.variables.length })}
                  </span>
                </div>
                <div className="diag-win-summary-item">
                  <span className="diag-win-summary-label">{t('diagnostics.solverEngineLabel')}</span>
                  <span className="diag-win-summary-val">{simResult.engineVersion || engineStatus?.version || "ngspice-44.2"}</span>
                </div>
              </div>
            </div>
          )}

          {isSimFailed && (
            <div className="diag-win-summary-box error">
              <div className="diag-win-summary-header">
                <span className="diag-win-summary-title" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <AlertCircle size={15} color="#ef4444" />
                  <span>{t('diagnostics.simFailed')}</span>
                </span>
              </div>
              <div className="diag-win-summary-msg">
                {simResult?.error || simResult?.stderr || t('diagnostics.ngspiceNonZero')}
              </div>
            </div>
          )}

          {hasValidationErrors && (
            <div className="diag-win-summary-box warning">
              <div className="diag-win-summary-header">
                <span className="diag-win-summary-title">
                  {t('diagnostics.simBlockedTitle', { count: validationErrors.length })}
                </span>
              </div>
              <div className="diag-win-summary-msg">
                {t('diagnostics.simBlockedMsg')}
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
                  <span className="diag-win-tag error">{t('diagnostics.tagError')}</span>
                  <span className="diag-win-code">{err.code}</span>
                  <div className="diag-win-row-body">
                    <div className="diag-win-row-msg">{getTranslatedErrorMessage(err, t)}</div>
                    {(err.componentLabel || err.componentId || err.netName) && (
                      <div className="diag-win-row-meta">
                        {err.componentLabel && <span>{t('diagnostics.metaComponent')} <strong>{err.componentLabel}</strong></span>}
                        {err.pinName && <span>{t('diagnostics.metaPin')} <strong>{err.pinName}</strong></span>}
                        {err.netName && <span>{t('diagnostics.metaNet')} <strong>{err.netName}</strong></span>}
                      </div>
                    )}
                    {err.suggestion && (
                      <div className="diag-win-row-suggestion" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <Lightbulb size={13} color="#f59e0b" style={{ flexShrink: 0 }} />
                        <span>{getTranslatedErrorSuggestion(err, t)}</span>
                      </div>
                    )}
                  </div>
                  {err.componentId && onLocateError && (
                    <button
                      type="button"
                      className="diag-win-locate-btn"
                      onClick={() => onLocateError(err.componentId, err.netName)}
                      title={t('diagnostics.locateTooltip')}
                    >
                      {t('diagnostics.locateError')}
                    </button>
                  )}
                </div>
              ))}

            {/* Non-Blocking Validation Warnings */}
            {(filterTab === "all" || filterTab === "warnings") &&
              validationWarnings.map((warn, idx) => (
                <div key={`warn-${idx}`} className="diag-win-row warning" role="listitem">
                  <span className="diag-win-tag warning">{t('diagnostics.tagWarning')}</span>
                  <span className="diag-win-code">{warn.code}</span>
                  <div className="diag-win-row-body">
                    <div className="diag-win-row-msg">{getTranslatedErrorMessage(warn, t)}</div>
                    {(warn.componentLabel || warn.componentId || warn.netName) && (
                      <div className="diag-win-row-meta">
                        {warn.componentLabel && <span>{t('diagnostics.metaComponent')} <strong>{warn.componentLabel}</strong></span>}
                        {warn.pinName && <span>{t('diagnostics.metaPin')} <strong>{warn.pinName}</strong></span>}
                        {warn.netName && <span>{t('diagnostics.metaNet')} <strong>{warn.netName}</strong></span>}
                      </div>
                    )}
                    {warn.suggestion && (
                      <div className="diag-win-row-suggestion" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <Lightbulb size={13} color="#f59e0b" style={{ flexShrink: 0 }} />
                        <span>{getTranslatedErrorSuggestion(warn, t)}</span>
                      </div>
                    )}
                  </div>
                  {warn.componentId && onLocateError && (
                    <button
                      type="button"
                      className="diag-win-locate-btn"
                      onClick={() => onLocateError(warn.componentId, warn.netName)}
                      title={t('diagnostics.locateTooltip')}
                    >
                      {t('diagnostics.locate')}
                    </button>
                  )}
                </div>
              ))}

            {/* Run Info & Circuit Statistics */}
            {(filterTab === "all" || filterTab === "info") && (
              <div className="diag-win-row info" role="listitem">
                <span className="diag-win-tag info">{t('diagnostics.tagInfo')}</span>
                <span className="diag-win-code">CIRCUIT_STATS</span>
                <div className="diag-win-row-body">
                  <div className="diag-win-row-msg">
                    {t('diagnostics.activeTopologyMsg', {
                      components: stats?.componentCount ?? 0,
                      nets: stats?.netCount ?? 0,
                      wires: stats?.wireCount ?? 0,
                    })}
                  </div>
                  <div className="diag-win-row-meta">
                    <span>
                      {t('diagnostics.groundConnectedLabel')}{" "}
                      <strong>
                        {stats?.groundConnected
                          ? t('diagnostics.groundConnectedYes')
                          : t('diagnostics.groundConnectedNo')}
                      </strong>
                    </span>
                    <span>
                      {t('diagnostics.engineStatusLabel')}{" "}
                      <strong>
                        {engineStatus?.available
                          ? t('diagnostics.engineOnline')
                          : t('diagnostics.engineOffline')}
                      </strong>
                    </span>
                    {engineStatus?.executablePath && (
                      <span title={engineStatus.executablePath}>
                        {t('diagnostics.metaBinary')}{" "}
                        <strong>{engineStatus.executablePath.split(/[/\\]/).pop()}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Empty state when no issues found */}
            {filterTab === "errors" && validationErrors.length === 0 && !isSimFailed && (
              <div className="diag-win-empty-hint" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <CheckCircle2 size={13} color="#10b981" />
                <span>{t('diagnostics.zeroErrors')}</span>
              </div>
            )}

            {filterTab === "warnings" && validationWarnings.length === 0 && (
              <div className="diag-win-empty-hint" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <CheckCircle2 size={13} color="#10b981" />
                <span>{t('diagnostics.zeroWarnings')}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default DiagnosticsPanel

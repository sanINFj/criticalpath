import React, { useState, useMemo, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { BarChart2, X, Copy, Info } from "lucide-react"
import type { SimulationRunResult } from "../../../shared/simulation"
import {
  calculateAutomaticMeasurements,
  type MeasurementsReport,
} from "../utils/automaticMeasurements"

export interface AutomaticMeasurementsPanelProps {
  simulationResult: SimulationRunResult | null
  isOpen: boolean
  onClose?: () => void
  activePlottedTraces?: string[]
  initialSignal?: string
  embedded?: boolean
}

export const AutomaticMeasurementsPanel: React.FC<AutomaticMeasurementsPanelProps> = ({
  simulationResult,
  isOpen,
  onClose,
  activePlottedTraces = [],
  initialSignal,
  embedded = false,
}) => {
  const { t } = useTranslation()
  // Extract all available signal names from simulation result
  const availableSignals = useMemo(() => {
    if (!simulationResult || !simulationResult.variables) return []
    const xName = simulationResult.xVariable?.toLowerCase() || ""
    return simulationResult.variables
      .filter((v) => v.name.toLowerCase() !== xName && v.name.toLowerCase() !== "time" && v.name.toLowerCase() !== "frequency")
      .map((v) => v.name)
  }, [simulationResult])

  // Current selected signal to measure
  const [selectedSignal, setSelectedSignal] = useState<string>("")
  const [filterCategory, setFilterCategory] = useState<"all" | "primary" | "timing">("all")
  const [copiedNotice, setCopiedNotice] = useState(false)

  // Initialize or update selected signal
  useEffect(() => {
    if (initialSignal && availableSignals.includes(initialSignal)) {
      setSelectedSignal(initialSignal)
    } else if (activePlottedTraces.length > 0 && availableSignals.includes(activePlottedTraces[0])) {
      setSelectedSignal(activePlottedTraces[0])
    } else if (availableSignals.length > 0 && (!selectedSignal || !availableSignals.includes(selectedSignal))) {
      setSelectedSignal(availableSignals[0])
    }
  }, [availableSignals, activePlottedTraces, initialSignal])

  // Calculate measurements for current signal
  const report: MeasurementsReport = useMemo(() => {
    return calculateAutomaticMeasurements(simulationResult, selectedSignal)
  }, [simulationResult, selectedSignal])

  // Filtered measurement list
  const filteredMeasurements = useMemo(() => {
    if (filterCategory === "all") return report.measurements
    if (filterCategory === "primary") {
      return report.measurements.filter((m) =>
        m.id.includes("peak") || m.id.includes("min") || m.id.includes("avg") || m.id.includes("rms") || m.id.includes("gain") || m.id.includes("max")
      )
    }
    if (filterCategory === "timing") {
      return report.measurements.filter((m) =>
        m.id.includes("rise") || m.id.includes("fall") || m.id.includes("overshoot") || m.id.includes("settling") || m.id.includes("cutoff") || m.id.includes("bandwidth")
      )
    }
    return report.measurements
  }, [report, filterCategory])

  // Copy table to clipboard
  const handleCopyClipboard = () => {
    if (filteredMeasurements.length === 0) return
    const lines = [
      `CriticalPath EDA - Automatic Measurements Report`,
      `Signal: ${report.signalName} | Analysis: .${report.analysisType.toUpperCase()} | Points: ${report.pointCount}`,
      `---------------------------------------------------------------------------------------------------------`,
      `Measurement\tSymbol\tValue\tUnit\tStatus\tDefinition`,
    ]
    filteredMeasurements.forEach((m) => {
      lines.push(`${m.name}\t${m.symbol}\t${m.valueFormatted}\t${m.unit}\t${m.status}\t${m.definition}`)
    })
    navigator.clipboard.writeText(lines.join("\n"))
    setCopiedNotice(true)
    setTimeout(() => setCopiedNotice(false), 2000)
  }

  if (!isOpen) return null

  return (
    <div
      className={`measure-win-panel ${embedded ? "embedded" : ""}`}
      role="region"
      aria-label="Automatic Measurements Panel"
    >
      {/* Titlebar / Header */}
      <div className="measure-win-header">
        <div className="measure-win-header-left">
          <span className="measure-win-icon" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="2" width="14" height="12" fill="#0055ea" />
              <path d="M3 11 L6 6 L9 9 L13 4" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="measure-win-title">{t('measurementsPanel.title')}</span>

          <span className="measure-win-analysis-badge">
            .{report.analysisType.toUpperCase()}
          </span>

          {/* Plotted Trace Quick Selectors */}
          <div className="measure-win-signal-chips">
            <span className="measure-win-signal-label">{t('measurementsPanel.plotted')}</span>
            {activePlottedTraces.map((tr) => (
              <button
                key={tr}
                type="button"
                className={`measure-win-chip ${selectedSignal === tr ? "active" : ""}`}
                onClick={() => setSelectedSignal(tr)}
                title={`Measure signal ${tr}`}
              >
                {tr.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Signal Dropdown Selector & Header Actions */}
        <div className="measure-win-header-right">
          <label className="measure-win-dropdown-label" htmlFor="measure-signal-select">
            {t('measurementsPanel.signal')}
          </label>
          <select
            id="measure-signal-select"
            className="measure-win-select"
            value={selectedSignal}
            onChange={(e) => setSelectedSignal(e.target.value)}
          >
            {availableSignals.map((sig) => (
              <option key={sig} value={sig}>
                {sig.toUpperCase()}
              </option>
            ))}
            {availableSignals.length === 0 && <option value="">{t('measurementsPanel.noSignals')}</option>}
          </select>

          {/* Category Filter Tabs */}
          <div className="measure-win-filter-tabs">
            <button
              type="button"
              className={`measure-win-tab-btn ${filterCategory === "all" ? "active" : ""}`}
              onClick={() => setFilterCategory("all")}
            >
              {t('measurementsPanel.tabAll')}
            </button>
            <button
              type="button"
              className={`measure-win-tab-btn ${filterCategory === "primary" ? "active" : ""}`}
              onClick={() => setFilterCategory("primary")}
            >
              {t('measurementsPanel.tabPrimary')}
            </button>
            <button
              type="button"
              className={`measure-win-tab-btn ${filterCategory === "timing" ? "active" : ""}`}
              onClick={() => setFilterCategory("timing")}
            >
              {t('measurementsPanel.tabTiming')}
            </button>
          </div>

          <button
            type="button"
            className="measure-win-btn"
            onClick={handleCopyClipboard}
            title="Copy measurements table to clipboard"
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <Copy size={12} />
            <span>{copiedNotice ? t('measurementsPanel.copied') : t('measurementsPanel.copy')}</span>
          </button>

          {onClose && (
            <button
              type="button"
              className="measure-win-close-btn"
              onClick={onClose}
              title="Close Measurements Panel"
              aria-label={t('actions.close')}
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Measurements Table Body */}
      <div className="measure-win-body">
        {selectedSignal && filteredMeasurements.length > 0 ? (
          <div className="measure-win-table-wrap">
            <table className="measure-win-table">
              <thead>
                <tr>
                  <th style={{ width: "18%" }}>{t('measurementsPanel.thMeasurement')}</th>
                  <th style={{ width: "12%" }}>{t('measurementsPanel.thSymbol')}</th>
                  <th style={{ width: "20%" }}>{t('measurementsPanel.thCalculatedValue')}</th>
                  <th style={{ width: "8%" }}>{t('measurementsPanel.thUnit')}</th>
                  <th style={{ width: "12%" }}>{t('measurementsPanel.thStatus')}</th>
                  <th style={{ width: "30%" }}>{t('measurementsPanel.thDefinition')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredMeasurements.map((m) => (
                  <tr key={m.id} className={`measure-row ${m.status}`}>
                    <td className="measure-cell-name">
                      <strong>{m.name}</strong>
                    </td>
                    <td className="measure-cell-symbol">
                      <code>{m.symbol}</code>
                    </td>
                    <td className="measure-cell-val">
                      <span className={`measure-val-badge ${m.status}`}>
                        {m.valueFormatted}
                      </span>
                    </td>
                    <td className="measure-cell-unit">{m.unit || "—"}</td>
                    <td className="measure-cell-status">
                      <span className={`measure-status-tag ${m.status}`}>
                        {m.status === "valid" ? t('measurementsPanel.statusValid') : m.status === "insufficient_data" ? t('measurementsPanel.statusInsufficient') : "N/A"}
                      </span>
                    </td>
                    <td className="measure-cell-def">
                      <div className="measure-def-text">{m.definition}</div>
                      {m.note && (
                        <div className="measure-note-text" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Info size={11} style={{ flexShrink: 0 }} />
                          <span>{m.note}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="measure-win-empty">
            <span className="measure-win-empty-icon" style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <BarChart2 size={36} strokeWidth={1.5} color="var(--accent, #38bdf8)" />
            </span>
            <div className="measure-win-empty-title">
              {availableSignals.length === 0
                ? t('measurementsPanel.noData')
                : t('measurementsPanel.noSignalSelected')}
            </div>
            <div className="measure-win-empty-desc">
              {availableSignals.length === 0
                ? t('measurementsPanel.noDataDesc')
                : t('measurementsPanel.noSignalSelectedDesc')}
            </div>
          </div>
        )}
      </div>

      {/* Footer Status Bar */}
      <div className="measure-win-footer">
        <span>
          Signal: <strong>{report.signalName.toUpperCase()}</strong> ({report.pointCount} points calculated)
        </span>
        <span className="measure-win-footer-hint">
          Evaluated via genuine ngspice simulation vectors · Trapezoidal integration & linear interpolation
        </span>
      </div>
    </div>
  )
}

export default AutomaticMeasurementsPanel

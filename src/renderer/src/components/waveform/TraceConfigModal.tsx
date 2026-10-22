import React, { useState } from "react"
import { Palette, X, Eye, EyeOff, Crosshair } from "lucide-react"
import type { TraceConfig } from "../../utils/waveformSettings"

export const PALETTE_COLORS = [
  "#10b981", // Emerald
  "#06b6d4", // Cyan
  "#f59e0b", // Amber
  "#ec4899", // Rose
  "#a855f7", // Purple
  "#eab308", // Yellow
  "#3b82f6", // Royal Blue
  "#14b8a6", // Teal
  "#f43f5e", // Crimson
  "#84cc16", // Lime
  "#f97316", // Bright Orange
  "#6366f1", // Indigo
]

export interface TraceConfigModalProps {
  isOpen: boolean
  onClose: () => void
  traces: Array<{ name: string; type?: string; unit?: string }>
  traceConfigs: Record<string, TraceConfig>
  selectedTraces: string[]
  panesCount: 1 | 2 | 3
  onUpdateTraceConfig: (traceName: string, config: Partial<TraceConfig>) => void
  onToggleTrace: (traceName: string) => void
  onSoloTrace: (traceName: string) => void
  onShowAll: () => void
  onHideAll: () => void
}

export const TraceConfigModal: React.FC<TraceConfigModalProps> = ({
  isOpen,
  onClose,
  traces,
  traceConfigs,
  selectedTraces,
  panesCount,
  onUpdateTraceConfig,
  onToggleTrace,
  onSoloTrace,
  onShowAll,
  onHideAll,
}) => {
  const [activeTraceName, setActiveTraceName] = useState<string>(traces[0]?.name || "")

  if (!isOpen) return null

  const activeTrace = traces.find((t) => t.name === activeTraceName) || traces[0]
  const currentConfig = (activeTrace && traceConfigs[activeTrace.name]) || {}
  const isSelected = activeTrace ? selectedTraces.includes(activeTrace.name) : false

  return (
    <div className="wf-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="wf-modal-window" onClick={(e) => e.stopPropagation()} style={{ width: "560px" }}>
        {/* Title bar */}
        <div className="wf-modal-header">
          <div className="wf-modal-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Palette size={15} />
            Trace Properties & Visibility
          </div>
          <button className="wf-modal-close" onClick={onClose} title="Close" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} />
          </button>
        </div>

        {/* Modal body */}
        <div className="wf-modal-body" style={{ display: "flex", gap: "16px", padding: "14px" }}>
          {/* Left list of traces */}
          <div style={{ width: "210px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>Signals</span>
              <div style={{ display: "flex", gap: "4px" }}>
                <button type="button" className="wf-mini-btn" onClick={onShowAll}>All</button>
                <button type="button" className="wf-mini-btn" onClick={onHideAll}>None</button>
              </div>
            </div>

            <div className="wf-trace-list-box">
              {traces.map((tr) => {
                const trCfg = traceConfigs[tr.name] || {}
                const isTrSelected = selectedTraces.includes(tr.name)
                const color = trCfg.color || "#06b6d4"
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
                    {trCfg.pane !== undefined && panesCount > 1 && (
                      <span className="wf-pane-tag">P{trCfg.pane + 1}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right trace detail editor */}
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
                    className={`wf-action-btn ${isSelected ? "active" : ""}`}
                    onClick={() => onToggleTrace(activeTrace.name)}
                    title={isSelected ? "Hide trace from plot" : "Show trace on plot"}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                  >
                    {isSelected ? (
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

              {/* Color picker */}
              <div className="wf-field-group">
                <label className="wf-field-label">Trace Color:</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "6px" }}>
                  {PALETTE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`wf-palette-btn ${currentConfig.color === c ? "selected" : ""}`}
                      style={{ background: c }}
                      onClick={() => onUpdateTraceConfig(activeTrace.name, { color: c })}
                      title={c}
                    />
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="color"
                    value={currentConfig.color || "#10b981"}
                    onChange={(e) => onUpdateTraceConfig(activeTrace.name, { color: e.target.value })}
                    style={{ width: "32px", height: "24px", border: "1px solid #cbd5e1", cursor: "pointer" }}
                  />
                  <input
                    type="text"
                    value={currentConfig.color || "#10b981"}
                    onChange={(e) => onUpdateTraceConfig(activeTrace.name, { color: e.target.value })}
                    className="wf-text-input"
                    style={{ width: "90px" }}
                  />
                </div>
              </div>

              {/* Line Width */}
              <div className="wf-field-group">
                <label className="wf-field-label">Line Thickness:</label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {[1, 2, 3, 4].map((w) => (
                    <button
                      key={w}
                      type="button"
                      className={`wf-option-btn ${(currentConfig.lineWidth || 2) === w ? "active" : ""}`}
                      onClick={() => onUpdateTraceConfig(activeTrace.name, { lineWidth: w })}
                    >
                      {w}px
                    </button>
                  ))}
                </div>
              </div>

              {/* Line Style */}
              <div className="wf-field-group">
                <label className="wf-field-label">Line Style:</label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {(["solid", "dashed", "dotted"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      className={`wf-option-btn ${(currentConfig.lineStyle || "solid") === st ? "active" : ""}`}
                      onClick={() => onUpdateTraceConfig(activeTrace.name, { lineStyle: st })}
                      style={{ textTransform: "capitalize" }}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pane Assignment (if panes > 1) */}
              {panesCount > 1 && (
                <div className="wf-field-group">
                  <label className="wf-field-label">Assigned Plot Pane:</label>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {Array.from({ length: panesCount }).map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={`wf-option-btn ${(currentConfig.pane ?? 0) === idx ? "active" : ""}`}
                        onClick={() => onUpdateTraceConfig(activeTrace.name, { pane: idx })}
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
              Select a trace from the left list.
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="wf-modal-footer">
          <button type="button" className="wf-primary-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default TraceConfigModal

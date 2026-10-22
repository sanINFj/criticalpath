import React, { useState, useMemo } from "react"
import { X, Check, AlertTriangle } from "lucide-react"
import {
  evaluateWaveformExpression,
  type MathTraceDefinition,
} from "../../utils/waveformMath"
import { PALETTE_COLORS } from "./TraceConfigModal"

export interface AddMathTraceModalProps {
  isOpen: boolean
  onClose: () => void
  availableSignals: string[]
  dataMap: Record<string, number[]>
  xVarName: string
  customMathTraces: MathTraceDefinition[]
  onAddMathTrace: (trace: MathTraceDefinition) => void
  onRemoveMathTrace: (id: string) => void
  panesCount: 1 | 2 | 3
}

export const AddMathTraceModal: React.FC<AddMathTraceModalProps> = ({
  isOpen,
  onClose,
  availableSignals,
  dataMap,
  xVarName,
  customMathTraces,
  onAddMathTrace,
  onRemoveMathTrace,
  panesCount,
}) => {
  const [expression, setExpression] = useState("")
  const [traceName, setTraceName] = useState("")
  const [selectedColor, setSelectedColor] = useState(PALETTE_COLORS[2])
  const [selectedPane, setSelectedPane] = useState(0)

  // Real-time evaluation test of the user's expression
  const evalResult = useMemo(() => {
    if (!expression.trim()) return null
    return evaluateWaveformExpression(expression, dataMap, xVarName)
  }, [expression, dataMap, xVarName])

  if (!isOpen) return null

  const handleInsert = (text: string) => {
    setExpression((prev) => prev + text)
    if (!traceName) {
      setTraceName(expression + text)
    }
  }

  const handleAdd = () => {
    if (!evalResult || !evalResult.success) return
    const id = `math_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const finalName = traceName.trim() || expression.trim()

    onAddMathTrace({
      id,
      name: finalName,
      expression: expression.trim(),
      color: selectedColor,
      lineWidth: 2,
      lineStyle: "solid",
      paneIndex: selectedPane,
      unit: evalResult.unit || "V",
    })

    setExpression("")
    setTraceName("")
    onClose()
  }

  return (
    <div className="wf-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="wf-modal-window" onClick={(e) => e.stopPropagation()} style={{ width: "560px" }}>
        {/* Header */}
        <div className="wf-modal-header">
          <div className="wf-modal-title">
            <span style={{ marginRight: "6px" }}>𝑓(𝑥)</span>
            Waveform Math Expression Builder
          </div>
          <button className="wf-modal-close" onClick={onClose} title="Close" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="wf-modal-body" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Expression Input */}
          <div className="wf-field-group">
            <label className="wf-field-label">Mathematical Expression:</label>
            <input
              type="text"
              className="wf-text-input"
              style={{ fontFamily: "'JetBrains Mono', Consolas, monospace", fontSize: "13px" }}
              placeholder="e.g. V(out) - V(in)  or  d(V(out))/dt  or  V(out)*I(R1)"
              value={expression}
              onChange={(e) => {
                setExpression(e.target.value)
                if (!traceName || traceName === expression) {
                  setTraceName(e.target.value)
                }
              }}
              autoFocus
            />
          </div>

          {/* Quick Operators & Functions Bar */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
            {["+", "-", "*", "/", "(", ")", "^2", "abs()", "d()/dt", "integ()", "sqrt()", "log10()"].map((op) => (
              <button
                key={op}
                type="button"
                className="wf-mini-btn"
                onClick={() => {
                  if (op === "abs()") handleInsert("abs()")
                  else if (op === "d()/dt") handleInsert("d()/dt")
                  else if (op === "integ()") handleInsert("integ()")
                  else if (op === "sqrt()") handleInsert("sqrt()")
                  else if (op === "log10()") handleInsert("log10()")
                  else handleInsert(` ${op} `)
                }}
              >
                {op}
              </button>
            ))}
          </div>

          {/* Available Circuit Signals Chips */}
          <div>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Insert Signal:
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px", maxHeight: "80px", overflowY: "auto" }}>
              {availableSignals.map((sig) => (
                <button
                  key={sig}
                  type="button"
                  className="wf-chip-btn"
                  onClick={() => handleInsert(sig)}
                  title={`Click to insert ${sig}`}
                >
                  {sig.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Real-time Syntax / Evaluation Status */}
          {expression.trim() && (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "4px",
                fontSize: "12px",
                fontFamily: "'JetBrains Mono', Consolas, monospace",
                background: evalResult?.success ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                color: evalResult?.success ? "#059669" : "#dc2626",
                border: `1px solid ${evalResult?.success ? "#10b981" : "#ef4444"}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {evalResult?.success ? (
                  <>
                    <Check size={14} style={{ flexShrink: 0 }} />
                    <span>Valid expression ({evalResult.data?.length || 0} points, unit: {evalResult.unit})</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                    <span>{evalResult?.error || "Invalid expression"}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Trace Name and Color & Pane */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px" }}>
            <div className="wf-field-group">
              <label className="wf-field-label">Display Trace Label:</label>
              <input
                type="text"
                className="wf-text-input"
                placeholder="e.g. Diff_Out"
                value={traceName}
                onChange={(e) => setTraceName(e.target.value)}
              />
            </div>

            {panesCount > 1 && (
              <div className="wf-field-group">
                <label className="wf-field-label">Pane:</label>
                <select
                  className="wf-select-input"
                  value={selectedPane}
                  onChange={(e) => setSelectedPane(Number(e.target.value))}
                >
                  {Array.from({ length: panesCount }).map((_, i) => (
                    <option key={i} value={i}>Pane {i + 1}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Color selection */}
          <div className="wf-field-group">
            <label className="wf-field-label">Trace Color:</label>
            <div style={{ display: "flex", gap: "6px" }}>
              {PALETTE_COLORS.slice(0, 8).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`wf-palette-btn ${selectedColor === c ? "selected" : ""}`}
                  style={{ background: c }}
                  onClick={() => setSelectedColor(c)}
                />
              ))}
            </div>
          </div>

          {/* Existing Custom Math Traces List */}
          {customMathTraces.length > 0 && (
            <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: "10px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                Active Math Traces:
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px", maxHeight: "100px", overflowY: "auto" }}>
                {customMathTraces.map((mt) => (
                  <div
                    key={mt.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "4px 8px",
                      background: "#f1f5f9",
                      borderRadius: "4px",
                      fontSize: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className="wf-color-swatch-sm" style={{ background: mt.color }} />
                      <strong>{mt.name}</strong>
                      <code style={{ fontSize: "11px", color: "#64748b" }}>={mt.expression}</code>
                    </div>
                    <button
                      type="button"
                      className="wf-mini-btn danger"
                      onClick={() => onRemoveMathTrace(mt.id)}
                      title="Remove math trace"
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

        {/* Footer */}
        <div className="wf-modal-footer">
          <button type="button" className="wf-secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="wf-primary-btn"
            disabled={!evalResult?.success}
            onClick={handleAdd}
          >
            Add Math Trace
          </button>
        </div>
      </div>
    </div>
  )
}

export default AddMathTraceModal

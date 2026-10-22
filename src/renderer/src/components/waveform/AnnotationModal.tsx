import React, { useState } from "react"
import { Tag, FileText, X } from "lucide-react"
import type { PlotAnnotation } from "../../utils/waveformSettings"
import { PALETTE_COLORS } from "./TraceConfigModal"

export interface AnnotationModalProps {
  isOpen: boolean
  onClose: () => void
  annotations: PlotAnnotation[]
  onAddAnnotation: (annotation: PlotAnnotation) => void
  onRemoveAnnotation: (id: string) => void
  onClearAnnotations: () => void
  currentX: number
  currentY: number
  panesCount: 1 | 2 | 3
}

export const AnnotationModal: React.FC<AnnotationModalProps> = ({
  isOpen,
  onClose,
  annotations,
  onAddAnnotation,
  onRemoveAnnotation,
  onClearAnnotations,
  currentX,
  currentY,
  panesCount,
}) => {
  const [type, setType] = useState<"text" | "refLineH" | "refLineV" | "arrow">("text")
  const [xVal, setXVal] = useState(currentX.toString())
  const [yVal, setYVal] = useState(currentY.toString())
  const [x2Val, setX2Val] = useState((currentX * 1.1 || currentX + 0.1).toString())
  const [y2Val, setY2Val] = useState((currentY * 1.1 || currentY + 0.5).toString())
  const [text, setText] = useState("")
  const [color, setColor] = useState("#f59e0b")
  const [pane, setPane] = useState(0)

  if (!isOpen) return null

  const handleAdd = () => {
    const x = parseFloat(xVal)
    const y = parseFloat(yVal)
    if (isNaN(x) || isNaN(y)) {
      alert("Please enter valid numeric X and Y values.")
      return
    }

    const id = `annot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const newAnnot: PlotAnnotation = {
      id,
      type,
      pane,
      x,
      y,
      text: text.trim(),
      color,
    }

    if (type === "arrow") {
      newAnnot.x2 = parseFloat(x2Val) || x
      newAnnot.y2 = parseFloat(y2Val) || y
    }

    onAddAnnotation(newAnnot)
    setText("")
  }

  return (
    <div className="wf-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="wf-modal-window" onClick={(e) => e.stopPropagation()} style={{ width: "520px" }}>
        {/* Header */}
        <div className="wf-modal-header">
          <div className="wf-modal-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Tag size={15} />
            Plot Annotations & Reference Lines
          </div>
          <button className="wf-modal-close" onClick={onClose} title="Close" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="wf-modal-body" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Annotation Type Selector */}
          <div className="wf-field-group">
            <label className="wf-field-label">Annotation Type:</label>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                className={`wf-option-btn ${type === "text" ? "active" : ""}`}
                onClick={() => setType("text")}
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <FileText size={13} />
                Text Note
              </button>
              <button
                type="button"
                className={`wf-option-btn ${type === "refLineH" ? "active" : ""}`}
                onClick={() => setType("refLineH")}
              >
                ━ Horizontal Line
              </button>
              <button
                type="button"
                className={`wf-option-btn ${type === "refLineV" ? "active" : ""}`}
                onClick={() => setType("refLineV")}
              >
                ┃ Vertical Line
              </button>
              <button
                type="button"
                className={`wf-option-btn ${type === "arrow" ? "active" : ""}`}
                onClick={() => setType("arrow")}
              >
                ↗ Arrow
              </button>
            </div>
          </div>

          {/* Coordinates Inputs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="wf-field-group">
              <label className="wf-field-label">
                {type === "refLineV" ? "X Position:" : type === "arrow" ? "Start X:" : "X Position:"}
              </label>
              <input
                type="number"
                step="any"
                className="wf-text-input"
                value={xVal}
                onChange={(e) => setXVal(e.target.value)}
              />
            </div>

            <div className="wf-field-group">
              <label className="wf-field-label">
                {type === "refLineH" ? "Y Level (V / A):" : type === "arrow" ? "Start Y:" : "Y Position:"}
              </label>
              <input
                type="number"
                step="any"
                className="wf-text-input"
                value={yVal}
                onChange={(e) => setYVal(e.target.value)}
              />
            </div>
          </div>

          {/* Arrow End Coordinates */}
          {type === "arrow" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className="wf-field-group">
                <label className="wf-field-label">End X (Arrowhead):</label>
                <input
                  type="number"
                  step="any"
                  className="wf-text-input"
                  value={x2Val}
                  onChange={(e) => setX2Val(e.target.value)}
                />
              </div>
              <div className="wf-field-group">
                <label className="wf-field-label">End Y (Arrowhead):</label>
                <input
                  type="number"
                  step="any"
                  className="wf-text-input"
                  value={y2Val}
                  onChange={(e) => setY2Val(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Label / Text note */}
          <div className="wf-field-group">
            <label className="wf-field-label">Label / Text Content:</label>
            <input
              type="text"
              className="wf-text-input"
              placeholder={
                type === "refLineH"
                  ? "e.g. Threshold = 2.5V"
                  : type === "refLineV"
                  ? "e.g. Pulse Trigger"
                  : "e.g. Peak Voltage Node A"
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {/* Color & Pane */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px" }}>
            <div className="wf-field-group">
              <label className="wf-field-label">Color:</label>
              <div style={{ display: "flex", gap: "6px" }}>
                {PALETTE_COLORS.slice(0, 8).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`wf-palette-btn ${color === c ? "selected" : ""}`}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>

            {panesCount > 1 && (
              <div className="wf-field-group">
                <label className="wf-field-label">Pane:</label>
                <select
                  className="wf-select-input"
                  value={pane}
                  onChange={(e) => setPane(Number(e.target.value))}
                >
                  {Array.from({ length: panesCount }).map((_, i) => (
                    <option key={i} value={i}>Pane {i + 1}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="wf-primary-btn" onClick={handleAdd}>
              + Add Annotation
            </button>
          </div>

          {/* Existing Annotations List */}
          {annotations.length > 0 && (
            <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                  Existing Annotations ({annotations.length}):
                </span>
                <button type="button" className="wf-mini-btn danger" onClick={onClearAnnotations}>
                  Clear All
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "120px", overflowY: "auto" }}>
                {annotations.map((annot) => (
                  <div
                    key={annot.id}
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
                      title="Delete"
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
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default AnnotationModal

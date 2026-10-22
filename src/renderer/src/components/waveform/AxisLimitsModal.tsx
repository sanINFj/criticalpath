import React, { useState } from "react"
import { Sliders, X } from "lucide-react"
import { formatEngineering } from "../../utils/engineeringFormat"

export interface AxisLimitsModalProps {
  isOpen: boolean
  onClose: () => void
  xUnit: string
  activeXRange: [number, number]
  naturalXRange: [number, number]
  activeYLeftRange: [number, number]
  naturalYLeftRange: [number, number]
  hasRightAxis: boolean
  activeYRightRange: [number, number]
  naturalYRightRange: [number, number]
  useLogX: boolean
  onApplyLimits: (limits: {
    xRange: [number, number] | null
    yLeftRange: [number, number] | null
    yRightRange: [number, number] | null
    useLogX: boolean
  }) => void
  onResetAuto: () => void
}

export const AxisLimitsModal: React.FC<AxisLimitsModalProps> = ({
  isOpen,
  onClose,
  xUnit,
  activeXRange,
  naturalXRange,
  activeYLeftRange,
  naturalYLeftRange,
  hasRightAxis,
  activeYRightRange,
  naturalYRightRange,
  useLogX,
  onApplyLimits,
  onResetAuto,
}) => {
  const [isXAuto, setIsXAuto] = useState(false)
  const [xMinStr, setXMinStr] = useState(activeXRange[0].toString())
  const [xMaxStr, setXMaxStr] = useState(activeXRange[1].toString())

  const [isYLeftAuto, setIsYLeftAuto] = useState(false)
  const [yLeftMinStr, setYLeftMinStr] = useState(activeYLeftRange[0].toString())
  const [yLeftMaxStr, setYLeftMaxStr] = useState(activeYLeftRange[1].toString())

  const [isYRightAuto, setIsYRightAuto] = useState(false)
  const [yRightMinStr, setYRightMinStr] = useState(activeYRightRange[0].toString())
  const [yRightMaxStr, setYRightMaxStr] = useState(activeYRightRange[1].toString())

  const [logX, setLogX] = useState(useLogX)

  if (!isOpen) return null

  const handleApply = () => {
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

    onApplyLimits({
      xRange: newXRange,
      yLeftRange: newYLeftRange,
      yRightRange: newYRightRange,
      useLogX: logX,
    })
    onClose()
  }

  const handleFillNatural = () => {
    setXMinStr(naturalXRange[0].toString())
    setXMaxStr(naturalXRange[1].toString())
    setYLeftMinStr(naturalYLeftRange[0].toString())
    setYLeftMaxStr(naturalYLeftRange[1].toString())
    setYRightMinStr(naturalYRightRange[0].toString())
    setYRightMaxStr(naturalYRightRange[1].toString())
    setIsXAuto(true)
    setIsYLeftAuto(true)
    setIsYRightAuto(true)
  }

  return (
    <div className="wf-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="wf-modal-window" onClick={(e) => e.stopPropagation()} style={{ width: "480px" }}>
        {/* Header */}
        <div className="wf-modal-header">
          <div className="wf-modal-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Sliders size={15} />
            Manual Axis Limits & Scale
          </div>
          <button className="wf-modal-close" onClick={onClose} title="Close" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="wf-modal-body" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Horizontal X-Axis Section */}
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
                  <span>Logarithmic scale</span>
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

          {/* Left Vertical Y-Axis (Voltages/dB) */}
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
                  <label className="wf-field-label">Min Y:</label>
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
                  <label className="wf-field-label">Max Y:</label>
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

          {/* Right Vertical Y-Axis (Currents / Phase) */}
          {hasRightAxis && (
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
        </div>

        {/* Footer */}
        <div className="wf-modal-footer">
          <button
            type="button"
            className="wf-secondary-btn"
            onClick={() => {
              handleFillNatural()
              onResetAuto()
              onClose()
            }}
          >
            Autoscale All (Fit)
          </button>
          <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
            <button type="button" className="wf-secondary-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="wf-primary-btn" onClick={handleApply}>
              Apply Limits
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AxisLimitsModal

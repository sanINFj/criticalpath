import { useState, useEffect, useMemo } from "react"

export type AnalysisType = "tran" | "ac" | "dc" | "op"

export interface AnalysisConfig {
  type: AnalysisType
  // .tran
  tranStopTime: string
  tranStartTime: string
  tranMaxStep: string
  tranUic: boolean
  // .ac
  acSweepType: "dec" | "oct" | "lin"
  acPoints: string
  acStartFreq: string
  acStopFreq: string
  // .dc
  dcSource1: string
  dcSweepType: "lin" | "dec" | "oct"
  dcStart1: string
  dcStop1: string
  dcStep1: string
  dcEnableSource2: boolean
  dcSource2: string
  dcStart2: string
  dcStop2: string
  dcStep2: string
  // Computed directive command
  command: string
}

export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  type: "tran",
  tranStopTime: "10m",
  tranStartTime: "0",
  tranMaxStep: "10u",
  tranUic: false,
  acSweepType: "dec",
  acPoints: "100",
  acStartFreq: "10",
  acStopFreq: "1Meg",
  dcSource1: "V1",
  dcSweepType: "lin",
  dcStart1: "0",
  dcStop1: "5",
  dcStep1: "0.1",
  dcEnableSource2: false,
  dcSource2: "V2",
  dcStart2: "0",
  dcStop2: "5",
  dcStep2: "1",
  command: ".tran 10m",
}

export function computeSpiceCommand(config: AnalysisConfig): string {
  switch (config.type) {
    case "tran": {
      const parts = [".tran"]
      if (config.tranMaxStep && config.tranMaxStep.trim()) {
        parts.push(config.tranMaxStep.trim())
      }
      parts.push(config.tranStopTime.trim() || "10m")
      if (config.tranStartTime && config.tranStartTime.trim() && config.tranStartTime.trim() !== "0") {
        parts.push(config.tranStartTime.trim())
      }
      if (config.tranUic) {
        parts.push("uic")
      }
      return parts.join(" ")
    }
    case "ac": {
      const type = config.acSweepType || "dec"
      const pts = config.acPoints.trim() || "100"
      const fstart = config.acStartFreq.trim() || "10"
      const fstop = config.acStopFreq.trim() || "1Meg"
      return `.ac ${type} ${pts} ${fstart} ${fstop}`
    }
    case "dc": {
      const src1 = config.dcSource1.trim() || "V1"
      const start1 = config.dcStart1.trim() || "0"
      const stop1 = config.dcStop1.trim() || "5"
      const step1 = config.dcStep1.trim() || "0.1"
      let cmd = `.dc ${src1} ${start1} ${stop1} ${step1}`
      if (config.dcEnableSource2 && config.dcSource2.trim()) {
        const src2 = config.dcSource2.trim()
        const start2 = config.dcStart2.trim() || "0"
        const stop2 = config.dcStop2.trim() || "5"
        const step2 = config.dcStep2.trim() || "1"
        cmd += ` ${src2} ${start2} ${stop2} ${step2}`
      }
      return cmd
    }
    case "op":
    default:
      return ".op"
  }
}

interface ConfigureAnalysisModalProps {
  isOpen: boolean
  onClose: () => void
  currentConfig: AnalysisConfig
  onApplyConfig: (config: AnalysisConfig) => void
}

export default function ConfigureAnalysisModal({
  isOpen,
  onClose,
  currentConfig,
  onApplyConfig,
}: ConfigureAnalysisModalProps) {
  const [config, setConfig] = useState<AnalysisConfig>(currentConfig)
  const [activeTab, setActiveTab] = useState<AnalysisType>(currentConfig.type)

  useEffect(() => {
    if (isOpen) {
      setConfig(currentConfig)
      setActiveTab(currentConfig.type)
    }
  }, [isOpen, currentConfig])

  // Close on Escape, OK on Enter
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      } else if (e.key === "Enter" && !e.shiftKey) {
        const target = e.target as HTMLElement
        if (target.tagName !== "TEXTAREA") {
          e.preventDefault()
          handleOk()
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, config, activeTab])

  const liveCommand = useMemo(() => {
    return computeSpiceCommand({ ...config, type: activeTab })
  }, [config, activeTab])

  if (!isOpen) return null

  const handleOk = () => {
    const updated: AnalysisConfig = {
      ...config,
      type: activeTab,
      command: liveCommand,
    }
    onApplyConfig(updated)
    onClose()
  }

  return (
    <div
      className="cfg-analysis-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cfg-analysis-dialog-title"
    >
      <div
        className="cfg-analysis-win-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Windows Titlebar */}
        <div className="cfg-analysis-win-titlebar">
          <div className="cfg-analysis-win-title">
            <span className="cfg-analysis-win-title-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="14" height="12" fill="#0055ea" />
                <path d="M3 8 L6 11 L10 5 L13 8" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span id="cfg-analysis-dialog-title">Edit Simulation Command</span>
          </div>
          <button
            type="button"
            className="cfg-analysis-win-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
            title="Cancel (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Dialog Content Area */}
        <div className="cfg-analysis-win-body">
          {/* Classic Windows PropertySheet Tabs */}
          <div className="cfg-analysis-win-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "tran"}
              className={`cfg-analysis-win-tab ${activeTab === "tran" ? "active" : ""}`}
              onClick={() => setActiveTab("tran")}
            >
              Transient (.tran)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "ac"}
              className={`cfg-analysis-win-tab ${activeTab === "ac" ? "active" : ""}`}
              onClick={() => setActiveTab("ac")}
            >
              AC Analysis (.ac)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "dc"}
              className={`cfg-analysis-win-tab ${activeTab === "dc" ? "active" : ""}`}
              onClick={() => setActiveTab("dc")}
            >
              DC Sweep (.dc)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "op"}
              className={`cfg-analysis-win-tab ${activeTab === "op" ? "active" : ""}`}
              onClick={() => setActiveTab("op")}
            >
              DC op pnt (.op)
            </button>
          </div>

          {/* Tab Pane Frame */}
          <div className="cfg-analysis-win-tab-pane">
            {/* 1. Transient Tab */}
            {activeTab === "tran" && (
              <div className="cfg-analysis-pane-content">
                <div className="cfg-analysis-pane-hint">
                  Compute circuit voltages and currents as a function of time.
                </div>

                <fieldset className="cfg-analysis-fieldset">
                  <legend className="cfg-analysis-legend">Timing Parameters</legend>

                  <div className="cfg-analysis-form-grid">
                    <label className="cfg-analysis-label" htmlFor="tran-stop-time">
                      Stop time: <span className="cfg-req">*</span>
                    </label>
                    <div className="cfg-analysis-input-wrap">
                      <input
                        id="tran-stop-time"
                        type="text"
                        className="cfg-analysis-input"
                        value={config.tranStopTime}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, tranStopTime: e.target.value }))
                        }
                        placeholder="e.g. 10m, 1s, 100u"
                        autoFocus
                      />
                      <span className="cfg-analysis-hint">Seconds (e.g. 10m, 500u)</span>
                    </div>

                    <label className="cfg-analysis-label" htmlFor="tran-start-time">
                      Time to start saving:
                    </label>
                    <div className="cfg-analysis-input-wrap">
                      <input
                        id="tran-start-time"
                        type="text"
                        className="cfg-analysis-input"
                        value={config.tranStartTime}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, tranStartTime: e.target.value }))
                        }
                        placeholder="0 (default)"
                      />
                      <span className="cfg-analysis-hint">Optional (default: 0)</span>
                    </div>

                    <label className="cfg-analysis-label" htmlFor="tran-max-step">
                      Maximum Timestep:
                    </label>
                    <div className="cfg-analysis-input-wrap">
                      <input
                        id="tran-max-step"
                        type="text"
                        className="cfg-analysis-input"
                        value={config.tranMaxStep}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, tranMaxStep: e.target.value }))
                        }
                        placeholder="e.g. 10u, 1n"
                      />
                      <span className="cfg-analysis-hint">Optional step ceiling</span>
                    </div>
                  </div>
                </fieldset>

                <div className="cfg-analysis-checkbox-row">
                  <label className="cfg-analysis-checkbox-label">
                    <input
                      type="checkbox"
                      checked={config.tranUic}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, tranUic: e.target.checked }))
                      }
                    />
                    <span>Skip initial operating point solution (UIC)</span>
                  </label>
                </div>
              </div>
            )}

            {/* 2. AC Analysis Tab */}
            {activeTab === "ac" && (
              <div className="cfg-analysis-pane-content">
                <div className="cfg-analysis-pane-hint">
                  Compute small-signal AC frequency response (amplitude and phase).
                </div>

                <fieldset className="cfg-analysis-fieldset">
                  <legend className="cfg-analysis-legend">Frequency Sweep Parameters</legend>

                  <div className="cfg-analysis-form-grid">
                    <label className="cfg-analysis-label" htmlFor="ac-sweep-type">
                      Type of Sweep:
                    </label>
                    <div className="cfg-analysis-input-wrap">
                      <select
                        id="ac-sweep-type"
                        className="cfg-analysis-select"
                        value={config.acSweepType}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            acSweepType: e.target.value as "dec" | "oct" | "lin",
                          }))
                        }
                      >
                        <option value="dec">Decade (.ac dec)</option>
                        <option value="oct">Octave (.ac oct)</option>
                        <option value="lin">Linear (.ac lin)</option>
                      </select>
                    </div>

                    <label className="cfg-analysis-label" htmlFor="ac-points">
                      Number of points:
                    </label>
                    <div className="cfg-analysis-input-wrap">
                      <input
                        id="ac-points"
                        type="text"
                        className="cfg-analysis-input"
                        value={config.acPoints}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, acPoints: e.target.value }))
                        }
                        placeholder="e.g. 100"
                        autoFocus
                      />
                      <span className="cfg-analysis-hint">Points per decade/octave or total</span>
                    </div>

                    <label className="cfg-analysis-label" htmlFor="ac-start-freq">
                      Start Frequency:
                    </label>
                    <div className="cfg-analysis-input-wrap">
                      <input
                        id="ac-start-freq"
                        type="text"
                        className="cfg-analysis-input"
                        value={config.acStartFreq}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, acStartFreq: e.target.value }))
                        }
                        placeholder="e.g. 10, 1Hz"
                      />
                      <span className="cfg-analysis-hint">Hertz (e.g. 10, 1k, 1Meg)</span>
                    </div>

                    <label className="cfg-analysis-label" htmlFor="ac-stop-freq">
                      Stop Frequency:
                    </label>
                    <div className="cfg-analysis-input-wrap">
                      <input
                        id="ac-stop-freq"
                        type="text"
                        className="cfg-analysis-input"
                        value={config.acStopFreq}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, acStopFreq: e.target.value }))
                        }
                        placeholder="e.g. 1Meg, 100k"
                      />
                      <span className="cfg-analysis-hint">Hertz (e.g. 100k, 1Meg, 10G)</span>
                    </div>
                  </div>
                </fieldset>
              </div>
            )}

            {/* 3. DC Sweep Tab */}
            {activeTab === "dc" && (
              <div className="cfg-analysis-pane-content">
                <div className="cfg-analysis-pane-hint">
                  Sweep independent DC voltage or current sources across ranges.
                </div>

                <fieldset className="cfg-analysis-fieldset">
                  <legend className="cfg-analysis-legend">1st Source Parameters</legend>

                  <div className="cfg-analysis-form-grid">
                    <label className="cfg-analysis-label" htmlFor="dc-source1">
                      1st Source Name:
                    </label>
                    <div className="cfg-analysis-input-wrap">
                      <input
                        id="dc-source1"
                        type="text"
                        className="cfg-analysis-input"
                        value={config.dcSource1}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, dcSource1: e.target.value }))
                        }
                        placeholder="e.g. V1, I1"
                        autoFocus
                      />
                      <span className="cfg-analysis-hint">DC voltage or current source name</span>
                    </div>

                    <label className="cfg-analysis-label" htmlFor="dc-start1">
                      Start Value:
                    </label>
                    <div className="cfg-analysis-input-wrap">
                      <input
                        id="dc-start1"
                        type="text"
                        className="cfg-analysis-input"
                        value={config.dcStart1}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, dcStart1: e.target.value }))
                        }
                        placeholder="e.g. 0"
                      />
                    </div>

                    <label className="cfg-analysis-label" htmlFor="dc-stop1">
                      Stop Value:
                    </label>
                    <div className="cfg-analysis-input-wrap">
                      <input
                        id="dc-stop1"
                        type="text"
                        className="cfg-analysis-input"
                        value={config.dcStop1}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, dcStop1: e.target.value }))
                        }
                        placeholder="e.g. 5"
                      />
                    </div>

                    <label className="cfg-analysis-label" htmlFor="dc-step1">
                      Increment:
                    </label>
                    <div className="cfg-analysis-input-wrap">
                      <input
                        id="dc-step1"
                        type="text"
                        className="cfg-analysis-input"
                        value={config.dcStep1}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, dcStep1: e.target.value }))
                        }
                        placeholder="e.g. 0.1"
                      />
                    </div>
                  </div>
                </fieldset>

                <div className="cfg-analysis-checkbox-row">
                  <label className="cfg-analysis-checkbox-label">
                    <input
                      type="checkbox"
                      checked={config.dcEnableSource2}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          dcEnableSource2: e.target.checked,
                        }))
                      }
                    />
                    <span>Enable 2nd source sweep (nested parameter curves)</span>
                  </label>
                </div>

                {config.dcEnableSource2 && (
                  <fieldset className="cfg-analysis-fieldset" style={{ marginTop: 8 }}>
                    <legend className="cfg-analysis-legend">2nd Source Parameters</legend>
                    <div className="cfg-analysis-form-grid">
                      <label className="cfg-analysis-label" htmlFor="dc-source2">
                        2nd Source Name:
                      </label>
                      <div className="cfg-analysis-input-wrap">
                        <input
                          id="dc-source2"
                          type="text"
                          className="cfg-analysis-input"
                          value={config.dcSource2}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, dcSource2: e.target.value }))
                          }
                          placeholder="e.g. V2"
                        />
                      </div>

                      <label className="cfg-analysis-label">
                        Start / Stop / Step:
                      </label>
                      <div className="cfg-analysis-input-row">
                        <input
                          id="dc-start2"
                          type="text"
                          className="cfg-analysis-input"
                          style={{ flex: 1 }}
                          value={config.dcStart2}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, dcStart2: e.target.value }))
                          }
                          placeholder="Start"
                        />
                        <input
                          type="text"
                          className="cfg-analysis-input"
                          style={{ flex: 1 }}
                          value={config.dcStop2}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, dcStop2: e.target.value }))
                          }
                          placeholder="Stop"
                        />
                        <input
                          type="text"
                          className="cfg-analysis-input"
                          style={{ flex: 1 }}
                          value={config.dcStep2}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, dcStep2: e.target.value }))
                          }
                          placeholder="Step"
                        />
                      </div>
                    </div>
                  </fieldset>
                )}
              </div>
            )}

            {/* 4. DC op pnt Tab */}
            {activeTab === "op" && (
              <div className="cfg-analysis-pane-content">
                <div className="cfg-analysis-pane-hint">
                  Compute DC operating point voltages and currents.
                </div>

                <fieldset className="cfg-analysis-fieldset">
                  <legend className="cfg-analysis-legend">Operating Point Analysis (.op)</legend>
                  <p className="cfg-analysis-op-text">
                    Operating Point analysis evaluates the steady-state DC bias voltages at all circuit nodes and operating currents across components with all capacitors open-circuited and all inductors short-circuited.
                  </p>
                  <p className="cfg-analysis-op-text" style={{ marginTop: 6 }}>
                    No time, frequency, or sweep parameters are required.
                  </p>
                </fieldset>
              </div>
            )}
          </div>

          {/* SPICE Command Box */}
          <div className="cfg-analysis-cmd-container">
            <span className="cfg-analysis-cmd-label">SPICE Directive:</span>
            <input
              type="text"
              readOnly
              className="cfg-analysis-cmd-field"
              value={liveCommand}
              title="Generated SPICE directive command"
            />
          </div>
        </div>

        {/* Dialog Footer Actions */}
        <div className="cfg-analysis-win-footer">
          <div className="cfg-analysis-win-hint">
            Press <kbd>Enter</kbd> to apply · <kbd>Esc</kbd> to cancel
          </div>
          <div className="cfg-analysis-win-actions">
            <button
              type="button"
              className="cfg-analysis-win-btn cfg-analysis-win-btn-primary"
              onClick={handleOk}
            >
              OK
            </button>
            <button
              type="button"
              className="cfg-analysis-win-btn"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

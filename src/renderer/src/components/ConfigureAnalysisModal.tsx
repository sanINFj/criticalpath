import { useState, useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"

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
  command: ".tran 10u 10m",
}

export function computeSpiceCommand(config: AnalysisConfig): string {
  switch (config.type) {
    case "tran": {
      const parts = [".tran"]
      const step = config.tranMaxStep?.trim() || "10u"
      const stop = config.tranStopTime?.trim() || "10m"
      parts.push(step, stop)
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
  const { t } = useTranslation('common')
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
            <span id="cfg-analysis-dialog-title">{t('analysis.title')}</span>
          </div>
          <button
            type="button"
            className="cfg-analysis-win-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
            title={`${t('actions.cancel')} (Esc)`}
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={14} />
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
              {t('analysis.tabs.tran')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "ac"}
              className={`cfg-analysis-win-tab ${activeTab === "ac" ? "active" : ""}`}
              onClick={() => setActiveTab("ac")}
            >
              {t('analysis.tabs.ac')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "dc"}
              className={`cfg-analysis-win-tab ${activeTab === "dc" ? "active" : ""}`}
              onClick={() => setActiveTab("dc")}
            >
              {t('analysis.tabs.dc')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "op"}
              className={`cfg-analysis-win-tab ${activeTab === "op" ? "active" : ""}`}
              onClick={() => setActiveTab("op")}
            >
              {t('analysis.tabs.op')}
            </button>
          </div>

          {/* Tab Pane Frame */}
          <div className="cfg-analysis-win-tab-pane">
            {/* 1. Transient Tab */}
            {activeTab === "tran" && (
              <div className="cfg-analysis-pane-content">
                <div className="cfg-analysis-pane-hint">
                  {t('analysis.tran.hint')}
                </div>

                <fieldset className="cfg-analysis-fieldset">
                  <legend className="cfg-analysis-legend">{t('analysis.tran.timingParams')}</legend>

                  <div className="cfg-analysis-form-grid">
                    <label className="cfg-analysis-label" htmlFor="tran-stop-time">
                      {t('analysis.tran.stopTime')} <span className="cfg-req">*</span>
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
                      <span className="cfg-analysis-hint">{t('analysis.tran.stopTimeHint')}</span>
                    </div>

                    <label className="cfg-analysis-label" htmlFor="tran-start-time">
                      {t('analysis.tran.startTime')}
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
                      <span className="cfg-analysis-hint">{t('analysis.tran.startTimeHint')}</span>
                    </div>

                    <label className="cfg-analysis-label" htmlFor="tran-max-step">
                      {t('analysis.tran.maxStep')}
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
                      <span className="cfg-analysis-hint">{t('analysis.tran.maxStepHint')}</span>
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
                    <span>{t('analysis.tran.uic')}</span>
                  </label>
                </div>
              </div>
            )}

            {/* 2. AC Analysis Tab */}
            {activeTab === "ac" && (
              <div className="cfg-analysis-pane-content">
                <div className="cfg-analysis-pane-hint">
                  {t('analysis.ac.hint')}
                </div>

                <fieldset className="cfg-analysis-fieldset">
                  <legend className="cfg-analysis-legend">{t('analysis.ac.sweepParams')}</legend>

                  <div className="cfg-analysis-form-grid">
                    <label className="cfg-analysis-label" htmlFor="ac-sweep-type">
                      {t('analysis.ac.sweepType')}
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
                        <option value="dec">{t('analysis.ac.decade')}</option>
                        <option value="oct">{t('analysis.ac.octave')}</option>
                        <option value="lin">{t('analysis.ac.linear')}</option>
                      </select>
                    </div>

                    <label className="cfg-analysis-label" htmlFor="ac-points">
                      {t('analysis.ac.numPoints')}
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
                      <span className="cfg-analysis-hint">{t('analysis.ac.numPointsHint')}</span>
                    </div>

                    <label className="cfg-analysis-label" htmlFor="ac-start-freq">
                      {t('analysis.ac.startFreq')}
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
                      <span className="cfg-analysis-hint">{t('analysis.ac.startFreqHint')}</span>
                    </div>

                    <label className="cfg-analysis-label" htmlFor="ac-stop-freq">
                      {t('analysis.ac.stopFreq')}
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
                      <span className="cfg-analysis-hint">{t('analysis.ac.stopFreqHint')}</span>
                    </div>
                  </div>
                </fieldset>
              </div>
            )}

            {/* 3. DC Sweep Tab */}
            {activeTab === "dc" && (
              <div className="cfg-analysis-pane-content">
                <div className="cfg-analysis-pane-hint">
                  {t('analysis.dc.hint')}
                </div>

                <fieldset className="cfg-analysis-fieldset">
                  <legend className="cfg-analysis-legend">{t('analysis.dc.source1Params')}</legend>

                  <div className="cfg-analysis-form-grid">
                    <label className="cfg-analysis-label" htmlFor="dc-source1">
                      {t('analysis.dc.source1Name')}
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
                      <span className="cfg-analysis-hint">{t('analysis.dc.source1NameHint')}</span>
                    </div>

                    <label className="cfg-analysis-label" htmlFor="dc-start1">
                      {t('analysis.dc.startVal')}
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
                      {t('analysis.dc.stopVal')}
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
                      {t('analysis.dc.incrVal')}
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
                    <span>{t('analysis.dc.enableSource2')}</span>
                  </label>
                </div>

                {config.dcEnableSource2 && (
                  <fieldset className="cfg-analysis-fieldset" style={{ marginTop: 8 }}>
                    <legend className="cfg-analysis-legend">{t('analysis.dc.source2Params')}</legend>
                    <div className="cfg-analysis-form-grid">
                      <label className="cfg-analysis-label" htmlFor="dc-source2">
                        {t('analysis.dc.source2Name')}
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
                        {t('analysis.dc.startStopStep')}
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
                  {t('analysis.op.hint')}
                </div>

                <fieldset className="cfg-analysis-fieldset">
                  <legend className="cfg-analysis-legend">{t('analysis.op.title')}</legend>
                  <p className="cfg-analysis-op-text">
                    {t('analysis.op.desc1')}
                  </p>
                  <p className="cfg-analysis-op-text" style={{ marginTop: 6 }}>
                    {t('analysis.op.desc2')}
                  </p>
                </fieldset>
              </div>
            )}
          </div>

          {/* SPICE Command Box */}
          <div className="cfg-analysis-cmd-container">
            <span className="cfg-analysis-cmd-label">{t('analysis.directive')}</span>
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
            {t('analysis.hintKeys')}
          </div>
          <div className="cfg-analysis-win-actions">
            <button
              type="button"
              className="cfg-analysis-win-btn cfg-analysis-win-btn-primary"
              onClick={handleOk}
            >
              {t('actions.ok')}
            </button>
            <button
              type="button"
              className="cfg-analysis-win-btn"
              onClick={onClose}
            >
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

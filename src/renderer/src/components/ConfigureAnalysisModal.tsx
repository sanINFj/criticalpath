/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useMemo, type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Plus, Trash2, Zap } from 'lucide-react'

export type AnalysisType = 'tran' | 'ac' | 'dc' | 'op' | 'digital'

export interface DigitalPortStimulus {
  id: string
  portName: string
  type: 'pattern' | 'clock' | 'high' | 'low'
  pattern?: string // e.g. "01010101"
  bitPeriod?: string // e.g. "10u"
  clockFreq?: string // e.g. "100k"
  clockDuty?: string // e.g. "50%"
}

export interface AnalysisConfig {
  type: AnalysisType
  // .tran
  tranStopTime: string
  tranStartTime: string
  tranMaxStep: string
  tranUic: boolean
  // .ac
  acSweepType: 'dec' | 'oct' | 'lin'
  acPoints: string
  acStartFreq: string
  acStopFreq: string
  // .dc
  dcSource1: string
  dcSweepType: 'lin' | 'dec' | 'oct'
  dcStart1: string
  dcStop1: string
  dcStep1: string
  dcEnableSource2: boolean
  dcSource2: string
  dcStart2: string
  dcStop2: string
  dcStep2: string
  // .digital (Virtuoso-grade Digital Logic Analysis)
  digitalStopTime: string
  digitalStartTime: string
  digitalMaxStep: string
  digitalDelay: string
  digitalRiseTime: string
  digitalFallTime: string
  digitalVcc: string
  digitalGnd: string
  digitalUic: boolean
  digitalAccuracy: 'conservative' | 'moderate' | 'liberal'
  digitalPorts: DigitalPortStimulus[]
  // Computed directive command
  command: string
}

export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  type: 'tran',
  tranStopTime: '10m',
  tranStartTime: '0',
  tranMaxStep: '10u',
  tranUic: false,
  acSweepType: 'dec',
  acPoints: '100',
  acStartFreq: '10',
  acStopFreq: '1Meg',
  dcSource1: 'V1',
  dcSweepType: 'lin',
  dcStart1: '0',
  dcStop1: '5',
  dcStep1: '0.1',
  dcEnableSource2: false,
  dcSource2: 'V2',
  dcStart2: '0',
  dcStop2: '5',
  dcStep2: '1',
  digitalStopTime: '40u',
  digitalStartTime: '0',
  digitalMaxStep: '50n',
  digitalDelay: '0',
  digitalRiseTime: '1n',
  digitalFallTime: '1n',
  digitalVcc: '5',
  digitalGnd: '0',
  digitalUic: true,
  digitalAccuracy: 'conservative',
  digitalPorts: [
    { id: 'p1', portName: 'A', type: 'pattern', pattern: '01010101', bitPeriod: '10u' },
    { id: 'p2', portName: 'B', type: 'pattern', pattern: '00110011', bitPeriod: '10u' },
    { id: 'p3', portName: 'CLK', type: 'clock', clockFreq: '100k', clockDuty: '50%' }
  ],
  command: '.tran 10u 10m'
}

export function parseEngineeringSeconds(val?: string, fallback: number = 1e-6): number {
  if (!val) return fallback
  const s = val.trim().toLowerCase()
  if (!s) return fallback
  if (s.endsWith('fs')) return parseFloat(s) * 1e-15
  if (s.endsWith('ps')) return parseFloat(s) * 1e-12
  if (s.endsWith('ns')) return parseFloat(s) * 1e-9
  if (s.endsWith('us') || s.endsWith('u')) return parseFloat(s) * 1e-6
  if (s.endsWith('ms') || s.endsWith('m')) return parseFloat(s) * 1e-3
  if (s.endsWith('s')) return parseFloat(s)
  const num = parseFloat(s)
  return isNaN(num) ? fallback : num
}

export function generateDigitalStimulusSpice(config: AnalysisConfig): string[] {
  const cards: string[] = []
  const vccVal = config.digitalVcc?.trim() || '5'
  const gndVal = config.digitalGnd?.trim() || '0'
  const tr = config.digitalRiseTime?.trim() || '1n'
  const tf = config.digitalFallTime?.trim() || '1n'
  const tDelay = config.digitalDelay?.trim() || '0'

  if (config.digitalAccuracy === 'conservative') {
    cards.push('.options reltol=1e-4 trtol=1 chgtol=1e-15 method=gear')
  } else if (config.digitalAccuracy === 'liberal') {
    cards.push('.options reltol=1e-2')
  } else {
    cards.push('.options reltol=1e-3 method=trap')
  }

  cards.push(`* Digital Rail Supplies`)
  cards.push(`V_VCC_INTERNAL VCC 0 ${vccVal}`)

  if (config.digitalPorts && config.digitalPorts.length > 0) {
    cards.push(`* Digital Port Stimuli & Bit Patterns`)
    config.digitalPorts.forEach((port) => {
      const pName = (port.portName || '').trim()
      if (!pName) return
      const cleanName = pName.replace(/[^a-zA-Z0-9_]/g, '_')

      if (port.type === 'clock') {
        const freqStr = (port.clockFreq || '100k').trim()
        let freq = 100000
        const fLow = freqStr.toLowerCase()
        if (fLow.endsWith('meg') || fLow.endsWith('mhz')) {
          freq = parseFloat(fLow) * 1e6
        } else if (fLow.endsWith('k') || fLow.endsWith('khz')) {
          freq = parseFloat(fLow) * 1e3
        } else {
          const parsed = parseFloat(fLow)
          if (!isNaN(parsed) && parsed > 0) freq = parsed
        }
        const periodSec = 1 / freq
        const dutyNum = parseFloat(port.clockDuty?.replace('%', '') || '50') / 100
        const pulseWidthSec = periodSec * (isNaN(dutyNum) ? 0.5 : dutyNum)

        cards.push(
          `V_STIM_${cleanName} ${pName} 0 PULSE(${gndVal} ${vccVal} ${tDelay} ${tr} ${tf} ${pulseWidthSec} ${periodSec})`
        )
      } else if (port.type === 'high') {
        cards.push(`V_STIM_${cleanName} ${pName} 0 DC ${vccVal}`)
      } else if (port.type === 'low') {
        cards.push(`V_STIM_${cleanName} ${pName} 0 DC ${gndVal}`)
      } else {
        const rawPattern = (port.pattern || '0101').replace(/[^01]/g, '')
        const bits = rawPattern.length > 0 ? rawPattern : '0101'
        const periodStr = port.bitPeriod?.trim() || '10u'
        const bitPeriodSec = parseEngineeringSeconds(periodStr, 10e-6)
        const trSec = parseEngineeringSeconds(tr, 1e-9)
        const tfSec = parseEngineeringSeconds(tf, 1e-9)
        const delaySec = parseEngineeringSeconds(tDelay, 0)

        const pwlPairs: string[] = []
        let curTime = 0
        if (delaySec > 0) {
          const firstBitVal = bits[0] === '1' ? vccVal : gndVal
          pwlPairs.push(`0 ${firstBitVal}`)
          pwlPairs.push(`${delaySec} ${firstBitVal}`)
          curTime = delaySec
        } else {
          const firstBitVal = bits[0] === '1' ? vccVal : gndVal
          pwlPairs.push(`0 ${firstBitVal}`)
        }

        for (let i = 0; i < bits.length; i++) {
          const bitVal = bits[i] === '1' ? vccVal : gndVal
          const prevBitVal = i > 0 ? (bits[i - 1] === '1' ? vccVal : gndVal) : bitVal

          if (i > 0 && bitVal !== prevBitVal) {
            const edgeTime = bitVal === vccVal ? trSec : tfSec
            const tStart = curTime
            const tEnd = curTime + edgeTime
            pwlPairs.push(`${tStart} ${prevBitVal}`)
            pwlPairs.push(`${tEnd} ${bitVal}`)
          }
          curTime += bitPeriodSec
          pwlPairs.push(`${curTime} ${bitVal}`)
        }

        cards.push(`V_STIM_${cleanName} ${pName} 0 PWL(${pwlPairs.join(' ')})`)
      }
    })
  }

  return cards
}

export function computeSpiceCommand(config: AnalysisConfig): string {
  switch (config.type) {
    case 'digital': {
      const parts = ['.tran']
      const step = config.digitalMaxStep?.trim() || '50n'
      const stop = config.digitalStopTime?.trim() || '40u'
      parts.push(step, stop)
      if (
        config.digitalStartTime &&
        config.digitalStartTime.trim() &&
        config.digitalStartTime.trim() !== '0'
      ) {
        parts.push(config.digitalStartTime.trim())
      }
      if (config.digitalUic) {
        parts.push('uic')
      }
      return parts.join(' ')
    }
    case 'tran': {
      const parts = ['.tran']
      const step = config.tranMaxStep?.trim() || '10u'
      const stop = config.tranStopTime?.trim() || '10m'
      parts.push(step, stop)
      if (
        config.tranStartTime &&
        config.tranStartTime.trim() &&
        config.tranStartTime.trim() !== '0'
      ) {
        parts.push(config.tranStartTime.trim())
      }
      if (config.tranUic) {
        parts.push('uic')
      }
      return parts.join(' ')
    }
    case 'ac': {
      const type = config.acSweepType || 'dec'
      const pts = config.acPoints.trim() || '100'
      const fstart = config.acStartFreq.trim() || '10'
      const fstop = config.acStopFreq.trim() || '1Meg'
      return `.ac ${type} ${pts} ${fstart} ${fstop}`
    }
    case 'dc': {
      const src1 = config.dcSource1.trim() || 'V1'
      const start1 = config.dcStart1.trim() || '0'
      const stop1 = config.dcStop1.trim() || '5'
      const step1 = config.dcStep1.trim() || '0.1'
      let cmd = `.dc ${src1} ${start1} ${stop1} ${step1}`
      if (config.dcEnableSource2 && config.dcSource2.trim()) {
        const src2 = config.dcSource2.trim()
        const start2 = config.dcStart2.trim() || '0'
        const stop2 = config.dcStop2.trim() || '5'
        const step2 = config.dcStep2.trim() || '1'
        cmd += ` ${src2} ${start2} ${stop2} ${step2}`
      }
      return cmd
    }
    case 'op':
    default:
      return '.op'
  }
}

interface ConfigureAnalysisModalProps {
  isOpen: boolean
  onClose: () => void
  currentConfig: AnalysisConfig
  onApplyConfig: (config: AnalysisConfig) => void
  candidatePorts?: string[]
}

export default function ConfigureAnalysisModal({
  isOpen,
  onClose,
  currentConfig,
  onApplyConfig,
  candidatePorts = []
}: ConfigureAnalysisModalProps): JSX.Element | null {
  const { t } = useTranslation('common')
  const [config, setConfig] = useState<AnalysisConfig>(currentConfig)
  const [activeTab, setActiveTab] = useState<AnalysisType>(currentConfig.type)

  useEffect(() => {
    if (isOpen) {
      setConfig(currentConfig)
      setActiveTab(currentConfig.type)
    }
  }, [isOpen, currentConfig])

  const liveCommand = useMemo(() => {
    return computeSpiceCommand({ ...config, type: activeTab })
  }, [config, activeTab])

  const handleOk = (): void => {
    const updated: AnalysisConfig = {
      ...config,
      type: activeTab,
      command: liveCommand
    }
    onApplyConfig(updated)
    onClose()
  }

  const handleAddPort = (): void => {
    const nextNum = (config.digitalPorts?.length || 0) + 1
    const newPort: DigitalPortStimulus = {
      id: `p_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      portName: `IN${nextNum}`,
      type: 'pattern',
      pattern: nextNum % 2 === 1 ? '01010101' : '00110011',
      bitPeriod: '10u'
    }
    setConfig((prev) => ({
      ...prev,
      digitalPorts: [...(prev.digitalPorts || []), newPort]
    }))
  }

  const handleUpdatePort = (index: number, updates: Partial<DigitalPortStimulus>): void => {
    setConfig((prev) => {
      const updated = [...(prev.digitalPorts || [])]
      if (updated[index]) {
        updated[index] = { ...updated[index], ...updates }
      }
      return { ...prev, digitalPorts: updated }
    })
  }

  const handleDeletePort = (index: number): void => {
    setConfig((prev) => {
      const updated = [...(prev.digitalPorts || [])]
      updated.splice(index, 1)
      return { ...prev, digitalPorts: updated }
    })
  }

  const handleAutoFillCandidatePorts = (): void => {
    if (!candidatePorts || candidatePorts.length === 0) return
    const newPorts: DigitalPortStimulus[] = candidatePorts.map((name, i) => {
      const isClk = /clk|clock/i.test(name)
      return {
        id: `p_auto_${i}_${Date.now()}`,
        portName: name,
        type: isClk ? 'clock' : 'pattern',
        pattern: isClk ? undefined : i % 2 === 0 ? '01010101' : '00110011',
        bitPeriod: '10u',
        clockFreq: isClk ? '100k' : undefined,
        clockDuty: isClk ? '50%' : undefined
      }
    })
    setConfig((prev) => ({ ...prev, digitalPorts: newPorts }))
  }

  // Close on Escape, OK on Enter
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'Enter' && !e.shiftKey) {
        const target = e.target as HTMLElement
        if (target.tagName !== 'TEXTAREA') {
          e.preventDefault()
          handleOk()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, config, activeTab, liveCommand])

  if (!isOpen) return null

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
      <div className="cfg-analysis-win-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Compact Windows Titlebar */}
        <div className="cfg-analysis-win-titlebar">
          <div className="cfg-analysis-win-title">
            <span className="cfg-analysis-win-title-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="14" height="12" fill="#0055ea" />
                <path
                  d="M3 8 L6 11 L10 5 L13 8"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span id="cfg-analysis-dialog-title">{t('analysis.title')}</span>
          </div>
          <button
            type="button"
            className="cfg-analysis-win-close-btn"
            onClick={onClose}
            aria-label={t('analysis.closeDialog')}
            title={`${t('actions.cancel')} (Esc)`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
              aria-selected={activeTab === 'tran'}
              className={`cfg-analysis-win-tab ${activeTab === 'tran' ? 'active' : ''}`}
              onClick={() => setActiveTab('tran')}
            >
              {t('analysis.tabs.tran')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'ac'}
              className={`cfg-analysis-win-tab ${activeTab === 'ac' ? 'active' : ''}`}
              onClick={() => setActiveTab('ac')}
            >
              {t('analysis.tabs.ac')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'dc'}
              className={`cfg-analysis-win-tab ${activeTab === 'dc' ? 'active' : ''}`}
              onClick={() => setActiveTab('dc')}
            >
              {t('analysis.tabs.dc')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'op'}
              className={`cfg-analysis-win-tab ${activeTab === 'op' ? 'active' : ''}`}
              onClick={() => setActiveTab('op')}
            >
              {t('analysis.tabs.op')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'digital'}
              className={`cfg-analysis-win-tab ${activeTab === 'digital' ? 'active' : ''}`}
              onClick={() => setActiveTab('digital')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Zap size={12} style={{ color: activeTab === 'digital' ? '#059669' : '#64748b' }} />
              {t('analysis.tabs.digital', 'Digital Analysis (.tran)')}
            </button>
          </div>

          {/* Tab Pane Frame */}
          <div className="cfg-analysis-win-tab-pane">
            {/* 1. Transient Tab */}
            {activeTab === 'tran' && (
              <div className="cfg-analysis-pane-content">
                <div className="cfg-analysis-pane-hint">{t('analysis.tran.hint')}</div>

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
            {activeTab === 'ac' && (
              <div className="cfg-analysis-pane-content">
                <div className="cfg-analysis-pane-hint">{t('analysis.ac.hint')}</div>

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
                            acSweepType: e.target.value as 'dec' | 'oct' | 'lin'
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
            {activeTab === 'dc' && (
              <div className="cfg-analysis-pane-content">
                <div className="cfg-analysis-pane-hint">{t('analysis.dc.hint')}</div>

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
                          dcEnableSource2: e.target.checked
                        }))
                      }
                    />
                    <span>{t('analysis.dc.enableSource2')}</span>
                  </label>
                </div>

                {config.dcEnableSource2 && (
                  <fieldset className="cfg-analysis-fieldset" style={{ marginTop: 8 }}>
                    <legend className="cfg-analysis-legend">
                      {t('analysis.dc.source2Params')}
                    </legend>
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

                      <label className="cfg-analysis-label">{t('analysis.dc.startStopStep')}</label>
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
                          placeholder={t('analysis.start')}
                        />
                        <input
                          type="text"
                          className="cfg-analysis-input"
                          style={{ flex: 1 }}
                          value={config.dcStop2}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, dcStop2: e.target.value }))
                          }
                          placeholder={t('analysis.stop')}
                        />
                        <input
                          type="text"
                          className="cfg-analysis-input"
                          style={{ flex: 1 }}
                          value={config.dcStep2}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, dcStep2: e.target.value }))
                          }
                          placeholder={t('analysis.step')}
                        />
                      </div>
                    </div>
                  </fieldset>
                )}
              </div>
            )}

            {/* 4. DC op pnt Tab */}
            {activeTab === 'op' && (
              <div className="cfg-analysis-pane-content">
                <div className="cfg-analysis-pane-hint">{t('analysis.op.hint')}</div>

                <fieldset className="cfg-analysis-fieldset">
                  <legend className="cfg-analysis-legend">{t('analysis.op.title')}</legend>
                  <p className="cfg-analysis-op-text">{t('analysis.op.desc1')}</p>
                  <p className="cfg-analysis-op-text" style={{ marginTop: 6 }}>
                    {t('analysis.op.desc2')}
                  </p>
                </fieldset>
              </div>
            )}

            {/* 5. Digital Analysis Tab */}
            {activeTab === 'digital' && (
              <div
                className="cfg-analysis-pane-content"
                style={{ maxHeight: '390px', overflowY: 'auto', paddingRight: 4 }}
              >
                <div
                  className="cfg-analysis-pane-hint"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Zap size={14} style={{ color: '#059669', flexShrink: 0 }} />
                  <span>
                    {t(
                      'analysis.digital.hint',
                      'Virtuoso-style digital transient simulation with explicit ports, bit patterns, rise/fall times, and voltage rails.'
                    )}
                  </span>
                </div>

                {/* Section 1: Logic Voltage Rails & Bias */}
                <fieldset className="cfg-analysis-fieldset">
                  <legend className="cfg-analysis-legend">
                    {t('analysis.digital.railsTitle', '1. Logic Voltage Rails & DC State')}
                  </legend>
                  <div className="cfg-analysis-form-grid">
                    <label className="cfg-analysis-label" htmlFor="digital-vcc">
                      {t('analysis.digital.vcc', 'VCC Supply Voltage:')}
                    </label>
                    <div className="cfg-analysis-input-wrap">
                      <input
                        id="digital-vcc"
                        type="text"
                        className="cfg-analysis-input"
                        value={config.digitalVcc}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, digitalVcc: e.target.value }))
                        }
                        placeholder="5 (or 3.3, 1.8)"
                      />
                      <span className="cfg-analysis-hint">V (High level)</span>
                    </div>

                    <label className="cfg-analysis-label" htmlFor="digital-gnd">
                      {t('analysis.digital.gnd', 'GND Reference:')}
                    </label>
                    <div className="cfg-analysis-input-wrap">
                      <input
                        id="digital-gnd"
                        type="text"
                        className="cfg-analysis-input"
                        value={config.digitalGnd}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, digitalGnd: e.target.value }))
                        }
                        placeholder="0"
                      />
                      <span className="cfg-analysis-hint">V (Node 0)</span>
                    </div>
                  </div>

                  <div className="cfg-analysis-checkbox-row" style={{ marginTop: 6 }}>
                    <label className="cfg-analysis-checkbox-label">
                      <input
                        type="checkbox"
                        checked={config.digitalUic}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, digitalUic: e.target.checked }))
                        }
                      />
                      <span>
                        {t(
                          'analysis.digital.uic',
                          'Skip initial DC operating point (UIC) — starts all gates from 0V state'
                        )}
                      </span>
                    </label>
                  </div>
                </fieldset>

                {/* Section 2: Timing & Edge Parameters */}
                <fieldset className="cfg-analysis-fieldset" style={{ marginTop: 8 }}>
                  <legend className="cfg-analysis-legend">
                    {t('analysis.digital.timingTitle', '2. Timing & Edge Parameters')}
                  </legend>
                  <div className="cfg-analysis-form-grid">
                    <label className="cfg-analysis-label" htmlFor="digital-stop">
                      {t('analysis.digital.stopTime', 'Stop Time (tstop):')}
                    </label>
                    <div className="cfg-analysis-input-wrap">
                      <input
                        id="digital-stop"
                        type="text"
                        className="cfg-analysis-input"
                        value={config.digitalStopTime}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, digitalStopTime: e.target.value }))
                        }
                        placeholder="e.g. 40u, 100u, 1m"
                      />
                      <span className="cfg-analysis-hint">Duration</span>
                    </div>

                    <label className="cfg-analysis-label" htmlFor="digital-step">
                      {t('analysis.digital.maxStep', 'Max Timestep:')}
                    </label>
                    <div className="cfg-analysis-input-wrap">
                      <input
                        id="digital-step"
                        type="text"
                        className="cfg-analysis-input"
                        value={config.digitalMaxStep}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, digitalMaxStep: e.target.value }))
                        }
                        placeholder="e.g. 50n, 10n"
                      />
                      <span className="cfg-analysis-hint">Resolution</span>
                    </div>

                    <label className="cfg-analysis-label" htmlFor="digital-delay">
                      {t('analysis.digital.delay', 'Initial Delay (td):')}
                    </label>
                    <div className="cfg-analysis-input-wrap">
                      <input
                        id="digital-delay"
                        type="text"
                        className="cfg-analysis-input"
                        value={config.digitalDelay}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, digitalDelay: e.target.value }))
                        }
                        placeholder="e.g. 0, 5n"
                      />
                      <span className="cfg-analysis-hint">Start offset</span>
                    </div>

                    <label className="cfg-analysis-label">
                      {t('analysis.digital.edges', 'Rise / Fall Times:')}
                    </label>
                    <div className="cfg-analysis-input-row" style={{ display: 'flex', gap: 6 }}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11, color: '#475569' }}>tr:</span>
                        <input
                          type="text"
                          className="cfg-analysis-input"
                          style={{ flex: 1 }}
                          value={config.digitalRiseTime}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, digitalRiseTime: e.target.value }))
                          }
                          placeholder="1n"
                        />
                      </div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11, color: '#475569' }}>tf:</span>
                        <input
                          type="text"
                          className="cfg-analysis-input"
                          style={{ flex: 1 }}
                          value={config.digitalFallTime}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, digitalFallTime: e.target.value }))
                          }
                          placeholder="1n"
                        />
                      </div>
                    </div>
                  </div>
                </fieldset>

                {/* Section 3: Port Stimulus & Bit Patterns */}
                <fieldset className="cfg-analysis-fieldset" style={{ marginTop: 8 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6
                    }}
                  >
                    <legend className="cfg-analysis-legend" style={{ margin: 0 }}>
                      {t(
                        'analysis.digital.stimulusTitle',
                        '3. Input Ports Stimulus & Bit Patterns'
                      )}
                    </legend>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {candidatePorts && candidatePorts.length > 0 && (
                        <button
                          type="button"
                          className="cfg-analysis-win-btn"
                          style={{ padding: '2px 6px', fontSize: 11, height: 22 }}
                          onClick={handleAutoFillCandidatePorts}
                          title="Auto-populate table from ports detected in the circuit"
                        >
                          Auto-fill Ports
                        </button>
                      )}
                      <button
                        type="button"
                        className="cfg-analysis-win-btn cfg-analysis-win-btn-primary"
                        style={{
                          padding: '2px 8px',
                          fontSize: 11,
                          height: 22,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3
                        }}
                        onClick={handleAddPort}
                      >
                        <Plus size={12} />
                        {t('analysis.digital.addPort', 'Add Port')}
                      </button>
                    </div>
                  </div>

                  {!config.digitalPorts || config.digitalPorts.length === 0 ? (
                    <div
                      style={{
                        padding: '10px 12px',
                        background: '#f8fafc',
                        border: '1px dashed #cbd5e1',
                        borderRadius: 4,
                        textAlign: 'center',
                        color: '#64748b',
                        fontSize: 11.5
                      }}
                    >
                      No stimulus ports added yet. Click <strong>Add Port</strong> to define bit
                      patterns or clocks for input pins (e.g. A, B, CLK).
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {config.digitalPorts.map((port, idx) => (
                        <div
                          key={port.id || idx}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '70px 105px 1fr 65px 22px',
                            gap: 5,
                            alignItems: 'center',
                            background: '#f8fafc',
                            padding: '4px 6px',
                            border: '1px solid #e2e8f0',
                            borderRadius: 3
                          }}
                        >
                          {/* Port Name */}
                          <input
                            type="text"
                            className="cfg-analysis-input"
                            style={{
                              height: 22,
                              fontSize: 11,
                              fontWeight: 700,
                              fontFamily: 'monospace'
                            }}
                            value={port.portName}
                            onChange={(e) => handleUpdatePort(idx, { portName: e.target.value })}
                            placeholder="Port"
                            title="Port / Net name in circuit (e.g. A, B, CLK, IN1)"
                          />

                          {/* Signal Type */}
                          <select
                            className="cfg-analysis-select"
                            style={{ height: 22, fontSize: 11, padding: '1px 2px' }}
                            value={port.type}
                            onChange={(e) =>
                              handleUpdatePort(idx, {
                                type: e.target.value as DigitalPortStimulus['type']
                              })
                            }
                          >
                            <option value="pattern">Bit Pattern</option>
                            <option value="clock">Clock Pulse</option>
                            <option value="high">Const High (1)</option>
                            <option value="low">Const Low (0)</option>
                          </select>

                          {/* Pattern or Clock Freq */}
                          {port.type === 'pattern' ? (
                            <input
                              type="text"
                              className="cfg-analysis-input"
                              style={{
                                height: 22,
                                fontSize: 11,
                                fontFamily: 'monospace',
                                color: '#0369a1',
                                fontWeight: 600
                              }}
                              value={port.pattern || ''}
                              onChange={(e) => handleUpdatePort(idx, { pattern: e.target.value })}
                              placeholder="e.g. 01010101"
                              title="Binary sequence (0s and 1s)"
                            />
                          ) : port.type === 'clock' ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <input
                                type="text"
                                className="cfg-analysis-input"
                                style={{ height: 22, fontSize: 11, flex: 1 }}
                                value={port.clockFreq || ''}
                                onChange={(e) =>
                                  handleUpdatePort(idx, { clockFreq: e.target.value })
                                }
                                placeholder="Freq (100k)"
                                title="Clock frequency (e.g. 100k, 1Meg)"
                              />
                              <input
                                type="text"
                                className="cfg-analysis-input"
                                style={{ height: 22, fontSize: 11, width: 36 }}
                                value={port.clockDuty || '50%'}
                                onChange={(e) =>
                                  handleUpdatePort(idx, { clockDuty: e.target.value })
                                }
                                placeholder="50%"
                                title="Duty Cycle"
                              />
                            </div>
                          ) : (
                            <span
                              style={{
                                fontSize: 11,
                                color: '#64748b',
                                fontStyle: 'italic',
                                paddingLeft: 4
                              }}
                            >
                              {port.type === 'high'
                                ? `Fixed at VCC (${config.digitalVcc || 5}V)`
                                : `Fixed at GND (0V)`}
                            </span>
                          )}

                          {/* Bit Period */}
                          {port.type === 'pattern' ? (
                            <input
                              type="text"
                              className="cfg-analysis-input"
                              style={{ height: 22, fontSize: 11 }}
                              value={port.bitPeriod || ''}
                              onChange={(e) => handleUpdatePort(idx, { bitPeriod: e.target.value })}
                              placeholder="10u"
                              title="Duration of each bit (e.g. 10u, 1u, 100n)"
                            />
                          ) : (
                            <span style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
                              -
                            </span>
                          )}

                          {/* Delete Action */}
                          <button
                            type="button"
                            onClick={() => handleDeletePort(idx)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              color: '#ef4444',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 2
                            }}
                            title="Remove port stimulus"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </fieldset>

                {/* Section 4: Accuracy & Integration Preset */}
                <fieldset className="cfg-analysis-fieldset" style={{ marginTop: 8 }}>
                  <legend className="cfg-analysis-legend">
                    {t('analysis.digital.accuracyTitle', '4. Virtuoso Accuracy Preset (errpreset)')}
                  </legend>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11.5,
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="radio"
                        name="digital-accuracy"
                        checked={config.digitalAccuracy === 'conservative'}
                        onChange={() =>
                          setConfig((prev) => ({ ...prev, digitalAccuracy: 'conservative' }))
                        }
                      />
                      <span>
                        <strong>Conservative (Gear integration):</strong> Eliminates ringing on
                        square edges; catches glitches & race conditions
                      </span>
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11.5,
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="radio"
                        name="digital-accuracy"
                        checked={config.digitalAccuracy === 'moderate'}
                        onChange={() =>
                          setConfig((prev) => ({ ...prev, digitalAccuracy: 'moderate' }))
                        }
                      />
                      <span>
                        <strong>Moderate (Standard Trap):</strong> Balanced speed and accuracy
                      </span>
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11.5,
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="radio"
                        name="digital-accuracy"
                        checked={config.digitalAccuracy === 'liberal'}
                        onChange={() =>
                          setConfig((prev) => ({ ...prev, digitalAccuracy: 'liberal' }))
                        }
                      />
                      <span>
                        <strong>Liberal:</strong> Fast functional verification
                      </span>
                    </label>
                  </div>
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
              title={t('analysis.generatedDirective')}
            />
          </div>
        </div>

        {/* Dialog Footer Actions */}
        <div className="cfg-analysis-win-footer">
          <div className="cfg-analysis-win-hint">{t('analysis.hintKeys')}</div>
          <div className="cfg-analysis-win-actions">
            <button
              type="button"
              className="cfg-analysis-win-btn cfg-analysis-win-btn-primary"
              onClick={handleOk}
            >
              {t('actions.ok')}
            </button>
            <button type="button" className="cfg-analysis-win-btn" onClick={onClose}>
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

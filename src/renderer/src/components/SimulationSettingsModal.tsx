import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Settings, X } from "lucide-react"

export interface SolverSettings {
  integrationMethod: "trap" | "gear" | "modified-trap"
  reltol: string
  vntol: string
  abstol: string
  temp: string
  maxIterations: string
}

export const DEFAULT_SOLVER_SETTINGS: SolverSettings = {
  integrationMethod: "trap",
  reltol: "0.001",
  vntol: "1e-6",
  abstol: "1e-12",
  temp: "27",
  maxIterations: "100",
}

interface SimulationSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  currentSettings: SolverSettings
  onApplySettings: (settings: SolverSettings) => void
}

export default function SimulationSettingsModal({
  isOpen,
  onClose,
  currentSettings,
  onApplySettings,
}: SimulationSettingsModalProps) {
  const { t } = useTranslation('common')
  const [settings, setSettings] = useState<SolverSettings>(currentSettings)

  useEffect(() => {
    if (isOpen) {
      setSettings(currentSettings)
    }
  }, [isOpen, currentSettings])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, settings])

  if (!isOpen) return null

  const handleSave = () => {
    onApplySettings(settings)
    onClose()
  }

  return (
    <div className="analysis-modal-overlay" onClick={onClose}>
      <div
        className="analysis-modal-dialog"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sim-settings-title"
      >
        <div className="analysis-modal-header">
          <div className="analysis-modal-title-wrap">
            <span className="analysis-modal-icon" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Settings size={18} />
            </span>
            <div>
              <h2 id="sim-settings-title" className="analysis-modal-title">
                {t('simSettings.title')}
              </h2>
              <span className="analysis-modal-subtitle">
                {t('simSettings.subtitle')}
              </span>
            </div>
          </div>
          <button className="analysis-modal-close-btn" onClick={onClose} aria-label={t('actions.close')} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={15} />
          </button>
        </div>

        <div className="analysis-modal-body" style={{ padding: 20 }}>
          <div className="analysis-field-grid">
            <div className="analysis-field-row">
              <label htmlFor="sim-method" className="analysis-field-label">
                {t('simSettings.integrationMethod')}
              </label>
              <div className="analysis-input-wrap">
                <select
                  id="sim-method"
                  className="analysis-select"
                  value={settings.integrationMethod}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      integrationMethod: e.target.value as "trap" | "gear" | "modified-trap",
                    }))
                  }
                >
                  <option value="trap">{t('simSettings.trapOption')}</option>
                  <option value="modified-trap">{t('simSettings.modifiedTrapOption')}</option>
                  <option value="gear">{t('simSettings.gearOption')}</option>
                </select>
              </div>
            </div>

            <div className="analysis-field-row">
              <label htmlFor="sim-reltol" className="analysis-field-label">
                {t('simSettings.reltol')}
              </label>
              <div className="analysis-input-wrap">
                <input
                  id="sim-reltol"
                  type="text"
                  className="analysis-input"
                  value={settings.reltol}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, reltol: e.target.value }))
                  }
                  placeholder="0.001"
                />
                <span className="analysis-input-hint">{t('simSettings.reltolHint')}</span>
              </div>
            </div>

            <div className="analysis-field-row">
              <label htmlFor="sim-vntol" className="analysis-field-label">
                {t('simSettings.vntol')}
              </label>
              <div className="analysis-input-wrap">
                <input
                  id="sim-vntol"
                  type="text"
                  className="analysis-input"
                  value={settings.vntol}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, vntol: e.target.value }))
                  }
                  placeholder="1e-6"
                />
                <span className="analysis-input-hint">{t('simSettings.vntolHint')}</span>
              </div>
            </div>

            <div className="analysis-field-row">
              <label htmlFor="sim-abstol" className="analysis-field-label">
                {t('simSettings.abstol')}
              </label>
              <div className="analysis-input-wrap">
                <input
                  id="sim-abstol"
                  type="text"
                  className="analysis-input"
                  value={settings.abstol}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, abstol: e.target.value }))
                  }
                  placeholder="1e-12"
                />
                <span className="analysis-input-hint">{t('simSettings.abstolHint')}</span>
              </div>
            </div>

            <div className="analysis-field-row">
              <label htmlFor="sim-temp" className="analysis-field-label">
                {t('simSettings.temp')}
              </label>
              <div className="analysis-input-wrap">
                <input
                  id="sim-temp"
                  type="text"
                  className="analysis-input"
                  value={settings.temp}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, temp: e.target.value }))
                  }
                  placeholder="27"
                />
                <span className="analysis-input-hint">{t('simSettings.tempHint')}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="analysis-modal-footer">
          <button
            className="analysis-cancel-btn"
            onClick={() => setSettings(DEFAULT_SOLVER_SETTINGS)}
            type="button"
            style={{ marginRight: "auto" }}
          >
            {t('actions.reset')}
          </button>
          <div className="analysis-modal-actions">
            <button className="analysis-cancel-btn" onClick={onClose} type="button">
              {t('actions.cancel')}
            </button>
            <button className="analysis-apply-btn" onClick={handleSave} type="button">
              {t('actions.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

import React, { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"
import type { NetlistValidationError } from "../utils/spiceNetlist"

export interface ValidationBlockedModalProps {
  isOpen: boolean
  onClose: () => void
  errors: NetlistValidationError[]
  onLocateError: (componentId?: string, netName?: string) => void
  onViewDiagnostics: () => void
}

export const ValidationBlockedModal: React.FC<ValidationBlockedModalProps> = ({
  isOpen,
  onClose,
  errors,
  onLocateError,
  onViewDiagnostics,
}) => {
  const { t } = useTranslation('common')
  // Close on Escape or Enter keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        if (errors.length > 0 && (errors[0].componentId || errors[0].netName)) {
          onLocateError(errors[0].componentId, errors[0].netName)
        } else {
          onViewDiagnostics()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, errors, onClose, onLocateError, onViewDiagnostics])

  if (!isOpen || errors.length === 0) return null

  const primaryError = errors[0]
  const canLocate = Boolean(primaryError.componentId || primaryError.netName)
  const affectedLabel =
    primaryError.componentLabel ||
    primaryError.componentId ||
    (primaryError.netName ? `Net: ${primaryError.netName}` : "Circuit Topology")

  return (
    <div
      className="sim-error-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sim-error-modal-title"
    >
      <div
        className="sim-error-win-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Windows Titlebar */}
        <div className="sim-error-win-titlebar">
          <div className="sim-error-win-title">
            <span className="sim-error-win-title-icon" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" fill="#e81123" />
                <path d="M5 5L11 11M11 5L5 11" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <span id="sim-error-modal-title">{t('validation.title')}</span>
          </div>

          <button
            type="button"
            className="sim-error-win-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
            title={`${t('actions.close')} (Esc)`}
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Dialog Body */}
        <div className="sim-error-win-body">
          {/* Header Row: Error Icon + Heading & Error Count */}
          <div className="sim-error-win-header-row">
            <div className="sim-error-win-icon" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="14" fill="#e81123" />
                <path d="M10 10L22 22M22 10L10 22" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />
              </svg>
            </div>

            <div className="sim-error-win-header-text">
              <h2 className="sim-error-win-heading">
                {t('validation.heading')} ({errors.length} {errors.length === 1 ? "Error" : "Errors"})
              </h2>
              <p className="sim-error-win-subtext">
                {t('validation.subtext')}
              </p>
            </div>
          </div>

          {/* Structured Description Frame */}
          <div className="sim-error-win-description-frame">
            <div className="sim-error-win-meta-table">
              <div className="sim-error-win-meta-row">
                <span className="sim-error-win-meta-label">{t('validation.errorCode')}</span>
                <span className="sim-error-win-meta-value">{primaryError.code}</span>
              </div>
              <div className="sim-error-win-meta-row">
                <span className="sim-error-win-meta-label">{t('validation.affectedArea')}</span>
                <span className="sim-error-win-meta-value">{affectedLabel}</span>
              </div>
            </div>

            <div className="sim-error-win-explanation">
              {primaryError.message}
            </div>

            {primaryError.suggestion && (
              <div className="sim-error-win-suggestion">
                <strong>{t('validation.suggestion')}</strong> {primaryError.suggestion}
              </div>
            )}

            {errors.length > 1 && (
              <div className="sim-error-win-additional">
                +{errors.length - 1} additional validation {errors.length > 2 ? "errors" : "error"} logged in the Diagnostics panel.
              </div>
            )}
          </div>
        </div>

        {/* Dialog Footer Actions */}
        <div className="sim-error-win-footer">
          <button
            type="button"
            className={`sim-error-win-btn ${canLocate ? "sim-error-win-btn-default" : ""}`}
            onClick={() => onLocateError(primaryError.componentId, primaryError.netName)}
            disabled={!canLocate}
            title={
              canLocate
                ? "Pan and zoom schematic to the problematic component or net"
                : "No specific schematic component or net to locate"
            }
          >
            {t('validation.locateError')}
          </button>

          <button
            type="button"
            className="sim-error-win-btn"
            onClick={onViewDiagnostics}
            title="Open simulation diagnostics panel"
          >
            {t('validation.viewDiagnostics')}
          </button>

          <button
            type="button"
            className="sim-error-win-btn"
            onClick={onClose}
          >
            {t('actions.close')}
          </button>
        </div>

      </div>
    </div>
  )
}

export default ValidationBlockedModal

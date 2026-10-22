import React, { useState, useEffect, useRef } from "react"
import { X } from "lucide-react"
import type { SchematicComponentType } from "./SchematicNode"

export interface NetNameModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (type: SchematicComponentType, name: string) => void
  initialType?: "net-label" | "port-in" | "port-out" | "port-bi"
  initialName?: string
}

export default function NetNameModal({
  isOpen,
  onClose,
  onConfirm,
  initialType = "net-label",
  initialName = "",
}: NetNameModalProps) {
  const [selectedType, setSelectedType] = useState<"net-label" | "port-in" | "port-out" | "port-bi">(initialType)
  const [name, setName] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setSelectedType(initialType)
      setName(
        initialName ||
          (initialType === "net-label"
            ? "NET1"
            : initialType === "port-in"
              ? "IN"
              : initialType === "port-out"
                ? "OUT"
                : "IO"),
      )
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 50)
    }
  }, [isOpen, initialType, initialName])

  // Escape key cancels/closes modal
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const clean =
      name.trim() ||
      (selectedType === "net-label"
        ? "NET"
        : selectedType === "port-in"
          ? "IN"
          : selectedType === "port-out"
            ? "OUT"
            : "IO")
    onConfirm(selectedType, clean)
    onClose()
  }

  const isPort = selectedType !== "net-label"
  const titleText = isPort ? "Place Port" : "Place Net Label"

  return (
    <div
      className="comp-prop-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="comp-prop-win-dialog"
        style={{ width: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Windows Titlebar */}
        <div className="comp-prop-win-titlebar">
          <div className="comp-prop-win-title">
            <span className="comp-prop-win-title-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="14" height="12" rx="1" fill="#0055ea" />
                <rect x="2" y="3" width="12" height="2" fill="#ffffff" opacity="0.3" />
                <path d="M4 7h8M4 9h6M4 11h4" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </span>
            <span>{titleText}</span>
          </div>

          <button
            type="button"
            className="comp-prop-win-close-btn"
            onClick={onClose}
            aria-label="Close"
            title="Cancel (Esc)"
          >
            <X size={14} />
          </button>
        </div>

        {/* Dialog Body & Form */}
        <form onSubmit={handleSubmit}>
          <div className="comp-prop-win-body">
            {/* Port Direction Options */}
            {isPort && (
              <fieldset className="comp-prop-win-fieldset">
                <legend className="comp-prop-win-legend">Port Direction / Type</legend>
                <div style={{ display: "flex", gap: 14, padding: "4px 2px", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="portType"
                      checked={selectedType === "port-in"}
                      onChange={() => setSelectedType("port-in")}
                    />
                    <strong>Input Port</strong> (inward signal)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="portType"
                      checked={selectedType === "port-out"}
                      onChange={() => setSelectedType("port-out")}
                    />
                    <strong>Output Port</strong> (outward signal)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="portType"
                      checked={selectedType === "port-bi"}
                      onChange={() => setSelectedType("port-bi")}
                    />
                    <strong>Bidirectional</strong> (I/O)
                  </label>
                </div>
              </fieldset>
            )}

            {/* Net Name Fieldset */}
            <fieldset className="comp-prop-win-fieldset">
              <legend className="comp-prop-win-legend">Net Identifier</legend>
              <div className="comp-prop-win-form-grid" style={{ gridTemplateColumns: "90px 1fr" }}>
                <label className="comp-prop-win-label">{isPort ? "Port Name:" : "Net Name:"}</label>
                <div className="comp-prop-win-control-col">
                  <input
                    ref={inputRef}
                    type="text"
                    className="comp-prop-win-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Vout, Vin, CLK"
                    style={{ fontFamily: '"JetBrains Mono", Consolas, monospace', fontWeight: 600 }}
                  />
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#666666", marginTop: 6, paddingLeft: 2 }}>
                Identical net names connect electrically without drawing wires.
              </div>
            </fieldset>

            {/* Common Net Name Presets */}
            <fieldset className="comp-prop-win-fieldset">
              <legend className="comp-prop-win-legend">Common Name Presets</legend>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "4px 2px" }}>
                {["Vout", "Vin", "CLK", "RESET", "DATA", "ENABLE", "VCC", "GND"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="comp-prop-win-btn comp-prop-win-inline-btn"
                    onClick={() => setName(preset)}
                    style={{ fontFamily: '"JetBrains Mono", Consolas, monospace', height: 22 }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          {/* Dialog Footer */}
          <div className="comp-prop-win-footer">
            <div className="comp-prop-win-footer-info">
              <span style={{ color: "#777777" }}>Enter to place on schematic</span>
            </div>
            <div className="comp-prop-win-footer-btns">
              <button
                type="submit"
                className="comp-prop-win-btn comp-prop-win-btn-default"
              >
                Place
              </button>
              <button
                type="button"
                className="comp-prop-win-btn"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

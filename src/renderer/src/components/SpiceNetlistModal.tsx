import { useState, useEffect } from "react"
import type { NetlistGenerationResult } from "../utils/spiceNetlist"

interface SpiceNetlistModalProps {
  isOpen: boolean
  onClose: () => void
  result: NetlistGenerationResult | null
  initialTab?: "netlist" | "validation"
  onRunSimulation?: () => void
  onHighlightNet?: (netName: string) => void
  onLocateComponent?: (componentId: string) => void
}

export default function SpiceNetlistModal({
  isOpen,
  onClose,
  result,
  initialTab = "netlist",
  onRunSimulation,
  onHighlightNet,
  onLocateComponent,
}: SpiceNetlistModalProps) {
  const [activeTab, setActiveTab] = useState<"netlist" | "validation">("netlist")
  const [copied, setCopied] = useState(false)
  const [selectedNet, setSelectedNet] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      if (result && !result.success && result.errors.length > 0) {
        setActiveTab("validation")
      } else {
        setActiveTab(initialTab)
      }
      setCopied(false)
    }
  }, [isOpen, result, initialTab])

  // Handle Escape key
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

  if (!isOpen || !result) return null

  const handleCopy = () => {
    navigator.clipboard.writeText(result.netlist).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleDownload = () => {
    const blob = new Blob([result.netlist], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "circuit.cir"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const lines = result.netlist.split("\n")

  return (
    <div className="analysis-modal-backdrop" onClick={onClose}>
      <div
        className="analysis-modal-container"
        style={{ width: 780, maxWidth: "94vw", maxHeight: "88vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="analysis-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18, color: "var(--accent)" }}>⚡</span>
            <div>
              <div className="analysis-modal-title">SPICE Netlist & Connectivity</div>
              <div className="analysis-modal-subtitle">
                LTspice compatible circuit netlist and electrical design rule validation
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {result.success ? (
              <span className="netlist-status-badge netlist-badge-success">
                ✓ Valid Netlist
              </span>
            ) : (
              <span className="netlist-status-badge netlist-badge-error">
                ✕ {result.errors.length} Error{result.errors.length > 1 ? "s" : ""}
              </span>
            )}
            {result.warnings.length > 0 && (
              <span className="netlist-status-badge netlist-badge-warning">
                ⚠ {result.warnings.length} Warning{result.warnings.length > 1 ? "s" : ""}
              </span>
            )}
            <button className="analysis-modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="analysis-tabs-nav" style={{ padding: "0 16px" }}>
          <button
            className={`analysis-tab-btn ${activeTab === "netlist" ? "active" : ""}`}
            onClick={() => setActiveTab("netlist")}
          >
            SPICE Netlist (.cir)
          </button>
          <button
            className={`analysis-tab-btn ${activeTab === "validation" ? "active" : ""}`}
            onClick={() => setActiveTab("validation")}
          >
            Connectivity & Validation
            {(result.errors.length > 0 || result.warnings.length > 0) && (
              <span
                style={{
                  marginLeft: 6,
                  padding: "1px 6px",
                  borderRadius: 8,
                  fontSize: 10.5,
                  fontWeight: 700,
                  background: result.errors.length > 0 ? "rgba(239, 68, 68, 0.2)" : "rgba(245, 158, 11, 0.2)",
                  color: result.errors.length > 0 ? "#ef4444" : "#f59e0b",
                }}
              >
                {result.errors.length + result.warnings.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="analysis-tab-content" style={{ padding: 16, overflowY: "auto", flex: 1 }}>
          {activeTab === "netlist" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Quick Actions Bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "var(--bg-elevated)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-faint)",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  <span>{result.stats.componentCount} components</span>
                  <span style={{ margin: "0 8px" }}>·</span>
                  <span>{result.stats.netCount} electrical nets</span>
                  <span style={{ margin: "0 8px" }}>·</span>
                  <span>{lines.length} lines</span>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="netlist-action-btn"
                    onClick={handleCopy}
                    title="Copy Netlist to Clipboard"
                  >
                    {copied ? "✓ Copied!" : "📋 Copy Netlist"}
                  </button>
                  <button
                    className="netlist-action-btn"
                    onClick={handleDownload}
                    title="Save circuit.cir"
                  >
                    💾 Download .cir
                  </button>
                </div>
              </div>

              {/* Netlist Code Viewer */}
              <div className="netlist-code-container">
                <div className="netlist-line-numbers">
                  {lines.map((_, idx) => (
                    <div key={idx} className="netlist-line-num">
                      {idx + 1}
                    </div>
                  ))}
                </div>
                <pre className="netlist-code-content">
                  {lines.map((line, idx) => {
                    const isComment = line.trim().startsWith("*")
                    const isDirective = line.trim().startsWith(".")
                    return (
                      <div
                        key={idx}
                        className={`netlist-code-line ${
                          isComment
                            ? "netlist-line-comment"
                            : isDirective
                              ? "netlist-line-directive"
                              : ""
                        }`}
                      >
                        {line || " "}
                      </div>
                    )
                  })}
                </pre>
              </div>
            </div>
          )}

          {activeTab === "validation" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Circuit Statistics Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                <div className="validation-stat-card">
                  <div className="validation-stat-value">{result.stats.componentCount}</div>
                  <div className="validation-stat-label">Components</div>
                </div>
                <div className="validation-stat-card">
                  <div className="validation-stat-value">{result.stats.netCount}</div>
                  <div className="validation-stat-label">Active Nets</div>
                </div>
                <div className="validation-stat-card">
                  <div className="validation-stat-value">{result.stats.wireCount}</div>
                  <div className="validation-stat-label">Wire Segments</div>
                </div>
                <div className="validation-stat-card">
                  <div
                    className="validation-stat-value"
                    style={{
                      color: result.stats.groundConnected ? "#10b981" : "#ef4444",
                    }}
                  >
                    {result.stats.groundConnected ? "✓ Connected" : "✕ Missing"}
                  </div>
                  <div className="validation-stat-label">Ground (Node 0)</div>
                </div>
              </div>

              {/* Errors List */}
              {result.errors.length > 0 && (
                <div>
                  <div className="validation-section-title" style={{ color: "#ef4444" }}>
                    ✕ Connectivity Errors ({result.errors.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {result.errors.map((err, idx) => (
                      <div key={idx} className="validation-issue-card validation-issue-error">
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <span style={{ fontSize: 16, lineHeight: 1 }}>🚫</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "#ef4444" }}>
                              {err.message}
                            </div>
                            {err.suggestion && (
                              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                                💡 <strong>Fix:</strong> {err.suggestion}
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                            <span className="validation-issue-code">{err.code}</span>
                            {err.componentId && onLocateComponent && (
                              <button
                                className="netlist-action-btn"
                                style={{ fontSize: 11, padding: "2px 8px" }}
                                onClick={() => {
                                  onLocateComponent(err.componentId!)
                                  onClose()
                                }}
                                title="Zoom to component on canvas"
                              >
                                🎯 Locate
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings List */}
              {result.warnings.length > 0 && (
                <div>
                  <div className="validation-section-title" style={{ color: "#f59e0b" }}>
                    ⚠ Connectivity Warnings ({result.warnings.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {result.warnings.map((warn, idx) => (
                      <div key={idx} className="validation-issue-card validation-issue-warning">
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <span style={{ fontSize: 16, lineHeight: 1 }}>⚠️</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "#f59e0b" }}>
                              {warn.message}
                            </div>
                            {warn.suggestion && (
                              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                                💡 <strong>Tip:</strong> {warn.suggestion}
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                            <span className="validation-issue-code">{warn.code}</span>
                            {warn.componentId && onLocateComponent && (
                              <button
                                className="netlist-action-btn"
                                style={{ fontSize: 11, padding: "2px 8px" }}
                                onClick={() => {
                                  onLocateComponent(warn.componentId!)
                                  onClose()
                                }}
                                title="Zoom to component on canvas"
                              >
                                🎯 Locate
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All Passed Alert */}
              {result.errors.length === 0 && result.warnings.length === 0 && (
                <div className="validation-issue-card validation-issue-success">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>✅</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13.5, color: "#10b981" }}>
                        All Connectivity Rules Passed
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                        Circuit topology is valid, reference ground (0V) is properly wired, and all device terminals are resolved.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Net Connectivity Matrix Table */}
              <div>
                <div className="validation-section-title">
                  Electrical Net Connectivity ({Object.keys(result.nets).length} Nets)
                </div>
                <div className="netlist-table-container">
                  <table className="netlist-table">
                    <thead>
                      <tr>
                        <th style={{ width: 120 }}>SPICE Net</th>
                        <th>Connected Component Terminals</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(result.nets).map(([netName, pins]) => {
                        const isSelected = selectedNet === netName
                        return (
                          <tr
                            key={netName}
                            style={{
                              cursor: "pointer",
                              background: isSelected ? "rgba(2, 132, 199, 0.12)" : undefined,
                              borderLeft: isSelected ? "3px solid #0284c7" : "3px solid transparent",
                              transition: "all 0.15s ease",
                            }}
                            onClick={() => {
                              const nextNet = isSelected ? null : netName
                              setSelectedNet(nextNet)
                              if (nextNet && onHighlightNet) {
                                onHighlightNet(nextNet)
                              }
                            }}
                          >
                            <td>
                              <span
                                className={`net-tag ${
                                  netName === "0" ? "net-tag-ground" : "net-tag-normal"
                                }`}
                              >
                                {netName === "0" ? "0 (GND)" : netName}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {pins.map((p, pIdx) => (
                                    <span key={pIdx} className="terminal-chip">
                                      <strong>{p.componentLabel}</strong>.{p.pinName}
                                    </span>
                                  ))}
                                </div>
                                {onHighlightNet && (
                                  <button
                                    className="netlist-action-btn"
                                    style={{ fontSize: 10.5, padding: "2px 7px" }}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      onHighlightNet(netName)
                                      onClose()
                                    }}
                                    title="Highlight this net on the schematic canvas"
                                  >
                                    👁 Highlight on Canvas
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="analysis-modal-footer">
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Press <kbd style={{ padding: "1px 5px", background: "var(--bg-elevated)", border: "1px solid var(--border-medium)", borderRadius: 3 }}>Esc</kbd> to dismiss
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="analysis-cancel-btn" onClick={onClose}>
              Close
            </button>
            {result.success && onRunSimulation && (
              <button
                className="analysis-apply-btn"
                onClick={() => {
                  onClose()
                  onRunSimulation()
                }}
              >
                ▶ Run Simulation
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

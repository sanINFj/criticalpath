import React, { useState, useMemo, useEffect } from "react"
import { useTranslation } from "react-i18next"
import {
  X,
  Copy,
  Download,
  Check,
  Search,
  Activity,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react"
import type { SimulationRunResult } from "../../../shared/simulation"
import { formatEngineering } from "../utils/engineeringFormat"

export interface OperatingPointModalProps {
  isOpen: boolean
  onClose: () => void
  simulationResult: SimulationRunResult | null
  circuitTitle?: string
}

export interface OperatingPointItem {
  id: string
  name: string
  displayName: string
  category: "voltage" | "current" | "device"
  quantity: string
  value: number
  unit: string
  formattedValue: string
  scientificValue: string
}

export const OperatingPointModal: React.FC<OperatingPointModalProps> = ({
  isOpen,
  onClose,
  simulationResult,
  circuitTitle = "Circuit",
}) => {
  const { t } = useTranslation("common")
  const [filterCategory, setFilterCategory] = useState<"all" | "voltage" | "current" | "device">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [formatMode, setFormatMode] = useState<"eng" | "sci" | "dec">("eng")
  const [copied, setCopied] = useState(false)
  const [sortField, setSortField] = useState<"name" | "quantity" | "value">("name")
  const [sortAsc, setSortAsc] = useState(true)

  // Close on Escape key
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

  // Extract all actual results from ngspice output vectors
  const items = useMemo<OperatingPointItem[]>(() => {
    if (!simulationResult || !simulationResult.data) return []

    const resultList: OperatingPointItem[] = []
    const rawVars = simulationResult.variables || []
    const seenNames = new Set<string>()

    // Helper to categorize and describe variable
    const categorizeVariable = (varName: string, rawType?: string, unitHint?: string): {
      category: "voltage" | "current" | "device"
      quantity: string
      unit: string
      displayName: string
    } => {
      const lower = varName.toLowerCase().trim()
      const upper = varName.toUpperCase().trim()

      // 1. Voltages
      if (lower === "0" || lower === "v(0)") {
        return {
          category: "voltage",
          quantity: "DC Node Voltage (GND)",
          unit: "V",
          displayName: "V(0) [GND]",
        }
      }

      if (lower.startsWith("v(") && lower.endsWith(")")) {
        const inner = lower.slice(2, -1)
        // Check for device voltage: e.g. v(@d1[vd]) or v(@q1[vbe])
        if (inner.startsWith("@")) {
          const devMatch = inner.match(/@([a-z0-9_]+)\[([a-z0-9_]+)\]/i)
          if (devMatch) {
            const dev = devMatch[1].toUpperCase()
            const param = devMatch[2].toUpperCase()
            return {
              category: "device",
              quantity: `${dev} ${param} Voltage`,
              unit: "V",
              displayName: `V(${dev}:${param})`,
            }
          }
        }
        return {
          category: "voltage",
          quantity: "DC Node Voltage",
          unit: "V",
          displayName: `V(${upper.slice(2, -1)})`,
        }
      }

      // 2. Currents
      if (lower.startsWith("i(") && lower.endsWith(")")) {
        const inner = lower.slice(2, -1)
        if (inner.startsWith("@")) {
          const devMatch = inner.match(/@([a-z0-9_]+)\[([a-z0-9_]+)\]/i)
          if (devMatch) {
            const dev = devMatch[1].toUpperCase()
            const param = devMatch[2].toUpperCase()
            return {
              category: "current",
              quantity: `${dev} Branch Current (${param})`,
              unit: "A",
              displayName: `I(${dev}:${param})`,
            }
          }
        }
        return {
          category: "current",
          quantity: `Branch Current (${upper.slice(2, -1)})`,
          unit: "A",
          displayName: `I(${upper.slice(2, -1)})`,
        }
      }

      // 3. Device specific parameters: @device[param]
      if (lower.startsWith("@")) {
        const devMatch = lower.match(/@([a-z0-9_]+)\[([a-z0-9_]+)\]/i)
        if (devMatch) {
          const dev = devMatch[1].toUpperCase()
          const param = devMatch[2].toLowerCase()
          if (param === "p") {
            return {
              category: "device",
              quantity: `${dev} Power Dissipation`,
              unit: "W",
              displayName: `@${dev}[P]`,
            }
          }
          if (param === "gm") {
            return {
              category: "device",
              quantity: `${dev} Transconductance (gm)`,
              unit: "S",
              displayName: `@${dev}[gm]`,
            }
          }
          if (param === "gds") {
            return {
              category: "device",
              quantity: `${dev} Output Conductance (gds)`,
              unit: "S",
              displayName: `@${dev}[gds]`,
            }
          }
          if (param === "vbe" || param === "vce" || param === "vgs" || param === "vds" || param === "vd") {
            return {
              category: "device",
              quantity: `${dev} ${param.toUpperCase()} Voltage`,
              unit: "V",
              displayName: `@${dev}[${param.toUpperCase()}]`,
            }
          }
          if (param === "ib" || param === "ic" || param === "ie" || param === "id" || param === "is" || param === "ig" || param === "i") {
            return {
              category: "current",
              quantity: `${dev} Current (${param.toUpperCase()})`,
              unit: "A",
              displayName: `@${dev}[${param.toUpperCase()}]`,
            }
          }
          return {
            category: "device",
            quantity: `${dev} Parameter (${param})`,
            unit: unitHint || (rawType?.includes("voltage") ? "V" : rawType?.includes("current") ? "A" : ""),
            displayName: `@${dev}[${param}]`,
          }
        }
      }

      // Fallback
      const isVolt = rawType?.includes("voltage") || unitHint === "V"
      const isCurr = rawType?.includes("current") || unitHint === "A"
      const isPow = rawType?.includes("power") || unitHint === "W"
      const isCond = rawType?.includes("admittance") || unitHint === "S"

      return {
        category: isVolt ? "voltage" : isCurr ? "current" : "device",
        quantity: isVolt ? "DC Voltage" : isCurr ? "DC Current" : isPow ? "Power" : isCond ? "Admittance" : (rawType || "Parameter"),
        unit: isVolt ? "V" : isCurr ? "A" : isPow ? "W" : isCond ? "S" : (unitHint || ""),
        displayName: upper,
      }
    }

    // Process every variable from simulationResult
    for (const v of rawVars) {
      const vName = v.name
      const lower = vName.toLowerCase()
      if (lower === "time" || lower === "frequency" || lower.includes("sweep")) continue
      if (seenNames.has(lower)) continue
      seenNames.add(lower)

      const arr = simulationResult.data[vName] || simulationResult.data[lower] || simulationResult.data[vName.toUpperCase()]
      if (!arr || arr.length === 0) continue

      const numVal = arr[0]
      const info = categorizeVariable(vName, v.type, v.unit)

      resultList.push({
        id: vName,
        name: vName,
        displayName: info.displayName,
        category: info.category,
        quantity: info.quantity,
        value: numVal,
        unit: info.unit,
        formattedValue: formatEngineering(numVal, info.unit, 5),
        scientificValue: `${numVal.toExponential(5)} ${info.unit}`.trim(),
      })
    }

    // Ensure Ground node 0 is present if not already added
    if (!seenNames.has("0") && !seenNames.has("v(0)")) {
      resultList.push({
        id: "v(0)",
        name: "v(0)",
        displayName: "V(0) [GND]",
        category: "voltage",
        quantity: "DC Node Voltage (GND)",
        value: 0,
        unit: "V",
        formattedValue: "0.00000 V",
        scientificValue: "0.00000e+00 V",
      })
    }

    return resultList
  }, [simulationResult])

  // Filter items based on active category and search query
  const filteredItems = useMemo(() => {
    let list = items

    if (filterCategory !== "all") {
      list = list.filter((item) => item.category === filterCategory)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(
        (item) =>
          item.displayName.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          item.quantity.toLowerCase().includes(q) ||
          item.formattedValue.toLowerCase().includes(q) ||
          String(item.value).includes(q),
      )
    }

    // Sort list
    return [...list].sort((a, b) => {
      let cmp = 0
      if (sortField === "name") {
        cmp = a.displayName.localeCompare(b.displayName, undefined, { numeric: true })
      } else if (sortField === "quantity") {
        cmp = a.quantity.localeCompare(b.quantity)
      } else if (sortField === "value") {
        cmp = a.value - b.value
      }
      return sortAsc ? cmp : -cmp
    })
  }, [items, filterCategory, searchQuery, sortField, sortAsc])

  // Category counts
  const counts = useMemo(() => {
    let voltage = 0
    let current = 0
    let device = 0
    for (const it of items) {
      if (it.category === "voltage") voltage++
      else if (it.category === "current") current++
      else if (it.category === "device") device++
    }
    return {
      all: items.length,
      voltage,
      current,
      device,
    }
  }, [items])

  // Sort handler
  const toggleSort = (field: "name" | "quantity" | "value") => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  // Copy table to clipboard
  const handleCopy = () => {
    if (filteredItems.length === 0) return

    const header = "Name\tQuantity\tValue\tUnit\tNumeric"
    const rows = filteredItems.map((item) => {
      const displayVal =
        formatMode === "sci"
          ? item.scientificValue
          : formatMode === "dec"
            ? `${item.value.toFixed(6)} ${item.unit}`.trim()
            : item.formattedValue
      return `${item.displayName}\t${item.quantity}\t${displayVal}\t${item.unit}\t${item.value}`
    })

    const text = [header, ...rows].join("\n")
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Export CSV
  const handleExportCsv = () => {
    if (filteredItems.length === 0) return

    const escapeCsv = (str: string) => `"${str.replace(/"/g, '""')}"`
    const headers = ["Name", "Quantity", "Value", "Unit", "RawValue"].map(escapeCsv).join(",")

    const rows = filteredItems.map((item) => {
      const displayVal =
        formatMode === "sci"
          ? item.scientificValue
          : formatMode === "dec"
            ? `${item.value.toFixed(6)} ${item.unit}`.trim()
            : item.formattedValue
      return [
        escapeCsv(item.displayName),
        escapeCsv(item.quantity),
        escapeCsv(displayVal),
        escapeCsv(item.unit),
        item.value.toString(),
      ].join(",")
    })

    const csvContent = [headers, ...rows].join("\r\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${circuitTitle.replace(/\.[^/.]+$/, "")}_op_results.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (!isOpen) return null

  return (
    <div
      className="sim-error-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="op-results-dialog-title"
    >
      <div
        className="sim-error-win-dialog"
        style={{
          width: "740px",
          maxWidth: "96vw",
          height: "580px",
          maxHeight: "92vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Windows Titlebar */}
        <div className="sim-error-win-titlebar">
          <div className="sim-error-win-title">
            <span className="sim-error-win-title-icon" aria-hidden="true">
              <Activity size={13} color="#005a9e" />
            </span>
            <span id="op-results-dialog-title" style={{ fontWeight: 600 }}>
              {t('opModal.title')}
            </span>
          </div>

          <button
            type="button"
            className="sim-error-win-close-btn"
            onClick={onClose}
            aria-label={t("opModal.close")}
            title={`${t("opModal.close")} (Esc)`}
          >
            <X size={13} />
          </button>
        </div>

        {/* Toolbar & Filter Ribbon */}
        <div
          style={{
            background: "#f7f7f7",
            borderBottom: "1px solid #d9d9d9",
            padding: "8px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {/* Top Row: Category Tabs + Search + Notation */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            {/* Category Filter Pills */}
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              {(
                [
                  { id: "all", label: t('opModal.categoryAll', { count: counts.all }) },
                  { id: "voltage", label: t('opModal.categoryVoltage', { count: counts.voltage }) },
                  { id: "current", label: t('opModal.categoryCurrent', { count: counts.current }) },
                  { id: "device", label: t('opModal.categoryDevice', { count: counts.device }) },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterCategory(tab.id)}
                  style={{
                    height: "24px",
                    padding: "0 9px",
                    fontSize: "11px",
                    fontFamily: "inherit",
                    fontWeight: filterCategory === tab.id ? 600 : 400,
                    color: filterCategory === tab.id ? "#003b73" : "#333333",
                    background: filterCategory === tab.id ? "#e5f1fb" : "#ffffff",
                    border: `1px solid ${filterCategory === tab.id ? "#0078d7" : "#cccccc"}`,
                    borderRadius: "2px",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Right Tools: Notation Selector */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "11px", color: "#666" }}>{t('opModal.format')}</span>
              <select
                value={formatMode}
                onChange={(e) => setFormatMode(e.target.value as any)}
                style={{
                  height: "24px",
                  fontSize: "11px",
                  padding: "0 6px",
                  background: "#ffffff",
                  border: "1px solid #cccccc",
                  borderRadius: "2px",
                  outline: "none",
                }}
              >
                <option value="eng">{t('opModal.formatEng')}</option>
                <option value="sci">{t('opModal.formatSci')}</option>
                <option value="dec">{t('opModal.formatDec')}</option>
              </select>
            </div>
          </div>

          {/* Search Box */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                position: "relative",
                flex: 1,
                display: "flex",
                alignItems: "center",
              }}
            >
              <Search
                size={12}
                color="#666"
                style={{ position: "absolute", left: "7px", pointerEvents: "none" }}
              />
              <input
                type="text"
                placeholder={t('opModal.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  height: "24px",
                  paddingLeft: "24px",
                  paddingRight: "8px",
                  fontSize: "11.5px",
                  fontFamily: "inherit",
                  background: "#ffffff",
                  border: "1px solid #adadad",
                  borderRadius: "2px",
                  outline: "none",
                }}
              />
            </div>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  height: "24px",
                  padding: "0 8px",
                  fontSize: "11px",
                  background: "#e1e1e1",
                  border: "1px solid #adadad",
                  borderRadius: "2px",
                  cursor: "pointer",
                }}
              >
                {t('opModal.clear')}
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Results Table Frame */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "auto",
            background: "#ffffff",
            padding: "0",
          }}
        >
          {filteredItems.length === 0 ? (
            <div
              style={{
                padding: "36px 16px",
                textAlign: "center",
                color: "#666666",
                fontSize: "12px",
              }}
            >
              {items.length === 0
                ? t('opModal.emptyNoVars')
                : t('opModal.emptyNoMatch')}
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif",
                fontSize: "11.5px",
                textAlign: "left",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f0f0f0",
                    borderBottom: "1px solid #c0c0c0",
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                  }}
                >
                  <th
                    onClick={() => toggleSort("name")}
                    style={{
                      padding: "6px 10px",
                      fontWeight: 600,
                      color: "#222222",
                      borderRight: "1px solid #dfdfdf",
                      cursor: "pointer",
                      userSelect: "none",
                      width: "30%",
                    }}
                    title={t('opModal.sortByName')}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span>{t('opModal.colName')}</span>
                      {sortField === "name" ? (
                        sortAsc ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                      ) : (
                        <ArrowUpDown size={11} color="#999" />
                      )}
                    </div>
                  </th>

                  <th
                    onClick={() => toggleSort("quantity")}
                    style={{
                      padding: "6px 10px",
                      fontWeight: 600,
                      color: "#222222",
                      borderRight: "1px solid #dfdfdf",
                      cursor: "pointer",
                      userSelect: "none",
                      width: "38%",
                    }}
                    title={t('opModal.sortByQuantity')}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span>{t('opModal.colQuantity')}</span>
                      {sortField === "quantity" ? (
                        sortAsc ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                      ) : (
                        <ArrowUpDown size={11} color="#999" />
                      )}
                    </div>
                  </th>

                  <th
                    onClick={() => toggleSort("value")}
                    style={{
                      padding: "6px 10px",
                      fontWeight: 600,
                      color: "#222222",
                      cursor: "pointer",
                      userSelect: "none",
                      width: "32%",
                      textAlign: "right",
                    }}
                    title={t('opModal.sortByValue')}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                      <span>{t('opModal.colValue')}</span>
                      {sortField === "value" ? (
                        sortAsc ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                      ) : (
                        <ArrowUpDown size={11} color="#999" />
                      )}
                    </div>
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredItems.map((item, idx) => {
                  const isEven = idx % 2 === 0
                  const displayVal =
                    formatMode === "sci"
                      ? item.scientificValue
                      : formatMode === "dec"
                        ? `${item.value.toFixed(6)} ${item.unit}`.trim()
                        : item.formattedValue

                  // Category badge colors
                  const catColor =
                    item.category === "voltage"
                      ? "#005a9e"
                      : item.category === "current"
                        ? "#0e700e"
                        : "#733399"

                  return (
                    <tr
                      key={item.id}
                      style={{
                        background: isEven ? "#ffffff" : "#fbfbfb",
                        borderBottom: "1px solid #f0f0f0",
                        transition: "background 0.08s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#eef6ff"
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isEven ? "#ffffff" : "#fbfbfb"
                      }}
                    >
                      {/* Name Column */}
                      <td
                        style={{
                          padding: "5px 10px",
                          fontFamily: "monospace",
                          fontWeight: 600,
                          color: catColor,
                          borderRight: "1px solid #f0f0f0",
                        }}
                      >
                        {item.displayName}
                      </td>

                      {/* Quantity Column */}
                      <td
                        style={{
                          padding: "5px 10px",
                          color: "#333333",
                          borderRight: "1px solid #f0f0f0",
                        }}
                      >
                        {item.quantity}
                      </td>

                      {/* Value Column */}
                      <td
                        style={{
                          padding: "5px 10px",
                          fontFamily: "monospace",
                          fontWeight: 600,
                          color: "#111111",
                          textAlign: "right",
                        }}
                      >
                        {displayVal}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Status & Dialog Actions Footer (Classic Grey Windows Bar) */}
        <div
          className="sim-error-win-footer"
          style={{
            justifyContent: "space-between",
          }}
        >
          {/* Telemetry / Status indicator */}
          <div style={{ fontSize: "11px", color: "#555555" }}>
            {t('opModal.showingTelemetry', { filtered: filteredItems.length, total: items.length })}
            {simulationResult?.elapsedMs !== undefined && (
              <span>{t('opModal.computedIn', { ms: simulationResult.elapsedMs })}</span>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="sim-error-win-btn"
              onClick={handleCopy}
              title={t('opModal.copyTooltip')}
            >
              {copied ? (
                <>
                  <Check size={12} color="#0e700e" />
                  <span>{t('opModal.copied')}</span>
                </>
              ) : (
                <>
                  <Copy size={12} />
                  <span>{t('opModal.copy')}</span>
                </>
              )}
            </button>

            <button
              type="button"
              className="sim-error-win-btn"
              onClick={handleExportCsv}
              title={t('opModal.exportTooltip')}
            >
              <Download size={12} />
              <span>{t('opModal.exportCsv')}</span>
            </button>

            <button
              type="button"
              className="sim-error-win-btn"
              onClick={onClose}
              style={{ fontWeight: 600, minWidth: "75px" }}
            >
              {t('opModal.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OperatingPointModal

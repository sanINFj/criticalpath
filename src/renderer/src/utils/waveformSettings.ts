/**
 * CriticalPath EDA - Waveform Settings & Configuration Persistence
 * Manages plot themes, multi-pane allocations, custom trace styling,
 * annotations, custom math expressions, and export/import of configurations.
 */

import type { MathTraceDefinition } from "./waveformMath"

export type PlotTheme = "ltspice-black" | "dark-navy" | "classic-white" | "slate-gray"
export type GridStyle = "solid" | "dotted" | "dashed" | "none"

export interface TraceConfig {
  color?: string
  lineWidth?: number // 1..4
  lineStyle?: "solid" | "dashed" | "dotted"
  pane?: number // 0, 1, or 2 (Pane 1, 2, 3)
  visible?: boolean
}

export interface PlotAnnotation {
  id: string
  type: "text" | "refLineH" | "refLineV" | "arrow"
  pane: number // target pane index (0..2)
  x: number // data coordinate
  y: number // data coordinate
  text?: string
  color?: string
  x2?: number // for arrows
  y2?: number // for arrows
}

export interface AxisLimitsConfig {
  xAuto: boolean
  xMin?: number
  xMax?: number
  yLeftAuto: boolean
  yLeftMin?: number
  yLeftMax?: number
  yRightAuto: boolean
  yRightMin?: number
  yRightMax?: number
}

export interface PlotSettings {
  version: number
  theme: PlotTheme
  gridStyle: GridStyle
  panesCount: 1 | 2 | 3
  traceConfigs: Record<string, TraceConfig>
  annotations: PlotAnnotation[]
  customMathTraces: MathTraceDefinition[]
  axisLimits?: Record<number, AxisLimitsConfig> // keyed by pane index (0, 1, 2)
  globalXLimits?: { auto: boolean; min?: number; max?: number }
}

const STORAGE_KEY = "criticalpath_waveform_plot_settings"

export const DEFAULT_PLOT_SETTINGS: PlotSettings = {
  version: 1,
  theme: "ltspice-black",
  gridStyle: "dotted",
  panesCount: 1,
  traceConfigs: {},
  annotations: [],
  customMathTraces: [],
}

/**
 * Saves plot settings to localStorage
 */
export function savePlotSettings(settings: PlotSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (err) {
    console.warn("Could not save waveform settings to localStorage", err)
  }
}

/**
 * Loads plot settings from localStorage
 */
export function loadPlotSettings(): PlotSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_PLOT_SETTINGS, ...parsed }
    }
  } catch (err) {
    console.warn("Could not load waveform settings from localStorage", err)
  }
  return { ...DEFAULT_PLOT_SETTINGS }
}

/**
 * Exports settings to a downloadable JSON file
 */
export function exportPlotSettingsJson(settings: PlotSettings, filename: string = "criticalpath_plot_settings.json"): void {
  const json = JSON.stringify(settings, null, 2)
  const blob = new Blob([json], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.setAttribute("href", url)
  link.setAttribute("download", filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Imports settings from a selected JSON file
 */
export function importPlotSettingsJson(file: File): Promise<PlotSettings> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const parsed = JSON.parse(text)
        resolve({ ...DEFAULT_PLOT_SETTINGS, ...parsed })
      } catch (err) {
        reject(new Error("Invalid settings JSON file"))
      }
    }
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsText(file)
  })
}

/**
 * Theme color palettes for canvas rendering
 */
export interface ThemeColors {
  appBg: string
  plotBg: string
  border: string
  grid: string
  axisText: string
  zeroLine: string
  crosshair: string
}

export const THEME_PALETTES: Record<PlotTheme, ThemeColors> = {
  "ltspice-black": {
    appBg: "#000000",
    plotBg: "#000000",
    border: "#666666",
    grid: "#333333",
    axisText: "#d1d5db",
    zeroLine: "#888888",
    crosshair: "rgba(255, 255, 255, 0.4)",
  },
  "dark-navy": {
    appBg: "#090d16",
    plotBg: "#0c111d",
    border: "rgba(255, 255, 255, 0.16)",
    grid: "rgba(255, 255, 255, 0.08)",
    axisText: "#94a3b8",
    zeroLine: "rgba(148, 163, 184, 0.35)",
    crosshair: "rgba(255, 255, 255, 0.3)",
  },
  "classic-white": {
    appBg: "#f8f9fa",
    plotBg: "#ffffff",
    border: "#999999",
    grid: "#e5e7eb",
    axisText: "#1f2937",
    zeroLine: "#6b7280",
    crosshair: "rgba(0, 0, 0, 0.4)",
  },
  "slate-gray": {
    appBg: "#1e293b",
    plotBg: "#0f172a",
    border: "#475569",
    grid: "#334155",
    axisText: "#cbd5e1",
    zeroLine: "#94a3b8",
    crosshair: "rgba(255, 255, 255, 0.35)",
  },
}

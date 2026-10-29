import type { Node, Edge } from 'reactflow'
import type { SchematicNodeData } from '../components/schematic/SchematicNode'
import {
  type AnalysisConfig,
  DEFAULT_ANALYSIS_CONFIG,
} from '../components/ConfigureAnalysisModal'
import {
  type SolverSettings,
  DEFAULT_SOLVER_SETTINGS,
} from '../components/SimulationSettingsModal'
import type { SimulationRunResult } from '../../../shared/simulation'

export interface CircuitTab {
  id: string
  title: string
  filePath: string | null
  isDirty: boolean
  nodes: Node<SchematicNodeData>[]
  edges: Edge[]
  history: {
    past: Array<{ nodes: Node<SchematicNodeData>[]; edges: Edge[] }>
    future: Array<{ nodes: Node<SchematicNodeData>[]; edges: Edge[] }>
  }
  analysisConfig: AnalysisConfig
  solverSettings: SolverSettings
  simulationResult: SimulationRunResult | null
  viewport?: { x: number; y: number; zoom: number }
}

export interface RecentFile {
  filePath: string
  title: string
  lastOpened: number
}

export interface SchematicFileFormat {
  version: string
  generator: string
  title: string
  nodes: Node<SchematicNodeData>[]
  edges: Edge[]
  analysisConfig?: AnalysisConfig
  solverSettings?: SolverSettings
  viewport?: { x: number; y: number; zoom: number }
}

const RECENT_FILES_KEY = 'criticalpath_recent_files'
const LAST_DIR_KEY = 'criticalpath_last_dir'

/**
 * Extracts a clean filename from a Windows or POSIX path.
 */
export function getFileNameFromPath(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] || filePath
}

/**
 * Extracts the directory from a full file path.
 */
export function getDirectoryFromPath(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  if (lastSlash === -1) return ''
  return filePath.slice(0, lastSlash)
}

/**
 * Creates a brand new default schematic tab.
 */
export function createDefaultCircuitTab(tabNumber: number): CircuitTab {
  const title = `Draft${tabNumber}.qsch`
  return {
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    filePath: null,
    isDirty: false,
    nodes: [],
    edges: [],
    history: { past: [], future: [] },
    analysisConfig: { ...DEFAULT_ANALYSIS_CONFIG },
    solverSettings: { ...DEFAULT_SOLVER_SETTINGS },
    simulationResult: null,
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

/**
 * Serializes a CircuitTab to a persistent JSON string.
 */
export function serializeCircuitTab(tab: CircuitTab): string {
  const fileData: SchematicFileFormat = {
    version: '1.0',
    generator: 'CriticalPath EDA',
    title: tab.title,
    nodes: tab.nodes,
    edges: tab.edges,
    analysisConfig: tab.analysisConfig,
    solverSettings: tab.solverSettings,
    viewport: tab.viewport,
  }
  return JSON.stringify(fileData, null, 2)
}

/**
 * Deserializes file content into a CircuitTab.
 */
export function deserializeCircuitTab(
  content: string,
  filePath: string | null,
  fallbackTitle: string,
): CircuitTab {
  const title = filePath ? getFileNameFromPath(filePath) : fallbackTitle

  try {
    const parsed = JSON.parse(content)

    // Handle standard CriticalPath JSON format
    if (parsed && (Array.isArray(parsed.nodes) || Array.isArray(parsed.edges))) {
      return {
        id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        filePath,
        isDirty: false,
        nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
        edges: Array.isArray(parsed.edges) ? parsed.edges : [],
        history: { past: [], future: [] },
        analysisConfig: parsed.analysisConfig
          ? { ...DEFAULT_ANALYSIS_CONFIG, ...parsed.analysisConfig }
          : { ...DEFAULT_ANALYSIS_CONFIG },
        solverSettings: parsed.solverSettings
          ? { ...DEFAULT_SOLVER_SETTINGS, ...parsed.solverSettings }
          : { ...DEFAULT_SOLVER_SETTINGS },
        simulationResult: null,
        viewport: parsed.viewport || { x: 0, y: 0, zoom: 1 },
      }
    }
  } catch (_e) {
    // If not JSON, could be an error or another format
  }

  // Fallback empty circuit with filename
  return {
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    filePath,
    isDirty: false,
    nodes: [],
    edges: [],
    history: { past: [], future: [] },
    analysisConfig: { ...DEFAULT_ANALYSIS_CONFIG },
    solverSettings: { ...DEFAULT_SOLVER_SETTINGS },
    simulationResult: null,
  }
}

/**
 * Get recent files stored in localStorage.
 */
export function getRecentFiles(): RecentFile[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Add a file to the recent files list.
 */
export function addRecentFile(filePath: string, title?: string): RecentFile[] {
  try {
    const cleanTitle = title || getFileNameFromPath(filePath)
    const list = getRecentFiles().filter((f) => f.filePath !== filePath)
    const updated: RecentFile[] = [
      { filePath, title: cleanTitle, lastOpened: Date.now() },
      ...list,
    ].slice(0, 10)

    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(updated))
    setLastSavedDir(filePath)
    return updated
  } catch {
    return []
  }
}

/**
 * Clear recent files list.
 */
export function clearRecentFiles(): void {
  try {
    localStorage.removeItem(RECENT_FILES_KEY)
  } catch {}
}

/**
 * Gets the last directory used for saving/opening files.
 */
export function getLastSavedDir(): string | undefined {
  try {
    return localStorage.getItem(LAST_DIR_KEY) || undefined
  } catch {
    return undefined
  }
}

/**
 * Sets the last directory used for saving/opening files.
 */
export function setLastSavedDir(filePath: string): void {
  try {
    const dir = getDirectoryFromPath(filePath)
    if (dir) {
      localStorage.setItem(LAST_DIR_KEY, dir)
    }
  } catch {}
}

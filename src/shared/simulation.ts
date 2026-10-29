/**
 * Shared Simulation Data Structures and IPC Types
 * CriticalPath EDA - SPICE Engine Integration
 */

export interface SimulationVariable {
  index: number
  name: string
  type: string
  unit?: string
}

export interface SimulationRunResult {
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  error?: string
  analysisType: string
  plotName?: string
  isComplex?: boolean
  xVariable?: string
  variables: SimulationVariable[]
  data: Record<string, number[]> // variableName -> array of numerical values
  pointCount: number
  elapsedMs: number
  engineVersion?: string
}

export interface NgspiceEngineStatus {
  available: boolean
  executablePath?: string
  version?: string
  error?: string
}

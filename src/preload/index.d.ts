import { ElectronAPI } from '@electron-toolkit/preload'
import type { SimulationRunResult, NgspiceEngineStatus } from '../shared/simulation'

export interface CriticalPathAPI {
  runSimulation: (netlist: string, analysisType?: string) => Promise<SimulationRunResult>
  stopSimulation: () => Promise<{ stopped: boolean }>
  checkEngine: () => Promise<NgspiceEngineStatus>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CriticalPathAPI
  }
}

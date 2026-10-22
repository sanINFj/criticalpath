import { ElectronAPI } from '@electron-toolkit/preload'
import type { SimulationRunResult, NgspiceEngineStatus } from '../shared/simulation'
import type { AiChatRequest, AiChatResponse } from '../shared/ai'

export interface CriticalPathAPI {
  runSimulation: (netlist: string, analysisType?: string) => Promise<SimulationRunResult>
  stopSimulation: () => Promise<{ stopped: boolean }>
  checkEngine: () => Promise<NgspiceEngineStatus>
  openFile: () => Promise<{ canceled: boolean; filePath?: string; content?: string; error?: string }>
  readFile: (filePath: string) => Promise<{ success: boolean; content?: string; filePath?: string; error?: string }>
  saveFile: (payload: { filePath?: string | null; content: string; defaultPath?: string }) =>
    Promise<{ canceled: boolean; filePath?: string; error?: string }>
  confirmClose: (filename: string) => Promise<{ action: 'save' | 'discard' | 'cancel' }>
  aiChat: (payload: AiChatRequest) => Promise<AiChatResponse>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CriticalPathAPI
  }
}

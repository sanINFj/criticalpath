import { ElectronAPI } from '@electron-toolkit/preload'

export interface NgspiceResult {
  ok: boolean
  stdout: string
  stderr: string
  error?: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      runNgspice: (netlist: string) => Promise<NgspiceResult>
      sendAssistantMessage: (
  message: string,
  language?: 'auto' | 'en' | 'hi' | 'ta' | 'bn' | 'mr' | 'te' | 'gu',
) => Promise<string>
    }
  }
}

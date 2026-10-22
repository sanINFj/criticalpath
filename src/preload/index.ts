import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Secure custom APIs for renderer
const api = {
  runSimulation: (netlist: string, analysisType?: string) =>
    ipcRenderer.invoke('simulation:run', { netlist, analysisType }),
  stopSimulation: () => ipcRenderer.invoke('simulation:stop'),
  checkEngine: () => ipcRenderer.invoke('simulation:checkEngine'),
  openFile: () => ipcRenderer.invoke('file:open'),
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  saveFile: (payload: { filePath?: string | null; content: string; defaultPath?: string }) =>
    ipcRenderer.invoke('file:save', payload),
  confirmClose: (filename: string) => ipcRenderer.invoke('file:confirmClose', filename),
  aiChat: (payload: any) => ipcRenderer.invoke('ai:chat', payload),
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

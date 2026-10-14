import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Secure custom APIs for renderer
const api = {
  runSimulation: (netlist: string, analysisType?: string) =>
    ipcRenderer.invoke('simulation:run', { netlist, analysisType }),
  stopSimulation: () => ipcRenderer.invoke('simulation:stop'),
  checkEngine: () => ipcRenderer.invoke('simulation:checkEngine'),
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

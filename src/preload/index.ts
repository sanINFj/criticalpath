import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  runNgspice: (netlist: string) =>
    import('electron').then(({ ipcRenderer }) =>
      ipcRenderer.invoke('criticalpath:run-ngspice', netlist),
    ),

  sendAssistantMessage: (
  message: string,
  language: string = 'auto',
): Promise<string> =>
  import('electron').then(({ ipcRenderer }) =>
    ipcRenderer.invoke('criticalpath:assistant-message', message, language),
  ),
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

import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
app.disableHardwareAcceleration()
import { join } from 'path'
import * as fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import {
  runNgspiceSimulation,
  stopNgspiceSimulation,
  getNgspiceStatus,
} from './spiceRunner'
import { executeAiChat } from './aiRunner'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: 'ASAP',
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.asap.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Native SPICE Simulation Engine IPC Handlers
  ipcMain.handle(
    'simulation:run',
    async (_event, payload: { netlist: string; analysisType?: string }) => {
      return runNgspiceSimulation(payload.netlist, payload.analysisType)
    },
  )

  ipcMain.handle('simulation:stop', async () => {
    return stopNgspiceSimulation()
  })

  ipcMain.handle('simulation:checkEngine', async () => {
    return getNgspiceStatus()
  })

  // AI Circuit Assistant IPC Handler
  ipcMain.handle('ai:chat', async (_event, payload) => {
    return executeAiChat(payload)
  })

  // File & Project Management IPC Handlers
  ipcMain.handle('file:open', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: 'Open Schematic',
      properties: ['openFile'],
      filters: [
        { name: 'CriticalPath Schematic (*.qsch, *.json)', extensions: ['qsch', 'json'] },
        { name: 'LTspice Schematic (*.asc)', extensions: ['asc'] },
        { name: 'All Files (*.*)', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }
    const filePath = result.filePaths[0]
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8')
      return { canceled: false, filePath, content }
    } catch (err: any) {
      return { canceled: false, filePath, error: err?.message || 'Failed to read file' }
    }
  })

  ipcMain.handle('file:read', async (_event, filePath: string) => {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8')
      return { success: true, content, filePath }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to read file' }
    }
  })

  ipcMain.handle(
    'file:save',
    async (
      event,
      payload: {
        filePath?: string | null
        content: string
        defaultPath?: string
      },
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      let targetPath = payload.filePath
      if (!targetPath) {
        const result = await dialog.showSaveDialog(win!, {
          title: 'Save Schematic As',
          defaultPath: payload.defaultPath || 'Circuit.qsch',
          filters: [
            { name: 'CriticalPath Schematic (*.qsch)', extensions: ['qsch'] },
            { name: 'JSON Schematic (*.json)', extensions: ['json'] },
            { name: 'All Files (*.*)', extensions: ['*'] },
          ],
        })
        if (result.canceled || !result.filePath) {
          return { canceled: true }
        }
        targetPath = result.filePath
      }
      try {
        await fs.promises.writeFile(targetPath, payload.content, 'utf-8')
        return { canceled: false, filePath: targetPath }
      } catch (err: any) {
        return { canceled: false, error: err?.message || 'Failed to write file' }
      }
    },
  )

  ipcMain.handle('file:confirmClose', async (event, filename: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showMessageBox(win!, {
      type: 'warning',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'CriticalPath - Unsaved Changes',
      message: `Do you want to save the changes you made to "${filename}"?`,
      detail: "Your changes will be lost if you don't save them.",
    })
    return {
      action: result.response === 0 ? 'save' : result.response === 1 ? 'discard' : 'cancel',
    }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

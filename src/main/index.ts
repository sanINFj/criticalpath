import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
app.disableHardwareAcceleration()
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'



async function runNgspice(netlist: unknown): Promise<{
  ok: boolean
  stdout: string
  stderr: string
  error?: string
}> {
  if (typeof netlist !== 'string' || netlist.length === 0 || netlist.length > 100_000) {
    return { ok: false, stdout: '', stderr: '', error: 'Invalid or oversized netlist.' }
  }

  // This first version intentionally permits only the exporter's supported
  // passive/source elements and .op/.end. No .control, .include, shell, or
  // arbitrary simulator commands are accepted from the renderer.
  const lines = netlist.split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('*')) continue
    if (/^\.op$/i.test(line) || /^\.end$/i.test(line)) continue

    const validElement =
      /^[RCLVI][A-Za-z0-9_]*\s+\S+\s+\S+\s+(?:DC\s+)?[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?(?:Meg|[kmunpfg]|[a-zA-Z]+)?$/i

    if (!validElement.test(line)) {
      return {
        ok: false,
        stdout: '',
        stderr: '',
        error: `Unsupported SPICE line rejected: ${line.slice(0, 120)}`,
      }
    }
  }

  if (!lines.some((line) => /^\.op\s*$/i.test(line.trim())) ||
      !lines.some((line) => /^\.end\s*$/i.test(line.trim()))) {
    return { ok: false, stdout: '', stderr: '', error: 'Netlist must contain .op and .end.' }
  }

  let directory: string | undefined
  try {
    directory = await mkdtemp(join(tmpdir(), 'criticalpath-ngspice-'))
    const netlistPath = join(directory, 'circuit.cir')
    await writeFile(netlistPath, netlist, { encoding: 'utf8', mode: 0o600 })

    return await new Promise((resolve) => {
      const child = spawn('/usr/bin/ngspice', ['-b', netlistPath], {
        shell: false,
        windowsHide: true,
        cwd: directory,
      })
      let stdout = ''
      let stderr = ''
      let settled = false

      const finish = (result: {
        ok: boolean
        stdout: string
        stderr: string
        error?: string
      }) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(result)
      }

      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        finish({
          ok: false,
          stdout,
          stderr,
          error: 'ngspice exceeded the 10-second time limit.',
        })
      }, 10_000)

      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        stdout = (stdout + chunk).slice(-100_000)
      })
      child.stderr.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-100_000)
      })
      child.on('error', (error) => {
        finish({
          ok: false,
          stdout,
          stderr,
          error: `Could not launch ngspice: ${error.message}`,
        })
      })
      child.on('close', (code) => {
        finish({
          ok: code === 0,
          stdout,
          stderr,
          ...(code === 0 ? {} : { error: `ngspice exited with code ${code}.` }),
        })
      })
    })
  } catch (error) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    if (directory) {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
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
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Narrow simulation API: the renderer can submit a netlist, not a command or path.
  ipcMain.handle('criticalpath:run-ngspice', (_event, netlist: unknown) => runNgspice(netlist))

    
ipcMain.handle(
  'criticalpath:assistant-message',
  async (_event, message: unknown, language: unknown = 'auto') => {
    if (
      typeof message !== 'string' ||
      message.trim().length === 0 ||
      message.length > 10_000
    ) {
      throw new Error('Please provide a valid message under 10,000 characters.')
    }

    const supportedLanguages = [
      'auto',
      'en',
      'hi',
      'ta',
      'bn',
      'mr',
      'te',
      'gu',
    ] as const

    if (
      typeof language !== 'string' ||
      !supportedLanguages.includes(language as (typeof supportedLanguages)[number])
    ) {
      throw new Error('Please select a supported language.')
    }

    const languageNames: Record<
      Exclude<(typeof supportedLanguages)[number], 'auto'>,
      string
    > = {
      en: 'English',
      hi: 'Hindi',
      ta: 'Tamil',
      bn: 'Bengali',
      mr: 'Marathi',
      te: 'Telugu',
      gu: 'Gujarati',
    }

    const languageInstruction =
      language === 'auto'
        ? 'Detect the language of the user’s message and respond in that same language. Support English, Hindi, Tamil, Bengali, Marathi, Telugu, and Gujarati. Preserve standard English technical terms when useful.'
        : `Respond in ${languageNames[language as Exclude<(typeof supportedLanguages)[number], 'auto'>]}. Use this language unless the user explicitly requests a translation or another language. Preserve standard English technical terms when useful.`

    const response = await fetch('http://172.18.48.1:11434/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen2.5:1.5b',
        messages: [
          {
            role: 'system',
            content: `You are CriticalPath Assistant, an electronics and circuit-design assistant. Explain concepts clearly and help users understand circuits, semiconductor devices, and simulation results. Never claim to have inspected circuit data that was not provided. Be honest when you are uncertain. ${languageInstruction}`,
          },
          {
            role: 'user',
            content: message.trim(),
          },
        ],
        stream: false,
      }),
    })

    if (!response.ok) {
      throw new Error(
        `Ollama returned HTTP ${response.status}. Make sure Ollama is running and the model is installed.`,
      )
    }

    const data = (await response.json()) as {
      message?: { content?: string }
    }

    const answer = data.message?.content?.trim()

    if (!answer) {
      throw new Error('The local AI returned an empty response.')
    }

    return answer
  },
)

  // Existing IPC test
  ipcMain.on('ping', () => console.log('pong'))

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

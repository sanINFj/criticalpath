/**
 * SPICE Simulation Runner Service (Electron Main Process)
 * CriticalPath EDA - Native ngspice Engine Integration
 */

import { spawn, execSync, type ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { app } from 'electron'
import type {
  SimulationRunResult,
  SimulationVariable,
  NgspiceEngineStatus,
} from '../shared/simulation'

let cachedExecutablePath: string | null = null
let cachedVersion: string | null = null
let activeSimulationProcess: ChildProcess | null = null

/**
 * Searches and locates the ngspice executable on Windows, Linux, or macOS.
 * Prefers the bundled console-mode binary (ngspice_con.exe) on Windows.
 */
export function findNgspiceExecutable(): string | null {
  if (cachedExecutablePath && fs.existsSync(cachedExecutablePath)) {
    return cachedExecutablePath
  }

  const isWin = process.platform === 'win32'
  const appRoot = app ? app.getAppPath() : process.cwd()
  const cwd = process.cwd()
  const resourcesPath = (process as any).resourcesPath || ''

  const candidateBinaries: string[] = isWin
    ? ['ngspice_con.exe', 'ngspice.exe']
    : ['ngspice']

  // 1. Check user-defined environment variable
  if (process.env.NGSPICE_PATH && fs.existsSync(process.env.NGSPICE_PATH)) {
    cachedExecutablePath = process.env.NGSPICE_PATH
    return cachedExecutablePath
  }

  // 2. Search project bundled directories
  const searchRoots = [
    path.resolve(__dirname, '../..'),
    path.resolve(__dirname, '..'),
    __dirname,
    appRoot,
    cwd,
    resourcesPath,
    path.resolve(appRoot, '..'),
    path.resolve(cwd, '..'),
  ].filter(Boolean)

  for (const root of searchRoots) {
    for (const binName of candidateBinaries) {
      const candidates = [
        path.join(root, 'simulation', 'ngspice', 'Spice64', 'bin', binName),
        path.join(root, 'simulation', 'ngspice', 'bin', binName),
        path.join(root, 'simulation', 'bin', binName),
        path.join(root, 'ngspice', 'bin', binName),
      ]
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          cachedExecutablePath = path.normalize(cand)
          return cachedExecutablePath
        }
      }
    }
  }

  // 3. Search system default locations
  if (isWin) {
    const winDefaults = [
      'C:\\Spice64\\bin\\ngspice_con.exe',
      'C:\\Spice64\\bin\\ngspice.exe',
      'C:\\Program Files\\Spice\\bin\\ngspice.exe',
      'C:\\Program Files\\ngspice\\bin\\ngspice.exe',
      'C:\\Program Files (x86)\\Spice\\bin\\ngspice.exe',
    ]
    for (const cand of winDefaults) {
      if (fs.existsSync(cand)) {
        cachedExecutablePath = cand
        return cachedExecutablePath
      }
    }

    // 4. Check system PATH via where.exe
    for (const binName of candidateBinaries) {
      try {
        const out = execSync(`where.exe ${binName}`, {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
        const first = out.trim().split(/\r?\n/)[0]
        if (first && fs.existsSync(first)) {
          cachedExecutablePath = first
          return cachedExecutablePath
        }
      } catch {}
    }
  } else {
    // Linux / macOS default locations
    const unixDefaults = [
      '/usr/bin/ngspice',
      '/usr/local/bin/ngspice',
      '/opt/homebrew/bin/ngspice',
    ]
    for (const cand of unixDefaults) {
      if (fs.existsSync(cand)) {
        cachedExecutablePath = cand
        return cachedExecutablePath
      }
    }

    try {
      const out = execSync('which ngspice', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      const first = out.trim().split(/\n/)[0]
      if (first && fs.existsSync(first)) {
        cachedExecutablePath = first
        return cachedExecutablePath
      }
    } catch {}
  }

  return null
}

/**
 * Returns the status, version, and path of the local ngspice simulation engine.
 */
export function getNgspiceStatus(): NgspiceEngineStatus {
  const exePath = findNgspiceExecutable()
  if (!exePath) {
    return {
      available: false,
      error:
        'ngspice executable not found. Place the engine in simulation/ngspice/Spice64/bin or ensure ngspice is in your PATH.',
    }
  }

  if (!cachedVersion) {
    try {
      const out = execSync(`"${exePath}" -v`, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 3000,
      })
      const firstLine = out
        .split(/\r?\n/)
        .find((l) => l.includes('ngspice-') || l.includes('Circuit level simulation'))
      cachedVersion = firstLine ? firstLine.replace(/\*+/g, '').trim() : 'ngspice (verified)'
    } catch (e: any) {
      cachedVersion = 'ngspice (detected)'
    }
  }

  return {
    available: true,
    executablePath: exePath,
    version: cachedVersion,
  }
}

/**
 * Parses standardized ASCII SPICE raw files into structured numerical arrays.
 * Supports real (.tran, .dc) and complex (.ac) simulation datasets.
 */
export function parseAsciiRaw(rawText: string): {
  plotName?: string
  isComplex: boolean
  xVariable?: string
  variables: SimulationVariable[]
  data: Record<string, number[]>
  pointCount: number
} {
  const lines = rawText.split(/\r?\n/)
  let plotName: string | undefined
  let isComplex = false
  let pointCount = 0
  const rawVariables: SimulationVariable[] = []
  const data: Record<string, number[]> = {}

  let inVariables = false
  let valuesLineIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    if (line.startsWith('Plotname:')) {
      plotName = line.replace('Plotname:', '').trim()
    } else if (line.startsWith('Flags:')) {
      if (line.toLowerCase().includes('complex')) {
        isComplex = true
      }
    } else if (line.startsWith('No. Points:')) {
      pointCount = parseInt(line.replace('No. Points:', '').trim(), 10) || 0
    } else if (line.startsWith('Variables:')) {
      inVariables = true
      continue
    } else if (line.startsWith('Values:')) {
      inVariables = false
      valuesLineIdx = i
      break
    }

    if (inVariables) {
      const parts = line.split(/\s+/)
      if (parts.length >= 2) {
        const idx = parseInt(parts[0], 10)
        const name = parts[1].toLowerCase()
        const rawType = parts.slice(2).join(' ') || 'voltage'

        let unit = 'V'
        if (name === 'time') unit = 's'
        else if (name === 'frequency') unit = 'Hz'
        else if (name.startsWith('i(') || rawType.includes('current')) unit = 'A'
        else if (name.startsWith('v(') || rawType.includes('voltage')) unit = 'V'

        rawVariables.push({ index: idx, name, type: rawType, unit })
        data[name] = []
      }
    }
  }

  const xVariable = rawVariables.length > 0 ? rawVariables[0].name : undefined

  // If AC complex analysis, allocate companion arrays for dB and phase
  if (isComplex) {
    for (let v = 1; v < rawVariables.length; v++) {
      const baseName = rawVariables[v].name
      data[`${baseName}_db`] = []
      data[`${baseName}_phase`] = []
    }
  }

  if (valuesLineIdx !== -1 && rawVariables.length > 0) {
    const valuesContent = lines.slice(valuesLineIdx + 1).join(' ')
    const tokens = valuesContent.trim().split(/\s+/).filter(Boolean)
    const numVars = rawVariables.length
    const stride = numVars + 1 // [pointIndex, val0, val1, ..., valN-1]

    let actualPoints = 0
    for (let i = 0; i < tokens.length; i += stride) {
      if (i + numVars > tokens.length) break
      actualPoints++

      for (let v = 0; v < numVars; v++) {
        const valToken = tokens[i + 1 + v]
        const varName = rawVariables[v].name

        let re = 0
        let im = 0

        if (valToken.includes(',')) {
          const parts = valToken.split(',')
          re = parseFloat(parts[0]) || 0
          im = parseFloat(parts[1]) || 0
        } else {
          re = parseFloat(valToken) || 0
        }

        if (v === 0) {
          // Independent sweep variable (time, frequency, v-sweep)
          data[varName].push(isNaN(re) ? 0 : re)
        } else if (isComplex) {
          const mag = Math.hypot(re, im)
          const phase = (Math.atan2(im, re) * 180) / Math.PI
          const magDb = 20 * Math.log10(Math.max(mag, 1e-15))

          data[varName].push(mag)
          data[`${varName}_db`].push(magDb)
          data[`${varName}_phase`].push(phase)
        } else {
          data[varName].push(isNaN(re) ? 0 : re)
        }
      }
    }
    if (actualPoints > 0) {
      pointCount = actualPoints
    }
  }

  // Construct complete variables list including AC dB and Phase representations
  const variables: SimulationVariable[] = []
  for (let v = 0; v < rawVariables.length; v++) {
    const rv = rawVariables[v]
    variables.push(rv)

    if (isComplex && v > 0) {
      variables.push({
        index: variables.length,
        name: `${rv.name}_db`,
        type: `${rv.type} (dB)`,
        unit: 'dB',
      })
      variables.push({
        index: variables.length,
        name: `${rv.name}_phase`,
        type: `${rv.type} (Phase)`,
        unit: '°',
      })
    }
  }

  return { plotName, isComplex, xVariable, variables, data, pointCount }
}

/**
 * Executes a generated SPICE netlist using ngspice in batch mode (-b -a -r).
 * Captures genuine numerical outputs, exit code, stdout, stderr, and cleans up temporary files.
 */
export async function runNgspiceSimulation(
  netlist: string,
  analysisType: string = 'tran',
  timeoutMs: number = 30000,
): Promise<SimulationRunResult> {
  const exePath = findNgspiceExecutable()
  if (!exePath) {
    return {
      success: false,
      exitCode: -1,
      stdout: '',
      stderr: '',
      error:
        'ngspice simulation engine not found on this system. Please check simulation/ngspice installation.',
      analysisType,
      variables: [],
      data: {},
      pointCount: 0,
      elapsedMs: 0,
    }
  }

  // Abort any currently running simulation
  if (activeSimulationProcess) {
    stopNgspiceSimulation()
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'criticalpath_sim_'))
  const cirFile = path.join(tmpDir, 'circuit.cir')
  const rawFile = path.join(tmpDir, 'output.raw')

  // Ensure netlist ends with .end
  let finalNetlist = netlist.trim()
  if (!/\.end$/i.test(finalNetlist)) {
    finalNetlist += '\n.end\n'
  }

  fs.writeFileSync(cirFile, finalNetlist, 'utf-8')

  const startTime = Date.now()

  return new Promise<SimulationRunResult>((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      if (activeSimulationProcess) {
        try {
          activeSimulationProcess.kill()
        } catch {}
      }
    }, timeoutMs)

    try {
      const child = spawn(exePath, ['-b', '-a', '-r', rawFile, cirFile], {
        cwd: tmpDir,
        windowsHide: true,
      })

      activeSimulationProcess = child

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      child.on('error', (err) => {
        clearTimeout(timer)
        activeSimulationProcess = null
        cleanupDir(tmpDir)
        resolve({
          success: false,
          exitCode: -1,
          stdout,
          stderr: `${stderr}\n${err.message}`,
          error: `Failed to spawn ngspice: ${err.message}`,
          analysisType,
          variables: [],
          data: {},
          pointCount: 0,
          elapsedMs: Date.now() - startTime,
        })
      })

      child.on('close', (exitCode) => {
        clearTimeout(timer)
        activeSimulationProcess = null
        const elapsedMs = Date.now() - startTime

        if (timedOut) {
          cleanupDir(tmpDir)
          resolve({
            success: false,
            exitCode: -1,
            stdout,
            stderr: `${stderr}\nSimulation exceeded timeout limit of ${timeoutMs / 1000}s.`,
            error: `Simulation timed out after ${timeoutMs / 1000} seconds. Possible convergence difficulty.`,
            analysisType,
            variables: [],
            data: {},
            pointCount: 0,
            elapsedMs,
          })
          return
        }

        let rawContent = ''
        if (fs.existsSync(rawFile)) {
          try {
            rawContent = fs.readFileSync(rawFile, 'utf-8')
          } catch {}
        }

        cleanupDir(tmpDir)

        if (!rawContent && exitCode !== 0) {
          const errMsg = extractNgspiceErrorMessage(stdout, stderr)
          resolve({
            success: false,
            exitCode,
            stdout,
            stderr,
            error: errMsg || `ngspice terminated with exit code ${exitCode}`,
            analysisType,
            variables: [],
            data: {},
            pointCount: 0,
            elapsedMs,
          })
          return
        }

        const parsed = parseAsciiRaw(rawContent)
        const errMsg = extractNgspiceErrorMessage(stdout, stderr)

        // Determine if simulation succeeded: must have points, at least one circuit node besides independent sweep variable, and no fatal errors
        const hasCircuitNodes = parsed.variables.some(
          (v) =>
            v.name !== 'time' &&
            v.name !== 'frequency' &&
            !v.name.includes('sweep') &&
            v.index > 0,
        )
        const hasData = parsed.pointCount > 0 && hasCircuitNodes
        const isSuccessful =
          (exitCode === 0 || exitCode === null) &&
          hasData &&
          !errMsg

        resolve({
          success: isSuccessful,
          exitCode,
          stdout,
          stderr,
          error: !isSuccessful
            ? errMsg ||
              (parsed.variables.length <= 1
                ? 'No valid circuit nodes found to simulate'
                : 'Simulation produced no output vectors')
            : undefined,
          analysisType,
          plotName: parsed.plotName,
          isComplex: parsed.isComplex,
          xVariable: parsed.xVariable,
          variables: parsed.variables,
          data: parsed.data,
          pointCount: parsed.pointCount,
          elapsedMs,
          engineVersion: cachedVersion || undefined,
        })
      })
    } catch (err: any) {
      clearTimeout(timer)
      activeSimulationProcess = null
      cleanupDir(tmpDir)
      resolve({
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: err.message,
        error: `Unexpected error starting simulation: ${err.message}`,
        analysisType,
        variables: [],
        data: {},
        pointCount: 0,
        elapsedMs: Date.now() - startTime,
      })
    }
  })
}

/**
 * Terminates the actively running ngspice simulation child process.
 */
export function stopNgspiceSimulation(): { stopped: boolean } {
  if (!activeSimulationProcess) {
    return { stopped: false }
  }

  try {
    const pid = activeSimulationProcess.pid
    if (process.platform === 'win32' && pid) {
      try {
        execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' })
      } catch {
        activeSimulationProcess.kill('SIGKILL')
      }
    } else {
      activeSimulationProcess.kill('SIGTERM')
    }
    activeSimulationProcess = null
    return { stopped: true }
  } catch {
    return { stopped: false }
  }
}

function cleanupDir(dirPath: string) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true })
    }
  } catch {}
}

function extractNgspiceErrorMessage(stdout: string, stderr: string): string | null {
  const combined = `${stdout}\n${stderr}`
  const errLines = combined
    .split(/\r?\n/)
    .filter((l) => /error|fatal|singular matrix|do not exist|syntax error|not a valid .* line|unknown device/i.test(l))
    .map((l) => l.trim())
    .filter(Boolean)

  if (errLines.length > 0) {
    return errLines.slice(0, 3).join('; ')
  }
  return null
}

/**
 * CriticalPath EDA - Waveform Fast Fourier Transform (FFT) Engine
 * Resamples non-uniform SPICE time series onto a uniform grid and computes
 * the single-sided power spectrum magnitude in dB vs frequency.
 */

export interface FftResult {
  frequencies: number[] // Frequency bins in Hz (from 0 to Nyquist)
  magnitudesDb: number[] // Magnitude in dBV (or dB)
  peakFrequency: number // Dominant fundamental frequency
  peakMagnitudeDb: number // Peak magnitude in dB
  samplingRate: number // Uniform sampling rate (Hz)
  pointCount: number // FFT length (N)
}

/**
 * Resamples a non-uniform (time, val) series onto N uniform points
 */
export function resampleUniform(
  time: number[],
  values: number[],
  nPoints: number,
): { tUniform: number[]; yUniform: number[]; dt: number } {
  if (time.length < 2 || values.length < 2) {
    return { tUniform: [], yUniform: [], dt: 0 }
  }

  const tStart = time[0]
  const tEnd = time[time.length - 1]
  const dt = (tEnd - tStart) / (nPoints - 1)
  const tUniform = new Array<number>(nPoints)
  const yUniform = new Array<number>(nPoints)

  let srcIdx = 0
  const maxSrcIdx = time.length - 1

  for (let i = 0; i < nPoints; i++) {
    const tTarget = tStart + i * dt
    tUniform[i] = tTarget

    // Advance srcIdx until time[srcIdx + 1] >= tTarget
    while (srcIdx < maxSrcIdx - 1 && time[srcIdx + 1] < tTarget) {
      srcIdx++
    }

    const t0 = time[srcIdx]
    const t1 = time[srcIdx + 1]
    const y0 = values[srcIdx]
    const y1 = values[srcIdx + 1]

    if (t1 === t0) {
      yUniform[i] = y0
    } else {
      const frac = (tTarget - t0) / (t1 - t0)
      yUniform[i] = y0 + frac * (y1 - y0)
    }
  }

  return { tUniform, yUniform, dt }
}

/**
 * In-place Cooley-Tukey Radix-2 FFT
 * Requires real and imag arrays to have length equal to a power of 2
 */
export function radix2Fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length
  if (n <= 1) return

  // Bit-reversal permutation
  let j = 0
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tempR = real[i]
      real[i] = real[j]
      real[j] = tempR

      const tempI = imag[i]
      imag[i] = imag[j]
      imag[j] = tempI
    }
    let k = n >> 1
    while (k <= j) {
      j -= k
      k >>= 1
    }
    j += k
  }

  // Butterfly calculations
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1
    const angle = (-2 * Math.PI) / len
    const wStepR = Math.cos(angle)
    const wStepI = Math.sin(angle)

    for (let i = 0; i < n; i += len) {
      let wR = 1.0
      let wI = 0.0

      for (let k = 0; k < halfLen; k++) {
        const idxEven = i + k
        const idxOdd = i + k + halfLen

        const oddR = real[idxOdd] * wR - imag[idxOdd] * wI
        const oddI = real[idxOdd] * wI + imag[idxOdd] * wR

        real[idxOdd] = real[idxEven] - oddR
        imag[idxOdd] = imag[idxEven] - oddI

        real[idxEven] += oddR
        imag[idxEven] += oddI

        const nextWR = wR * wStepR - wI * wStepI
        wI = wR * wStepI + wI * wStepR
        wR = nextWR
      }
    }
  }
}

/**
 * Computes single-sided FFT power spectrum (magnitude in dB vs frequency)
 * @param time Array of time points (seconds)
 * @param values Array of signal values (V or A)
 * @param fftSize Desired FFT size (power of 2, e.g. 1024 or 2048)
 * @param windowType Windowing function: "hanning" | "rectangular"
 */
export function computeWaveformFft(
  time: number[],
  values: number[],
  fftSize: number = 1024,
  windowType: "hanning" | "rectangular" = "hanning",
): FftResult | null {
  if (!time || !values || time.length < 8 || values.length < 8) {
    return null
  }

  // Force fftSize to nearest power of 2 between 256 and 4096
  let n = 1
  while (n < fftSize && n < 4096) n <<= 1
  if (n < 256) n = 256

  // 1. Resample to uniform time steps
  const { yUniform, dt } = resampleUniform(time, values, n)
  if (dt <= 0) return null

  const fs = 1 / dt // Sampling frequency in Hz

  // 2. Prepare real and imaginary buffers and apply window function
  const real = new Float64Array(n)
  const imag = new Float64Array(n)

  // Coherent gain for Hanning window is ~0.5
  const coherentGain = windowType === "hanning" ? 0.5 : 1.0

  for (let i = 0; i < n; i++) {
    let w = 1.0
    if (windowType === "hanning") {
      w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
    }
    real[i] = yUniform[i] * w
    imag[i] = 0
  }

  // 3. Compute FFT
  radix2Fft(real, imag)

  // 4. Compute single-sided magnitude spectrum up to Nyquist (N/2)
  const halfN = n / 2
  const frequencies = new Array<number>(halfN)
  const magnitudesDb = new Array<number>(halfN)

  let peakFreq = 0
  let peakDb = -Infinity

  for (let k = 0; k < halfN; k++) {
    const freq = (k * fs) / n
    frequencies[k] = freq

    const re = real[k]
    const im = imag[k]
    let mag = Math.sqrt(re * re + im * im)

    // Normalize magnitude: factor of 2 for single-sided spectrum (except DC k=0)
    if (k === 0) {
      mag = mag / (n * coherentGain)
    } else {
      mag = (2 * mag) / (n * coherentGain)
    }

    // Convert to dB (reference 1.0V), floor at -140 dB
    const db = 20 * Math.log10(Math.max(mag, 1e-7))
    magnitudesDb[k] = db

    // Track peak frequency excluding DC (k > 0)
    if (k > 0 && db > peakDb) {
      peakDb = db
      peakFreq = freq
    }
  }

  return {
    frequencies,
    magnitudesDb,
    peakFrequency: peakFreq,
    peakMagnitudeDb: peakDb,
    samplingRate: fs,
    pointCount: n,
  }
}

// Global in-memory simulation state
declare global {
  var __simState: Record<string, SimEvent> | undefined
}

export interface SimEvent {
  active: boolean
  type: 'normal' | 'medium' | 'landslide'
  stationId: string
  startedAt: number
  durationMs: number
  // Realistic geodetic parameters
  params: {
    hVel: number        // mm/day horizontal velocity
    uVel: number        // mm/day vertical velocity (negative = subsidence)
    zscore: number      // statistical anomaly score
    rainfall: number    // mm/24h
    soilMoisture: number // %
    piezometer: number  // kPa
    tilt: number        // degrees
  }
}

// Realistic parameter ranges based on Cameron Highlands geology
export const SCENARIO_PARAMS = {
  normal: {
    label: 'Normal Conditions',
    desc: 'Stable slope, no significant movement',
    color: '#16a34a',
    hVel: 0.3,        // mm/day
    uVel: -0.1,       // slight subsidence
    zscore: 0.5,
    rainfall: 10,
    soilMoisture: 38,
    piezometer: 42,
    tilt: 0.3,
    riskScore: 5,
    jitter: { hVel: 0.1, zscore: 0.2, rainfall: 5 }
  },
  medium: {
    label: 'Elevated Risk',
    desc: 'Post-rainfall creep, increased pore pressure',
    color: '#d97706',
    hVel: 2.4,
    uVel: -0.8,
    zscore: 2.1,
    rainfall: 38,
    soilMoisture: 68,
    piezometer: 78,
    tilt: 1.2,
    riskScore: 52,
    jitter: { hVel: 0.3, zscore: 0.3, rainfall: 8 }
  },
  landslide: {
    label: 'Active Landslide',
    desc: 'Rapid displacement, slope failure in progress',
    color: '#dc2626',
    hVel: 15.8,
    uVel: -28.4,
    zscore: 4.8,
    rainfall: 95,
    soilMoisture: 89,
    piezometer: 142,
    tilt: 3.7,
    riskScore: 95,
    jitter: { hVel: 2.0, zscore: 0.5, rainfall: 15 }
  }
}

export function getSimState(): Record<string, SimEvent> {
  if (!globalThis.__simState) globalThis.__simState = {}
  return globalThis.__simState
}

export function setSimEvent(stationId: string, event: SimEvent) {
  if (!globalThis.__simState) globalThis.__simState = {}
  globalThis.__simState[stationId] = event
}

export function clearSimEvent(stationId: string) {
  if (globalThis.__simState) delete globalThis.__simState[stationId]
}

export function getActiveEvent(stationId: string): SimEvent | null {
  const state = getSimState()
  const ev = state[stationId]
  if (!ev || !ev.active) return null
  if (Date.now() - ev.startedAt > ev.durationMs) {
    clearSimEvent(stationId)
    return null
  }
  return ev
}
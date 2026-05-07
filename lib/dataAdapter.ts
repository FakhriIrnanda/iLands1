/**
 * iLands Data Adapter
 * ===================
 * This is the SINGLE FILE you need to modify when connecting real sensors.
 *
 * Current mode: CSV (mock/demo)
 * Future mode:  swap DATA_SOURCE to 'live' and implement fetchLiveSensorData()
 *
 * The rest of the dashboard (API routes, components) reads ONLY from this adapter.
 * Nothing else needs to change when you go live.
 */

import { dataStore } from './dataStore'
import { STATIONS, type StationConfig } from './sensorConfig'

// ─── Toggle this when going live ─────────────────────────────────────────────
export const DATA_SOURCE: 'csv' | 'live' = 'csv'
// ─────────────────────────────────────────────────────────────────────────────

// Normalised shape that the dashboard always expects.
// No matter where data comes from, it must conform to this.
export interface SensorReading {
  stationId   : string        // e.g. 'BAKO'
  timestamp   : string        // ISO 8601, e.g. '2025-05-06T10:00:00Z'

  // GNSS displacement (mm, relative to reference epoch)
  e           : number        // East component
  n           : number        // North component
  u           : number        // Up (vertical) component

  // Derived velocity (mm/day) — null if not enough data yet
  h_vel       : number | null // Horizontal velocity magnitude
  e_vel       : number | null // East velocity
  n_vel       : number | null // North velocity
  u_vel       : number | null // Vertical velocity

  // Quality / risk
  risk        : 'LOW' | 'MEDIUM' | 'HIGH'
  riskScore   : number        // 0–100
  anomaly     : 'YES' | 'NO'

  // Raw signal quality (optional — shown only on engineering sub-screens)
  snr?        : number        // Signal-to-noise ratio (dB-Hz)
  pdop?       : number        // Position dilution of precision
  numSats?    : number        // Number of satellites tracked
}

// ─── Main getter — called by all API routes ───────────────────────────────────
/**
 * Get the latest reading for a station.
 * Returns live data if available in the store, falls back to CSV mock.
 */
export async function getLatestReading(stationId: string): Promise<SensorReading | null> {
  const id = stationId.toUpperCase()

  if (DATA_SOURCE === 'live') {
    // 1. Try in-memory store first (most recent ingest)
    const live = dataStore.getLatest(id)
    if (live) return live

    // 2. If store is empty (e.g. server just restarted), try fetching directly
    //    Uncomment and implement when you have a sensor endpoint:
    // return await fetchLiveSensorData(id)

    return null
  }

  // CSV mode — read from existing parseCSV util
  return await readFromCSV(id)
}

/**
 * Get the last N readings for a station (for charts/sparklines).
 */
export async function getReadingHistory(stationId: string, n = 60): Promise<SensorReading[]> {
  const id = stationId.toUpperCase()

  if (DATA_SOURCE === 'live') {
    const history = dataStore.getHistory(id, n)
    if (history.length > 0) return history
    // fallback to CSV for history until enough live data accumulates
  }

  return await readHistoryFromCSV(id, n)
}

/**
 * Get metadata for all stations (name, location, coordinates, etc.)
 */
export function getAllStationMeta() {
  return STATIONS
}

// ─── Live sensor fetcher (implement this when going live) ─────────────────────
/**
 * TODO: implement this when connecting real sensors.
 *
 * This function should:
 *   1. Call your sensor server / NTRIP caster / MQTT broker
 *   2. Parse the response into a SensorReading object
 *   3. Return it
 *
 * Example skeleton:
 *
 *   async function fetchLiveSensorData(stationId: string): Promise<SensorReading | null> {
 *     const res = await fetch(`${process.env.SENSOR_API_URL}/stations/${stationId}/latest`, {
 *       headers: { 'Authorization': `Bearer ${process.env.SENSOR_API_KEY}` }
 *     })
 *     if (!res.ok) return null
 *     const raw = await res.json()
 *     return normaliseSensorPayload(stationId, raw)
 *   }
 */

// ─── Payload normaliser — adapt this to match your sensor's output format ─────
/**
 * Takes whatever JSON your sensor server sends and maps it to SensorReading.
 * This is the ONLY place you need to know the sensor's field names.
 *
 * Example: if your sensor sends { lat, lon, east_mm, north_mm, up_mm, quality }
 * you'd map it here.
 */
export function normaliseSensorPayload(stationId: string, raw: Record<string, unknown>): SensorReading {
  // ── Adjust the field names below to match your sensor output ──
  const e     = Number(raw['east_mm']    ?? raw['e']  ?? raw['E'] ?? 0)
  const n     = Number(raw['north_mm']   ?? raw['n']  ?? raw['N'] ?? 0)
  const u     = Number(raw['up_mm']      ?? raw['u']  ?? raw['U'] ?? 0)
  const h_vel = raw['h_vel_mmday']  != null ? Number(raw['h_vel_mmday'])  : null
  const e_vel = raw['e_vel_mmday']  != null ? Number(raw['e_vel_mmday'])  : null
  const n_vel = raw['n_vel_mmday']  != null ? Number(raw['n_vel_mmday'])  : null
  const u_vel = raw['u_vel_mmday']  != null ? Number(raw['u_vel_mmday'])  : null

  // Risk classification — use your own thresholds from sensorConfig
  const station = STATIONS.find(s => s.id === stationId)
  const thresh  = station?.thresholds ?? { medium: 2, high: 5 }
  const speed   = h_vel ?? Math.sqrt(e*e + n*n) / 10 // rough fallback
  const risk: SensorReading['risk'] =
    speed >= thresh.high   ? 'HIGH'   :
    speed >= thresh.medium ? 'MEDIUM' : 'LOW'

  const riskScore =
    risk === 'HIGH'   ? Math.min(99, 70 + Math.round(speed * 3)) :
    risk === 'MEDIUM' ? Math.min(69, 40 + Math.round(speed * 5)) :
    Math.min(39, Math.round(speed * 8))

  const anomaly: 'YES' | 'NO' =
    (raw['anomaly'] === true || raw['anomaly'] === 'YES' || riskScore > 80) ? 'YES' : 'NO'

  return {
    stationId,
    timestamp : String(raw['timestamp'] ?? raw['time'] ?? new Date().toISOString()),
    e, n, u, h_vel, e_vel, n_vel, u_vel,
    risk, riskScore, anomaly,
    snr     : raw['snr']      != null ? Number(raw['snr'])     : undefined,
    pdop    : raw['pdop']     != null ? Number(raw['pdop'])    : undefined,
    numSats : raw['num_sats'] != null ? Number(raw['num_sats']): undefined,
  }
}

// ─── CSV helpers (existing behaviour, kept intact) ───────────────────────────
async function readFromCSV(stationId: string): Promise<SensorReading | null> {
  try {
    // Dynamic import so it tree-shakes away when DATA_SOURCE === 'live'
    const { parseStationCSV, getStationMeta } = await import('./parseCSV')
    const rows = parseStationCSV(stationId)
    const meta = getStationMeta(stationId)
    if (!rows.length) return null
    const last = rows[rows.length - 1]
    return {
      stationId,
      timestamp : last.date ?? new Date().toISOString(),
      e         : last.e_mm   ?? 0,
      n         : last.n_mm   ?? 0,
      u         : last.u_mm   ?? 0,
      h_vel     : last.h_vel_mmday ?? null,
      e_vel     : last.e_vel_mmday ?? null,
      n_vel     : last.n_vel_mmday ?? null,
      u_vel     : last.u_vel_mmday ?? null,
      risk      : (last.risk_level ?? 'LOW') as SensorReading['risk'],
      riskScore : last.risk_score ?? 0,
      anomaly   : (last.anomaly_any ?? 'NO') as 'YES' | 'NO',
    }
  } catch {
    return null
  }
}

async function readHistoryFromCSV(stationId: string, n: number): Promise<SensorReading[]> {
  try {
    const { parseStationCSV } = await import('./parseCSV')
    const rows = parseStationCSV(stationId).slice(-n)
    return rows.map(last => ({
      stationId,
      timestamp : last.date ?? new Date().toISOString(),
      e         : last.e_mm   ?? 0,
      n         : last.n_mm   ?? 0,
      u         : last.u_mm   ?? 0,
      h_vel     : last.h_vel_mmday ?? null,
      e_vel     : last.e_vel_mmday ?? null,
      n_vel     : last.n_vel_mmday ?? null,
      u_vel     : last.u_vel_mmday ?? null,
      risk      : (last.risk_level ?? 'LOW') as SensorReading['risk'],
      riskScore : last.risk_score ?? 0,
      anomaly   : (last.anomaly_any ?? 'NO') as 'YES' | 'NO',
    }))
  } catch {
    return []
  }
}

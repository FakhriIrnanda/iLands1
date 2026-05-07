/**
 * iLands Data Store
 * =================
 * In-memory store for live sensor readings.
 * Holds the latest reading + a rolling history buffer per station.
 *
 * Why in-memory?
 *   - Zero infrastructure to set up for now
 *   - Fast reads for the dashboard
 *
 * When to upgrade to a real database:
 *   - When you need readings to survive a server restart
 *   - When you need queries across time ranges
 *   - Recommended: TimescaleDB (Postgres + time-series) or InfluxDB
 *
 * The store is a singleton — imported by both the ingest API and the live API.
 */

import type { SensorReading } from './dataAdapter'

const HISTORY_LIMIT = 1440  // Keep up to 24 h at 1-min resolution

class DataStore {
  private latest  : Map<string, SensorReading>         = new Map()
  private history : Map<string, SensorReading[]>       = new Map()
  private lastSeen: Map<string, number>                 = new Map()  // timestamp ms

  /** Push a new reading from the ingest endpoint */
  push(reading: SensorReading): void {
    const id = reading.stationId.toUpperCase()

    // Update latest
    this.latest.set(id, reading)
    this.lastSeen.set(id, Date.now())

    // Append to rolling history
    const hist = this.history.get(id) ?? []
    hist.push(reading)
    if (hist.length > HISTORY_LIMIT) hist.shift()
    this.history.set(id, hist)
  }

  /** Get the most recent reading for a station */
  getLatest(stationId: string): SensorReading | null {
    return this.latest.get(stationId.toUpperCase()) ?? null
  }

  /** Get last N readings for a station (oldest first) */
  getHistory(stationId: string, n = 60): SensorReading[] {
    const hist = this.history.get(stationId.toUpperCase()) ?? []
    return hist.slice(-n)
  }

  /** How long ago (seconds) was the last reading received? */
  staleness(stationId: string): number | null {
    const t = this.lastSeen.get(stationId.toUpperCase())
    return t != null ? Math.round((Date.now() - t) / 1000) : null
  }

  /** True if any reading was received in the last `windowSec` seconds */
  isOnline(stationId: string, windowSec = 600): boolean {
    const s = this.staleness(stationId)
    return s != null && s <= windowSec
  }

  /** Snapshot of all stations — used by /api/stations */
  allLatest(): SensorReading[] {
    return Array.from(this.latest.values())
  }

  /** Debug: full store summary */
  summary() {
    return Array.from(this.latest.keys()).map(id => ({
      id,
      staleness: this.staleness(id),
      historyLen: (this.history.get(id) ?? []).length,
      online: this.isOnline(id),
    }))
  }
}

// Singleton — shared across all API route invocations in the same process
export const dataStore = new DataStore()

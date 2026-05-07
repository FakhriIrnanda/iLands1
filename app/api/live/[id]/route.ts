/**
 * GET /api/live/[id]
 *
 * Returns the latest sensor reading for a station.
 * Reads from dataAdapter — works in both CSV mode and live mode.
 * No changes needed here when switching to real sensors.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getLatestReading } from '@/lib/dataAdapter'
import { dataStore } from '@/lib/dataStore'
import { STATION_MAP } from '@/lib/sensorConfig'
import { DATA_SOURCE } from '@/lib/dataAdapter'
import { getActiveEvent } from '@/lib/simState'

// ─── Simulate realistic sensor noise (CSV mode only) ─────────────────────────
const noiseState: Record<string, { drift: number; trend: number }> = {}

function applyNoise(id: string, reading: any) {
  if (DATA_SOURCE === 'live') return reading

  if (!noiseState[id]) {
    noiseState[id] = { drift: 0, trend: (Math.random() - 0.5) * 0.002 }
  }

  const s = noiseState[id]
  if (Math.random() < 0.05) s.trend = (Math.random() - 0.5) * 0.002
  s.drift += s.trend

  const jitter = () => (Math.random() - 0.5) * 0.08
  const drift  = s.drift

  const e     = parseFloat((reading.e + jitter() + drift * 0.3).toFixed(3))
  const n     = parseFloat((reading.n + jitter() + drift * 0.2).toFixed(3))
  const u     = parseFloat((reading.u + jitter() + drift * 0.1).toFixed(3))
  const h_vel = reading.h_vel != null
    ? parseFloat(Math.max(0, reading.h_vel + (Math.random() - 0.5) * 0.05).toFixed(4))
    : null
  const e_vel = reading.e_vel != null ? parseFloat((reading.e_vel + jitter() * 0.1).toFixed(4)) : null
  const n_vel = reading.n_vel != null ? parseFloat((reading.n_vel + jitter() * 0.1).toFixed(4)) : null
  const u_vel = reading.u_vel != null ? parseFloat((reading.u_vel + jitter() * 0.1).toFixed(4)) : null

  return { ...reading, e, n, u, h_vel, e_vel, n_vel, u_vel }
}

// ─── Apply simulation scenario override ──────────────────────────────────────
function applySimOverride(id: string, reading: any) {
  const simEvent = getActiveEvent(id)
  if (!simEvent) return reading

  const p = simEvent.params
  const risk: 'LOW' | 'MEDIUM' | 'HIGH' =
    simEvent.type === 'landslide' ? 'HIGH' :
    simEvent.type === 'medium'    ? 'MEDIUM' : 'LOW'
  const riskScore =
    simEvent.type === 'landslide' ? 95 :
    simEvent.type === 'medium'    ? 52 : 5
  const anomaly = simEvent.type !== 'normal' ? 'YES' : 'NO'

  // Add jitter to sim values too so they look live
  const jitter = () => (Math.random() - 0.5) * 0.1

  return {
    ...reading,
    e       : parseFloat((reading.e + p.hVel * 0.3 + jitter()).toFixed(3)),
    n       : parseFloat((reading.n + p.hVel * 0.2 + jitter()).toFixed(3)),
    u       : parseFloat((reading.u + p.hVel * 0.1 + jitter()).toFixed(3)),
    h_vel   : parseFloat((p.hVel + (Math.random() - 0.5) * 0.2).toFixed(4)),
    e_vel   : parseFloat((p.hVel * 0.6 + jitter()).toFixed(4)),
    n_vel   : parseFloat((p.hVel * 0.4 + jitter()).toFixed(4)),
    u_vel   : parseFloat((p.hVel * 0.1 + jitter()).toFixed(4)),
    risk,
    riskScore,
    anomaly,
  }
}

function derivePhase(risk: string, hVel: number | null): string {
  const v = hVel ?? 0
  if (risk === 'HIGH'   || v >= 5) return 'Acceleration'
  if (risk === 'MEDIUM' || v >= 2) return 'Creep'
  return 'Stable'
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id      = params.id.toUpperCase()
  const station = STATION_MAP[id]

  if (!station) {
    return NextResponse.json({ error: `Unknown station: ${id}` }, { status: 404 })
  }

  const reading = await getLatestReading(id)

  if (!reading) {
    return NextResponse.json({ error: 'No data available', station: id }, { status: 503 })
  }

  const staleness = dataStore.staleness(id)
  const online    = DATA_SOURCE === 'csv' ? true : dataStore.isOnline(id)

  // 1. Apply sim override first (if scenario active)
  // 2. Then apply noise on top for live feel
  const simmed = applySimOverride(id, reading)
  const r      = applyNoise(id, simmed)

  return NextResponse.json({
    station  : id,
    name     : station.name,
    location : station.location,
    online,
    dataSource: DATA_SOURCE,
    staleness : staleness != null ? `${staleness}s ago` : null,

    current: {
      e      : r.e,
      n      : r.n,
      u      : r.u,
      risk   : r.risk,
      score  : r.riskScore,
      anomaly: r.anomaly,
      h_vel  : r.h_vel,
      e_vel  : r.e_vel,
      n_vel  : r.n_vel,
      u_vel  : r.u_vel,
    },

    engineering: {
      snr    : r.snr,
      pdop   : r.pdop,
      numSats: r.numSats,
    },

    timestamp: r.timestamp,
    phase    : derivePhase(r.risk, r.h_vel),
  })
}
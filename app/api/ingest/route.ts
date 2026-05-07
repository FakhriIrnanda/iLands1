/**
 * iLands Sensor Ingest Endpoint
 * ==============================
 * POST /api/ingest
 *
 * This is the door through which real sensor data enters the system.
 * The sensor server (or middleware) calls this endpoint whenever it has a new reading.
 *
 * ── Authentication ──────────────────────────────────────────────────────────
 * Set INGEST_API_KEY in .env.local
 * Sensor server must send:  Authorization: Bearer <INGEST_API_KEY>
 *
 * ── Request body (JSON) ─────────────────────────────────────────────────────
 * Single reading:
 *   {
 *     "station_id" : "BAKO",
 *     "timestamp"  : "2025-05-06T10:00:00Z",
 *     "east_mm"    : 12.4,
 *     "north_mm"   : -3.1,
 *     "up_mm"      : 2.8,
 *     "h_vel_mmday": 1.2,     // optional
 *     "snr"        : 42,      // optional
 *     "pdop"       : 1.4,     // optional
 *     "num_sats"   : 12       // optional
 *   }
 *
 * Batch (array of readings — e.g. from a buffered upload):
 *   [ { ...reading1 }, { ...reading2 }, ... ]
 *
 * ── Response ────────────────────────────────────────────────────────────────
 *   200  { "ok": true, "accepted": 1 }
 *   400  { "ok": false, "error": "..." }
 *   401  { "ok": false, "error": "Unauthorised" }
 *
 * ── How to extend ───────────────────────────────────────────────────────────
 * NTRIP:  run a separate NTRIP client process that decodes RTCM → JSON
 *         and POSTs to this endpoint.
 * MQTT:   run a MQTT subscriber process that does the same.
 * Serial: run a serial reader process (pyserial / serialport) → POST here.
 * All roads lead to this endpoint — the dashboard doesn't care about the transport.
 */

import { NextRequest, NextResponse } from 'next/server'
import { dataStore } from '@/lib/dataStore'
import { normaliseSensorPayload, DATA_SOURCE } from '@/lib/dataAdapter'
import { STATION_IDS } from '@/lib/sensorConfig'

// ─── Auth helper ─────────────────────────────────────────────────────────────
function isAuthorised(req: NextRequest): boolean {
  const apiKey = process.env.INGEST_API_KEY
  if (!apiKey) return true  // No key configured — allow all (dev mode)

  const header = req.headers.get('authorization') ?? ''
  return header === `Bearer ${apiKey}`
}

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorised' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  // Accept single object or array
  const payloads: Record<string, unknown>[] = Array.isArray(body) ? body : [body as Record<string, unknown>]

  let accepted = 0
  const errors: string[] = []

  for (const raw of payloads) {
    const stationId = String(raw['station_id'] ?? raw['stationId'] ?? raw['id'] ?? '').toUpperCase()

    if (!stationId) {
      errors.push('Missing station_id')
      continue
    }
    if (!STATION_IDS.includes(stationId)) {
      errors.push(`Unknown station_id: ${stationId}`)
      continue
    }

    try {
      const reading = normaliseSensorPayload(stationId, raw)
      dataStore.push(reading)
      accepted++
    } catch (e) {
      errors.push(`${stationId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({
    ok      : accepted > 0,
    accepted,
    errors  : errors.length ? errors : undefined,
    source  : DATA_SOURCE,
  }, { status: accepted > 0 ? 200 : 400 })
}

// ─── GET handler — health check / store summary ───────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorised' }, { status: 401 })
  }

  return NextResponse.json({
    ok        : true,
    dataSource: DATA_SOURCE,
    stations  : dataStore.summary(),
    time      : new Date().toISOString(),
  })
}

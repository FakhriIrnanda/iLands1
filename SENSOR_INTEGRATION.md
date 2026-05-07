# iLands — Sensor Integration Guide

> **Status:** Dashboard running in **CSV / demo mode**.  
> Follow this guide when you're ready to connect real GNSS sensors.

---

## Architecture Overview

```
[GNSS Receiver]
      │  (raw signal)
      ▼
[Sensor Server / Processing Node]        ← you control this
      │  parses RTCM / RINEX / NMEA
      │  computes E, N, U displacement
      │  POST JSON every N seconds
      ▼
POST /api/ingest                          ← already built, waiting
      │
      ▼
[dataStore.ts]  ←  in-memory buffer
      │
      ▼
GET  /api/live/[STATION_ID]              ← dashboard reads this
      │
      ▼
[iLands Dashboard]
```

**You only need to implement the arrow between your sensor server and `/api/ingest`.**  
Everything downstream is already done.

---

## Step 1 — Set Environment Variables

Add to `.env.local`:

```env
# Set a secret key so only your sensor server can push data
INGEST_API_KEY=your-secret-key-here

# (Optional) If you want the adapter to PULL from your sensor server instead of being pushed:
SENSOR_API_URL=http://your-sensor-server.com
SENSOR_API_KEY=your-sensor-server-key
```

---

## Step 2 — Switch to Live Mode

In `lib/dataAdapter.ts`, change line 18:

```ts
// Before (demo mode):
export const DATA_SOURCE: 'csv' | 'live' = 'csv'

// After (live mode):
export const DATA_SOURCE: 'csv' | 'live' = 'live'
```

That's it. The dashboard will now read from the sensor data store instead of CSV.

---

## Step 3 — Push Data from Your Sensor Server

Your sensor server needs to POST to:

```
POST https://your-ilands-domain.com/api/ingest
Authorization: Bearer your-secret-key-here
Content-Type: application/json
```

### Request body (single reading):

```json
{
  "station_id" : "BAKO",
  "timestamp"  : "2025-05-06T10:00:00Z",
  "east_mm"    : 12.4,
  "north_mm"   : -3.1,
  "up_mm"      : 2.8,
  "h_vel_mmday": 1.2,
  "snr"        : 42,
  "pdop"       : 1.4,
  "num_sats"   : 12
}
```

### Request body (batch — multiple readings at once):

```json
[
  { "station_id": "BAKO", "timestamp": "...", "east_mm": 12.4, ... },
  { "station_id": "CUSV", "timestamp": "...", "east_mm": -2.1, ... }
]
```

### Response:

```json
{ "ok": true, "accepted": 1 }
```

---

## Step 4 — Map Your Sensor's Field Names

If your sensor outputs different field names, edit **`lib/dataAdapter.ts`**, function `normaliseSensorPayload()`:

```ts
// Default mapping (change these to match your sensor):
const e     = Number(raw['east_mm']    ?? raw['e']  ?? 0)
const n     = Number(raw['north_mm']   ?? raw['n']  ?? 0)
const u     = Number(raw['up_mm']      ?? raw['u']  ?? 0)
const h_vel = raw['h_vel_mmday'] != null ? Number(raw['h_vel_mmday']) : null
```

**Example:** if your sensor sends `{ "dE": 12.4, "dN": -3.1, "dU": 2.8 }`:

```ts
const e = Number(raw['dE'] ?? 0)
const n = Number(raw['dN'] ?? 0)
const u = Number(raw['dU'] ?? 0)
```

---

## Step 5 — Update Station Config

Edit `lib/sensorConfig.ts` — fill in the real hardware and connection info:

```ts
{
  id: 'BAKO',
  // ...
  hardware: {
    receiver: 'Trimble NetR9',          // ← fill this in
    antenna : 'TRM59800.00 SCIS',
    firmware: '5.45',
  },
  connection: {
    protocol    : 'http',               // 'http' | 'mqtt' | 'ntrip' | 'ftp'
    host        : '192.168.1.101',      // ← your sensor server IP
    port        : 8080,
    endpoint    : '/api/gnss/latest',
    pollInterval: 300,                  // seconds (0 = push mode)
  },
}
```

---

## Protocol-Specific Notes

### HTTP / REST (simplest)
Your sensor server exposes a JSON endpoint.  
Set `pollInterval` to how often to fetch, OR configure your server to push to `/api/ingest`.

### NTRIP (RTCM stream)
NTRIP requires a separate client process to decode the binary stream:

```
NTRIP Caster → [ntrip-client process] → POST /api/ingest
```

Recommended library: **`pygnssutils`** (Python) or **`RTKLIB`** (STRSVR → log → parser).

```python
# Example: ntrip_bridge.py (run separately, not inside Next.js)
from pygnssutils import GNSSNTRIPClient
import requests, json

def on_data(raw_rtcm):
    reading = parse_rtcm_to_json(raw_rtcm)   # your parser
    requests.post('http://localhost:3000/api/ingest',
      headers={'Authorization': 'Bearer your-key'},
      json=reading)
```

### MQTT
Run a subscriber process:

```js
// mqtt_bridge.js (run separately with: node mqtt_bridge.js)
const mqtt  = require('mqtt')
const fetch = require('node-fetch')

const client = mqtt.connect('mqtt://your-broker:1883')
client.subscribe('gnss/+/reading')

client.on('message', (topic, payload) => {
  const stationId = topic.split('/')[1]    // e.g. 'BAKO'
  const data      = JSON.parse(payload)
  fetch('http://localhost:3000/api/ingest', {
    method : 'POST',
    headers: { 'Authorization': 'Bearer your-key', 'Content-Type': 'application/json' },
    body   : JSON.stringify({ ...data, station_id: stationId }),
  })
})
```

---

## Verify It's Working

```bash
# 1. Check ingest endpoint health
curl http://localhost:3000/api/ingest \
  -H "Authorization: Bearer your-key"

# Response:
# { "ok": true, "dataSource": "live", "stations": [ ... ] }

# 2. Push a test reading manually
curl -X POST http://localhost:3000/api/ingest \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -d '{"station_id":"BAKO","timestamp":"2025-05-06T10:00:00Z","east_mm":12.4,"north_mm":-3.1,"up_mm":2.8}'

# Response:
# { "ok": true, "accepted": 1 }

# 3. Check the dashboard picked it up
curl http://localhost:3000/api/live/BAKO
# Should show your test reading under "current"
```

---

## When to Upgrade the Data Store

`dataStore.ts` is in-memory — data resets on server restart.  
Upgrade to a real database when:

| Situation | Recommended DB |
|---|---|
| Need data to survive restarts | **TimescaleDB** (Postgres + time-series extension) |
| Need fast time-range queries | **InfluxDB** |
| Simple, no infra | **SQLite** with `better-sqlite3` |
| Cloud-hosted | **Supabase** (Postgres) |

The adapter pattern means you only change `dataStore.ts` — nothing else.

---

## Summary — Files to Touch When Going Live

| File | What to change |
|---|---|
| `.env.local` | Add `INGEST_API_KEY` |
| `lib/dataAdapter.ts` | Line 18: `'csv'` → `'live'`. Map field names in `normaliseSensorPayload()` |
| `lib/sensorConfig.ts` | Fill in `hardware` and `connection` for each station |
| `lib/dataStore.ts` | Only if upgrading to a real database |
| Everything else | **No changes needed** |

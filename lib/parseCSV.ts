import fs from 'fs'
import path from 'path'

export interface GNSSRow {
  station: string
  date: string
  decimal_year: number
  mjd: number
  e_mm: number
  n_mm: number
  u_mm: number
  sig_e: number
  sig_n: number
  sig_u: number
  e_vel_mmday: number | null
  n_vel_mmday: number | null
  u_vel_mmday: number | null
  h_vel_mmday: number | null
  zscore_e: number
  zscore_n: number
  zscore_u: number
  anomaly_e: string
  anomaly_n: string
  anomaly_u: string
  anomaly_any: string
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH'
  risk_score: number
  lat: number
  lon: number
}

export interface StationMeta {
  id: string
  name: string
  location: string
  lat: number
  lon: number
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  riskScore: number
  latestDate: string
  totalRecords: number
  latestE: number
  latestN: number
  latestU: number
  latestHVel: number | null
  anomalyToday: boolean
}

// Cameron Highlands GNSS monitoring sites — real coordinates, active landslide zone
export const STATION_COORDS: Record<string, { lat: number; lon: number; name: string; location: string }> = {
  BAKO: { lat: 4.4109,  lon: 101.3855, name: 'GNSS Site 1', location: 'Lavender Park, Cameron Highlands' },
  CUSV: { lat: 4.4447,  lon: 101.3826, name: 'GNSS Site 2', location: 'Ringlet, Cameron Highlands' },
  MYVA: { lat: 4.4180,  lon: 101.3868, name: 'GNSS Site 3', location: 'Ringlet, Cameron Highlands' },
  NTUS: { lat: 4.4663,  lon: 101.3860, name: 'GNSS Site 4', location: 'Tanah Rata, Cameron Highlands' },
  SAMP: { lat: 4.5989,  lon: 101.3466, name: 'GNSS Site 5', location: 'RockShed, Cameron Highlands' },
}

function parseNum(v: string): number | null {
  if (!v || v === '') return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

export function parseStationCSV(stationId: string): GNSSRow[] {
  const filePath = path.join(process.cwd(), 'public', 'data', `${stationId}_processed.csv`)
  if (!fs.existsSync(filePath)) return []

  const text = fs.readFileSync(filePath, 'utf-8')
  const lines = text.trim().split('\n')
  const rows: GNSSRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',')
    if (p.length < 24) continue
    rows.push({
      station: p[0],
      date: p[1],
      decimal_year: parseFloat(p[2]),
      mjd: parseInt(p[3]),
      e_mm: parseFloat(p[4]),
      n_mm: parseFloat(p[5]),
      u_mm: parseFloat(p[6]),
      sig_e: parseFloat(p[7]),
      sig_n: parseFloat(p[8]),
      sig_u: parseFloat(p[9]),
      e_vel_mmday: parseNum(p[10]),
      n_vel_mmday: parseNum(p[11]),
      u_vel_mmday: parseNum(p[12]),
      h_vel_mmday: parseNum(p[13]),
      zscore_e: parseFloat(p[14]) || 0,
      zscore_n: parseFloat(p[15]) || 0,
      zscore_u: parseFloat(p[16]) || 0,
      anomaly_e: p[17],
      anomaly_n: p[18],
      anomaly_u: p[19],
      anomaly_any: p[20],
      risk_level: p[21] as 'LOW' | 'MEDIUM' | 'HIGH',
      risk_score: parseFloat(p[22]) || 0,
      lat: parseFloat(p[23]),
      lon: parseFloat(p[24]),
    })
  }
  return rows
}

export function getStationMeta(stationId: string): StationMeta | null {
  const rows = parseStationCSV(stationId)
  if (!rows.length) return null

  const latest = rows[rows.length - 1]
  const coords = STATION_COORDS[stationId]

  return {
    id: stationId,
    name: coords?.name ?? stationId,
    location: coords?.location ?? 'Cameron Highlands',
    lat: coords?.lat ?? latest.lat,
    lon: coords?.lon ?? latest.lon,
    riskLevel: latest.risk_level,
    riskScore: latest.risk_score,
    latestDate: latest.date,
    totalRecords: rows.length,
    latestE: latest.e_mm,
    latestN: latest.n_mm,
    latestU: latest.u_mm,
    latestHVel: latest.h_vel_mmday,
    anomalyToday: latest.anomaly_any === 'YES',
  }
}

export const STATION_IDS = ['BAKO', 'CUSV', 'MYVA', 'NTUS', 'SAMP']

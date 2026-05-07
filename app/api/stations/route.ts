import { NextResponse } from 'next/server'
import { STATION_IDS, getStationMeta } from '@/lib/parseCSV'

export async function GET() {
  const stations = STATION_IDS.map((id) => getStationMeta(id)).filter(Boolean)
  return NextResponse.json({ stations, updatedAt: new Date().toISOString() })
}

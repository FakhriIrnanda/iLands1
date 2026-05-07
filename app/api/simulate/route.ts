import { NextResponse } from 'next/server'
import { getSimState, setSimEvent, clearSimEvent, SCENARIO_PARAMS } from '@/lib/simState'
import { STATION_IDS } from '@/lib/parseCSV'

export async function POST(req: Request) {
  const body = await req.json()
  const { stationId, action, scenario = 'normal' } = body

  if (action === 'set' && STATION_IDS.includes(stationId)) {
    const params = SCENARIO_PARAMS[scenario as keyof typeof SCENARIO_PARAMS]
    if (!params) return NextResponse.json({ error: 'Unknown scenario' }, { status: 400 })

    setSimEvent(stationId, {
      active: true,
      type: scenario,
      stationId,
      startedAt: Date.now(),
      durationMs: 999 * 60 * 60 * 1000, // persistent until reset
      params: {
        hVel:         params.hVel,
        uVel:         params.uVel,
        zscore:       params.zscore,
        rainfall:     params.rainfall,
        soilMoisture: params.soilMoisture,
        piezometer:   params.piezometer,
        tilt:         params.tilt,
      }
    })
    return NextResponse.json({ ok: true, scenario, stationId })
  }

  if (action === 'reset') {
    clearSimEvent(stationId)
    return NextResponse.json({ ok: true })
  }

  if (action === 'reset_all') {
    STATION_IDS.forEach(id => clearSimEvent(id))
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function GET() {
  return NextResponse.json(getSimState())
}
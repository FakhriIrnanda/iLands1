import { NextResponse } from 'next/server'
import { parseStationCSV, getStationMeta } from '@/lib/parseCSV'
import { getActiveEvent } from '@/lib/simState'

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const id   = params.id.toUpperCase()
  const meta = getStationMeta(id)
  if (!meta) return NextResponse.json({ error: 'Station not found' }, { status: 404 })

  // Check if simulation is active
  const simEvent = getActiveEvent(id)
  const isSimulating = !!simEvent

  if (isSimulating && simEvent) {
    const scen = simEvent.type
    const p    = simEvent.params
    const loc  = meta.location.split(',')[0]

    const configs = {
      normal: {
        riskLevel: 'Low', movementTrend: 'Stable', rainfallInfluence: 'Not Detected',
        simpleStatement: `The landslide risk at ${loc} is currently low and stable.`,
        recommendation: 'Continue standard monitoring. No immediate action required.',
        insight: `${meta.name} shows stable conditions with horizontal velocity of ${p.hVel.toFixed(2)} mm/day and Z-score of ${p.zscore.toFixed(2)}σ — well within normal parameters.`
      },
      medium: {
        riskLevel: 'Medium', movementTrend: 'Increasing', rainfallInfluence: 'Detected',
        simpleStatement: `⚠ Elevated movement detected at ${loc} — increased monitoring required`,
        recommendation: 'Field team should inspect the site within 24 hours. Increase monitoring frequency.',
        insight: `${meta.name} shows elevated displacement of ${p.hVel.toFixed(2)} mm/day with Z-score ${p.zscore.toFixed(2)}σ. Rainfall of ${p.rainfall} mm/24h has likely increased pore water pressure. Continued monitoring is strongly recommended.`
      },
      landslide: {
        riskLevel: 'High', movementTrend: 'Increasing', rainfallInfluence: 'Detected',
        simpleStatement: `🔴 CRITICAL: Active landslide detected at ${loc} — immediate action required`,
        recommendation: 'IMMEDIATE EVACUATION. Activate emergency protocols. Contact NADMA and local authorities.',
        insight: `${meta.name} is experiencing active slope failure with horizontal velocity of ${p.hVel.toFixed(2)} mm/day — exceeding the 5 mm/day danger threshold. Z-score of ${p.zscore.toFixed(2)}σ confirms statistical anomaly. Heavy rainfall of ${p.rainfall} mm/24h has fully saturated the slope.`
      }
    }

    const cfg = configs[scen as keyof typeof configs] ?? configs.normal

    return NextResponse.json({
      ...cfg, simulationActive: true,
      generatedAt: new Date().toISOString(), mock: false,
    })
  }

  // Normal (non-simulation) insight
  const rows   = parseStationCSV(id)
  const last7  = rows.slice(-7)
  const latest = rows[rows.length - 1]

  const highDays   = last7.filter(r => r.risk_level === 'HIGH').length
  const anomDays   = last7.filter(r => r.anomaly_any === 'YES').length
  const avgVel7    = last7.reduce((s,r) => s + (r.h_vel_mmday ?? 0), 0) / 7
  const prev7      = rows.slice(-14, -7)
  const avgVelPrev = prev7.reduce((s,r) => s + (r.h_vel_mmday ?? 0), 0) / 7
  const trend      = avgVel7 > avgVelPrev*1.2 ? 'Increasing' : avgVel7 < avgVelPrev*0.8 ? 'Decreasing' : 'Stable'
  const overallStatus = latest.risk_score > 70 ? 'CRITICAL' : latest.risk_score > 35 ? 'WARNING' : 'STABLE'

  const prompt = `You are a geodetic hazard monitoring AI for Cameron Highlands landslide early warning system.

Site: ${meta.name} — ${meta.location}
Date: ${latest.date}
Risk score: ${latest.risk_score}/100
Overall status: ${overallStatus}
Movement trend (7-day): ${trend}
Anomaly days (last 7): ${anomDays}
Avg H-velocity (last 7 days): ${avgVel7.toFixed(3)} mm/day
Vertical velocity: ${latest.u_vel_mmday?.toFixed(3) ?? 'N/A'} mm/day
Z-score (vertical): ${latest.zscore_u}

Return ONLY a JSON object, no markdown, no extra text:
{
  "movementTrend": "Increasing"|"Stable"|"Decreasing",
  "rainfallInfluence": "Detected"|"Not Detected",
  "riskLevel": "Low"|"Medium"|"High",
  "recommendation": "one sentence action for field team",
  "simpleStatement": "one plain-english sentence about current condition",
  "insight": "2-3 sentence professional analysis with specific numbers, location name only"
}`

  const mockResponse = {
    movementTrend: trend,
    rainfallInfluence: anomDays > 1 ? 'Detected' : 'Not Detected',
    riskLevel: latest.risk_score > 70 ? 'High' : latest.risk_score > 35 ? 'Medium' : 'Low',
    recommendation: anomDays > 0
      ? 'Schedule field inspection and verify sensor readings within 24 hours.'
      : 'Continue standard monitoring protocols and cross-reference with rainfall data.',
    simpleStatement: trend === 'Increasing'
      ? `Movement increasing over last 24 hours at ${meta.location.split(',')[0]}`
      : anomDays > 0
      ? `Movement correlated with rainfall event at ${meta.location.split(',')[0]}`
      : `Stable condition — no significant displacement at ${meta.location.split(',')[0]}`,
    insight: `The ${meta.name} monitoring site is showing ${latest.risk_level} risk with a score of ${latest.risk_score}/100. Horizontal velocity averaged ${avgVel7.toFixed(2)} mm/day over 7 days with ${anomDays} anomalous reading(s). ${anomDays > 0 ? 'Heightened monitoring is recommended.' : 'Conditions remain within normal parameters.'}`,
    simulationActive: false,
  }

  try {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ ...mockResponse, generatedAt: new Date().toISOString(), mock: true })

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', max_tokens: 400, temperature: 0.3,
        messages: [
          { role: 'system', content: 'You are a geohazard analyst. Always respond with valid JSON only.' },
          { role: 'user', content: prompt }
        ],
      }),
    })
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content ?? ''
    try {
      const parsed = JSON.parse(text.replace(/```json|```/g,'').trim())
      return NextResponse.json({ ...parsed, simulationActive: false, generatedAt: new Date().toISOString(), mock: false })
    } catch {
      return NextResponse.json({ ...mockResponse, generatedAt: new Date().toISOString(), mock: true })
    }
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
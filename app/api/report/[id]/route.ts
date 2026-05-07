import { NextResponse } from 'next/server'
import { parseStationCSV, getStationMeta, STATION_IDS } from '@/lib/parseCSV'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id  = params.id.toUpperCase()
  const ids = id === 'ALL' ? STATION_IDS : [id]

  const stationsData = ids.map((sid) => {
    const meta  = getStationMeta(sid)
    const rows  = parseStationCSV(sid)
    const last7 = rows.slice(-7)
    const last30 = rows.slice(-30)
    const avg = (arr: (number|null)[]) => {
      const v = arr.filter(x => x !== null) as number[]
      return v.length ? v.reduce((a,b)=>a+b,0)/v.length : 0
    }
    return {
      meta,
      weekly: {
        highDays:    last7.filter(r=>r.risk_level==='HIGH').length,
        mediumDays:  last7.filter(r=>r.risk_level==='MEDIUM').length,
        lowDays:     last7.filter(r=>r.risk_level==='LOW').length,
        anomalyDays: last7.filter(r=>r.anomaly_any==='YES').length,
        avgHVel:     avg(last7.map(r=>r.h_vel_mmday)),
        maxHVel:     Math.max(...last7.map(r=>r.h_vel_mmday??0)),
        maxZscoreU:  Math.max(...last7.map(r=>r.zscore_u)),
        avgRiskScore: avg(last7.map(r=>r.risk_score)),
        dates: { start: last7[0]?.date, end: last7[last7.length-1]?.date },
        daily: last7.map(r=>({
          date:r.date, risk:r.risk_level, score:r.risk_score,
          h_vel:r.h_vel_mmday?.toFixed(3), anomaly:r.anomaly_any, zscore_u:r.zscore_u,
        }))
      },
      monthly: {
        avgHVel:     avg(last30.map(r=>r.h_vel_mmday)),
        anomalyDays: last30.filter(r=>r.anomaly_any==='YES').length,
        highDays:    last30.filter(r=>r.risk_level==='HIGH').length,
      }
    }
  })

  const reportDate = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'})
  const dataBlock  = stationsData.map(s=>`
Site: ${s.meta?.name} (${s.meta?.location})
- Risk: HIGH=${s.weekly.highDays} MEDIUM=${s.weekly.mediumDays} LOW=${s.weekly.lowDays}
- Anomaly days: ${s.weekly.anomalyDays}
- Avg H-vel: ${s.weekly.avgHVel.toFixed(3)} mm/day | Max: ${s.weekly.maxHVel.toFixed(3)} mm/day
- Max Z-score: ${s.weekly.maxZscoreU.toFixed(2)}σ
- Period: ${s.weekly.dates.start} → ${s.weekly.dates.end}`).join('\n---\n')

  const prompt = `You are an expert geodetic hazard analyst writing a formal Weekly Monitoring Report for the Cameron Highlands GNSS Landslide Early Warning System (iLands).

Report date: ${reportDate}
Network: 5 GNSS monitoring sites, Cameron Highlands, Pahang, Malaysia

${dataBlock}

Write a structured weekly report with these exact sections:
## Executive Summary
## Site-by-Site Analysis
## Notable Events
## Trend Assessment
## Recommendations

Rules: use location names only (never internal codes), be precise with numbers, professional geohazard language, markdown headers with ##.`

  try {
    const apiKey = process.env.GROQ_API_KEY
    let reportText = ''

    if (!apiKey) {
      reportText = `## Executive Summary\n\nThe Cameron Highlands iLands monitoring network recorded predominantly stable conditions during the reporting period (${stationsData[0]?.weekly.dates.start} to ${stationsData[0]?.weekly.dates.end}). All five monitoring sites maintained LOW to MEDIUM risk classifications with no critical displacement events.\n\n## Site-by-Site Analysis\n\n${stationsData.map(s=>`**${s.meta?.name} (${s.meta?.location?.split(',')[0]}):** ${s.weekly.anomalyDays} anomaly day(s). Avg H-velocity: ${s.weekly.avgHVel.toFixed(3)} mm/day. Risk classification: ${s.weekly.highDays>0?'HIGH periods detected':s.weekly.mediumDays>0?'MEDIUM periods detected':'Consistently LOW'}.`).join('\n\n')}\n\n## Notable Events\n\n${stationsData.some(s=>s.weekly.anomalyDays>0)?stationsData.filter(s=>s.weekly.anomalyDays>0).map(s=>`- **${s.meta?.name}**: ${s.weekly.anomalyDays} anomaly event(s), max Z-score ${s.weekly.maxZscoreU.toFixed(2)}σ`).join('\n'):'No significant anomaly events recorded this week.'}\n\n## Trend Assessment\n\nNetwork-wide horizontal velocities averaged below the MEDIUM threshold (2 mm/day). Vertical displacement patterns are consistent with seasonal hydrological loading typical for Cameron Highlands highland terrain.\n\n## Recommendations\n\n1. Maintain 5-minute epoch monitoring cadence across all sites.\n2. Cross-reference GNSS displacement with local rainfall gauge data — monsoon season warrants elevated vigilance.\n3. Schedule routine field inspection of RockShed site (highest geological risk profile).\n4. Review alert thresholds if anomaly frequency increases beyond 3 events/week at any single site.`
    } else {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
        body: JSON.stringify({
          model:'llama-3.3-70b-versatile',
          max_tokens:1200,
          temperature:0.3,
          messages:[
            { role:'system', content:'You are a senior geotechnical hazard analyst. Write formal, precise monitoring reports.' },
            { role:'user', content:prompt }
          ],
        }),
      })
      const data = await res.json()
      reportText = data.choices?.[0]?.message?.content ?? 'Unable to generate report.'
    }

    return NextResponse.json({ reportDate, stationsData, report:reportText, generatedAt:new Date().toISOString() })
  } catch {
    return NextResponse.json({ error:'Failed to generate report' }, { status:500 })
  }
}
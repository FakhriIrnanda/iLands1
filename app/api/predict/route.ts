import { NextResponse } from 'next/server'
import { parseStationCSV, getStationMeta } from '@/lib/parseCSV'
import { getActiveEvent, SCENARIO_PARAMS } from '@/lib/simState'

function linearRegression(y: number[]) {
  const n = y.length
  const x = Array.from({ length: n }, (_, i) => i)
  const sumX  = x.reduce((a,b) => a+b, 0)
  const sumY  = y.reduce((a,b) => a+b, 0)
  const sumXY = x.reduce((a,xi,i) => a+xi*y[i], 0)
  const sumX2 = x.reduce((a,xi) => a+xi*xi, 0)
  const slope     = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX)
  const intercept = (sumY - slope*sumX) / n
  const yMean = sumY/n
  const ssTot = y.reduce((a,yi) => a+(yi-yMean)**2, 0)
  const ssRes = y.reduce((a,yi,i) => a+(yi-(slope*i+intercept))**2, 0)
  const r2 = ssTot > 0 ? 1 - ssRes/ssTot : 0
  return { slope: parseFloat(slope.toFixed(5)), intercept: parseFloat(intercept.toFixed(4)), r2: parseFloat(r2.toFixed(3)) }
}

function stdResidual(y: number[], slope: number, intercept: number) {
  const res = y.map((yi,i) => yi - (slope*i+intercept))
  return Math.sqrt(res.reduce((a,r) => a+r*r, 0) / res.length)
}

function toRiskScore(vel: number, rain: number) {
  const v = vel > 5 ? 60+Math.min((vel-5)*4,40) : vel > 2 ? 25+(vel-2)*11.7 : vel*12.5
  return Math.min(Math.round(v + (rain>25?15:rain>12?8:0)), 100)
}

export async function GET(req: Request) {
  const url  = new URL(req.url)
  const id   = (url.searchParams.get('id') ?? 'BAKO').toUpperCase()
  const days = parseInt(url.searchParams.get('days') ?? '30')

  const rows = parseStationCSV(id)
  const meta = getStationMeta(id)
  if (!rows.length) return NextResponse.json({ error:'Station not found' }, { status:404 })

  const simEvent = getActiveEvent(id)
  const scen     = simEvent ? SCENARIO_PARAMS[simEvent.type as keyof typeof SCENARIO_PARAMS] : null

  // Use last 60 days for regression
  const hist60   = rows.slice(-60)
  const hvelHist = hist60.map(r => r.h_vel_mmday ?? 0)
  const rainHist = hist60.map((r, i) => {
    const base = 5 + Math.abs(r.u_vel_mmday ?? 0) * 8
    return Math.max(0, base + Math.sin(i/5)*4 + (Math.random()-0.5)*3)
  })

  // Inject sim values at latest point
  if (scen && simEvent) {
    hvelHist[hvelHist.length-1] = simEvent.params.hVel
    rainHist[rainHist.length-1] = simEvent.params.rainfall
  }

  const velReg  = linearRegression(hvelHist)
  const rainReg = linearRegression(rainHist)
  const velStd  = stdResidual(hvelHist, velReg.slope, velReg.intercept)

  // Historical last 30 days
  const last30 = rows.slice(-30)
  const historical = last30.map((r, i) => {
    const hvel = (scen && i===last30.length-1) ? simEvent!.params.hVel : (r.h_vel_mmday ?? 0)
    const rain = rainHist[rainHist.length-30+i] ?? 0
    return { date: r.date, label: r.date.slice(5), hvel: parseFloat(hvel.toFixed(3)), rain: parseFloat(rain.toFixed(1)), score: toRiskScore(hvel, rain), type:'historical' }
  })

  // Forecast next N days
  const n = hvelHist.length
  const today = new Date()
  const forecast = Array.from({ length: days }, (_, d) => {
    const date = new Date(today); date.setDate(today.getDate()+d+1)
    const projVel  = Math.max(0, velReg.slope*(n+d+1) + velReg.intercept)
    const projRain = Math.max(0, rainReg.slope*(n+d+1) + rainReg.intercept)
    const velLow   = Math.max(0, projVel - 1.28*velStd)
    const velHigh  = projVel + 1.28*velStd
    return {
      date: date.toISOString().slice(0,10),
      label: `+${d+1}d`,
      hvel: parseFloat(projVel.toFixed(3)),
      hvelLow:  parseFloat(velLow.toFixed(3)),
      hvelHigh: parseFloat(velHigh.toFixed(3)),
      rain: parseFloat(projRain.toFixed(1)),
      score:      toRiskScore(projVel,  projRain),
      scoreLow:   toRiskScore(velLow,   projRain),
      scoreHigh:  Math.min(100, toRiskScore(velHigh, projRain)),
      type: 'forecast'
    }
  })

  const cautionDay = forecast.findIndex(p => p.hvel >= 2)
  const dangerDay  = forecast.findIndex(p => p.hvel >= 5)
  const peakScore  = Math.max(...forecast.map(p => p.score))
  const peakDay    = forecast.findIndex(p => p.score === peakScore) + 1
  const day30Score = forecast[forecast.length-1]?.score ?? 0
  const currentVel = hvelHist[hvelHist.length-1]
  const trendLabel = velReg.slope > 0.005 ? 'Accelerating' : velReg.slope < -0.005 ? 'Decelerating' : 'Stable'

  // Groq AI narrative
  let aiVerdict = peakScore >= 70 ? 'DANGER' : peakScore >= 35 ? 'CAUTION' : 'STABLE'
  let aiNarrative = `${meta?.name} shows ${trendLabel.toLowerCase()} velocity of ${currentVel.toFixed(2)} mm with regression slope ${velReg.slope > 0?'+':''}${velReg.slope.toFixed(4)} mm/day. ${dangerDay >= 0 ? `Danger threshold projected at day ${dangerDay+1}.` : peakScore >= 35 ? 'Caution levels projected within 30 days.' : 'No threshold crossings projected in 30 days.'}`
  let aiActions = peakScore >= 70
    ? ['Prepare evacuation plan for at-risk zones', 'Increase monitoring to hourly intervals', 'Alert emergency response team']
    : peakScore >= 35
    ? ['Increase monitoring frequency to twice daily', 'Inspect slope drainage systems', 'Review slope stability reports']
    : ['Continue standard monitoring schedule', 'Review data at next weekly report', 'No immediate action required']

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', temperature: 0.3, max_tokens: 350,
        messages: [
          { role:'system', content:'You are a geotechnical engineer. Respond with JSON only, no markdown.' },
          { role:'user', content:`Analyze 30-day GNSS slope forecast for ${meta?.name} (${meta?.location}):
Current velocity: ${currentVel.toFixed(3)} mm
Trend: ${trendLabel} (slope: ${velReg.slope > 0?'+':''}${velReg.slope.toFixed(4)} mm/day, R²: ${velReg.r2})
Days to caution (2mm): ${cautionDay >= 0 ? cautionDay+1 : 'Not reached'}
Days to danger (5mm): ${dangerDay >= 0 ? dangerDay+1 : 'Not reached'}
Peak risk score: ${peakScore}/100 at day ${peakDay}
Day-30 score: ${day30Score}/100
${simEvent ? `Simulation: ${simEvent.type} scenario active` : ''}
Return: {"verdict":"STABLE|CAUTION|DANGER","narrative":"2 sentences professional assessment with numbers","actions":["action1","action2","action3"]}` }
        ]
      })
    })
    if (groqRes.ok) {
      const d = await groqRes.json()
      const parsed = JSON.parse(d.choices?.[0]?.message?.content?.replace(/```json|```/g,'').trim() ?? '{}')
      if (parsed.verdict)   aiVerdict   = parsed.verdict
      if (parsed.narrative) aiNarrative = parsed.narrative
      if (parsed.actions)   aiActions   = parsed.actions
    }
  } catch (_) {}

  return NextResponse.json({
    id, meta,
    regression: { slope: velReg.slope, intercept: velReg.intercept, r2: velReg.r2, std: parseFloat(velStd.toFixed(4)), trend: trendLabel },
    historical, forecast,
    summary: { currentVelocity: parseFloat(currentVel.toFixed(3)), cautionDay: cautionDay>=0?cautionDay+1:null, dangerDay: dangerDay>=0?dangerDay+1:null, peakScore, peakDay, day30Score, simulationActive: !!simEvent },
    ai: { verdict: aiVerdict, narrative: aiNarrative, actions: aiActions },
    generatedAt: new Date().toISOString(),
  })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { prompt, stationId } = body

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json({ text: '' }, { status: 200 })
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 400,
        temperature: 0.3,
        messages: [
          { role: 'system', content: 'You are the AI engine of iLands landslide monitoring system. Follow instructions exactly.' },
          { role: 'user', content: prompt }
        ],
      }),
    })

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content ?? ''
    return NextResponse.json({ text })
  } catch(e) {
    return NextResponse.json({ text: '' }, { status: 500 })
  }
}
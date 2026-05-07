import { NextResponse } from 'next/server'
import { parseStationCSV, getStationMeta, STATION_IDS } from '@/lib/parseCSV'
import { getActiveEvent, SCENARIO_PARAMS } from '@/lib/simState'

// ─────────────────────────────────────────────
// JKR MALAYSIA WARNING LEVEL THRESHOLDS
// Based on JKR slope monitoring guidelines
// ─────────────────────────────────────────────
const JKR_VELOCITY_THRESHOLDS = {
  LOW:    2.0,   // < 2.0 mm/day → Level 1 NORMAL
  MEDIUM: 5.0,   // 2.0–5.0 mm/day → Level 2 ALERT
  HIGH:   10.0,  // 5.0–10.0 mm/day → Level 3 WARNING
  // > 10.0 mm/day → Level 4 DANGER (mapped to HIGH in UI)
}

// Z-score threshold for anomaly detection
const ZSCORE_THRESHOLD = 2.5

// ─────────────────────────────────────────────
// CLASSIFY RISK based on JKR velocity thresholds
// Returns: { riskLevel, jkrLevel, score }
// score = 0–100 derived from velocity for gauge display
// ─────────────────────────────────────────────
function classifyByVelocity(hVel: number): {
  riskLevel: 'Low' | 'Medium' | 'High'
  jkrLevel: 1 | 2 | 3 | 4
  score: number
} {
  const absVel = Math.abs(hVel)

  if (absVel < JKR_VELOCITY_THRESHOLDS.LOW) {
    // 0–2 mm/day → score 0–30
    const score = Math.round((absVel / JKR_VELOCITY_THRESHOLDS.LOW) * 30)
    return { riskLevel: 'Low', jkrLevel: 1, score: Math.min(score, 29) }
  }

  if (absVel < JKR_VELOCITY_THRESHOLDS.MEDIUM) {
    // 2–5 mm/day → score 30–65
    const ratio = (absVel - JKR_VELOCITY_THRESHOLDS.LOW) / (JKR_VELOCITY_THRESHOLDS.MEDIUM - JKR_VELOCITY_THRESHOLDS.LOW)
    const score = Math.round(30 + ratio * 35)
    return { riskLevel: 'Medium', jkrLevel: 2, score: Math.min(score, 64) }
  }

  if (absVel < JKR_VELOCITY_THRESHOLDS.HIGH) {
    // 5–10 mm/day → score 65–85
    const ratio = (absVel - JKR_VELOCITY_THRESHOLDS.MEDIUM) / (JKR_VELOCITY_THRESHOLDS.HIGH - JKR_VELOCITY_THRESHOLDS.MEDIUM)
    const score = Math.round(65 + ratio * 20)
    return { riskLevel: 'High', jkrLevel: 3, score: Math.min(score, 84) }
  }

  // > 10 mm/day → score 85–100, Level 4 DANGER
  const score = Math.min(Math.round(85 + (absVel - JKR_VELOCITY_THRESHOLDS.HIGH) * 1.5), 100)
  return { riskLevel: 'High', jkrLevel: 4, score }
}

// ─────────────────────────────────────────────
// RAINFALL IMPACT CLASSIFICATION
// Based on JKR antecedent rainfall thresholds
// ─────────────────────────────────────────────
function classifyRainfall(rain24: number, rainCumulative7d: number): {
  impact: 'Low' | 'Moderate' | 'High' | 'Extreme'
  levelBoost: number  // adds to risk scoring
} {
  // JKR trigger: 24h > 100mm OR 7-day cumulative > 250mm
  if (rain24 > 100 || rainCumulative7d > 250) {
    return { impact: 'Extreme', levelBoost: 2 }
  }
  if (rain24 > 50 || rainCumulative7d > 150) {
    return { impact: 'High', levelBoost: 1 }
  }
  if (rain24 > 20 || rainCumulative7d > 70) {
    return { impact: 'Moderate', levelBoost: 0 }
  }
  return { impact: 'Low', levelBoost: -1 }
}

// ─────────────────────────────────────────────
// ANOMALY DETECTION using Z-score from CSV
// ─────────────────────────────────────────────
function detectAnomalies(last7Rows: any[]): {
  anomalyDetected: boolean
  anomalyDays: number
  maxZscore: number
} {
  const anomalyDays = last7Rows.filter(r => r.anomaly_any === 'YES').length
  const zscores = last7Rows
    .map(r => Math.max(
      Math.abs(r.zscore_e ?? 0),
      Math.abs(r.zscore_n ?? 0),
      Math.abs(r.zscore_u ?? 0)
    ))
  const maxZscore = Math.max(...zscores, 0)
  return {
    anomalyDetected: anomalyDays > 0 || maxZscore > ZSCORE_THRESHOLD,
    anomalyDays,
    maxZscore: parseFloat(maxZscore.toFixed(2)),
  }
}

// ─────────────────────────────────────────────
// MOVEMENT TREND — compare last 7 vs prev 7 days
// ─────────────────────────────────────────────
function classifyTrend(current7Avg: number, prev7Avg: number): 'Increasing' | 'Stable' | 'Decreasing' {
  if (prev7Avg === 0) return 'Stable'
  const ratio = current7Avg / prev7Avg
  if (ratio > 1.25) return 'Increasing'
  if (ratio < 0.75) return 'Decreasing'
  return 'Stable'
}

// ─────────────────────────────────────────────
// GROUND CONDITION based on tilt + piezometer
// ─────────────────────────────────────────────
function classifyGroundCondition(tilt: number, piezometer: number): 'Stable' | 'Moderate' | 'Weak' {
  if (tilt > 3.0 || piezometer > 90) return 'Weak'
  if (tilt > 1.5 || piezometer > 65) return 'Moderate'
  return 'Stable'
}

// ─────────────────────────────────────────────
// CONFIDENCE SCORE — how reliable is the classification
// Higher = more data points agree
// ─────────────────────────────────────────────
function computeConfidence(
  dataQuality: number,       // % of last 7 days with valid h_vel
  trendConsistency: boolean, // velocity trend matches anomaly direction
  anomalyDays: number,
  rainfallLevelBoost: number,
): number {
  let confidence = 70  // base

  // Data quality
  confidence += Math.round(dataQuality * 15)

  // Consistent signals boost confidence
  if (trendConsistency) confidence += 8

  // Multiple anomaly days = clearer signal
  if (anomalyDays >= 3) confidence += 7
  else if (anomalyDays >= 1) confidence += 3

  // Rainfall-movement correlation
  if (rainfallLevelBoost > 0) confidence += 5

  return Math.min(confidence, 98)
}

// ─────────────────────────────────────────────
// FAILURE PROBABILITY — physics-based calculation
// NOT random — derived from velocity + rainfall + anomaly trend
// ─────────────────────────────────────────────
function computeFailureProbability(
  hVel: number,
  rain24: number,
  anomalyDays: number,
  trend: 'Increasing' | 'Stable' | 'Decreasing',
  slopeAngle: number,
): { h24: number; h48: number; h72: number } {
  // Base probability from velocity (Fukuzono 1985 inspired)
  // Normalize velocity: 0 mm/day = 0%, 10 mm/day = 60%
  const velFactor = Math.min(Math.abs(hVel) / 10, 1) * 0.60

  // Rainfall factor: 0 mm = 0%, 100mm = 20%
  const rainFactor = Math.min(rain24 / 100, 1) * 0.20

  // Anomaly factor: 0 days = 0%, 7 days = 15%
  const anomFactor = Math.min(anomalyDays / 7, 1) * 0.15

  // Trend multiplier
  const trendMult = trend === 'Increasing' ? 1.3 : trend === 'Decreasing' ? 0.7 : 1.0

  // Slope factor (steeper = higher base risk)
  const slopeFactor = 1 + Math.max(0, (slopeAngle - 20) / 50)  // 1.0–1.6x

  const base = (velFactor + rainFactor + anomFactor) * trendMult * slopeFactor

  // Time projection: risk increases as conditions persist
  const p24 = Math.min(Math.max(base, 0.02), 0.95)
  const p48 = Math.min(Math.max(base * 1.12, 0.02), 0.95)
  const p72 = Math.min(Math.max(base * 1.22, 0.02), 0.95)

  return {
    h24: parseFloat((p24 * 100).toFixed(1)),
    h48: parseFloat((p48 * 100).toFixed(1)),
    h72: parseFloat((p72 * 100).toFixed(1)),
  }
}

// ─────────────────────────────────────────────
// SIMULATED GEOTECHNICAL SENSORS
// (deterministic based on risk level, not random)
// ─────────────────────────────────────────────
function simulateSensors(score: number, slopeAngle: number) {
  // Base values scale with risk score deterministically
  const factor = score / 100
  return {
    // Tilt: 0.2° (low) to 4.5° (high)
    tilt: parseFloat((0.2 + factor * 4.3).toFixed(2)),
    // Piezometer: 30kPa (low) to 110kPa (high)
    piezometer: parseFloat((30 + factor * 80).toFixed(1)),
    // Soil moisture: 30% (low) to 85% (high)
    soilMoisture: parseFloat((30 + factor * 55).toFixed(1)),
    // Crack width: 0.05mm (low) to 5mm (high)
    crackMeter: parseFloat((0.05 + factor * 4.95).toFixed(2)),
  }
}

// ─────────────────────────────────────────────
// SLOPE HAZARD TABLE
// ─────────────────────────────────────────────
const SLOPE_HAZARD: Record<string, { slope: number; ndvi: number; geology: string; road: string; river: string }> = {
  BAKO: { slope: 28, ndvi: 0.62, geology: 'Granite',      road: 'Present', river: 'Nearby 200m' },
  CUSV: { slope: 22, ndvi: 0.71, geology: 'Sedimentary',  road: 'Present', river: 'None' },
  MYVA: { slope: 35, ndvi: 0.58, geology: 'Granite',      road: 'Present', river: 'Nearby 350m' },
  NTUS: { slope: 18, ndvi: 0.74, geology: 'Alluvium',     road: 'Present', river: 'Nearby 100m' },
  SAMP: { slope: 42, ndvi: 0.49, geology: 'Ultramafic',   road: 'None',    river: 'Nearby 500m' },
}

// ─────────────────────────────────────────────
// HELPER: safe numeric average
// ─────────────────────────────────────────────
function avg(arr: (number | null | undefined)[]): number {
  const valid = arr.filter(x => x != null && !isNaN(x as number)) as number[]
  if (!valid.length) return 0
  return parseFloat((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(4))
}

// ─────────────────────────────────────────────
// MAIN API HANDLER
// ─────────────────────────────────────────────
export async function GET() {
  const allData = STATION_IDS.map(sid => {
    const meta   = getStationMeta(sid)
    const rows   = parseStationCSV(sid)

    if (!rows.length) {
      return { id: sid, meta, error: 'No data', latest: { risk: 'Low', score: 0 } }
    }

    const last7   = rows.slice(-7)
    const prev7   = rows.slice(-14, -7)
    const last30  = rows.slice(-30)
    const latest  = rows[rows.length - 1]
    const hazard  = SLOPE_HAZARD[sid] ?? { slope: 25, ndvi: 0.65, geology: 'Mixed', road: 'Unknown', river: 'Unknown' }

    // ── 1. VELOCITY (primary signal) ──
    const hVelAvg7    = avg(last7.map(r => r.h_vel_mmday))
    const hVelPrev7   = avg(prev7.map(r => r.h_vel_mmday))
    const uVelAvg7    = avg(last7.map(r => r.u_vel_mmday))
    const dataQuality = last7.filter(r => r.h_vel_mmday != null).length / 7

    // ── 2. SIM STATE OVERRIDE (if active scenario) ──
    const simEvent = getActiveEvent(sid)
    const scen     = simEvent ? SCENARIO_PARAMS[simEvent.type as keyof typeof SCENARIO_PARAMS] : null
    const hVel     = scen ? simEvent!.params.hVel  : hVelAvg7
    const uVel     = scen ? simEvent!.params.uVel  : uVelAvg7

    // ── 3. JKR CLASSIFICATION (velocity-based) ──
    const velClass = classifyByVelocity(hVel)

    // ── 4. RAINFALL ──
    // Simulate realistic Cameron Highlands rainfall (avg ~8mm/day, can spike)
    // In production: replace with actual AWS API
    const baseRain   = 8 + Math.sin(Date.now() / 86400000) * 5  // deterministic daily pattern
    const rain24     = scen ? simEvent!.params.rainfall : parseFloat((baseRain * (0.8 + Math.abs(Math.sin(Date.now() / 3600000)) * 0.4)).toFixed(1))
    const rainCum7d  = parseFloat((rain24 * 6.5).toFixed(1))
    const rainfallClass = classifyRainfall(rain24, rainCum7d)

    // ── 5. ANOMALY DETECTION ──
    const anomalyInfo = detectAnomalies(last7)
    const anomalyDetected = simEvent ? true : anomalyInfo.anomalyDetected

    // ── 6. TREND ──
    const trend = classifyTrend(Math.abs(hVel), Math.abs(hVelPrev7))

    // ── 7. SENSORS (deterministic, not random) ──
    const sensors = simulateSensors(velClass.score, hazard.slope)
    if (scen) {
      sensors.soilMoisture = simEvent!.params.soilMoisture
      sensors.piezometer   = simEvent!.params.piezometer
      sensors.tilt         = simEvent!.params.tilt
    }

    // ── 8. GROUND CONDITION ──
    const groundCondition = classifyGroundCondition(sensors.tilt, sensors.piezometer)

    // ── 9. FINAL RISK (velocity class + optional rainfall boost) ──
    // Rainfall can elevate risk by 1 level if Extreme
    let finalRiskLevel = velClass.riskLevel
    let finalScore     = velClass.score
    if (rainfallClass.levelBoost >= 2 && finalRiskLevel === 'Low')    { finalRiskLevel = 'Medium'; finalScore = Math.max(finalScore, 35) }
    if (rainfallClass.levelBoost >= 2 && finalRiskLevel === 'Medium') { finalRiskLevel = 'High';   finalScore = Math.max(finalScore, 65) }

    // ── 10. CONFIDENCE ──
    const trendConsistency = (trend === 'Increasing' && anomalyDetected) || (trend === 'Stable' && !anomalyDetected)
    const confidence = computeConfidence(dataQuality, trendConsistency, anomalyInfo.anomalyDays, rainfallClass.levelBoost)

    // ── 11. FAILURE PROBABILITY (physics-based) ──
    const prediction = computeFailureProbability(hVel, rain24, anomalyInfo.anomalyDays, trend, hazard.slope)

    const overallStatus: 'STABLE' | 'WARNING' | 'CRITICAL' =
      finalRiskLevel === 'High'   ? 'CRITICAL' :
      finalRiskLevel === 'Medium' ? 'WARNING'  : 'STABLE'

    return {
      id: sid, meta,
      latest: {
        risk:    finalRiskLevel,
        score:   finalScore,
        hVel,
        uVel,
        anomaly: anomalyDetected ? 'YES' : 'NO',
        zscoreU: latest.zscore_u ?? 0,
      },
      gnssData: {
        e:     latest.e_mm,
        n:     latest.n_mm,
        u:     latest.u_mm,
        hVel,
        uVel,
        trend,
      },
      weatherData: {
        rain24,
        rainCumulative: rainCum7d,
        rainfallIntensity: rainfallClass.impact,  // ← fixed field name (was 'intensity')
        rainfallCorr: rainfallClass.levelBoost > 0 ? 'Detected' : 'Not Detected',
      },
      sensorData: {
        soilMoisture: sensors.soilMoisture,
        piezometer:   sensors.piezometer,
        tilt:         sensors.tilt,
        crackMeter:   sensors.crackMeter,
      },
      hazardData: hazard,
      classification: {
        riskLevel:       finalRiskLevel,
        jkrLevel:        velClass.jkrLevel,
        movementTrend:   trend,
        rainfallImpact:  rainfallClass.impact,
        groundCondition,
        anomalyDetected: anomalyDetected ? 'Yes' : 'No',
        confidence,
        overallStatus,
        hVelThreshold: JKR_VELOCITY_THRESHOLDS,
      },
      prediction: {
        ...prediction,
        label: prediction.h48 > 60 ? 'Risk expected to INCREASE in next 24–48 hours'
             : prediction.h48 > 35 ? 'Risk may increase within next 48 hours — monitor closely'
             : 'Risk expected to remain stable over next 72 hours',
      },
      summary: {
        trend,
        overallStatus,
        avgVel7:   hVel,
        anomDays:  anomalyInfo.anomalyDays,
        maxZscore: anomalyInfo.maxZscore,
        avgRain:   rain24,
        rainfallCorr: rainfallClass.levelBoost > 0 ? 'Detected' : 'Not Detected',
      },
      last30: last30.map(r => ({
        date:   r.date,
        h_vel:  r.h_vel_mmday,
        u:      r.u_mm,
        risk:   r.risk_level,
        score:  r.risk_score,
      })),
    }
  })

  // ── NETWORK-LEVEL AGGREGATION ──
  const criticalSites   = allData.filter(d => d.summary?.overallStatus === 'CRITICAL').length
  const warningSites    = allData.filter(d => d.summary?.overallStatus === 'WARNING').length
  const increasingSites = allData.filter(d => d.summary?.trend === 'Increasing').length
  const totalAnomalyDays = allData.reduce((s, d) => s + (d.summary?.anomDays ?? 0), 0)
  const networkStatus: 'STABLE' | 'WARNING' | 'CRITICAL' =
    criticalSites > 0 ? 'CRITICAL' : warningSites > 1 ? 'WARNING' : 'STABLE'

  const avgNetworkVel = allData.reduce((s, d) => s + Math.abs(d.summary?.avgVel7 ?? 0), 0) / allData.length

  // ── AI NARRATIVE (Groq LLM or fallback mock) ──
  const prompt = `You are a senior geotechnical hazard analyst for the iLands GNSS Landslide Monitoring System, Cameron Highlands, Malaysia.

Network Status: ${networkStatus}
Date: ${new Date().toLocaleDateString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}
Critical sites: ${criticalSites}/5 | Warning sites: ${warningSites}/5 | Increasing movement: ${increasingSites}/5
Total anomaly days across network (last 7d): ${totalAnomalyDays}
Avg network H-velocity: ${avgNetworkVel.toFixed(3)} mm/day

Per-site summary:
${allData.map(d => `  ${d.meta?.name}: JKR Level ${d.classification?.jkrLevel}, H-vel=${d.summary?.avgVel7?.toFixed(3)}mm/day, Trend=${d.classification?.movementTrend}, Rainfall=${d.classification?.rainfallImpact}, P(48h)=${d.prediction?.h48}%`).join('\n')}

JKR thresholds: Level1 <2mm/day (NORMAL), Level2 2-5mm/day (ALERT), Level3 5-10mm/day (WARNING), Level4 >10mm/day (DANGER)

Return ONLY valid JSON (no markdown, no explanation):
{
  "networkStatus": "STABLE"|"WARNING"|"CRITICAL",
  "overallRisk": "Low"|"Medium"|"High",
  "keyFindings": ["finding1","finding2","finding3"],
  "rainfallAssessment": "one sentence",
  "movementAssessment": "one sentence",
  "prioritySite": "site name",
  "recommendation": "one actionable sentence",
  "narrative": "2-3 sentence professional summary"
}`

  const mockAI = {
    networkStatus,
    overallRisk: criticalSites > 0 ? 'High' : warningSites > 0 ? 'Medium' : 'Low' as any,
    keyFindings: [
      `${increasingSites} of 5 sites showing increasing displacement trend (JKR Level ${networkStatus === 'CRITICAL' ? '3–4' : networkStatus === 'WARNING' ? '2–3' : '1'})`,
      `Network avg H-velocity: ${avgNetworkVel.toFixed(3)} mm/day — ${avgNetworkVel < 2 ? 'within JKR Level 1 threshold' : avgNetworkVel < 5 ? 'approaching JKR Level 2 threshold' : 'exceeds JKR Level 2 threshold'}`,
      `${totalAnomalyDays} anomaly station-days detected across network this week`,
    ],
    rainfallAssessment: `Rainfall correlation ${allData.filter(d => d.weatherData?.rainfallCorr === 'Detected').length > 1 ? 'detected at multiple sites — elevated pore pressure risk' : 'not significant across network this period'}.`,
    movementAssessment: `Overall displacement ${networkStatus === 'STABLE' ? 'within acceptable JKR Level 1 parameters' : 'elevated above JKR normal threshold, requiring increased monitoring'}.`,
    prioritySite: [...allData].sort((a, b) => (b.latest?.score ?? 0) - (a.latest?.score ?? 0))[0]?.meta?.name ?? 'GNSS Site 5',
    recommendation: totalAnomalyDays > 3
      ? 'Deploy field inspection within 24 hours to highest-risk sites and alert JKR district office.'
      : 'Maintain standard JKR monitoring cadence; prepare field team on standby for priority site.',
    narrative: `The Cameron Highlands iLands network reports ${networkStatus} conditions across 5 GNSS monitoring stations. ${increasingSites > 0 ? `Movement trends are increasing at ${increasingSites} site(s), with H-velocities exceeding JKR alert thresholds.` : 'No accelerating displacement detected — all sites within JKR Level 1 normal range.'} Multi-source correlation of GNSS velocity, antecedent rainfall, and geotechnical sensor data indicates ${networkStatus === 'STABLE' ? 'stable slope conditions across all monitored slopes' : 'elevated hazard potential requiring heightened monitoring response'}.`,
  }

  try {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json({ allData, ai: mockAI, networkStatus, generatedAt: new Date().toISOString() })
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 700,
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'You are a geotechnical hazard analyst. Respond ONLY with valid JSON.' },
          { role: 'user',   content: prompt },
        ],
      }),
    })

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content ?? ''
    try {
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
      return NextResponse.json({ allData, ai: parsed, networkStatus, generatedAt: new Date().toISOString() })
    } catch {
      return NextResponse.json({ allData, ai: mockAI, networkStatus, generatedAt: new Date().toISOString() })
    }
  } catch {
    return NextResponse.json({ allData, ai: mockAI, networkStatus, generatedAt: new Date().toISOString() })
  }
}
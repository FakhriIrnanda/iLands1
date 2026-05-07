import { NextResponse } from 'next/server'
import { parseStationCSV, getStationMeta } from '@/lib/parseCSV'
import { getActiveEvent } from '@/lib/simState'

// Generate synthetic rainfall correlated with vertical displacement
function generateRainfall(uVals: number[], dates: string[]) {
  return dates.map((date, i) => {
    const uChange = i > 0 ? Math.abs(uVals[i] - uVals[i-1]) : 0
    // rainfall correlates with U displacement + random component
    const base = 2 + Math.random() * 8
    const correlated = uChange * 15 + base
    // seasonal: more rain May-Oct (monsoon)
    const month = parseInt(date.slice(5,7))
    const seasonal = (month >= 5 && month <= 10) ? 1.4 : 0.7
    return parseFloat((correlated * seasonal).toFixed(1))
  })
}

// Generate alert history from anomaly rows
function generateAlerts(rows: any[], latestAnomaly: string, latestRisk: string, latestScore: number) {
  const alerts: any[] = []
  let inAlert = false
  const last90 = rows.slice(-90)

  last90.forEach((r, i) => {
    const isLast = i === last90.length - 1
    if (r.anomaly_any === 'YES' && !inAlert) {
      inAlert = true
      const severity = r.risk_score > 70 ? 'CRITICAL' : r.risk_score > 40 ? 'WARNING' : 'WATCH'
      // Last row + still anomaly = ACTIVE, otherwise Resolved
      const isActive = isLast && latestAnomaly === 'YES'
      alerts.push({
        id: alerts.length + 1,
        date: r.date,
        severity: isActive ? (latestScore > 70 ? 'CRITICAL' : latestScore > 40 ? 'WARNING' : 'WATCH') : severity,
        trigger: r.zscore_u > 3 ? 'Z-score exceeded 3σ threshold' :
                 r.h_vel_mmday && r.h_vel_mmday > 5 ? 'Horizontal velocity > 5mm/day' :
                 'Displacement anomaly detected',
        riskScore: isActive ? latestScore : r.risk_score,
        resolved: !isActive,
        active: isActive,
      })
    } else if (r.anomaly_any === 'NO') {
      inAlert = false
    }
  })

  // Also add a live active alert if latest is anomaly but not captured above
  if (latestAnomaly === 'YES') {
    const alreadyActive = alerts.some(a => a.active)
    if (!alreadyActive) {
      alerts.unshift({
        id: 0,
        date: rows[rows.length-1].date,
        severity: latestScore > 70 ? 'CRITICAL' : latestScore > 40 ? 'WARNING' : 'WATCH',
        trigger: 'Active anomaly — live displacement exceeding threshold',
        riskScore: latestScore,
        resolved: false,
        active: true,
      })
    }
  }

  return alerts.slice(-10).reverse()
}

// Simulate geotechnical sensors
function simulateSensors(riskScore: number, phase: string) {
  const isAnomaly = riskScore > 50
  return {
    inclinometer: {
      value: parseFloat((isAnomaly ? 2.1 + Math.random() * 1.5 : 0.3 + Math.random() * 0.4).toFixed(2)),
      unit: '°', status: isAnomaly ? 'WARNING' : 'NORMAL', label: 'Tilt Angle'
    },
    piezometer: {
      value: parseFloat((isAnomaly ? 85 + Math.random() * 20 : 45 + Math.random() * 15).toFixed(1)),
      unit: 'kPa', status: isAnomaly ? 'ELEVATED' : 'NORMAL', label: 'Pore Water Pressure'
    },
    soilMoisture: {
      value: parseFloat((isAnomaly ? 72 + Math.random() * 15 : 38 + Math.random() * 12).toFixed(1)),
      unit: '%', status: isAnomaly ? 'HIGH' : 'NORMAL', label: 'Soil Moisture'
    },
    crackMeter: {
      value: parseFloat((isAnomaly ? 3.2 + Math.random() * 2 : 0.1 + Math.random() * 0.3).toFixed(2)),
      unit: 'mm', status: isAnomaly ? 'WARNING' : 'NORMAL', label: 'Crack Width'
    },
  }
}

// System status simulation
function systemStatus() {
  return {
    gnss: { status: 'ONLINE', signal: 92 + Math.floor(Math.random() * 8), satellites: 10 + Math.floor(Math.random() * 4) },
    communication: { status: 'ONLINE', latency: 120 + Math.floor(Math.random() * 80) },
    battery: { level: 78 + Math.floor(Math.random() * 20), solar: true, charging: true },
    lastSync: new Date().toISOString(),
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id.toUpperCase()
  const meta = getStationMeta(id)
  if (!meta) return NextResponse.json({ error: 'Station not found' }, { status: 404 })

  const allRows = parseStationCSV(id)
  const rows = allRows.slice(-365).map((r) => ({
    date: r.date,
    e: r.e_mm, n: r.n_mm, u: r.u_mm,
    e_vel: r.e_vel_mmday, n_vel: r.n_vel_mmday,
    u_vel: r.u_vel_mmday, h_vel: r.h_vel_mmday,
    zscore_e: r.zscore_e, zscore_n: r.zscore_n, zscore_u: r.zscore_u,
    anomaly: r.anomaly_any, risk: r.risk_level, score: r.risk_score,
  }))

  // Generate rainfall for last 365 days
  const uVals = rows.map(r => r.u)
  const dates = rows.map(r => r.date)
  const rainfall = generateRainfall(uVals, dates)
  const timeseriesWithRainfall = rows.map((r, i) => ({ ...r, rainfall: rainfall[i] }))

  // Last 30 days for correlation chart
  const last30 = timeseriesWithRainfall.slice(-30)

  const riskDist = {
    LOW:    allRows.filter(r => r.risk_level === 'LOW').length,
    MEDIUM: allRows.filter(r => r.risk_level === 'MEDIUM').length,
    HIGH:   allRows.filter(r => r.risk_level === 'HIGH').length,
  }

  const latest = allRows[allRows.length - 1]
  
  // Check if simulation is active — override anomaly/risk for alert generation
  const simEvent = getActiveEvent(id)
  const liveAnomaly = simEvent ? 'YES' : latest.anomaly_any
  const liveRisk    = simEvent ? (simEvent.type === 'landslide' ? 'HIGH' : simEvent.type === 'medium' ? 'MEDIUM' : 'LOW') : latest.risk_level
  const liveScore   = simEvent ? simEvent.params.hVel > 5 ? 95 : simEvent.params.hVel > 2 ? 52 : 5 : latest.risk_score
  
  const alerts = generateAlerts(allRows, liveAnomaly, liveRisk, liveScore)
  const sysStatus = systemStatus()

  // Movement trend: compare last 7 days velocity vs prev 7 days
  const last7  = allRows.slice(-7)
  const prev7  = allRows.slice(-14, -7)
  const avgVelLast = last7.reduce((s,r) => s + (r.h_vel_mmday ?? 0), 0) / 7
  const avgVelPrev = prev7.reduce((s,r) => s + (r.h_vel_mmday ?? 0), 0) / 7
  const trend = avgVelLast > avgVelPrev * 1.2 ? 'INCREASING' :
                avgVelLast < avgVelPrev * 0.8 ? 'DECREASING' : 'STABLE'

  // Rainfall influence: check if high rainfall days correlate with anomaly
  const recentRainfall = rainfall.slice(-7)
  const avgRainfall7 = recentRainfall.reduce((a,b) => a+b, 0) / 7
  const rainfallInfluence = avgRainfall7 > 20 ? 'DETECTED' : 'NOT DETECTED'

  // Overall status
  const overallStatus = latest.risk_score > 70 ? 'CRITICAL' :
                        latest.risk_score > 35 ? 'WARNING' : 'STABLE'

  return NextResponse.json({
    meta,
    timeseries: timeseriesWithRainfall,
    last30,
    riskDistribution: riskDist,
    anomalyCount: allRows.filter(r => r.anomaly_any === 'YES').length,
    totalDays: allRows.length,
    alerts,
    systemStatus: sysStatus,
    summary: {
      trend,
      rainfallInfluence,
      overallStatus,
      avgVel7: parseFloat(avgVelLast.toFixed(3)),
      avgRainfall7: parseFloat(avgRainfall7.toFixed(1)),
    }
  })
}
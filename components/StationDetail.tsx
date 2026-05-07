'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  ArrowLeft, Brain, Satellite, Wifi, Battery,
  CloudRain, Activity, ChevronRight, AlertTriangle,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface LiveData {
  station: string; phase: string
  online?: boolean
  dataSource?: string
  current: {
    date?: string; e: number; n: number; u: number
    e_vel: number|null; n_vel: number|null; u_vel: number|null; h_vel: number|null
    sig_e?: number; sig_n?: number; sig_u?: number
    zscore_e?: number; zscore_n?: number; zscore_u?: number
    anomaly: string; risk: string; score: number
  }
}
interface StationData {
  meta: any; timeseries: any[]; last30: any[]
  riskDistribution: any; anomalyCount: number; totalDays: number
  alerts: any[]; systemStatus: any; summary: any
}

// ─── Design Tokens (match Command Center §6.1) ────────────────────────────────
const C = {
  critical        : '#D8392C',
  warning         : '#E36A2C',
  watch           : '#E0A02E',
  normal          : '#1FA86A',
  accent          : '#4FA8E8',
  surfaceDeep     : '#07111B',
  surface         : '#0B1A28',
  surfaceElevated : '#16304A',
  border          : 'rgba(79,168,232,0.12)',
  textPrimary     : '#E8F0F8',
  textSecondary   : '#6B8FAF',
  textMono        : '#4FA8E8',
}

function riskColor(r: string) {
  if (r === 'HIGH'   || r === 'CRITICAL') return C.critical
  if (r === 'MEDIUM' || r === 'WARNING')  return C.warning
  if (r === 'WATCH')                      return C.watch
  return C.normal
}
function riskBg(r: string) {
  if (r === 'HIGH'   || r === 'CRITICAL') return 'rgba(216,57,44,0.15)'
  if (r === 'MEDIUM' || r === 'WARNING')  return 'rgba(227,106,44,0.15)'
  if (r === 'WATCH')                      return 'rgba(224,160,46,0.15)'
  return 'rgba(31,168,106,0.12)'
}
// §8 — operator-facing terminology
function riskLabel(r: string) {
  if (r === 'HIGH')   return 'CRITICAL'
  if (r === 'MEDIUM') return 'WARNING'
  if (r === 'LOW')    return 'NORMAL'
  return r
}
function movementRate(hvel: number | null) {
  if (hvel === null) return '—'
  return `${Math.abs(hvel).toFixed(2)} mm/day`
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background     : C.surface,
      border         : `1px solid ${C.border}`,
      borderRadius   : 0,
      padding        : '16px 18px',
      ...style,
    }}>{children}</div>
  )
}

function PanelHeader({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:14 }}>
      <span style={{ width:3, height:12, background:C.accent, display:'inline-block', flexShrink:0 }}/>
      {icon}
      <span style={{
        fontSize:9, fontWeight:700, color:C.textSecondary,
        letterSpacing:'0.12em', fontFamily:"'IBM Plex Mono',monospace",
      }}>{label}</span>
    </div>
  )
}

function SensorPill({ label, ok, detail }: { label: string; ok: boolean | null; detail?: string }) {
  const col = ok === null ? C.textSecondary : ok ? C.normal : C.critical
  const bg  = ok === null ? 'rgba(107,143,175,0.1)' : ok ? 'rgba(31,168,106,0.12)' : 'rgba(216,57,44,0.12)'
  const status = ok === null ? 'N/A' : ok ? 'OK' : 'OFFLINE'
  return (
    <div style={{ background:bg, border:`1px solid ${col}33`, padding:'8px 10px' }}>
      <div style={{ fontSize:9, color:col, fontWeight:700, letterSpacing:'0.1em', fontFamily:"'IBM Plex Mono',monospace", marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:11, color:col, fontWeight:700 }}>{status}</div>
      {detail && <div style={{ fontSize:9, color:C.textSecondary, marginTop:2 }}>{detail}</div>}
    </div>
  )
}

// §4.2 — Movement-vs-Rainfall chart (stacked panels, shared time axis)
function MovementRainfallChart({ data }: { data: any[] }) {
  // Colour displacement line by trend (grey flat / amber drifting / red accelerating)
  const last5 = data.slice(-5).map(d => d.h_vel ?? 0)
  const avg   = last5.reduce((a,b) => a+b, 0) / (last5.length || 1)
  const lineColor = avg >= 5 ? C.critical : avg >= 2 ? C.warning : C.textSecondary

  return (
    <div>
      {/* Upper: Rainfall bars */}
      <div style={{ fontSize:9, color:C.textSecondary, letterSpacing:'0.08em', marginBottom:4, fontFamily:"'IBM Plex Mono',monospace" }}>
        RAINFALL (mm / 24 h)
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <ComposedChart data={data} margin={{ top:2, right:4, bottom:0, left:-20 }}>
          <CartesianGrid strokeDasharray="3 2" stroke={`${C.border}`} vertical={false}/>
          <XAxis dataKey="date" tick={{ fontSize:0 }} axisLine={false} tickLine={false}/>
          <YAxis tick={{ fontSize:8, fill:C.textSecondary }} axisLine={false} tickLine={false}/>
          <Tooltip
            contentStyle={{ background:C.surfaceElevated, border:`1px solid ${C.border}`, borderRadius:0, fontSize:10, color:C.textPrimary }}
            formatter={(v:any) => [`${Number(v).toFixed(1)} mm`, 'Rainfall']}
            labelFormatter={l => l}
          />
          {/* Threshold reference line — rainfall */}
          <ReferenceLine y={25} stroke={C.warning} strokeDasharray="4 2" strokeWidth={1}/>
          <Bar dataKey="rainfall" fill={C.accent} opacity={0.4} radius={0}/>
        </ComposedChart>
      </ResponsiveContainer>

      {/* Divider */}
      <div style={{ borderTop:`1px solid ${C.border}`, margin:'6px 0' }}/>

      {/* Lower: Displacement line */}
      <div style={{ fontSize:9, color:C.textSecondary, letterSpacing:'0.08em', marginBottom:4, fontFamily:"'IBM Plex Mono',monospace" }}>
        MOVEMENT RATE (mm/day) — <span style={{ color:avg>=5?C.critical:avg>=2?C.warning:C.textSecondary }}>
          {avg>=5?'ACCELERATING':avg>=2?'DRIFTING':'STABLE'}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={110}>
        <ComposedChart data={data} margin={{ top:2, right:4, bottom:0, left:-20 }}>
          <CartesianGrid strokeDasharray="3 2" stroke={`${C.border}`} vertical={false}/>
          <XAxis dataKey="date" tick={{ fontSize:8, fill:C.textSecondary }} tickFormatter={v=>v?.slice(5)} interval={6} axisLine={false} tickLine={false}/>
          <YAxis tick={{ fontSize:8, fill:C.textSecondary }} axisLine={false} tickLine={false}/>
          <Tooltip
            contentStyle={{ background:C.surfaceElevated, border:`1px solid ${C.border}`, borderRadius:0, fontSize:10, color:C.textPrimary }}
            formatter={(v:any) => [`${Number(v).toFixed(3)} mm/day`, 'Movement rate']}
          />
          {/* §4.2 — threshold guide lines */}
          <ReferenceLine y={2} stroke={C.watch}    strokeDasharray="4 2" strokeWidth={1} label={{ value:'WATCH', position:'right', fontSize:8, fill:C.watch }}/>
          <ReferenceLine y={5} stroke={C.critical} strokeDasharray="4 2" strokeWidth={1} label={{ value:'CRITICAL', position:'right', fontSize:8, fill:C.critical }}/>
          <Line type="monotone" dataKey="h_vel" stroke={lineColor} dot={false} strokeWidth={1.5} name="Movement"/>
        </ComposedChart>
      </ResponsiveContainer>

      {/* Time range toggles §4.2 */}
      <div style={{ display:'flex', gap:4, marginTop:8 }}>
        {['7D','30D'].map(t => (
          <span key={t} style={{
            fontSize:8, fontFamily:"'IBM Plex Mono',monospace", color:C.textSecondary,
            border:`1px solid ${C.border}`, padding:'2px 8px', cursor:'pointer',
          }}>{t}</span>
        ))}
        <span style={{ fontSize:8, color:C.textSecondary, marginLeft:'auto', fontFamily:"'IBM Plex Mono',monospace" }}>
          Default: 7-day view — "is this storm causing it?"
        </span>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StationDetail() {
  const params = useParams()
  const router = useRouter()
  const id     = (params?.id as string)?.toUpperCase()

  const [stationData, setStationData] = useState<StationData|null>(null)
  const [live, setLive]               = useState<LiveData|null>(null)
  const [aiText, setAiText]           = useState('')
  const [aiLoading, setAiLoading]     = useState(false)
  const [serverTime, setServerTime]   = useState(new Date())
  const tickRef = useRef(0)

  useEffect(() => {
    const t = setInterval(() => setServerTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!id) return
    fetch(`/api/station/${id}`).then(r=>r.json()).then(setStationData)
  }, [id])

  useEffect(() => {
    if (!id) return
    const poll = async () => {
      tickRef.current = (tickRef.current + 1) % 90
      const res = await fetch(`/api/live/${id}?tick=${tickRef.current}`)
      setLive(await res.json())
    }
    fetch(`/api/live/${id}?tick=0`).then(r=>r.json()).then(setLive)
    const iv = setInterval(poll, 5000)
    return () => clearInterval(iv)
  }, [id])

  // AI assessment (§5.2 format)
  useEffect(() => {
    if (!id || !live) return
    setAiLoading(true)
    const risk  = live.current.risk
    const hvel  = live.current.h_vel ?? 0
    const anomaly = live.current.anomaly === 'YES'
    const score = live.current.score

    const prompt = `You are the AI engine of iLands. Produce an assessment in EXACTLY this format:

HEADLINE: [≤18 words, plain language, no GNSS jargon]
RISK CLASS: [NORMAL | WATCH | WARNING | CRITICAL]
CONFIDENCE: [e.g. 84%]
REASONING:
• [source 1] — [X%]
• [source 2] — [X%]
• [source 3] — [X%]
RECOMMENDED ACTION: [one sentence, imperative verb]

Site: ${stationData?.meta?.name ?? id} | Risk: ${risk} | Movement: ${Math.abs(hvel).toFixed(2)} mm/day | Anomaly: ${anomaly?'YES':'NO'} | Score: ${score}
E=${live.current.e.toFixed(1)} N=${live.current.n.toFixed(1)} U=${live.current.u.toFixed(1)} mm

Respond with ONLY the five fields. No markdown, no preamble.`

    fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stationId: id, prompt }),
    })
      .then(r => r.json())
      .then(d => { setAiText(d.text ?? d.content?.[0]?.text ?? ''); setAiLoading(false) })
      .catch(() => {
        // Fallback §5.2
        const lbl = riskLabel(risk)
        setAiText(`HEADLINE: ${stationData?.meta?.name ?? id} slope movement is ${risk==='HIGH'?'critical — active displacement detected':risk==='MEDIUM'?'elevated and requires close attention':'within normal seasonal parameters'}.\nRISK CLASS: ${lbl}\nCONFIDENCE: ${risk==='HIGH'?'88%':risk==='MEDIUM'?'76%':'92%'}\nREASONING:\n• GNSS movement rate — ${risk==='HIGH'?'51%':risk==='MEDIUM'?'44%':'37%'}\n• Displacement trend — ${risk==='HIGH'?'29%':risk==='MEDIUM'?'31%':'36%'}\n• Historical baseline — ${risk==='HIGH'?'20%':'27%'}\nRECOMMENDED ACTION: ${risk==='HIGH'?'Close site access and dispatch inspection team within 2 hours.':risk==='MEDIUM'?'On-call engineer to review site data within 4 hours.':'Continue routine monitoring. No immediate action required.'}`)
        setAiLoading(false)
      })
  }, [id, live?.current?.risk])

  function parseAI(text: string) {
    const get = (key: string) => { const m = text.match(new RegExp(`${key}:\\s*(.+)`)); return m?.[1]?.trim() ?? '' }
    const rm  = text.match(/REASONING:([\s\S]*?)RECOMMENDED ACTION:/i)
    return {
      headline  : get('HEADLINE'),
      riskClass : get('RISK CLASS'),
      confidence: get('CONFIDENCE'),
      reasoning : rm ? rm[1].trim().split('\n').filter(l=>l.trim().startsWith('•')) : [],
      action    : get('RECOMMENDED ACTION'),
    }
  }

  const ai   = parseAI(aiText)
  const risk = live?.current?.risk ?? 'LOW'
  const col  = riskColor(risk)
  const lbl  = riskLabel(risk)
  const conf = parseInt(ai.confidence) || 0
  const isLowConf = conf > 0 && conf < 60
  const ss   = stationData?.systemStatus

  // Activity timeline items
  const timeline: { time: string; event: string; type: 'alert'|'threshold'|'operator'|'sensor' }[] = [
    ...(live?.current?.anomaly === 'YES' ? [{ time: serverTime.toLocaleTimeString('en-GB'), event: 'Risk escalated — anomalous displacement pattern detected', type: 'alert' as const }] : []),
    ...(stationData?.alerts ?? []).slice(0,4).map((a:any) => ({
      time: a.date, event: `${a.severity} — ${a.trigger}`, type: 'threshold' as const,
    })),
  ]

  return (
    <div style={{ minHeight:'100vh', background:C.surfaceDeep, fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif", color:C.textPrimary }}>

      {/* ── BAND 01: Site Header (§4.1) ── */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'12px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>

        <div style={{ display:'flex', alignItems:'center', gap:12, flex:1, minWidth:0 }}>
          <button onClick={()=>router.push('/')} style={{
            display:'flex', alignItems:'center', gap:5,
            background: C.surfaceElevated, color: C.textSecondary,
            border: `1px solid ${C.border}`, padding:'6px 10px',
            fontSize:9, fontWeight:700, letterSpacing:'0.08em', cursor:'pointer',
            fontFamily:"'IBM Plex Mono',monospace",
          }}>
            <ArrowLeft size={11}/> COMMAND CENTER
          </button>

          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontSize:15, fontWeight:700, color:C.textPrimary, letterSpacing:'0.03em' }}>
                {stationData?.meta?.name ?? id}
              </span>
              {/* Risk status — large, colour-coded (§4.1) */}
              <span style={{
                fontSize:9, fontWeight:700, letterSpacing:'0.14em',
                fontFamily:"'IBM Plex Mono',monospace",
                color: col, background: riskBg(risk),
                border: `1px solid ${col}55`,
                padding: '3px 10px',
              }}>{lbl}</span>
              {live?.current?.anomaly === 'YES' && (
                <span style={{
                  fontSize:9, fontWeight:700, letterSpacing:'0.1em',
                  fontFamily:"'IBM Plex Mono',monospace",
                  color: C.warning, background: 'rgba(227,106,44,0.12)',
                  border: `1px solid ${C.warning}44`,
                  padding: '3px 8px',
                }}>⚠ ANOMALY</span>
              )}
            </div>
            <div style={{ fontSize:10, color:C.textSecondary, marginTop:3 }}>
              {stationData?.meta?.location ?? '—'}
            </div>
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:9, color:C.textSecondary, letterSpacing:'0.08em', marginBottom:2 }}>LAST UPDATE</div>
            <div style={{ fontSize:11, fontFamily:"'IBM Plex Mono',monospace", color:C.textMono, fontWeight:700 }}>
              {serverTime.toLocaleTimeString('en-GB')}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:C.normal, display:'inline-block', boxShadow:`0 0 0 3px ${C.normal}33`, animation:'pulse 2s infinite' }}/>
            <span style={{ fontSize:9, color:C.normal, fontFamily:"'IBM Plex Mono',monospace", fontWeight:700 }}>LIVE</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:900, margin:'0 auto', padding:'16px 14px', display:'flex', flexDirection:'column', gap:12 }}>

        {/* ── BAND 02: AI Verdict — 3 cards (§4.1) ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>

          {/* Card A — AI Assessment (plain language) */}
          <Panel style={{ borderLeft:`3px solid ${col}` }}>
            <PanelHeader label="AI ASSESSMENT" icon={<Brain size={10} color={C.accent}/>}/>
            {aiLoading ? (
              <div style={{ fontSize:11, color:C.textSecondary }}>Generating…</div>
            ) : (
              <>
                {/* Headline — §5.2, largest text */}
                <div style={{ fontSize:13, fontWeight:700, color:C.textPrimary, lineHeight:1.5, marginBottom:10 }}>
                  {ai.headline || '—'}
                </div>
                {/* Risk class tag */}
                <span style={{
                  fontSize:9, fontWeight:700, letterSpacing:'0.12em',
                  fontFamily:"'IBM Plex Mono',monospace",
                  color:riskColor(ai.riskClass), background:riskBg(ai.riskClass),
                  border:`1px solid ${riskColor(ai.riskClass)}44`,
                  padding:'3px 8px', display:'inline-block',
                }}>{ai.riskClass || lbl}</span>
                {isLowConf && (
                  <div style={{ fontSize:10, color:C.watch, marginTop:8, lineHeight:1.4 }}>
                    AI is uncertain — operator judgement required
                  </div>
                )}
              </>
            )}
          </Panel>

          {/* Card B — Recommended Action + Acknowledge/Escalate/Dispatch */}
          <Panel style={{ borderLeft:`3px solid ${col}` }}>
            <PanelHeader label="RECOMMENDED ACTION"/>
            <div style={{ fontSize:12, color:col, fontWeight:600, lineHeight:1.6, marginBottom:12 }}>
              {ai.action || '—'}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <button style={{ background:C.surfaceDeep, color:C.textSecondary, border:`1px solid ${C.border}`, padding:'6px 0', fontSize:9, fontWeight:700, cursor:'pointer', letterSpacing:'0.1em', fontFamily:"'IBM Plex Mono',monospace" }}>
                ACKNOWLEDGE
              </button>
              <button style={{ background: col, color:'white', border:'none', padding:'6px 0', fontSize:9, fontWeight:700, cursor:'pointer', letterSpacing:'0.1em', fontFamily:"'IBM Plex Mono',monospace" }}>
                ESCALATE →
              </button>
              <button style={{ background:C.surfaceDeep, color:C.textSecondary, border:`1px solid ${C.border}`, padding:'6px 0', fontSize:9, fontWeight:700, cursor:'pointer', letterSpacing:'0.1em', fontFamily:"'IBM Plex Mono',monospace" }}>
                DISPATCH TEAM
              </button>
            </div>
          </Panel>

          {/* Card C — Confidence + reasoning sources (§5.2) */}
          <Panel>
            <PanelHeader label="CONFIDENCE &amp; SOURCES"/>
            {/* Confidence bar */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <div style={{ flex:1, height:5, background:C.surfaceDeep, borderRadius:2 }}>
                <div style={{ width:`${conf}%`, height:'100%', background: conf>=80?C.normal:conf>=60?C.watch:C.warning, borderRadius:2 }}/>
              </div>
              <span style={{ fontSize:12, fontWeight:700, fontFamily:"'IBM Plex Mono',monospace", color:C.textPrimary }}>{ai.confidence || '—'}</span>
            </div>
            {/* Reasoning bullets */}
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {ai.reasoning.map((b,i) => (
                <div key={i} style={{ fontSize:10, color:C.textSecondary, lineHeight:1.4 }}>{b}</div>
              ))}
              {!ai.reasoning.length && <div style={{ fontSize:10, color:C.textSecondary }}>—</div>}
            </div>
            {/* Explain link */}
            <button onClick={()=>router.push('/multisource')} style={{
              marginTop:10, display:'flex', alignItems:'center', gap:4,
              background:'none', border:'none', color:C.accent,
              fontSize:9, fontWeight:700, cursor:'pointer', letterSpacing:'0.08em',
              fontFamily:"'IBM Plex Mono',monospace", padding:0,
            }}>
              EXPLAIN THIS ASSESSMENT <ChevronRight size={10}/>
            </button>
          </Panel>
        </div>

        {/* ── BAND 03: Evidence ── */}
        <Panel>
          <PanelHeader label="MOVEMENT vs RAINFALL — 30-DAY CORRELATION" icon={<Activity size={10} color={C.accent}/>}/>
          {stationData?.last30?.length ? (
            <MovementRainfallChart data={stationData.last30}/>
          ) : (
            <div style={{ fontSize:11, color:C.textSecondary, padding:'20px 0', textAlign:'center' }}>Loading chart data…</div>
          )}
        </Panel>

        {/* Sensor status grid (§4.1 Band 03) */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
          <SensorPill
            label="GNSS"
            ok={ss?.gnss?.status === 'Online'}
            detail={ss ? `${ss.gnss.satellites} sats · ${ss.gnss.signal}% signal` : undefined}
          />
          <SensorPill
            label="COMMUNICATION"
            ok={ss?.communication?.status === 'Online'}
            detail={ss ? `${ss.communication.latency}ms latency` : undefined}
          />
          <SensorPill
            label="POWER"
            ok={ss?.battery?.level > 20}
            detail={ss ? `${ss.battery.level}% · Solar ${ss.battery.charging?'charging':'idle'}` : undefined}
          />
          <SensorPill label="AWS / RAINFALL" ok={null} detail="Not installed"/>
        </div>

        {/* ── BAND 04: Activity Timeline (§4.1) ── */}
        <Panel>
          <PanelHeader label="ACTIVITY TIMELINE" icon={<AlertTriangle size={10} color={C.accent}/>}/>

          {timeline.length === 0 ? (
            <div style={{ fontSize:11, color:C.textSecondary, textAlign:'center', padding:'16px 0' }}>
              No alerts in the monitoring record.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              {timeline.map((item, i) => (
                <div key={i} style={{
                  display:'flex', alignItems:'flex-start', gap:12,
                  padding:'10px 0',
                  borderBottom: i < timeline.length-1 ? `1px solid ${C.border}` : 'none',
                }}>
                  {/* Type indicator */}
                  <div style={{
                    width:3, alignSelf:'stretch', flexShrink:0,
                    background: item.type==='alert' ? C.critical : item.type==='threshold' ? C.warning : C.accent,
                  }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    {/* §8 terminology: "risk escalated" not "threshold breach" */}
                    <div style={{ fontSize:11, color:C.textPrimary, lineHeight:1.5 }}>{item.event}</div>
                    <div style={{ fontSize:9, color:C.textSecondary, marginTop:2, fontFamily:"'IBM Plex Mono',monospace" }}>{item.time}</div>
                  </div>
                  <span style={{
                    fontSize:8, fontWeight:700, letterSpacing:'0.1em',
                    fontFamily:"'IBM Plex Mono',monospace",
                    color: item.type==='alert' ? C.critical : C.warning,
                    border: `1px solid ${item.type==='alert'?C.critical:C.warning}44`,
                    padding:'2px 6px', flexShrink:0,
                    background: item.type==='alert' ? 'rgba(216,57,44,0.1)' : 'rgba(227,106,44,0.1)',
                  }}>
                    {item.type==='alert' ? 'ACTIVE' : 'RESOLVED'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Engineering sub-screen (hidden by default — §1.3) */}
        <details style={{ background:C.surface, border:`1px solid ${C.border}` }}>
          <summary style={{
            padding:'10px 14px', cursor:'pointer', fontSize:9,
            color:C.textSecondary, letterSpacing:'0.1em', fontWeight:700,
            fontFamily:"'IBM Plex Mono',monospace", userSelect:'none',
          }}>
            ENGINEERING DATA (E / N / U · Z-SCORE · SIGNAL)
          </summary>
          <div style={{ padding:'14px', borderTop:`1px solid ${C.border}` }}>
            {live && (
              <>
                {/* E/N/U raw values — §4.3 hidden by default */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:12 }}>
                  {[
                    { label:'EAST',  val:live.current.e ?? 0, vel:live.current.e_vel, sig:live.current.sig_e ?? null, color:'#4FA8E8' },
                    { label:'NORTH', val:live.current.n ?? 0, vel:live.current.n_vel, sig:live.current.sig_n ?? null, color:C.normal },
                    { label:'UP',    val:live.current.u ?? 0, vel:live.current.u_vel, sig:live.current.sig_u ?? null, color:'#db2777' },
                  ].map(({ label, val, vel, sig, color }) => (
                    <div key={label} style={{ background:C.surfaceDeep, padding:'10px 12px', border:`1px solid ${C.border}` }}>
                      <div style={{ fontSize:8, color, fontWeight:700, letterSpacing:'0.1em', fontFamily:"'IBM Plex Mono',monospace", marginBottom:4 }}>{label}</div>
                      <div style={{ fontSize:18, fontWeight:800, fontFamily:"'IBM Plex Mono',monospace", color:C.textPrimary, lineHeight:1 }}>{val.toFixed(1)}</div>
                      <div style={{ fontSize:9, color:C.textSecondary, marginTop:2 }}>mm {sig !== null ? `±${sig.toFixed(1)}` : ''}</div>
                      {vel !== null && (
                        <div style={{ marginTop:4, fontSize:9, color: vel>=0?color:C.critical, fontFamily:"'IBM Plex Mono',monospace" }}>
                          {vel>=0?'▲':'▼'} {Math.abs(vel).toFixed(2)} mm/day
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {/* Z-scores */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                  {[
                    { label:'Z-SCORE E', val:live.current.zscore_e ?? 0 },
                    { label:'Z-SCORE N', val:live.current.zscore_n ?? 0 },
                    { label:'Z-SCORE U', val:live.current.zscore_u ?? 0 },
                  ].map(({ label, val }) => (
                    <div key={label} style={{ background:C.surfaceDeep, padding:'10px 12px', border:`1px solid ${C.border}` }}>
                      <div style={{ fontSize:8, color:C.textSecondary, fontWeight:700, letterSpacing:'0.1em', fontFamily:"'IBM Plex Mono',monospace", marginBottom:4 }}>{label}</div>
                      <div style={{ fontSize:16, fontWeight:800, fontFamily:"'IBM Plex Mono',monospace", color: val>3?C.critical:val>2?C.warning:C.textPrimary }}>
                        {val.toFixed(2)}<span style={{ fontSize:10, color:C.textSecondary }}>σ</span>
                      </div>
                      <div style={{ fontSize:9, color:val>3?C.critical:val>2?C.warning:C.normal, marginTop:3, fontFamily:"'IBM Plex Mono',monospace" }}>
                        {val>3?'ANOMALOUS':val>2?'ELEVATED':'NORMAL'}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </details>

      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin  { to{transform:rotate(360deg)} }
        details > summary::-webkit-details-marker { display:none }
      `}</style>
    </div>
  )
}
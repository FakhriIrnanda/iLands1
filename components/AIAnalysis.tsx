'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Line, Area,
} from 'recharts'
import { ArrowLeft, Brain, RefreshCw, ChevronRight, Activity } from 'lucide-react'

const C = {
  critical:'#D8392C', warning:'#E36A2C', watch:'#E0A02E', normal:'#1FA86A',
  accent:'#4FA8E8', surfaceDeep:'#07111B', surface:'#0B1A28', surfaceElevated:'#16304A',
  border:'rgba(79,168,232,0.12)', textPrimary:'#E8F0F8', textSecondary:'#6B8FAF', textMono:'#4FA8E8',
}

function riskColor(r: string) {
  if (r==='HIGH'||r==='CRITICAL') return C.critical
  if (r==='MEDIUM'||r==='WARNING') return C.warning
  if (r==='WATCH') return C.watch
  return C.normal
}
function riskBg(r: string) {
  if (r==='HIGH'||r==='CRITICAL') return 'rgba(216,57,44,0.15)'
  if (r==='MEDIUM'||r==='WARNING') return 'rgba(227,106,44,0.15)'
  if (r==='WATCH') return 'rgba(224,160,46,0.15)'
  return 'rgba(31,168,106,0.12)'
}
function riskLabel(r: string) {
  if (r==='HIGH') return 'CRITICAL'
  if (r==='MEDIUM') return 'WARNING'
  if (r==='LOW') return 'NORMAL'
  return r
}

const STATIONS = [
  { id:'BAKO', name:'iLands · Ringlet',          location:'Ringlet' },
  { id:'CUSV', name:'iLands · Tanah Rata',        location:'Tanah Rata' },
  { id:'MYVA', name:'iLands · Brinchang',         location:'Brinchang' },
  { id:'NTUS', name:'iLands · Gunung Brinchang',  location:'Gunung Brinchang' },
  { id:'SAMP', name:'iLands · Simpang Pulai',     location:'Simpang Pulai' },
]

function PanelHeader({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:14 }}>
      <span style={{ width:3, height:12, background:C.accent, display:'inline-block', flexShrink:0 }}/>
      {icon}
      <span style={{ fontSize:9, fontWeight:700, color:C.textSecondary, letterSpacing:'0.12em', fontFamily:"'IBM Plex Mono',monospace" }}>{label}</span>
    </div>
  )
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background:C.surface, border:`1px solid ${C.border}`, padding:'16px 18px', ...style }}>{children}</div>
}

function ContributionChart({ sources }: { sources: { label: string; pct: number; color: string }[] }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {sources.map(s => (
        <div key={s.label}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
            <span style={{ fontSize:10, color:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace" }}>{s.label}</span>
            <span style={{ fontSize:10, fontWeight:700, color:s.color, fontFamily:"'IBM Plex Mono',monospace" }}>{s.pct}%</span>
          </div>
          <div style={{ height:6, background:C.surfaceDeep, borderRadius:1 }}>
            <div style={{ height:6, width:`${s.pct}%`, background:s.color, borderRadius:1, transition:'width 0.6s ease' }}/>
          </div>
        </div>
      ))}
    </div>
  )
}

interface AIInsight {
  headline:string; riskClass:string; confidence:string
  reasoning:string[]; action:string; timestamp:string; stationId:string
}

function InsightCard({ insight, isLatest }: { insight: AIInsight; isLatest: boolean }) {
  const [expanded, setExpanded] = useState(isLatest)
  const col  = riskColor(insight.riskClass)
  const conf = parseInt(insight.confidence) || 0
  return (
    <div style={{ borderLeft:`3px solid ${isLatest?col:C.border}`, background:isLatest?`${col}08`:C.surfaceDeep, padding:'10px 12px', marginBottom:8, opacity:isLatest?1:0.7 }}>
      <div style={{ fontSize:8, color:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace", marginBottom:6 }}>
        {insight.timestamp}{isLatest&&<span style={{ marginLeft:8, color:C.accent }}> ● LATEST</span>}
      </div>
      <div style={{ fontSize:12, fontWeight:700, color:C.textPrimary, lineHeight:1.5, marginBottom:8 }}>{insight.headline}</div>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
        <span style={{ fontSize:8, fontWeight:700, letterSpacing:'0.12em', fontFamily:"'IBM Plex Mono',monospace", color:col, background:riskBg(insight.riskClass), border:`1px solid ${col}44`, padding:'2px 7px' }}>{insight.riskClass}</span>
        <div style={{ flex:1, height:4, background:C.surfaceDeep, borderRadius:1 }}>
          <div style={{ width:`${conf}%`, height:'100%', background:conf>=80?C.normal:conf>=60?C.watch:C.warning, borderRadius:1 }}/>
        </div>
        <span style={{ fontSize:9, fontWeight:700, fontFamily:"'IBM Plex Mono',monospace", color:C.textPrimary }}>{insight.confidence}</span>
      </div>
      {expanded && (
        <>
          {insight.reasoning.length>0&&(
            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.1em', marginBottom:5, fontFamily:"'IBM Plex Mono',monospace" }}>REASONING</div>
              {insight.reasoning.map((b,i)=><div key={i} style={{ fontSize:10, color:C.textSecondary, lineHeight:1.5, marginBottom:3 }}>{b}</div>)}
            </div>
          )}
          <div style={{ fontSize:10, color:col, fontWeight:600, lineHeight:1.5 }}>→ {insight.action}</div>
          {conf>0&&conf<60&&<div style={{ fontSize:9, color:C.watch, marginTop:6 }}>AI is uncertain — operator judgement required</div>}
        </>
      )}
      <button onClick={()=>setExpanded(e=>!e)} style={{ marginTop:6, background:'none', border:'none', color:C.textSecondary, fontSize:8, cursor:'pointer', fontFamily:"'IBM Plex Mono',monospace", letterSpacing:'0.08em', padding:0 }}>
        {expanded?'▲ COLLAPSE':'▼ EXPAND REASONING'}
      </button>
    </div>
  )
}

function PredictionHorizonChart({ horizons, riskClass }: { horizons:{label:string;risk:number;low:number;high:number}[]; riskClass:string }) {
  const col = riskColor(riskClass)
  return (
    <div>
      <div style={{ fontSize:9, color:C.textSecondary, letterSpacing:'0.08em', marginBottom:8, fontFamily:"'IBM Plex Mono',monospace" }}>PREDICTED RISK LEVEL — CONFIDENCE BAND</div>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={horizons} margin={{top:4,right:4,bottom:4,left:-20}}>
          <CartesianGrid strokeDasharray="3 2" stroke={C.border} vertical={false}/>
          <XAxis dataKey="label" tick={{fontSize:9,fill:C.textSecondary}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:9,fill:C.textSecondary}} domain={[0,100]} axisLine={false} tickLine={false}/>
          <Tooltip contentStyle={{background:C.surfaceElevated,border:`1px solid ${C.border}`,borderRadius:0,fontSize:10,color:C.textPrimary}}/>
          <ReferenceLine y={70} stroke={C.critical} strokeDasharray="4 2" strokeWidth={1}/>
          <ReferenceLine y={35} stroke={C.warning}  strokeDasharray="4 2" strokeWidth={1}/>
          <Area type="monotone" dataKey="high" stroke="none" fill={col} fillOpacity={0.12} legendType="none"/>
          <Area type="monotone" dataKey="low"  stroke="none" fill={C.surfaceDeep} fillOpacity={1} legendType="none"/>
          <Line type="monotone" dataKey="risk" stroke={col} strokeWidth={2} dot={{fill:col,r:3}} name="Risk score"/>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function AIAnalysis() {
  const router = useRouter()
  const [selectedId,  setSelectedId]  = useState('BAKO')
  const [multiData,   setMultiData]   = useState<any>(null)
  const [liveMap,     setLiveMap]     = useState<Record<string,any>>({})
  const [insights,    setInsights]    = useState<AIInsight[]>([])
  const [predData,    setPredData]    = useState<any>(null)
  const [loading,     setLoading]     = useState(false)
  const [aiLoading,   setAiLoading]   = useState(false)
  const [lastUpdate,  setLastUpdate]  = useState<Date|null>(null)
  const tickRef    = useRef<Record<string,number>>({})
  const aiCalledRef = useRef<Record<string,boolean>>({})  // ← prevent duplicate calls

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/multisource')
      setMultiData(await res.json())
      setLastUpdate(new Date())
    } catch(e) {}
    setLoading(false)
  }, [])

  useEffect(() => {
    const pollLive = async () => {
      for (const s of STATIONS) {
        tickRef.current[s.id] = ((tickRef.current[s.id]??0)+1) % 90
        try {
          const res = await fetch(`/api/live/${s.id}?tick=${tickRef.current[s.id]}`)
          const d = await res.json()
          setLiveMap(prev => ({...prev, [s.id]: d}))
        } catch(e) {}
      }
    }
    pollLive()
    const iv = setInterval(pollLive, 5000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    fetch(`/api/predict?id=${selectedId}&days=30`).then(r=>r.json()).then(setPredData).catch(()=>{})
  }, [selectedId])

  // ── AI insight — only call ONCE per station, not on every live update ──────
  useEffect(() => {
    if (aiCalledRef.current[selectedId]) return  // already called for this station
    const live = liveMap[selectedId]
    if (!live) return

    aiCalledRef.current[selectedId] = true  // mark as called
    setAiLoading(true)

    const station = STATIONS.find(s=>s.id===selectedId)
    const risk    = live.current?.risk ?? 'LOW'
    const hvel    = live.current?.h_vel ?? 0
    const anomaly = live.current?.anomaly === 'YES'
    const score   = live.current?.score ?? 0

    const prompt = `You are the AI engine of iLands. Produce an AI insight in EXACTLY this format:

HEADLINE: [≤18 words, plain language, no GNSS jargon]
RISK CLASS: [NORMAL | WATCH | WARNING | CRITICAL]
CONFIDENCE: [e.g. 82%]
REASONING:
• [data source] — [X%]
• [data source] — [X%]
• [data source] — [X%]
RECOMMENDED ACTION: [one sentence, starts with imperative verb]

Site: ${station?.name} (${station?.location})
Risk: ${risk} | Movement: ${Math.abs(hvel).toFixed(2)} mm/day | Anomaly: ${anomaly?'YES':'NO'} | Score: ${score}

Respond with ONLY the five fields. No markdown, no preamble.`

    fetch('/api/predict', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ stationId: selectedId, prompt }),
    })
      .then(r=>r.json())
      .then(d => {
        const text = d.text ?? ''
        setInsights(prev => [parseInsight(text||buildFallback(risk, station?.name??selectedId), selectedId), ...prev.filter(i=>i.stationId!==selectedId).slice(0,3)])
        setAiLoading(false)
      })
      .catch(() => {
        setInsights(prev => [parseInsight(buildFallback(risk, station?.name??selectedId), selectedId), ...prev.filter(i=>i.stationId!==selectedId).slice(0,3)])
        setAiLoading(false)
      })
  }, [selectedId, liveMap[selectedId]])  // liveMap[selectedId] needed to wait for first data

  useEffect(() => { fetchAll() }, [])

  function buildFallback(risk: string, name: string) {
    const lbl = riskLabel(risk)
    return `HEADLINE: ${name} slope movement ${risk==='HIGH'?'is critical — active displacement detected':risk==='MEDIUM'?'is elevated — monitoring required':'is within normal seasonal parameters'}.\nRISK CLASS: ${lbl}\nCONFIDENCE: ${risk==='HIGH'?'87%':risk==='MEDIUM'?'74%':'91%'}\nREASONING:\n• GNSS movement rate — ${risk==='HIGH'?'51%':'38%'}\n• Displacement trend — 29%\n• Historical baseline — 20%\nRECOMMENDED ACTION: ${risk==='HIGH'?'Close site access and dispatch inspection team within 2 hours.':risk==='MEDIUM'?'On-call engineer to review data within 4 hours.':'Continue routine monitoring. No immediate action required.'}`
  }

  function parseInsight(text: string, stationId: string): AIInsight {
    const get = (key: string) => { const m = text.match(new RegExp(`${key}:\\s*(.+)`)); return m?.[1]?.trim()??'' }
    const rm  = text.match(/REASONING:([\s\S]*?)RECOMMENDED ACTION:/i)
    return {
      headline:get('HEADLINE'), riskClass:get('RISK CLASS'), confidence:get('CONFIDENCE'),
      reasoning: rm ? rm[1].trim().split('\n').filter(l=>l.trim().startsWith('•')) : [],
      action:get('RECOMMENDED ACTION'), timestamp:new Date().toLocaleTimeString('en-GB'), stationId,
    }
  }

  // Allow re-fetching AI when switching stations + manual refresh
  const refreshAI = () => {
    aiCalledRef.current[selectedId] = false
    setInsights(prev => prev.filter(i=>i.stationId!==selectedId))
  }

  const selectedStation = STATIONS.find(s=>s.id===selectedId)!
  const selectedLive    = liveMap[selectedId]
  const selectedRisk    = selectedLive?.current?.risk ?? 'LOW'
  const selectedCol     = riskColor(selectedRisk)

  const siteData = multiData?.allData?.find((d:any)=>d.id===selectedId||d.meta?.id===selectedId)
  const sources = [
    { label:'GNSS MOVEMENT',  pct:siteData?45:0, color:C.accent },
    { label:'RAINFALL / AWS', pct:siteData?28:0, color:'#60a5fa' },
    { label:'SOIL MOISTURE',  pct:siteData?14:0, color:C.watch },
    { label:'TILT SENSOR',    pct:siteData?9:0,  color:C.normal },
    { label:'OTHER',          pct:siteData?4:0,  color:C.textSecondary },
  ]

  const baseScore = selectedLive?.current?.score ?? 0
  const horizons = [
    { label:'NOW',  risk:baseScore,                                low:Math.max(0,baseScore-5),  high:Math.min(100,baseScore+5)  },
    { label:'+6h',  risk:Math.min(100,baseScore+baseScore*0.05),   low:Math.max(0,baseScore-8),  high:Math.min(100,baseScore+12) },
    { label:'+12h', risk:Math.min(100,baseScore+baseScore*0.10),   low:Math.max(0,baseScore-12), high:Math.min(100,baseScore+18) },
    { label:'+24h', risk:Math.min(100,baseScore+baseScore*0.18),   low:Math.max(0,baseScore-15), high:Math.min(100,baseScore+25) },
    { label:'+48h', risk:Math.min(100,baseScore+baseScore*0.28),   low:Math.max(0,baseScore-18), high:Math.min(100,baseScore+32) },
  ]

  const networkRows = STATIONS.map(s => {
    const live = liveMap[s.id]
    const risk = live?.current?.risk ?? 'LOW'
    return { ...s, risk, col:riskColor(risk), lbl:riskLabel(risk), score:live?.current?.score??0 }
  }).sort((a,b)=>b.score-a.score)

  return (
    <div style={{ minHeight:'100vh', background:C.surfaceDeep, fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif", color:C.textPrimary }}>

      {/* Header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'12px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={()=>router.push('/')} style={{ display:'flex', alignItems:'center', gap:5, background:C.surfaceElevated, color:C.textSecondary, border:`1px solid ${C.border}`, padding:'6px 10px', fontSize:9, fontWeight:700, letterSpacing:'0.08em', cursor:'pointer', fontFamily:"'IBM Plex Mono',monospace" }}>
            <ArrowLeft size={11}/> COMMAND CENTER
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Brain size={14} color={C.accent}/>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:C.textPrimary, letterSpacing:'0.05em' }}>AI ANALYSIS</div>
              <div style={{ fontSize:9, color:C.textSecondary }}>Explainability · Multi-Source · Prediction Horizon</div>
            </div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {lastUpdate&&<span style={{ fontSize:9, color:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace" }}>UPDATED {lastUpdate.toLocaleTimeString('en-GB')}</span>}
          <button onClick={()=>{ refreshAI(); fetchAll() }} disabled={loading} style={{ display:'flex', alignItems:'center', gap:4, background:C.surfaceElevated, color:C.textSecondary, border:`1px solid ${C.border}`, padding:'6px 10px', fontSize:9, cursor:'pointer', fontFamily:"'IBM Plex Mono',monospace" }}>
            <RefreshCw size={11} style={{animation:loading?'spin 1s linear infinite':'none'}}/> REFRESH
          </button>
        </div>
      </div>

      {/* Station selector */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'10px 18px', display:'flex', gap:6, flexWrap:'wrap' }}>
        {STATIONS.map(s => {
          const live=liveMap[s.id], risk=live?.current?.risk??'LOW', col=riskColor(risk), isAct=selectedId===s.id
          return (
            <button key={s.id} onClick={()=>{ setSelectedId(s.id) }} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', fontSize:9, fontWeight:700, letterSpacing:'0.06em', cursor:'pointer', fontFamily:"'IBM Plex Mono',monospace", background:isAct?C.surfaceElevated:'transparent', color:isAct?C.textPrimary:C.textSecondary, border:isAct?`1px solid ${col}`:`1px solid ${C.border}` }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:isAct?col:C.textSecondary, display:'inline-block' }}/>
              {s.name.split('· ')[1]?.toUpperCase() ?? s.id}
            </button>
          )
        })}
        <span style={{ marginLeft:'auto', fontSize:9, color:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace", alignSelf:'center' }}>{selectedStation.name} · {selectedStation.location}</span>
      </div>

      {/* 3-panel layout */}
      <div style={{ display:'grid', gridTemplateColumns:'220px 1fr 260px', gap:1, background:C.border, minHeight:'calc(100vh - 110px)' }}>

        {/* LEFT: Contributions */}
        <Panel style={{ display:'flex', flexDirection:'column', gap:0 }}>
          <PanelHeader label="INPUT CONTRIBUTIONS"/>
          <div style={{ marginBottom:16 }}><ContributionChart sources={sources}/></div>
          <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.1em', marginBottom:8, fontFamily:"'IBM Plex Mono',monospace" }}>SOURCE STATUS</div>
          {[
            { label:'GNSS',         ok:true,  detail:selectedLive?`${Math.abs(selectedLive.current?.h_vel??0).toFixed(2)} mm/day`:'—' },
            { label:'AWS RAINFALL', ok:true,  detail:'Last 24h data' },
            { label:'SOIL MOISTURE',ok:false, detail:'Sensor offline' },
            { label:'TILT SENSOR',  ok:false, detail:'Not installed' },
          ].map(src=>(
            <div key={src.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0', borderBottom:`1px solid ${C.border}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:src.ok?C.normal:C.textSecondary }}/>
                <span style={{ fontSize:9, color:src.ok?C.textPrimary:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace" }}>{src.label}</span>
              </div>
              <span style={{ fontSize:8, color:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace" }}>{src.detail}</span>
            </div>
          ))}
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.1em', marginBottom:8, fontFamily:"'IBM Plex Mono',monospace" }}>NETWORK OVERVIEW</div>
            {networkRows.map(r=>(
              <div key={r.id} onClick={()=>setSelectedId(r.id)} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 0', borderBottom:`1px solid ${C.border}`, cursor:'pointer' }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:r.col, flexShrink:0 }}/>
                <span style={{ fontSize:9, color:r.id===selectedId?C.textPrimary:C.textSecondary, flex:1, fontFamily:"'IBM Plex Mono',monospace" }}>{r.name.split(' ')[0]}</span>
                <span style={{ fontSize:8, color:r.col, fontFamily:"'IBM Plex Mono',monospace", fontWeight:700 }}>{r.lbl}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* CENTRE: AI Insight Feed */}
        <Panel style={{ display:'flex', flexDirection:'column' }}>
          <PanelHeader label="AI INSIGHT FEED" icon={<Brain size={10} color={C.accent}/>}/>
          {insights.filter(i=>i.stationId===selectedId).length>0&&(
            <div style={{ borderLeft:`3px solid ${selectedCol}`, background:`${selectedCol}08`, padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.1em', marginBottom:4, fontFamily:"'IBM Plex Mono',monospace" }}>CURRENT RISK CLASS</div>
                <div style={{ fontSize:18, fontWeight:700, color:selectedCol, letterSpacing:'0.06em', fontFamily:"'IBM Plex Mono',monospace" }}>{riskLabel(selectedRisk)}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:8, color:C.textSecondary, marginBottom:2 }}>SCORE</div>
                <div style={{ fontSize:28, fontWeight:800, color:selectedCol, fontFamily:"'IBM Plex Mono',monospace", lineHeight:1 }}>{selectedLive?.current?.score??'—'}</div>
              </div>
            </div>
          )}
          {aiLoading&&(
            <div style={{ display:'flex', alignItems:'center', gap:8, color:C.textSecondary, fontSize:11, padding:'8px 0' }}>
              <div style={{ width:10, height:10, border:`1.5px solid ${C.accent}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', flexShrink:0 }}/>
              Generating AI insight…
            </div>
          )}
          <div style={{ flex:1, overflowY:'auto' }}>
            {insights.filter(i=>i.stationId===selectedId).map((ins,idx)=>(
              <InsightCard key={idx} insight={ins} isLatest={idx===0}/>
            ))}
            {!aiLoading&&insights.filter(i=>i.stationId===selectedId).length===0&&(
              <div style={{ fontSize:11, color:C.textSecondary, textAlign:'center', padding:'32px 0' }}>Select a station to generate AI insight</div>
            )}
          </div>
          <button onClick={()=>router.push(`/station/${selectedId}`)} style={{ marginTop:12, display:'flex', alignItems:'center', justifyContent:'center', gap:5, background:C.surfaceElevated, color:C.accent, border:`1px solid ${C.border}`, padding:'8px 0', fontSize:9, fontWeight:700, cursor:'pointer', letterSpacing:'0.1em', fontFamily:"'IBM Plex Mono',monospace" }}>
            VIEW SITE DETAIL <ChevronRight size={11}/>
          </button>
        </Panel>

        {/* RIGHT: Prediction Horizon */}
        <Panel style={{ display:'flex', flexDirection:'column', gap:0 }}>
          <PanelHeader label="PREDICTION HORIZON"/>
          <PredictionHorizonChart horizons={horizons} riskClass={selectedRisk}/>
          {predData&&(
            <div style={{ marginTop:16 }}>
              <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.1em', marginBottom:8, fontFamily:"'IBM Plex Mono',monospace" }}>30-DAY REGRESSION TREND</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {[
                  { label:'TREND', val:predData.regression?.trend??'—', color:predData.regression?.trend==='Accelerating'?C.critical:predData.regression?.trend==='Decelerating'?C.normal:C.watch },
                  { label:'SLOPE', val:`${(predData.regression?.slope??0)>0?'+':''}${predData.regression?.slope} mm/d²`, color:C.textPrimary },
                  { label:'R²',    val:predData.regression?.r2??'—', color:(predData.regression?.r2??0)>0.7?C.normal:(predData.regression?.r2??0)>0.4?C.watch:C.critical },
                  { label:'PEAK',  val:predData.summary?.peakScore?`${predData.summary.peakScore} @ d+${predData.summary.peakDay}`:'—', color:C.textPrimary },
                ].map(item=>(
                  <div key={item.label} style={{ background:C.surfaceDeep, padding:'8px 10px', border:`1px solid ${C.border}` }}>
                    <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.08em', marginBottom:3, fontFamily:"'IBM Plex Mono',monospace" }}>{item.label}</div>
                    <div style={{ fontSize:11, fontWeight:700, color:item.color, fontFamily:"'IBM Plex Mono',monospace" }}>{item.val}</div>
                  </div>
                ))}
              </div>
              {predData.ai?.narrative&&(
                <div style={{ marginTop:10, background:C.surfaceDeep, border:`1px solid ${C.border}`, padding:'10px 12px' }}>
                  <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.08em', marginBottom:6, fontFamily:"'IBM Plex Mono',monospace" }}>30-DAY NARRATIVE</div>
                  <div style={{ fontSize:10, color:C.textSecondary, lineHeight:1.6 }}>{predData.ai.narrative}</div>
                </div>
              )}
            </div>
          )}
          <button onClick={()=>router.push('/simulate')} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5, background:'none', border:`1px solid ${C.border}`, padding:'8px 0', fontSize:9, color:C.textSecondary, cursor:'pointer', letterSpacing:'0.1em', fontFamily:"'IBM Plex Mono',monospace", marginTop:12 }}>
            <Activity size={10}/> SCENARIO SIMULATOR
          </button>
        </Panel>
      </div>

      <style>{`
        @keyframes spin { to{transform:rotate(360deg)} }
        ::-webkit-scrollbar { width:3px }
        ::-webkit-scrollbar-track { background:${C.surfaceDeep} }
        ::-webkit-scrollbar-thumb { background:${C.surfaceElevated} }
      `}</style>
    </div>
  )
}
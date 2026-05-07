'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import { ArrowLeft, Radio, Brain, TrendingUp, FileText, AlertTriangle } from 'lucide-react'

interface LiveData {
  station:string; epochTime:string; serverTime:string; phase:string
  tick:number; totalTicks:number; epochIntervalMinutes:number
  current:{
    date:string; e:number; n:number; u:number
    e_vel:number|null; n_vel:number|null; u_vel:number|null; h_vel:number|null
    sig_e:number; sig_n:number; sig_u:number
    zscore_e:number; zscore_n:number; zscore_u:number
    anomaly:string; risk:string; score:number
  }
  recent:{date:string;e:number;n:number;u:number;risk:string;anomaly:string}[]
}
interface StationDetail {
  meta:{id:string;name:string;location:string;lat:number;lon:number;riskLevel:string;riskScore:number;latestDate:string;totalRecords:number}
  timeseries:any[]
  riskDistribution:{LOW:number;MEDIUM:number;HIGH:number}
  anomalyCount:number; totalDays:number
}

const RISK_COLOR = { LOW:'#16a34a', MEDIUM:'#d97706', HIGH:'#dc2626' } as const
const RISK_BG    = { LOW:'#dcfce7', MEDIUM:'#fef3c7', HIGH:'#fee2e2' } as const

function LiveDot() {
  return (
    <span style={{ position:'relative', display:'inline-flex', width:10, height:10, flexShrink:0 }}>
      <span style={{ position:'absolute', inset:0, borderRadius:'50%', background:'#22c55e',
        animation:'ping 1.5s ease-in-out infinite', opacity:0.6 }} />
      <span style={{ position:'relative', width:10, height:10, borderRadius:'50%', background:'#22c55e' }} />
    </span>
  )
}

export default function StationDetail() {
  const params  = useParams()
  const router  = useRouter()
  const id      = (params?.id as string)?.toUpperCase()

  const [detail, setDetail]   = useState<StationDetail|null>(null)
  const [live, setLive]       = useState<LiveData|null>(null)
  const [insight, setInsight] = useState('')
  const [insightLoading, setInsightLoading] = useState(false)
  const [serverTime, setServerTime] = useState(new Date())
  const tickRef = useRef(0)

  useEffect(()=>{
    const t = setInterval(()=>setServerTime(new Date()),1000)
    return ()=>clearInterval(t)
  },[])

  useEffect(()=>{
    if (!id) return
    fetch(`/api/station/${id}`).then(r=>r.json()).then(setDetail)
    setInsightLoading(true)
    fetch(`/api/insight/${id}`).then(r=>r.json()).then(d=>{ setInsight(d.insight); setInsightLoading(false) })
      .catch(()=>setInsightLoading(false))
  },[id])

  useEffect(()=>{
    if (!id) return
    const poll = async () => {
      tickRef.current = (tickRef.current+1) % 90
      const res = await fetch(`/api/live/${id}?tick=${tickRef.current}`)
      const d: LiveData = await res.json()
      setLive(d)
    }
    fetch(`/api/live/${id}?tick=0`).then(r=>r.json()).then(setLive)
    const interval = setInterval(poll,5000)
    return ()=>clearInterval(interval)
  },[id])

  const risk = (live?.current.risk ?? detail?.meta.riskLevel ?? 'LOW') as keyof typeof RISK_COLOR
  const formatEpoch = (iso:string) => new Date(iso).toLocaleString('en-GB',{
    day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'
  })

  return (
    <div style={{ minHeight:'100vh', background:'#f8fafc', fontFamily:'system-ui,sans-serif' }}>

      {/* Nav */}
      <div style={{
        position:'sticky', top:0, zIndex:100, background:'white',
        borderBottom:'1px solid #e2e8f0', padding:'10px 16px',
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap'
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
          <button onClick={()=>router.push('/')}
            style={{ display:'flex', alignItems:'center', gap:4, background:'none', border:'1px solid #e2e8f0',
              borderRadius:8, padding:'6px 10px', cursor:'pointer', fontSize:12, color:'#475569', fontWeight:500,
              flexShrink:0, whiteSpace:'nowrap' }}>
            <ArrowLeft size={13}/> Back
          </button>
          <div style={{ minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
              <span style={{ fontWeight:700, fontSize:14, color:'#1e293b', whiteSpace:'nowrap' }}>
                {detail?.meta.name ?? id}
              </span>
              {live && (
                <span style={{
                  padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:700,
                  background: RISK_BG[risk], color: RISK_COLOR[risk], whiteSpace:'nowrap'
                }}>{risk} · {live.current.score}</span>
              )}
              {live?.current.anomaly === 'YES' && (
                <span style={{ padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:700,
                  background:'#ede9fe', color:'#7c3aed', whiteSpace:'nowrap' }}>
                  ⚠ ANOMALY
                </span>
              )}
            </div>
            <div style={{ fontSize:11, color:'#94a3b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {detail?.meta.location}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <button onClick={()=>router.push('/report')}
            style={{ display:'flex', alignItems:'center', gap:4, background:'#1e40af', color:'white',
              border:'none', borderRadius:8, padding:'6px 10px', fontSize:11, fontWeight:600, cursor:'pointer',
              whiteSpace:'nowrap' }}>
            <FileText size={12}/> Report
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11 }}>
            <LiveDot />
            <span style={{ fontFamily:'monospace', fontWeight:600, color:'#1e293b' }}>
              {serverTime.toLocaleTimeString('en-GB')}
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding:'16px' }}>

        {/* Epoch bar */}
        {live && (
          <div style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8,
            padding:'8px 12px', marginBottom:16, fontSize:11, color:'#64748b',
            display:'flex', flexWrap:'wrap', gap:'4px 12px', alignItems:'center' }}>
            <span><b style={{color:'#1e293b'}}>Epoch:</b> {formatEpoch(live.epochTime)}</span>
            <span><b style={{color:'#1e293b'}}>Phase:</b> <span style={{
              fontWeight:700, color: live.phase==='ANOMALY'?'#dc2626':live.phase==='RECOVERY'?'#d97706':'#16a34a'
            }}>{live.phase}</span></span>
            <span>Tick {live.tick+1}/{live.totalTicks}</span>
          </div>
        )}

        {/* E / N / U cards — stack on mobile */}
        {live && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:12 }}>
            {[
              { label:'E', full:'EAST',  val:live.current.e, vel:live.current.e_vel, color:'#2563eb', sig:live.current.sig_e },
              { label:'N', full:'NORTH', val:live.current.n, vel:live.current.n_vel, color:'#16a34a', sig:live.current.sig_n },
              { label:'U', full:'UP',    val:live.current.u, vel:live.current.u_vel, color:'#db2777', sig:live.current.sig_u },
            ].map(({label, full, val, vel, color, sig})=>(
              <div key={label} style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:10,
                padding:'12px 10px', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', color, marginBottom:6 }}>{full}</div>
                <div style={{ fontSize:20, fontWeight:800, fontFamily:'monospace', color:'#0f172a', lineHeight:1 }}>
                  {val.toFixed(1)}
                </div>
                <div style={{ fontSize:9, color:'#94a3b8', marginTop:2 }}>mm ±{sig.toFixed(1)}</div>
                {vel !== null && (
                  <div style={{ marginTop:6, fontSize:10, fontWeight:600,
                    color: vel>=0 ? color : '#dc2626' }}>
                    {vel>=0?'▲':'▼'} {Math.abs(vel).toFixed(2)}
                    <span style={{ color:'#94a3b8', fontSize:9 }}> mm/d</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* H-vel + Z-score */}
        {live && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
            <div style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:10, padding:'12px',
              boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize:9, color:'#94a3b8', fontWeight:700, letterSpacing:'0.08em', marginBottom:6 }}>
                H-VELOCITY
              </div>
              <div style={{ fontSize:22, fontWeight:800, fontFamily:'monospace', color:'#0f172a' }}>
                {live.current.h_vel?.toFixed(2) ?? '—'}
                <span style={{ fontSize:11, fontWeight:400, color:'#94a3b8', marginLeft:2 }}>mm/d</span>
              </div>
              <div style={{ marginTop:4, fontSize:10, fontWeight:600,
                color:(live.current.h_vel??0)>5?'#dc2626':(live.current.h_vel??0)>2?'#d97706':'#16a34a' }}>
                {(live.current.h_vel??0)>5?'● HIGH MOTION':(live.current.h_vel??0)>2?'● MODERATE':'● STABLE'}
              </div>
            </div>
            <div style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:10, padding:'12px',
              boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize:9, color:'#94a3b8', fontWeight:700, letterSpacing:'0.08em', marginBottom:6 }}>
                Z-SCORE (UP)
              </div>
              <div style={{ fontSize:22, fontWeight:800, fontFamily:'monospace',
                color:live.current.zscore_u>3?'#dc2626':live.current.zscore_u>2?'#d97706':'#16a34a' }}>
                {live.current.zscore_u.toFixed(2)}
                <span style={{ fontSize:11, fontWeight:400, color:'#94a3b8', marginLeft:2 }}>σ</span>
              </div>
              <div style={{ marginTop:4, fontSize:10, fontWeight:600,
                color:live.current.zscore_u>3?'#dc2626':live.current.zscore_u>2?'#d97706':'#16a34a' }}>
                {live.current.zscore_u>3?'● ANOMALOUS':live.current.zscore_u>2?'● ELEVATED':'● NORMAL'}
              </div>
            </div>
          </div>
        )}

        {/* AI Insight */}
        <div style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:10,
          padding:'16px', marginBottom:12, boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
            <Brain size={14} color="#7c3aed"/>
            <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.1em', color:'#7c3aed' }}>
              DAILY AI INSIGHT
            </span>
          </div>
          {insightLoading ? (
            <div style={{ display:'flex', alignItems:'center', gap:8, color:'#94a3b8', fontSize:13 }}>
              <div style={{ width:14, height:14, border:'2px solid #7c3aed', borderTopColor:'transparent',
                borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
              Generating insight…
            </div>
          ) : (
            <p style={{ margin:0, fontSize:13, lineHeight:1.7, color:'#374151' }}>{insight}</p>
          )}
          {detail && (
            <p style={{ margin:'8px 0 0', fontSize:10, color:'#94a3b8' }}>
              Based on {detail.totalDays.toLocaleString()} epochs · {detail.anomalyCount} anomaly events
            </p>
          )}
        </div>

        {/* Risk distribution */}
        {detail && (
          <div style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:10,
            padding:'16px', marginBottom:12, boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', color:'#94a3b8', marginBottom:12 }}>
              ALL-TIME RISK DISTRIBUTION
            </div>
            {(['HIGH','MEDIUM','LOW'] as const).map(level=>{
              const count = detail.riskDistribution[level]
              const pct = ((count/detail.totalDays)*100).toFixed(1)
              return (
                <div key={level} style={{ marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:3 }}>
                    <span style={{ fontWeight:700, color:RISK_COLOR[level] }}>{level}</span>
                    <span style={{ color:'#94a3b8' }}>{count.toLocaleString()} ({pct}%)</span>
                  </div>
                  <div style={{ height:5, background:'#f1f5f9', borderRadius:3 }}>
                    <div style={{ height:5, borderRadius:3, width:`${pct}%`, background:RISK_COLOR[level] }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Charts */}
        {detail && detail.timeseries.length > 0 && (<>
          <div style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:10,
            padding:'16px', marginBottom:12, boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', color:'#94a3b8', marginBottom:12 }}>
              E / N / U DISPLACEMENT — LAST 365 DAYS (mm)
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={detail.timeseries} margin={{top:4,right:4,bottom:4,left:-20}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                <XAxis dataKey="date" tick={{fontSize:8,fill:'#94a3b8'}} tickFormatter={v=>v.slice(5)} interval={89}/>
                <YAxis tick={{fontSize:8,fill:'#94a3b8'}}/>
                <Tooltip contentStyle={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,fontSize:10}}/>
                <Legend wrapperStyle={{fontSize:10}}/>
                <Line type="monotone" dataKey="e" stroke="#2563eb" dot={false} strokeWidth={1.5} name="E"/>
                <Line type="monotone" dataKey="n" stroke="#16a34a" dot={false} strokeWidth={1.5} name="N"/>
                <Line type="monotone" dataKey="u" stroke="#db2777" dot={false} strokeWidth={1.5} name="U"/>
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:10,
            padding:'16px', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', color:'#94a3b8', marginBottom:12 }}>
              H-VELOCITY (mm/day)
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={detail.timeseries.filter(r=>r.h_vel!==null)} margin={{top:4,right:4,bottom:4,left:-20}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                <XAxis dataKey="date" tick={{fontSize:8,fill:'#94a3b8'}} tickFormatter={v=>v.slice(5)} interval={89}/>
                <YAxis tick={{fontSize:8,fill:'#94a3b8'}}/>
                <Tooltip contentStyle={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,fontSize:10}}/>
                <ReferenceLine y={2} stroke="#d97706" strokeDasharray="4 2"/>
                <ReferenceLine y={5} stroke="#dc2626" strokeDasharray="4 2"/>
                <Line type="monotone" dataKey="h_vel" stroke="#7c3aed" dot={false} strokeWidth={1.5}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>)}
      </div>

      <style>{`
        @keyframes ping { 0%,100%{transform:scale(1);opacity:0.6} 50%{transform:scale(1.8);opacity:0} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}
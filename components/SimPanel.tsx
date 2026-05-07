'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RotateCcw, Activity, Info, Brain, Satellite } from 'lucide-react'

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  critical:'#D8392C', warning:'#E36A2C', watch:'#E0A02E', normal:'#1FA86A',
  accent:'#4FA8E8', surfaceDeep:'#07111B', surface:'#0B1A28', surfaceElevated:'#16304A',
  border:'rgba(79,168,232,0.12)', textPrimary:'#E8F0F8', textSecondary:'#6B8FAF', textMono:'#4FA8E8',
}

const STATIONS = [
  { id:'BAKO', name:'Batu Caves Slope',        location:'Ringlet' },
  { id:'CUSV', name:'Cameron Highlands Upper',  location:'Tanah Rata' },
  { id:'MYVA', name:'Lavender Park',            location:'Brinchang' },
  { id:'NTUS', name:'Mossy Forest Ridge',       location:'Gunung Brinchang' },
  { id:'SAMP', name:'RockShed Station',         location:'Simpang Pulai' },
]

const SCENARIOS = [
  {
    id: 'normal',
    label: 'NORMAL',
    desc: 'Stable slope, no significant movement',
    color: '#1FA86A',
    params: [
      { label:'H-VELOCITY',  val:'~0.3 mm/day',  note:'Below 2 mm/day threshold' },
      { label:'Z-SCORE',     val:'~0.5σ',         note:'No anomaly' },
      { label:'RAINFALL',    val:'~10 mm/24h',    note:'Low saturation risk' },
      { label:'RISK SCORE',  val:'~5/100',        note:'NORMAL' },
    ]
  },
  {
    id: 'medium',
    label: 'WARNING',
    desc: 'Post-rainfall creep, elevated pore pressure',
    color: '#E36A2C',
    params: [
      { label:'H-VELOCITY',  val:'~2.4 mm/day',  note:'Exceeds 2 mm/day caution' },
      { label:'Z-SCORE',     val:'~2.1σ',         note:'Approaching threshold' },
      { label:'RAINFALL',    val:'~38 mm/24h',    note:'Moderate saturation' },
      { label:'RISK SCORE',  val:'~52/100',       note:'WARNING — monitor closely' },
    ]
  },
  {
    id: 'landslide',
    label: 'CRITICAL',
    desc: 'Rapid displacement, slope failure in progress',
    color: '#D8392C',
    params: [
      { label:'H-VELOCITY',  val:'~15.8 mm/day', note:'3× above 5 mm/day threshold' },
      { label:'Z-SCORE',     val:'~4.8σ',         note:'Critical anomaly' },
      { label:'RAINFALL',    val:'~95 mm/24h',    note:'Slope fully saturated' },
      { label:'RISK SCORE',  val:'~95/100',       note:'CRITICAL — immediate action' },
    ]
  },
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

export default function SimPanel() {
  const router = useRouter()
  const [simState, setSimState] = useState<Record<string,any>>({})
  const [liveData, setLiveData] = useState<Record<string,any>>({})
  const [loading,  setLoading]  = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  const pollData = async () => {
    try {
      const simRes = await fetch('/api/simulate')
      setSimState(await simRes.json())
      const newLive: Record<string,any> = {}
      for (const s of STATIONS) {
        const r = await fetch(`/api/live/${s.id}?tick=0`)
        newLive[s.id] = await r.json()
      }
      setLiveData(newLive)
    } catch(e) {}
  }

  useEffect(() => {
    pollData()
    const iv = setInterval(pollData, 4000)
    return () => clearInterval(iv)
  }, [])

  const setScenario = async (stationId: string, scenario: string) => {
    setLoading(true)
    await fetch('/api/simulate', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ stationId, action:'set', scenario }),
    })
    await pollData()
    setLoading(false)
  }

  const resetAll = async () => {
    setLoading(true)
    await fetch('/api/simulate', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ stationId:'BAKO', action:'reset_all' }),
    })
    await pollData()
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', background:C.surfaceDeep, fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif", color:C.textPrimary, display:'flex', flexDirection:'column' }}>

      {/* ── Header ── */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'12px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={()=>router.push('/')} style={{ display:'flex', alignItems:'center', gap:5, background:C.surfaceElevated, color:C.textSecondary, border:`1px solid ${C.border}`, padding:'6px 10px', fontSize:9, fontWeight:700, letterSpacing:'0.08em', cursor:'pointer', fontFamily:"'IBM Plex Mono',monospace" }}>
            <ArrowLeft size={11}/> COMMAND CENTER
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Activity size={14} color={C.accent}/>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:C.textPrimary, letterSpacing:'0.05em' }}>SCENARIO SIMULATOR</div>
              <div style={{ fontSize:9, color:C.textSecondary }}>Inject realistic risk conditions for demo · Parameters based on JKR standards</div>
            </div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>setShowInfo(!showInfo)} style={{ display:'flex', alignItems:'center', gap:5, background:C.surfaceElevated, color:C.textSecondary, border:`1px solid ${C.border}`, padding:'6px 10px', fontSize:9, fontWeight:700, cursor:'pointer', letterSpacing:'0.08em', fontFamily:"'IBM Plex Mono',monospace" }}>
            <Info size={11}/> {showInfo ? 'HIDE INFO' : 'HOW IT WORKS'}
          </button>
          <button onClick={resetAll} disabled={loading} style={{ display:'flex', alignItems:'center', gap:5, background:C.surfaceElevated, color:C.textSecondary, border:`1px solid ${C.border}`, padding:'6px 10px', fontSize:9, fontWeight:700, cursor:'pointer', letterSpacing:'0.08em', fontFamily:"'IBM Plex Mono',monospace" }}>
            <RotateCcw size={11}/> RESET ALL
          </button>
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'16px 18px', maxWidth:800, margin:'0 auto', width:'100%', boxSizing:'border-box' as const }}>

        {/* Info panel */}
        {showInfo && (
          <Panel style={{ marginBottom:12, borderLeft:`3px solid ${C.accent}` }}>
            <PanelHeader label="HOW THE SIMULATOR WORKS"/>
            <div style={{ fontSize:11, color:C.textSecondary, lineHeight:1.8 }}>
              Each scenario injects <strong style={{ color:C.textPrimary }}>realistic geodetic parameters</strong> based on real Cameron Highlands slope data. The injected values override the CSV data for the selected station, propagating through all dashboard modules in real time.
            </div>
            <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:4 }}>
              {[
                [C.normal,   'NORMAL',   'Baseline conditions from dry season monitoring'],
                [C.warning,  'WARNING',  'Post-rainfall creep typical of monsoon season'],
                [C.critical, 'CRITICAL', 'Based on documented failure events in highland areas'],
              ].map(([col, lbl, desc]) => (
                <div key={lbl} style={{ display:'flex', gap:8, fontSize:10 }}>
                  <span style={{ color:col, fontFamily:"'IBM Plex Mono',monospace", fontWeight:700, minWidth:60 }}>{lbl}</span>
                  <span style={{ color:C.textSecondary }}>{desc}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Demo warning */}
        <div style={{ background:'rgba(224,160,46,0.08)', border:`1px solid ${C.watch}44`, padding:'10px 14px', marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:10, color:C.watch, fontFamily:"'IBM Plex Mono',monospace", fontWeight:700 }}>⚠ DEMO MODE</span>
          <span style={{ fontSize:10, color:C.textSecondary }}>Parameters are synthetic but calibrated to real JKR Malaysia geotechnical standards</span>
        </div>

        {/* Scenario reference */}
        <Panel style={{ marginBottom:12 }}>
          <PanelHeader label="SCENARIO PARAMETERS REFERENCE"/>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
            {SCENARIOS.map(sc => (
              <div key={sc.id} style={{ background:C.surfaceDeep, border:`1px solid ${sc.color}33`, padding:'12px' }}>
                <div style={{ fontSize:10, fontWeight:700, color:sc.color, letterSpacing:'0.1em', marginBottom:4, fontFamily:"'IBM Plex Mono',monospace" }}>{sc.label}</div>
                <div style={{ fontSize:9, color:C.textSecondary, marginBottom:10 }}>{sc.desc}</div>
                {sc.params.map(p => (
                  <div key={p.label} style={{ marginBottom:6 }}>
                    <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.08em', fontFamily:"'IBM Plex Mono',monospace" }}>{p.label}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:sc.color, fontFamily:"'IBM Plex Mono',monospace" }}>{p.val}</div>
                    <div style={{ fontSize:8, color:C.textSecondary }}>{p.note}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Panel>

        {/* Station controls */}
        <Panel style={{ marginBottom:12 }}>
          <PanelHeader label="SET SCENARIO PER STATION" icon={<Satellite size={10} color={C.accent}/>}/>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {STATIONS.map(s => {
              const live    = liveData[s.id]
              const simEv   = simState[s.id]
              const current = simEv?.type ?? 'normal'
              const hvel    = live?.current?.h_vel?.toFixed(2) ?? '—'
              const score   = live?.current?.score ?? '—'
              const risk    = live?.current?.risk ?? 'LOW'
              const riskCol = risk==='HIGH'?C.critical:risk==='MEDIUM'?C.warning:C.normal
              const riskLbl = risk==='HIGH'?'CRITICAL':risk==='MEDIUM'?'WARNING':'NORMAL'

              return (
                <div key={s.id} style={{ background:C.surfaceDeep, border:`1px solid ${C.border}`, padding:'12px 14px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:C.textPrimary }}>{s.name}</div>
                      <div style={{ fontSize:9, color:C.textSecondary }}>{s.location}</div>
                    </div>
                    <div style={{ textAlign:'right' as const }}>
                      <span style={{ fontSize:8, fontWeight:700, letterSpacing:'0.1em', fontFamily:"'IBM Plex Mono',monospace", color:riskCol, background:`${riskCol}15`, border:`1px solid ${riskCol}44`, padding:'2px 7px' }}>{riskLbl}</span>
                      <div style={{ fontSize:9, color:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace", marginTop:3 }}>
                        {hvel} mm/day · Score {score}
                      </div>
                    </div>
                  </div>

                  {/* Scenario buttons */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
                    {SCENARIOS.map(sc => {
                      const isActive = current === sc.id
                      return (
                        <button key={sc.id} onClick={()=>setScenario(s.id, sc.id)} disabled={loading} style={{
                          background: isActive ? `${sc.color}15` : C.surfaceElevated,
                          border: `1px solid ${isActive ? sc.color : C.border}`,
                          padding:'8px 6px', cursor:'pointer', textAlign:'center' as const,
                          opacity: loading ? 0.6 : 1, transition:'all 0.15s',
                        }}>
                          <div style={{ fontSize:9, fontWeight:700, color:isActive?sc.color:C.textSecondary, letterSpacing:'0.08em', fontFamily:"'IBM Plex Mono',monospace" }}>
                            {sc.label}
                          </div>
                          {isActive && (
                            <div style={{ fontSize:8, color:sc.color, marginTop:3, fontFamily:"'IBM Plex Mono',monospace", animation:'blink 1.5s step-end infinite' }}>● ACTIVE</div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>

        {/* Quick nav */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <button onClick={()=>router.push('/multisource')} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, background:C.surfaceElevated, color:C.accent, border:`1px solid ${C.border}`, padding:'10px', fontSize:9, fontWeight:700, cursor:'pointer', letterSpacing:'0.08em', fontFamily:"'IBM Plex Mono',monospace" }}>
            <Brain size={11}/> AI ANALYSIS →
          </button>
          <button onClick={()=>router.push('/station/BAKO')} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, background:C.surfaceElevated, color:C.accent, border:`1px solid ${C.border}`, padding:'10px', fontSize:9, fontWeight:700, cursor:'pointer', letterSpacing:'0.08em', fontFamily:"'IBM Plex Mono',monospace" }}>
            <Satellite size={11}/> SITE DETAIL →
          </button>
        </div>

      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        ::-webkit-scrollbar { width:3px }
        ::-webkit-scrollbar-track { background:${C.surfaceDeep} }
        ::-webkit-scrollbar-thumb { background:${C.surfaceElevated} }
      `}</style>
    </div>
  )
}
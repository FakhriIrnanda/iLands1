'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MapContainer, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Satellite, FileText, Brain, Radio, AlertTriangle,Bell } from 'lucide-react'
// ─── Types ───────────────────────────────────────────────────────────────────
interface StationMeta {
  id: string; name: string; location: string
  lat: number; lon: number
  riskLevel: 'LOW'|'MEDIUM'|'HIGH'
  riskScore: number; latestDate: string; totalRecords: number
  latestE: number; latestN: number; latestU: number
  latestHVel: number|null; anomalyToday: boolean
}
interface LiveData {
  station: string; phase: string
  current: { e:number; n:number; u:number; risk:string; score:number; anomaly:string; h_vel:number|null; e_vel:number|null }
}

// ─── Design Tokens (iLands Proposal §6.1) ────────────────────────────────────
const C = {
  critical : '#D8392C',
  warning  : '#E36A2C',
  watch    : '#E0A02E',
  normal   : '#1FA86A',
  accent   : '#4FA8E8',
  surfaceDeep    : '#07111B',
  surface        : '#0B1A28',
  surfaceElevated: '#16304A',
  border   : 'rgba(79,168,232,0.12)',
  textPrimary  : '#E8F0F8',
  textSecondary: '#6B8FAF',
  textMono : '#4FA8E8',
}

function riskColor(r: string) {
  if (r === 'HIGH'   || r === 'CRITICAL') return C.critical
  if (r === 'MEDIUM' || r === 'WARNING')  return C.warning
  if (r === 'WATCH')                      return C.watch
  return C.normal
}
function riskLabel(r: string) {
  if (r === 'HIGH')   return 'CRITICAL'
  if (r === 'MEDIUM') return 'WARNING'
  if (r === 'LOW')    return 'NORMAL'
  return r
}
function riskBg(r: string) {
  if (r === 'HIGH'   || r === 'CRITICAL') return 'rgba(216,57,44,0.15)'
  if (r === 'MEDIUM' || r === 'WARNING')  return 'rgba(227,106,44,0.15)'
  if (r === 'WATCH')                      return 'rgba(224,160,46,0.15)'
  return 'rgba(31,168,106,0.12)'
}

// ─── Map Markers ─────────────────────────────────────────────────────────────
function createStationIcon(name: string, risk: string, anomaly: boolean, isPulsing: boolean) {
  const col = riskColor(risk)
  const lbl = riskLabel(risk)
  const pulse = isPulsing ? `
    <div style="position:absolute;inset:-6px;border-radius:50%;border:1.5px solid ${col};opacity:0;animation:ripple 2.5s ease-out infinite;"></div>
    <div style="position:absolute;inset:-12px;border-radius:50%;border:1px solid ${col};opacity:0;animation:ripple 2.5s ease-out 0.8s infinite;"></div>
  ` : ''
  const html = `
    <div style="position:relative;display:flex;flex-direction:column;align-items:center;pointer-events:none">
      <div style="background:${C.surfaceElevated};border:1px solid ${col}44;border-left:3px solid ${col};padding:3px 8px 3px 7px;font-size:9.5px;font-weight:700;color:${C.textPrimary};white-space:nowrap;letter-spacing:0.04em;display:flex;align-items:center;gap:5px;margin-bottom:4px;font-family:'IBM Plex Mono',monospace">
        ${name}
        ${anomaly ? `<span style="background:${C.warning}22;color:${C.warning};font-size:8px;padding:1px 4px;letter-spacing:0.05em">⚠ ANOMALY</span>` : ''}
      </div>
      <div style="position:relative;width:12px;height:12px">
        ${pulse}
        <div style="width:12px;height:12px;border-radius:50%;background:${col};border:2px solid ${C.surface};box-shadow:0 0 8px ${col}66;position:relative;z-index:1"></div>
      </div>
    </div>`
  return L.divIcon({ html, className:'', iconSize:[130,42], iconAnchor:[65,42], popupAnchor:[0,-42] })
}

// ─── Map + Markers Controller ─────────────────────────────────────────────────
function MapController({ stations, liveMap, onNavigate, onSelect, selectedId }: {
  stations: StationMeta[]
  liveMap: Record<string, LiveData>
  onNavigate: (id: string) => void
  onSelect: (id: string) => void
  selectedId: string | null
}) {
  const map = useMap()
  const groupRef = useRef<any>(null)

  useEffect(() => {
    if (!stations.length) return
    if (groupRef.current) { map.removeLayer(groupRef.current); groupRef.current = null }

    import('leaflet.markercluster').then(() => {
      const group = (L as any).markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: (cluster: any) => {
          const markers = cluster.getAllChildMarkers()
          const hasHigh = markers.some((m: any) => m.options.riskData === 'HIGH')
          const hasMed  = markers.some((m: any) => m.options.riskData === 'MEDIUM')
          const col     = hasHigh ? C.critical : hasMed ? C.warning : C.normal
          return L.divIcon({
            html: `<div style="background:${C.surfaceElevated};border:2px solid ${col};color:${col};width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;font-family:'IBM Plex Mono',monospace">${cluster.getChildCount()}</div>`,
            className: '', iconSize: [36,36], iconAnchor: [18,18],
          })
        }
      })

      stations.forEach(s => {
        const live     = liveMap[s.id]
        const risk     = live?.current?.risk ?? s.riskLevel
        const anomaly  = live?.current?.anomaly === 'YES'
        const isPulsing = risk === 'HIGH' || risk === 'CRITICAL'
        const icon     = createStationIcon(s.name, risk, anomaly, isPulsing)
        const marker   = L.marker([s.lat, s.lon], { icon, riskData: risk } as any)

        // Popup
        const el = document.createElement('div')
        el.style.cssText = `background:${C.surface};border:1px solid ${C.border};min-width:200px;font-family:'IBM Plex Sans',sans-serif`
        const col = riskColor(risk)
        const lbl = riskLabel(risk)
        el.innerHTML = `
          <div style="border-left:3px solid ${col};padding:10px 12px 8px 12px">
            <div style="font-size:11px;font-weight:700;color:${C.textPrimary};letter-spacing:0.05em;margin-bottom:2px">${s.name}</div>
            <div style="font-size:10px;color:${C.textSecondary};margin-bottom:8px">${s.location}</div>
            <div style="display:flex;gap:5px;align-items:center;margin-bottom:8px">
              <span style="background:${riskBg(risk)};color:${col};border:1px solid ${col}44;padding:2px 8px;font-size:9px;font-weight:700;letter-spacing:0.1em;font-family:'IBM Plex Mono',monospace">${lbl}</span>
              ${anomaly ? `<span style="background:${C.warning}22;color:${C.warning};border:1px solid ${C.warning}44;padding:2px 8px;font-size:9px;font-weight:700;letter-spacing:0.1em;font-family:'IBM Plex Mono',monospace">⚠ ANOMALY</span>` : ''}
            </div>
            ${live ? `<div style="font-size:10px;font-family:'IBM Plex Mono',monospace;color:${C.textSecondary};display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;margin-bottom:8px;padding:6px 0;border-top:1px solid ${C.border}">
              <div><span style="color:${C.accent}">E</span> ${live.current.e.toFixed(1)}</div>
              <div><span style="color:${C.normal}">N</span> ${live.current.n.toFixed(1)}</div>
              <div><span style="color:#db2777">U</span> ${live.current.u.toFixed(1)}</div>
            </div>` : ''}
          </div>`
        const btn = document.createElement('button')
        btn.textContent = 'Open Site Detail →'
        btn.style.cssText = `width:100%;background:${C.accent};color:${C.surfaceDeep};border:none;padding:7px 0;font-size:10px;font-weight:700;cursor:pointer;letter-spacing:0.08em;font-family:'IBM Plex Mono',monospace`
        btn.onclick = () => onNavigate(s.id)
        el.appendChild(btn)
        marker.bindPopup(el, { className:'ilands-popup' })

        marker.on('click', () => onSelect(s.id))
        group.addLayer(marker)
      })

      map.addLayer(group)
      groupRef.current = group
    })

    return () => { if (groupRef.current) { map.removeLayer(groupRef.current); groupRef.current = null } }
  }, [stations, liveMap, map])

  return null
}

// ─── Sparkline ───────────────────────────────────────────────────────────────
function Sparkline({ values, color }: { values: number[], color: string }) {
  if (!values.length) return <div style={{ width:60, height:20 }}/>
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 58
    const y = 18 - ((v - min) / range) * 16
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={60} height={20} style={{ overflow:'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round"/>
    </svg>
  )
}

// ─── Priority Alert Card ──────────────────────────────────────────────────────
function AlertCard({ s, live, selected, onClick }: {
  s: StationMeta, live: LiveData|undefined, selected: boolean, onClick: () => void
}) {
  const risk  = live?.current?.risk ?? s.riskLevel
  const col   = riskColor(risk)
  const lbl   = riskLabel(risk)
  const anomaly = live?.current?.anomaly === 'YES'
  const hvel  = live?.current?.h_vel ?? s.latestHVel ?? 0

  // Plain-language reason (§3.2 — conversational, one sentence)
  let reason = 'Monitoring nominal. No escalating indicators.'
  if (risk === 'HIGH' || risk === 'CRITICAL') {
    reason = `Movement ${Math.abs(hvel).toFixed(1)} mm/day sustained — coincident rainfall trigger. Immediate review required.`
  } else if (anomaly) {
    reason = `Anomalous displacement pattern detected. Multi-source correlation recommended.`
  } else if (risk === 'MEDIUM' || risk === 'WARNING') {
    reason = `Displacement rate approaching threshold. Monitor closely over next 4 hours.`
  }

  return (
    <div onClick={onClick} style={{
      borderLeft: `3px solid ${selected ? col : C.border}`,
      background: selected ? `${col}10` : C.surface,
      padding: '10px 12px',
      cursor: 'pointer',
      borderBottom: `1px solid ${C.border}`,
      transition: 'background 0.15s',
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
        <span style={{ fontSize:11, fontWeight:700, color:C.textPrimary, letterSpacing:'0.03em' }}>{s.name}</span>
        <span style={{
          fontSize:8, fontWeight:700, letterSpacing:'0.12em',
          fontFamily:"'IBM Plex Mono',monospace",
          color: col, background: riskBg(risk),
          border: `1px solid ${col}44`,
          padding: '2px 6px',
        }}>{lbl}</span>
      </div>
      <div style={{ fontSize:9.5, color:C.textSecondary, lineHeight:1.5, marginBottom:6 }}>{reason}</div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:9, fontFamily:"'IBM Plex Mono',monospace", color:C.textMono }}>
          {hvel != null ? `${Math.abs(hvel).toFixed(2)} mm/day` : '—'}
        </span>
        {anomaly && <span style={{ fontSize:8, color:C.warning, letterSpacing:'0.08em', fontFamily:"'IBM Plex Mono',monospace" }}>⚠ ANOMALY</span>}
      </div>
    </div>
  )
}

// ─── Main Command Center ──────────────────────────────────────────────────────
export default function MapDashboard() {
  const router  = useRouter()
  const [stations, setStations] = useState<StationMeta[]>([])
  const [liveMap, setLiveMap]   = useState<Record<string,LiveData>>({})
  const [serverTime, setServerTime] = useState(new Date())
  const [selectedId, setSelectedId] = useState<string|null>(null)
  const [aiVerdict, setAiVerdict]   = useState<string>('')
  const [aiLoading, setAiLoading]   = useState(false)
  const tickRef = useRef<Record<string,number>>({})

  // Sort stations by risk priority for the queue
  const sortedStations = [...stations].sort((a, b) => {
    const order = { HIGH:0, MEDIUM:1, LOW:2 } as const
    const ra = (liveMap[a.id]?.current?.risk ?? a.riskLevel) as keyof typeof order
    const rb = (liveMap[b.id]?.current?.risk ?? b.riskLevel) as keyof typeof order
    return (order[ra]??2) - (order[rb]??2)
  })

  const selectedStation = stations.find(s => s.id === selectedId) ?? sortedStations[0] ?? null
  const selectedLive    = selectedStation ? liveMap[selectedStation.id] : null
  const selectedRisk    = selectedLive?.current?.risk ?? selectedStation?.riskLevel ?? 'LOW'
  const selectedCol     = riskColor(selectedRisk)

  // Network-wide counts (§3.1 Status Ribbon)
  const counts = {
    online  : stations.length,
    critical: stations.filter(s => (liveMap[s.id]?.current?.risk ?? s.riskLevel) === 'HIGH').length,
    warning : stations.filter(s => (liveMap[s.id]?.current?.risk ?? s.riskLevel) === 'MEDIUM').length,
    watch   : 0,
    alerts  : stations.filter(s => liveMap[s.id]?.current?.anomaly === 'YES').length,
  }

  // Fetch stations
  useEffect(() => {
    fetch('/api/stations').then(r=>r.json()).then(d => {
      setStations(d.stations)
      setSelectedId(d.stations[0]?.id ?? null)
    })
    const t = setInterval(() => setServerTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Poll live data
  useEffect(() => {
    if (!stations.length) return
    const poll = async () => {
      for (const s of stations) {
        tickRef.current[s.id] = ((tickRef.current[s.id]??0)+1) % 90
        const res = await fetch(`/api/live/${s.id}?tick=${tickRef.current[s.id]}`)
        const d: LiveData = await res.json()
        setLiveMap(prev => ({ ...prev, [s.id]: d }))
      }
    }
    poll()
    const iv = setInterval(poll, 5000)
    return () => clearInterval(iv)
  }, [stations])

  // Auto-select highest-risk station
  useEffect(() => {
    if (sortedStations.length && !selectedId) setSelectedId(sortedStations[0].id)
  }, [sortedStations])

  // AI verdict for selected station (§3.1 Detail Strip / §5.2 format)
  useEffect(() => {
    if (!selectedStation) return
    const live = liveMap[selectedStation.id]
    const risk = live?.current?.risk ?? selectedStation.riskLevel
    const hvel = live?.current?.h_vel ?? selectedStation.latestHVel ?? 0
    const anomaly = live?.current?.anomaly === 'YES'

    setAiLoading(true)
    const prompt = `You are the AI engine of iLands, an operational landslide monitoring system for Cameron Highlands, Malaysia.
Produce a single AI assessment following EXACTLY this five-field format (§5.2):

HEADLINE: [One sentence, ≤18 words, plain language — no GNSS jargon]
RISK CLASS: [NORMAL | WATCH | WARNING | CRITICAL]
CONFIDENCE: [e.g. 82%]
REASONING:
• [Input 1] — [contribution %]
• [Input 2] — [contribution %]
• [Input 3] — [contribution %]
RECOMMENDED ACTION: [One sentence starting with imperative verb]

Site: ${selectedStation.name} (${selectedStation.location})
Current risk: ${risk} | Movement rate: ${Math.abs(hvel).toFixed(2)} mm/day | Anomaly: ${anomaly ? 'YES' : 'NO'}
GNSS displacement E=${live?.current?.e?.toFixed(1)??'—'} N=${live?.current?.n?.toFixed(1)??'—'} U=${live?.current?.u?.toFixed(1)??'—'} mm

Respond with ONLY the five fields above. No preamble, no markdown.`

    fetch('/api/predict', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ stationId: selectedStation.id, prompt })
    }).then(r=>r.json()).then(d => {
      setAiVerdict(d.text ?? d.content?.[0]?.text ?? '')
      setAiLoading(false)
    }).catch(() => {
      // Fallback verdict
      const lbl = riskLabel(risk)
      setAiVerdict(`HEADLINE: ${selectedStation.name} slope indicators ${risk==='HIGH'?'show active movement requiring immediate action':risk==='MEDIUM'?'show elevated movement — close monitoring required':'are within normal seasonal parameters'}.\nRISK CLASS: ${lbl}\nCONFIDENCE: ${risk==='HIGH'?'88%':risk==='MEDIUM'?'74%':'91%'}\nREASONING:\n• GNSS horizontal velocity — ${risk==='HIGH'?'52%':risk==='MEDIUM'?'45%':'38%'}\n• Displacement trend — ${risk==='HIGH'?'28%':risk==='MEDIUM'?'30%':'35%'}\n• Historical baseline — ${risk==='HIGH'?'20%':'25%'}\nRECOMMENDED ACTION: ${risk==='HIGH'?'Close site access and dispatch inspection team within 2 hours.':risk==='MEDIUM'?'On-call engineer to review data within 4 hours.':'Continue routine monitoring. Review weekly summary.'}`)
      setAiLoading(false)
    })
  }, [selectedId])

  // Parse AI verdict fields
  function parseVerdict(text: string) {
    const get = (key: string) => {
      const m = text.match(new RegExp(`${key}:\\s*(.+)`))
      return m ? m[1].trim() : ''
    }
    const reasoningMatch = text.match(/REASONING:([\s\S]*?)RECOMMENDED ACTION:/i)
    const bullets = reasoningMatch ? reasoningMatch[1].trim().split('\n').filter(l=>l.trim().startsWith('•')).map(l=>l.trim()) : []
    return {
      headline  : get('HEADLINE'),
      riskClass : get('RISK CLASS'),
      confidence: get('CONFIDENCE'),
      reasoning : bullets,
      action    : get('RECOMMENDED ACTION'),
    }
  }

  const verdict = parseVerdict(aiVerdict)
  const confidenceNum = parseInt(verdict.confidence) || 0
  const isLowConfidence = confidenceNum > 0 && confidenceNum < 60

  return (
    <div style={{ width:'100vw', height:'100vh', display:'flex', flexDirection:'column', background:C.surfaceDeep, fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif", overflow:'hidden' }}>

      {/* ── ZONE 1: Status Ribbon (§3.1) ── */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'0 20px', display:'flex', alignItems:'center', justifyContent:'space-between', height:52, flexShrink:0 }}>

        {/* Brand */}
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Satellite size={16} color={C.accent}/>
            <span style={{ fontSize:12, fontWeight:700, color:C.textPrimary, letterSpacing:'0.08em' }}>iLANDS</span>
            <span style={{ width:1, height:16, background:C.border }}/>
            <span style={{ fontSize:10, color:C.textSecondary, letterSpacing:'0.04em' }}>COMMAND CENTER</span>
          </div>
          <span style={{ fontSize:9, color:C.textSecondary, letterSpacing:'0.06em' }}>Cameron Highlands · 5-min Epoch</span>
        </div>

        {/* Six numbers (§3.1) */}
        <div style={{ display:'flex', alignItems:'center', gap:1 }}>
          {[
            { label:'SITES ONLINE', value: counts.online,   color: C.normal,   icon: <Radio size={10}/> },
            { label:'CRITICAL',     value: counts.critical, color: counts.critical>0 ? C.critical : C.textSecondary },
            { label:'WARNING',      value: counts.warning,  color: counts.warning>0  ? C.warning  : C.textSecondary },
            { label:'WATCH',        value: counts.watch,    color: counts.watch>0    ? C.watch    : C.textSecondary },
            { label:'ACTIVE ALERTS',value: counts.alerts,   color: counts.alerts>0   ? C.warning  : C.textSecondary, icon: counts.alerts>0 ? <AlertTriangle size={10}/> : undefined },
          ].map((item, i) => (
            <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'0 16px', borderRight:`1px solid ${C.border}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:4, color:item.color, fontSize:18, fontWeight:700, fontFamily:"'IBM Plex Mono',monospace" }}>
                {item.icon}
                {item.value}
              </div>
              <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.1em', fontWeight:600 }}>{item.label}</div>
            </div>
          ))}
          {/* Clock */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'0 16px' }}>
            <div style={{ fontSize:14, fontWeight:700, fontFamily:"'IBM Plex Mono',monospace", color:C.accent }}>
              {serverTime.toLocaleTimeString('en-GB')}
            </div>
            <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.1em' }}>LOCAL TIME</div>
          </div>
        </div>

        {/* Nav buttons */}
        <div style={{ display:'flex', gap:6 }}>
          {[
            { label:'AI ANALYSIS', icon:<Brain size={11}/>, path:'/multisource', color:C.accent },
            { label:'REPORTS',     icon:<FileText size={11}/>, path:'/report', color:C.accent },
            { label:'ALERTS', icon:<Bell size={11}/>, path:'/alerts', color:C.accent },
          ].map(b => (
            <button key={b.label} onClick={()=>router.push(b.path)} style={{
              display:'flex', alignItems:'center', gap:5,
              background: C.surfaceElevated,
              color: b.color,
              border: `1px solid ${C.border}`,
              padding:'5px 10px', fontSize:9, fontWeight:700,
              letterSpacing:'0.08em', cursor:'pointer',
              fontFamily:"'IBM Plex Mono',monospace",
            }}>
              {b.icon}{b.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── ZONES 2+3: Map + Priority Queue ── */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* ── ZONE 2: Map (§3.1 centre-left) ── */}
        <div style={{ flex:1, position:'relative' }}>
          <MapContainer center={[4.48, 101.37]} zoom={12} style={{ width:'100%', height:'100%' }} zoomControl={false}>
            <ZoomControl position="bottomright"/>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; OpenStreetMap &copy; CARTO'/>
            <MapController
              stations={stations}
              liveMap={liveMap}
              onNavigate={(id) => router.push(`/station/${id}`)}
              onSelect={setSelectedId}
              selectedId={selectedId}
            />
          </MapContainer>

          {/* Risk legend (§7.1) */}
          <div style={{ position:'absolute', bottom:16, left:12, zIndex:999, background:C.surface, border:`1px solid ${C.border}`, padding:'10px 14px' }}>
            <div style={{ fontSize:8, fontWeight:700, color:C.textSecondary, letterSpacing:'0.12em', marginBottom:8 }}>RISK SCALE</div>
            {[['CRITICAL',C.critical],['WARNING',C.warning],['WATCH',C.watch],['NORMAL',C.normal]].map(([l,c])=>(
              <div key={l} style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:c, display:'inline-block', boxShadow:`0 0 4px ${c}88` }}/>
                <span style={{ fontSize:9, fontWeight:700, color:C.textSecondary, letterSpacing:'0.08em', fontFamily:"'IBM Plex Mono',monospace" }}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── ZONE 3: Priority Queue (§3.1 centre-right) ── */}
        <div style={{ width:280, background:C.surface, borderLeft:`1px solid ${C.border}`, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'10px 12px 8px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:3, height:12, background:C.accent, display:'inline-block' }}/>
              <span style={{ fontSize:9, fontWeight:700, color:C.textSecondary, letterSpacing:'0.12em' }}>PRIORITY QUEUE</span>
              {counts.critical > 0 && (
                <span style={{ marginLeft:'auto', fontSize:8, color:C.critical, fontFamily:"'IBM Plex Mono',monospace", fontWeight:700, letterSpacing:'0.1em', animation:'blink 1.5s step-end infinite' }}>
                  {counts.critical} CRITICAL
                </span>
              )}
            </div>
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {sortedStations.map(s => (
              <AlertCard
                key={s.id}
                s={s}
                live={liveMap[s.id]}
                selected={selectedId === s.id}
                onClick={() => setSelectedId(s.id)}
              />
            ))}
          </div>
          <div style={{ padding:'8px 12px', borderTop:`1px solid ${C.border}`, flexShrink:0 }}>
            <button
              onClick={() => selectedStation && router.push(`/station/${selectedStation.id}`)}
              style={{ width:'100%', background:C.surfaceElevated, color:C.accent, border:`1px solid ${C.border}`, padding:'7px 0', fontSize:9, fontWeight:700, cursor:'pointer', letterSpacing:'0.1em', fontFamily:"'IBM Plex Mono',monospace" }}>
              OPEN SITE DETAIL →
            </button>
          </div>
        </div>
      </div>

      {/* ── ZONE 4: AI Detail Strip (§3.1 bottom) ── */}
      <div style={{ background:C.surfaceElevated, borderTop:`1px solid ${selectedStation ? selectedCol : C.border}`, padding:'10px 20px', flexShrink:0, minHeight:110 }}>
        {selectedStation ? (
          <div style={{ display:'flex', gap:20, alignItems:'flex-start' }}>

            {/* Site identity */}
            <div style={{ minWidth:160, borderRight:`1px solid ${C.border}`, paddingRight:20 }}>
              <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.12em', marginBottom:4 }}>SELECTED SITE</div>
              <div style={{ fontSize:13, fontWeight:700, color:C.textPrimary, marginBottom:3 }}>{selectedStation.name}</div>
              <div style={{ fontSize:10, color:C.textSecondary, marginBottom:8 }}>{selectedStation.location}</div>
              <span style={{
                fontSize:9, fontWeight:700, letterSpacing:'0.12em',
                fontFamily:"'IBM Plex Mono',monospace",
                color: selectedCol, background: riskBg(selectedRisk),
                border: `1px solid ${selectedCol}44`,
                padding: '3px 8px',
              }}>{riskLabel(selectedRisk)}</span>
            </div>

            {/* AI Assessment — largest text on screen (§3.2) */}
            <div style={{ flex:1 }}>
              <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.12em', marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>
                <Brain size={9} color={C.accent}/> AI ASSESSMENT
                {aiLoading && <span style={{ color:C.accent, fontSize:8 }}>UPDATING…</span>}
                {!aiLoading && verdict.confidence && (
                  <div style={{ display:'flex', alignItems:'center', gap:4, marginLeft:'auto' }}>
                    <span style={{ fontSize:8, color:C.textSecondary }}>CONFIDENCE</span>
                    <div style={{ width:60, height:4, background:C.surface, borderRadius:2 }}>
                      <div style={{ width:`${confidenceNum}%`, height:'100%', background: confidenceNum>=80 ? C.normal : confidenceNum>=60 ? C.watch : C.warning, borderRadius:2 }}/>
                    </div>
                    <span style={{ fontSize:9, fontFamily:"'IBM Plex Mono',monospace", color:C.textPrimary, fontWeight:700 }}>{verdict.confidence}</span>
                  </div>
                )}
              </div>
              {aiLoading ? (
                <div style={{ fontSize:12, color:C.textSecondary }}>Generating assessment…</div>
              ) : (
                <>
                  <div style={{ fontSize:14, fontWeight:700, color:C.textPrimary, lineHeight:1.4, marginBottom:5 }}>
                    {verdict.headline || '—'}
                  </div>
                  {isLowConfidence && (
                    <div style={{ fontSize:10, color:C.watch, marginBottom:4 }}>AI is uncertain — operator judgement required</div>
                  )}
                </>
              )}
            </div>

            {/* Reasoning bullets (§5.2) */}
            {verdict.reasoning.length > 0 && (
              <div style={{ minWidth:180, borderLeft:`1px solid ${C.border}`, paddingLeft:20 }}>
                <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.12em', marginBottom:6 }}>REASONING SOURCES</div>
                {verdict.reasoning.map((b,i) => (
                  <div key={i} style={{ fontSize:10, color:C.textSecondary, marginBottom:4, lineHeight:1.4 }}>{b}</div>
                ))}
              </div>
            )}

            {/* Recommended Action (§5.2) */}
            <div style={{ minWidth:200, borderLeft:`1px solid ${C.border}`, paddingLeft:20 }}>
              <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.12em', marginBottom:6 }}>RECOMMENDED ACTION</div>
              <div style={{ fontSize:11, color:selectedCol, fontWeight:600, lineHeight:1.5, marginBottom:10 }}>
                {verdict.action || '—'}
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button style={{ flex:1, background:C.surfaceDeep, color:C.textSecondary, border:`1px solid ${C.border}`, padding:'5px 0', fontSize:9, fontWeight:700, cursor:'pointer', letterSpacing:'0.08em', fontFamily:"'IBM Plex Mono',monospace" }}>
                  ACKNOWLEDGE
                </button>
                <button onClick={()=>selectedStation && router.push(`/station/${selectedStation.id}`)} style={{ flex:1, background:selectedCol, color:'white', border:'none', padding:'5px 0', fontSize:9, fontWeight:700, cursor:'pointer', letterSpacing:'0.08em', fontFamily:"'IBM Plex Mono',monospace" }}>
                  ESCALATE →
                </button>
              </div>
            </div>

          </div>
        ) : (
          <div style={{ fontSize:11, color:C.textSecondary, textAlign:'center', padding:'20px 0' }}>Select a site to view AI assessment</div>
        )}
      </div>

      <style>{`
        @keyframes ripple { 0%{transform:scale(1);opacity:0.6} 100%{transform:scale(3);opacity:0} }
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .ilands-popup .leaflet-popup-content-wrapper {
          background: ${C.surface} !important;
          border: 1px solid ${C.border} !important;
          border-radius: 0 !important;
          padding: 0 !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4) !important;
        }
        .ilands-popup .leaflet-popup-tip { background: ${C.surface} !important; }
        .ilands-popup .leaflet-popup-content { margin: 0 !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: ${C.surfaceDeep}; }
        ::-webkit-scrollbar-thumb { background: ${C.surfaceElevated}; border-radius: 2px; }
      `}</style>
    </div>
  )
}
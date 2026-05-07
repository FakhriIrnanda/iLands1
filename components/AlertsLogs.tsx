'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, Filter, Download, CheckCircle, AlertTriangle, Clock, ChevronRight, Bell } from 'lucide-react'

// ─── Design Tokens ────────────────────────────────────────────────────────────
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

function sevColor(s: string) {
  if (s === 'CRITICAL') return C.critical
  if (s === 'WARNING')  return C.warning
  if (s === 'WATCH')    return C.watch
  return C.normal
}
function sevBg(s: string) {
  if (s === 'CRITICAL') return 'rgba(216,57,44,0.12)'
  if (s === 'WARNING')  return 'rgba(227,106,44,0.12)'
  if (s === 'WATCH')    return 'rgba(224,160,46,0.12)'
  return 'rgba(31,168,106,0.1)'
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Alert {
  id          : number
  date        : string
  severity    : 'CRITICAL' | 'WARNING' | 'WATCH' | 'NORMAL'
  trigger     : string           // plain language (§8)
  riskScore   : number
  resolved    : boolean
  active      : boolean
  stationId   : string
  stationName : string
  // Audit fields
  acknowledgedBy? : string
  acknowledgedAt? : string
  escalatedBy?    : string
  escalatedAt?    : string
  notes?          : string
}

interface AuditEntry {
  id        : number
  timestamp : string
  user      : string
  action    : 'ACKNOWLEDGED' | 'ESCALATED' | 'DISPATCHED' | 'THRESHOLD_CHANGE' | 'SENSOR_EVENT'
  alertId?  : number
  detail    : string
  stationId?: string
}

const STATIONS = [
  { id:'BAKO', name:'Batu Caves Slope'        },
  { id:'CUSV', name:'Cameron Highlands Upper'  },
  { id:'MYVA', name:'Lavender Park'            },
  { id:'NTUS', name:'Mossy Forest Ridge'       },
  { id:'SAMP', name:'RockShed Station'         },
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

// ─── Alert Row ────────────────────────────────────────────────────────────────
function AlertRow({ alert, onAcknowledge, onEscalate, selected, onClick }: {
  alert: Alert
  onAcknowledge: (id: number) => void
  onEscalate: (id: number) => void
  selected: boolean
  onClick: () => void
}) {
  const col = sevColor(alert.severity)
  const [expanded, setExpanded] = useState(false)

  return (
    <div onClick={onClick} style={{
      borderLeft    : `3px solid ${selected ? col : alert.active ? col : C.border}`,
      background    : selected ? `${col}08` : alert.active ? `${col}05` : 'transparent',
      padding       : '10px 14px',
      borderBottom  : `1px solid ${C.border}`,
      cursor        : 'pointer',
      transition    : 'background 0.15s',
    }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>

        {/* Severity tag */}
        <span style={{
          fontSize:8, fontWeight:700, letterSpacing:'0.12em',
          fontFamily:"'IBM Plex Mono',monospace",
          color:col, background:sevBg(alert.severity),
          border:`1px solid ${col}44`,
          padding:'3px 7px', flexShrink:0, whiteSpace:'nowrap' as const,
          display:'flex', alignItems:'center', gap:4,
        }}>
          {alert.active && <span style={{ width:5, height:5, borderRadius:'50%', background:col, display:'inline-block', animation:'blink 1s step-end infinite' }}/>}
          {alert.severity}
        </span>

        {/* Main content */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
            <span style={{ fontSize:11, fontWeight:700, color:C.textPrimary }}>{alert.stationName}</span>
            <span style={{ fontSize:9, color:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace" }}>#{alert.id}</span>
            {alert.active && (
              <span style={{ fontSize:8, color:col, fontFamily:"'IBM Plex Mono',monospace", letterSpacing:'0.1em', fontWeight:700 }}>● ACTIVE</span>
            )}
          </div>
          {/* §8 — plain language trigger */}
          <div style={{ fontSize:10, color:C.textSecondary, lineHeight:1.5, marginBottom:4 }}>{alert.trigger}</div>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' as const }}>
            <span style={{ fontSize:9, color:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace" }}>{alert.date}</span>
            <span style={{ fontSize:9, color:col, fontFamily:"'IBM Plex Mono',monospace" }}>Score: {alert.riskScore}</span>
            {alert.resolved && !alert.active && (
              <span style={{ fontSize:8, color:C.normal, fontFamily:"'IBM Plex Mono',monospace", letterSpacing:'0.08em' }}>✓ RESOLVED</span>
            )}
            {alert.acknowledgedBy && (
              <span style={{ fontSize:8, color:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace" }}>ACK: {alert.acknowledgedBy}</span>
            )}
          </div>
        </div>

        {/* Score bar */}
        <div style={{ flexShrink:0, width:50 }}>
          <div style={{ height:3, background:C.surfaceDeep, borderRadius:1, marginBottom:2 }}>
            <div style={{ height:3, width:`${Math.min(alert.riskScore,100)}%`, background:col, borderRadius:1 }}/>
          </div>
          <span style={{ fontSize:8, color:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace" }}>{alert.riskScore}/100</span>
        </div>
      </div>

      {/* Expanded — operator actions */}
      {selected && (
        <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}` }} onClick={e=>e.stopPropagation()}>
          {alert.notes && (
            <div style={{ fontSize:10, color:C.textSecondary, marginBottom:8, fontStyle:'italic' }}>{alert.notes}</div>
          )}
          {alert.active && !alert.acknowledgedBy && (
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={()=>onAcknowledge(alert.id)} style={{
                flex:1, background:C.surfaceElevated, color:C.textSecondary,
                border:`1px solid ${C.border}`, padding:'6px 0',
                fontSize:9, fontWeight:700, cursor:'pointer',
                letterSpacing:'0.08em', fontFamily:"'IBM Plex Mono',monospace",
              }}>ACKNOWLEDGE</button>
              <button onClick={()=>onEscalate(alert.id)} style={{
                flex:1, background:col, color:'white',
                border:'none', padding:'6px 0',
                fontSize:9, fontWeight:700, cursor:'pointer',
                letterSpacing:'0.08em', fontFamily:"'IBM Plex Mono',monospace",
              }}>ESCALATE →</button>
              <button onClick={()=>window.open(`/station/${alert.stationId}`,'_blank')} style={{
                flex:1, background:C.surfaceDeep, color:C.accent,
                border:`1px solid ${C.border}`, padding:'6px 0',
                fontSize:9, fontWeight:700, cursor:'pointer',
                letterSpacing:'0.08em', fontFamily:"'IBM Plex Mono',monospace",
              }}>SITE DETAIL</button>
            </div>
          )}
          {alert.acknowledgedBy && (
            <div style={{ fontSize:9, color:C.normal, fontFamily:"'IBM Plex Mono',monospace" }}>
              ✓ Acknowledged by {alert.acknowledgedBy} at {alert.acknowledgedAt}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Audit Entry Row ──────────────────────────────────────────────────────────
function AuditRow({ entry }: { entry: AuditEntry }) {
  const actionColor = {
    ACKNOWLEDGED    : C.normal,
    ESCALATED       : C.critical,
    DISPATCHED      : C.warning,
    THRESHOLD_CHANGE: C.accent,
    SENSOR_EVENT    : C.textSecondary,
  }[entry.action] ?? C.textSecondary

  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 0', borderBottom:`1px solid ${C.border}` }}>
      <div style={{ width:3, alignSelf:'stretch', flexShrink:0, background:actionColor }}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
          <span style={{ fontSize:9, fontWeight:700, color:actionColor, fontFamily:"'IBM Plex Mono',monospace", letterSpacing:'0.08em' }}>{entry.action}</span>
          {entry.stationId && <span style={{ fontSize:9, color:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace" }}>{entry.stationId}</span>}
        </div>
        <div style={{ fontSize:10, color:C.textPrimary, lineHeight:1.5 }}>{entry.detail}</div>
        <div style={{ fontSize:9, color:C.textSecondary, marginTop:2, fontFamily:"'IBM Plex Mono',monospace" }}>
          {entry.user} · {entry.timestamp}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AlertsLogs() {
  const router = useRouter()

  const [alerts,     setAlerts]     = useState<Alert[]>([])
  const [audit,      setAudit]      = useState<AuditEntry[]>([])
  const [loading,    setLoading]    = useState(true)
  const [selectedId, setSelectedId] = useState<number|null>(null)
  const [search,     setSearch]     = useState('')
  const [filterSev,  setFilterSev]  = useState<string>('ALL')
  const [filterStn,  setFilterStn]  = useState<string>('ALL')
  const [filterStatus, setFilterStatus] = useState<'ALL'|'ACTIVE'|'RESOLVED'>('ALL')
  const [activeTab,  setActiveTab]  = useState<'alerts'|'audit'>('alerts')
  const auditIdRef = useRef(100)

  // ── Load alerts from all stations ─────────────────────────────────────────
  const loadAlerts = useCallback(async () => {
    setLoading(true)
    const all: Alert[] = []
    for (const s of STATIONS) {
      try {
        const res = await fetch(`/api/station/${s.id}`)
        const d   = await res.json()
        const mapped = (d.alerts ?? []).map((a: any) => ({
          ...a,
          stationId  : s.id,
          stationName: s.name,
          id         : a.id ?? Math.random(),
        }))
        all.push(...mapped)
      } catch(e) {}
    }
    // Sort: active first, then by date desc
    all.sort((a,b) => {
      if (a.active && !b.active) return -1
      if (!a.active && b.active) return 1
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })
    setAlerts(all)
    setLoading(false)

    // Seed audit trail with system events
    setAudit(prev => {
      if (prev.length > 0) return prev
      const entries: AuditEntry[] = []
      all.filter(a=>a.active).forEach(a => {
        entries.push({
          id: auditIdRef.current++,
          timestamp: new Date().toLocaleTimeString('en-GB'),
          user: 'SYSTEM',
          action: 'SENSOR_EVENT',
          alertId: a.id,
          detail: `Active alert raised at ${a.stationName} — ${a.trigger}`,
          stationId: a.stationId,
        })
      })
      return entries
    })
  }, [])

  useEffect(() => { loadAlerts() }, [loadAlerts])

  // ── Operator actions ───────────────────────────────────────────────────────
  function acknowledge(alertId: number) {
    const operator = 'OPS-01'
    const now      = new Date().toLocaleTimeString('en-GB')
    setAlerts(prev => prev.map(a => a.id === alertId
      ? { ...a, acknowledgedBy: operator, acknowledgedAt: now }
      : a))
    setAudit(prev => [{
      id        : auditIdRef.current++,
      timestamp : now,
      user      : operator,
      action    : 'ACKNOWLEDGED',
      alertId,
      detail    : `Alert #${alertId} acknowledged by ${operator}`,
      stationId : alerts.find(a=>a.id===alertId)?.stationId,
    }, ...prev])
  }

  function escalate(alertId: number) {
    const operator = 'OPS-01'
    const now      = new Date().toLocaleTimeString('en-GB')
    setAlerts(prev => prev.map(a => a.id === alertId
      ? { ...a, escalatedBy: operator, escalatedAt: now }
      : a))
    setAudit(prev => [{
      id        : auditIdRef.current++,
      timestamp : now,
      user      : operator,
      action    : 'ESCALATED',
      alertId,
      detail    : `Alert #${alertId} escalated to JKR/NADMA by ${operator}`,
      stationId : alerts.find(a=>a.id===alertId)?.stationId,
    }, ...prev])
  }

  // ── Filtered alerts ────────────────────────────────────────────────────────
  const filtered = alerts.filter(a => {
    if (filterSev    !== 'ALL' && a.severity !== filterSev)                               return false
    if (filterStn    !== 'ALL' && a.stationId !== filterStn)                              return false
    if (filterStatus === 'ACTIVE'   && !a.active)                                         return false
    if (filterStatus === 'RESOLVED' && (a.active || !a.resolved))                         return false
    if (search && !a.stationName.toLowerCase().includes(search.toLowerCase())
               && !a.trigger.toLowerCase().includes(search.toLowerCase()))                 return false
    return true
  })

  // ── Summary counts ─────────────────────────────────────────────────────────
  const counts = {
    total    : alerts.length,
    active   : alerts.filter(a=>a.active).length,
    critical : alerts.filter(a=>a.severity==='CRITICAL').length,
    warning  : alerts.filter(a=>a.severity==='WARNING').length,
    resolved : alerts.filter(a=>a.resolved&&!a.active).length,
  }

  // ── Export audit trail as CSV (§9 — auditability) ─────────────────────────
  function exportCSV() {
    const rows = [
      ['Timestamp','User','Action','Alert ID','Station','Detail'],
      ...audit.map(e => [e.timestamp, e.user, e.action, e.alertId??'—', e.stationId??'—', e.detail]),
      ...alerts.map(a => [a.date, 'SYSTEM', 'ALERT_RAISED', a.id, a.stationId, a.trigger]),
    ]
    const csv  = rows.map(r=>r.join(',')).join('\n')
    const blob = new Blob([csv], { type:'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `ilands-audit-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div style={{ minHeight:'100vh', background:C.surfaceDeep, fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif", color:C.textPrimary, display:'flex', flexDirection:'column' }}>

      {/* ── Header ── */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'12px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={()=>router.push('/')} style={{
            display:'flex', alignItems:'center', gap:5,
            background:C.surfaceElevated, color:C.textSecondary,
            border:`1px solid ${C.border}`, padding:'6px 10px',
            fontSize:9, fontWeight:700, letterSpacing:'0.08em', cursor:'pointer',
            fontFamily:"'IBM Plex Mono',monospace",
          }}>
            <ArrowLeft size={11}/> COMMAND CENTER
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Bell size={14} color={counts.active>0?C.critical:C.accent}/>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:C.textPrimary, letterSpacing:'0.05em' }}>ALERTS & LOGS</div>
              <div style={{ fontSize:9, color:C.textSecondary }}>Alert history · Operator workflow · Audit trail</div>
            </div>
          </div>
        </div>

        {/* Summary ribbon */}
        <div style={{ display:'flex', alignItems:'center', gap:1 }}>
          {[
            { label:'TOTAL',    val:counts.total,    color:C.textSecondary },
            { label:'ACTIVE',   val:counts.active,   color:counts.active>0?C.critical:C.textSecondary },
            { label:'CRITICAL', val:counts.critical, color:counts.critical>0?C.critical:C.textSecondary },
            { label:'WARNING',  val:counts.warning,  color:counts.warning>0?C.warning:C.textSecondary },
            { label:'RESOLVED', val:counts.resolved, color:C.normal },
          ].map((item,i) => (
            <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'0 14px', borderRight:`1px solid ${C.border}` }}>
              <div style={{ fontSize:16, fontWeight:700, color:item.color, fontFamily:"'IBM Plex Mono',monospace" }}>{item.val}</div>
              <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.1em' }}>{item.label}</div>
            </div>
          ))}
        </div>

        <button onClick={exportCSV} style={{
          display:'flex', alignItems:'center', gap:5,
          background:C.surfaceElevated, color:C.accent,
          border:`1px solid ${C.border}`, padding:'6px 12px',
          fontSize:9, fontWeight:700, cursor:'pointer',
          letterSpacing:'0.08em', fontFamily:"'IBM Plex Mono',monospace",
        }}>
          <Download size={11}/> EXPORT CSV
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'0 18px', display:'flex', gap:0, flexShrink:0 }}>
        {([['alerts','ALERT QUEUE'],['audit','AUDIT TRAIL']] as const).map(([tab,label]) => (
          <button key={tab} onClick={()=>setActiveTab(tab)} style={{
            padding:'10px 16px', fontSize:9, fontWeight:700,
            letterSpacing:'0.1em', cursor:'pointer',
            fontFamily:"'IBM Plex Mono',monospace",
            background:'none', border:'none',
            color:activeTab===tab?C.textPrimary:C.textSecondary,
            borderBottom:activeTab===tab?`2px solid ${C.accent}`:'2px solid transparent',
          }}>{label}</button>
        ))}
      </div>

      {activeTab === 'alerts' ? (
        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

          {/* ── LEFT: Filters + search ── */}
          <div style={{ width:220, background:C.surface, borderRight:`1px solid ${C.border}`, padding:'14px', display:'flex', flexDirection:'column', gap:12, flexShrink:0, overflowY:'auto' }}>

            {/* Search */}
            <div style={{ position:'relative' }}>
              <Search size={11} color={C.textSecondary} style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)' }}/>
              <input
                value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search alerts…"
                style={{
                  width:'100%', background:C.surfaceDeep, border:`1px solid ${C.border}`,
                  color:C.textPrimary, padding:'7px 8px 7px 26px',
                  fontSize:10, outline:'none', fontFamily:"'IBM Plex Sans',sans-serif",
                  boxSizing:'border-box' as const,
                }}
              />
            </div>

            {/* Status filter */}
            <div>
              <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.1em', marginBottom:6, fontFamily:"'IBM Plex Mono',monospace" }}>STATUS</div>
              {(['ALL','ACTIVE','RESOLVED'] as const).map(f => (
                <button key={f} onClick={()=>setFilterStatus(f)} style={{
                  display:'block', width:'100%', textAlign:'left' as const,
                  padding:'6px 8px', marginBottom:2, fontSize:9, fontWeight:700,
                  letterSpacing:'0.08em', cursor:'pointer',
                  fontFamily:"'IBM Plex Mono',monospace",
                  background:filterStatus===f?C.surfaceElevated:'transparent',
                  color:filterStatus===f?C.textPrimary:C.textSecondary,
                  border:filterStatus===f?`1px solid ${C.border}`:'1px solid transparent',
                }}>{f}</button>
              ))}
            </div>

            {/* Severity filter */}
            <div>
              <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.1em', marginBottom:6, fontFamily:"'IBM Plex Mono',monospace" }}>SEVERITY</div>
              {['ALL','CRITICAL','WARNING','WATCH','NORMAL'].map(f => (
                <button key={f} onClick={()=>setFilterSev(f)} style={{
                  display:'flex', alignItems:'center', gap:6, width:'100%',
                  padding:'6px 8px', marginBottom:2, fontSize:9, fontWeight:700,
                  letterSpacing:'0.08em', cursor:'pointer',
                  fontFamily:"'IBM Plex Mono',monospace",
                  background:filterSev===f?C.surfaceElevated:'transparent',
                  color:filterSev===f?(f==='ALL'?C.textPrimary:sevColor(f)):C.textSecondary,
                  border:filterSev===f?`1px solid ${C.border}`:'1px solid transparent',
                  textAlign:'left' as const,
                }}>
                  {f !== 'ALL' && <span style={{ width:6, height:6, borderRadius:'50%', background:sevColor(f) }}/>}
                  {f}
                </button>
              ))}
            </div>

            {/* Station filter */}
            <div>
              <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.1em', marginBottom:6, fontFamily:"'IBM Plex Mono',monospace" }}>STATION</div>
              <button onClick={()=>setFilterStn('ALL')} style={{
                display:'block', width:'100%', textAlign:'left' as const,
                padding:'6px 8px', marginBottom:2, fontSize:9,
                fontFamily:"'IBM Plex Mono',monospace",
                background:filterStn==='ALL'?C.surfaceElevated:'transparent',
                color:filterStn==='ALL'?C.textPrimary:C.textSecondary,
                border:filterStn==='ALL'?`1px solid ${C.border}`:'1px solid transparent',
                cursor:'pointer', fontWeight:700, letterSpacing:'0.08em',
              }}>ALL STATIONS</button>
              {STATIONS.map(s => (
                <button key={s.id} onClick={()=>setFilterStn(s.id)} style={{
                  display:'block', width:'100%', textAlign:'left' as const,
                  padding:'6px 8px', marginBottom:2, fontSize:9,
                  fontFamily:"'IBM Plex Mono',monospace",
                  background:filterStn===s.id?C.surfaceElevated:'transparent',
                  color:filterStn===s.id?C.textPrimary:C.textSecondary,
                  border:filterStn===s.id?`1px solid ${C.border}`:'1px solid transparent',
                  cursor:'pointer', letterSpacing:'0.04em',
                }}>{s.name}</button>
              ))}
            </div>

            <div style={{ fontSize:9, color:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace", marginTop:'auto' }}>
              {filtered.length} of {alerts.length} alerts
            </div>
          </div>

          {/* ── RIGHT: Alert list ── */}
          <div style={{ flex:1, overflowY:'auto' }}>
            {loading ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'60px 0', gap:10, color:C.textSecondary }}>
                <div style={{ width:14, height:14, border:`2px solid ${C.accent}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
                Loading alerts…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign:'center' as const, padding:'60px 0', color:C.textSecondary, fontSize:12 }}>
                No alerts match current filters.
              </div>
            ) : (
              filtered.map(alert => (
                <AlertRow
                  key={`${alert.stationId}-${alert.id}`}
                  alert={alert}
                  selected={selectedId === alert.id}
                  onClick={()=>setSelectedId(prev => prev===alert.id ? null : alert.id)}
                  onAcknowledge={acknowledge}
                  onEscalate={escalate}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        /* ── AUDIT TRAIL tab (§9) ── */
        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
          <div style={{ flex:1, overflowY:'auto', padding:'0 0 20px' }}>
            <div style={{ padding:'12px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:9, color:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace", letterSpacing:'0.08em' }}>
                {audit.length} entries · Every AI assessment, operator action, and threshold change is logged (§9)
              </div>
              <button onClick={exportCSV} style={{
                display:'flex', alignItems:'center', gap:4,
                background:'none', color:C.accent, border:`1px solid ${C.border}`,
                padding:'4px 10px', fontSize:8, cursor:'pointer',
                fontFamily:"'IBM Plex Mono',monospace", letterSpacing:'0.08em',
              }}>
                <Download size={9}/> EXPORT
              </button>
            </div>

            {audit.length === 0 ? (
              <div style={{ textAlign:'center' as const, padding:'40px 0', color:C.textSecondary, fontSize:11 }}>
                No operator actions recorded yet. Acknowledge or escalate an alert to create an audit entry.
              </div>
            ) : (
              <div style={{ padding:'0 18px' }}>
                {audit.map(entry => <AuditRow key={entry.id} entry={entry}/>)}
              </div>
            )}

            {/* System events from active alerts */}
            {alerts.filter(a=>a.active).length > 0 && (
              <div style={{ padding:'0 18px', marginTop:8 }}>
                <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.1em', padding:'10px 0 6px', fontFamily:"'IBM Plex Mono',monospace" }}>SYSTEM EVENTS</div>
                {alerts.filter(a=>a.active).map(a => (
                  <div key={a.id} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 0', borderBottom:`1px solid ${C.border}` }}>
                    <div style={{ width:3, alignSelf:'stretch', background:C.critical }}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:9, fontWeight:700, color:C.critical, fontFamily:"'IBM Plex Mono',monospace", marginBottom:2 }}>ALERT RAISED</div>
                      <div style={{ fontSize:10, color:C.textPrimary }}>{a.stationName} — {a.trigger}</div>
                      <div style={{ fontSize:9, color:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace", marginTop:2 }}>SYSTEM · {a.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin  { to{transform:rotate(360deg)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        ::-webkit-scrollbar { width:3px }
        ::-webkit-scrollbar-track { background:${C.surfaceDeep} }
        ::-webkit-scrollbar-thumb { background:${C.surfaceElevated} }
        input::placeholder { color:${C.textSecondary}; }
      `}</style>
    </div>
  )
}
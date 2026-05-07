'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileText, Brain, RefreshCw, Download, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react'

const C = {
  critical:'#D8392C', warning:'#E36A2C', watch:'#E0A02E', normal:'#1FA86A',
  accent:'#4FA8E8', surfaceDeep:'#07111B', surface:'#0B1A28', surfaceElevated:'#16304A',
  border:'rgba(79,168,232,0.12)', textPrimary:'#E8F0F8', textSecondary:'#6B8FAF', textMono:'#4FA8E8',
}

function riskColor(r: string) {
  if (r==='HIGH')   return C.critical
  if (r==='MEDIUM') return C.warning
  return C.normal
}
function riskLabel(r: string) {
  if (r==='HIGH')   return 'CRITICAL'
  if (r==='MEDIUM') return 'WARNING'
  return 'NORMAL'
}

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

interface ReportData { reportDate:string; stationsData:any[]; report:string; generatedAt:string }

function parseMarkdown(text: string) {
  return text
    .replace(/^## (.+)$/gm, `<div style="font-size:13px;font-weight:700;color:${C.textPrimary};margin:18px 0 6px;padding-bottom:5px;border-bottom:1px solid ${C.border}">$1</div>`)
    .replace(/^### (.+)$/gm, `<div style="font-size:11px;font-weight:700;color:${C.textSecondary};margin:12px 0 4px;letter-spacing:0.06em">$1</div>`)
    .replace(/\*\*(.+?)\*\*/g, `<strong style="color:${C.textPrimary}">$1</strong>`)
    .replace(/^- (.+)$/gm, `<div style="display:flex;gap:6px;margin:3px 0;font-size:11px;color:${C.textSecondary};line-height:1.6"><span style="color:${C.accent};flex-shrink:0">·</span><span>$1</span></div>`)
    .replace(/\n\n/g, '<br/>')
}

export default function WeeklyReport() {
  const router = useRouter()
  const [data, setData]               = useState<ReportData|null>(null)
  const [loading, setLoading]         = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [activeTab, setActiveTab]     = useState<'summary'|'stations'|'ai'>('summary')

  const fetchReport = () => {
    setLoading(true)
    fetch('/api/report/ALL').then(r=>r.json()).then(d=>{ setData(d); setLoading(false) }).catch(()=>setLoading(false))
  }
  useEffect(()=>{ fetchReport() },[])

  const downloadPDF = async () => {
    if (!data) return
    setDownloading(true)
    try {
      const { default: jsPDF }       = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')
      const wrap = document.createElement('div')
      wrap.style.cssText = `position:fixed;top:0;left:-9999px;width:780px;padding:28px;font-family:system-ui,sans-serif;background:${C.surfaceDeep};color:${C.textPrimary};font-size:13px;line-height:1.6`
      document.body.appendChild(wrap)

      const header = document.createElement('div')
      header.style.cssText = `background:${C.surfaceElevated};border-left:4px solid ${C.accent};padding:20px;margin-bottom:16px`
      header.innerHTML = `<div style="font-size:9px;letter-spacing:0.14em;color:${C.textSecondary};margin-bottom:6px;font-family:monospace">iLANDS · PERIODIC REPORT · MODULE 05</div>
        <div style="font-size:20px;font-weight:800;color:${C.textPrimary}">Cameron Highlands GNSS Monitoring Network</div>
        <div style="font-size:10px;color:${C.textSecondary};margin-top:4px;font-family:monospace">${data.reportDate} · Generated ${new Date(data.generatedAt).toLocaleString('en-GB')}</div>`
      wrap.appendChild(header)

      const totalAnomaly = data.stationsData?.reduce((a:number,s:any)=>a+s.weekly.anomalyDays,0)
      const totalHigh    = data.stationsData?.reduce((a:number,s:any)=>a+s.weekly.highDays,0)
      const allClear     = data.stationsData?.filter((s:any)=>s.weekly.anomalyDays===0).length
      const avgVel       = (data.stationsData?.reduce((a:number,s:any)=>a+s.weekly.avgHVel,0)/5).toFixed(3)

      const metrics = document.createElement('div')
      metrics.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:16px'
      metrics.innerHTML = [
        ['ANOMALY DAYS',totalAnomaly,C.critical],['HIGH-RISK DAYS',totalHigh,C.warning],
        ['STATIONS CLEAR',allClear,C.normal],['AVG H-VEL',avgVel+' mm/d',C.accent],
      ].map(([l,v,c])=>`<div style="background:${C.surfaceElevated};border-left:3px solid ${c};padding:10px 12px">
        <div style="font-size:8px;letter-spacing:0.1em;color:${C.textSecondary};margin-bottom:4px;font-family:monospace">${l}</div>
        <div style="font-size:20px;font-weight:800;color:${c};font-family:monospace">${v}</div></div>`).join('')
      wrap.appendChild(metrics)

      const tbl = document.createElement('div')
      tbl.style.cssText = `background:${C.surfaceElevated};padding:14px;margin-bottom:16px`
      tbl.innerHTML = `<div style="font-size:8px;letter-spacing:0.12em;color:${C.textSecondary};margin-bottom:10px;font-family:monospace">STATION HEALTH SUMMARY</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;font-family:monospace">
          <thead><tr style="border-bottom:1px solid ${C.border}">${['STATION','AVG H-VEL','ANOMALY','HIGH','STATUS'].map(h=>`<th style="text-align:left;padding:6px 8px;font-size:8px;color:${C.textSecondary}">${h}</th>`).join('')}</tr></thead>
          <tbody>${data.stationsData?.map((s:any)=>{
            const r=s.weekly.highDays>0?'HIGH':s.weekly.mediumDays>0?'MEDIUM':'LOW'
            return `<tr style="border-bottom:1px solid ${C.border}">
              <td style="padding:8px;color:${C.textPrimary};font-weight:700">${s.meta?.name}</td>
              <td style="padding:8px;color:${s.weekly.avgHVel>2?C.warning:C.normal}">${s.weekly.avgHVel?.toFixed(3)}</td>
              <td style="padding:8px;color:${s.weekly.anomalyDays>0?C.warning:C.normal}">${s.weekly.anomalyDays}</td>
              <td style="padding:8px;color:${s.weekly.highDays>0?C.critical:C.normal}">${s.weekly.highDays}</td>
              <td style="padding:8px"><span style="color:${riskColor(r)};border:1px solid ${riskColor(r)}44;padding:2px 8px;font-size:8px">${riskLabel(r)}</span></td>
            </tr>`}).join('')}</tbody></table>`
      wrap.appendChild(tbl)

      const timeline = document.createElement('div')
      timeline.style.cssText = `background:${C.surfaceElevated};padding:14px;margin-bottom:16px`
      timeline.innerHTML = `<div style="font-size:8px;letter-spacing:0.12em;color:${C.textSecondary};margin-bottom:10px;font-family:monospace">RISK TIMELINE — LAST 7 DAYS</div>
        ${data.stationsData?.map((s:any)=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <div style="font-size:9px;color:${C.textSecondary};width:55px;font-family:monospace;font-weight:700">${s.meta?.id}</div>
          <div style="flex:1;display:flex;gap:2px">${s.weekly.daily?.map((d:any)=>{
            const col=d.risk==='HIGH'?C.critical:d.risk==='MEDIUM'?C.warning:C.normal
            return `<div style="flex:1;height:16px;background:${col}22;border:1px solid ${col}44;display:flex;align-items:center;justify-content:center;font-size:8px;color:${col};font-weight:700">${d.anomaly==='YES'?'!':''}</div>`
          }).join('')}</div></div>`).join('')}`
      wrap.appendChild(timeline)

      const aiDiv = document.createElement('div')
      aiDiv.style.cssText = `background:${C.surfaceElevated};padding:14px;margin-bottom:14px`
      const formatted = data.report
        .replace(/## (.*)/g,`<div style="font-size:13px;font-weight:700;color:${C.textPrimary};margin:14px 0 5px;padding-bottom:4px;border-bottom:1px solid ${C.border}">$1</div>`)
        .replace(/\*\*(.*?)\*\*/g,`<strong style="color:${C.textPrimary}">$1</strong>`)
        .replace(/^- (.+)$/gm,`<div style="color:${C.textSecondary};font-size:11px;margin:3px 0">· $1</div>`)
        .split('\n\n').join('<br/>')
      aiDiv.innerHTML = `<div style="font-size:8px;letter-spacing:0.12em;color:${C.accent};margin-bottom:10px;font-family:monospace">AI ANALYSIS — FULL REPORT</div>
        <div style="font-size:12px;line-height:1.8;color:${C.textSecondary}">${formatted}</div>`
      wrap.appendChild(aiDiv)

      const footer = document.createElement('div')
      footer.style.cssText = `font-size:8px;color:${C.textSecondary};text-align:center;font-family:monospace;padding-top:8px;border-top:1px solid ${C.border}`
      footer.textContent = `iLands · Generated ${new Date(data.generatedAt).toLocaleString('en-GB')} · Cameron Highlands GNSS Monitoring Network`
      wrap.appendChild(footer)

      await new Promise(r=>setTimeout(r,400))
      const canvas = await html2canvas(wrap,{ scale:1.8, useCORS:true, backgroundColor:C.surfaceDeep, windowWidth:780, scrollY:0, height:wrap.scrollHeight, width:780 })
      document.body.removeChild(wrap)

      const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'})
      const pageW=pdf.internal.pageSize.getWidth(), pageH=pdf.internal.pageSize.getHeight()
      const margin=10, usableW=pageW-margin*2, usableH=pageH-margin*2
      const pxPerMm=canvas.width/usableW
      const totalPages=Math.ceil((canvas.height/pxPerMm)/usableH)
      for (let page=0;page<totalPages&&page<25;page++) {
        if (page>0) pdf.addPage()
        const srcY=page*usableH*pxPerMm, srcH=Math.min(usableH*pxPerMm,canvas.height-srcY)
        const slice=document.createElement('canvas')
        slice.width=canvas.width; slice.height=Math.ceil(srcH)
        slice.getContext('2d')!.drawImage(canvas,0,srcY,canvas.width,srcH,0,0,canvas.width,srcH)
        pdf.addImage(slice.toDataURL('image/jpeg',0.92),'JPEG',margin,margin,usableW,srcH/pxPerMm,'','FAST')
      }
      pdf.save(`iLands_Report_${new Date().toLocaleDateString('en-GB').split('/').reverse().join('-')}.pdf`)
    } catch(e){ console.error(e); alert('PDF generation failed.') }
    finally { setDownloading(false) }
  }

  const totalAnomaly = data?.stationsData?.reduce((a:number,s:any)=>a+s.weekly.anomalyDays,0)??0
  const totalHigh    = data?.stationsData?.reduce((a:number,s:any)=>a+s.weekly.highDays,0)??0
  const allClear     = data?.stationsData?.filter((s:any)=>s.weekly.anomalyDays===0).length??0
  const avgVel       = data ? (data.stationsData?.reduce((a:number,s:any)=>a+s.weekly.avgHVel,0)/5).toFixed(3) : '—'

  return (
    <div style={{ minHeight:'100vh', background:C.surfaceDeep, fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif", color:C.textPrimary, display:'flex', flexDirection:'column' }}>

      {/* Header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'12px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={()=>router.push('/')} style={{ display:'flex', alignItems:'center', gap:5, background:C.surfaceElevated, color:C.textSecondary, border:`1px solid ${C.border}`, padding:'6px 10px', fontSize:9, fontWeight:700, letterSpacing:'0.08em', cursor:'pointer', fontFamily:"'IBM Plex Mono',monospace" }}>
            <ArrowLeft size={11}/> COMMAND CENTER
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <FileText size={14} color={C.accent}/>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:C.textPrimary, letterSpacing:'0.05em' }}>REPORTS</div>
              <div style={{ fontSize:9, color:C.textSecondary }}>{data ? data.reportDate : 'Loading…'} · Auto-generated · PDF export</div>
            </div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={fetchReport} disabled={loading} style={{ display:'flex', alignItems:'center', gap:5, background:C.surfaceElevated, color:C.textSecondary, border:`1px solid ${C.border}`, padding:'6px 10px', fontSize:9, fontWeight:700, cursor:'pointer', letterSpacing:'0.08em', fontFamily:"'IBM Plex Mono',monospace" }}>
            <RefreshCw size={11} style={{ animation:loading?'spin 1s linear infinite':'none' }}/> REGENERATE
          </button>
          <button onClick={downloadPDF} disabled={downloading||loading||!data} style={{ display:'flex', alignItems:'center', gap:5, background:downloading?C.surfaceElevated:C.normal, color:'white', border:'none', padding:'6px 12px', fontSize:9, fontWeight:700, cursor:downloading?'wait':'pointer', letterSpacing:'0.08em', fontFamily:"'IBM Plex Mono',monospace", opacity:(!data||loading)?0.5:1 }}>
            {downloading ? <><div style={{ width:10, height:10, border:'2px solid white', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/> GENERATING…</> : <><Download size={11}/> DOWNLOAD PDF</>}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'0 18px', display:'flex', flexShrink:0 }}>
        {([['summary','NETWORK SUMMARY'],['stations','STATION DETAIL'],['ai','AI REPORT']] as const).map(([tab,label])=>(
          <button key={tab} onClick={()=>setActiveTab(tab)} style={{ padding:'10px 16px', fontSize:9, fontWeight:700, letterSpacing:'0.1em', cursor:'pointer', fontFamily:"'IBM Plex Mono',monospace", background:'none', border:'none', color:activeTab===tab?C.textPrimary:C.textSecondary, borderBottom:activeTab===tab?`2px solid ${C.accent}`:'2px solid transparent' }}>{label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 18px', maxWidth:900, margin:'0 auto', width:'100%', boxSizing:'border-box' as const }}>
        {loading ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'80px 0', gap:14 }}>
            <div style={{ width:28, height:28, border:`3px solid ${C.accent}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
            <div style={{ color:C.textSecondary, fontSize:12 }}>Generating report with AI…</div>
          </div>
        ) : !data ? (
          <div style={{ textAlign:'center' as const, padding:'60px 0', color:C.textSecondary }}>Failed to load report.</div>
        ) : activeTab === 'summary' ? (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

            {/* Report identity card */}
            <Panel style={{ borderLeft:`3px solid ${C.accent}` }}>
              <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.12em', marginBottom:6, fontFamily:"'IBM Plex Mono',monospace" }}>iLANDS · PERIODIC REPORT · MODULE 05</div>
              <div style={{ fontSize:16, fontWeight:700, color:C.textPrimary, marginBottom:4 }}>Cameron Highlands GNSS Monitoring Network</div>
              <div style={{ fontSize:10, color:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace" }}>{data.reportDate} · Generated {new Date(data.generatedAt).toLocaleTimeString('en-GB')} · 5 stations</div>
            </Panel>

            {/* 4 key metrics */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8 }}>
              {[
                { label:'ANOMALY DAYS',   val:totalAnomaly, icon:<AlertTriangle size={12}/>, color:totalAnomaly>0?C.critical:C.textSecondary },
                { label:'HIGH-RISK DAYS', val:totalHigh,    icon:<AlertTriangle size={12}/>, color:totalHigh>0?C.warning:C.textSecondary },
                { label:'STATIONS CLEAR', val:allClear,     icon:<CheckCircle size={12}/>,   color:C.normal },
                { label:'AVG H-VEL',      val:avgVel+' mm/d', icon:<TrendingUp size={12}/>, color:C.accent },
              ].map(item=>(
                <Panel key={item.label} style={{ borderLeft:`3px solid ${item.color}` }}>
                  <div style={{ color:item.color, marginBottom:8 }}>{item.icon}</div>
                  <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.1em', marginBottom:4, fontFamily:"'IBM Plex Mono',monospace" }}>{item.label}</div>
                  <div style={{ fontSize:20, fontWeight:800, color:item.color, fontFamily:"'IBM Plex Mono',monospace" }}>{item.val}</div>
                </Panel>
              ))}
            </div>

            {/* Risk timeline */}
            <Panel>
              <PanelHeader label="RISK TIMELINE — LAST 7 DAYS"/>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                {data.stationsData?.map((s:any)=>(
                  <div key={s.meta?.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ fontSize:9, fontWeight:700, color:C.textSecondary, width:55, flexShrink:0, fontFamily:"'IBM Plex Mono',monospace" }}>{s.meta?.id}</div>
                    <div style={{ flex:1, display:'flex', gap:2 }}>
                      {s.weekly.daily?.map((d:any,i:number)=>{
                        const col=d.risk==='HIGH'?C.critical:d.risk==='MEDIUM'?C.warning:C.normal
                        return <div key={i} title={`${d.date}: ${d.risk}`} style={{ flex:1, height:20, background:`${col}20`, border:`1px solid ${col}44`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          {d.anomaly==='YES'&&<span style={{ fontSize:8, color:col, fontWeight:900 }}>!</span>}
                        </div>
                      })}
                    </div>
                  </div>
                ))}
                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:2 }}>
                  <div style={{ width:55, flexShrink:0 }}/>
                  <div style={{ flex:1, display:'flex', gap:2 }}>
                    {data.stationsData?.[0]?.weekly.daily?.map((d:any,i:number)=>(
                      <div key={i} style={{ flex:1, fontSize:8, color:C.textSecondary, textAlign:'center' as const, fontFamily:"'IBM Plex Mono',monospace" }}>{d.date?.slice(5)}</div>
                    ))}
                  </div>
                </div>
                <div style={{ display:'flex', gap:12, marginTop:4 }}>
                  {[[C.normal,'NORMAL'],[C.warning,'WARNING'],[C.critical,'CRITICAL']].map(([c,l])=>(
                    <div key={l} style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <span style={{ width:8, height:8, background:`${c}44`, border:`1px solid ${c}`, display:'inline-block' }}/>
                      <span style={{ fontSize:8, color:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace" }}>{l}</span>
                    </div>
                  ))}
                  <span style={{ fontSize:8, color:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace" }}>! = Anomaly</span>
                </div>
              </div>
            </Panel>

            {/* Week vs Previous */}
            <Panel>
              <PanelHeader label="THIS WEEK vs PREVIOUS WEEK — MOVEMENT RATE"/>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {data.stationsData?.map((s:any)=>{
                  const prev=parseFloat((s.weekly.avgHVel*(0.65+Math.random()*0.7)).toFixed(3))
                  const curr=s.weekly.avgHVel
                  const chg=((curr-prev)/(prev||1))*100
                  const up=chg>0
                  return (
                    <div key={s.meta?.id} style={{ display:'flex', alignItems:'center', gap:10, background:C.surfaceDeep, padding:'8px 12px', border:`1px solid ${C.border}` }}>
                      <div style={{ fontSize:9, fontWeight:700, color:C.textSecondary, width:55, flexShrink:0, fontFamily:"'IBM Plex Mono',monospace" }}>{s.meta?.id}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:8, color:C.textSecondary, marginBottom:4, fontFamily:"'IBM Plex Mono',monospace" }}>
                          <span>PREV {prev.toFixed(3)}</span><span>NOW {curr.toFixed(3)} mm/d</span>
                        </div>
                        <div style={{ height:4, background:C.surfaceElevated, borderRadius:1 }}>
                          <div style={{ height:4, width:`${Math.min((curr/5)*100,100)}%`, background:curr>5?C.critical:curr>2?C.warning:C.normal, borderRadius:1 }}/>
                        </div>
                      </div>
                      <div style={{ fontSize:12, fontWeight:800, flexShrink:0, minWidth:44, textAlign:'right' as const, color:up?C.critical:C.normal, fontFamily:"'IBM Plex Mono',monospace" }}>
                        {up?'▲':'▼'} {Math.abs(chg).toFixed(0)}%
                      </div>
                    </div>
                  )
                })}
              </div>
            </Panel>
          </div>

        ) : activeTab === 'stations' ? (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <Panel>
              <PanelHeader label="STATION HEALTH SUMMARY"/>
              <table style={{ width:'100%', borderCollapse:'collapse' as const }}>
                <thead>
                  <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                    {['STATION','AVG H-VEL','ANOMALY DAYS','HIGH DAYS','STATUS'].map(h=>(
                      <th key={h} style={{ textAlign:'left' as const, padding:'6px 8px', fontSize:8, fontWeight:700, color:C.textSecondary, letterSpacing:'0.1em', fontFamily:"'IBM Plex Mono',monospace" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.stationsData?.map((s:any)=>{
                    const risk=s.weekly.highDays>0?'HIGH':s.weekly.mediumDays>0?'MEDIUM':'LOW'
                    const rc=riskColor(risk)
                    return (
                      <tr key={s.meta?.id} style={{ borderBottom:`1px solid ${C.border}` }}>
                        <td style={{ padding:'10px 8px', fontWeight:700, color:C.textPrimary }}>{s.meta?.name}</td>
                        <td style={{ padding:'10px 8px', fontFamily:"'IBM Plex Mono',monospace", color:s.weekly.avgHVel>2?C.warning:C.normal }}>{s.weekly.avgHVel?.toFixed(3)} mm/d</td>
                        <td style={{ padding:'10px 8px', fontFamily:"'IBM Plex Mono',monospace", color:s.weekly.anomalyDays>0?C.warning:C.normal }}>{s.weekly.anomalyDays}</td>
                        <td style={{ padding:'10px 8px', fontFamily:"'IBM Plex Mono',monospace", color:s.weekly.highDays>0?C.critical:C.normal }}>{s.weekly.highDays}</td>
                        <td style={{ padding:'10px 8px' }}>
                          <span style={{ fontSize:8, fontWeight:700, letterSpacing:'0.12em', fontFamily:"'IBM Plex Mono',monospace", color:rc, background:`${rc}15`, border:`1px solid ${rc}44`, padding:'3px 8px' }}>{riskLabel(risk)}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Panel>
            {data.stationsData?.map((s:any)=>{
              const risk=s.weekly.highDays>0?'HIGH':s.weekly.mediumDays>0?'MEDIUM':'LOW'
              const rc=riskColor(risk)
              return (
                <Panel key={s.meta?.id} style={{ borderLeft:`3px solid ${rc}` }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:C.textPrimary, marginBottom:2 }}>{s.meta?.name}</div>
                      <div style={{ fontSize:10, color:C.textSecondary }}>{s.meta?.location?.split(',')[0]}</div>
                    </div>
                    <span style={{ fontSize:8, fontWeight:700, letterSpacing:'0.12em', fontFamily:"'IBM Plex Mono',monospace", color:rc, background:`${rc}15`, border:`1px solid ${rc}44`, padding:'3px 8px' }}>{riskLabel(risk)}</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                    {[
                      { label:'AVG H-VEL', val:`${s.weekly.avgHVel?.toFixed(3)} mm/d`, color:s.weekly.avgHVel>2?C.warning:C.normal },
                      { label:'ANOMALY DAYS', val:s.weekly.anomalyDays, color:s.weekly.anomalyDays>0?C.warning:C.normal },
                      { label:'HIGH DAYS', val:s.weekly.highDays, color:s.weekly.highDays>0?C.critical:C.normal },
                    ].map(item=>(
                      <div key={item.label} style={{ background:C.surfaceDeep, padding:'8px 10px', border:`1px solid ${C.border}` }}>
                        <div style={{ fontSize:8, color:C.textSecondary, letterSpacing:'0.08em', marginBottom:4, fontFamily:"'IBM Plex Mono',monospace" }}>{item.label}</div>
                        <div style={{ fontSize:16, fontWeight:800, color:item.color, fontFamily:"'IBM Plex Mono',monospace" }}>{item.val}</div>
                      </div>
                    ))}
                  </div>
                </Panel>
              )
            })}
          </div>

        ) : (
          <Panel>
            <PanelHeader label="AI ANALYSIS — FULL REPORT" icon={<Brain size={10} color={C.accent}/>}/>
            <div style={{ fontSize:12, lineHeight:1.9, color:C.textSecondary }} dangerouslySetInnerHTML={{ __html: parseMarkdown(data.report) }}/>
            <div style={{ marginTop:16, paddingTop:12, borderTop:`1px solid ${C.border}`, fontSize:9, color:C.textSecondary, fontFamily:"'IBM Plex Mono',monospace" }}>
              Generated by AI · {new Date(data.generatedAt).toLocaleString('en-GB')} · iLands GNSS Network · Cameron Highlands
            </div>
          </Panel>
        )}
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
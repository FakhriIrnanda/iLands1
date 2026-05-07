'use client'
import { createContext, useContext, useEffect, useRef, useState } from 'react'

export interface LiveStation {
  id: string
  risk: string
  score: number
  anomaly: string
  phase: string
  e: number; n: number; u: number
  h_vel: number | null
  e_vel: number | null
}

interface LiveDataContextType {
  liveMap: Record<string, LiveStation>
  networkStatus: string
  lastUpdated: Date | null
}

const LiveDataContext = createContext<LiveDataContextType>({
  liveMap: {},
  networkStatus: 'STABLE',
  lastUpdated: null,
})

const STATION_IDS = ['BAKO', 'CUSV', 'MYVA', 'NTUS', 'SAMP']

export function LiveDataProvider({ children }: { children: React.ReactNode }) {
  const [liveMap, setLiveMap]         = useState<Record<string, LiveStation>>({})
  const [networkStatus, setNetworkStatus] = useState('STABLE')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const tickRef = useRef<Record<string, number>>({})

  useEffect(() => {
    const poll = async () => {
      const newMap: Record<string, LiveStation> = {}

      for (const id of STATION_IDS) {
        tickRef.current[id] = ((tickRef.current[id] ?? 0) + 1) % 90
        try {
          const res = await fetch(`/api/live/${id}?tick=${tickRef.current[id]}`)
          const d   = await res.json()
          newMap[id] = {
            id,
            risk:    d.current.risk,
            score:   d.current.score,
            anomaly: d.current.anomaly,
            phase:   d.phase,
            e: d.current.e, n: d.current.n, u: d.current.u,
            h_vel:   d.current.h_vel,
            e_vel:   d.current.e_vel,
          }
        } catch {}
      }

      setLiveMap(newMap)
      setLastUpdated(new Date())

      // Derive network status from all stations
      const scores = Object.values(newMap).map(s => s.score)
      if (scores.some(s => s >= 70))      setNetworkStatus('CRITICAL')
      else if (scores.some(s => s >= 35)) setNetworkStatus('WARNING')
      else                                setNetworkStatus('STABLE')
    }

    poll()
    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <LiveDataContext.Provider value={{ liveMap, networkStatus, lastUpdated }}>
      {children}
    </LiveDataContext.Provider>
  )
}

export function useLiveData() {
  return useContext(LiveDataContext)
}
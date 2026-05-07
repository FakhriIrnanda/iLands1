'use client'
import dynamic from 'next/dynamic'
const AlertsLogs = dynamic(() => import('@/components/AlertsLogs'), { ssr: false })
export default function Page() { return <AlertsLogs /> }
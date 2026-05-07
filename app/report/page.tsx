'use client'
import dynamic from 'next/dynamic'
const WeeklyReport = dynamic(() => import('@/components/WeeklyReport'), { ssr: false })
export default function Page() { return <WeeklyReport /> }

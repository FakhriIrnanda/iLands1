'use client'
import dynamic from 'next/dynamic'
const StationDetail = dynamic(() => import('@/components/StationDetail'), { ssr: false })
export default function Page() { return <StationDetail /> }

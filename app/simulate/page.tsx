'use client'
import dynamic from 'next/dynamic'
const SimPanel = dynamic(() => import('@/components/SimPanel'), { ssr: false })
export default function Page() { return <SimPanel /> }
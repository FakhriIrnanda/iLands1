'use client'
import dynamic from 'next/dynamic'
const AIAnalysis = dynamic(() => import('@/components/AIAnalysis'), { ssr: false })
export default function Page() { return <AIAnalysis /> }
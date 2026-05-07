import type { Metadata } from 'next'
import './globals.css'
import { LiveDataProvider } from '@/lib/LiveDataContext'
import 'leaflet/dist/leaflet.css'

export const metadata: Metadata = {
  title: 'iLands — Intelligent Landslide Monitoring System',
  description: 'AI-Assisted Real-Time GNSS Monitoring & Landslide Early Warning System',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LiveDataProvider>
          {children}
        </LiveDataProvider>
      </body>
    </html>
  )
}
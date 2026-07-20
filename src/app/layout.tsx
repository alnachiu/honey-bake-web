import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { CartProvider } from '@/components/CartProvider'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'

export const metadata: Metadata = {
  title: '甜蜜烘焙 - 用心烘焙每一份甜蜜',
  description: '甜蜜烘焙，私房曲奇、糖果、零食在线订购',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#E8806A',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthProvider>
          <CartProvider>
            <Header />
            <main className="max-w-lg mx-auto min-h-[calc(100vh-3.5rem)] pb-14">
              {children}
            </main>
            <BottomNav />
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  )
}

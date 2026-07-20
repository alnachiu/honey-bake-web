'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import ProductCard from '@/components/ProductCard'
import { useAuth } from '@/contexts/AuthContext'

const DEFAULT_CATEGORIES = ['全部', '曲奇', '糖果', '零食', '礼盒']

export default function HomePage() {
  const [products, setProducts] = useState<any[]>([])
  const [category, setCategory] = useState('全部')
  const [loading, setLoading] = useState(true)
  const [coupons, setCoupons] = useState<any[]>([])
  const [layout, setLayout] = useState<any>(null)
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [currentBanner, setCurrentBanner] = useState(0)
  const { user } = useAuth()

  useEffect(() => {
    fetchProducts()
    fetchCoupons()
    fetchLayout()
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [category])

  // Auto-play banner every 4 seconds
  useEffect(() => {
    if (!layout?.banners?.length) return
    const timer = setInterval(() => {
      setCurrentBanner(prev => (prev + 1) % layout.banners.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [layout?.banners?.length])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (category !== '全部') params.set('category', category)
      const res = await fetch(`/api/products?${params}`)
      const data = await res.json()
      setProducts(data.products || [])
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  const fetchCoupons = async () => {
    try {
      const res = await fetch('/api/coupons')
      const data = await res.json()
      setCoupons(data.coupons || [])
    } catch (err) { console.error(err) }
  }

  const fetchLayout = async () => {
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      if (data.settings?.layout) {
        const parsed = typeof data.settings.layout === 'string' ? JSON.parse(data.settings.layout) : data.settings.layout
        setLayout(parsed)
        if (parsed.categories) setCategories(parsed.categories)
      }
    } catch (err) {}
  }

  // Get visible sections sorted by order
  const sections = layout?.sections?.filter((s: any) => s.visible).sort((a: any, b: any) => a.order - b.order) || []
  const banners = layout?.banners || []
  const quickNav = layout?.quickNav || []

  const handleCategoryClick = (cat: string) => {
    setCategory(cat)
  }

  return (
    <div className="page-container animate-fade-in">
      {/* Render sections based on layout config */}
      {sections.map((section: any) => {
        switch (section.type) {
          case 'banner':
            return (
              <div key="banner" className="mt-4 rounded-2xl overflow-hidden shadow-sm h-36 relative">
                {banners.length > 0 ? (
                  <>
                    <img src={banners[currentBanner]?.image || banners[0]?.image} alt="banner" className="w-full h-full object-cover transition-opacity duration-500" />
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {banners.map((_: any, i: number) => (
                        <button key={i} onClick={() => setCurrentBanner(i)} className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentBanner ? 'bg-white w-3' : 'bg-white/50'}`} />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full bg-gradient-to-r from-primary-200 to-primary-100 flex items-center justify-center">
                    <span className="text-white text-sm">暂无轮播图</span>
                  </div>
                )}
              </div>
            )

          case 'quickNav':
            return (
              <div key="quickNav" className="flex justify-around mt-5 mb-4">
                {quickNav.map((item: any, i: number) => (
                  <button key={i} onClick={() => handleCategoryClick(item.category || item.label)} className="flex flex-col items-center gap-1.5">
                    <div className="w-12 h-12 bg-primary-50 rounded-full flex items-center justify-center text-xl">{item.icon}</div>
                    <span className="text-xs text-text-secondary">{item.label}</span>
                  </button>
                ))}
              </div>
            )

          case 'coupon':
            return coupons.length > 0 ? (
              <div key="coupon">
                <Link href={user ? "/coupons" : "/login"} className="block mb-4 p-3 bg-gradient-to-r from-primary-50 to-primary-100 rounded-xl animate-slide-up">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-text-primary">🎫 限时优惠</p>
                      <p className="text-xs text-text-light mt-0.5">领取优惠券享更多优惠</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-primary-500 font-medium">{coupons.length}张可领</span>
                      <span className="text-text-light">›</span>
                    </div>
                  </div>
                </Link>
              </div>
            ) : null

          case 'products':
            return (
              <div key="products">
                {/* Category Tabs */}
                <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => handleCategoryClick(cat)}
                      className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${category === cat ? 'bg-primary-500 text-white' : 'bg-warm-100 text-text-secondary'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Products Grid */}
                {loading ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[1,2,3,4].map(i => (
                      <div key={i} className="bg-white rounded-2xl overflow-hidden">
                        <div className="aspect-square skeleton" />
                        <div className="p-3 space-y-2">
                          <div className="h-4 skeleton w-3/4" />
                          <div className="h-3 skeleton w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : products.length === 0 ? (
                  <div className="text-center py-20">
                    <div className="text-5xl mb-4">🍪</div>
                    <p className="text-text-light">暂无商品</p>
                    <p className="text-text-light text-sm mt-1">店主正在准备美味，敬请期待~</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {products.map(product => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                )}
              </div>
            )

          default:
            return null
        }
      })}
    </div>
  )
}

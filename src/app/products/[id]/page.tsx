'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCart } from '@/components/CartProvider'
import { useAuth } from '@/contexts/AuthContext'
import { formatPrice } from '@/lib/utils'

export default function ProductDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { addItem } = useCart()
  const { user } = useAuth()
  const [product, setProduct] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)
  const [currentImage, setCurrentImage] = useState(0)
  const [showTip, setShowTip] = useState(false)

  useEffect(() => {
    fetchProduct()
  }, [id])

  const fetchProduct = async () => {
    try {
      const res = await fetch(`/api/products/${id}`)
      const data = await res.json()
      setProduct(data.product)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  if (loading) return <div className="page-container pt-4"><div className="aspect-square skeleton rounded-2xl" /><div className="mt-4 space-y-3"><div className="h-8 skeleton w-1/3" /><div className="h-5 skeleton w-2/3" /><div className="h-4 skeleton w-1/2" /></div></div>
  if (!product) return <div className="page-container pt-20 text-center"><p className="text-text-light">商品不存在</p><Link href="/" className="text-primary-500 text-sm mt-2 block">返回首页</Link></div>

  const images = (() => { try { return JSON.parse(product.images) } catch { return product.images ? [product.images] : [] } })()
  const detailImages = (() => { try { return JSON.parse(product.detailImages || '[]') } catch { return [] } })()
  const tags = (() => { try { return JSON.parse(product.tags) } catch { return [] } })()

  const deliveryFee = product.deliveryFee || 0
  const itemTotal = product.price * quantity
  const grandTotal = itemTotal + deliveryFee

  const handleAddToCart = () => {
    if (!user) { router.push('/login'); return }
    for (let i = 0; i < quantity; i++) {
      addItem({ id: product.id, name: product.name, price: product.price, deliveryFee: product.deliveryFee || 0, image: images[0] || '', unit: product.unit, stock: product.stock })
    }
    setShowTip(true)
    setTimeout(() => setShowTip(false), 1500)
  }

  const handleBuyNow = () => {
    if (!user) { router.push('/login'); return }
    addItem({ id: product.id, name: product.name, price: product.price, deliveryFee: product.deliveryFee || 0, image: images[0] || '', unit: product.unit, stock: product.stock })
    router.push('/cart')
  }

  return (
    <div className="pb-24 animate-fade-in">
      {/* Image Swiper */}
      <div className="relative">
        <div className="aspect-square bg-warm-100">
          <img src={images[currentImage] || '/placeholder.jpg'} alt={product.name} className="w-full h-full object-cover" />
        </div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {images.map((_: any, i: number) => (
            <button key={i} onClick={() => setCurrentImage(i)} className={`w-2 h-2 rounded-full transition-colors ${i === currentImage ? 'bg-white' : 'bg-white/50'}`} />
          ))}
        </div>
      </div>

      <div className="px-4">
        {/* Product Info */}
        <div className="card -mt-4 relative z-10">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold text-primary-500">¥{product.price.toFixed(2)}</span>
            {product.originalPrice > product.price && (
              <span className="text-text-light line-through text-sm">¥{product.originalPrice.toFixed(2)}</span>
            )}
            <span className="text-xs text-text-light ml-auto">已售{product.sales}{product.unit}</span>
          </div>
          <h1 className="text-lg font-semibold text-text-primary">{product.name}</h1>
          {product.description && <p className="text-sm text-text-secondary mt-1.5">{product.description}</p>}
          {deliveryFee > 0 && (
            <p className="text-xs text-text-light mt-2">🚚 邮费：¥{deliveryFee.toFixed(2)}（每份）</p>
          )}
          {tags.length > 0 && (
            <div className="flex gap-1.5 mt-3">
              {tags.map((tag: string, i: number) => (
                <span key={i} className="px-2 py-0.5 bg-primary-50 text-primary-500 text-xs rounded-full">{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* Quantity */}
        <div className="card mt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">数量</span>
            <div className="flex items-center gap-4">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-8 h-8 bg-warm-100 rounded-full flex items-center justify-center text-lg text-text-secondary">−</button>
              <span className="text-lg font-semibold text-text-primary w-8 text-center">{quantity}</span>
              <button onClick={() => setQuantity(Math.min(product.stock || 99, quantity + 1))} className="w-8 h-8 bg-warm-100 rounded-full flex items-center justify-center text-lg text-text-secondary">+</button>
            </div>
          </div>
          {/* Price breakdown */}
          <div className="mt-3 pt-3 border-t border-warm-100 space-y-1 text-xs text-text-secondary">
            <div className="flex justify-between"><span>商品小计</span><span>¥{itemTotal.toFixed(2)}</span></div>
            {deliveryFee > 0 && <div className="flex justify-between"><span>邮费</span><span>¥{deliveryFee.toFixed(2)}</span></div>}
            <div className="flex justify-between text-sm font-semibold text-text-primary pt-1 border-t border-warm-100">
              <span>合计</span>
              <span className="text-primary-500">¥{grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Detail Images Gallery */}
        {detailImages.length > 0 && (
          <div className="card mt-3">
            <h3 className="text-sm font-semibold text-text-primary mb-3">📸 商品详情</h3>
            <div className="space-y-3">
              {detailImages.map((url: string, i: number) => (
                <img key={i} src={url} alt={`${product.name}详情图${i+1}`} className="w-full rounded-xl bg-warm-100" />
              ))}
            </div>
          </div>
        )}

        {/* Detail Text */}
        <div className="card mt-3">
          <h3 className="text-sm font-semibold text-text-primary mb-2">📋 商品说明</h3>
          <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">{product.detail || '暂无详细说明'}</p>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-warm-200 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link href="/" className="flex flex-col items-center text-xs text-text-secondary">
            <span className="text-xl">🏠</span>
            <span>首页</span>
          </Link>
          <button onClick={() => router.push('/cart')} className="flex flex-col items-center text-xs text-text-secondary">
            <span className="text-xl">🛒</span>
            <span>购物车</span>
          </button>
          <button onClick={handleAddToCart} className="flex-1 py-2.5 rounded-full border-2 border-primary-500 text-primary-500 font-medium text-sm">加入购物车</button>
          <button onClick={handleBuyNow} className="flex-1 py-2.5 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 text-white font-medium text-sm">立即购买</button>
        </div>
      </div>

      {showTip && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/70 text-white px-6 py-3 rounded-xl text-sm z-50 toast-enter">
          🎉 已加入购物车
        </div>
      )}
    </div>
  )
}

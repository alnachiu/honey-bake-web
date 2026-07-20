'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCart } from '@/components/CartProvider'
import { useAuth } from '@/contexts/AuthContext'

export default function CartPage() {
  const { items, totalPrice, totalCount, updateQuantity, removeItem, clearCart } = useCart()
  const { user } = useAuth()
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(items.map(i => i.id)))

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const selectedItems = items.filter(i => selectedIds.has(i.id))
  const selectedTotal = selectedItems.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const allSelected = items.length > 0 && selectedIds.size === items.length

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(items.map(i => i.id)))
  }

  const handleCheckout = () => {
    if (!user) { router.push('/login'); return }
    if (!selectedItems.length) return
    localStorage.setItem('honeybake_checkout', JSON.stringify(selectedItems))
    router.push('/checkout')
  }

  if (!items.length) {
    return (
      <div className="page-container pt-20 text-center">
        <div className="text-6xl mb-4">🛒</div>
        <p className="text-text-light">购物车是空的</p>
        <p className="text-text-light text-sm mt-1">快去挑选美味吧~</p>
        <Link href="/" className="btn-primary inline-block mt-6">去逛逛</Link>
      </div>
    )
  }

  return (
    <div className="pb-24 min-h-screen">
      <div className="px-4 pt-4 space-y-3">
        {items.map(item => (
          <div key={item.id} className="card flex items-center gap-3 animate-slide-up">
            <button onClick={() => toggleSelect(item.id)} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedIds.has(item.id) ? 'bg-primary-500 border-primary-500' : 'border-warm-400'}`}>
              {selectedIds.has(item.id) && <span className="text-white text-xs">✓</span>}
            </button>
            <img src={item.image || '/placeholder.jpg'} alt={item.name} className="w-16 h-16 rounded-xl object-cover bg-warm-100 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{item.name}</p>
              <p className="text-primary-500 font-semibold mt-1">¥{item.price.toFixed(2)}</p>
              {item.deliveryFee > 0 && <p className="text-[10px] text-text-light">+邮费¥{Number(item.deliveryFee).toFixed(2)}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="w-7 h-7 bg-warm-100 rounded-full flex items-center justify-center text-sm text-text-secondary">−</button>
              <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
              <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="w-7 h-7 bg-warm-100 rounded-full flex items-center justify-center text-sm text-text-secondary">+</button>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Bar */}
      <div className="fixed bottom-14 left-0 right-0 bg-white border-t border-warm-200 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-4">
          <button onClick={toggleAll} className="flex items-center gap-2 text-sm text-text-secondary">
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${allSelected ? 'bg-primary-500 border-primary-500' : 'border-warm-400'}`}>
              {allSelected && <span className="text-white text-xs">✓</span>}
            </div>
            全选
          </button>
          <div className="flex-1 text-right">
            <span className="text-sm text-text-secondary">合计：</span>
            <span className="text-lg font-bold text-primary-500">¥{selectedTotal.toFixed(2)}</span>
          </div>
          <button onClick={handleCheckout} className={`px-6 py-2.5 rounded-full text-sm font-medium text-white ${selectedItems.length ? 'bg-gradient-to-r from-primary-500 to-primary-400' : 'bg-warm-400'}`}>
            结算({selectedItems.reduce((s, i) => s + i.quantity, 0)})
          </button>
        </div>
      </div>
    </div>
  )
}

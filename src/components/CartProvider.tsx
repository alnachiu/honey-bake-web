'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { calcOrderDeliveryFee } from '@/lib/utils'

interface CartItem {
  id: string
  name: string
  price: number
  deliveryFee: number
  image: string
  quantity: number
  unit: string
  stock: number
}

interface CartContextType {
  items: CartItem[]
  totalCount: number
  totalPrice: number
  totalDeliveryFee: number
  addItem: (item: Omit<CartItem, 'quantity'>) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart: () => void
}

const CartContext = createContext<CartContextType | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  useEffect(() => {
    const saved = localStorage.getItem('honeybake_cart')
    if (saved) {
      try { setItems(JSON.parse(saved)) } catch {}
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('honeybake_cart', JSON.stringify(items))
  }, [items])

  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0)
  // totalPrice 只算商品小计，运费单独用 totalDeliveryFee 表示——把运费混进
  // 「商品金额」里会让它和结算页的「商品金额」对不上。
  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  // 整单运费取各商品运费的最高值，不逐件累加（与 calcOrderAmount 的入参口径一致）
  const totalDeliveryFee = calcOrderDeliveryFee(items)

  const addItem = useCallback((item: Omit<CartItem, 'quantity'>) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === item.id)
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { ...item, quantity: 1 }]
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
  }, [])

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(id)
      return
    }
    setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.min(quantity, i.stock || 99) } : i))
  }, [removeItem])

  const clearCart = useCallback(() => {
    setItems([])
  }, [])

  return (
    <CartContext.Provider value={{ items, totalCount, totalPrice, totalDeliveryFee, addItem, removeItem, updateQuantity, clearCart }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used within CartProvider')
  return context
}

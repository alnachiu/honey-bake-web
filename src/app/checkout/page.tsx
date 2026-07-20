'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/components/CartProvider'

export default function CheckoutPage() {
  const router = useRouter()
  const { user, refreshUser } = useAuth()
  const { clearCart } = useCart()
  const [items, setItems] = useState<any[]>([])
  const [addresses, setAddresses] = useState<any[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<string>('')
  const [coupons, setCoupons] = useState<any[]>([])
  const [selectedCouponId, setSelectedCouponId] = useState<string>('')
  const [remark, setRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showAddressModal, setShowAddressModal] = useState(false)
  const [showCouponModal, setShowCouponModal] = useState(false)
  const [guestInfo, setGuestInfo] = useState({ name: '', phone: '', detail: '' })
  const [newAddress, setNewAddress] = useState({ name: '', phone: '', detail: '' })

  const addNewAddress = async () => {
    if (!newAddress.name || !newAddress.phone || !newAddress.detail) { alert('请填写完整地址信息'); return }
    try {
      const res = await fetch('/api/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newAddress, region: '', isDefault: addresses.length === 0 })
      })
      const data = await res.json()
      if (data.address) {
        setAddresses(prev => [...prev, data.address])
        setSelectedAddressId(data.address.id)
        setNewAddress({ name: '', phone: '', detail: '' })
      }
    } catch (err) { console.error(err) }
  }

  useEffect(() => {
    const saved = localStorage.getItem('honeybake_checkout')
    if (saved) { setItems(JSON.parse(saved)) }
    else { router.push('/cart') }
  }, [])

  useEffect(() => {
    if (user) {
      fetchAddresses()
      fetchMyCoupons()
    }
  }, [user])

  const fetchAddresses = async () => {
    try {
      const res = await fetch('/api/addresses')
      const data = await res.json()
      setAddresses(data.addresses || [])
      const def = (data.addresses || []).find((a: any) => a.isDefault)
      if (def) setSelectedAddressId(def.id)
    } catch (err) { console.error(err) }
  }

  const fetchMyCoupons = async () => {
    try {
      const res = await fetch('/api/coupons/claim')
      const data = await res.json()
      setCoupons((data.coupons || []).filter((c: any) => c.status === 'active'))
    } catch (err) { console.error(err) }
  }

  const itemsAmount = items.reduce((s, i) => s + i.price * i.quantity, 0)
  const deliveryFee = itemsAmount >= 68 ? 0 : 5
  const selectedCoupon = coupons.find(c => c.id === selectedCouponId)
  let couponDiscount = 0
  if (selectedCoupon) {
    if (selectedCoupon.type === 'reduce' && itemsAmount >= selectedCoupon.minAmount) {
      couponDiscount = selectedCoupon.value
    } else if (selectedCoupon.type === 'discount') {
      couponDiscount = Math.round(itemsAmount * (1 - selectedCoupon.value / 10) * 100) / 100
    }
  }
  const totalAmount = Math.max(0, itemsAmount + deliveryFee - couponDiscount)

  const submitOrder = async () => {
    if (submitting) return

    if (!user) {
      // 游客下单
      if (!guestInfo.name || !guestInfo.phone) { alert('请填写姓名和手机号'); return }
      if (!/^1[3-9]\d{9}$/.test(guestInfo.phone)) { alert('手机号格式不正确'); return }
      setSubmitting(true)
      try {
        const res = await fetch('/api/orders/guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: guestInfo.name,
            phone: guestInfo.phone,
            address: guestInfo.detail,
            items: items.map(i => ({ id: i.id, name: i.name, image: i.image, price: i.price, quantity: i.quantity, unit: i.unit })),
            remark,
            couponId: selectedCouponId
          })
        })
        const data = await res.json()
        if (data.order) {
          clearCart()
          localStorage.removeItem('honeybake_checkout')
          await refreshUser()
          router.push(`/orders/${data.order.id}`)
        } else {
          alert(data.error || '下单失败')
        }
      } catch (err) { console.error(err) }
      setSubmitting(false)
      return
    }

    // 已登录用户下单
    if (!selectedAddressId) { alert('请选择收货地址'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({ productId: i.id, name: i.name, image: i.image, price: i.price, quantity: i.quantity, unit: i.unit })),
          addressId: selectedAddressId,
          couponId: selectedCouponId,
          remark
        })
      })
      const data = await res.json()
      if (data.order) {
        clearCart()
        localStorage.removeItem('honeybake_checkout')
        router.push(`/orders/${data.order.id}`)
      } else {
        alert(data.error || '下单失败')
      }
    } catch (err) { console.error(err) }
    setSubmitting(false)
  }

  return (
    <div className="pb-28">
      <div className="px-4 pt-4 space-y-3">
        {/* Guest Checkout Form */}
        {!user && (
          <div className="card">
            <p className="text-sm font-medium text-text-primary mb-3">📝 填写收货信息</p>
            <div className="space-y-2.5">
              <input className="input-field text-sm" placeholder="收货人姓名 *" value={guestInfo.name} onChange={e => setGuestInfo(p => ({...p, name: e.target.value}))} />
              <input className="input-field text-sm" placeholder="手机号 *（用于登录和联系）" value={guestInfo.phone} onChange={e => setGuestInfo(p => ({...p, phone: e.target.value}))} maxLength={11} />
              <textarea className="input-field text-sm min-h-[60px] py-2" placeholder="收货地址 *（如：广东省广州市天河区XX路XX号）" value={guestInfo.detail} onChange={e => setGuestInfo(p => ({...p, detail: e.target.value}))} />
              <p className="text-[10px] text-text-light">💡 填写后系统自动创建账号，下次用手机号即可登录</p>
            </div>
          </div>
        )}

        {/* Logged-in user: Address */}
        {user && (
          <div className="card" onClick={() => setShowAddressModal(true)}>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">📍 收货地址</span>
              <span className="text-text-light text-sm">›</span>
            </div>
            {selectedAddressId ? (
              (() => { const a = addresses.find(ad => ad.id === selectedAddressId); return a ? (
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{a.name}</span>
                    <span className="text-xs text-text-secondary">{a.phone}</span>
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">{a.region} {a.detail}</p>
                </div>
              ) : <p className="text-xs text-text-light mt-2">选择收货地址</p> })()
            ) : <p className="text-xs text-text-light mt-2">选择收货地址</p>}
          </div>
        )}

        {/* Items */}
        <div className="card">
          <p className="text-sm font-medium mb-3">🛒 商品清单</p>
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-3 mb-3 last:mb-0">
              <img src={item.image || '/placeholder.jpg'} alt={item.name} className="w-12 h-12 rounded-lg object-cover bg-warm-100" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">{item.name}</p>
                <p className="text-xs text-text-light">x{item.quantity}</p>
              </div>
              <p className="text-sm text-text-primary font-medium">¥{(item.price * item.quantity).toFixed(2)}</p>
            </div>
          ))}
        </div>

        {/* Coupon */}
        {user && (
          <div className="card" onClick={() => coupons.length && setShowCouponModal(true)}>
            <div className="flex justify-between items-center">
              <span className="text-sm text-text-primary">🎫 优惠券</span>
              <span className="text-sm text-primary-500">{selectedCoupon ? `-¥${couponDiscount.toFixed(2)}` : coupons.length ? '选择 ›' : '暂无可用'}</span>
            </div>
          </div>
        )}

        {/* Remark */}
        <div className="card">
          <textarea className="w-full text-sm text-text-primary resize-none bg-transparent outline-none" placeholder="✏️ 备注信息（选填）" rows={2} value={remark} onChange={e => setRemark(e.target.value)} />
        </div>

        {/* Summary */}
        <div className="card space-y-2">
          <div className="flex justify-between text-sm"><span className="text-text-secondary">商品金额</span><span>¥{itemsAmount.toFixed(2)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-text-secondary">配送费</span><span>{deliveryFee === 0 ? '免运费' : `¥${deliveryFee.toFixed(2)}`}</span></div>
          {couponDiscount > 0 && <div className="flex justify-between text-sm"><span className="text-text-secondary">优惠券</span><span className="text-primary-500">-¥{couponDiscount.toFixed(2)}</span></div>}
          <div className="border-t border-warm-200 pt-2 flex justify-between">
            <span className="font-medium">实付金额</span>
            <span className="text-lg font-bold text-primary-500">¥{totalAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-warm-200 px-4 py-3">
        <div className="max-w-lg mx-auto">
          <button onClick={submitOrder} disabled={submitting} className="btn-primary w-full">
            {submitting ? '提交中...' : `提交订单 ¥${totalAmount.toFixed(2)}`}
          </button>
          {!user && (
            <p className="text-[10px] text-text-light text-center mt-1.5">已购买过的用户 <Link href="/login" className="text-primary-500">点此登录</Link></p>
          )}
        </div>
      </div>

      {/* Address Modal */}
      {showAddressModal && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setShowAddressModal(false)}>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[60vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-warm-100 flex justify-between items-center">
              <h3 className="font-semibold">选择收货地址</h3>
              <button onClick={() => setShowAddressModal(false)} className="text-text-light">✕</button>
            </div>
            <div className="p-4 space-y-3">
              {addresses.length === 0 && (
                <p className="text-xs text-text-light text-center py-4">还没有收货地址，请添加</p>
              )}
              {addresses.map(a => (
                <div key={a.id} onClick={() => { setSelectedAddressId(a.id); setShowAddressModal(false) }} className={`p-3 rounded-xl border ${selectedAddressId === a.id ? 'border-primary-500 bg-primary-50' : 'border-warm-200'}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{a.name}</span>
                    <span className="text-xs text-text-secondary">{a.phone}</span>
                    {a.isDefault && <span className="text-[10px] text-primary-500 bg-primary-50 px-1.5 py-0.5 rounded">默认</span>}
                  </div>
                  <p className="text-xs text-text-secondary mt-1">{a.region} {a.detail}</p>
                </div>
              ))}
              {/* Add new address */}
              <div className="border-t border-warm-100 pt-3 mt-3">
                <p className="text-xs font-medium text-text-primary mb-2">➕ 新增地址</p>
                <div className="space-y-2">
                  <input className="input-field text-xs" placeholder="收货人" value={newAddress.name} onChange={e => setNewAddress(p => ({...p, name: e.target.value}))} />
                  <input className="input-field text-xs" placeholder="手机号" value={newAddress.phone} onChange={e => setNewAddress(p => ({...p, phone: e.target.value}))} maxLength={11} />
                  <textarea className="input-field text-xs min-h-[50px] py-2" placeholder="详细地址（街道、门牌号）" value={newAddress.detail} onChange={e => setNewAddress(p => ({...p, detail: e.target.value}))} />
                  <button onClick={addNewAddress} className="btn-primary w-full text-xs py-2">保存并使用</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Coupon Modal */}
      {showCouponModal && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setShowCouponModal(false)}>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[50vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-warm-100 flex justify-between items-center">
              <h3 className="font-semibold">选择优惠券</h3>
              <button onClick={() => setShowCouponModal(false)} className="text-text-light">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div onClick={() => { setSelectedCouponId(''); setShowCouponModal(false) }} className={`p-3 rounded-xl border ${!selectedCouponId ? 'border-primary-500 bg-primary-50' : 'border-warm-200'}`}><p className="text-sm font-medium">不使用优惠券</p></div>
              {coupons.map(c => (
                <div key={c.id} onClick={() => { setSelectedCouponId(c.id); setShowCouponModal(false) }} className={`p-3 rounded-xl border ${selectedCouponId === c.id ? 'border-primary-500 bg-primary-50' : 'border-warm-200'}`}>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-text-light mt-1">{c.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

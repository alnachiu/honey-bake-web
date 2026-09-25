'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/components/CartProvider'
import { calcOrderAmount, calcOrderDeliveryFee, couponExpireText, isMemberActive, isValidPhone, couponAmountLabel, couponValueText, giftFromCoupon } from '@/lib/utils'

export default function CheckoutPage() {
  const router = useRouter()
  const { user, loading: authLoading, refreshUser } = useAuth()
  const { clearCart } = useCart()
  const [items, setItems] = useState<any[]>([])
  const [addresses, setAddresses] = useState<any[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<string>('')
  const [coupons, setCoupons] = useState<any[]>([])
  // 记录的是 UserCoupon.id（券包里具体那一张），不是券模板 id。
  // 用券模板 id 会把同一张券的多张副本一起选中，下单时被一次全部核销。
  const [selectedCouponIds, setSelectedCouponIds] = useState<string[]>([])
  const [memberRate, setMemberRate] = useState(1)
  const [remark, setRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showAddressModal, setShowAddressModal] = useState(false)
  const [showCouponModal, setShowCouponModal] = useState(false)
  const [guestInfo, setGuestInfo] = useState({ name: '', phone: '', detail: '' })
  const [newAddress, setNewAddress] = useState({ name: '', phone: '', detail: '' })
  // 游客填的手机号命中会员时，提示他先登录（游客单不打折，见 /api/orders/guest）
  const [memberByPhone, setMemberByPhone] = useState<{ isMember: boolean; discount: number } | null>(null)
  const [phoneLoggingIn, setPhoneLoggingIn] = useState(false)
  const [addressesLoaded, setAddressesLoaded] = useState(false)
  const [pendingAddressPick, setPendingAddressPick] = useState(false)
  const [toast, setToast] = useState('')

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

  // 商品里的 deliveryFee 是**加购那一刻**的快照。店主事后改运费（蛋糕从 0 改成 8），
  // 结算页照旧值预览、服务端却按库里新值收费，用户就会看到「免运费」却被收 8 元。
  // 所以先拿最新运费校准一遍再算钱。只同步运费，不动 price——
  // 服务端记的商品价格仍是前端传的值（/api/orders 对价格是全信前端的），
  // 单方面把展示价改成新价只会让界面和订单记录对不上。
  const feeSyncedRef = useRef(false)
  useEffect(() => {
    if (feeSyncedRef.current || !items.length) return
    feeSyncedRef.current = true   // 失败也不重试，避免网络抖动时反复打接口
    const ids = Array.from(new Set(items.map((i: any) => i.id).filter(Boolean)))
    if (!ids.length) return
    fetch(`/api/products?ids=${encodeURIComponent(ids.join(','))}`)
      .then(res => res.json())
      .then(data => {
        const list = data?.products
        if (!Array.isArray(list) || !list.length) return
        const feeById = new Map<string, number>(list.map((p: any) => [p.id, Number(p.deliveryFee) || 0]))
        // 查不到的商品（已下架）保留原值兜底：下架由服务端拦，不该让用户卡在结算页
        setItems(prev => prev.map(i => feeById.has(i.id) ? { ...i, deliveryFee: feeById.get(i.id) as number } : i))
      })
      .catch(() => {})
  }, [items])

  useEffect(() => {
    if (user) {
      fetchAddresses()
      fetchMyCoupons()
      fetchMemberRate()
    }
  }, [user])

  // 手机号防抖查会员：只在格式合法后才发请求，避免每敲一位就打一次接口
  useEffect(() => {
    if (user) return
    const phone = guestInfo.phone
    if (!isValidPhone(phone)) { setMemberByPhone(null); return }

    let alive = true
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/membership/check?phone=${encodeURIComponent(phone)}`)
        const data = await res.json()
        if (alive) setMemberByPhone(data?.isMember ? data : null)
      } catch (err) {
        // 查失败只是不显示提示条，不挡住下单
        if (alive) setMemberByPhone(null)
      }
    }, 400)

    return () => { alive = false; clearTimeout(timer) }
  }, [guestInfo.phone, user])

  // 一键手机号登录之后：该账号已有地址就直接选上，没有就弹地址框
  // （guestInfo 已经在 loginByPhone 里预填进 newAddress，用户只需点保存）
  useEffect(() => {
    if (!pendingAddressPick || !user || !addressesLoaded) return
    const def = addresses.find((a: any) => a.isDefault) || addresses[0]
    if (def) setSelectedAddressId(def.id)
    else setShowAddressModal(true)
    setPendingAddressPick(false)
  }, [pendingAddressPick, user, addressesLoaded, addresses])

  const fetchMemberRate = async () => {
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      const rate = data?.settings?.memberDiscount
      if (Number.isFinite(rate) && rate > 0 && rate <= 1) setMemberRate(rate)
    } catch (err) { console.error(err) }
  }

  const fetchAddresses = async () => {
    try {
      const res = await fetch('/api/addresses')
      const data = await res.json()
      setAddresses(data.addresses || [])
      const def = (data.addresses || []).find((a: any) => a.isDefault)
      if (def) setSelectedAddressId(def.id)
    } catch (err) { console.error(err) }
    setAddressesLoaded(true)
  }

  const fetchMyCoupons = async () => {
    try {
      const res = await fetch('/api/coupons/claim')
      const data = await res.json()
      // usable 由服务端按有效期算好（fixed 看日期窗口、relative 看 expireTime）
      setCoupons((data.coupons || []).filter((c: any) => c.usable))
    } catch (err) { console.error(err) }
  }

  const itemsAmount = items.reduce((s, i) => s + i.price * i.quantity, 0)
  const selectedCoupons = coupons.filter(c => selectedCouponIds.includes(c.userCouponId))
  const isMember = isMemberActive(user?.memberExpire)
  // 整单一个运费：取所有商品里最高的那个，与 /api/orders 的算法同源
  const orderDeliveryFee = calcOrderDeliveryFee(items)
  const { couponDiscount, memberDiscount, deliveryFee, totalAmount } = calcOrderAmount({
    itemsAmount,
    coupons: selectedCoupons,
    memberDiscountRate: isMember ? memberRate : 1,
    deliveryFee: orderDeliveryFee
  })

  /** 已选中的买赠券带的赠品；订单上只挂一个（服务端也只允许一张买赠券） */
  const selectedGift = giftFromCoupon(selectedCoupons.find(c => c.type === 'gift'))

  // 多选券时维持叠加规则：两张券必须都允许叠加才能同时选中
  const toggleCoupon = (coupon: any) => {
    setSelectedCouponIds(prev => {
      if (prev.includes(coupon.userCouponId)) return prev.filter(id => id !== coupon.userCouponId)
      const others = coupons.filter(c => prev.includes(c.userCouponId))
      // 一次下单最多一张买赠券——订单上只记一个赠品，服务端也会拦，
      // 这里提前拦是为了别让用户点了半天才在提交时报错
      if (coupon.type === 'gift' && others.some(c => c.type === 'gift')) {
        alert('一次下单最多使用一张买赠券')
        return prev
      }
      if (others.length && (!coupon.stackable || others.some(c => !c.stackable))) {
        alert('该优惠券不可与其他优惠券叠加使用，请先取消已选中的券')
        return prev
      }
      return [...prev, coupon.userCouponId]
    })
  }

  const loginByPhone = async () => {
    if (!isValidPhone(guestInfo.phone)) { alert('手机号格式不正确'); return }
    setPhoneLoggingIn(true)
    try {
      const res = await fetch('/api/auth/phone-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: guestInfo.phone, name: guestInfo.name })
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || '登录失败'); setPhoneLoggingIn(false); return }
      // 登录后走的是另一套下单接口（要 addressId），把刚填的收货信息预填进「新增地址」
      setNewAddress({ name: guestInfo.name, phone: guestInfo.phone, detail: guestInfo.detail })
      setPendingAddressPick(true)
      await refreshUser()
      setToast('登录成功，本单即享会员折扣')
      setTimeout(() => setToast(''), 3000)
    } catch (err) {
      alert('登录失败，请稍后重试')
    }
    setPhoneLoggingIn(false)
  }

  const submitOrder = async () => {
    if (submitting) return

    if (!user) {
      // 游客下单
      if (!guestInfo.name || !guestInfo.phone) { alert('请填写姓名和手机号'); return }
      if (!isValidPhone(guestInfo.phone)) { alert('手机号格式不正确'); return }
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
            remark
            // 游客没有券包，不传优惠券
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
          userCouponIds: selectedCoupons.map(c => c.userCouponId).filter(Boolean),
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

  // 认证是异步恢复的：user 初值 null，等 cookie 校验回来才填上。
  // 不挡这一下，刷新结算页会先闪一遍「填写收货信息」的游客表单，
  // 已登录的用户会以为自己掉登录了。
  if (authLoading) {
    return (
      <div className="page-container pt-4 space-y-3">
        <div className="card h-24 skeleton" />
        <div className="card h-32 skeleton" />
        <div className="card h-20 skeleton" />
      </div>
    )
  }

  // 管理员只做管理与导单，不给下单入口，免得后台数据混进测试单
  if (user?.role === 'admin') {
    return (
      <div className="page-container pt-20 text-center">
        <div className="text-6xl mb-4">🔒</div>
        <p className="text-text-light">管理员账号不支持下单</p>
        <p className="text-text-light text-sm mt-1">请退出后使用顾客账号购买</p>
        <Link href="/admin" className="btn-primary inline-block mt-6">返回后台</Link>
      </div>
    )
  }

  return (
    <div className="pb-28">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-white px-5 py-2.5 rounded-xl text-sm toast-enter">
          {toast}
        </div>
      )}

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

            {/* 该手机号是会员：游客单不打折，提示先登录 */}
            {memberByPhone && (
              <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                <p className="text-xs text-amber-700 font-medium">⚠️ 该手机号为会员，请先用手机号登录</p>
                <p className="text-[11px] text-amber-600 mt-0.5">
                  登录后本单即享 {Math.round(memberByPhone.discount * 100) / 10} 折
                </p>
                <button
                  onClick={loginByPhone}
                  disabled={phoneLoggingIn}
                  className="mt-2 text-[11px] px-3 py-1.5 rounded-full bg-primary-500 text-white disabled:opacity-60"
                >
                  {phoneLoggingIn ? '登录中...' : '用手机号登录'}
                </button>
              </div>
            )}
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
              <span className="text-sm text-primary-500">
                {couponDiscount > 0
                  ? `-¥${couponDiscount.toFixed(2)}${selectedCoupons.length > 1 ? ` (${selectedCoupons.length}张)` : ''}`
                  : selectedGift
                    // 买赠券不产生金额优惠，不特判的话选了券这里还显示「选择 ›」，看着像没生效
                    ? `🎁 ${selectedGift.giftName} ×${selectedGift.giftQuantity}`
                    : coupons.length ? '选择 ›' : '暂无可用'}
              </span>
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
          <div className="flex justify-between text-sm"><span className="text-text-secondary">运费</span><span>{deliveryFee === 0 ? '免运费' : `¥${deliveryFee.toFixed(2)}`}</span></div>
          {couponDiscount > 0 && <div className="flex justify-between text-sm"><span className="text-text-secondary">优惠券</span><span className="text-primary-500">-¥{couponDiscount.toFixed(2)}</span></div>}
          {/* 赠品不抵扣金额，所以不进上面的优惠券行，单独列一行让人知道要随单发什么 */}
          {selectedGift && (
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">🎁 赠品</span>
              <span className="text-primary-500">{selectedGift.giftName} ×{selectedGift.giftQuantity}（随单配送）</span>
            </div>
          )}
          {memberDiscount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">💎 会员折扣</span>
              <span className="text-primary-500">-¥{memberDiscount.toFixed(2)}</span>
            </div>
          )}
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
              <div onClick={() => setSelectedCouponIds([])} className={`p-3 rounded-xl border ${!selectedCoupons.length ? 'border-primary-500 bg-primary-50' : 'border-warm-200'}`}>
                <p className="text-sm font-medium">不使用优惠券</p>
              </div>
              {coupons.map(c => {
                const checked = selectedCouponIds.includes(c.userCouponId)
                // 门槛不够就置灰，三种类型一致。此前只判 reduce，
                // 带门槛的折扣券和买赠券都能被点中，下单时才发现用不了
                const notEnough = c.minAmount > 0 && itemsAmount < c.minAmount
                return (
                  <div
                    key={c.userCouponId}
                    onClick={() => !notEnough && toggleCoupon(c)}
                    className={`p-3 rounded-xl border flex items-center gap-3 ${checked ? 'border-primary-500 bg-primary-50' : 'border-warm-200'} ${notEnough ? 'opacity-50' : ''}`}
                  >
                    <button
                      type="button"
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${checked ? 'bg-primary-500 border-primary-500' : 'border-warm-400'}`}
                    >
                      {checked && <span className="text-white text-xs">✓</span>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {couponAmountLabel(c)} · {c.name}
                        {c.stackable && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600">可叠加</span>}
                      </p>
                      <p className="text-xs text-text-light mt-1">
                        {c.type === 'gift'
                          ? `${couponValueText(c)} · 需同时购买其他商品`
                          : c.minAmount > 0 ? `满${c.minAmount}元可用` : '无门槛'}
                        {notEnough ? ' · 未达门槛' : ''}
                        {' · '}{couponExpireText(c)}
                      </p>
                    </div>
                  </div>
                )
              })}
              <button onClick={() => setShowCouponModal(false)} className="btn-primary w-full text-sm py-2">确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

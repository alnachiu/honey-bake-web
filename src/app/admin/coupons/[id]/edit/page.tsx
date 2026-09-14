'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import CouponForm, {
  CouponFormValue,
  couponToForm,
  couponFormToBody
} from '@/components/CouponForm'

export default function EditCouponPage() {
  const { id } = useParams()
  const router = useRouter()
  const [form, setForm] = useState<CouponFormValue | null>(null)
  const [meta, setMeta] = useState<{ claimCount: number; usedCount: number }>({ claimCount: 0, usedCount: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchCoupon() }, [id])

  const fetchCoupon = async () => {
    try {
      const res = await fetch(`/api/coupons?id=${id}`)
      const data = await res.json()
      if (data.coupon) {
        setForm(couponToForm(data.coupon))
        setMeta({ claimCount: data.coupon.claimCount || 0, usedCount: data.coupon.usedCount || 0 })
      } else {
        setError(data.error || '优惠券不存在')
      }
    } catch (err) {
      console.error(err)
      setError('加载失败')
    }
    setLoading(false)
  }

  const handleSubmit = async () => {
    if (!form) return
    setSaving(true)
    try {
      const res = await fetch('/api/coupons', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...couponFormToBody(form) })
      })
      const data = await res.json()
      if (res.ok && data.coupon) {
        router.push('/admin/coupons')
      } else {
        alert(data.error || '保存失败')
      }
    } catch (err) {
      alert('保存失败，请稍后重试')
    }
    setSaving(false)
  }

  if (loading) return <div className="page-container pt-4"><div className="h-64 skeleton rounded-2xl" /></div>
  if (error || !form) return <div className="page-container pt-20 text-center"><p className="text-text-light">{error || '优惠券不存在'}</p></div>

  return (
    <div className="page-container pt-4 pb-20">
      <h1 className="text-lg font-bold text-text-primary mb-4">编辑优惠券</h1>
      <div className="card">
        <CouponForm
          value={form}
          onChange={patch => setForm(prev => (prev ? { ...prev, ...patch } : prev))}
          onSubmit={handleSubmit}
          submitting={saving}
          submitText="保存修改"
          onCancel={() => router.push('/admin/coupons')}
          notice={
            meta.claimCount > 0 ? (
              // 只提醒不阻断：店主可能就是想延长有效期或调低门槛
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <p className="text-[11px] text-amber-600 leading-relaxed">
                  已有 {meta.claimCount} 位用户领取（{meta.usedCount} 位已使用）。
                  修改有效期或门槛会同时影响他们券包里的已有券。
                </p>
              </div>
            ) : null
          }
        />
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

/**
 * 地址管理。
 *
 * 复用现成的 /api/addresses（GET/POST/PUT/DELETE），不新建接口——
 * 结算页已经在用同一套，两边共用一份数据口径，不会出现「这里改完那边不认」。
 *
 * 地址可以随便删：历史订单的收货信息在下单时就快照到 Order 上了，
 * 删地址不会让老订单变成空白（见 lib/receiver.ts）。
 */

type AddressForm = {
  name: string
  phone: string
  region: string
  detail: string
  isDefault: boolean
}

const EMPTY_FORM: AddressForm = { name: '', phone: '', region: '', detail: '', isDefault: false }

export default function AddressesPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  // 表单弹层：editingId 为空 = 新增，有值 = 改那一条
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    // 必须等认证恢复完：user 初值是 null，抢先判会把刷新页面的用户踢去登录页
    if (authLoading) return
    if (!user) { router.push('/login'); return }
    fetchList()
  }, [user, authLoading])

  const flash = (text: string) => {
    setToast(text)
    setTimeout(() => setToast(''), 2500)
  }

  const fetchList = async () => {
    try {
      const res = await fetch('/api/addresses')
      const data = await res.json()
      setList(data.addresses || [])
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  const openCreate = () => {
    setEditingId('')
    // 第一条地址默认设为默认地址，省得用户还得再点一次
    setForm({ ...EMPTY_FORM, isDefault: list.length === 0 })
    setFormError('')
    setShowForm(true)
  }

  const openEdit = (a: any) => {
    setEditingId(a.id)
    setForm({
      name: a.name || '',
      phone: a.phone || '',
      region: a.region || '',
      detail: a.detail || '',
      isDefault: !!a.isDefault
    })
    setFormError('')
    setShowForm(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim() || !form.phone.trim() || !form.detail.trim()) {
      setFormError('请填写收货人、手机号和详细地址')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/addresses', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 编辑时带上 id；新增时不带，服务端按 body 里有没有 id 无差别处理，
        // 实际路由由 method 决定
        body: JSON.stringify(editingId ? { id: editingId, ...form } : form)
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error || '保存失败'); setSaving(false); return }

      // 设为默认会连带取消其它地址的默认标记，所以整表重拉，
      // 不能只把本地那一条改掉——否则界面上会同时出现两个「默认」
      await fetchList()
      setShowForm(false)
      flash(editingId ? '✅ 地址已更新' : '✅ 地址已添加')
    } catch {
      setFormError('网络异常，请重试')
    }
    setSaving(false)
  }

  const remove = async (a: any) => {
    if (!confirm(
      `删除这个收货地址？\n\n${a.name} ${a.phone}\n${a.region} ${a.detail}\n\n` +
      `已经下过的订单不受影响，仍会保留下单时的收货信息。`
    )) return

    try {
      const res = await fetch('/api/addresses', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id })
      })
      const data = await res.json()
      if (!res.ok) { flash(data.error || '删除失败'); return }
      // 删掉的是默认地址时服务端会自动把另一条顶上来，所以整表重拉
      await fetchList()
      flash('已删除')
    } catch {
      flash('网络异常，请重试')
    }
  }

  const setDefault = async (a: any) => {
    if (a.isDefault) return
    try {
      const res = await fetch('/api/addresses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id, isDefault: true })
      })
      const data = await res.json()
      if (!res.ok) { flash(data.error || '设置失败'); return }
      await fetchList()
      flash('已设为默认地址')
    } catch {
      flash('网络异常，请重试')
    }
  }

  if (authLoading) {
    return (
      <div className="page-container pt-4 space-y-3">
        <div className="h-8 skeleton w-1/3" />
        {[1, 2].map(i => <div key={i} className="h-28 skeleton rounded-2xl" />)}
      </div>
    )
  }
  if (!user) return null

  return (
    <div className="page-container pt-4 pb-20 animate-fade-in">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-white px-5 py-2.5 rounded-xl text-sm toast-enter">
          {toast}
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => router.back()} className="text-sm text-text-secondary flex-shrink-0">‹ 返回</button>
        <h1 className="text-lg font-bold text-text-primary flex-1">📍 地址管理</h1>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-28 skeleton rounded-2xl" />)}</div>
      ) : list.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📍</div>
          <p className="text-text-light text-sm">还没有收货地址</p>
          <p className="text-xs text-text-light mt-2">添加一个，下单时就能直接选了</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(a => (
            <div key={a.id} className="card">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary">{a.name}</p>
                    <span className="text-xs text-text-secondary">{a.phone}</span>
                    {a.isDefault && (
                      <span className="text-[10px] text-primary-500 bg-primary-50 px-2 py-0.5 rounded-full flex-shrink-0">默认</span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                    {a.region} {a.detail}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-warm-100">
                <button
                  onClick={() => setDefault(a)}
                  disabled={a.isDefault}
                  className={`text-xs ${a.isDefault ? 'text-text-light' : 'text-primary-500'}`}
                >
                  {a.isDefault ? '✓ 默认地址' : '设为默认'}
                </button>
                <button onClick={() => openEdit(a)} className="text-xs text-text-secondary">编辑</button>
                <button onClick={() => remove(a)} className="text-xs text-red-500 ml-auto">删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={openCreate} className="btn-primary w-full mt-4">+ 新增地址</button>

      {/* 新增 / 编辑表单。用弹层而不是跳新页面：地址字段少，
          跳页会丢掉「刚才填了一半」这种上下文，弹层关掉就回到列表 */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setShowForm(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <p className="text-base font-bold text-text-primary mb-4">{editingId ? '编辑地址' : '新增地址'}</p>
            <form onSubmit={save} className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary block mb-1">收货人</label>
                <input
                  className="input-field"
                  placeholder="请输入收货人姓名"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">手机号</label>
                <input
                  className="input-field"
                  inputMode="tel"
                  placeholder="请输入手机号"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">所在地区<span className="text-text-light">（选填）</span></label>
                <input
                  className="input-field"
                  placeholder="如：广东省深圳市南山区"
                  value={form.region}
                  onChange={e => setForm({ ...form, region: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">详细地址</label>
                <textarea
                  className="input-field"
                  rows={2}
                  placeholder="街道、门牌号、楼层等"
                  value={form.detail}
                  onChange={e => setForm({ ...form, detail: e.target.value })}
                />
              </div>

              <label className="flex items-center gap-2 py-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={e => setForm({ ...form, isDefault: e.target.checked })}
                  className="w-4 h-4 accent-primary-500"
                />
                <span className="text-xs text-text-secondary">设为默认地址</span>
              </label>

              {formError && <p className="text-xs text-red-500">{formError}</p>}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-warm-200 text-sm text-text-secondary">
                  取消
                </button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

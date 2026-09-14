'use client'

import { normalizeDateTime } from '@/lib/utils'

export interface CouponFormValue {
  name: string
  type: string
  value: string
  minAmount: string
  stock: string
  perUserLimit: string
  stackable: boolean
  validMode: string
  startTime: string
  endTime: string
  validDays: string
  description: string
  giftName: string
  giftQuantity: string
  visible: boolean
  rollingDays: string
  rollingLimit: string
  periodType: string
  periodCount: string
}

export const EMPTY_COUPON_FORM: CouponFormValue = {
  name: '',
  type: 'reduce',
  value: '',
  minAmount: '0',
  stock: '0',
  perUserLimit: '1',
  stackable: false,
  validMode: 'fixed',
  startTime: '',
  endTime: '',
  validDays: '7',
  description: '',
  giftName: '',
  giftQuantity: '1',
  visible: true,
  rollingDays: '0',
  rollingLimit: '0',
  periodType: 'none',
  periodCount: '0'
}

/** 服务端返回的券 → 表单值。日期统一补成 datetime-local 需要的 YYYY-MM-DDTHH:mm */
export function couponToForm(c: any): CouponFormValue {
  const validMode = c?.validMode === 'relative' ? 'relative' : 'fixed'
  return {
    name: c?.name || '',
    type: c?.type || 'reduce',
    value: String(c?.value ?? ''),
    minAmount: String(c?.minAmount ?? '0'),
    stock: String(c?.stock ?? '0'),
    perUserLimit: String(c?.perUserLimit ?? '1'),
    stackable: c?.stackable === true,
    validMode,
    startTime: normalizeDateTime(c?.startTime || ''),
    endTime: normalizeDateTime(c?.endTime || '', true),
    validDays: String(c?.validDays || 7),
    description: c?.description || '',
    giftName: c?.giftName || '',
    giftQuantity: String(c?.giftQuantity || 1),
    visible: c?.visible !== false,
    rollingDays: String(c?.rollingDays ?? '0'),
    rollingLimit: String(c?.rollingLimit ?? '0'),
    periodType: c?.periodType || 'none',
    periodCount: String(c?.periodCount ?? '0')
  }
}

/**
 * 表单值 → 接口 body。只做类型转换，业务校验交给服务端，
 * 避免前端一套规则、后端一套规则各自演化。
 */
export function couponFormToBody(f: CouponFormValue) {
  const isGift = f.type === 'gift'
  return {
    name: f.name.trim(),
    type: f.type,
    // 买赠券不产生金额优惠，服务端会强制归 0，这里也别把 NaN 送去
    value: isGift ? 0 : parseFloat(f.value),
    minAmount: parseFloat(f.minAmount || '0'),
    stock: parseInt(f.stock || '0', 10),
    perUserLimit: parseInt(f.perUserLimit || '0', 10),
    stackable: f.stackable,
    validMode: f.validMode,
    // relative 模式下这两个字段无意义，留空避免脏数据
    startTime: f.validMode === 'fixed' ? f.startTime : '',
    endTime: f.validMode === 'fixed' ? f.endTime : '',
    validDays: parseInt(f.validDays || '0', 10),
    description: f.description,
    giftName: isGift ? f.giftName.trim() : '',
    giftQuantity: isGift ? parseInt(f.giftQuantity || '0', 10) : 0,
    visible: f.visible,
    rollingDays: parseInt(f.rollingDays || '0', 10),
    rollingLimit: parseInt(f.rollingLimit || '0', 10),
    periodType: f.periodType,
    periodCount: parseInt(f.periodCount || '0', 10)
  }
}

/** 前后端一致的即时校验，只用于提交前的快速反馈 */
export function validateCouponForm(f: CouponFormValue): string {
  if (!f.name.trim()) return '请填写优惠券名称'

  if (f.type === 'gift') {
    if (!f.giftName.trim()) return '请填写赠品名称'
    const qty = parseInt(f.giftQuantity || '0', 10)
    if (!Number.isInteger(qty) || qty < 1) return '赠品数量需为大于 0 的整数'
  } else {
    const value = parseFloat(f.value)
    if (!Number.isFinite(value) || value <= 0) return '优惠额度必须大于 0'
    if (f.type === 'discount' && value >= 10) return '折扣力度需小于 10 折（如 9 表示九折）'
  }

  const rollingDays = parseInt(f.rollingDays || '0', 10)
  const rollingLimit = parseInt(f.rollingLimit || '0', 10)
  if ((rollingDays > 0) !== (rollingLimit > 0)) {
    return '滚动限领要填全：多少天内最多领几张，两个都填 0 表示不启用'
  }
  const periodCount = parseInt(f.periodCount || '0', 10)
  if ((f.periodType !== 'none') !== (periodCount > 0)) {
    return '自然周期限领要填全：先选每天/每周/每月，再填张数'
  }

  if (f.validMode === 'relative') {
    const days = parseInt(f.validDays || '0', 10)
    if (!Number.isInteger(days) || days < 1) return '领取后有效天数需为大于 0 的整数'
  } else {
    if (!f.startTime || !f.endTime) return '请选择开始和结束时间'
    if (f.startTime > f.endTime) return '开始时间不能晚于结束时间'
  }
  return ''
}

interface CouponFormProps {
  value: CouponFormValue
  onChange: (patch: Partial<CouponFormValue>) => void
  onSubmit: () => void
  submitting?: boolean
  submitText: string
  /** 表单顶部的提示区（如「已有 N 人领取」的告警） */
  notice?: React.ReactNode
  onCancel?: () => void
}

/**
 * 优惠券表单，新增与编辑共用。
 * 两处若各写一份，字段规则会立刻发散（此前新增与编辑就是两个独立实现）。
 */
export default function CouponForm({
  value: form,
  onChange,
  onSubmit,
  submitting = false,
  submitText,
  notice,
  onCancel
}: CouponFormProps) {
  const set = (patch: Partial<CouponFormValue>) => onChange(patch)
  const isGift = form.type === 'gift'

  const handleSubmit = () => {
    const error = validateCouponForm(form)
    if (error) {
      alert(error)
      return
    }
    onSubmit()
  }

  /** 开关，样式与套餐表单里的「上架」一致 */
  const Toggle = ({
    on,
    onClick
  }: {
    on: boolean
    onClick: () => void
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`ml-2 w-12 h-7 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-green-400' : 'bg-warm-400'}`}
    >
      <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )

  return (
    <div className="space-y-3">
      {notice}

      <div>
        <label className="text-xs text-text-secondary block mb-1">优惠券名称</label>
        <input className="input-field text-sm" placeholder="如：新客专享" value={form.name} onChange={e => set({ name: e.target.value })} />
      </div>

      <div className={`grid gap-3 ${isGift ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <div>
          <label className="text-xs text-text-secondary block mb-1">类型</label>
          <select className="input-field text-sm" value={form.type} onChange={e => set({ type: e.target.value })}>
            <option value="reduce">满减</option>
            <option value="discount">折扣</option>
            <option value="gift">买赠（送赠品）</option>
          </select>
        </div>
        {!isGift && (
          <div>
            <label className="text-xs text-text-secondary block mb-1">
              {form.type === 'discount' ? '打几折（如 9）' : '减多少元'}
            </label>
            <input
              type="number"
              step="0.1"
              className="input-field text-sm"
              placeholder={form.type === 'discount' ? '打几折(如9)' : '减多少元'}
              value={form.value}
              onChange={e => set({ value: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* 买赠券：额度换成赠品信息。赠品是自由文本、不关联商品，随单配送 */}
      {isGift && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-secondary block mb-1">赠品名称</label>
            <input className="input-field text-sm" placeholder="如：手工曲奇一盒" value={form.giftName} onChange={e => set({ giftName: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">赠品数量</label>
            <input type="number" min="1" className="input-field text-sm" placeholder="如 1" value={form.giftQuantity} onChange={e => set({ giftQuantity: e.target.value })} />
          </div>
          <p className="col-span-2 text-[10px] text-text-light -mt-1">
            赠品随订单一同配送，不抵扣金额。顾客必须同时购买正常商品才能使用买赠券——只用赠品券无法付款。
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-text-secondary block mb-1">最低消费</label>
          <input type="number" className="input-field text-sm" placeholder="0 表示无门槛" value={form.minAmount} onChange={e => set({ minAmount: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">库存</label>
          <input type="number" className="input-field text-sm" placeholder="0 不限" value={form.stock} onChange={e => set({ stock: e.target.value })} />
        </div>
      </div>

      {/* 有效期模式：固定日期区间 / 领取后 N 天 */}
      <div>
        <label className="text-xs text-text-secondary block mb-1">有效期类型</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => set({ validMode: 'fixed' })}
            className={`py-2 rounded-xl text-xs border transition-colors ${form.validMode === 'fixed' ? 'bg-primary-50 border-primary-400 text-primary-600 font-medium' : 'bg-white border-warm-200 text-text-secondary'}`}
          >
            固定日期
          </button>
          <button
            type="button"
            onClick={() => set({ validMode: 'relative' })}
            className={`py-2 rounded-xl text-xs border transition-colors ${form.validMode === 'relative' ? 'bg-primary-50 border-primary-400 text-primary-600 font-medium' : 'bg-white border-warm-200 text-text-secondary'}`}
          >
            领取后 N 天
          </button>
        </div>
      </div>

      {form.validMode === 'fixed' ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-secondary block mb-1">开始时间</label>
            <input type="datetime-local" className="input-field text-sm" value={form.startTime} onChange={e => set({ startTime: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">结束时间</label>
            <input type="datetime-local" className="input-field text-sm" value={form.endTime} onChange={e => set({ endTime: e.target.value })} />
          </div>
        </div>
      ) : (
        <div>
          <label className="text-xs text-text-secondary block mb-1">领取后有效天数</label>
          <input type="number" min="1" className="input-field text-sm" placeholder="如 7" value={form.validDays} onChange={e => set({ validDays: e.target.value })} />
          <p className="text-[10px] text-text-light mt-1">用户领取后从当天起算，N 天内有效</p>
        </div>
      )}

      <div>
        <label className="text-xs text-text-secondary block mb-1">描述</label>
        <input className="input-field text-sm" placeholder="如：全场通用" value={form.description} onChange={e => set({ description: e.target.value })} />
      </div>

      {/* ---------- 领取限制：三条规则可同时启用，互不覆盖 ---------- */}
      <div className="border-t border-warm-100 pt-3">
        <p className="text-sm text-text-primary mb-2">🎫 领取限制</p>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-text-primary">每人最多领取</p>
            <p className="text-[10px] text-text-light mt-0.5">总量上限，不限时间。填 0 表示不限量</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button type="button" onClick={() => set({ perUserLimit: String(Math.max(0, parseInt(form.perUserLimit || '0', 10) - 1)) })} className="w-7 h-7 bg-warm-100 rounded-full flex items-center justify-center text-sm text-text-secondary">−</button>
            <input type="number" min="0" className="input-field text-sm w-16 text-center" value={form.perUserLimit} onChange={e => set({ perUserLimit: e.target.value })} />
            <button type="button" onClick={() => set({ perUserLimit: String(parseInt(form.perUserLimit || '0', 10) + 1) })} className="w-7 h-7 bg-warm-100 rounded-full flex items-center justify-center text-sm text-text-secondary">＋</button>
          </div>
        </div>

        <div className="mt-3">
          <p className="text-sm text-text-primary">最近一段时间内最多领取</p>
          <p className="text-[10px] text-text-light mt-0.5 mb-2">
            滚动窗口，从当下往前数。两个都填 0 表示不启用
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary flex-shrink-0">最近</span>
            <input type="number" min="0" className="input-field text-sm w-16 text-center" value={form.rollingDays} onChange={e => set({ rollingDays: e.target.value })} />
            <span className="text-xs text-text-secondary flex-shrink-0">天内最多领</span>
            <input type="number" min="0" className="input-field text-sm w-16 text-center" value={form.rollingLimit} onChange={e => set({ rollingLimit: e.target.value })} />
            <span className="text-xs text-text-secondary flex-shrink-0">张</span>
          </div>
        </div>

        <div className="mt-3">
          <p className="text-sm text-text-primary">每个自然周期内最多领取</p>
          <p className="text-[10px] text-text-light mt-0.5 mb-2">
            跨周期自动清零（每周按周一算起、每月按 1 号算起）。选「不限」即不启用
          </p>
          <div className="flex items-center gap-2">
            <select
              className="input-field text-sm flex-1"
              value={form.periodType}
              onChange={e => set({ periodType: e.target.value })}
            >
              <option value="none">不限</option>
              <option value="day">每天</option>
              <option value="week">每周</option>
              <option value="month">每月</option>
            </select>
            <input
              type="number"
              min="0"
              disabled={form.periodType === 'none'}
              className="input-field text-sm w-20 text-center disabled:opacity-50"
              value={form.periodCount}
              onChange={e => set({ periodCount: e.target.value })}
            />
            <span className="text-xs text-text-secondary flex-shrink-0">张</span>
          </div>
        </div>
      </div>

      {/* 消费者可见 */}
      <div className="flex items-center justify-between gap-3 border-t border-warm-100 pt-3">
        <div className="min-w-0">
          <p className="text-sm text-text-primary">消费者可见</p>
          <p className="text-[10px] text-text-light mt-0.5">
            关闭后消费者看不到、也不能自己领，只能你在后台推送；券本身仍然有效
          </p>
        </div>
        <Toggle on={form.visible} onClick={() => set({ visible: !form.visible })} />
      </div>

      {/* 可叠加 */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-text-primary">允许叠加使用</p>
          <p className="text-[10px] text-text-light mt-0.5">需两张券都开启，才能在同一笔订单同时使用</p>
        </div>
        <Toggle on={form.stackable} onClick={() => set({ stackable: !form.stackable })} />
      </div>

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex-1 py-2 rounded-xl border border-warm-200 text-sm text-text-secondary">
            取消
          </button>
        )}
        <button onClick={handleSubmit} disabled={submitting} className="btn-primary flex-1 text-sm py-2">
          {submitting ? '保存中...' : submitText}
        </button>
      </div>
    </div>
  )
}

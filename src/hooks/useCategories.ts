'use client'

import { useEffect, useState } from 'react'

/** 后台排版页拿不到配置时的兜底分类，与 settings 路由的 DEFAULT_LAYOUT 保持一致 */
export const DEFAULT_CATEGORIES = ['全部', '曲奇', '糖果', '零食', '礼盒']

/** 「全部」是首页筛选栏的固定项，不是真实分类，不能出现在商品表单里 */
export const ALL_CATEGORY = '全部'

/**
 * 读取店主在「后台 → 排版 → 分类」里维护的分类列表。
 *
 * 分类存在 ShopSetting.layout 的 JSON 里（不是独立表），所以只能走 /api/settings。
 * 商品表单此前把选项写死成四个，店主新增的分类因此选不到——这里统一收口。
 *
 * 返回的 categories 已剔除固定项「全部」。
 */
export function useCategories() {
  const [categories, setCategories] = useState<string[]>(
    DEFAULT_CATEGORIES.filter(c => c !== ALL_CATEGORY)
  )

  useEffect(() => {
    let alive = true
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (!alive) return
        const raw = data?.settings?.layout
        if (!raw) return
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        const list: unknown = parsed?.categories
        if (!Array.isArray(list)) return
        const cleaned = list
          .map(c => String(c ?? '').trim())
          .filter(c => c && c !== ALL_CATEGORY)
        if (cleaned.length) setCategories(cleaned)
      })
      .catch(() => {
        // 拿不到就沿用默认分类，不阻塞建品
      })
    return () => { alive = false }
  }, [])

  return categories
}

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { imgUrl } from '@/lib/utils'

export default function AdminProductsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [allProducts, setAllProducts] = useState<any[]>([])
  // 搜索词单独存一份：过滤态下不能排序（见 move 的说明），所以要能判断「现在是不是过滤态」
  const [keyword, setKeyword] = useState('')
  // 重排在途锁：请求没回来之前禁用所有 ↑↓，避免连点产生前后不一致的 payload
  const [reordering, setReordering] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { fetchProducts() }, [])

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products?pageSize=100')
      const data = await res.json()
      setAllProducts(data.products || [])
      setProducts(data.products || [])
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'on' ? 'off' : 'on'
    try {
      await fetch(`/api/products/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) })
      fetchProducts()
    } catch (err) { console.error(err) }
  }

  const deleteProduct = async (id: string) => {
    if (!confirm('确定要删除该商品吗？')) return
    try {
      await fetch(`/api/products/${id}`, { method: 'DELETE' })
      fetchProducts()
    } catch (err) { console.error(err) }
  }

  const flash = (text: string) => {
    setToast(text)
    setTimeout(() => setToast(''), 2500)
  }

  const onSearch = (kw: string) => {
    setKeyword(kw)
    if (!kw) { setProducts(allProducts); return }
    setProducts(allProducts.filter(p => p.name.includes(kw)))
  }

  /**
   * 上移/下移一位，并立刻把**完整**顺序存到服务端。
   *
   * 过滤态下直接不响应：搜出来的只是子集，在这里交换再提交，服务端会老老实实给这
   * 两件商品写 sort=1、2，而没被搜到的商品还留着原来的值——撞号之后整个顺序就乱了。
   * 而且「第一项」在过滤态下会显示成不可上移，本身也在误导店主。
   *
   * 乐观更新：先改本地数组让界面立刻响应，接口失败就整体回滚，避免界面显示一个
   * 根本没落库的顺序。
   */
  const move = async (index: number, direction: 'up' | 'down') => {
    if (reordering || keyword) return
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= allProducts.length) return

    const before = allProducts
    const next = [...before]
    const tmp = next[index]
    next[index] = next[target]
    next[target] = tmp

    setAllProducts(next)
    setProducts(next)
    setReordering(true)
    try {
      const res = await fetch('/api/products/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: next.map((p: any) => p.id) })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setAllProducts(before)
        setProducts(before)
        flash(data.error || '调整顺序失败，请重试')
      }
    } catch (err) {
      setAllProducts(before)
      setProducts(before)
      flash('网络异常，顺序没有保存')
    }
    setReordering(false)
  }

  const onCount = (products: any[]) => ({
    on: products.filter(p => p.status === 'on').length,
    off: products.filter(p => p.status === 'off').length,
    total: products.length
  })

  const counts = onCount(allProducts)

  return (
    <div className="page-container pt-4">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-white px-5 py-2.5 rounded-xl text-sm toast-enter">
          {toast}
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-lg font-bold text-text-primary">📦 商品管理</h1>
        <Link href="/admin/products/new" className="px-4 py-2 bg-gradient-to-r from-primary-500 to-primary-400 text-white text-xs rounded-full">＋ 新增</Link>
      </div>

      <div className="flex gap-2 mb-3">
        <span className="text-xs px-2 py-1 bg-warm-100 rounded-full">全部 {counts.total}</span>
        <span className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded-full">已上架 {counts.on}</span>
        <span className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded-full">已下架 {counts.off}</span>
      </div>

      <input
        className="input-field mb-2 text-sm"
        placeholder="搜索商品..."
        value={keyword}
        onChange={e => onSearch(e.target.value)}
      />

      <p className="text-xs text-text-light mb-3 leading-relaxed">
        {keyword
          ? '搜索状态下不能调整顺序，清除搜索后再调。'
          : '↑↓ 调整顺序，这个顺序就是顾客看到的顺序。'}
        　已下架的商品不在这里，也不参与排序。
      </p>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="card flex gap-3"><div className="w-16 h-16 skeleton rounded-xl" /><div className="flex-1 space-y-2"><div className="h-4 skeleton w-3/4" /><div className="h-3 skeleton w-1/2" /></div></div>)}</div>
      ) : products.length === 0 ? (
        <div className="text-center py-16"><p className="text-text-light">暂无商品</p></div>
      ) : (
        <div className="space-y-3">
          {products.map((p, index) => (
            <div key={p.id} className="card flex gap-3">
              <img src={imgUrl(JSON.parse(p.images || '[]')[0], 240) || '/placeholder.jpg'} className="w-16 h-16 rounded-xl bg-warm-100 object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{p.name}</p>
                <p className="text-primary-500 font-semibold text-sm mt-0.5">¥{p.price.toFixed(2)}</p>
                <p className="text-[10px] text-text-light mt-0.5">库存:{p.stock} | 已售:{p.sales}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* ↑↓ 单列放，不混进右边那三个按钮的竖排里，否则卡片会被撑得很高 */}
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => move(index, 'up')}
                    disabled={index === 0 || reordering || !!keyword}
                    title={keyword ? '清除搜索后才能调整顺序' : ''}
                    className="w-6 h-6 flex items-center justify-center rounded-full bg-warm-100 text-xs disabled:opacity-30"
                  >↑</button>
                  <button
                    onClick={() => move(index, 'down')}
                    disabled={index === allProducts.length - 1 || reordering || !!keyword}
                    title={keyword ? '清除搜索后才能调整顺序' : ''}
                    className="w-6 h-6 flex items-center justify-center rounded-full bg-warm-100 text-xs disabled:opacity-30"
                  >↓</button>
                </div>
                <div className="flex flex-col gap-1.5">
                  <button onClick={() => router.push(`/admin/products/${p.id}/edit`)} className="text-[10px] px-2.5 py-1 rounded-full border border-warm-300 text-text-secondary">编辑</button>
                  <button onClick={() => toggleStatus(p.id, p.status)} className={`text-[10px] px-2.5 py-1 rounded-full ${p.status === 'on' ? 'border border-yellow-300 text-yellow-600' : 'border border-green-300 text-green-600'}`}>{p.status === 'on' ? '下架' : '上架'}</button>
                  <button onClick={() => deleteProduct(p.id)} className="text-[10px] px-2.5 py-1 rounded-full border border-red-200 text-red-400">删除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

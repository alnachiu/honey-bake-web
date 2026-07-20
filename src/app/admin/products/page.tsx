'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function AdminProductsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [allProducts, setAllProducts] = useState<any[]>([])

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

  const onSearch = (keyword: string) => {
    if (!keyword) { setProducts(allProducts); return }
    setProducts(allProducts.filter(p => p.name.includes(keyword)))
  }

  const onCount = (products: any[]) => ({
    on: products.filter(p => p.status === 'on').length,
    off: products.filter(p => p.status === 'off').length,
    total: products.length
  })

  const counts = onCount(allProducts)

  return (
    <div className="page-container pt-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-lg font-bold text-text-primary">📦 商品管理</h1>
        <Link href="/admin/products/new" className="px-4 py-2 bg-gradient-to-r from-primary-500 to-primary-400 text-white text-xs rounded-full">＋ 新增</Link>
      </div>

      <div className="flex gap-2 mb-3">
        <span className="text-xs px-2 py-1 bg-warm-100 rounded-full">全部 {counts.total}</span>
        <span className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded-full">已上架 {counts.on}</span>
        <span className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded-full">已下架 {counts.off}</span>
      </div>

      <input className="input-field mb-4 text-sm" placeholder="搜索商品..." onChange={e => onSearch(e.target.value)} />

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="card flex gap-3"><div className="w-16 h-16 skeleton rounded-xl" /><div className="flex-1 space-y-2"><div className="h-4 skeleton w-3/4" /><div className="h-3 skeleton w-1/2" /></div></div>)}</div>
      ) : products.length === 0 ? (
        <div className="text-center py-16"><p className="text-text-light">暂无商品</p></div>
      ) : (
        <div className="space-y-3">
          {products.map(p => (
            <div key={p.id} className="card flex gap-3">
              <img src={(JSON.parse(p.images || '[]')[0]) || '/placeholder.jpg'} className="w-16 h-16 rounded-xl bg-warm-100 object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{p.name}</p>
                <p className="text-primary-500 font-semibold text-sm mt-0.5">¥{p.price.toFixed(2)}</p>
                <p className="text-[10px] text-text-light mt-0.5">库存:{p.stock} | 已售:{p.sales}</p>
              </div>
              <div className="flex flex-col gap-1.5 justify-center">
                <button onClick={() => router.push(`/admin/products/${p.id}/edit`)} className="text-[10px] px-2.5 py-1 rounded-full border border-warm-300 text-text-secondary">编辑</button>
                <button onClick={() => toggleStatus(p.id, p.status)} className={`text-[10px] px-2.5 py-1 rounded-full ${p.status === 'on' ? 'border border-yellow-300 text-yellow-600' : 'border border-green-300 text-green-600'}`}>{p.status === 'on' ? '下架' : '上架'}</button>
                <button onClick={() => deleteProduct(p.id)} className="text-[10px] px-2.5 py-1 rounded-full border border-red-200 text-red-400">删除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

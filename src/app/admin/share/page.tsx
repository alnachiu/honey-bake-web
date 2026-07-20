'use client'

import { useState, useEffect } from 'react'

export default function AdminSharePage() {
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setUrl(window.location.origin)
  }, [])

  const copyLink = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // QR code image URL using free API
  const qrUrl = url ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}` : ''

  return (
    <div className="page-container pt-4 animate-fade-in pb-20">
      <h1 className="text-lg font-bold text-text-primary mb-1">📱 分享店铺</h1>
      <p className="text-sm text-text-light mb-6">消费者微信扫码即可访问商城下单</p>

      <div className="card flex flex-col items-center py-8">
        {qrUrl && (
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-warm-100 mb-5">
            <img src={qrUrl} alt="商城二维码" className="w-56 h-56" />
          </div>
        )}

        <div className="w-full space-y-3">
          <div className="flex items-center gap-2 bg-warm-50 rounded-xl px-4 py-3">
            <span className="text-sm text-text-primary flex-1 truncate">{url}</span>
            <button onClick={copyLink} className="text-xs px-3 py-1.5 rounded-full bg-primary-500 text-white whitespace-nowrap">
              {copied ? '✅ 已复制' : '复制链接'}
            </button>
          </div>

          <div className="text-xs text-text-light text-center space-y-1">
            <p>💡 将二维码保存到手机相册</p>
            <p>发到微信群或朋友圈，好友长按识别即可打开</p>
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <p className="text-sm font-medium text-text-primary mb-2">📋 使用说明</p>
        <div className="text-xs text-text-secondary space-y-1.5">
          <p>① 把二维码保存到手机</p>
          <p>② 发到微信群/朋友圈</p>
          <p>③ 好友长按识别二维码 → 打开商城 → 注册账号 → 下单</p>
          <p className="mt-2 text-text-light">你也可以直接复制链接发到微信</p>
        </div>
      </div>
    </div>
  )
}

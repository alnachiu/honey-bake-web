'use client'

import Link from 'next/link'

interface ProductCardProps {
  product: {
    id: string
    name: string
    price: number
    originalPrice: number
    images: string
    sales: number
    unit: string
    tags: string
    description: string
    deliveryFee: number
  }
}

export default function ProductCard({ product }: ProductCardProps) {
  const images = parseImages(product.images)
  const tags = parseTags(product.tags)

  return (
    <Link href={`/products/${product.id}`} className="block bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="aspect-square bg-warm-100 overflow-hidden">
        <img
          src={images[0] || '/placeholder.jpg'}
          alt={product.name}
          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
        />
      </div>
      <div className="p-3">
        <h3 className="font-medium text-text-primary text-sm truncate">{product.name}</h3>
        {tags.length > 0 && (
          <div className="flex gap-1 mt-1.5">
            {tags.slice(0, 2).map((tag: string, i: number) => (
              <span key={i} className="px-1.5 py-0.5 bg-primary-50 text-primary-500 text-[10px] rounded-md">{tag}</span>
            ))}
          </div>
        )}
        <div className="flex items-end justify-between mt-2">
          <div>
            <span className="text-primary-500 font-bold text-lg">¥{product.price.toFixed(2)}</span>
            {product.originalPrice > product.price && (
              <span className="text-text-light text-xs line-through ml-1.5">¥{product.originalPrice.toFixed(2)}</span>
            )}
            {product.deliveryFee > 0 && (
              <p className="text-[10px] text-text-light">+邮费¥{Number(product.deliveryFee).toFixed(2)}</p>
            )}
          </div>
          <span className="text-text-light text-[10px]">已售{product.sales}{product.unit}</span>
        </div>
      </div>
    </Link>
  )
}

function parseImages(images: string): string[] {
  try { return JSON.parse(images) }
  catch { return images ? [images] : [] }
}

function parseTags(tags: string): string[] {
  try { return JSON.parse(tags) }
  catch { return tags ? tags.split(',').map(t => t.trim()) : [] }
}

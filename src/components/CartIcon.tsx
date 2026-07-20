'use client'

import { useCart } from './CartProvider'

export default function CartIcon() {
  const { totalCount } = useCart()

  return (
    <div className="relative">
      🛒
      {totalCount > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full font-medium">
          {totalCount > 99 ? '99+' : totalCount}
        </span>
      )}
    </div>
  )
}

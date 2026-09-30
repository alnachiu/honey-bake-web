import { reorder } from '@/lib/reorder'

// 店主在「后台 → 商品管理」用「↑↓」调整顺序。body: { ids: string[] }
// 注意本路由是静态段，和同级的 [id]/route.ts 不冲突：Next 的静态路由优先级高于动态段
// （同目录下 api/coupons/claim 与 api/coupons/[id]/push 已经这样并存）。
export async function PUT(request: Request) {
  return reorder(request, 'product')
}

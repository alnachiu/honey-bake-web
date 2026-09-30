import { reorder } from '@/lib/reorder'

// 店主在「后台 → 优惠券」用「↑↓」调整顺序。body: { ids: string[] }
// 这是 sort 列唯一的写入者——优惠券的 PUT 是全量覆盖，不能把 sort 交给它（详见 src/lib/reorder.ts）。
export async function PUT(request: Request) {
  return reorder(request, 'coupon')
}

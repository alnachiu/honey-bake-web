import { useCallback, useEffect, useRef } from 'react'

/**
 * 长按手势。项目里此前没有任何手势代码，所以这个 hook 要把移动端长按的几个坑都堵住：
 *
 * 1. **滚动时不能误触发**：手指按下后如果竖向滑动（用户在翻列表），必须取消计时。
 *    只在位移超过阈值时取消是不够的，触屏的抖动就能超过几像素，所以阈值给 10px。
 * 2. **长按之后必须吞掉紧随其后的 click**：菜单项本身多半带 onClick（比如点进详情、
 *    跳转链接）。不拦的话，长按弹删除确认的同时还会跳走一次，用户会以为点错了。
 * 3. **桌面右键等效**：桌面端没有长按，用 onContextMenu 提供同一入口。
 * 4. **Android 的 contextmenu 会和计时器打架**：部分浏览器长按时会自己抛 contextmenu，
 *    于是计时器已经弹过一次，contextmenu 又弹一次。用一个时间窗去重。
 * 5. **iOS 长按会弹系统选择菜单**：那属于 CSS 的事，调用方要配
 *    `WebkitTouchCallout: 'none'` + `userSelect: 'none'`（见 LONG_PRESS_STYLE）。
 */

type LongPressOptions = {
  /** 按住多久算长按（毫秒） */
  delay?: number
  /** 手指位移超过多少像素就取消，用于区分「长按」和「滚动」 */
  moveThreshold?: number
}

/**
 * 长按目标上要一并铺开的样式。iOS 上不关掉 callout 的话，
 * 长按会先弹出「拷贝 / 查询」这种系统菜单，把我们的确认框压在下面。
 */
export const LONG_PRESS_STYLE = {
  WebkitTouchCallout: 'none' as const,
  WebkitUserSelect: 'none' as const,
  userSelect: 'none' as const
}

export function useLongPress(onLongPress: () => void, options: LongPressOptions = {}) {
  const { delay = 500, moveThreshold = 10 } = options

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  /**
   * 长按触发的时刻。用时刻而不是布尔值：长按之后浏览器不一定补发 click，
   * 布尔标记会一直挂着 true，把**下一次正常的点击**也吞掉。
   * 时间窗能保证只有紧跟在长按后面的那一次点击被拦。
   */
  const firedAt = useRef(0)
  const SWALLOW_WINDOW = 700

  // 回调放进 ref：调用方每次渲染传进来的多半是新函数，
  // 直接进 useCallback 依赖会让计时器被反复重建。
  const callback = useRef(onLongPress)
  callback.current = onLongPress

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    origin.current = null
  }, [])

  // 组件卸载时清掉还挂着的定时器，否则会在已卸载的组件上触发回调
  useEffect(() => cancel, [cancel])

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0]
      if (!touch) return
      cancel()
      origin.current = { x: touch.clientX, y: touch.clientY }
      timer.current = setTimeout(() => {
        timer.current = null
        firedAt.current = Date.now()
        callback.current()
      }, delay)
    },
    [cancel, delay]
  )

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0]
      if (!touch || !origin.current) return
      const dx = Math.abs(touch.clientX - origin.current.x)
      const dy = Math.abs(touch.clientY - origin.current.y)
      // 判定成滚动就彻底放弃这次长按，移回来也不恢复——
      // 否则手指来回晃一下就会在滚动途中突然弹出确认框
      if (dx > moveThreshold || dy > moveThreshold) cancel()
    },
    [cancel, moveThreshold]
  )

  const onTouchEnd = useCallback(() => cancel(), [cancel])
  const onTouchCancel = useCallback(() => cancel(), [cancel])

  /** 桌面端右键 = 长按。Android 部分浏览器长按时也会抛这个事件，用时间窗去重 */
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const since = Date.now() - firedAt.current
    if (since < SWALLOW_WINDOW) return // 计时器刚弹过，不重复弹
    cancel()
    firedAt.current = Date.now()
    callback.current()
  }, [cancel])

  /**
   * 捕获阶段拦掉长按后紧跟的 click。
   * React 在同一元素上 onClickCapture 一定先于 onClick 执行，
   * 这里 stopPropagation 之后元素自己的 onClick 就不会跑了。
   */
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (Date.now() - firedAt.current < SWALLOW_WINDOW) {
      firedAt.current = 0
      e.preventDefault()
      e.stopPropagation()
    }
  }, [])

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onContextMenu, onClickCapture }
}

'use client'

import { useEffect, useRef } from 'react'

/**
 * 定时刷新 + 回到前台/重新聚焦时立刻刷新一次。
 *
 * 用于「店主在后台改了状态，消费者端要自己看到变化」这类场景：
 * 项目是纯客户端守卫 + 每次进页面才拉数据，没有 websocket，轮询是成本最低的做法。
 *
 * 三个关键点：
 * ① 回调存在 ref 里 —— 否则调用方每次 render 都产生新函数，effect 反复重建、
 *    定时器被无限重置，结果永远不会触发。这是这类 hook 最常见的失效原因。
 * ② 页面不可见时不发请求 —— 手机端切走后仍每分钟打接口既费电又费流量。
 * ③ 重新可见时先补一次再重启计时 —— 后台期间浏览器会节流定时器，
 *    不补这一次用户切回来看到的还是旧数据。
 *
 * 回调应当是**静默刷新**（不要在里面 setLoading(true)），否则每次轮询
 * 页面都会闪一遍骨架屏。
 */
export function useAutoRefresh(
  fn: () => void | Promise<void>,
  intervalMs = 20000,
  enabled = true
) {
  const saved = useRef(fn)
  saved.current = fn

  useEffect(() => {
    if (!enabled) return

    let timer: ReturnType<typeof setInterval>

    const tick = () => {
      if (document.visibilityState === 'visible') saved.current()
    }
    const restart = () => {
      clearInterval(timer)
      timer = setInterval(tick, intervalMs)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        tick()
        restart()
      }
    }

    restart()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [intervalMs, enabled])
}

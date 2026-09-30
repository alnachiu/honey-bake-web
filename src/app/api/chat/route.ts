import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { notifyAdmins } from '@/lib/notify'
import { purgeExpiredChats, chatExpireAt, chatPreview, visibleTo, CHAT_RETENTION_DAYS } from '@/lib/chat'

/**
 * 单条消息的长度上限。
 *
 * 这是临时沟通用的通道，不该被当成留言板用；再说用户把整篇小作文粘进来，
 * 店主侧那个列表预览也就废了。超长直接截断而不是报错——用户正打着字，
 * 弹个「太长」让他自己删比帮他截断更烦人。
 */
const MAX_BODY = 500

/** 一次最多返回多少条历史消息，防止老会话把响应体撑大 */
const MAX_HISTORY = 200

/**
 * 会话列表里带上最后一条消息，用于列表预览。
 *
 * take: 1 的 where 必须带 visibleTo：不带的话，店主清空过某条会话之后，
 * 列表预览显示的会是那条已经被他自己清掉的消息。
 */
const conversationListInclude = (viewer: 'user' | 'admin') => ({
  user: { select: { id: true, name: true, phone: true, email: true } },
  messages: { where: visibleTo(viewer), orderBy: { createdAt: 'desc' as const }, take: 1 }
})

/**
 * 单个会话的消息拉取：取最新 N 条再翻回正序（直接正序 take 会拿到最老的 N 条）。
 * viewer 决定过滤哪一边的「已清除」标记——只从清除方自己这边消失。
 */
async function loadMessages(conversationId: string, viewer: 'user' | 'admin') {
  const rows = await prisma.chatMessage.findMany({
    where: { conversationId, ...visibleTo(viewer) },
    orderBy: { createdAt: 'desc' },
    take: MAX_HISTORY
  })
  return rows.reverse()
}

export async function GET(request: Request) {
  try {
    const user = await requireAuth()

    // 惰性清理挂在这里：任何一方打开聊天，顺手把双方都闲置超过 7 天的会话清掉。
    // 放在 requireAuth 之后，免得未登录请求也能触发删除。
    await purgeExpiredChats()

    if (user.role === 'admin') {
      const targetUserId = new URL(request.url).searchParams.get('userId')

      // 店主点了某个顾客 → 只回这一个会话的消息
      if (targetUserId) {
        const conversation = await prisma.chatConversation.findUnique({
          where: { userId: targetUserId },
          include: { user: { select: { id: true, name: true, phone: true, email: true } } }
        })
        if (!conversation) {
          // 还没聊过：不是错误，前端据此渲染一个空聊天窗
          const target = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: { id: true, name: true, phone: true, email: true }
          })
          if (!target) return NextResponse.json({ error: '用户不存在' }, { status: 404 })
          return NextResponse.json({
            role: 'admin',
            conversation: null,
            peer: target,
            messages: [],
            retentionDays: CHAT_RETENTION_DAYS
          })
        }
        return NextResponse.json({
          role: 'admin',
          conversation: { id: conversation.id, lastMessageAt: conversation.lastMessageAt },
          peer: conversation.user,
          messages: await loadMessages(conversation.id, 'admin'),
          expireAt: chatExpireAt(conversation.lastMessageAt),
          retentionDays: CHAT_RETENTION_DAYS
        })
      }

      // 没带 userId → 会话列表
      const allConversations = await prisma.chatConversation.findMany({
        orderBy: { lastMessageAt: 'desc' },
        include: conversationListInclude('admin')
      })

      // 店主清空过的会话，在**他这边**不该再出现。判据是「这个会话里还有没有
      // 他能看见的消息」——一条都没有就藏起来；顾客之后又发消息，那条新消息
      // deletedForAdmin=false，会话自己就重新冒出来了，不需要额外的还原逻辑。
      const conversations = allConversations.filter(c => c.messages.length > 0)

      // 未读 = 对方发来且我没读过的。此处不区分是哪个管理员读的：
      // 店主账号可能不止一个（notifyAdmins 也是广播给所有 role='admin' 的账号），
      // 让一个管理员读过就算读过，比每个管理员各维护一份未读状态简单得多，
      // 也符合「店里就一个柜台」的实际使用场景。
      const grouped = conversations.length
        ? await prisma.chatMessage.groupBy({
            by: ['conversationId'],
            where: {
              conversationId: { in: conversations.map(c => c.id) },
              senderRole: 'user',
              readAt: null,
              // 已清掉的消息不该再贡献未读数，否则店主清空后角标还挂着数字
              deletedForAdmin: false
            },
            _count: { _all: true }
          })
        : []
      const unreadMap = new Map(grouped.map(g => [g.conversationId, g._count._all]))

      return NextResponse.json({
        role: 'admin',
        conversations: conversations.map(c => {
          const last = c.messages[0]
          return {
            id: c.id,
            userId: c.userId,
            name: c.user?.name || '未知用户',
            // 手机号是店主认人的第一依据（顾客名常是「小王」这类），没有就退回邮箱
            phone: c.user?.phone || c.user?.email || '',
            lastMessage: last?.body || '',
            lastMessageRole: last?.senderRole || '',
            lastMessageAt: c.lastMessageAt,
            unread: unreadMap.get(c.id) || 0,
            expireAt: chatExpireAt(c.lastMessageAt)
          }
        }),
        retentionDays: CHAT_RETENTION_DAYS
      })
    }

    // 消费者：只可能有一条会话
    const conversation = await prisma.chatConversation.findUnique({ where: { userId: user.id } })
    return NextResponse.json({
      role: 'user',
      conversation: conversation
        ? { id: conversation.id, lastMessageAt: conversation.lastMessageAt }
        : null,
      messages: conversation ? await loadMessages(conversation.id, 'user') : [],
      expireAt: conversation ? chatExpireAt(conversation.lastMessageAt) : null,
      retentionDays: CHAT_RETENTION_DAYS
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '获取消息失败' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const data = await request.json()

    const body = String(data.body || '').trim().slice(0, MAX_BODY)
    if (!body) {
      return NextResponse.json({ error: '消息不能为空' }, { status: 400 })
    }

    const isAdmin = user.role === 'admin'
    // 店主必须指明发给谁；消费者只可能发给自己那条会话，传了 userId 也不认，
    // 免得构造一个别人的 id 就能往别人会话里塞消息。
    const targetUserId = isAdmin ? String(data.userId || '') : user.id
    if (!targetUserId) {
      return NextResponse.json({ error: '请指定要回复的顾客' }, { status: 400 })
    }

    if (isAdmin && targetUserId === user.id) {
      return NextResponse.json({ error: '不能给自己发消息' }, { status: 400 })
    }

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, role: true }
    })
    if (!target) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 })
    }

    const now = new Date()
    const senderRole = isAdmin ? 'admin' : 'user'

    // 会话 upsert、写消息、发通知必须在一起：只写了消息没更新 lastMessageAt，
    // 会话会被 7 天清理提前误删（它按 lastMessageAt 计时）。
    const message = await prisma.$transaction(async tx => {
      const conversation = await tx.chatConversation.upsert({
        where: { userId: target.id },
        create: { userId: target.id, lastMessageAt: now },
        update: { lastMessageAt: now }
      })

      const created = await tx.chatMessage.create({
        data: { conversationId: conversation.id, senderRole, body }
      })

      if (isAdmin) {
        await tx.notification.create({
          data: {
            userId: target.id,
            title: '💬 店主回复了你',
            content: chatPreview(body),
            type: 'chat',
            link: '/chat'
          }
        })
      } else {
        await notifyAdmins(tx, {
          title: '💬 顾客发来消息',
          content: `${target.name || '顾客'}：${chatPreview(body)}`,
          type: 'chat',
          // 带上 userId，店主从通知点进来直接落在那条会话上
          link: `/chat?userId=${target.id}`
        })
      }

      return created
    })

    return NextResponse.json({ message, expireAt: chatExpireAt(now) })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '发送失败' }, { status: 500 })
  }
}

/** 标记已读：把「对方发来的、自己还没看过的」全部盖上一个时刻 */
export async function PUT(request: Request) {
  try {
    const user = await requireAuth()
    let userId = ''
    try {
      const data = await request.json()
      userId = String(data?.userId || '')
    } catch {
      // 没带 body 是正常的：消费者只需要标记自己那条会话
    }

    if (user.role === 'admin') {
      if (!userId) {
        return NextResponse.json({ error: '请指定会话' }, { status: 400 })
      }
      const conversation = await prisma.chatConversation.findUnique({ where: { userId } })
      if (!conversation) return NextResponse.json({ success: true, count: 0 })

      const { count } = await prisma.chatMessage.updateMany({
        where: { conversationId: conversation.id, senderRole: 'user', readAt: null },
        data: { readAt: new Date() }
      })
      return NextResponse.json({ success: true, count })
    }

    const conversation = await prisma.chatConversation.findUnique({ where: { userId: user.id } })
    if (!conversation) return NextResponse.json({ success: true, count: 0 })

    const { count } = await prisma.chatMessage.updateMany({
      where: { conversationId: conversation.id, senderRole: 'admin', readAt: null },
      data: { readAt: new Date() }
    })
    return NextResponse.json({ success: true, count })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 500 })
  }
}

/**
 * 清空聊天。**只从调用方自己这边消失**，对方的记录一条不动。
 *
 * 实现是给自己这边打个标记（ChatMessage.deletedForUser / deletedForAdmin），
 * 公共的消息行仍然留着——因为对面还要看。真正的物理删除由 7 天闲置清理兜底
 * （chat.ts 的 purgeExpiredChats），那时双方都不再需要了。
 *
 * 消费者清自己的那条会话；店主必须带 userId 指明清哪个顾客，不传就报错——
 * 否则一个手滑的 DELETE 会把所有会话从店主这边一次性抹掉。
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireAuth()
    let userId = ''
    try {
      const data = await request.json()
      userId = String(data?.userId || '')
    } catch {
      // 消费者清空自己那条会话时不需要 body
    }

    if (user.role === 'admin') {
      if (!userId) {
        return NextResponse.json({ error: '请指定要清空的会话' }, { status: 400 })
      }
      const conversation = await prisma.chatConversation.findUnique({ where: { userId } })
      if (!conversation) return NextResponse.json({ success: true, count: 0 })

      const { count } = await prisma.chatMessage.updateMany({
        where: { conversationId: conversation.id, deletedForAdmin: false },
        data: { deletedForAdmin: true }
      })
      return NextResponse.json({ success: true, count })
    }

    const conversation = await prisma.chatConversation.findUnique({ where: { userId: user.id } })
    if (!conversation) return NextResponse.json({ success: true, count: 0 })

    const { count } = await prisma.chatMessage.updateMany({
      where: { conversationId: conversation.id, deletedForUser: false },
      data: { deletedForUser: true }
    })
    return NextResponse.json({ success: true, count })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '清空失败' }, { status: 500 })
  }
}

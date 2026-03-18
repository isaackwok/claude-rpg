import { useEffect, useState } from 'react'
import { useTranslation } from '../../i18n'
import { EventBus } from '../../game/EventBus'
import type { LocalizedString } from '../../../../shared/types'

interface QuestToast {
  id: number
  type: 'completed' | 'discovered'
  title?: LocalizedString
  xpReward?: number
}

let toastId = 0

export function QuestNotification() {
  const { t, locale } = useTranslation()
  const [toasts, setToasts] = useState<QuestToast[]>([])

  useEffect(() => {
    const handleCompleted = (data: {
      questId: string
      title: LocalizedString
      xpReward: number
    }) => {
      const id = ++toastId
      setToasts((prev) => [
        ...prev,
        { id, type: 'completed', title: data.title, xpReward: data.xpReward }
      ])
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
    }

    const handleDiscovered = () => {
      const id = ++toastId
      setToasts((prev) => [...prev, { id, type: 'discovered' }])
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
    }

    EventBus.on('quest:completed', handleCompleted)
    EventBus.on('quest:discovered', handleDiscovered)
    return () => {
      EventBus.off('quest:completed', handleCompleted)
      EventBus.off('quest:discovered', handleDiscovered)
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
        zIndex: 250
      }}
    >
      {toasts.map((toast) => {
        const isCompleted = toast.type === 'completed'
        const titleText = toast.title?.[locale] ?? toast.title?.['zh-TW'] ?? ''

        return (
          <div
            key={toast.id}
            style={{
              fontFamily: 'monospace',
              fontSize: isCompleted ? 18 : 14,
              fontWeight: 'bold',
              color: isCompleted ? '#ffd700' : '#e8d5a8',
              textShadow: isCompleted
                ? '0 0 16px rgba(255, 215, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.8)'
                : '0 2px 4px rgba(0, 0, 0, 0.8)',
              textAlign: 'center',
              animation: 'fadeInOut 3s ease-in-out'
            }}
          >
            {isCompleted
              ? `🎉 ${t('quests.completed')} ${titleText} +${toast.xpReward} XP`
              : `📜 ${t('quests.discovered')} ${t('quests.discoveredDetail')}`}
          </div>
        )
      })}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../i18n'
import { EventBus } from '../../game/EventBus'
import type { BookItem } from '../../../../shared/item-types'

interface ItemToast {
  id: number
  bookName: string
}

// Module-level counter ensures unique toast IDs across component re-mounts
let toastId = 0

export function ItemNotification() {
  const { t } = useTranslation()
  const [toasts, setToasts] = useState<ItemToast[]>([])
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  useEffect(() => {
    const handleItemAdded = (data: { item: BookItem }) => {
      const toast: ItemToast = {
        id: ++toastId,
        bookName: data.item.name
      }
      setToasts((prev) => [...prev, toast])
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id))
        timersRef.current.delete(timer)
      }, 3000)
      timersRef.current.add(timer)
    }

    EventBus.on('item:added', handleItemAdded)
    return () => {
      EventBus.off('item:added', handleItemAdded)
      for (const timer of timersRef.current) clearTimeout(timer)
      timersRef.current.clear()
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <>
      <style>{`
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateY(-8px); }
          15% { opacity: 1; transform: translateY(0); }
          85% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
      <div
        style={{
          position: 'absolute',
          top: 100,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
          zIndex: 250
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              fontFamily: 'monospace',
              fontSize: 14,
              fontWeight: 'bold',
              color: '#e8d5a8',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
              textAlign: 'center',
              animation: 'fadeInOut 3s ease-in-out'
            }}
          >
            {`🎒 ${t('dialogue.addedToBackpack', { name: toast.bookName })}`}
          </div>
        ))}
      </div>
    </>
  )
}

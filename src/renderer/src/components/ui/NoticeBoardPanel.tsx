import { useState, useEffect } from 'react'
import { useTranslation } from '../../i18n'
import type { ApprovedFolder } from '../../../../shared/types'

interface NoticeBoardPanelProps {
  onClose: () => void
}

export function NoticeBoardPanel({ onClose }: NoticeBoardPanelProps) {
  const { t } = useTranslation()
  const [folders, setFolders] = useState<ApprovedFolder[]>([])

  const refresh = () => {
    window.api.getApprovedFolders().then(setFolders)
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleAdd = async () => {
    await window.api.selectAndAddFolder()
    refresh()
  }

  const handleRemove = async (path: string) => {
    await window.api.removeApprovedFolder(path)
    refresh()
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.7)',
        pointerEvents: 'auto',
        zIndex: 100
      }}
    >
      <div
        style={{
          background: 'rgba(10, 10, 30, 0.97)',
          border: '3px solid rgba(200, 180, 140, 0.6)',
          borderRadius: 4,
          width: 500,
          maxWidth: '90vw',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'monospace',
          color: '#ffffff'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(200, 180, 140, 0.3)',
            fontWeight: 'bold',
            fontSize: 16,
            color: '#c4a46c',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>📜 {t('noticeBoard.title')}</span>
          <span onClick={onClose} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 12 }}>
            {t('noticeBoard.close')}
          </span>
        </div>

        {/* Folder list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {folders.length === 0 ? (
            <div style={{ opacity: 0.5, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              {t('noticeBoard.empty')}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>
                {t('noticeBoard.postedScrolls')}
              </div>
              {folders.map((folder) => (
                <div
                  key={folder.path}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    marginBottom: 6,
                    background: 'rgba(200, 180, 140, 0.08)',
                    border: '1px solid rgba(200, 180, 140, 0.15)',
                    borderRadius: 3
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, color: '#e0c888' }}>📁 {folder.label}</div>
                    <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>{folder.path}</div>
                    <div style={{ fontSize: 10, opacity: 0.3, marginTop: 2 }}>
                      {t('noticeBoard.postedOn')} {new Date(folder.addedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(folder.path)}
                    style={{
                      padding: '3px 8px',
                      fontFamily: 'monospace',
                      fontSize: 11,
                      background: 'rgba(255, 100, 100, 0.15)',
                      border: '1px solid rgba(255, 100, 100, 0.3)',
                      color: '#ff8888',
                      cursor: 'pointer',
                      borderRadius: 3
                    }}
                  >
                    {t('noticeBoard.remove')}
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Actions */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(200, 180, 140, 0.3)',
            display: 'flex',
            justifyContent: 'space-between'
          }}
        >
          <button
            onClick={handleAdd}
            style={{
              padding: '6px 16px',
              fontFamily: 'monospace',
              fontSize: 13,
              background: 'rgba(200,180,140,0.3)',
              border: '1px solid rgba(200,180,140,0.6)',
              color: '#c4a46c',
              cursor: 'pointer',
              borderRadius: 3
            }}
          >
            + {t('noticeBoard.postNew')}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              fontFamily: 'monospace',
              fontSize: 13,
              background: 'rgba(100,100,100,0.3)',
              border: '1px solid rgba(150,150,150,0.4)',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              borderRadius: 3
            }}
          >
            {t('noticeBoard.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

import type { CSSProperties } from 'react'
import { useTranslation } from '../../i18n'

const baseStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(200, 180, 140, 0.5)',
  cursor: 'pointer',
  fontFamily: 'monospace',
  padding: '2px 6px'
}

export function CloseButton({ onClick, size = 12 }: { onClick: () => void; size?: number }) {
  const { t } = useTranslation()
  return (
    <button onClick={onClick} style={{ ...baseStyle, fontSize: size }}>
      {t('common.close')}
    </button>
  )
}

import { EventBus } from '../../game/EventBus'

export function SettingsGearButton() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        pointerEvents: 'auto',
        zIndex: 100
      }}
    >
      <button
        onClick={() => EventBus.emit('settings:toggle', {})}
        title="Settings"
        style={{
          width: 36,
          height: 36,
          borderRadius: 6,
          background: 'rgba(10, 10, 30, 0.8)',
          border: '2px solid rgba(200, 180, 140, 0.4)',
          color: '#c4a46c',
          fontSize: 18,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 0.15s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(200, 180, 140, 0.7)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(200, 180, 140, 0.4)'
        }}
      >
        ⚙
      </button>
    </div>
  )
}

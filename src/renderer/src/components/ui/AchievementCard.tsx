import type { PlayerAchievement } from '../../../../shared/achievement-types'

interface AchievementCardProps {
  achievement: PlayerAchievement
  locale: string
}

export function AchievementCard({ achievement, locale }: AchievementCardProps) {
  const { definition: def, unlocked } = achievement

  const title = def.title[locale] ?? def.title['zh-TW'] ?? ''

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        padding: '6px 8px',
        background: unlocked ? 'rgba(200, 180, 140, 0.12)' : 'rgba(200, 180, 140, 0.05)',
        border: unlocked
          ? '1px solid rgba(200, 180, 140, 0.3)'
          : '1px solid rgba(200, 180, 140, 0.15)',
        borderRadius: 6,
        opacity: unlocked ? 1 : 0.5,
        minWidth: 0
      }}
    >
      {/* Icon */}
      <span
        style={{
          fontSize: 16,
          flexShrink: 0,
          filter: unlocked ? undefined : 'grayscale(1)'
        }}
      >
        {def.icon}
      </span>

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 'bold',
            color: unlocked ? '#e8d5a8' : '#a89060',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 9,
            color: '#a89060',
            marginTop: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {def.description[locale] ?? def.description['zh-TW'] ?? ''}
        </div>
        {unlocked && def.cosmeticReward && (
          <div style={{ fontSize: 9, color: '#c4a46c', marginTop: 1 }}>
            🎨 {def.cosmeticReward}
          </div>
        )}
      </div>

      {/* Status indicator */}
      <span style={{ fontSize: 12, flexShrink: 0, color: unlocked ? '#ffd700' : '#a89060' }}>
        {unlocked ? '✓' : '🔒'}
      </span>
    </div>
  )
}

import { useTranslation } from '../../i18n'
import { AchievementCard } from './AchievementCard'
import type { PlayerAchievement } from '../../../../shared/achievement-types'
import type { AchievementCategory } from '../../../../shared/achievement-types'

interface AchievementsTabProps {
  achievements: PlayerAchievement[]
  unlockedCount: number
  totalCount: number
}

const CATEGORIES: { key: AchievementCategory; icon: string; i18nKey: string }[] = [
  { key: 'progression', icon: '⚔️', i18nKey: 'achievements.categories.progression' },
  { key: 'exploration', icon: '🗺️', i18nKey: 'achievements.categories.exploration' },
  { key: 'tool_use', icon: '🔧', i18nKey: 'achievements.categories.tool_use' }
]

export function AchievementsTab({
  achievements,
  unlockedCount,
  totalCount
}: AchievementsTabProps): React.JSX.Element {
  const { t, locale } = useTranslation()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 'bold', color: '#e8d5a8' }}>
          🏆 {t('achievements.title')}
        </div>
        <div style={{ fontSize: 12, color: '#a89060', marginTop: 4 }}>
          {t('achievements.count', {
            unlocked: String(unlockedCount),
            total: String(totalCount)
          })}
        </div>
      </div>

      {/* Category sections */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}
      >
        {CATEGORIES.map((cat) => {
          const catAchievements = achievements.filter((a) => a.definition.category === cat.key)

          // Unlocked first, then locked
          const sorted = [...catAchievements].sort((a, b) => {
            if (a.unlocked && !b.unlocked) return -1
            if (!a.unlocked && b.unlocked) return 1
            return 0
          })

          if (sorted.length === 0) return null

          return (
            <div key={cat.key}>
              {/* Category divider */}
              <div
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  color: '#a89060',
                  borderBottom: '1px solid rgba(200, 180, 140, 0.2)',
                  paddingBottom: 4,
                  marginBottom: 6
                }}
              >
                {cat.icon} {t(cat.i18nKey)}
              </div>

              {/* Achievement cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 6
                }}
              >
                {sorted.map((achievement) => (
                  <AchievementCard
                    key={achievement.achievementDefId}
                    achievement={achievement}
                    locale={locale}
                  />
                ))}
              </div>
            </div>
          )
        })}

        {achievements.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: 'rgba(200, 180, 140, 0.4)',
              padding: 24,
              fontSize: 13
            }}
          >
            —
          </div>
        )}
      </div>
    </div>
  )
}

import { useTranslation } from '../../i18n'
import type { PlayerQuest } from '../../../../shared/types'
import { CATEGORY_COLORS } from '../../utils/itemUtils'

interface QuestCardProps {
  quest: PlayerQuest
}

export function QuestCard({ quest }: QuestCardProps) {
  const { t, locale } = useTranslation()
  const { definition: def, status, visibility } = quest

  const isHinted = visibility === 'hinted' && status === 'active'
  const isCompleted = status === 'completed'

  const name = def.name[locale] ?? def.name['zh-TW'] ?? ''
  const nameSecondary =
    locale === 'zh-TW' ? def.name['en'] : locale === 'en' ? def.name['zh-TW'] : ''
  const description = def.description[locale] ?? def.description['zh-TW'] ?? ''

  // Hinted (mystery) card — only hidden quests have hintText
  if (isHinted && def.initialVisibility === 'hidden' && def.hintText) {
    const hint = def.hintText[locale] ?? def.hintText['zh-TW'] ?? ''
    return (
      <div
        style={{
          background: 'rgba(200, 180, 140, 0.04)',
          border: '1px solid rgba(200, 180, 140, 0.15)',
          borderRadius: 6,
          padding: '12px 16px',
          opacity: 0.7
        }}
      >
        <div style={{ fontSize: 14, color: '#a89060', fontStyle: 'italic' }}>
          {t('quests.mystery')}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(200, 180, 140, 0.5)', marginTop: 4 }}>{hint}</div>
      </div>
    )
  }

  const progressPercent =
    quest.target > 0 ? Math.min((quest.progress / quest.target) * 100, 100) : 0
  const skillColor =
    def.skillCategories.length > 0 ? CATEGORY_COLORS[def.skillCategories[0]] : '#c4a46c'

  return (
    <div
      style={{
        background: 'rgba(200, 180, 140, 0.08)',
        border: '1px solid rgba(200, 180, 140, 0.25)',
        borderRadius: 6,
        padding: '12px 16px',
        opacity: isCompleted ? 0.6 : 1,
        transition: 'opacity 0.3s ease'
      }}
    >
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{def.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 'bold', color: '#e8d5a8' }}>
            {isCompleted ? '✓ ' : ''}
            {name}
          </div>
          {nameSecondary && <div style={{ fontSize: 11, color: '#a89060' }}>{nameSecondary}</div>}
        </div>
        {/* Status badge */}
        <span
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 4,
            background: isCompleted ? 'rgba(100, 200, 100, 0.15)' : 'rgba(200, 180, 140, 0.15)',
            color: isCompleted ? '#4ade80' : '#c4a46c'
          }}
        >
          {isCompleted ? t('quests.status.completed') : t('quests.status.active')}
        </span>
      </div>

      {/* Description */}
      <div style={{ fontSize: 12, color: '#a89060', marginTop: 6 }}>{description}</div>

      {/* Progress bar (active quests only) */}
      {!isCompleted && (
        <div style={{ marginTop: 8 }}>
          <div
            style={{
              height: 6,
              background: 'rgba(200, 180, 140, 0.15)',
              borderRadius: 3,
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progressPercent}%`,
                background: skillColor,
                borderRadius: 3,
                transition: 'width 0.5s ease'
              }}
            />
          </div>
          <div
            style={{
              fontSize: 11,
              color: '#a89060',
              marginTop: 4,
              display: 'flex',
              justifyContent: 'space-between'
            }}
          >
            <span>
              {t('quests.progress', {
                current: String(quest.progress),
                target: String(quest.target)
              })}
            </span>
            <span style={{ color: '#ffd700' }}>
              {t('quests.reward', { amount: String(def.xpReward) })}
            </span>
          </div>
        </div>
      )}

      {/* Completed: earned XP */}
      {isCompleted && (
        <div style={{ marginTop: 6, fontSize: 12 }}>
          <span style={{ color: '#4ade80' }}>
            {t('quests.earned', { amount: String(def.xpReward) })}
          </span>
          {quest.repeatCount > 0 && (
            <span style={{ color: '#a89060', marginLeft: 8 }}>
              {t('quests.repeatedTimes', { count: String(quest.repeatCount) })}
            </span>
          )}
        </div>
      )}

      {/* Skill category tags */}
      {def.skillCategories.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          {def.skillCategories.map((cat) => (
            <span
              key={cat}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 3,
                background: `${CATEGORY_COLORS[cat]}22`,
                color: CATEGORY_COLORS[cat]
              }}
            >
              {t(`skills.categories.${cat}`)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

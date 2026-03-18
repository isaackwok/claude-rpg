import { useRef } from 'react'
import { useTranslation } from '../../i18n'
import { useProgression } from '../../hooks/useProgression'
import { SKILL_CATEGORIES, type SkillCategory } from '../../../../shared/types'

const SKILL_ICONS: Record<SkillCategory, string> = {
  writing: '\u270d\ufe0f',
  research: '\ud83d\udd0d',
  code: '\ud83d\udcbb',
  data: '\ud83d\udcca',
  communication: '\ud83d\udcac',
  organization: '\ud83d\udccb',
  visual: '\ud83c\udfa8'
}

const SKILL_COLORS: Record<SkillCategory, string> = {
  writing: '#e8b44c',
  research: '#5bb5e8',
  code: '#a78bfa',
  data: '#4ade80',
  communication: '#f472b6',
  organization: '#fb923c',
  visual: '#c084fc'
}

/** XP required for category level N = 50 * N^2 */
function xpForCategoryLevel(level: number): number {
  return 50 * level * level
}

/** XP required for overall level N = 100 * N^2 */
function xpForOverallLevel(level: number): number {
  return 100 * level * level
}

interface SkillsPanelProps {
  onClose: () => void
}

export function SkillsPanel({ onClose }: SkillsPanelProps) {
  const { t, locale } = useTranslation()
  const { playerState } = useProgression()
  const panelRef = useRef<HTMLDivElement>(null)

  if (!playerState) return null

  // Sort categories by XP descending
  const sortedCategories = [...SKILL_CATEGORIES].sort(
    (a, b) => playerState.skills[b].xp - playerState.skills[a].xp
  )

  const overallLevel = playerState.overallLevel
  const nextOverallXP = xpForOverallLevel(overallLevel + 1)
  const title = playerState.title[locale] ?? playerState.title['zh-TW'] ?? ''

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      onClose()
    }
  }

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
        zIndex: 100
      }}
    >
      <div
        ref={panelRef}
        style={{
          background: 'rgba(20, 18, 15, 0.95)',
          border: '2px solid #c4a46c',
          borderRadius: 8,
          padding: '32px 40px',
          minWidth: 380,
          maxWidth: 480,
          fontFamily: 'monospace',
          color: '#c4a46c'
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#e8d5a8' }}>
            {playerState.name}
          </div>
          <div style={{ fontSize: 14, color: '#a89060', marginTop: 4 }}>
            {title} · {t('hud.level', { level: String(overallLevel) })}
          </div>
        </div>

        {/* Skill bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sortedCategories.map((category) => {
            const skill = playerState.skills[category]
            const nextXP = xpForCategoryLevel(skill.level + 1)
            const currentXP = xpForCategoryLevel(skill.level)
            const progress = nextXP - currentXP
            const current = skill.xp - currentXP
            const percent = progress > 0 ? Math.min((current / progress) * 100, 100) : 0

            return (
              <div key={category} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 24, textAlign: 'center' }}>{SKILL_ICONS[category]}</span>
                <span style={{ width: 56, fontSize: 12 }}>
                  {t(`skills.categories.${category}`)}
                </span>
                <span style={{ width: 40, fontSize: 12, color: '#a89060' }}>
                  {t('hud.level', { level: String(skill.level) })}
                </span>
                <span
                  style={{
                    flex: 1,
                    height: 8,
                    background: 'rgba(200, 180, 140, 0.15)',
                    borderRadius: 4,
                    overflow: 'hidden'
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      height: '100%',
                      width: `${percent}%`,
                      background: SKILL_COLORS[category],
                      borderRadius: 4,
                      transition: 'width 0.5s ease'
                    }}
                  />
                </span>
                <span style={{ width: 72, fontSize: 11, color: '#a89060', textAlign: 'right' }}>
                  {skill.xp}/{nextXP}
                </span>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 20,
            paddingTop: 12,
            borderTop: '1px solid rgba(200, 180, 140, 0.2)',
            textAlign: 'center',
            fontSize: 12,
            color: '#a89060'
          }}
        >
          <div>
            {t('skills.totalXP')}: {playerState.totalXP} · {t('skills.nextLevel')}: {nextOverallXP}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(200, 180, 140, 0.5)' }}>
            {t('skills.close')}
          </div>
        </div>
      </div>
    </div>
  )
}

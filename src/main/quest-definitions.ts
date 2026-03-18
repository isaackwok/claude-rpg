import type { QuestDefinition } from '../shared/types'

export const QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  {
    id: 'first-contact',
    name: { 'zh-TW': '初次接觸', en: 'First Contact' },
    description: {
      'zh-TW': '在任何分類中完成 1 次對話',
      en: 'Complete 1 conversation in any category'
    },
    icon: '👋',
    initialVisibility: 'visible',
    trigger: { type: 'conversation_count', threshold: 1 },
    xpReward: 20,
    skillCategories: [],
    repeatable: false
  },
  {
    id: 'knowledge-collector',
    name: { 'zh-TW': '知識收集者', en: 'Knowledge Collector' },
    description: {
      'zh-TW': '在研究分類中完成 3 次對話',
      en: 'Complete 3 conversations in Research'
    },
    icon: '🔍',
    initialVisibility: 'visible',
    trigger: { type: 'category_count', skillCategory: 'research', threshold: 3 },
    xpReward: 50,
    skillCategories: ['research'],
    repeatable: false
  },
  {
    id: 'daily-adventurer',
    name: { 'zh-TW': '日常冒險者', en: 'Daily Adventurer' },
    description: {
      'zh-TW': '在一天內完成 3 次對話',
      en: 'Complete 3 conversations in one day'
    },
    icon: '☀️',
    initialVisibility: 'visible',
    trigger: { type: 'daily_count', threshold: 3 },
    xpReward: 30,
    skillCategories: [],
    repeatable: true
  },
  {
    id: 'diligent-apprentice',
    name: { 'zh-TW': '勤奮學徒', en: 'Diligent Apprentice' },
    description: {
      'zh-TW': '在任一分類中完成 10 次對話',
      en: 'Complete 10 conversations in any single category'
    },
    hintText: {
      'zh-TW': '持續磨練同一項技能...',
      en: 'Keep honing the same skill...'
    },
    icon: '📚',
    initialVisibility: 'hidden',
    precondition: { type: 'max_category_count', threshold: 3 },
    trigger: { type: 'max_category_count', threshold: 10 },
    xpReward: 80,
    skillCategories: [],
    repeatable: false
  },
  {
    id: 'renaissance',
    name: { 'zh-TW': '多才多藝', en: 'Renaissance' },
    description: {
      'zh-TW': '在 5 個不同的分類中各完成 1 次對話',
      en: 'Complete 1 conversation in each of 5 different categories'
    },
    hintText: {
      'zh-TW': '嘗試不同領域的冒險...',
      en: 'Try adventuring in different fields...'
    },
    icon: '🌟',
    initialVisibility: 'hidden',
    precondition: { type: 'category_coverage', threshold: 2 },
    trigger: { type: 'category_coverage', threshold: 5 },
    xpReward: 100,
    skillCategories: [],
    repeatable: false
  }
]

export function getQuestDefinition(id: string): QuestDefinition | undefined {
  return QUEST_DEFINITIONS.find((q) => q.id === id)
}

import type { AchievementDefinition } from '../shared/achievement-types'

export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  // ── Progression ────────────────────────────────────────────────────────
  {
    id: 'first-steps',
    title: { 'zh-TW': '踏上旅途', en: 'First Steps' },
    description: {
      'zh-TW': '達到整體等級 5，踏出冒險的第一步',
      en: 'Reached overall level 5 — the journey has begun'
    },
    icon: '👣',
    category: 'progression',
    trigger: { type: 'overall_level', level: 5 },
    xpReward: 50
  },
  {
    id: 'rising-star',
    title: { 'zh-TW': '冉冉新星', en: 'Rising Star' },
    description: {
      'zh-TW': '達到整體等級 10，展現出非凡的潛力',
      en: 'Reached overall level 10 — your potential shines bright'
    },
    icon: '⭐',
    category: 'progression',
    trigger: { type: 'overall_level', level: 10 },
    cosmeticReward: 'apprentice-hat',
    xpReward: 100
  },
  {
    id: 'veteran-path',
    title: { 'zh-TW': '老練之路', en: "Veteran's Path" },
    description: {
      'zh-TW': '達到整體等級 15，成為久經沙場的老手',
      en: 'Reached overall level 15 — a seasoned adventurer'
    },
    icon: '🛡️',
    category: 'progression',
    trigger: { type: 'overall_level', level: 15 },
    cosmeticReward: 'veteran-cape',
    xpReward: 150
  },
  {
    id: 'legendary-hero',
    title: { 'zh-TW': '傳奇英雄', en: 'Legendary Hero' },
    description: {
      'zh-TW': '達到整體等級 20，名留青史的傳奇人物',
      en: 'Reached overall level 20 — a legend in the making'
    },
    icon: '👑',
    category: 'progression',
    trigger: { type: 'overall_level', level: 20 },
    cosmeticReward: 'legendary-aura',
    xpReward: 200
  },
  {
    id: 'skill-master',
    title: { 'zh-TW': '技藝精通', en: 'Skill Master' },
    description: {
      'zh-TW': '在任一技能分類中達到等級 10，展現卓越的專業技藝',
      en: 'Reached level 10 in any skill category — true mastery'
    },
    icon: '🎯',
    category: 'progression',
    trigger: { type: 'any_category_level', level: 10 },
    cosmeticReward: 'champion-hat',
    xpReward: 100
  },

  // ── Exploration ────────────────────────────────────────────────────────
  {
    id: 'town-explorer',
    title: { 'zh-TW': '城鎮探索者', en: 'Town Explorer' },
    description: {
      'zh-TW': '探訪了城鎮中的 3 個不同區域',
      en: 'Visited 3 different zones in town'
    },
    icon: '🗺️',
    category: 'exploration',
    trigger: { type: 'zones_visited', count: 3 },
    xpReward: 50
  },
  {
    id: 'cartographer',
    title: { 'zh-TW': '製圖師', en: 'Cartographer' },
    description: {
      'zh-TW': '探索了城鎮中的所有區域，留下完整的地圖紀錄',
      en: 'Explored every zone in town — the map is complete'
    },
    icon: '📜',
    category: 'exploration',
    trigger: { type: 'all_zones_visited' },
    cosmeticReward: 'town-banner',
    xpReward: 100
  },
  {
    id: 'social-butterfly',
    title: { 'zh-TW': '交際達人', en: 'Social Butterfly' },
    description: {
      'zh-TW': '與城鎮中的每一位 NPC 都進行過對話',
      en: 'Had conversations with every NPC in town'
    },
    icon: '🦋',
    category: 'exploration',
    trigger: { type: 'all_npcs_interacted' },
    cosmeticReward: 'npc-statue',
    xpReward: 100
  },
  {
    id: 'quest-seeker',
    title: { 'zh-TW': '任務獵人', en: 'Quest Seeker' },
    description: {
      'zh-TW': '發現了佈告欄上所有可接受的任務',
      en: 'Discovered every available quest on the board'
    },
    icon: '📋',
    category: 'exploration',
    trigger: { type: 'all_quests_discovered' },
    xpReward: 75
  },

  // ── Tool Use ───────────────────────────────────────────────────────────
  {
    id: 'tool-initiate',
    title: { 'zh-TW': '工具入門', en: 'Tool Initiate' },
    description: {
      'zh-TW': '首次使用檔案操作工具完成任務',
      en: 'Used a file operation tool for the first time'
    },
    icon: '📁',
    category: 'tool_use',
    trigger: { type: 'tool_group_used', group: 'file' },
    xpReward: 30
  },
  {
    id: 'researcher',
    title: { 'zh-TW': '調查員', en: 'Researcher' },
    description: {
      'zh-TW': '首次透過網路搜尋取得資訊',
      en: 'Used web search to gather information for the first time'
    },
    icon: '🔎',
    category: 'tool_use',
    trigger: { type: 'tool_group_used', group: 'search' },
    xpReward: 30
  },
  {
    id: 'tech-savvy',
    title: { 'zh-TW': '科技達人', en: 'Tech Savvy' },
    description: {
      'zh-TW': '掌握了所有工具類型，成為真正的科技達人',
      en: 'Used all tool groups — a true tech savant'
    },
    icon: '💻',
    category: 'tool_use',
    trigger: { type: 'all_tool_groups_used' },
    cosmeticReward: 'garden-item',
    xpReward: 75
  }
]

export function getAchievementDefinition(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENT_DEFINITIONS.find((a) => a.id === id)
}

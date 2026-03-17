import type { AgentDef } from '../types'

export const BUILT_IN_NPCS: readonly AgentDef[] = [
  {
    id: 'elder',
    name: { 'zh-TW': '長老 艾德蒙', en: 'Elder Edmond' },
    sprite: 'npcs',
    spriteFrame: 0,
    location: { map: 'town', x: 39 * 16 + 8, y: 28 * 16 + 8 },
    skills: ['research']
  },
  {
    id: 'guildMaster',
    name: { 'zh-TW': '會長 乃爾', en: 'Guild Master Nile' },
    sprite: 'npcs',
    spriteFrame: 1,
    location: { map: 'town', x: 26 * 16 + 8, y: 21 * 16 + 8 }
  },
  {
    id: 'scholar',
    name: { 'zh-TW': '學者 索菲亞', en: 'Scholar Sophia' },
    sprite: 'npcs',
    spriteFrame: 2,
    location: { map: 'town', x: 53 * 16 + 8, y: 21 * 16 + 8 },
    skills: ['research']
  },
  {
    id: 'scribe',
    name: { 'zh-TW': '書記官 雷文', en: 'Scribe Raven' },
    sprite: 'npcs',
    spriteFrame: 3,
    location: { map: 'town', x: 54 * 16 + 8, y: 35 * 16 + 8 },
    skills: ['writing']
  },
  {
    id: 'merchant',
    name: { 'zh-TW': '商人 馬可', en: 'Merchant Marco' },
    sprite: 'npcs',
    spriteFrame: 4,
    location: { map: 'town', x: 54 * 16 + 8, y: 41 * 16 + 8 },
    skills: ['data']
  },
  {
    id: 'commander',
    name: { 'zh-TW': '指揮官 乃歐', en: 'Commander Neo' },
    sprite: 'npcs',
    spriteFrame: 5,
    location: { map: 'town', x: 57 * 16 + 8, y: 41 * 16 + 8 },
    skills: ['organization']
  },
  {
    id: 'artisan',
    name: { 'zh-TW': '匠師 艾瑞絲', en: 'Artisan Iris' },
    sprite: 'npcs',
    spriteFrame: 6,
    location: { map: 'town', x: 24 * 16 + 8, y: 35 * 16 + 8 },
    skills: ['visual']
  },
  {
    id: 'herald',
    name: { 'zh-TW': '傳令使 娜歐蜜', en: 'Herald Naomi' },
    sprite: 'npcs',
    spriteFrame: 7,
    location: { map: 'town', x: 24 * 16 + 8, y: 41 * 16 + 8 },
    skills: ['communication']
  },
  {
    id: 'wizard',
    name: { 'zh-TW': '巫師 瑪琳', en: 'Wizard Merlin' },
    sprite: 'npcs',
    spriteFrame: 8,
    location: { map: 'town', x: 39 * 16 + 8, y: 18 * 16 + 8 },
    skills: ['code']
  },
  {
    id: 'bartender',
    name: { 'zh-TW': '酒保 雷克斯', en: 'Bartender Rex' },
    sprite: 'npcs',
    spriteFrame: 9,
    location: { map: 'town', x: 39 * 16 + 8, y: 40 * 16 + 8 }
  }
]

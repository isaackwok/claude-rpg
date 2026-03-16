/**
 * Generates placeholder pixel-art assets for Claude RPG Phase 1.
 * Run with: npx tsx scripts/generate-assets.ts
 */

import { PNG } from 'pngjs'
import * as fs from 'fs'
import * as path from 'path'

const ASSETS_DIR = path.join(__dirname, '..', 'src', 'renderer', 'public', 'assets')
const TILE_SIZE = 16

// --- PNG helpers ---

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function createPng(width: number, height: number): PNG {
  return new PNG({ width, height, filterType: -1 })
}

function fillRect(png: PNG, x: number, y: number, w: number, h: number, hex: string): void {
  const [r, g, b] = hexToRgb(hex)
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const idx = (png.width * py + px) << 2
      png.data[idx] = r
      png.data[idx + 1] = g
      png.data[idx + 2] = b
      png.data[idx + 3] = 255
    }
  }
}

function drawBorder(png: PNG, x: number, y: number, w: number, h: number, hex: string, thickness = 1): void {
  const [r, g, b] = hexToRgb(hex)
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const isBorder = px < x + thickness || px >= x + w - thickness || py < y + thickness || py >= y + h - thickness
      if (isBorder) {
        const idx = (png.width * py + px) << 2
        png.data[idx] = r
        png.data[idx + 1] = g
        png.data[idx + 2] = b
        png.data[idx + 3] = 255
      }
    }
  }
}

function savePng(png: PNG, filePath: string): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const buffer = PNG.sync.write(png)
  fs.writeFileSync(filePath, buffer)
  console.log(`  Created: ${path.relative(process.cwd(), filePath)}`)
}

// --- Tileset ---

function generateTileset(): void {
  console.log('Generating tileset...')
  const tileColors = ['#4a8c3f', '#c4a46c', '#6b6b6b', '#4a7ab5'] // grass, path, wall, water
  const png = createPng(TILE_SIZE * 4, TILE_SIZE)

  tileColors.forEach((color, i) => {
    fillRect(png, i * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE, color)
  })

  // Add subtle borders on wall tiles for visibility
  drawBorder(png, 2 * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE, '#555555')

  savePng(png, path.join(ASSETS_DIR, 'tilesets', 'town-tileset.png'))
}

// --- Sprites ---

function generatePlayerSprite(): void {
  console.log('Generating player sprite...')
  const png = createPng(TILE_SIZE * 4, TILE_SIZE)
  const bodyColor = '#3b82f6'
  const headColor = '#93c5fd'

  for (let frame = 0; frame < 4; frame++) {
    const fx = frame * TILE_SIZE
    // Body (10x10 centered)
    fillRect(png, fx + 3, 6, 10, 10, bodyColor)
    // Head (6x5 centered at top)
    fillRect(png, fx + 5, 2, 6, 5, headColor)
    // Direction indicator (small dot)
    const dotPositions = [
      [fx + 8, 1],   // up
      [fx + 8, 14],  // down
      [fx + 2, 9],   // left
      [fx + 13, 9],  // right
    ]
    const [dx, dy] = dotPositions[frame]
    fillRect(png, dx, dy, 2, 2, '#ffffff')
  }

  savePng(png, path.join(ASSETS_DIR, 'sprites', 'player.png'))
}

function generateNpcSprites(): void {
  console.log('Generating NPC sprites...')
  const npcs = [
    { id: 'elder', color: '#c4a46c' },
    { id: 'guildMaster', color: '#8b6914' },
    { id: 'scholar', color: '#2e5a88' },
    { id: 'scribe', color: '#5a3a7e' },
    { id: 'merchant', color: '#8b4513' },
    { id: 'commander', color: '#8b0000' },
    { id: 'artisan', color: '#d4a017' },
    { id: 'herald', color: '#2e8b57' },
    { id: 'wizard', color: '#4b0082' },
    { id: 'bartender', color: '#8b7355' },
  ]

  const png = createPng(TILE_SIZE * npcs.length, TILE_SIZE)

  npcs.forEach((npc, i) => {
    const fx = i * TILE_SIZE
    // Body (12x12 centered)
    fillRect(png, fx + 2, 2, 12, 12, npc.color)
    // Lighter "face" area
    const [r, g, b] = hexToRgb(npc.color)
    const lighter = '#' + [
      Math.min(255, r + 60),
      Math.min(255, g + 60),
      Math.min(255, b + 60)
    ].map(c => c.toString(16).padStart(2, '0')).join('')
    fillRect(png, fx + 5, 3, 6, 5, lighter)
    // Border
    drawBorder(png, fx + 2, 2, 12, 12, '#000000')
  })

  savePng(png, path.join(ASSETS_DIR, 'sprites', 'npcs.png'))
}

// --- Tilemap ---

function generateTilemap(): void {
  console.log('Generating tilemap...')
  const MAP_W = 40
  const MAP_H = 30

  // Tile indices (Tiled uses 1-based, 0 = empty)
  const GRASS = 1
  const PATH = 2
  const WALL = 3
  const WATER = 4

  // Initialize layers
  const ground: number[] = new Array(MAP_W * MAP_H).fill(GRASS)
  const buildings: number[] = new Array(MAP_W * MAP_H).fill(0)
  const collision: number[] = new Array(MAP_W * MAP_H).fill(0)

  function setTile(layer: number[], x: number, y: number, tile: number): void {
    if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) {
      layer[y * MAP_W + x] = tile
    }
  }

  function fillArea(layer: number[], x: number, y: number, w: number, h: number, tile: number): void {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        setTile(layer, px, py, tile)
      }
    }
  }

  function makeBuilding(x: number, y: number, w: number, h: number, doorSide: 'top' | 'bottom' = 'bottom'): void {
    // Walls around the perimeter
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        const isBorder = px === x || px === x + w - 1 || py === y || py === y + h - 1
        if (isBorder) {
          setTile(buildings, px, py, WALL)
          setTile(collision, px, py, WALL)
        }
      }
    }
    // Floor inside
    fillArea(ground, x + 1, y + 1, w - 2, h - 2, PATH)
    // Door (2-tile wide opening)
    const doorX = x + Math.floor(w / 2)
    const doorY = doorSide === 'bottom' ? y + h - 1 : y
    setTile(buildings, doorX - 1, doorY, 0)
    setTile(collision, doorX - 1, doorY, 0)
    setTile(buildings, doorX, doorY, 0)
    setTile(collision, doorX, doorY, 0)
  }

  // --- Layout locations ---

  // Paths: horizontal and vertical through center
  fillArea(ground, 0, 14, MAP_W, 2, PATH) // horizontal main road
  fillArea(ground, 19, 0, 2, MAP_H, PATH) // vertical main road

  // Paths to locations
  fillArea(ground, 5, 5, 2, 10, PATH)   // to Guild Hall
  fillArea(ground, 33, 5, 2, 10, PATH)  // to Library
  fillArea(ground, 33, 15, 2, 8, PATH)  // to Market
  fillArea(ground, 5, 15, 2, 8, PATH)   // to Artisan
  fillArea(ground, 12, 23, 8, 2, PATH)  // to Tavern

  // Town Square (center, 10x8, open area)
  fillArea(ground, 15, 11, 10, 8, PATH)

  // Water features around town edges
  fillArea(ground, 0, 0, 3, 3, WATER)
  fillArea(ground, MAP_W - 3, 0, 3, 3, WATER)
  fillArea(ground, 0, MAP_H - 3, 3, 3, WATER)
  fillArea(ground, MAP_W - 3, MAP_H - 3, 3, 3, WATER)
  // Water collision
  fillArea(collision, 0, 0, 3, 3, WALL)
  fillArea(collision, MAP_W - 3, 0, 3, 3, WALL)
  fillArea(collision, 0, MAP_H - 3, 3, 3, WALL)
  fillArea(collision, MAP_W - 3, MAP_H - 3, 3, 3, WALL)

  // Buildings — above main road (y<14): door at bottom; below: door at top
  makeBuilding(3, 3, 7, 6)                // Guild Hall (NW) — door bottom
  makeBuilding(30, 3, 7, 6)               // Library (NE) — door bottom
  makeBuilding(17, 1, 6, 5)               // Tower (far N) — door bottom
  makeBuilding(32, 17, 6, 6, 'top')       // Scribe's Workshop (E) — door top
  makeBuilding(32, 24, 6, 5, 'top')       // Market (SE) — door top
  makeBuilding(2, 17, 6, 6, 'top')        // Artisan's Studio (W) — door top
  makeBuilding(2, 24, 6, 5, 'top')        // Messenger's Post (SW) — door top
  makeBuilding(15, 23, 10, 6, 'top')      // Tavern (S) — door top

  // Map border collision
  for (let x = 0; x < MAP_W; x++) {
    setTile(collision, x, 0, WALL)
    setTile(collision, x, MAP_H - 1, WALL)
  }
  for (let y = 0; y < MAP_H; y++) {
    setTile(collision, 0, y, WALL)
    setTile(collision, MAP_W - 1, y, WALL)
  }

  // --- Objects layer ---
  const objects: TiledObject[] = []
  let nextId = 1

  // NPC spawns
  const npcSpawns = [
    { npcId: 'elder', x: 19, y: 13 },       // Town Square
    { npcId: 'guildMaster', x: 6, y: 6 },   // Guild Hall
    { npcId: 'scholar', x: 33, y: 6 },       // Library
    { npcId: 'scribe', x: 34, y: 20 },       // Scribe's Workshop
    { npcId: 'merchant', x: 34, y: 26 },     // Market
    { npcId: 'commander', x: 35, y: 26 },    // Market
    { npcId: 'artisan', x: 4, y: 20 },       // Artisan's Studio
    { npcId: 'herald', x: 4, y: 26 },        // Messenger's Post
    { npcId: 'wizard', x: 19, y: 3 },        // Tower
    { npcId: 'bartender', x: 19, y: 25 },    // Tavern
  ]

  for (const spawn of npcSpawns) {
    objects.push({
      id: nextId++,
      name: spawn.npcId,
      type: 'npc',
      x: spawn.x * TILE_SIZE,
      y: spawn.y * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      rotation: 0,
      visible: true,
      properties: [{ name: 'npcId', type: 'string', value: spawn.npcId }]
    })
  }

  // Zone areas
  const zones = [
    { zoneId: 'townSquare', zoneName: '城鎮廣場', x: 15, y: 11, w: 10, h: 8 },
    { zoneId: 'guildHall', zoneName: '公會大廳', x: 3, y: 3, w: 7, h: 6 },
    { zoneId: 'library', zoneName: '圖書館', x: 30, y: 3, w: 7, h: 6 },
    { zoneId: 'scribeWorkshop', zoneName: '書記工坊', x: 32, y: 17, w: 6, h: 6 },
    { zoneId: 'market', zoneName: '市場', x: 32, y: 24, w: 6, h: 5 },
    { zoneId: 'artisanStudio', zoneName: '匠師工坊', x: 2, y: 17, w: 6, h: 6 },
    { zoneId: 'messengerPost', zoneName: '傳令站', x: 2, y: 24, w: 6, h: 5 },
    { zoneId: 'tavern', zoneName: '酒館', x: 15, y: 23, w: 10, h: 6 },
    { zoneId: 'tower', zoneName: '高塔', x: 17, y: 1, w: 6, h: 5 },
  ]

  for (const zone of zones) {
    objects.push({
      id: nextId++,
      name: zone.zoneId,
      type: 'zone',
      x: zone.x * TILE_SIZE,
      y: zone.y * TILE_SIZE,
      width: zone.w * TILE_SIZE,
      height: zone.h * TILE_SIZE,
      rotation: 0,
      visible: true,
      properties: [
        { name: 'zoneId', type: 'string', value: zone.zoneId },
        { name: 'zoneName', type: 'string', value: zone.zoneName },
      ]
    })
  }

  // --- Build Tiled JSON ---
  const tilemap = {
    compressionlevel: -1,
    height: MAP_H,
    width: MAP_W,
    tileheight: TILE_SIZE,
    tilewidth: TILE_SIZE,
    infinite: false,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    type: 'map',
    version: '1.10',
    nextlayerid: 5,
    nextobjectid: nextId,
    tilesets: [
      {
        columns: 4,
        firstgid: 1,
        image: '../tilesets/town-tileset.png',
        imageheight: TILE_SIZE,
        imagewidth: TILE_SIZE * 4,
        margin: 0,
        name: 'town-tileset',
        spacing: 0,
        tilecount: 4,
        tileheight: TILE_SIZE,
        tilewidth: TILE_SIZE,
      }
    ],
    layers: [
      {
        id: 1,
        name: 'Ground',
        type: 'tilelayer',
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        width: MAP_W,
        height: MAP_H,
        data: ground,
      },
      {
        id: 2,
        name: 'Buildings',
        type: 'tilelayer',
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        width: MAP_W,
        height: MAP_H,
        data: buildings,
      },
      {
        id: 3,
        name: 'Collision',
        type: 'tilelayer',
        visible: false,
        opacity: 1,
        x: 0,
        y: 0,
        width: MAP_W,
        height: MAP_H,
        data: collision,
      },
      {
        id: 4,
        name: 'Objects',
        type: 'objectgroup',
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        draworder: 'topdown',
        objects,
      }
    ],
  }

  const outPath = path.join(ASSETS_DIR, 'tilemaps', 'town.json')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(tilemap, null, 2))
  console.log(`  Created: ${path.relative(process.cwd(), outPath)}`)
}

// Types for Tiled objects
interface TiledObject {
  id: number
  name: string
  type: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  visible: boolean
  properties: { name: string; type: string; value: string }[]
}

// --- Run ---
console.log('Generating Claude RPG placeholder assets...\n')
generateTileset()
generatePlayerSprite()
generateNpcSprites()
generateTilemap()
console.log('\nDone!')

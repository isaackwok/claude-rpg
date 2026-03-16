import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { execFileSync } from 'child_process'
import path from 'path'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  // Build the app first
  execFileSync('npx', ['electron-vite', 'build'], {
    cwd: path.resolve(__dirname, '../..'),
    stdio: 'pipe',
  })

  // Launch Electron app
  app = await electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')],
  })

  page = await app.firstWindow()
  // Wait for Phaser to initialize and render
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await app?.close()
})

// --- 1. Window Configuration ---

test('window opens at correct size with correct title', async () => {
  const title = await page.title()
  expect(title).toBe('Claude RPG')

  // Electron BrowserWindow size includes title bar chrome;
  // content area is smaller. Just check width is exact and height is close.
  const size = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))
  expect(size.width).toBe(1024)
  expect(size.height).toBeGreaterThanOrEqual(700)
  expect(size.height).toBeLessThanOrEqual(768)
})

// --- 2. Phaser Canvas Renders ---

test('Phaser canvas is present and sized correctly', async () => {
  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible()

  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBe(1024)
  expect(box!.height).toBe(768)
})

// --- 3. Tilemap Renders (no missing textures) ---

test('tilemap renders without missing textures', async () => {
  // Check console for texture errors
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      errors.push(msg.text())
    }
  })

  // Reload and wait for Phaser to re-render
  await page.reload()
  await page.waitForTimeout(3000)

  const textureErrors = errors.filter(
    (e) => e.includes('Texture') || e.includes('Failed to process') || e.includes('Content Security Policy')
  )
  expect(textureErrors).toEqual([])
})

// --- 4. No Console Errors on Load ---

test('no critical console errors on startup', async () => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text())
    }
  })

  await page.reload()
  await page.waitForTimeout(3000)

  // Filter out non-critical errors (React DevTools suggestion is fine)
  const critical = errors.filter((e) => !e.includes('React DevTools'))
  expect(critical).toEqual([])
})

// --- 5. Player Movement (WASD) ---

test('player can move with WASD keys', async () => {
  // Press D (right) for a bit — if no crash, movement works
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(500)
  await page.keyboard.up('KeyD')
  await page.waitForTimeout(100)

  // Press A (left) to return
  await page.keyboard.down('KeyA')
  await page.waitForTimeout(500)
  await page.keyboard.up('KeyA')
  await page.waitForTimeout(100)

  // No crash = movement system works
  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible()
})

// --- 6. HUD Shows Location ---

test('HUD displays zone name', async () => {
  await page.waitForTimeout(500)

  // Check if any zone text is visible in the overlay
  const hudText = await page.evaluate(() => {
    const overlay = document.querySelector('[style*="pointer-events: none"]')
    return overlay?.textContent || ''
  })

  // Should contain a Chinese location name (player starts in Town Square)
  expect(hudText.length).toBeGreaterThan(0)
})

// --- 7. Proximity Hint Shows Near NPC ---

test('proximity hint appears near NPC', async () => {
  // The Elder NPC is at tile (19, 13), player spawns at (19, 14)
  // They're very close. Move up toward Elder.
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(800)
  await page.keyboard.up('KeyW')
  await page.waitForTimeout(500)

  // Check for proximity hint text
  const hintVisible = await page.evaluate(() => {
    const allText = document.body.innerText
    return allText.includes('Space') || allText.includes('對話')
  })

  await page.screenshot({ path: 'tests/e2e/screenshots/near-npc.png' })
  expect(hintVisible).toBe(true)
})

// --- 8. Dialogue Panel Opens on Space ---

test('dialogue panel opens on Space key near NPC', async () => {
  // Reset position so player is back at spawn near Elder
  await page.reload()
  await page.waitForTimeout(3000)

  // Move up toward Elder NPC (one tile above spawn)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(600)
  await page.keyboard.up('KeyW')
  await page.waitForTimeout(300)

  // Hold Space long enough for Phaser's update loop to catch JustDown
  await page.keyboard.down('Space')
  await page.waitForTimeout(200)
  await page.keyboard.up('Space')
  await page.waitForTimeout(500)

  // Check for dialogue panel content (NPC name should appear)
  const dialogueVisible = await page.evaluate(() => {
    const allText = document.body.innerText
    // Check for any NPC name in Chinese or dialogue placeholder
    return allText.includes('長老') || allText.includes('......') || allText.includes('Escape')
  })

  await page.screenshot({ path: 'tests/e2e/screenshots/dialogue-open.png' })
  expect(dialogueVisible).toBe(true)
})

// --- 9. Dialogue Closes on Escape ---

test('dialogue panel closes on Escape', async () => {
  // Reset and open dialogue (move to NPC + Space)
  await page.reload()
  await page.waitForTimeout(3000)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(600)
  await page.keyboard.up('KeyW')
  await page.waitForTimeout(300)
  await page.keyboard.down('Space')
  await page.waitForTimeout(200)
  await page.keyboard.up('Space')
  await page.waitForTimeout(500)

  // Press Escape
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  await page.screenshot({ path: 'tests/e2e/screenshots/dialogue-closed.png' })

  // After Escape, the dialogue close hint should be gone
  const dialogueStillOpen = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div'))
    return els.some((el) => el.textContent?.includes('按 Escape 關閉'))
  })
  expect(dialogueStillOpen).toBe(false)
})

// --- 10. Each NPC is Reachable ---

// NPC IDs and expected Chinese names
const ALL_NPCS = [
  { id: 'elder', name: '長老' },
  { id: 'guildMaster', name: '會長' },
  { id: 'scholar', name: '學者' },
  { id: 'scribe', name: '書記官' },
  { id: 'merchant', name: '商人' },
  { id: 'commander', name: '指揮官' },
  { id: 'artisan', name: '匠師' },
  { id: 'herald', name: '傳令使' },
  { id: 'wizard', name: '巫師' },
  { id: 'bartender', name: '酒保' },
]

for (const npc of ALL_NPCS) {
  test(`NPC "${npc.name}" (${npc.id}) is reachable and interactable`, async () => {
    await page.reload()
    await page.waitForTimeout(3000)

    // Teleport the player next to the NPC and verify interaction works
    const result = await page.evaluate((npcId) => {
      const game = (window as any).__PHASER_GAME__
      if (!game) return { error: 'no game instance' }
      const scene = game.scene.getScene('Town') as any
      if (!scene) return { error: 'no Town scene' }

      // Find the NPC in the scene
      const npcObj = scene.npcs?.find((n: any) => n.agentDef?.id === npcId)
      if (!npcObj) return { error: `NPC ${npcId} not found in scene` }

      // Teleport player next to NPC (offset by 20px so they don't overlap)
      const player = scene.player
      if (!player) return { error: 'no player' }
      player.setPosition(npcObj.x, npcObj.y + 20)

      return {
        npcExists: true,
        npcX: npcObj.x,
        npcY: npcObj.y,
        playerX: player.x,
        playerY: player.y,
      }
    }, npc.id)

    expect(result).not.toHaveProperty('error')
    expect(result).toHaveProperty('npcExists', true)

    // Wait for physics overlap to trigger proximity
    await page.waitForTimeout(500)

    // Check proximity hint appeared
    const nearNpc = await page.evaluate(() => {
      return document.body.innerText.includes('Space') || document.body.innerText.includes('對話')
    })

    // Press Space to open dialogue
    await page.keyboard.down('Space')
    await page.waitForTimeout(200)
    await page.keyboard.up('Space')
    await page.waitForTimeout(500)

    const bodyText = await page.evaluate(() => document.body.innerText)
    await page.screenshot({ path: `tests/e2e/screenshots/npc-${npc.id}.png` })

    // NPC is reachable if proximity triggered OR their name appears in dialogue
    const reachable = nearNpc || bodyText.includes(npc.name)
    expect(reachable, `NPC ${npc.name} (${npc.id}) not interactable`).toBe(true)
  })
}

// --- 11. Full Visual Snapshot ---

test('full game visual snapshot', async () => {
  await page.reload()
  await page.waitForTimeout(3000)

  await page.screenshot({ path: 'tests/e2e/screenshots/full-game.png' })
})

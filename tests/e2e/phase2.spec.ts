import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { execFileSync } from 'child_process'
import path from 'path'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  execFileSync('npx', ['electron-vite', 'build'], {
    cwd: path.resolve(__dirname, '../..'),
    stdio: 'pipe'
  })

  app = await electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')]
  })

  page = await app.firstWindow()
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await app?.close()
})

// Helper: teleport player to a position via Phaser scene
async function teleportPlayer(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ({ x, y }) => {
      const game = (window as any).__PHASER_GAME__
      const scene = game?.scene.getScene('Town') as any
      if (scene?.player) scene.player.setPosition(x, y)
    },
    { x, y }
  )
}

// --- 1. Notice Board Proximity Hint ---

test('proximity hint appears near Notice Board', async () => {
  await page.reload()
  await page.waitForTimeout(3000)

  // Player spawns at (39*16+8, 29*16+8) = (632, 472)
  // Notice Board is at (39*16+8, 28*16+8) = (632, 456) — one tile above
  // Move up toward the Notice Board
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(600)
  await page.keyboard.up('KeyW')
  await page.waitForTimeout(500)

  const hintVisible = await page.evaluate(() => {
    return document.body.innerText.includes('Space') || document.body.innerText.includes('對話')
  })

  await page.screenshot({ path: 'tests/e2e/screenshots/near-noticeboard.png' })
  expect(hintVisible).toBe(true)
})

// --- 2. Notice Board Panel Opens on Space ---

test('Notice Board panel opens on Space key', async () => {
  await page.reload()
  await page.waitForTimeout(3000)

  // Teleport player directly into Notice Board interaction zone
  // Notice Board at (632, 456), interaction zone is 48x48
  await teleportPlayer(page, 632, 468)
  await page.waitForTimeout(800)

  // Press Space to interact
  await page.keyboard.down('Space')
  await page.waitForTimeout(200)
  await page.keyboard.up('Space')
  await page.waitForTimeout(500)

  // The NoticeBoardPanel should render with its title (📜)
  const panelVisible = await page.evaluate(() => {
    const text = document.body.innerText
    // Check for notice board UI elements (title, empty state, or close button)
    return text.includes('📜') || text.includes('Notice Board') || text.includes('公告欄')
  })

  await page.screenshot({ path: 'tests/e2e/screenshots/noticeboard-open.png' })
  expect(panelVisible).toBe(true)
})

// --- 3. Notice Board Panel Closes on Escape ---

test('Notice Board panel closes on Escape', async () => {
  await page.reload()
  await page.waitForTimeout(3000)

  // Teleport and open Notice Board
  await teleportPlayer(page, 632, 468)
  await page.waitForTimeout(800)
  await page.keyboard.down('Space')
  await page.waitForTimeout(200)
  await page.keyboard.up('Space')
  await page.waitForTimeout(500)

  // Verify it's open
  const openBefore = await page.evaluate(() => document.body.innerText.includes('📜'))
  expect(openBefore).toBe(true)

  // Press Escape to close
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  const stillOpen = await page.evaluate(() => document.body.innerText.includes('📜'))
  await page.screenshot({ path: 'tests/e2e/screenshots/noticeboard-closed.png' })
  expect(stillOpen).toBe(false)
})

// --- 4. Dialogue Panel Has Chat Input ---

test('dialogue panel shows chat input field', async () => {
  await page.reload()
  await page.waitForTimeout(3000)

  // Teleport player next to Elder NPC at (664, 464), offset to avoid collision
  await teleportPlayer(page, 674, 478)
  await page.waitForTimeout(800)
  await page.keyboard.down('Space')
  await page.waitForTimeout(200)
  await page.keyboard.up('Space')
  await page.waitForTimeout(500)

  // Check for input element or API key prompt (either means dialogue panel rendered)
  const hasInput = await page.evaluate(() => {
    // Phase 2 dialogue has either an <input> (if API key set) or a "set API key" button
    const inputs = document.querySelectorAll('input[type="text"], input:not([type])')
    const apiKeyBtn = document.body.innerText.includes('API')
    return inputs.length > 0 || apiKeyBtn
  })

  await page.screenshot({ path: 'tests/e2e/screenshots/dialogue-input.png' })
  expect(hasInput).toBe(true)
})

// --- 5. Dialogue Panel Shows NPC Intro Text ---

test('dialogue panel shows NPC intro text', async () => {
  await page.reload()
  await page.waitForTimeout(3000)

  // Teleport player next to Elder NPC at (664, 464), offset to avoid collision
  await teleportPlayer(page, 674, 478)
  await page.waitForTimeout(800)
  await page.keyboard.down('Space')
  await page.waitForTimeout(200)
  await page.keyboard.up('Space')
  await page.waitForTimeout(500)

  // The dialogue panel should display the NPC intro placeholder text
  // (shown when conversation has no messages yet)
  const hasIntroOrName = await page.evaluate(() => {
    const text = document.body.innerText
    // Check for Elder's name in Chinese or English, or any intro text
    return text.includes('長老') || text.includes('Elder')
  })

  await page.screenshot({ path: 'tests/e2e/screenshots/dialogue-intro.png' })
  expect(hasIntroOrName).toBe(true)
})

// --- 6. Dialogue Panel Expand/Collapse Toggle ---

test('dialogue panel can expand to full height', async () => {
  await page.reload()
  await page.waitForTimeout(3000)

  // Teleport player next to Elder NPC at (664, 464), offset to avoid collision
  await teleportPlayer(page, 674, 478)
  await page.waitForTimeout(800)
  await page.keyboard.down('Space')
  await page.waitForTimeout(200)
  await page.keyboard.up('Space')
  await page.waitForTimeout(500)

  // Find and click the expand SVG (chevron icon in header)
  const expanded = await page.evaluate(() => {
    const svgs = document.querySelectorAll('svg')
    for (const svg of svgs) {
      if (svg.querySelector('polyline')) {
        svg.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true
      }
    }
    return false
  })
  expect(expanded).toBe(true)

  // Wait for CSS transition
  await page.waitForTimeout(400)

  // The dialogue panel should now fill the viewport height
  const panelHeight = await page.evaluate(() => {
    // Find the dialogue panel (bottom-anchored div with pointer-events: auto)
    const panels = document.querySelectorAll('div[style*="pointer-events: auto"]')
    for (const panel of panels) {
      const style = (panel as HTMLElement).style
      if (style.height === '100%') return 'full'
    }
    return 'partial'
  })

  await page.screenshot({ path: 'tests/e2e/screenshots/dialogue-expanded.png' })
  expect(panelHeight).toBe('full')
})

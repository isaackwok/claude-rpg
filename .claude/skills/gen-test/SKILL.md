---
name: gen-test
description: Generate unit tests (Vitest) and e2e tests (Playwright + Electron) for the Claude RPG project. Use this skill when the user asks to "add tests", "generate tests", "write tests", "create test for", "test this file", "add e2e tests", or wants test coverage for any source file or user-facing flow. Also use when a pre-commit audit flags missing test coverage.
---

# Test Generator

Generate tests for the Claude RPG project. Supports two test types:

- **Unit tests** — Vitest, co-located with source files, test logic in isolation
- **E2E tests** — Playwright with Electron, live in `tests/e2e/`, test user-facing flows

When the user says "generate tests" without specifying a type, analyze what they're testing and pick the right type:

- Testing a **function, service, or module** → unit test
- Testing a **user-facing flow** (dialogue opens, NPC interaction, UI behavior) → e2e test
- Testing **both logic and its integration** → generate both

---

## Part 1: Unit Tests (Vitest)

### Prerequisites

If Vitest is not yet installed, tell the user and offer to set it up:

```bash
npm install -D vitest @vitest/coverage-v8
```

And add to `package.json` scripts:

```json
"test:unit": "vitest run",
"test:unit:watch": "vitest"
```

Also create a `vitest.config.ts` if one doesn't exist — it should include path aliases and exclude `tests/e2e/**`:

```typescript
import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    globals: false,
    environment: 'node',
    exclude: ['tests/e2e/**', 'node_modules/**']
  }
})
```

### Workflow

#### Step 1: Analyze the Source File

Read the target file and identify what's worth testing:

- **Pure functions** — highest value, easiest to test
- **Event handlers** — test that the right events trigger the right behavior
- **State transitions** — test that state changes correctly given inputs
- **Edge cases** — null/undefined handling, empty arrays, boundary values

Skip testing:

- Simple getters/setters with no logic
- Framework boilerplate (Phaser scene lifecycle, React component rendering without logic)
- Code that's just wiring (passing data from A to B with no transformation)

#### Step 2: Determine Test File Location

Test files live next to their source files with `.test.ts` or `.test.tsx` suffix:

```
src/renderer/src/services/ConversationManager.ts  → src/renderer/src/services/ConversationManager.test.ts
src/main/agents/system-prompts.ts                 → src/main/agents/system-prompts.test.ts
src/main/chat.ts                                  → src/main/chat.test.ts
```

#### Step 3: Write the Tests

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('ModuleName', () => {
  describe('functionName', () => {
    it('should [expected behavior] when [condition]', () => {
      // Arrange → Act → Assert
    })
  })
})
```

Guidelines:

- **Test names describe behavior**, not implementation — "should emit npc:interact when player overlaps NPC zone" not "should call emit method"
- **One assertion per test** where practical
- **Mock external dependencies**, not internal logic
- **Use `vi.fn()` and `vi.spyOn()`** for mocking
- **Test the public API** — private functions are tested through the public functions that use them
- **Use unique IDs per test** when testing singletons to avoid cross-test state pollution

#### Step 4: Verify Tests Pass

```bash
npx vitest run <test-file-path>
```

Fix any failures before presenting to the user.

### Mocking Patterns

**EventBus:**

```typescript
vi.mock('../EventBus', () => ({
  EventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}))
```

**Phaser Scene:**

```typescript
const mockScene = {
  add: {
    sprite: vi.fn(),
    text: vi.fn(),
    graphics: vi.fn(),
    container: vi.fn(),
    existing: vi.fn(),
    zone: vi.fn()
  },
  physics: { add: { existing: vi.fn(), overlap: vi.fn() } },
  tweens: { add: vi.fn(), addCounter: vi.fn() },
  events: { on: vi.fn(), off: vi.fn() }
} as unknown as Phaser.Scene
```

**i18n `t()` function:**

```typescript
vi.mock('../i18n', () => ({
  t: (key: string) => key,
  useTranslation: () => ({ t: (key: string) => key, locale: 'zh-TW' })
}))
```

**Electron IPC / window.api:**

```typescript
vi.stubGlobal('window', {
  api: {
    setApiKey: vi.fn(),
    checkApiKey: vi.fn(() => Promise.resolve(true)),
    clearApiKey: vi.fn(),
    sendMessage: vi.fn(),
    cancelStream: vi.fn(),
    onStreamChunk: vi.fn(() => () => {}),
    onStreamEnd: vi.fn(() => () => {}),
    onStreamError: vi.fn(() => () => {})
  }
})
```

**Anthropic SDK:**

```typescript
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: {
      stream: vi.fn(() => {
        const handlers: Record<string, Function> = {}
        return {
          on: vi.fn((event: string, cb: Function) => {
            handlers[event] = cb
            return { on: vi.fn() }
          }),
          finalMessage: vi.fn(async () => {
            /* trigger handlers */
          })
        }
      })
    }
  }))
}))
```

---

## Part 2: E2E Tests (Playwright + Electron)

### Prerequisites

Playwright should already be installed. If not:

```bash
npm install -D @playwright/test playwright
```

The project has `playwright.config.ts` at the root and e2e tests in `tests/e2e/`.

### Workflow

#### Step 1: Identify the User Flow to Test

E2E tests cover **user-visible behavior** in the running Electron app:

- UI elements appearing/disappearing (dialogue panel, modals, HUD)
- Keyboard interactions (WASD movement, Space to interact, Escape to close)
- State flowing through the full stack (IPC → main → renderer)
- Visual regressions (screenshots)

#### Step 2: Determine Test File Location

E2E tests live in `tests/e2e/` and are named by feature or phase:

```
tests/e2e/phase1.spec.ts     → Phase 1 flows (window, movement, NPC proximity, dialogue open/close)
tests/e2e/phase2.spec.ts     → Phase 2 flows (API key modal, chat streaming, speech bubbles)
tests/e2e/dialogue.spec.ts   → Focused dialogue tests
```

#### Step 3: Write the Tests

Follow the existing pattern in `tests/e2e/phase1.spec.ts`:

```typescript
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
```

Key patterns:

- **Build before testing** — `execFileSync('npx', ['electron-vite', 'build'])` in `beforeAll`
- **Access Phaser internals** via `page.evaluate()` using `window.__PHASER_GAME__`
- **Teleport the player** to NPC positions for reliable interaction tests
- **Wait for physics** — `await page.waitForTimeout(800)` after teleporting for overlap detection
- **Take screenshots** — `await page.screenshot({ path: 'tests/e2e/screenshots/name.png' })`
- **Check React overlay text** — `document.body.innerText.includes('...')` via `page.evaluate()`

#### Step 4: Test Interaction Flows

For NPC interaction + dialogue:

```typescript
test('dialogue opens when pressing Space near NPC', async () => {
  // Teleport player near NPC
  await page.evaluate(() => {
    const game = (window as any).__PHASER_GAME__
    const scene = game.scene.getScene('Town') as any
    const npc = scene.npcs.find((n: any) => n.agentDef.id === 'elder')
    scene.player.setPosition(npc.x - 10, npc.y + 18)
  })
  await page.waitForTimeout(800)

  // Press Space
  await page.keyboard.down('Space')
  await page.waitForTimeout(200)
  await page.keyboard.up('Space')
  await page.waitForTimeout(500)

  // Verify dialogue appeared
  const hasDialogue = await page.evaluate(() => document.body.innerText.includes('長老'))
  expect(hasDialogue).toBe(true)
})
```

For UI element testing (modals, buttons):

```typescript
test('API key modal opens from dialogue panel', async () => {
  // Open dialogue first, then look for the "set API key" button
  const buttonText = await page.evaluate(() => document.body.innerText.includes('設定 API 金鑰'))
  expect(buttonText).toBe(true)
})
```

#### Step 5: Verify Tests Pass

```bash
npx playwright test tests/e2e/<test-file>
```

Or for the full e2e suite:

```bash
npm run test:e2e
```

### E2E Testing Guidelines

- **Don't test AI responses** — mock the API key check or skip API-dependent tests. E2E tests should verify UI behavior, not external API calls.
- **Minimize reloads** — each `page.reload()` costs ~3s. Group related assertions when possible.
- **Use teleportation** over movement — `player.setPosition(x, y)` is deterministic, walking is flaky.
- **Screenshot on important states** — save to `tests/e2e/screenshots/` for visual verification.
- **Test Chinese (zh-TW) strings** — the primary locale. Check for Chinese text in assertions since that's what users see.
- **Account for animation timing** — use `waitForTimeout` after state changes that trigger transitions (dialogue expand, speech bubbles).

---

## Deciding Which Type to Generate

| Signal                                                                | Type                                                                   |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| User says "unit test" or "test this function"                         | Unit                                                                   |
| User says "e2e test" or "test this flow"                              | E2E                                                                    |
| Testing a service, utility, or data module                            | Unit                                                                   |
| Testing user interaction or UI state                                  | E2E                                                                    |
| Testing IPC bridge end-to-end                                         | E2E                                                                    |
| User says "generate tests" for a module with both logic and UI impact | Both                                                                   |
| User says "generate needed tests" (broad)                             | Analyze changed files, generate unit for logic, e2e for new user flows |

---
name: gen-test
description: Generate unit test files for source modules using Vitest. Use this skill when the user asks to "add tests", "generate tests", "write tests", "create test for", "test this file", or wants unit test coverage for any source file. Also use when a pre-commit audit flags missing test coverage.
---

# Unit Test Generator

Generate Vitest unit tests for source files in the Claude RPG project. The goal is to create focused, maintainable tests that catch real regressions — not boilerplate that tests nothing.

## Prerequisites

If Vitest is not yet installed, tell the user and offer to set it up:

```bash
npm install -D vitest @vitest/coverage-v8
```

And add to `package.json` scripts:
```json
"test:unit": "vitest run",
"test:unit:watch": "vitest"
```

Also create a `vitest.config.ts` if one doesn't exist — it should extend the renderer's Vite config for path aliases and React support.

## Workflow

### Step 1: Analyze the Source File

Read the target file and identify what's worth testing:

- **Pure functions** — highest value, easiest to test
- **Event handlers** — test that the right events trigger the right behavior
- **State transitions** — test that state changes correctly given inputs
- **Edge cases** — null/undefined handling, empty arrays, boundary values

Skip testing:
- Simple getters/setters with no logic
- Framework boilerplate (Phaser scene lifecycle, React component rendering without logic)
- Code that's just wiring (passing data from A to B with no transformation)

### Step 2: Determine Test File Location

Follow the convention: test files live next to their source files with `.test.ts` or `.test.tsx` suffix.

```
src/renderer/src/game/EventBus.ts      → src/renderer/src/game/EventBus.test.ts
src/renderer/src/components/HUD.tsx    → src/renderer/src/components/HUD.test.tsx
src/main/services/ApiKeyStore.ts       → src/main/services/ApiKeyStore.test.ts
```

### Step 3: Write the Tests

Structure each test file:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('ModuleName', () => {
  // Group by function or behavior
  describe('functionName', () => {
    it('should [expected behavior] when [condition]', () => {
      // Arrange → Act → Assert
    })
  })
})
```

Guidelines:
- **Test names describe behavior**, not implementation — "should emit npc:interact when player overlaps NPC zone" not "should call emit method"
- **One assertion per test** where practical — makes failures easy to diagnose
- **Mock external dependencies**, not internal logic — mock `EventBus.emit` but don't mock the function you're testing
- **Use `vi.fn()` and `vi.spyOn()`** for mocking, not manual stubs
- **Test the public API** — if a function is exported, test it. If it's private, test it through the public functions that use it.

### Step 4: Verify Tests Pass

Run the generated tests:

```bash
npx vitest run <test-file-path>
```

Fix any failures before presenting to the user. Common issues:
- Missing path aliases (check `vitest.config.ts` for `resolve.alias`)
- Phaser globals not available (may need a mock for `Phaser.Scene`)
- React components needing `@testing-library/react` (suggest installing if needed)

### Mocking Patterns for This Project

**EventBus:**
```typescript
vi.mock('../EventBus', () => ({
  EventBus: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}))
```

**Phaser Scene (for game logic tests):**
```typescript
const mockScene = {
  add: { sprite: vi.fn(), text: vi.fn() },
  physics: { add: { overlap: vi.fn() } },
  input: { keyboard: { addKeys: vi.fn() } }
} as unknown as Phaser.Scene
```

**i18n `t()` function:**
```typescript
vi.mock('../i18n', () => ({
  t: (key: string) => key  // Returns the key itself for assertion
}))
```

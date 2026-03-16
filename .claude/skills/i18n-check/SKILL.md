---
name: i18n-check
description: Compare zh-TW and en locale JSON files to find missing, extra, or mismatched translation keys. Run after adding or modifying locale strings.
---

# i18n Key Sync Check

Compare the zh-TW (primary) and en (secondary) locale files to ensure they stay in sync.

## What To Check

1. **Read both locale files**: `src/renderer/src/i18n/locales/zh-TW.json` and `src/renderer/src/i18n/locales/en.json`
2. **Flatten nested keys** into dot-notation (e.g., `locations.townSquare`)
3. **Report**:
   - Keys in zh-TW but missing from en (these need English translations)
   - Keys in en but missing from zh-TW (likely stale — zh-TW is the source of truth)
   - Keys where the value is identical in both locales (possible untranslated copy-paste)

## Output Format

```
✓ Total keys: XX (zh-TW), XX (en)

Missing from en (need translation):
  - locations.guildHall
  - npc.wizard.greeting

Extra in en (possibly stale):
  - old.removed.key

Suspicious identical values:
  - game.title: "Claude RPG" (OK if intentional)
```

## Rules

- zh-TW is always the source of truth — if a key exists only in en, it's likely stale
- Some keys are intentionally identical across locales (proper nouns like "Claude RPG") — flag but don't treat as errors
- LocalizedString fields on entities (NPC names, quest titles) are NOT in locale files — they use `Record<string, string>` inline. This check is only for the `t()` function's locale JSON files.

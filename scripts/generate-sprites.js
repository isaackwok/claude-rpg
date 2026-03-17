/**
 * Generate humanoid 16×16 pixel art sprites for player and NPCs.
 * Run: node scripts/generate-sprites.js
 */
const { PNG } = require('pngjs')
const fs = require('fs')
const path = require('path')

const FRAME = 16
const T = 0 // transparent

// Helper: create RGBA color
function rgba(r, g, b, a = 255) {
  return [r, g, b, a]
}

// Color palette
const COLORS = {
  transparent: rgba(0, 0, 0, 0),
  // Skin tones
  skin: rgba(234, 195, 154),
  skinShadow: rgba(206, 166, 125),
  // Hair
  brownHair: rgba(101, 67, 33),
  blackHair: rgba(40, 30, 20),
  whiteHair: rgba(210, 210, 215),
  redHair: rgba(180, 60, 30),
  blondeHair: rgba(220, 190, 100),
  // Eyes
  eye: rgba(30, 30, 50),
  eyeWhite: rgba(240, 240, 240),
  // Player outfit
  playerShirt: rgba(55, 120, 190),
  playerShirtShadow: rgba(40, 90, 150),
  playerPants: rgba(70, 70, 100),
  playerPantsShadow: rgba(50, 50, 80),
  playerBoot: rgba(80, 55, 35),
  // NPC colors
  elderRobe: rgba(140, 130, 150),
  elderRobeShadow: rgba(110, 100, 120),
  guildGold: rgba(200, 160, 50),
  guildGoldShadow: rgba(160, 120, 30),
  scholarBlue: rgba(60, 80, 160),
  scholarBlueShadow: rgba(40, 55, 120),
  scribeGreen: rgba(60, 140, 80),
  scribeGreenShadow: rgba(40, 110, 60),
  merchantOrange: rgba(210, 150, 50),
  merchantOrangeShadow: rgba(170, 115, 30),
  commanderRed: rgba(180, 50, 50),
  commanderRedShadow: rgba(140, 35, 35),
  artisanPurple: rgba(140, 80, 170),
  artisanPurpleShadow: rgba(110, 55, 140),
  heraldTeal: rgba(60, 160, 150),
  heraldTealShadow: rgba(40, 130, 120),
  wizardDark: rgba(80, 50, 120),
  wizardDarkShadow: rgba(55, 30, 90),
  wizardHat: rgba(100, 60, 150),
  bartenderBrown: rgba(140, 100, 60),
  bartenderBrownShadow: rgba(110, 75, 40),
  apron: rgba(220, 210, 195),
  apronShadow: rgba(190, 180, 165),
  belt: rgba(80, 55, 35)
}

const C = COLORS

/**
 * Draw a humanoid character facing down (front view).
 * Returns 16×16 array of RGBA values.
 *
 * Layout:
 * Row 0-1:   Hair top
 * Row 2-4:   Head (hair sides + face + eyes)
 * Row 5:     Neck/chin
 * Row 6-9:   Torso
 * Row 10-11: Belt/waist
 * Row 12-15: Legs + feet
 */
function makeCharDown(
  hair,
  shirt,
  shirtShadow,
  pants,
  pantsShadow,
  boot,
  hairColor,
  extraFeatures
) {
  const _ = C.transparent
  const s = C.skin
  const ss = C.skinShadow
  const h = hairColor || C.brownHair
  const e = C.eye
  const sh = shirt
  const shS = shirtShadow
  const p = pants
  const pS = pantsShadow
  const b = boot

  // 16×16 grid — each row is 16 pixels
  const grid = [
    /* 0  */ [_, _, _, _, _, h, h, h, h, h, h, _, _, _, _, _],
    /* 1  */ [_, _, _, _, h, h, h, h, h, h, h, h, _, _, _, _],
    /* 2  */ [_, _, _, _, h, s, s, s, s, s, s, h, _, _, _, _],
    /* 3  */ [_, _, _, _, h, s, e, s, s, e, s, h, _, _, _, _],
    /* 4  */ [_, _, _, _, _, s, s, s, s, s, s, _, _, _, _, _],
    /* 5  */ [_, _, _, _, _, _, s, ss, ss, s, _, _, _, _, _, _],
    /* 6  */ [_, _, _, _, _, sh, sh, sh, sh, sh, sh, _, _, _, _, _],
    /* 7  */ [_, _, _, _, sh, sh, sh, sh, sh, sh, sh, sh, _, _, _, _],
    /* 8  */ [_, _, _, _, s, shS, sh, sh, sh, sh, shS, s, _, _, _, _],
    /* 9  */ [_, _, _, _, _, shS, sh, sh, sh, sh, shS, _, _, _, _, _],
    /* 10 */ [_, _, _, _, _, _, p, p, p, p, _, _, _, _, _, _],
    /* 11 */ [_, _, _, _, _, _, p, p, p, p, _, _, _, _, _, _],
    /* 12 */ [_, _, _, _, _, _, p, pS, pS, p, _, _, _, _, _, _],
    /* 13 */ [_, _, _, _, _, _, p, _, _, p, _, _, _, _, _, _],
    /* 14 */ [_, _, _, _, _, _, b, _, _, b, _, _, _, _, _, _],
    /* 15 */ [_, _, _, _, _, _, b, _, _, b, _, _, _, _, _, _]
  ]

  if (extraFeatures) extraFeatures(grid)
  return grid
}

/**
 * Draw character facing up (back view).
 */
function makeCharUp(hair, shirt, shirtShadow, pants, pantsShadow, boot, hairColor, extraFeatures) {
  const _ = C.transparent
  const h = hairColor || C.brownHair
  const sh = shirt
  const shS = shirtShadow
  const p = pants
  const pS = pantsShadow
  const b = boot

  const grid = [
    /* 0  */ [_, _, _, _, _, h, h, h, h, h, h, _, _, _, _, _],
    /* 1  */ [_, _, _, _, h, h, h, h, h, h, h, h, _, _, _, _],
    /* 2  */ [_, _, _, _, h, h, h, h, h, h, h, h, _, _, _, _],
    /* 3  */ [_, _, _, _, h, h, h, h, h, h, h, h, _, _, _, _],
    /* 4  */ [_, _, _, _, _, h, h, h, h, h, h, _, _, _, _, _],
    /* 5  */ [_, _, _, _, _, _, h, h, h, h, _, _, _, _, _, _],
    /* 6  */ [_, _, _, _, _, sh, sh, sh, sh, sh, sh, _, _, _, _, _],
    /* 7  */ [_, _, _, _, sh, sh, sh, sh, sh, sh, sh, sh, _, _, _, _],
    /* 8  */ [_, _, _, _, sh, shS, sh, sh, sh, sh, shS, sh, _, _, _, _],
    /* 9  */ [_, _, _, _, _, shS, sh, sh, sh, sh, shS, _, _, _, _, _],
    /* 10 */ [_, _, _, _, _, _, p, p, p, p, _, _, _, _, _, _],
    /* 11 */ [_, _, _, _, _, _, p, p, p, p, _, _, _, _, _, _],
    /* 12 */ [_, _, _, _, _, _, p, pS, pS, p, _, _, _, _, _, _],
    /* 13 */ [_, _, _, _, _, _, p, _, _, p, _, _, _, _, _, _],
    /* 14 */ [_, _, _, _, _, _, b, _, _, b, _, _, _, _, _, _],
    /* 15 */ [_, _, _, _, _, _, b, _, _, b, _, _, _, _, _, _]
  ]

  if (extraFeatures) extraFeatures(grid)
  return grid
}

/**
 * Draw character facing left.
 */
function makeCharLeft(
  hair,
  shirt,
  shirtShadow,
  pants,
  pantsShadow,
  boot,
  hairColor,
  extraFeatures
) {
  const _ = C.transparent
  const s = C.skin
  const ss = C.skinShadow
  const h = hairColor || C.brownHair
  const e = C.eye
  const sh = shirt
  const shS = shirtShadow
  const p = pants
  const pS = pantsShadow
  const b = boot

  const grid = [
    /* 0  */ [_, _, _, _, h, h, h, h, h, h, _, _, _, _, _, _],
    /* 1  */ [_, _, _, h, h, h, h, h, h, h, h, _, _, _, _, _],
    /* 2  */ [_, _, _, h, h, s, s, s, s, h, h, _, _, _, _, _],
    /* 3  */ [_, _, _, _, s, e, s, s, s, h, _, _, _, _, _, _],
    /* 4  */ [_, _, _, _, s, s, s, s, s, _, _, _, _, _, _, _],
    /* 5  */ [_, _, _, _, _, s, ss, s, _, _, _, _, _, _, _, _],
    /* 6  */ [_, _, _, _, _, sh, sh, sh, sh, sh, _, _, _, _, _, _],
    /* 7  */ [_, _, _, _, sh, sh, sh, sh, sh, sh, _, _, _, _, _, _],
    /* 8  */ [_, _, _, _, s, shS, sh, sh, sh, sh, _, _, _, _, _, _],
    /* 9  */ [_, _, _, _, _, shS, sh, sh, sh, _, _, _, _, _, _, _],
    /* 10 */ [_, _, _, _, _, _, p, p, p, _, _, _, _, _, _, _],
    /* 11 */ [_, _, _, _, _, _, p, p, p, _, _, _, _, _, _, _],
    /* 12 */ [_, _, _, _, _, _, p, pS, p, _, _, _, _, _, _, _],
    /* 13 */ [_, _, _, _, _, _, p, _, p, _, _, _, _, _, _, _],
    /* 14 */ [_, _, _, _, _, _, b, _, b, _, _, _, _, _, _, _],
    /* 15 */ [_, _, _, _, _, _, b, _, b, _, _, _, _, _, _, _]
  ]

  if (extraFeatures) extraFeatures(grid)
  return grid
}

/**
 * Draw character facing right (mirror of left).
 */
function makeCharRight(
  hair,
  shirt,
  shirtShadow,
  pants,
  pantsShadow,
  boot,
  hairColor,
  extraFeatures
) {
  const leftGrid = makeCharLeft(
    hair,
    shirt,
    shirtShadow,
    pants,
    pantsShadow,
    boot,
    hairColor,
    extraFeatures
  )
  // Mirror horizontally
  return leftGrid.map((row) => [...row].reverse())
}

/**
 * Create 4-direction spritesheet for a character.
 * Order: up(0), down(1), left(2), right(3)
 */
function makeCharSheet(
  shirt,
  shirtShadow,
  pants,
  pantsShadow,
  boot,
  hairColor,
  extraDown,
  extraUp,
  extraLeft
) {
  return [
    makeCharUp(null, shirt, shirtShadow, pants, pantsShadow, boot, hairColor, extraUp),
    makeCharDown(null, shirt, shirtShadow, pants, pantsShadow, boot, hairColor, extraDown),
    makeCharLeft(null, shirt, shirtShadow, pants, pantsShadow, boot, hairColor, extraLeft),
    makeCharRight(null, shirt, shirtShadow, pants, pantsShadow, boot, hairColor)
  ]
}

/**
 * Write pixel grid frames to a PNG spritesheet.
 */
function writeSheet(frames, outputPath) {
  const numFrames = frames.length
  const width = numFrames * FRAME
  const height = FRAME

  const png = new PNG({ width, height })

  for (let f = 0; f < numFrames; f++) {
    const grid = frames[f]
    if (grid.length !== FRAME)
      throw new Error(`Frame ${f}: expected ${FRAME} rows, got ${grid.length}`)
    for (let y = 0; y < FRAME; y++) {
      if (grid[y].length !== FRAME)
        throw new Error(`Frame ${f}, row ${y}: expected ${FRAME} cols, got ${grid[y].length}`)
      for (let x = 0; x < FRAME; x++) {
        const px = grid[y][x]
        if (!px) throw new Error(`Frame ${f}, row ${y}, col ${x}: undefined pixel`)
        const idx = (y * width + (f * FRAME + x)) * 4
        png.data[idx + 0] = px[0]
        png.data[idx + 1] = px[1]
        png.data[idx + 2] = px[2]
        png.data[idx + 3] = px[3]
      }
    }
  }

  const buffer = PNG.sync.write(png)
  fs.writeFileSync(outputPath, buffer)
  console.log(`  Written: ${outputPath} (${width}×${height}, ${numFrames} frames)`)
}

// ─── PLAYER ─────────────────────────────────────────────────
const playerFrames = makeCharSheet(
  C.playerShirt,
  C.playerShirtShadow,
  C.playerPants,
  C.playerPantsShadow,
  C.playerBoot,
  C.brownHair
)

// ─── NPCs ───────────────────────────────────────────────────
// Each NPC gets a single "down-facing" frame (they stand still)

function npcDown(shirt, shirtShadow, pants, pantsShadow, boot, hairColor, extra) {
  return makeCharDown(null, shirt, shirtShadow, pants, pantsShadow, boot, hairColor, extra)
}

const _ = C.transparent

const npcFrames = [
  // 0: Elder — white hair, gray robes
  npcDown(
    C.elderRobe,
    C.elderRobeShadow,
    C.elderRobe,
    C.elderRobeShadow,
    C.playerBoot,
    C.whiteHair,
    (g) => {
      // Long robe — cover legs
      g[12] = [
        _,
        _,
        _,
        _,
        _,
        C.elderRobeShadow,
        C.elderRobe,
        C.elderRobe,
        C.elderRobe,
        C.elderRobe,
        C.elderRobeShadow,
        _,
        _,
        _,
        _,
        _
      ]
      g[13] = [
        _,
        _,
        _,
        _,
        _,
        _,
        C.elderRobe,
        C.elderRobeShadow,
        C.elderRobeShadow,
        C.elderRobe,
        _,
        _,
        _,
        _,
        _,
        _
      ]
      g[14] = [_, _, _, _, _, _, C.playerBoot, _, _, C.playerBoot, _, _, _, _, _, _]
      g[15] = [_, _, _, _, _, _, C.playerBoot, _, _, C.playerBoot, _, _, _, _, _, _]
    }
  ),

  // 1: Guild Master — gold shirt, black hair
  npcDown(
    C.guildGold,
    C.guildGoldShadow,
    C.playerPants,
    C.playerPantsShadow,
    C.playerBoot,
    C.blackHair,
    (g) => {
      // Belt accent
      g[10] = [_, _, _, _, _, _, C.belt, C.guildGold, C.guildGold, C.belt, _, _, _, _, _, _]
    }
  ),

  // 2: Scholar — blue robe, black hair
  npcDown(
    C.scholarBlue,
    C.scholarBlueShadow,
    C.scholarBlue,
    C.scholarBlueShadow,
    C.playerBoot,
    C.blackHair,
    (g) => {
      // Glasses
      const gl = rgba(180, 200, 230)
      g[3] = [
        _,
        _,
        _,
        _,
        C.blackHair,
        C.skin,
        gl,
        C.skin,
        C.skin,
        gl,
        C.skin,
        C.blackHair,
        _,
        _,
        _,
        _
      ]
    }
  ),

  // 3: Scribe — green outfit, brown hair
  npcDown(
    C.scribeGreen,
    C.scribeGreenShadow,
    C.playerPants,
    C.playerPantsShadow,
    C.playerBoot,
    C.brownHair
  ),

  // 4: Merchant — orange/gold, blonde hair, apron
  npcDown(
    C.merchantOrange,
    C.merchantOrangeShadow,
    C.playerPants,
    C.playerPantsShadow,
    C.playerBoot,
    C.blondeHair,
    (g) => {
      // Apron over torso
      g[7] = [
        _,
        _,
        _,
        _,
        C.merchantOrange,
        C.apron,
        C.apron,
        C.apron,
        C.apron,
        C.apron,
        C.apron,
        C.merchantOrange,
        _,
        _,
        _,
        _
      ]
      g[8] = [
        _,
        _,
        _,
        _,
        C.skin,
        C.apronShadow,
        C.apron,
        C.apron,
        C.apron,
        C.apron,
        C.apronShadow,
        C.skin,
        _,
        _,
        _,
        _
      ]
    }
  ),

  // 5: Commander — red armor, black hair
  npcDown(
    C.commanderRed,
    C.commanderRedShadow,
    C.playerPants,
    C.playerPantsShadow,
    C.playerBoot,
    C.blackHair,
    (g) => {
      // Shoulder pads
      g[6] = [
        _,
        _,
        _,
        _,
        C.commanderRed,
        C.commanderRed,
        C.commanderRed,
        C.commanderRed,
        C.commanderRed,
        C.commanderRed,
        C.commanderRed,
        C.commanderRed,
        _,
        _,
        _,
        _
      ]
      g[7] = [
        _,
        _,
        _,
        C.commanderRed,
        C.commanderRed,
        C.commanderRedShadow,
        C.commanderRed,
        C.commanderRed,
        C.commanderRed,
        C.commanderRed,
        C.commanderRedShadow,
        C.commanderRed,
        C.commanderRed,
        _,
        _,
        _
      ]
      // Belt
      g[10] = [
        _,
        _,
        _,
        _,
        _,
        _,
        C.belt,
        C.commanderRedShadow,
        C.commanderRedShadow,
        C.belt,
        _,
        _,
        _,
        _,
        _,
        _
      ]
    }
  ),

  // 6: Artisan — purple, red hair
  npcDown(
    C.artisanPurple,
    C.artisanPurpleShadow,
    C.playerPants,
    C.playerPantsShadow,
    C.playerBoot,
    C.redHair
  ),

  // 7: Herald — teal outfit, blonde hair
  npcDown(
    C.heraldTeal,
    C.heraldTealShadow,
    C.playerPants,
    C.playerPantsShadow,
    C.playerBoot,
    C.blondeHair,
    (g) => {
      // Sash across torso
      g[7] = [
        _,
        _,
        _,
        _,
        C.heraldTeal,
        C.heraldTealShadow,
        C.guildGold,
        C.heraldTeal,
        C.heraldTeal,
        C.heraldTeal,
        C.heraldTeal,
        C.heraldTeal,
        _,
        _,
        _,
        _
      ]
      g[8] = [
        _,
        _,
        _,
        _,
        C.skin,
        C.heraldTealShadow,
        C.heraldTeal,
        C.guildGold,
        C.heraldTeal,
        C.heraldTeal,
        C.heraldTealShadow,
        C.skin,
        _,
        _,
        _,
        _
      ]
    }
  ),

  // 8: Wizard — dark purple robe, wizard hat, white hair
  npcDown(
    C.wizardDark,
    C.wizardDarkShadow,
    C.wizardDark,
    C.wizardDarkShadow,
    C.playerBoot,
    C.whiteHair,
    (g) => {
      // Pointed wizard hat
      g[0] = [_, _, _, _, _, _, _, C.wizardHat, C.wizardHat, _, _, _, _, _, _, _]
      g[1] = [
        _,
        _,
        _,
        _,
        _,
        _,
        C.wizardHat,
        C.wizardHat,
        C.wizardHat,
        C.wizardHat,
        _,
        _,
        _,
        _,
        _,
        _
      ]
      g[2] = [
        _,
        _,
        _,
        _,
        _,
        C.wizardHat,
        C.wizardHat,
        C.wizardHat,
        C.wizardHat,
        C.wizardHat,
        C.wizardHat,
        _,
        _,
        _,
        _,
        _
      ]
      g[3] = [
        _,
        _,
        _,
        _,
        C.wizardHat,
        C.skin,
        C.eye,
        C.skin,
        C.skin,
        C.eye,
        C.skin,
        C.wizardHat,
        _,
        _,
        _,
        _
      ]
      // Long robe
      g[12] = [
        _,
        _,
        _,
        _,
        _,
        C.wizardDarkShadow,
        C.wizardDark,
        C.wizardDark,
        C.wizardDark,
        C.wizardDark,
        C.wizardDarkShadow,
        _,
        _,
        _,
        _,
        _
      ]
      g[13] = [
        _,
        _,
        _,
        _,
        _,
        _,
        C.wizardDark,
        C.wizardDarkShadow,
        C.wizardDarkShadow,
        C.wizardDark,
        _,
        _,
        _,
        _,
        _,
        _
      ]
      g[14] = [_, _, _, _, _, _, C.playerBoot, _, _, C.playerBoot, _, _, _, _, _, _]
      g[15] = [_, _, _, _, _, _, C.playerBoot, _, _, C.playerBoot, _, _, _, _, _, _]
    }
  ),

  // 9: Bartender — brown shirt, white apron
  npcDown(
    C.bartenderBrown,
    C.bartenderBrownShadow,
    C.playerPants,
    C.playerPantsShadow,
    C.playerBoot,
    C.blackHair,
    (g) => {
      // White apron
      g[7] = [
        _,
        _,
        _,
        _,
        C.bartenderBrown,
        C.apron,
        C.apron,
        C.apron,
        C.apron,
        C.apron,
        C.apron,
        C.bartenderBrown,
        _,
        _,
        _,
        _
      ]
      g[8] = [
        _,
        _,
        _,
        _,
        C.skin,
        C.apronShadow,
        C.apron,
        C.apron,
        C.apron,
        C.apron,
        C.apronShadow,
        C.skin,
        _,
        _,
        _,
        _
      ]
      g[9] = [
        _,
        _,
        _,
        _,
        _,
        C.bartenderBrownShadow,
        C.apron,
        C.apron,
        C.apron,
        C.apron,
        C.bartenderBrownShadow,
        _,
        _,
        _,
        _,
        _
      ]
      g[10] = [_, _, _, _, _, _, C.apron, C.apronShadow, C.apronShadow, C.apron, _, _, _, _, _, _]
    }
  )
]

// ─── OUTPUT ─────────────────────────────────────────────────
const outDir = path.join(__dirname, '..', 'src', 'renderer', 'public', 'assets', 'sprites')

console.log('Generating humanoid sprites...')
writeSheet(playerFrames, path.join(outDir, 'player.png'))
writeSheet(npcFrames, path.join(outDir, 'npcs.png'))
console.log('Done!')

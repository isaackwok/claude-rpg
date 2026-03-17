import { Scene } from 'phaser'

/**
 * Zone rectangle in pixel coordinates (from tilemap Objects layer).
 * Decorations are drawn relative to each zone's bounds.
 */
interface ZoneRect {
  x: number
  y: number
  w: number
  h: number
}

/** Pixel-art building decorations drawn via Phaser Graphics API. */
export class BuildingDecorator {
  private scene: Scene

  constructor(scene: Scene) {
    this.scene = scene
  }

  /** Decorate all known buildings. Call after tilemap layers are created. */
  decorateAll(): void {
    this.decorateTower({ x: 592, y: 256, w: 96, h: 80 })
    this.decorateGuildHall({ x: 368, y: 288, w: 112, h: 96 })
    this.decorateLibrary({ x: 800, y: 288, w: 112, h: 96 })
    this.decorateScribeWorkshop({ x: 832, y: 512, w: 96, h: 96 })
    this.decorateMarket({ x: 832, y: 624, w: 128, h: 80 })
    this.decorateArtisanStudio({ x: 352, y: 512, w: 96, h: 96 })
    this.decorateMessengerPost({ x: 352, y: 624, w: 96, h: 80 })
    this.decorateTavern({ x: 560, y: 608, w: 160, h: 96 })
    this.decorateTownSquare({ x: 560, y: 416, w: 160, h: 128 })
  }

  // ─── Tower (Wizard Merlin) ─── Pointed roof, glowing crystal, star motifs ───

  private decorateTower(z: ZoneRect): void {
    const g = this.createGraphics(z.y - 16)
    const cx = z.x + z.w / 2
    const topY = z.y - 4

    // Tall pointed roof — deep purple
    g.fillStyle(0x4a2d7a)
    g.fillTriangle(cx - 24, topY + 12, cx + 24, topY + 12, cx, topY - 14)
    // Roof highlight
    g.fillStyle(0x6b3fa0)
    g.fillTriangle(cx - 16, topY + 10, cx, topY - 10, cx, topY + 10)

    // Spire tip — gold
    g.fillStyle(0xffd700)
    g.fillRect(cx - 1, topY - 16, 3, 4)

    // Glowing crystal orb at top
    g.fillStyle(0x88ccff)
    g.fillRect(cx - 2, topY - 20, 5, 5)
    g.fillStyle(0xaaeeff)
    g.fillRect(cx - 1, topY - 19, 3, 3)
    g.fillStyle(0xffffff)
    g.fillRect(cx, topY - 18, 1, 1)

    // Star decorations on the wall
    const starColor = 0xffd700
    this.drawStar(g, z.x + 14, z.y + 20, starColor)
    this.drawStar(g, z.x + z.w - 14, z.y + 20, starColor)
    this.drawStar(g, z.x + z.w / 2, z.y + 14, starColor)

    // Moon crescent on the front wall
    g.fillStyle(0xccaaff)
    g.fillRect(cx - 4, z.y + z.h - 28, 2, 6)
    g.fillRect(cx - 3, z.y + z.h - 30, 6, 2)
    g.fillRect(cx - 3, z.y + z.h - 22, 6, 2)
    g.fillRect(cx + 2, z.y + z.h - 28, 2, 6)
    // Cut out the crescent inner
    g.fillStyle(0x3a3a5c) // wall color
    g.fillRect(cx - 1, z.y + z.h - 27, 3, 4)

    // Window glow — purple ambient light
    g.fillStyle(0x8866cc, 0.3)
    g.fillRect(z.x + 4, z.y + 10, z.w - 8, z.h - 20)
  }

  // ─── Guild Hall (Guild Master Nile) ─── Grand banner, columns, shield ───

  private decorateGuildHall(z: ZoneRect): void {
    const g = this.createGraphics(z.y - 16)
    const cx = z.x + z.w / 2

    // Wide gabled roof — dark red
    g.fillStyle(0x8b2020)
    g.fillTriangle(cx - z.w / 2 - 8, z.y + 8, cx + z.w / 2 + 8, z.y + 8, cx, z.y - 12)
    // Roof shading
    g.fillStyle(0xa03030)
    g.fillTriangle(cx, z.y - 12, cx + z.w / 2 + 8, z.y + 8, cx, z.y + 8)

    // Ridge beam
    g.fillStyle(0x5c3a1e)
    g.fillRect(cx - 1, z.y - 12, 3, 2)

    // Two columns at the entrance (bottom of zone)
    const colY = z.y + z.h - 20
    g.fillStyle(0xc8b896)
    g.fillRect(z.x + 8, colY, 3, 16)
    g.fillRect(z.x + z.w - 11, colY, 3, 16)
    // Column caps
    g.fillStyle(0xd4c8a8)
    g.fillRect(z.x + 7, colY - 1, 5, 2)
    g.fillRect(z.x + z.w - 12, colY - 1, 5, 2)

    // Shield emblem on the front wall (center)
    g.fillStyle(0xdaa520)
    g.fillRect(cx - 4, z.y + 18, 8, 10)
    g.fillStyle(0xb8860b)
    g.fillRect(cx - 3, z.y + 19, 6, 8)
    // Shield cross
    g.fillStyle(0xdaa520)
    g.fillRect(cx - 1, z.y + 19, 2, 8)
    g.fillRect(cx - 3, z.y + 22, 6, 2)

    // Banner hanging from the roof — red with gold trim
    g.fillStyle(0xcc2222)
    g.fillRect(cx - 3, z.y + 4, 6, 12)
    g.fillStyle(0xdaa520)
    g.fillRect(cx - 3, z.y + 4, 6, 1)
    // Banner tip (pennant)
    g.fillTriangle(cx - 3, z.y + 16, cx + 3, z.y + 16, cx, z.y + 20)
  }

  // ─── Library (Scholar Sophia) ─── Bookshelves, reading lamp, books ───

  private decorateLibrary(z: ZoneRect): void {
    const g = this.createGraphics(z.y - 16)
    const cx = z.x + z.w / 2

    // Flat classical roof with overhang — dark blue/slate
    g.fillStyle(0x2d3a4a)
    g.fillRect(z.x - 4, z.y - 2, z.w + 8, 6)
    g.fillRect(z.x - 2, z.y + 2, z.w + 4, 4)
    // Roof pediment (triangular)
    g.fillStyle(0x3a4a5a)
    g.fillTriangle(cx - 20, z.y + 2, cx + 20, z.y + 2, cx, z.y - 6)

    // Bookshelf along back wall (left side)
    const shelfX = z.x + 6
    const shelfY = z.y + 12
    this.drawBookshelf(g, shelfX, shelfY)

    // Bookshelf along back wall (right side)
    this.drawBookshelf(g, z.x + z.w - 22, shelfY)

    // Reading lamp on desk (center)
    g.fillStyle(0x5c3a1e)
    g.fillRect(cx - 6, z.y + z.h - 26, 12, 2) // desk
    g.fillStyle(0xffd700)
    g.fillRect(cx - 1, z.y + z.h - 30, 2, 4) // lamp post
    g.fillStyle(0xffee88)
    g.fillRect(cx - 2, z.y + z.h - 32, 4, 3) // lamp shade
    // Light glow
    g.fillStyle(0xffee88, 0.15)
    g.fillRect(cx - 6, z.y + z.h - 32, 12, 10)

    // Open book on desk
    g.fillStyle(0xf5e6c8)
    g.fillRect(cx - 4, z.y + z.h - 27, 3, 2) // left page
    g.fillRect(cx + 1, z.y + z.h - 27, 3, 2) // right page
    g.fillStyle(0x8b6b3d)
    g.fillRect(cx, z.y + z.h - 27, 1, 2) // spine

    // Globe near right side
    g.fillStyle(0x4488aa)
    g.fillRect(z.x + z.w - 14, z.y + z.h - 24, 6, 6)
    g.fillStyle(0x55aa88)
    g.fillRect(z.x + z.w - 12, z.y + z.h - 23, 2, 4)
    g.fillStyle(0x5c3a1e)
    g.fillRect(z.x + z.w - 12, z.y + z.h - 18, 4, 2) // stand
  }

  // ─── Scribe Workshop (Scribe Raven) ─── Scrolls, quill, ink, stacked parchment ───

  private decorateScribeWorkshop(z: ZoneRect): void {
    const g = this.createGraphics(z.y - 16)
    const cx = z.x + z.w / 2

    // Angled shed roof — warm brown
    g.fillStyle(0x6b4226)
    g.fillRect(z.x - 4, z.y - 4, z.w + 8, 4)
    g.fillRect(z.x - 2, z.y, z.w + 4, 3)
    // Roof overhang shade
    g.fillStyle(0x5a3520)
    g.fillRect(z.x - 4, z.y - 4, z.w + 8, 2)

    // Large scroll on the wall (unrolled)
    g.fillStyle(0xf5e6c8)
    g.fillRect(cx - 8, z.y + 12, 16, 20)
    // Scroll rollers (top and bottom)
    g.fillStyle(0x8b6b3d)
    g.fillRect(cx - 9, z.y + 11, 18, 2)
    g.fillRect(cx - 9, z.y + 31, 18, 2)
    // Text lines on scroll
    g.fillStyle(0x3a3a3a, 0.4)
    for (let i = 0; i < 5; i++) {
      const lineW = 8 + ((i * 3) % 5)
      g.fillRect(cx - lineW / 2, z.y + 15 + i * 3, lineW, 1)
    }

    // Quill and ink pot (right side)
    g.fillStyle(0x1a1a2e) // ink pot
    g.fillRect(z.x + z.w - 16, z.y + z.h - 24, 5, 5)
    g.fillStyle(0x2a2a4e) // ink top
    g.fillRect(z.x + z.w - 16, z.y + z.h - 24, 5, 2)
    // Quill (diagonal feather)
    g.fillStyle(0xeeddcc)
    g.fillRect(z.x + z.w - 14, z.y + z.h - 30, 1, 7)
    g.fillRect(z.x + z.w - 15, z.y + z.h - 32, 1, 3)
    g.fillStyle(0xbbaa99)
    g.fillRect(z.x + z.w - 16, z.y + z.h - 33, 3, 1)
    g.fillRect(z.x + z.w - 15, z.y + z.h - 34, 1, 1)

    // Stack of parchment/papers (left side)
    g.fillStyle(0xf0dbb5)
    g.fillRect(z.x + 8, z.y + z.h - 22, 10, 2)
    g.fillStyle(0xe8d0a8)
    g.fillRect(z.x + 9, z.y + z.h - 24, 10, 2)
    g.fillStyle(0xf5e6c8)
    g.fillRect(z.x + 7, z.y + z.h - 26, 10, 2)

    // Wax seal stamp
    g.fillStyle(0xcc3333)
    g.fillRect(z.x + 12, z.y + z.h - 20, 3, 3)
    g.fillStyle(0xaa2222)
    g.fillRect(z.x + 13, z.y + z.h - 19, 1, 1)
  }

  // ─── Market (Merchant Marco + Commander Neo) ─── Awning, crates, barrels ───

  private decorateMarket(z: ZoneRect): void {
    const g = this.createGraphics(z.y - 16)

    // Colorful market awning — striped red/white
    for (let i = 0; i < z.w + 8; i += 6) {
      const color = i % 12 === 0 ? 0xcc3333 : 0xf5e6c8
      g.fillStyle(color)
      g.fillRect(z.x - 4 + i, z.y - 4, 6, 5)
    }
    // Awning edge scallop
    g.fillStyle(0xcc3333)
    for (let i = 0; i < z.w + 8; i += 8) {
      g.fillTriangle(z.x - 4 + i, z.y + 1, z.x + 4 + i, z.y + 1, z.x + i, z.y + 5)
    }

    // Wooden stall counter
    g.fillStyle(0x8b6b3d)
    g.fillRect(z.x + 6, z.y + z.h - 22, z.w - 12, 3)
    g.fillStyle(0x6b5020)
    g.fillRect(z.x + 6, z.y + z.h - 19, 2, 8)
    g.fillRect(z.x + z.w - 8, z.y + z.h - 19, 2, 8)

    // Barrel (left)
    this.drawBarrel(g, z.x + 10, z.y + 14)

    // Crate (center)
    g.fillStyle(0x8b6b3d)
    g.fillRect(z.x + z.w / 2 - 5, z.y + 12, 10, 10)
    g.lineStyle(1, 0x5c3a1e)
    g.strokeRect(z.x + z.w / 2 - 5, z.y + 12, 10, 10)
    // Cross planks
    g.fillStyle(0x6b5020)
    g.fillRect(z.x + z.w / 2 - 5, z.y + 16, 10, 1)
    g.fillRect(z.x + z.w / 2, z.y + 12, 1, 10)

    // Sacks of goods (right)
    g.fillStyle(0xc4a66a)
    g.fillRect(z.x + z.w - 22, z.y + 16, 8, 7)
    g.fillStyle(0xb89858)
    g.fillRect(z.x + z.w - 20, z.y + 14, 6, 3)

    // Fruit/goods on counter
    g.fillStyle(0xcc4444)
    g.fillRect(z.x + 12, z.y + z.h - 24, 3, 2) // apples
    g.fillRect(z.x + 16, z.y + z.h - 24, 3, 2)
    g.fillStyle(0xddcc33)
    g.fillRect(z.x + 24, z.y + z.h - 24, 3, 2) // cheese
    g.fillStyle(0x66aa44)
    g.fillRect(z.x + 30, z.y + z.h - 24, 3, 2) // herbs
    g.fillRect(z.x + 34, z.y + z.h - 24, 2, 2)

    // Coin pile on counter
    g.fillStyle(0xdaa520)
    g.fillRect(z.x + z.w - 24, z.y + z.h - 24, 4, 2)
    g.fillStyle(0xffd700)
    g.fillRect(z.x + z.w - 23, z.y + z.h - 25, 2, 1)
  }

  // ─── Artisan Studio (Artisan Iris) ─── Easel, paint, colorful splashes ───

  private decorateArtisanStudio(z: ZoneRect): void {
    const g = this.createGraphics(z.y - 16)
    const cx = z.x + z.w / 2

    // Colorful mosaic roof — varied tiles
    const mosaicColors = [0xcc4444, 0x44aa88, 0x4488cc, 0xddaa33, 0xaa44cc]
    let ci = 0
    for (let i = 0; i < z.w + 8; i += 4) {
      g.fillStyle(mosaicColors[ci % mosaicColors.length])
      g.fillRect(z.x - 4 + i, z.y - 4, 4, 4)
      ci++
    }

    // Easel (left side)
    const easelX = z.x + 10
    const easelY = z.y + 14
    // Easel legs
    g.fillStyle(0x5c3a1e)
    g.fillRect(easelX, easelY + 8, 1, 10)
    g.fillRect(easelX + 8, easelY + 8, 1, 10)
    g.fillRect(easelX + 4, easelY + 10, 1, 12)
    // Canvas on easel
    g.fillStyle(0xf5f0e0)
    g.fillRect(easelX - 1, easelY, 10, 9)
    g.lineStyle(1, 0x8b6b3d)
    g.strokeRect(easelX - 1, easelY, 10, 9)
    // Colorful painting on canvas
    g.fillStyle(0x4488cc)
    g.fillRect(easelX + 1, easelY + 2, 3, 3) // sky
    g.fillStyle(0x44aa44)
    g.fillRect(easelX + 1, easelY + 5, 6, 2) // grass
    g.fillStyle(0xddaa33)
    g.fillRect(easelX + 5, easelY + 2, 2, 2) // sun

    // Paint palette (center-right)
    g.fillStyle(0x8b6b3d)
    g.fillRect(cx + 4, z.y + z.h - 26, 10, 7)
    // Paint dabs on palette
    g.fillStyle(0xcc3333)
    g.fillRect(cx + 5, z.y + z.h - 25, 2, 2)
    g.fillStyle(0x3388cc)
    g.fillRect(cx + 8, z.y + z.h - 25, 2, 2)
    g.fillStyle(0xdddd33)
    g.fillRect(cx + 11, z.y + z.h - 25, 2, 2)
    g.fillStyle(0x44aa44)
    g.fillRect(cx + 6, z.y + z.h - 22, 2, 2)
    g.fillStyle(0xcc66cc)
    g.fillRect(cx + 9, z.y + z.h - 22, 2, 2)

    // Paint brushes (standing in a jar)
    g.fillStyle(0x6b5020)
    g.fillRect(z.x + z.w - 16, z.y + z.h - 24, 5, 6) // jar
    g.fillStyle(0xeeddcc)
    g.fillRect(z.x + z.w - 16, z.y + z.h - 30, 1, 7) // brush 1
    g.fillStyle(0xeeddcc)
    g.fillRect(z.x + z.w - 13, z.y + z.h - 32, 1, 9) // brush 2
    g.fillStyle(0xeeddcc)
    g.fillRect(z.x + z.w - 11, z.y + z.h - 28, 1, 5) // brush 3
    // Brush tips
    g.fillStyle(0xcc3333)
    g.fillRect(z.x + z.w - 16, z.y + z.h - 31, 1, 2)
    g.fillStyle(0x3388cc)
    g.fillRect(z.x + z.w - 13, z.y + z.h - 33, 1, 2)
    g.fillStyle(0xdddd33)
    g.fillRect(z.x + z.w - 11, z.y + z.h - 29, 1, 2)

    // Color splashes on the floor
    g.fillStyle(0xcc3333, 0.25)
    g.fillRect(z.x + 20, z.y + z.h - 14, 4, 3)
    g.fillStyle(0x3388cc, 0.25)
    g.fillRect(cx - 2, z.y + z.h - 12, 3, 3)
    g.fillStyle(0xdddd33, 0.2)
    g.fillRect(z.x + z.w - 20, z.y + z.h - 16, 3, 2)
  }

  // ─── Messenger Post (Herald Naomi) ─── Flags, birdhouse, signal horn ───

  private decorateMessengerPost(z: ZoneRect): void {
    const g = this.createGraphics(z.y - 16)
    const cx = z.x + z.w / 2

    // Flat roof with flag poles
    g.fillStyle(0x4a6a4a)
    g.fillRect(z.x - 2, z.y - 2, z.w + 4, 4)

    // Flag pole (left)
    g.fillStyle(0x8b6b3d)
    g.fillRect(z.x + 6, z.y - 18, 2, 20)
    // Flag — green pennant
    g.fillStyle(0x33aa55)
    g.fillRect(z.x + 8, z.y - 16, 8, 5)
    g.fillTriangle(z.x + 8, z.y - 16, z.x + 8, z.y - 11, z.x + 16, z.y - 13)
    // Flag emblem (envelope)
    g.fillStyle(0xf5e6c8)
    g.fillRect(z.x + 10, z.y - 15, 4, 3)

    // Flag pole (right)
    g.fillStyle(0x8b6b3d)
    g.fillRect(z.x + z.w - 8, z.y - 18, 2, 20)
    // Flag — blue pennant
    g.fillStyle(0x3366aa)
    g.fillRect(z.x + z.w - 16, z.y - 16, 8, 5)
    g.fillTriangle(z.x + z.w - 8, z.y - 16, z.x + z.w - 8, z.y - 11, z.x + z.w - 16, z.y - 13)

    // Birdhouse/perch (center top)
    g.fillStyle(0x5c3a1e)
    g.fillRect(cx - 1, z.y - 10, 2, 12) // pole
    g.fillRect(cx - 5, z.y - 12, 10, 3) // platform
    // Little bird
    g.fillStyle(0xeeeedd)
    g.fillRect(cx - 2, z.y - 15, 4, 3) // body
    g.fillStyle(0xddccbb)
    g.fillRect(cx - 3, z.y - 14, 1, 2) // tail
    g.fillStyle(0xdd8833)
    g.fillRect(cx + 2, z.y - 14, 2, 1) // beak
    g.fillStyle(0x111111)
    g.fillRect(cx + 1, z.y - 15, 1, 1) // eye

    // Mailbox/message box at side
    g.fillStyle(0x6b8b6b)
    g.fillRect(z.x + 12, z.y + z.h - 22, 8, 6)
    g.fillStyle(0x5a7a5a)
    g.fillRect(z.x + 12, z.y + z.h - 22, 8, 2)
    // Letter sticking out
    g.fillStyle(0xf5e6c8)
    g.fillRect(z.x + 15, z.y + z.h - 24, 4, 3)

    // Signal horn on the wall
    g.fillStyle(0xdaa520)
    g.fillRect(z.x + z.w - 18, z.y + 16, 8, 3)
    g.fillRect(z.x + z.w - 20, z.y + 15, 3, 5)
    g.fillStyle(0xb8860b)
    g.fillRect(z.x + z.w - 10, z.y + 16, 2, 3)
  }

  // ─── Tavern (Bartender Rex) ─── Hanging sign, barrels, warm glow ───

  private decorateTavern(z: ZoneRect): void {
    const g = this.createGraphics(z.y - 16)
    const cx = z.x + z.w / 2

    // Warm timber roof — rich brown
    g.fillStyle(0x6b4226)
    g.fillRect(z.x - 6, z.y - 4, z.w + 12, 6)
    // Roof shingle pattern
    g.fillStyle(0x5a3520)
    for (let i = 0; i < z.w + 12; i += 8) {
      g.fillRect(z.x - 6 + i, z.y - 4, 4, 3)
    }
    for (let i = 4; i < z.w + 12; i += 8) {
      g.fillRect(z.x - 6 + i, z.y - 1, 4, 3)
    }

    // Chimney with smoke
    g.fillStyle(0x8b4513)
    g.fillRect(z.x + z.w - 20, z.y - 10, 6, 8)
    g.fillStyle(0x6b3410)
    g.fillRect(z.x + z.w - 21, z.y - 10, 8, 2)
    // Smoke puffs
    g.fillStyle(0x888888, 0.3)
    g.fillRect(z.x + z.w - 19, z.y - 14, 3, 3)
    g.fillStyle(0x999999, 0.2)
    g.fillRect(z.x + z.w - 17, z.y - 18, 4, 3)

    // Hanging tavern sign (front, left side of entrance)
    g.fillStyle(0x5c3a1e)
    g.fillRect(z.x + 14, z.y + 4, 1, 6) // hanging chain
    g.fillRect(z.x + 24, z.y + 4, 1, 6) // hanging chain
    // Sign board
    g.fillStyle(0x8b6b3d)
    g.fillRect(z.x + 12, z.y + 10, 16, 10)
    g.lineStyle(1, 0x5c3a1e)
    g.strokeRect(z.x + 12, z.y + 10, 16, 10)
    // Mug icon on sign
    g.fillStyle(0xdaa520)
    g.fillRect(z.x + 16, z.y + 12, 5, 5)
    g.fillStyle(0x8b6b3d)
    g.fillRect(z.x + 17, z.y + 13, 3, 3) // inner mug
    g.fillStyle(0xdaa520)
    g.fillRect(z.x + 21, z.y + 13, 2, 3) // handle
    // Foam on mug
    g.fillStyle(0xf5f0e0)
    g.fillRect(z.x + 16, z.y + 12, 5, 2)

    // Barrels along the back wall
    this.drawBarrel(g, z.x + z.w - 20, z.y + 12)
    this.drawBarrel(g, z.x + z.w - 32, z.y + 14)

    // Tables (simple wooden)
    g.fillStyle(0x8b6b3d)
    g.fillRect(cx - 10, z.y + z.h - 24, 8, 6) // table 1
    g.fillRect(cx + 4, z.y + z.h - 24, 8, 6) // table 2
    // Mugs on tables
    g.fillStyle(0xaa8844)
    g.fillRect(cx - 8, z.y + z.h - 26, 3, 3)
    g.fillStyle(0xf5f0e0, 0.6)
    g.fillRect(cx - 8, z.y + z.h - 26, 3, 1)
    g.fillStyle(0xaa8844)
    g.fillRect(cx + 6, z.y + z.h - 26, 3, 3)

    // Warm interior glow
    g.fillStyle(0xffaa44, 0.08)
    g.fillRect(z.x + 4, z.y + 8, z.w - 8, z.h - 16)
  }

  // ─── Town Square ─── Fountain/well, flower patches, lanterns ───

  private decorateTownSquare(z: ZoneRect): void {
    const g = this.createGraphics(z.y)
    const cx = z.x + z.w / 2
    const cy = z.y + z.h / 2

    // Stone well/fountain in the center
    g.fillStyle(0x888888)
    g.fillRect(cx - 8, cy - 8, 16, 16)
    g.fillStyle(0x999999)
    g.fillRect(cx - 6, cy - 6, 12, 12)
    // Water
    g.fillStyle(0x4488cc)
    g.fillRect(cx - 5, cy - 5, 10, 10)
    g.fillStyle(0x55aadd)
    g.fillRect(cx - 3, cy - 3, 6, 6)
    // Water shimmer
    g.fillStyle(0x88ccff, 0.5)
    g.fillRect(cx - 2, cy - 2, 2, 1)
    g.fillRect(cx + 1, cy + 1, 2, 1)

    // Well crossbar and bucket
    g.fillStyle(0x5c3a1e)
    g.fillRect(cx - 1, cy - 12, 2, 5) // post
    g.fillRect(cx - 6, cy - 12, 12, 2) // crossbar
    g.fillStyle(0x8b6b3d)
    g.fillRect(cx + 3, cy - 10, 3, 3) // bucket

    // Flower patches around the square
    const flowers = [
      { x: z.x + 10, y: z.y + 10, color: 0xff6688 },
      { x: z.x + z.w - 16, y: z.y + 10, color: 0xffdd44 },
      { x: z.x + 10, y: z.y + z.h - 14, color: 0x44aaff },
      { x: z.x + z.w - 16, y: z.y + z.h - 14, color: 0xff88cc }
    ]
    for (const f of flowers) {
      // Grass base
      g.fillStyle(0x44aa44)
      g.fillRect(f.x, f.y, 6, 4)
      // Flowers
      g.fillStyle(f.color)
      g.fillRect(f.x + 1, f.y, 2, 2)
      g.fillRect(f.x + 3, f.y + 1, 2, 2)
      // Leaves
      g.fillStyle(0x338833)
      g.fillRect(f.x, f.y + 2, 1, 2)
      g.fillRect(f.x + 5, f.y + 2, 1, 2)
    }

    // Lantern posts at two corners
    this.drawLantern(g, z.x + 24, z.y + 6)
    this.drawLantern(g, z.x + z.w - 26, z.y + 6)
  }

  // ─── Helper drawing functions ───

  private createGraphics(depth: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics()
    g.setDepth(depth)
    return g
  }

  private drawStar(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number): void {
    g.fillStyle(color)
    g.fillRect(x, y - 1, 1, 3) // vertical
    g.fillRect(x - 1, y, 3, 1) // horizontal
  }

  private drawBarrel(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x8b5a2b)
    g.fillRect(x, y, 8, 10)
    g.fillStyle(0x6b4020)
    g.fillRect(x, y + 2, 8, 1) // band
    g.fillRect(x, y + 7, 8, 1) // band
    g.fillStyle(0x9b6a3b)
    g.fillRect(x + 1, y + 1, 6, 1) // highlight
  }

  private drawBookshelf(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    // Shelf frame
    g.fillStyle(0x5c3a1e)
    g.fillRect(x, y, 16, 18)
    g.fillStyle(0x4a2d15)
    g.fillRect(x + 1, y + 1, 14, 5) // shelf 1
    g.fillRect(x + 1, y + 7, 14, 5) // shelf 2
    g.fillRect(x + 1, y + 13, 14, 4) // shelf 3

    // Books — varied colors and sizes
    const bookColors = [0xcc3333, 0x3366aa, 0x33aa55, 0xddaa33, 0x8844aa, 0xcc6633]
    let bx = x + 2
    for (let row = 0; row < 3; row++) {
      bx = x + 2
      const rowY = y + 1 + row * 6
      for (let b = 0; b < 4; b++) {
        const w = 2 + (b % 2)
        const h = 3 + ((b + row) % 2)
        g.fillStyle(bookColors[(b + row * 2) % bookColors.length])
        g.fillRect(bx, rowY + (5 - h), w, h)
        bx += w + 1
      }
    }
  }

  private drawLantern(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    // Post
    g.fillStyle(0x444444)
    g.fillRect(x, y, 2, 12)
    // Lantern head
    g.fillStyle(0x555555)
    g.fillRect(x - 2, y - 1, 6, 2)
    g.fillStyle(0xffcc44)
    g.fillRect(x - 1, y + 1, 4, 4) // light
    g.fillStyle(0xffee88, 0.15)
    g.fillRect(x - 4, y - 1, 10, 8) // glow
  }
}

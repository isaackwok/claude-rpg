import { BaseScene } from './BaseScene'
import { DecorationManager } from '../DecorationManager'
import { EventBus } from '../EventBus'

// Room dimensions (in tiles)
const MAP_COLS = 14
const MAP_ROWS = 12
const TILE = 16 // pixels per tile (matches town tileset scale)

// Pixel dimensions
const ROOM_W = MAP_COLS * TILE
const ROOM_H = MAP_ROWS * TILE

// Colors
const COL_FLOOR = 0x2a2040
const COL_WALL = 0x1a1030
const COL_WALL_BORDER = 0x4a3860
const COL_DOOR = 0x8b6b3d

/**
 * Home scene — the player's personal room.
 *
 * Layout (tiles):
 *   - 1-tile wall border around the 14×12 room
 *   - Door opening at bottom-center (col 6–7, row 11)
 *   - Player spawns just above the door
 *   - DecorationManager handles D-key decoration mode
 */
export class Home extends BaseScene {
  private decorationManager!: DecorationManager
  private wallRects: Phaser.GameObjects.Rectangle[] = []

  constructor() {
    super('Home')
  }

  create(data?: { spawnX?: number; spawnY?: number; fromScene?: string }): void {
    // ── Draw room with Phaser graphics ──────────────────────────────────────

    // Floor
    const floor = this.add.rectangle(
      ROOM_W / 2,
      ROOM_H / 2,
      ROOM_W,
      ROOM_H,
      COL_FLOOR
    )
    floor.setDepth(0)

    // Wall graphics (visual)
    const wallGfx = this.add.graphics()
    wallGfx.setDepth(1)
    wallGfx.fillStyle(COL_WALL)

    // Top wall
    wallGfx.fillRect(0, 0, ROOM_W, TILE)
    // Bottom wall (leave gap at col 6–7 for door)
    wallGfx.fillRect(0, ROOM_H - TILE, TILE * 6, TILE) // left of door
    wallGfx.fillRect(TILE * 8, ROOM_H - TILE, ROOM_W - TILE * 8, TILE) // right of door
    // Left wall
    wallGfx.fillRect(0, TILE, TILE, ROOM_H - 2 * TILE)
    // Right wall
    wallGfx.fillRect(ROOM_W - TILE, TILE, TILE, ROOM_H - 2 * TILE)

    // Wall border highlight
    wallGfx.lineStyle(1, COL_WALL_BORDER, 0.6)
    wallGfx.strokeRect(TILE, TILE, ROOM_W - 2 * TILE, ROOM_H - 2 * TILE)

    // Door visual
    const doorGfx = this.add.graphics()
    doorGfx.setDepth(1)
    doorGfx.fillStyle(COL_DOOR)
    doorGfx.fillRect(TILE * 6, ROOM_H - TILE, TILE * 2, TILE)
    doorGfx.lineStyle(1, 0x5c3a1e)
    doorGfx.strokeRect(TILE * 6, ROOM_H - TILE, TILE * 2, TILE)

    // Door label
    const doorLabel = this.add.text(TILE * 7, ROOM_H - TILE / 2, '🚪', {
      fontSize: '10px'
    })
    doorLabel.setOrigin(0.5)
    doorLabel.setDepth(2)

    // ── Physics world bounds ─────────────────────────────────────────────────
    this.physics.world.setBounds(0, 0, ROOM_W, ROOM_H)

    // ── Invisible wall colliders ─────────────────────────────────────────────
    // top wall
    this.addWallZone(0, 0, ROOM_W, TILE)
    // bottom-left wall segment
    this.addWallZone(0, ROOM_H - TILE, TILE * 6, TILE)
    // bottom-right wall segment
    this.addWallZone(TILE * 8, ROOM_H - TILE, ROOM_W - TILE * 8, TILE)
    // left wall
    this.addWallZone(0, TILE, TILE, ROOM_H - 2 * TILE)
    // right wall
    this.addWallZone(ROOM_W - TILE, TILE, TILE, ROOM_H - 2 * TILE)

    // ── Player spawn ─────────────────────────────────────────────────────────
    // Default spawn: just inside the door, near the bottom center
    const spawnX = data?.spawnX ?? TILE * 7
    const spawnY = data?.spawnY ?? ROOM_H - TILE * 2

    this.createPlayer(spawnX, spawnY)

    // Collide player with wall zones
    for (const rect of this.wallRects) {
      this.physics.add.collider(this.player, rect)
    }

    // ── Camera ───────────────────────────────────────────────────────────────
    this.setupCamera(ROOM_W, ROOM_H)

    // ── Exit portal (door back to Town) ─────────────────────────────────────
    // Portal zone in the door gap (bottom center)
    const exitZone = this.add.zone(TILE * 7, ROOM_H - TILE * 0.5, TILE * 2, TILE)
    this.physics.add.existing(exitZone, true)
    this.physics.add.overlap(this.player, exitZone, () => {
      // Spawn back at a fixed spot near the home entrance in Town
      // Home portal will be placed at ~col 10, row 48 in Town (set in Town.ts)
      this.transitionToScene('Town', HOME_TOWN_PORTAL_X, HOME_TOWN_PORTAL_Y)
    })

    // ── DecorationManager ────────────────────────────────────────────────────
    this.decorationManager = new DecorationManager(
      this,
      MAP_COLS,
      MAP_ROWS,
      TILE,
      (tileX, tileY) => this.isPlaceableTile(tileX, tileY)
    )

    // Load previously saved placements
    this.decorationManager.loadPlacements()

    // Click handler for decoration placement
    this.input.on(
      'pointerdown',
      (pointer: Phaser.Input.Pointer) => {
        if (this.decorationManager.isActive) {
          const worldX = pointer.worldX
          const worldY = pointer.worldY
          this.decorationManager.handleClick(worldX, worldY)
        }
      }
    )

    // D key toggles decoration mode
    this.input.keyboard?.on('keydown-D', () => {
      if (this.decorationManager.isActive) {
        this.decorationManager.exit()
      } else {
        this.decorationManager.enter()
      }
    })

    // ESC exits decoration mode (if active)
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.decorationManager.isActive) {
        this.decorationManager.exit()
      }
    })

    // Emit scene change
    EventBus.emit('scene:changed', { sceneName: 'Home', fromScene: data?.fromScene })

    this.fadeIn()
  }

  update(): void {
    this.player.update()
    this.depthSort()
    if (this.decorationManager?.isActive) {
      this.decorationManager.update()
    }
  }

  shutdown(): void {
    super.shutdown()
    this.decorationManager?.destroy()
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Add an invisible static physics rectangle used as a wall collider.
   * We track the rectangles so we can attach colliders after player creation.
   */
  private addWallZone(x: number, y: number, w: number, h: number): void {
    const rect = this.add.rectangle(x + w / 2, y + h / 2, w, h)
    // Make invisible
    rect.setAlpha(0)
    this.physics.add.existing(rect, true)
    this.wallRects.push(rect)
  }

  /**
   * Returns true if the given tile is inside the playable floor area
   * (not a wall tile, not the door area).
   */
  private isPlaceableTile(tileX: number, tileY: number): boolean {
    // Must be within map bounds
    if (tileX < 0 || tileX >= MAP_COLS || tileY < 0 || tileY >= MAP_ROWS) return false
    // Border wall tiles
    if (tileX === 0 || tileX === MAP_COLS - 1) return false
    if (tileY === 0 || tileY === MAP_ROWS - 1) return false
    return true
  }
}

// Town-side coordinates where player spawns after leaving Home.
// Matches the home portal position in Town.ts.
export const HOME_TOWN_PORTAL_X = 10 * 16 + 8
export const HOME_TOWN_PORTAL_Y = 48 * 16 + 8

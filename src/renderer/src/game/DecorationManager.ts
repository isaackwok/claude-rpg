import { EventBus } from './EventBus'

/**
 * DecorationManager — handles decoration placement mode inside the Home scene.
 *
 * Responsibilities:
 * - Enter/exit decoration mode (shows grid overlay)
 * - Track selected cosmetic for placement
 * - Place decorations via IPC and render placeholder sprites
 * - Load previously saved placements on scene start
 */
export class DecorationManager {
  isActive = false
  private gridGraphics?: Phaser.GameObjects.Graphics
  private placedItems: Map<string, Phaser.GameObjects.Rectangle> = new Map()
  private selectedCosmeticId: string | null = null

  constructor(
    private scene: Phaser.Scene,
    private mapWidth: number, // in tiles
    private mapHeight: number, // in tiles
    private tileSize: number,
    private isPlaceable: (tileX: number, tileY: number) => boolean
  ) {}

  enter(): void {
    this.isActive = true
    this.drawGrid()
    EventBus.emit('home:decorate-mode', { active: true })
  }

  exit(): void {
    this.isActive = false
    this.gridGraphics?.destroy()
    this.gridGraphics = undefined
    this.selectedCosmeticId = null
    EventBus.emit('home:decorate-mode', { active: false })
  }

  selectCosmetic(cosmeticDefId: string): void {
    this.selectedCosmeticId = cosmeticDefId
  }

  getSelectedCosmeticId(): string | null {
    return this.selectedCosmeticId
  }

  async loadPlacements(): Promise<void> {
    try {
      const placements = await window.api?.getHomePlacements()
      if (!placements) return
      for (const p of placements) {
        this.spawnDecorationRect(p.cosmeticDefId, p.tileX, p.tileY)
      }
    } catch (err) {
      console.error('[DecorationManager] Failed to load placements:', err)
    }
  }

  handleClick(worldX: number, worldY: number): void {
    if (!this.isActive || !this.selectedCosmeticId) return
    const tileX = Math.floor(worldX / this.tileSize)
    const tileY = Math.floor(worldY / this.tileSize)
    if (!this.isPlaceable(tileX, tileY)) return

    const cosmeticId = this.selectedCosmeticId
    window.api
      ?.placeDecoration(cosmeticId, tileX, tileY)
      .then(() => {
        // Remove old placement if one exists for this cosmetic
        const existing = this.placedItems.get(cosmeticId)
        if (existing) existing.destroy()
        this.spawnDecorationRect(cosmeticId, tileX, tileY)
      })
      .catch((err: unknown) => {
        console.error('[DecorationManager] Failed to place decoration:', err)
      })
  }

  update(): void {
    // Reserved for cursor preview in future iterations
  }

  destroy(): void {
    this.gridGraphics?.destroy()
    this.gridGraphics = undefined
    for (const rect of this.placedItems.values()) {
      rect.destroy()
    }
    this.placedItems.clear()
  }

  private drawGrid(): void {
    this.gridGraphics = this.scene.add.graphics()
    this.gridGraphics.lineStyle(1, 0xc4a46c, 0.2)

    for (let x = 0; x <= this.mapWidth; x++) {
      this.gridGraphics.lineBetween(
        x * this.tileSize,
        0,
        x * this.tileSize,
        this.mapHeight * this.tileSize
      )
    }
    for (let y = 0; y <= this.mapHeight; y++) {
      this.gridGraphics.lineBetween(
        0,
        y * this.tileSize,
        this.mapWidth * this.tileSize,
        y * this.tileSize
      )
    }
    this.gridGraphics.setDepth(1000)
  }

  private spawnDecorationRect(cosmeticDefId: string, tileX: number, tileY: number): void {
    const x = tileX * this.tileSize + this.tileSize / 2
    const y = tileY * this.tileSize + this.tileSize / 2
    const rect = this.scene.add.rectangle(x, y, this.tileSize - 4, this.tileSize - 4, 0xc4a46c, 0.6)
    rect.setDepth(y)
    this.placedItems.set(cosmeticDefId, rect)
  }
}

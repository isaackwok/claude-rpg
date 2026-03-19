import Phaser from 'phaser'
import { EventBus } from '../EventBus'
import type { OverlayLayer } from '../../../../shared/cosmetic-types'

const SPEED = 160

export class Player extends Phaser.Physics.Arcade.Sprite {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private lastX = 0
  private lastY = 0
  private overlays: Map<OverlayLayer, Phaser.GameObjects.Sprite> = new Map()

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player', 1) // frame 1 = facing down

    scene.add.existing(this)
    scene.physics.add.existing(this)

    const body = this.body as Phaser.Physics.Arcade.Body
    body.setSize(10, 8)
    body.setOffset(3, 8)
    body.setCollideWorldBounds(true)

    this.cursors = scene.input.keyboard!.createCursorKeys()

    this.lastX = x
    this.lastY = y
  }

  update(): void {
    const body = this.body as Phaser.Physics.Arcade.Body
    body.setVelocity(0)

    const left = this.cursors.left.isDown
    const right = this.cursors.right.isDown
    const up = this.cursors.up.isDown
    const down = this.cursors.down.isDown

    if (left) {
      body.setVelocityX(-SPEED)
      this.setFrame(2) // left
    } else if (right) {
      body.setVelocityX(SPEED)
      this.setFrame(3) // right
    }

    if (up) {
      body.setVelocityY(-SPEED)
      this.setFrame(0) // up
    } else if (down) {
      body.setVelocityY(SPEED)
      this.setFrame(1) // down
    }

    // Normalize diagonal movement
    if (body.velocity.x !== 0 && body.velocity.y !== 0) {
      body.velocity.normalize().scale(SPEED)
    }

    // Emit position change
    if (this.x !== this.lastX || this.y !== this.lastY) {
      this.lastX = this.x
      this.lastY = this.y
      EventBus.emit('player:moved', { x: this.x, y: this.y, map: 'town' })
    }

    this.syncOverlays()
  }

  /** Equip an overlay sprite */
  equipOverlay(layer: OverlayLayer, textureKey: string): void {
    // Remove existing overlay in this layer
    this.unequipOverlay(layer)

    // Create new sprite at player position
    const overlay = this.scene.add.sprite(this.x, this.y, textureKey)

    // Set depth: cape behind player, hat/aura above
    if (layer === 'cape') {
      overlay.setDepth(this.depth - 1)
    } else {
      overlay.setDepth(this.depth + 1)
    }

    this.overlays.set(layer, overlay)
  }

  /** Unequip an overlay */
  unequipOverlay(layer: OverlayLayer): void {
    const existing = this.overlays.get(layer)
    if (existing) {
      existing.destroy()
      this.overlays.delete(layer)
    }
  }

  /** Sync overlay positions and frames with player — called at end of update() */
  private syncOverlays(): void {
    for (const overlay of this.overlays.values()) {
      overlay.setPosition(this.x, this.y)
      // Match player direction frame
      overlay.setFrame(this.frame.name)
    }
  }

  /** Clean up all overlays */
  destroyOverlays(): void {
    for (const overlay of this.overlays.values()) {
      overlay.destroy()
    }
    this.overlays.clear()
  }
}

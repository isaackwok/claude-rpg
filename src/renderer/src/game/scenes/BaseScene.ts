import { Scene } from 'phaser'
import { Player } from '../entities/Player'
import { EventBus } from '../EventBus'
import type { OverlayLayer } from '../../../../shared/cosmetic-types'

/**
 * BaseScene — shared logic for all game scenes.
 *
 * Provides: player creation, camera setup, keyboard capture toggle,
 * portal handling, scene transitions, fade-in, and depth sorting.
 */
export abstract class BaseScene extends Scene {
  protected player!: Player
  protected _transitioning = false
  private _beforeUnloadHandler: (() => void) | null = null
  private _mapCenterX = 0
  private _mapCenterY = 0

  /** Create the player sprite at the given world position. */
  protected createPlayer(x: number, y: number): void {
    // Reset transition guard — Phaser reuses scene instances across scene.start() calls
    this._transitioning = false

    this.player = new Player(this, x, y)

    // Safety-net: save position if the window is closed unexpectedly
    this._beforeUnloadHandler = () => {
      void window.api?.savePosition(this.scene.key, this.player?.x, this.player?.y)
    }
    window.addEventListener('beforeunload', this._beforeUnloadHandler)

    // Listen for real-time equip/unequip events
    EventBus.on('cosmetic:equipped', () => {
      void this.loadEquippedOverlays()
    })

    EventBus.on('cosmetic:unequipped', (data: { layer: OverlayLayer }) => {
      this.player.unequipOverlay(data.layer)
    })

    void this.loadEquippedOverlays()
  }

  /** Load equipped overlay cosmetics from the main process and apply them to the player. */
  protected async loadEquippedOverlays(): Promise<void> {
    try {
      const cosmetics = await window.api?.getCosmetics()
      if (!cosmetics) return
      // Clear existing overlays before re-applying
      this.player.destroyOverlays()
      for (const c of cosmetics) {
        if (
          c.equipped &&
          c.definition.type === 'overlay' &&
          c.definition.layer &&
          c.definition.spriteSheet
        ) {
          this.player.equipOverlay(c.definition.layer, c.definition.spriteSheet)
        }
      }
    } catch (err) {
      console.error('[BaseScene] Failed to load equipped overlays:', err)
    }
  }

  /**
   * Configure the main camera to follow the player within map bounds.
   * @param mapWidth  Total pixel width of the tilemap
   * @param mapHeight Total pixel height of the tilemap
   */
  protected setupCamera(mapWidth: number, mapHeight: number): void {
    const cam = this.cameras.main
    cam.setZoom(2)
    cam.setBackgroundColor('#1a1a2e')

    // Effective viewport size at current zoom
    const viewW = cam.width / cam.zoom
    const viewH = cam.height / cam.zoom

    // For small maps (smaller than viewport), use negative bounds offset so
    // the camera can center the map instead of anchoring to the top-left.
    const boundsX = mapWidth < viewW ? -(viewW - mapWidth) / 2 : 0
    const boundsY = mapHeight < viewH ? -(viewH - mapHeight) / 2 : 0
    const boundsW = mapWidth < viewW ? viewW : mapWidth
    const boundsH = mapHeight < viewH ? viewH : mapHeight

    cam.setBounds(boundsX, boundsY, boundsW, boundsH)
    cam.startFollow(this.player, true, 0.1, 0.1)

    // Store map center for R-key reset
    this._mapCenterX = mapWidth / 2
    this._mapCenterY = mapHeight / 2

    // DEV: R key resets player to map center (testing aid)
    this.input.keyboard?.on('keydown-R', () => {
      this.player.setPosition(this._mapCenterX, this._mapCenterY)
      console.log(`[DEV] Player reset to map center (${this._mapCenterX}, ${this._mapCenterY})`)
    })
  }

  /**
   * Toggle Phaser's key capture — release during dialogue so the DOM input
   * receives keystrokes; restore when returning to gameplay.
   */
  setKeyboardEnabled(enabled: boolean): void {
    const kb = this.input.keyboard!
    const keys = [
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT
    ]
    if (enabled) {
      kb.addCapture(keys)
    } else {
      kb.removeCapture(keys)
    }
  }

  /**
   * Read the `portals` object layer from the tilemap and create physics
   * overlap zones. Each portal object must have custom properties:
   *   - `targetScene` (string)
   *   - `spawnX`      (number)
   *   - `spawnY`      (number)
   */
  protected setupPortals(map: Phaser.Tilemaps.Tilemap): void {
    const portalLayer = map.getObjectLayer('portals')
    if (!portalLayer) return

    for (const obj of portalLayer.objects) {
      const props = obj.properties as Array<{ name: string; value: unknown }> | undefined
      const targetScene = props?.find((p) => p.name === 'targetScene')?.value as string | undefined
      const spawnX = props?.find((p) => p.name === 'spawnX')?.value as number | undefined
      const spawnY = props?.find((p) => p.name === 'spawnY')?.value as number | undefined

      if (!targetScene) continue

      const zone = this.add.zone(
        obj.x! + obj.width! / 2,
        obj.y! + obj.height! / 2,
        obj.width!,
        obj.height!
      )
      this.physics.add.existing(zone, true)
      this.physics.add.overlap(this.player, zone, () => {
        this.transitionToScene(targetScene, spawnX, spawnY)
      })
    }
  }

  /**
   * Transition to another scene with a camera fade-out and position save.
   * Guarded against double-triggering by `_transitioning`.
   */
  protected transitionToScene(targetScene: string, spawnX?: number, spawnY?: number): void {
    if (this._transitioning) return
    this._transitioning = true

    // Save the current scene + current player position (not the target)
    void window.api?.savePosition(this.scene.key, this.player?.x ?? 0, this.player?.y ?? 0)

    this.cameras.main.fadeOut(300, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => {
      EventBus.emit('scene:changed', { sceneName: targetScene, fromScene: this.scene.key })
      this.scene.start(targetScene, { spawnX, spawnY, fromScene: this.scene.key })
    })
  }

  /** Fade the camera in over 300 ms. Call at the end of `create()`. */
  protected fadeIn(): void {
    // Block player movement during the fade-in animation
    this._transitioning = true

    // Reset camera alpha in case previous scene left it faded out
    this.cameras.main.resetFX()
    this.cameras.main.fadeIn(300)
    this.cameras.main.once('camerafadeincomplete', () => {
      this._transitioning = false
    })
  }

  /**
   * Y-based depth sorting for top-down depth ordering.
   * Sorts the player and any additional display objects passed in.
   * @param extras Additional game objects (e.g. NPCs) to depth-sort.
   */
  protected depthSort(extras: Phaser.GameObjects.Components.Depth[] = []): void {
    this.player.setDepth(this.player.y)
    for (const obj of extras) {
      const go = obj as unknown as Phaser.GameObjects.GameObject &
        Phaser.GameObjects.Components.Depth &
        Phaser.GameObjects.Components.Transform
      go.setDepth(go.y)
    }
  }

  /**
   * Base shutdown — saves current position and cleans up.
   * Override in subclasses; call `super.shutdown()` first.
   */
  shutdown(): void {
    if (this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler)
      this._beforeUnloadHandler = null
    }
    if (this.player) {
      void window.api?.savePosition(this.scene.key, this.player.x, this.player.y)
    }
  }
}

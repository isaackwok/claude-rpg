import { Scene } from 'phaser'
import { Player } from '../entities/Player'
import { EventBus } from '../EventBus'

/**
 * BaseScene — shared logic for all game scenes.
 *
 * Provides: player creation, camera setup, keyboard capture toggle,
 * portal handling, scene transitions, fade-in, and depth sorting.
 */
export abstract class BaseScene extends Scene {
  protected player!: Player
  private _transitioning = false
  private _beforeUnloadHandler: (() => void) | null = null

  /** Create the player sprite at the given world position. */
  protected createPlayer(x: number, y: number): void {
    this.player = new Player(this, x, y)

    // Safety-net: save position if the window is closed unexpectedly
    this._beforeUnloadHandler = () => {
      void window.api?.savePosition(this.scene.key, this.player?.x, this.player?.y)
    }
    window.addEventListener('beforeunload', this._beforeUnloadHandler)
  }

  /**
   * Configure the main camera to follow the player within map bounds.
   * @param mapWidth  Total pixel width of the tilemap
   * @param mapHeight Total pixel height of the tilemap
   */
  protected setupCamera(mapWidth: number, mapHeight: number): void {
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight)
    this.physics.world.setBounds(0, 0, mapWidth, mapHeight)
    this.cameras.main.setBackgroundColor('#1a1a2e')
    this.cameras.main.setZoom(2)
  }

  /**
   * Toggle Phaser's key capture — release during dialogue so the DOM input
   * receives keystrokes; restore when returning to gameplay.
   */
  setKeyboardEnabled(enabled: boolean): void {
    const kb = this.input.keyboard!
    const keys = [
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.W,
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.S,
      Phaser.Input.Keyboard.KeyCodes.D,
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

    void window.api?.savePosition(targetScene, spawnX ?? 0, spawnY ?? 0)

    this.cameras.main.fadeOut(300, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => {
      EventBus.emit('scene:changed', { sceneName: targetScene, fromScene: this.scene.key })
      this.scene.start(targetScene, { spawnX, spawnY, fromScene: this.scene.key })
    })
  }

  /** Fade the camera in over 300 ms. Call at the end of `create()`. */
  protected fadeIn(): void {
    this.cameras.main.fadeIn(300)
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

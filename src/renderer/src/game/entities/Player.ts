import Phaser from 'phaser'
import { EventBus } from '../EventBus'

const SPEED = 160

export class Player extends Phaser.Physics.Arcade.Sprite {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key }
  private lastX = 0
  private lastY = 0

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player', 1) // frame 1 = facing down

    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setDepth(10)
    const body = this.body as Phaser.Physics.Arcade.Body
    body.setSize(10, 8)
    body.setOffset(3, 8)
    body.setCollideWorldBounds(true)

    this.cursors = scene.input.keyboard!.createCursorKeys()
    this.wasd = {
      W: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }

    this.lastX = x
    this.lastY = y
  }

  update(): void {
    const body = this.body as Phaser.Physics.Arcade.Body
    body.setVelocity(0)

    const left = this.cursors.left.isDown || this.wasd.A.isDown
    const right = this.cursors.right.isDown || this.wasd.D.isDown
    const up = this.cursors.up.isDown || this.wasd.W.isDown
    const down = this.cursors.down.isDown || this.wasd.S.isDown

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
  }
}

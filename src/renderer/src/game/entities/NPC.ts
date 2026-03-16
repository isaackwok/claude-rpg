import Phaser from 'phaser'
import type { AgentDef } from '../types'

export class NPC extends Phaser.Physics.Arcade.Sprite {
  public readonly agentDef: AgentDef
  public playerInRange = false
  public interactionZone: Phaser.GameObjects.Zone

  constructor(scene: Phaser.Scene, x: number, y: number, agentDef: AgentDef) {
    super(scene, x, y, agentDef.sprite, agentDef.spriteFrame)
    this.agentDef = agentDef

    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setDepth(10)
    this.setImmovable(true)
    const body = this.body as Phaser.Physics.Arcade.Body
    body.setSize(14, 14)
    body.setOffset(1, 1)

    // Interaction zone (48x48 around NPC)
    this.interactionZone = scene.add.zone(x, y, 48, 48)
    scene.physics.add.existing(this.interactionZone, true) // static body

    // Idle bob animation
    scene.tweens.add({
      targets: this,
      y: y - 2,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }
}

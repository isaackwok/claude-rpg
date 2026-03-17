import Phaser from 'phaser'
import type { AgentDef } from '../types'
import { EventBus } from '../EventBus'

export class NPC extends Phaser.Physics.Arcade.Sprite {
  public readonly agentDef: AgentDef
  public playerInRange = false
  public interactionZone: Phaser.GameObjects.Zone

  private speechBubble: Phaser.GameObjects.Graphics | null = null
  private onSpeechBubble: (data: { agentId: string; visible: boolean }) => void

  constructor(scene: Phaser.Scene, x: number, y: number, agentDef: AgentDef) {
    super(scene, x, y, agentDef.sprite, agentDef.spriteFrame)
    this.agentDef = agentDef

    scene.add.existing(this)
    scene.physics.add.existing(this)

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
      ease: 'Sine.easeInOut'
    })

    // Speech bubble listener
    this.onSpeechBubble = (data) => {
      if (data.agentId !== this.agentDef.id) return
      if (data.visible) {
        this.showSpeechBubble()
      } else {
        this.hideSpeechBubble()
      }
    }
    EventBus.on('npc:speech-bubble', this.onSpeechBubble)
  }

  private showSpeechBubble(): void {
    if (this.speechBubble) return
    this.speechBubble = this.scene.add.graphics()
    // Draw a small white speech bubble
    this.speechBubble.fillStyle(0xffffff, 0.9)
    this.speechBubble.fillRoundedRect(-6, -6, 12, 10, 3)
    // Small triangle pointer
    this.speechBubble.fillTriangle(-2, 4, 2, 4, 0, 8)
    // Position relative to NPC — offset above head
    this.speechBubble.setPosition(this.x, this.y - 14)
    this.speechBubble.setDepth(9999)

    // Track NPC position so bubble follows the idle bob
    this.scene.events.on('update', this.updateSpeechBubblePosition, this)
  }

  private updateSpeechBubblePosition(): void {
    if (this.speechBubble) {
      this.speechBubble.setPosition(this.x, this.y - 14)
    }
  }

  private hideSpeechBubble(): void {
    if (this.speechBubble) {
      this.scene.events.off('update', this.updateSpeechBubblePosition, this)
      this.speechBubble.destroy()
      this.speechBubble = null
    }
  }

  destroy(fromScene?: boolean): void {
    EventBus.off('npc:speech-bubble', this.onSpeechBubble)
    this.hideSpeechBubble()
    super.destroy(fromScene)
  }
}

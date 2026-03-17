import Phaser from 'phaser'
import type { AgentDef } from '../types'
import { EventBus } from '../EventBus'

type BubbleStyle = 'streaming' | 'ready'

export class NPC extends Phaser.Physics.Arcade.Sprite {
  public readonly agentDef: AgentDef
  public playerInRange = false
  public interactionZone: Phaser.GameObjects.Zone

  private bubbleContainer: Phaser.GameObjects.Container | null = null
  private bubbleStyle: BubbleStyle | null = null
  private dotTween: Phaser.Tweens.Tween | null = null
  private onSpeechBubble: (data: { agentId: string; style: BubbleStyle | false }) => void

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
      if (data.style === false) {
        this.hideSpeechBubble()
      } else {
        this.showSpeechBubble(data.style)
      }
    }
    EventBus.on('npc:speech-bubble', this.onSpeechBubble)
  }

  private showSpeechBubble(style: BubbleStyle): void {
    // If same style already showing, nothing to do
    if (this.bubbleContainer && this.bubbleStyle === style) return

    // If switching styles, tear down old bubble first
    if (this.bubbleContainer) {
      this.hideSpeechBubble()
    }

    this.bubbleStyle = style
    this.bubbleContainer = this.scene.add.container(this.x, this.y - 16)
    this.bubbleContainer.setDepth(9999)

    // Draw bubble background
    const bg = this.scene.add.graphics()
    bg.fillStyle(0xffffff, 0.92)
    bg.fillRoundedRect(-8, -8, 16, 12, 3)
    // Triangle pointer
    bg.fillTriangle(-2, 4, 2, 4, 0, 7)
    this.bubbleContainer.add(bg)

    if (style === 'streaming') {
      this.drawStreamingDots()
    } else {
      this.drawReadyCheck()
    }

    this.scene.events.on('update', this.updateBubblePosition, this)
  }

  private drawStreamingDots(): void {
    if (!this.bubbleContainer) return

    const dots: Phaser.GameObjects.Graphics[] = []
    for (let i = 0; i < 3; i++) {
      const dot = this.scene.add.graphics()
      dot.fillStyle(0x666666, 1)
      dot.fillCircle(-4 + i * 4, 0, 1)
      dot.setAlpha(0.3)
      this.bubbleContainer.add(dot)
      dots.push(dot)
    }

    // Animate dots in sequence
    let dotIndex = 0
    this.dotTween = this.scene.tweens.addCounter({
      from: 0,
      to: 3,
      duration: 900,
      repeat: -1,
      onUpdate: (tween) => {
        const newIndex = Math.floor(tween.getValue() ?? 0)
        if (newIndex !== dotIndex) {
          dotIndex = newIndex
          dots.forEach((d, i) => d.setAlpha(i === dotIndex % 3 ? 1 : 0.3))
        }
      }
    })
  }

  private drawReadyCheck(): void {
    if (!this.bubbleContainer) return

    const check = this.scene.add.graphics()
    check.lineStyle(1.5, 0x4caf50, 1) // green
    check.beginPath()
    check.moveTo(-3, 0)
    check.lineTo(-1, 2)
    check.lineTo(3, -2)
    check.strokePath()
    this.bubbleContainer.add(check)
  }

  private updateBubblePosition(): void {
    if (this.bubbleContainer) {
      this.bubbleContainer.setPosition(this.x, this.y - 16)
    }
  }

  private hideSpeechBubble(): void {
    if (this.dotTween) {
      this.dotTween.destroy()
      this.dotTween = null
    }
    if (this.bubbleContainer) {
      this.scene.events.off('update', this.updateBubblePosition, this)
      this.bubbleContainer.destroy()
      this.bubbleContainer = null
    }
    this.bubbleStyle = null
  }

  destroy(fromScene?: boolean): void {
    EventBus.off('npc:speech-bubble', this.onSpeechBubble)
    this.hideSpeechBubble()
    super.destroy(fromScene)
  }
}

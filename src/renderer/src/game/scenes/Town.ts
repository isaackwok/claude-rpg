import { Scene } from 'phaser'
import { Player } from '../entities/Player'
import { NPC } from '../entities/NPC'
import { BUILT_IN_NPCS } from '../data/npcs'
import { EventBus } from '../EventBus'
import type { SkillCategory } from '../types'
import { t } from '../../i18n'

export class Town extends Scene {
  private player!: Player
  private collisionLayer!: Phaser.Tilemaps.TilemapLayer
  private npcs: NPC[] = []
  private dialogueOpen = false
  private spaceKey!: Phaser.Input.Keyboard.Key
  private currentZone: string | null = null
  private zones: { zone: Phaser.GameObjects.Zone; zoneId: string; zoneName: string }[] = []
  private onDialogueClosed!: () => void
  private onXPGained!: (data: { category: SkillCategory; amount: number; agentId: string }) => void
  private onLevelUp!: (data: {
    category: SkillCategory
    newLevel: number
    overallLevel: number
  }) => void
  private noticeBoardZone!: Phaser.GameObjects.Zone
  private playerNearNoticeBoard = false

  constructor() {
    super('Town')
  }

  create(): void {
    // Create tilemap
    const map = this.make.tilemap({ key: 'town-map' })
    const tileset = map.addTilesetImage('town-tileset', 'town-tileset')!

    // Create layers
    map.createLayer('Ground', tileset)!
    map.createLayer('Buildings', tileset)!
    this.collisionLayer = map.createLayer('Collision', tileset)!
    this.collisionLayer.setVisible(false)
    this.collisionLayer.setCollisionByExclusion([-1])

    // Player spawn (center of Town Square)
    const spawnX = 39 * 16 + 8
    const spawnY = 29 * 16 + 8
    this.player = new Player(this, spawnX, spawnY)

    // Collision with tilemap
    this.physics.add.collider(this.player, this.collisionLayer)

    // Spawn NPCs
    for (const agentDef of BUILT_IN_NPCS) {
      const npc = new NPC(this, agentDef.location.x, agentDef.location.y, agentDef)
      this.npcs.push(npc)

      // Collide player with NPC body
      this.physics.add.collider(this.player, npc)

      // Overlap player with NPC interaction zone
      this.physics.add.overlap(this.player, npc.interactionZone, () => {
        if (!npc.playerInRange) {
          npc.playerInRange = true
          EventBus.emit('npc:proximity', { agentId: npc.agentDef.id, inRange: true })
        }
      })
    }

    // Notice Board — interactable object at the center of the town square
    const nbX = 39 * 16 + 8 // same X as player spawn (center)
    const nbY = 28 * 16 + 8 // one tile above player spawn
    this.createNoticeBoard(nbX, nbY)

    // Parse zone objects from tilemap
    const objectLayer = map.getObjectLayer('Objects')
    if (objectLayer) {
      for (const obj of objectLayer.objects) {
        if (obj.type === 'zone') {
          const zoneId = obj.properties?.find((p: { name: string }) => p.name === 'zoneId')
            ?.value as string
          const zoneName = obj.properties?.find((p: { name: string }) => p.name === 'zoneName')
            ?.value as string
          if (zoneId && zoneName) {
            const zone = this.add.zone(
              obj.x! + obj.width! / 2,
              obj.y! + obj.height! / 2,
              obj.width!,
              obj.height!
            )
            this.physics.add.existing(zone, true)
            this.zones.push({ zone, zoneId, zoneName })
            this.physics.add.overlap(this.player, zone)
          }
        }
      }
    }

    // Space key for interaction
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    // Listen for dialogue close
    this.onDialogueClosed = () => {
      this.dialogueOpen = false
      this.setCaptureGameKeys(true)
    }
    EventBus.on('dialogue:closed', this.onDialogueClosed)

    // Floating XP text on xp:gained
    this.onXPGained = (data) => {
      const npc = this.npcs.find((n) => n.agentDef.id === data.agentId)
      const x = npc ? npc.x : this.player.x
      const y = npc ? npc.y - 16 : this.player.y - 16

      const color = this.getSkillColor(data.category)
      const text = this.add.text(x, y, `+${data.amount} XP`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color,
        stroke: '#000000',
        strokeThickness: 2
      })
      text.setOrigin(0.5)
      text.setDepth(10000)

      this.tweens.add({
        targets: text,
        y: y - 40,
        alpha: 0,
        duration: 1500,
        ease: 'Power2',
        onComplete: () => text.destroy()
      })
    }
    EventBus.on('xp:gained', this.onXPGained)

    // Level-up celebration text
    this.onLevelUp = (data) => {
      const icon = this.getSkillIcon(data.category)
      const text = this.add.text(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2 - 40,
        `${icon} ${t('xp.levelUp', { level: String(data.newLevel) })}`,
        {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#ffd700',
          stroke: '#000000',
          strokeThickness: 3
        }
      )
      text.setOrigin(0.5)
      text.setScrollFactor(0)
      text.setDepth(10000)

      this.tweens.add({
        targets: text,
        y: text.y - 30,
        alpha: 0,
        duration: 2000,
        ease: 'Power2',
        onComplete: () => text.destroy()
      })
    }
    EventBus.on('level:up', this.onLevelUp)

    // Camera
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.cameras.main.setBackgroundColor('#1a1a2e')
    this.cameras.main.setZoom(2)
  }

  private createNoticeBoard(x: number, y: number): void {
    const g = this.add.graphics()
    g.setDepth(y)

    // Two wooden posts (dark brown)
    g.fillStyle(0x5c3a1e)
    g.fillRect(x - 6, y - 2, 2, 10) // left post
    g.fillRect(x + 4, y - 2, 2, 10) // right post

    // Board panel (lighter wood)
    g.fillStyle(0x8b6b3d)
    g.fillRect(x - 7, y - 8, 14, 8)

    // Board border (dark outline)
    g.lineStyle(1, 0x3e2510)
    g.strokeRect(x - 7, y - 8, 14, 8)

    // Paper notices pinned to board (white/cream rectangles)
    g.fillStyle(0xf5e6c8)
    g.fillRect(x - 5, y - 7, 4, 5) // left note
    g.fillStyle(0xeadbc0)
    g.fillRect(x + 1, y - 7, 4, 3) // right note (shorter)
    g.fillStyle(0xf0dbb5)
    g.fillRect(x + 1, y - 3, 4, 2) // bottom-right note

    // Tiny pin dots (red)
    g.fillStyle(0xcc3333)
    g.fillRect(x - 4, y - 7, 1, 1) // pin on left note
    g.fillRect(x + 2, y - 7, 1, 1) // pin on right note

    // Collision body — static physics sprite (same pattern as NPCs)
    const collider = this.add.zone(x, y - 2, 14, 12)
    this.physics.add.existing(collider, true) // static body
    this.physics.add.collider(this.player, collider)

    // Interaction zone (larger area around the board for proximity detection)
    this.noticeBoardZone = this.add.zone(x, y, 48, 48)
    this.physics.add.existing(this.noticeBoardZone, true)
    this.physics.add.overlap(this.player, this.noticeBoardZone, () => {
      if (!this.playerNearNoticeBoard) {
        this.playerNearNoticeBoard = true
        EventBus.emit('npc:proximity', { agentId: '__noticeBoard__', inRange: true })
      }
    })
  }

  /** Toggle Phaser's key capture — release during dialogue so the DOM input receives keystrokes */
  private setCaptureGameKeys(capture: boolean): void {
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
    if (capture) {
      kb.addCapture(keys)
    } else {
      kb.removeCapture(keys)
    }
  }

  private getSkillColor(category: SkillCategory): string {
    const colors: Record<SkillCategory, string> = {
      writing: '#e8b44c',
      research: '#5bb5e8',
      code: '#a78bfa',
      data: '#4ade80',
      communication: '#f472b6',
      organization: '#fb923c',
      visual: '#c084fc'
    }
    return colors[category] ?? '#c4a46c'
  }

  private getSkillIcon(category: SkillCategory): string {
    const icons: Record<SkillCategory, string> = {
      writing: '\u270d\ufe0f',
      research: '\ud83d\udd0d',
      code: '\ud83d\udcbb',
      data: '\ud83d\udcca',
      communication: '\ud83d\udcac',
      organization: '\ud83d\udccb',
      visual: '\ud83c\udfa8'
    }
    return icons[category] ?? ''
  }

  shutdown(): void {
    EventBus.off('dialogue:closed', this.onDialogueClosed)
    EventBus.off('xp:gained', this.onXPGained)
    EventBus.off('level:up', this.onLevelUp)
  }

  update(): void {
    if (this.dialogueOpen) return

    this.player.update()

    // Y-based depth sorting: entities lower on screen render in front
    this.player.setDepth(this.player.y)
    for (const npc of this.npcs) {
      npc.setDepth(npc.y)
    }

    // Check NPC proximity exit
    for (const npc of this.npcs) {
      if (npc.playerInRange) {
        const zoneBody = npc.interactionZone.body as Phaser.Physics.Arcade.StaticBody
        const playerBody = this.player.body as Phaser.Physics.Arcade.Body
        const playerRect = new Phaser.Geom.Rectangle(
          playerBody.x,
          playerBody.y,
          playerBody.width,
          playerBody.height
        )
        const zoneRect = new Phaser.Geom.Rectangle(
          zoneBody.x,
          zoneBody.y,
          zoneBody.width,
          zoneBody.height
        )
        if (!Phaser.Geom.Intersects.RectangleToRectangle(playerRect, zoneRect)) {
          npc.playerInRange = false
          EventBus.emit('npc:proximity', { agentId: npc.agentDef.id, inRange: false })
        }
      }
    }

    // Notice Board proximity exit
    if (this.playerNearNoticeBoard) {
      const nbBody = this.noticeBoardZone.body as Phaser.Physics.Arcade.StaticBody
      const pBody = this.player.body as Phaser.Physics.Arcade.Body
      const pRect = new Phaser.Geom.Rectangle(pBody.x, pBody.y, pBody.width, pBody.height)
      const nbRect = new Phaser.Geom.Rectangle(nbBody.x, nbBody.y, nbBody.width, nbBody.height)
      if (!Phaser.Geom.Intersects.RectangleToRectangle(pRect, nbRect)) {
        this.playerNearNoticeBoard = false
        EventBus.emit('npc:proximity', { agentId: '__noticeBoard__', inRange: false })
      }
    }

    // Space key interaction
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      // Notice Board takes priority if player is near it
      if (this.playerNearNoticeBoard && !this.dialogueOpen) {
        EventBus.emit('noticeboard:interact', {})
        return
      }
      const nearbyNpc = this.npcs.find((npc) => npc.playerInRange)
      if (nearbyNpc && !this.dialogueOpen) {
        this.dialogueOpen = true
        this.setCaptureGameKeys(false)
        EventBus.emit('npc:interact', {
          agentId: nearbyNpc.agentDef.id,
          npcPosition: { x: nearbyNpc.x, y: nearbyNpc.y }
        })
      }
    }

    // Zone detection
    for (const { zone, zoneId, zoneName } of this.zones) {
      const zoneBody = zone.body as Phaser.Physics.Arcade.StaticBody
      const playerBody = this.player.body as Phaser.Physics.Arcade.Body
      const playerRect = new Phaser.Geom.Rectangle(
        playerBody.x,
        playerBody.y,
        playerBody.width,
        playerBody.height
      )
      const zoneRect = new Phaser.Geom.Rectangle(
        zoneBody.x,
        zoneBody.y,
        zoneBody.width,
        zoneBody.height
      )
      if (Phaser.Geom.Intersects.RectangleToRectangle(playerRect, zoneRect)) {
        if (this.currentZone !== zoneId) {
          this.currentZone = zoneId
          EventBus.emit('zone:entered', { zoneId, zoneName })
          window.api?.recordZoneVisit(zoneId)
        }
        return
      }
    }
    if (this.currentZone !== null) {
      this.currentZone = null
    }
  }
}

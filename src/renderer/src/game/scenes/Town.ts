import { Scene } from 'phaser'
import { Player } from '../entities/Player'
import { NPC } from '../entities/NPC'
import { BUILT_IN_NPCS } from '../data/npcs'
import { EventBus } from '../EventBus'

export class Town extends Scene {
  private player!: Player
  private collisionLayer!: Phaser.Tilemaps.TilemapLayer
  private npcs: NPC[] = []
  private dialogueOpen = false
  private spaceKey!: Phaser.Input.Keyboard.Key
  private currentZone: string | null = null
  private zones: { zone: Phaser.GameObjects.Zone; zoneId: string; zoneName: string }[] = []

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

    // Parse zone objects from tilemap
    const objectLayer = map.getObjectLayer('Objects')
    if (objectLayer) {
      for (const obj of objectLayer.objects) {
        if (obj.type === 'zone') {
          const zoneId = obj.properties?.find((p: { name: string }) => p.name === 'zoneId')?.value as string
          const zoneName = obj.properties?.find((p: { name: string }) => p.name === 'zoneName')?.value as string
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
    EventBus.on('dialogue:closed', () => {
      this.dialogueOpen = false
    })

    // Camera
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.cameras.main.setBackgroundColor('#1a1a2e')
    this.cameras.main.setZoom(2)
  }

  update(): void {
    if (this.dialogueOpen) return

    this.player.update()

    // Check NPC proximity exit
    for (const npc of this.npcs) {
      if (npc.playerInRange) {
        const zoneBody = npc.interactionZone.body as Phaser.Physics.Arcade.StaticBody
        const playerBody = this.player.body as Phaser.Physics.Arcade.Body
        if (!Phaser.Geom.Intersects.RectangleToRectangle(playerBody, zoneBody)) {
          npc.playerInRange = false
          EventBus.emit('npc:proximity', { agentId: npc.agentDef.id, inRange: false })
        }
      }
    }

    // Space key interaction
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      const nearbyNpc = this.npcs.find((npc) => npc.playerInRange)
      if (nearbyNpc && !this.dialogueOpen) {
        this.dialogueOpen = true
        EventBus.emit('npc:interact', {
          agentId: nearbyNpc.agentDef.id,
          npcPosition: { x: nearbyNpc.x, y: nearbyNpc.y },
        })
      }
    }

    // Zone detection
    for (const { zone, zoneId, zoneName } of this.zones) {
      const zoneBody = zone.body as Phaser.Physics.Arcade.StaticBody
      const playerBody = this.player.body as Phaser.Physics.Arcade.Body
      if (Phaser.Geom.Intersects.RectangleToRectangle(playerBody, zoneBody)) {
        if (this.currentZone !== zoneId) {
          this.currentZone = zoneId
          EventBus.emit('zone:entered', { zoneId, zoneName })
        }
        return
      }
    }
    if (this.currentZone !== null) {
      this.currentZone = null
    }
  }
}

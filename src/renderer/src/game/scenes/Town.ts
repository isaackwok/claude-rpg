import { Scene } from 'phaser'
import { Player } from '../entities/Player'

export class Town extends Scene {
  private player!: Player
  private collisionLayer!: Phaser.Tilemaps.TilemapLayer

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
    const spawnX = 19 * 16 + 8 // tile 19, center of tile
    const spawnY = 14 * 16 + 8 // tile 14, center of tile
    this.player = new Player(this, spawnX, spawnY)

    // Collision
    this.physics.add.collider(this.player, this.collisionLayer)

    // Camera
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels)

    // Background color for areas outside the map
    this.cameras.main.setBackgroundColor('#1a1a2e')
  }

  update(): void {
    this.player.update()
  }
}

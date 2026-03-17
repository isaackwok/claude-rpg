import { Scene } from 'phaser'

export class Preloader extends Scene {
  constructor() {
    super('Preloader')
  }

  preload(): void {
    // Loading bar
    const width = this.cameras.main.width
    const height = this.cameras.main.height
    const barW = 320
    const barH = 20

    const progressBox = this.add.rectangle(width / 2, height / 2, barW, barH, 0x222222)
    const progressBar = this.add.rectangle(
      width / 2 - barW / 2 + 2,
      height / 2,
      0,
      barH - 4,
      0x4a8c3f
    )
    progressBar.setOrigin(0, 0.5)

    this.load.on('progress', (value: number) => {
      progressBar.width = (barW - 4) * value
    })

    this.load.on('complete', () => {
      progressBox.destroy()
      progressBar.destroy()
    })

    // Load assets
    this.load.tilemapTiledJSON('town-map', 'assets/tilemaps/town.json')
    this.load.image('town-tileset', 'assets/tilesets/town-tileset.png')
    this.load.spritesheet('player', 'assets/sprites/player.png', {
      frameWidth: 16,
      frameHeight: 16
    })
    this.load.spritesheet('npcs', 'assets/sprites/npcs.png', {
      frameWidth: 16,
      frameHeight: 16
    })
  }

  create(): void {
    this.scene.start('Town')
  }
}

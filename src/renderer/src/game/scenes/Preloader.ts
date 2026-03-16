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

    // Assets will be loaded here once they exist (Task 4)
  }

  create(): void {
    this.scene.start('Town')
  }
}

import { Scene } from 'phaser'

export class Town extends Scene {
  constructor() {
    super('Town')
  }

  create(): void {
    // Placeholder: colored background to confirm scene loads
    this.cameras.main.setBackgroundColor('#2d5a27')
  }

  update(): void {
    // Will be filled in Tasks 5-7
  }
}

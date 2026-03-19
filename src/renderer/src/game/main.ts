import Phaser from 'phaser'
import { Boot, Preloader, Town, Home } from './scenes'

export function StartGame(parent: string): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      parent
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 }
      }
    },
    scene: [Boot, Preloader, Town, Home]
  })

  // Expose for E2E testing
  ;(window as any).__PHASER_GAME__ = game

  return game
}

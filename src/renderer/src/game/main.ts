import Phaser from 'phaser'
import { Boot, Preloader, Town } from './scenes'

export function StartGame(parent: string): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: 1024,
    height: 768,
    parent,
    pixelArt: true,
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 }
      }
    },
    scene: [Boot, Preloader, Town]
  })

  // Expose for E2E testing
  ;(window as any).__PHASER_GAME__ = game

  return game
}

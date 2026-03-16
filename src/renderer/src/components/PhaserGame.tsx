import { forwardRef, useLayoutEffect, useRef } from 'react'
import Phaser from 'phaser'
import { StartGame } from '../game/main'
import { EventBus } from '../game/EventBus'

export interface PhaserGameRef {
  game: Phaser.Game | null
  scene: Phaser.Scene | null
}

export const PhaserGame = forwardRef<PhaserGameRef>(function PhaserGame(_props, ref) {
  const gameRef = useRef<Phaser.Game | null>(null)

  useLayoutEffect(() => {
    if (gameRef.current) return

    const game = StartGame('game-container')
    gameRef.current = game

    if (typeof ref === 'function') {
      ref({ game, scene: null })
    } else if (ref) {
      ref.current = { game, scene: null }
    }

    return () => {
      EventBus.removeAllListeners()
      game.destroy(true)
      gameRef.current = null
    }
  }, [ref])

  return <div id="game-container" style={{ width: 1024, height: 768 }} />
})

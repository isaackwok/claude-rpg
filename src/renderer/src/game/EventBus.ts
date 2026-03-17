import Phaser from 'phaser'
import type { GameEvents } from './types'

class TypedEventBus {
  private emitter = new Phaser.Events.EventEmitter()

  emit<K extends keyof GameEvents>(event: K, data: GameEvents[K]): void {
    this.emitter.emit(event, data)
  }

  on<K extends keyof GameEvents>(
    event: K,
    fn: (data: GameEvents[K]) => void,
    context?: unknown
  ): void {
    this.emitter.on(event, fn, context)
  }

  once<K extends keyof GameEvents>(
    event: K,
    fn: (data: GameEvents[K]) => void,
    context?: unknown
  ): void {
    this.emitter.once(event, fn, context)
  }

  off<K extends keyof GameEvents>(
    event: K,
    fn?: (data: GameEvents[K]) => void,
    context?: unknown
  ): void {
    this.emitter.off(event, fn, context)
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners()
  }
}

export const EventBus = new TypedEventBus()

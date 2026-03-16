import { useRef } from 'react'
import { PhaserGame, type PhaserGameRef } from './components/PhaserGame'

function App(): React.JSX.Element {
  const phaserRef = useRef<PhaserGameRef>(null)

  return (
    <div style={{ position: 'relative', width: 1024, height: 768, margin: '0 auto' }}>
      <PhaserGame ref={phaserRef} />
      {/* React UI overlay layer */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none'
        }}
      >
        {/* UI components (ProximityHint, DialoguePanel, HUD) will be added here */}
      </div>
    </div>
  )
}

export default App

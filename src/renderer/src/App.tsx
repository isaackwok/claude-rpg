import { useRef, useState } from 'react'
import { PhaserGame, type PhaserGameRef } from './components/PhaserGame'
import { ProximityHint } from './components/ui/ProximityHint'
import { DialoguePanel } from './components/ui/DialoguePanel'
import { HUD } from './components/ui/HUD'
import { ApiKeyModal } from './components/ui/ApiKeyModal'

function App(): React.JSX.Element {
  const phaserRef = useRef<PhaserGameRef>(null)
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
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
        <HUD />
        <ProximityHint />
        <DialoguePanel onRequestApiKey={() => setShowApiKeyModal(true)} />
        {showApiKeyModal && (
          <ApiKeyModal
            onClose={() => setShowApiKeyModal(false)}
            onSaved={() => setShowApiKeyModal(false)}
          />
        )}
      </div>
    </div>
  )
}

export default App

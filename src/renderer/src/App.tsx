import { useRef, useState, useEffect } from 'react'
import { PhaserGame, type PhaserGameRef } from './components/PhaserGame'
import { ProximityHint } from './components/ui/ProximityHint'
import { DialoguePanel } from './components/ui/DialoguePanel'
import { HUD } from './components/ui/HUD'
import { ApiKeyModal } from './components/ui/ApiKeyModal'
import { NoticeBoardPanel } from './components/ui/NoticeBoardPanel'
import { conversationManager } from './services/ConversationManager'
import { EventBus } from './game/EventBus'

function App(): React.JSX.Element {
  const phaserRef = useRef<PhaserGameRef>(null)
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [showNoticeBoard, setShowNoticeBoard] = useState(false)
  const [apiKeyVersion, setApiKeyVersion] = useState(0)

  // Wire IPC stream events to ConversationManager
  useEffect(() => {
    const cleanupChunk = window.api.onStreamChunk(({ agentId, chunk }) => {
      conversationManager.appendStreamChunk(agentId, chunk)
    })
    const cleanupEnd = window.api.onStreamEnd(({ agentId }) => {
      conversationManager.finalizeStream(agentId)
    })
    const cleanupError = window.api.onStreamError(({ agentId, error }) => {
      conversationManager.markStreamError(agentId, error)
    })

    // Tool IPC listeners
    const cleanupToolConfirm = window.api.onToolConfirm((data) => {
      conversationManager.markToolConfirm(
        data.agentId,
        data.toolName,
        data.toolCallId,
        data.args,
        data.folderApproved
      )
    })
    const cleanupToolExecuting = window.api.onToolExecuting((data) => {
      conversationManager.markToolExecuting(data.agentId, data.toolName)
    })
    const cleanupPathApproval = window.api.onPathApproval((data) => {
      conversationManager.markPathApproval(data.agentId, data.paths)
    })

    return () => {
      cleanupChunk()
      cleanupEnd()
      cleanupError()
      cleanupToolConfirm()
      cleanupToolExecuting()
      cleanupPathApproval()
    }
  }, [])

  // Notice Board interaction from Phaser
  useEffect(() => {
    const handler = () => setShowNoticeBoard(true)
    EventBus.on('noticeboard:interact', handler)
    return () => {
      EventBus.off('noticeboard:interact', handler)
    }
  }, [])

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
        <DialoguePanel
          onRequestApiKey={() => setShowApiKeyModal(true)}
          apiKeyVersion={apiKeyVersion}
        />
        {showNoticeBoard && <NoticeBoardPanel onClose={() => setShowNoticeBoard(false)} />}
        {showApiKeyModal && (
          <ApiKeyModal
            onClose={() => setShowApiKeyModal(false)}
            onSaved={() => {
              setShowApiKeyModal(false)
              setApiKeyVersion((v) => v + 1)
            }}
          />
        )}
      </div>
    </div>
  )
}

export default App

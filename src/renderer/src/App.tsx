import { useRef, useState, useEffect, useCallback } from 'react'
import { PhaserGame, type PhaserGameRef } from './components/PhaserGame'
import { ProximityHint } from './components/ui/ProximityHint'
import { DialoguePanel } from './components/ui/DialoguePanel'
import { HUD } from './components/ui/HUD'
import { ApiKeyModal } from './components/ui/ApiKeyModal'
import { NoticeBoardPanel } from './components/ui/NoticeBoardPanel'
import { SkillsPanel } from './components/ui/SkillsPanel'
import { LevelUpBanner } from './components/ui/LevelUpBanner'
import { BackpackPanel } from './components/ui/BackpackPanel'
import { BackpackButton } from './components/ui/BackpackButton'
import { QuestNotification } from './components/ui/QuestNotification'
import { AchievementNotification } from './components/ui/AchievementNotification'
import { QuestBoardPanel } from './components/ui/QuestBoardPanel'
import { HomeHUD } from './components/ui/HomeHUD'
import { conversationManager } from './services/ConversationManager'
import { EventBus } from './game/EventBus'
import type { AgentId } from '../../shared/types'

function App(): React.JSX.Element {
  const phaserRef = useRef<PhaserGameRef>(null)
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [showNoticeBoard, setShowNoticeBoard] = useState(false)
  const [showSkillsPanel, setShowSkillsPanel] = useState(false)
  const [showBackpack, setShowBackpack] = useState(false)
  const [showQuestBoard, setShowQuestBoard] = useState(false)
  const [levelUpBanner, setLevelUpBanner] = useState<number | null>(null)
  const [apiKeyVersion, setApiKeyVersion] = useState(0)
  const hydratedAgents = useRef(new Set<string>())

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

  // Level-up banner listener
  useEffect(() => {
    const cleanup = window.api.onXPAwarded((result) => {
      if (result.overallLevelUp) {
        setLevelUpBanner(result.overallLevelUp.newLevel)
      }
    })
    return cleanup
  }, [])

  // Notice Board interaction from Phaser
  useEffect(() => {
    const handler = () => setShowNoticeBoard(true)
    EventBus.on('noticeboard:interact', handler)
    return () => {
      EventBus.off('noticeboard:interact', handler)
    }
  }, [])

  // SkillsPanel toggle from EventBus
  useEffect(() => {
    const handler = () => setShowSkillsPanel((v) => !v)
    EventBus.on('skills-panel:toggle', handler)
    return () => {
      EventBus.off('skills-panel:toggle', handler)
    }
  }, [])

  // Backpack toggle from EventBus
  useEffect(() => {
    const handler = () => setShowBackpack((v) => !v)
    EventBus.on('backpack:toggle', handler)
    return () => {
      EventBus.off('backpack:toggle', handler)
    }
  }, [])

  // Keyboard shortcuts for panels
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if focus is on an input/textarea
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.code === 'KeyP') {
        setShowSkillsPanel((v) => !v)
      }
      if (e.code === 'KeyB') {
        setShowBackpack((v) => !v)
      }
      if (e.code === 'KeyQ') {
        setShowQuestBoard((v) => !v)
      }
      if (e.code === 'Escape') {
        if (showSkillsPanel) setShowSkillsPanel(false)
        if (showBackpack) setShowBackpack(false)
        if (showQuestBoard) setShowQuestBoard(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showSkillsPanel, showBackpack, showQuestBoard])

  // Hydrate conversation history from SQLite on first dialogue open
  const hydrateConversation = useCallback(async (agentId: AgentId) => {
    if (hydratedAgents.current.has(agentId)) return

    try {
      const messages = await window.api.getConversationHistory(agentId)
      // Mark as hydrated only after successful fetch
      hydratedAgents.current.add(agentId)
      if (messages.length > 0) {
        conversationManager.hydrateFromPersistence(
          agentId,
          messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: m.timestamp
          }))
        )
      }
    } catch (err) {
      console.error(`[App] Failed to hydrate conversation for ${agentId}:`, err)
      // Don't mark as hydrated — allow retry on next interaction
    }
  }, [])

  useEffect(() => {
    const handler = (data: { agentId: AgentId }) => {
      hydrateConversation(data.agentId)
    }
    EventBus.on('npc:interact', handler)
    return () => {
      EventBus.off('npc:interact', handler)
    }
  }, [hydrateConversation])

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
        <BackpackButton />
        <ProximityHint />
        <DialoguePanel
          onRequestApiKey={() => setShowApiKeyModal(true)}
          apiKeyVersion={apiKeyVersion}
        />
        <QuestNotification />
        <AchievementNotification />
        <HomeHUD />
        {showNoticeBoard && <NoticeBoardPanel onClose={() => setShowNoticeBoard(false)} />}
        {showSkillsPanel && <SkillsPanel onClose={() => setShowSkillsPanel(false)} />}
        {showBackpack && <BackpackPanel onClose={() => setShowBackpack(false)} />}
        {showQuestBoard && <QuestBoardPanel onClose={() => setShowQuestBoard(false)} />}
        {levelUpBanner !== null && (
          <LevelUpBanner level={levelUpBanner} onDone={() => setLevelUpBanner(null)} />
        )}
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

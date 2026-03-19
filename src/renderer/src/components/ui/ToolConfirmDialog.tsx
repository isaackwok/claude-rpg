import { useTranslation } from '../../i18n'
import { dirname } from '../../utils/path'

interface ToolConfirmDialogProps {
  agentId: string
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  folderApproved: boolean
}

const TOOL_ICONS: Record<string, string> = {
  read_file: '📖',
  write_file: '✏️',
  edit_file: '🔧',
  list_files: '📁',
  run_command: '⚡',
  web_search: '🔍'
}

export function ToolConfirmDialog({
  agentId,
  toolCallId,
  toolName,
  args,
  folderApproved
}: ToolConfirmDialogProps) {
  const { t } = useTranslation()

  const targetPath =
    toolName === 'run_command'
      ? (args.cwd as string | undefined)
      : (args.path as string | undefined)

  const handleApprove = () => {
    window.api.approveToolCall(agentId, toolCallId)
  }

  const handlePostScroll = () => {
    // Add the target directory to approved folders, then approve.
    // For file-oriented tools (read/write/edit), approve the parent directory.
    // For directory-oriented tools (list_files) or run_command cwd, approve the path itself.
    if (targetPath) {
      const isDirectoryTool = toolName === 'list_files' || toolName === 'run_command'
      const folderToApprove = isDirectoryTool ? targetPath : dirname(targetPath)
      window.api.approveToolCall(agentId, toolCallId, folderToApprove)
    } else {
      window.api.approveToolCall(agentId, toolCallId)
    }
  }

  const handleAllowOnce = () => {
    window.api.approveToolCall(agentId, toolCallId)
  }

  const handleDeny = () => {
    window.api.denyToolCall(agentId, toolCallId)
  }

  return (
    <div
      style={{
        margin: '8px 0',
        padding: '10px 12px',
        background: 'rgba(200, 180, 140, 0.1)',
        border: '1px solid rgba(200, 180, 140, 0.3)',
        borderRadius: 4
      }}
    >
      {/* Tool name + icon */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 'bold',
          color: '#c4a46c',
          marginBottom: 6
        }}
      >
        {TOOL_ICONS[toolName] || '🔧'} {t(`tool.name.${toolName}`)}
      </div>

      {/* Tool arguments */}
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>
        {toolName === 'run_command' ? (
          <>
            <div>
              {t('tool.command')}: <code style={codeStyle}>{String(args.command)}</code>
            </div>
            {args.cwd && (
              <div>
                {t('tool.cwd')}: <code style={codeStyle}>{String(args.cwd)}</code>
              </div>
            )}
          </>
        ) : toolName === 'edit_file' ? (
          <>
            <div>
              {t('tool.path')}: <code style={codeStyle}>{String(args.path)}</code>
            </div>
            <div style={{ marginTop: 2, opacity: 0.6 }}>
              {t('tool.editDesc', {
                oldLen: `${String(args.old_text).length}`,
                newLen: `${String(args.new_text).length}`
              })}
            </div>
          </>
        ) : (
          targetPath && (
            <div>
              {t('tool.path')}: <code style={codeStyle}>{targetPath}</code>
            </div>
          )
        )}
      </div>

      {/* Warning for unapproved paths */}
      {!folderApproved && (
        <div
          style={{
            fontSize: 12,
            color: '#ffaa44',
            marginBottom: 8,
            padding: '4px 6px',
            background: 'rgba(255, 170, 68, 0.1)',
            borderRadius: 3
          }}
        >
          ⚠ {t('tool.outsideApproved')}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        {folderApproved ? (
          <>
            <ToolButton onClick={handleApprove} primary>
              {t('tool.approve')}
            </ToolButton>
            <ToolButton onClick={handleDeny}>{t('tool.deny')}</ToolButton>
          </>
        ) : (
          <>
            <ToolButton onClick={handlePostScroll} primary>
              {t('tool.postScroll')}
            </ToolButton>
            <ToolButton onClick={handleAllowOnce}>{t('tool.allowOnce')}</ToolButton>
            <ToolButton onClick={handleDeny}>{t('tool.deny')}</ToolButton>
          </>
        )}
      </div>
    </div>
  )
}

function ToolButton({
  onClick,
  primary,
  children
}: {
  onClick: () => void
  primary?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px',
        fontFamily: 'monospace',
        fontSize: 12,
        background: primary ? 'rgba(200,180,140,0.3)' : 'rgba(100,100,100,0.3)',
        border: `1px solid ${primary ? 'rgba(200,180,140,0.6)' : 'rgba(150,150,150,0.4)'}`,
        color: primary ? '#c4a46c' : 'rgba(255,255,255,0.7)',
        cursor: 'pointer',
        borderRadius: 3
      }}
    >
      {children}
    </button>
  )
}

const codeStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  padding: '1px 4px',
  borderRadius: 3,
  fontSize: 11,
  wordBreak: 'break-all'
}

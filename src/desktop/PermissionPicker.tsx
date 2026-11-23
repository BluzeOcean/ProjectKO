import type { PermissionMode } from './types'
import { Icon } from './Icons'

/**
 * What the DeepSeek Harness may touch, in the chat's own composer.
 *
 * The harness ships three presets and the desktop app offers the same three, so
 * they are named the same way here: read, write inside the folder, or write
 * anywhere. The choice is the chat's, not the app's: two chats can run in
 * different modes, and changing it changes the running session.
 */

const permissionChoices: { id: PermissionMode; label: string; hint: string }[] = [
  { id: 'read-only', label: 'Read Only', hint: 'Reads files and runs nothing that writes' },
  { id: 'workspace-write', label: 'Workspace Write', hint: 'Writes inside the workspace; wider work asks first' },
  { id: 'danger-full-access', label: 'Full access', hint: 'No sandbox and no approval prompts' },
]

const label = (id: PermissionMode) => permissionChoices.find(item => item.id === id)?.label || 'Workspace Write'
const hint = (id: PermissionMode) => permissionChoices.find(item => item.id === id)?.hint || ''

export default function PermissionPicker({ value, disabled, onChange }: { value: PermissionMode; disabled?: boolean; onChange: (mode: PermissionMode) => void }) {
  return <label className="conversation-permission" data-mode={value} title={`Permissions: ${label(value)} · ${hint(value)}`}>
    <Icon name="shield" size={12} />
    <select aria-label="Permission mode" value={value} disabled={disabled} onChange={event => onChange(event.target.value as PermissionMode)}>
      {permissionChoices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
  </label>
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Building2, ChevronRight, ChevronDown, Users, X, Check, Loader2 } from 'lucide-react'

// Types
export interface OrganizationNode {
  id: number
  code?: string
  name: string
  member_count: number
  level: number
  children: OrganizationNode[]
}

export interface OrganizationMember {
  id: number
  email: string
  display_name?: string
  job_title?: string
  department?: string
}

interface OrganizationPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (emails: string[], orgName: string, memberCount: number) => void
  targetField: 'To' | 'Cc' | 'Bcc'
}

export function OrganizationPicker({
  isOpen,
  onClose,
  onSelect,
  targetField,
}: OrganizationPickerProps) {
  const [tree, setTree] = useState<OrganizationNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [selectedOrg, setSelectedOrg] = useState<OrganizationNode | null>(null)
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [includeChildren, setIncludeChildren] = useState(true)

  // Fetch organization tree
  useEffect(() => {
    if (!isOpen) return

    const fetchTree = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/organizations/tree', {
          credentials: 'include',
        })
        if (!res.ok) throw new Error('Failed to fetch organizations')
        const data = await res.json()
        setTree(data)
        // Auto-expand first level
        if (data.length > 0) {
          setExpandedIds(new Set(data.map((n: OrganizationNode) => n.id)))
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'エラーが発生しました')
      } finally {
        setLoading(false)
      }
    }

    fetchTree()
  }, [isOpen])

  // Fetch members when org is selected
  useEffect(() => {
    if (!selectedOrg) {
      setMembers([])
      return
    }

    const fetchMembers = async () => {
      setLoadingMembers(true)
      try {
        const params = new URLSearchParams({
          include_children: includeChildren.toString(),
          page_size: '100',
        })
        const res = await fetch(`/api/organizations/${selectedOrg.id}/members?${params}`, {
          credentials: 'include',
        })
        if (!res.ok) throw new Error('Failed to fetch members')
        const data = await res.json()
        setMembers(data.members)
      } catch (e) {
        console.error('Failed to fetch members:', e)
        setMembers([])
      } finally {
        setLoadingMembers(false)
      }
    }

    fetchMembers()
  }, [selectedOrg, includeChildren])

  const toggleExpand = useCallback((id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleSelectOrg = useCallback((org: OrganizationNode) => {
    setSelectedOrg(org)
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!selectedOrg) return

    try {
      const params = new URLSearchParams({
        include_children: includeChildren.toString(),
      })
      const res = await fetch(`/api/organizations/${selectedOrg.id}/emails?${params}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to fetch emails')
      const emails: string[] = await res.json()
      onSelect(emails, selectedOrg.name, emails.length)
      onClose()
    } catch (e) {
      console.error('Failed to get emails:', e)
    }
  }, [selectedOrg, includeChildren, onSelect, onClose])

  // Recursive tree node renderer
  const renderNode = (node: OrganizationNode, depth: number = 0) => {
    const isExpanded = expandedIds.has(node.id)
    const isSelected = selectedOrg?.id === node.id
    const hasChildren = node.children && node.children.length > 0

    return (
      <div key={node.id}>
        <button
          onClick={() => handleSelectOrg(node)}
          className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
            isSelected
              ? 'bg-blue-500/20 border border-blue-400/30'
              : 'hover:bg-white/5'
          }`}
          style={{ paddingLeft: `${12 + depth * 20}px` }}
        >
          {/* Expand/Collapse Toggle */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleExpand(node.id)
              }}
              className="text-slate-400 hover:text-white transition-colors p-0.5"
            >
              {isExpanded ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}

          {/* Icon */}
          <Building2 size={16} className="text-slate-400" />

          {/* Name */}
          <span className={`flex-1 truncate ${isSelected ? 'text-blue-300' : 'text-white'}`}>
            {node.name}
          </span>

          {/* Member count */}
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Users size={12} />
            {node.member_count}名
          </span>

          {/* Selection indicator */}
          {isSelected && (
            <Check size={16} className="text-blue-400" />
          )}
        </button>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-[800px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Building2 className="text-blue-400" size={24} />
            <div>
              <h2 className="text-lg font-semibold text-white">組織から宛先を選択</h2>
              <p className="text-xs text-slate-400">{targetField}に追加</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-2"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 min-h-0">
          {/* Organization Tree */}
          <div className="w-1/2 border-r border-white/10 overflow-y-auto p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-3">組織ツリー</h3>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-blue-400" size={24} />
              </div>
            ) : error ? (
              <div className="text-center py-12 text-red-400">
                <p>{error}</p>
              </div>
            ) : tree.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Building2 size={48} className="mx-auto mb-3 opacity-30" />
                <p>組織が登録されていません</p>
              </div>
            ) : (
              <div className="space-y-1">
                {tree.map(node => renderNode(node))}
              </div>
            )}
          </div>

          {/* Members Preview */}
          <div className="w-1/2 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-300">
                {selectedOrg ? `${selectedOrg.name} のメンバー` : 'メンバープレビュー'}
              </h3>
              {selectedOrg && (
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeChildren}
                    onChange={(e) => setIncludeChildren(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/20"
                  />
                  下位組織を含める
                </label>
              )}
            </div>

            {!selectedOrg ? (
              <div className="text-center py-12 text-slate-500">
                <Users size={48} className="mx-auto mb-3 opacity-30" />
                <p>左側から組織を選択してください</p>
              </div>
            ) : loadingMembers ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-blue-400" size={24} />
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Users size={48} className="mx-auto mb-3 opacity-30" />
                <p>メンバーがいません</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {members.slice(0, 50).map(m => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-300">
                      {(m.display_name || m.email)[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">
                        {m.display_name || m.email}
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        {m.email}
                        {m.department && ` | ${m.department}`}
                      </div>
                    </div>
                  </div>
                ))}
                {members.length > 50 && (
                  <div className="text-center py-2 text-xs text-slate-500">
                    他 {members.length - 50} 名
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-slate-900/50">
          <div className="text-sm text-slate-400">
            {selectedOrg && (
              <>
                選択中: <span className="text-white">{selectedOrg.name}</span>
                （{members.length}名）
              </>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedOrg || members.length === 0}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Users size={16} />
              {targetField}に追加
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

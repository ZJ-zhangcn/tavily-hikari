import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  archiveAnnouncement,
  createAnnouncement,
  fetchAnnouncements,
  publishAnnouncement,
  updateAnnouncement,
  type Announcement,
  type AnnouncementDisplayKind,
  type AnnouncementMutationPayload,
  type AnnouncementStatus,
} from '../api'
import AdminLoadingRegion from '../components/AdminLoadingRegion'
import { StatusBadge, type StatusTone } from '../components/StatusBadge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Textarea } from '../components/ui/textarea'
import { Icon } from '../lib/icons'
import type { Language } from '../i18n'

interface AnnouncementsModuleProps {
  language: Language
  refreshToken?: number
}

interface AnnouncementDraft {
  title: string
  body: string
  displayKind: AnnouncementDisplayKind
}

const EMPTY_DRAFT: AnnouncementDraft = {
  title: '',
  body: '',
  displayKind: 'modal',
}

function copy(language: Language) {
  return language === 'zh'
    ? {
        title: '公告',
        description: '发布用户控制台公告。弹窗用于强提醒，滚动公告用于低打扰提示。',
        refresh: '刷新',
        refreshing: '刷新中…',
        loading: '正在加载公告…',
        error: '公告加载失败。',
        empty: '还没有公告。先创建一条草稿。',
        formTitleNew: '新建公告',
        formTitleEdit: '编辑公告',
        formDescription: '已发布公告保存后会归档旧公告，并生成新公告 ID 重新提醒用户。',
        titleLabel: '标题',
        titlePlaceholder: '例如：维护窗口通知',
        bodyLabel: '正文',
        bodyPlaceholder: '写给用户看的公告内容。',
        displayLabel: '展示方式',
        modal: '弹窗',
        ticker: '滚动',
        saveDraft: '保存草稿',
        saveChanges: '保存修改',
        saving: '保存中…',
        cancel: '取消',
        status: {
          draft: '草稿',
          published: '发布中',
          archived: '已归档',
        },
        table: {
          announcement: '公告',
          display: '展示',
          status: '状态',
          updated: '更新时间',
          actions: '操作',
        },
        actions: {
          edit: '编辑',
          publish: '发布',
          archive: '归档',
        },
        actionBusy: '处理中…',
        validation: '标题和正文不能为空。',
        saved: '公告已保存。',
        published: '公告已发布。',
        archived: '公告已归档。',
      }
    : {
        title: 'Announcements',
        description: 'Publish user-console notices. Modal announcements are high-attention, tickers are lower-interruption.',
        refresh: 'Refresh',
        refreshing: 'Refreshing…',
        loading: 'Loading announcements…',
        error: 'Failed to load announcements.',
        empty: 'No announcements yet. Create a draft to start.',
        formTitleNew: 'New announcement',
        formTitleEdit: 'Edit announcement',
        formDescription: 'Saving a published announcement archives the old item and creates a new ID so users are reminded again.',
        titleLabel: 'Title',
        titlePlaceholder: 'For example: maintenance window',
        bodyLabel: 'Body',
        bodyPlaceholder: 'Write the user-facing announcement body.',
        displayLabel: 'Display',
        modal: 'Modal',
        ticker: 'Ticker',
        saveDraft: 'Save draft',
        saveChanges: 'Save changes',
        saving: 'Saving…',
        cancel: 'Cancel',
        status: {
          draft: 'Draft',
          published: 'Published',
          archived: 'Archived',
        },
        table: {
          announcement: 'Announcement',
          display: 'Display',
          status: 'Status',
          updated: 'Updated',
          actions: 'Actions',
        },
        actions: {
          edit: 'Edit',
          publish: 'Publish',
          archive: 'Archive',
        },
        actionBusy: 'Working…',
        validation: 'Title and body are required.',
        saved: 'Announcement saved.',
        published: 'Announcement published.',
        archived: 'Announcement archived.',
      }
}

function statusTone(status: AnnouncementStatus): StatusTone {
  switch (status) {
    case 'published':
      return 'success'
    case 'draft':
      return 'info'
    case 'archived':
      return 'neutral'
    default:
      return 'neutral'
  }
}

function displayLabel(displayKind: AnnouncementDisplayKind, strings: ReturnType<typeof copy>): string {
  return displayKind === 'ticker' ? strings.ticker : strings.modal
}

function formatTimestamp(value: number | null, language: Language): string {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value * 1000))
  } catch {
    return '-'
  }
}

function toDraft(item: Announcement): AnnouncementDraft {
  return {
    title: item.title,
    body: item.body,
    displayKind: item.displayKind,
  }
}

function toPayload(draft: AnnouncementDraft): AnnouncementMutationPayload {
  return {
    title: draft.title.trim(),
    body: draft.body.trim(),
    displayKind: draft.displayKind,
  }
}

export default function AnnouncementsModule({
  language,
  refreshToken = 0,
}: AnnouncementsModuleProps): JSX.Element {
  const strings = useMemo(() => copy(language), [language])
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [draft, setDraft] = useState<AnnouncementDraft>(EMPTY_DRAFT)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal, mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') {
      setLoading(true)
    } else {
      setRefreshing(true)
    }
    setError(null)
    try {
      const response = await fetchAnnouncements(signal)
      setItems(response.items)
    } catch (err) {
      if (signal?.aborted) return
      setError(err instanceof Error ? err.message : strings.error)
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [strings.error])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal, 'initial')
    return () => controller.abort()
  }, [load, refreshToken])

  const startEdit = (item: Announcement) => {
    setEditingId(item.id)
    setDraft(toDraft(item))
    setMessage(null)
    setError(null)
  }

  const resetDraft = () => {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
  }

  const submit = async () => {
    const payload = toPayload(draft)
    if (!payload.title || !payload.body) {
      setError(strings.validation)
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        await updateAnnouncement(editingId, payload)
      } else {
        await createAnnouncement(payload)
      }
      resetDraft()
      setMessage(strings.saved)
      await load(undefined, 'refresh')
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.error)
    } finally {
      setSaving(false)
    }
  }

  const act = async (id: string, action: 'publish' | 'archive') => {
    setBusyId(id)
    setError(null)
    try {
      if (action === 'publish') {
        await publishAnnouncement(id)
        setMessage(strings.published)
      } else {
        await archiveAnnouncement(id)
        setMessage(strings.archived)
      }
      await load(undefined, 'refresh')
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.error)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="surface panel announcements-module">
      <div className="panel-header announcements-module-header">
        <div>
          <h2>{strings.title}</h2>
          <p className="panel-description">{strings.description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load(undefined, 'refresh')}
          disabled={loading || refreshing}
        >
          <Icon
            icon={refreshing ? 'mdi:loading' : 'mdi:refresh'}
            width={16}
            height={16}
            className={refreshing ? 'icon-spin' : undefined}
            aria-hidden="true"
          />
          <span>{refreshing ? strings.refreshing : strings.refresh}</span>
        </Button>
      </div>

      <div className="announcements-layout">
        <form
          className="announcements-editor"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <div className="announcements-editor-header">
            <div>
              <h3>{editingId ? strings.formTitleEdit : strings.formTitleNew}</h3>
              <p>{strings.formDescription}</p>
            </div>
          </div>
          <label className="announcements-field">
            <span>{strings.titleLabel}</span>
            <Input
              value={draft.title}
              placeholder={strings.titlePlaceholder}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              maxLength={120}
            />
          </label>
          <label className="announcements-field">
            <span>{strings.bodyLabel}</span>
            <Textarea
              value={draft.body}
              placeholder={strings.bodyPlaceholder}
              rows={7}
              maxLength={4000}
              onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
            />
          </label>
          <label className="announcements-field">
            <span>{strings.displayLabel}</span>
            <Select
              value={draft.displayKind}
              onValueChange={(value) => {
                setDraft((current) => ({
                  ...current,
                  displayKind: value === 'ticker' ? 'ticker' : 'modal',
                }))
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="modal">{strings.modal}</SelectItem>
                <SelectItem value="ticker">{strings.ticker}</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="announcements-editor-actions">
            {editingId ? (
              <Button type="button" variant="outline" onClick={resetDraft} disabled={saving}>
                {strings.cancel}
              </Button>
            ) : null}
            <Button type="submit" disabled={saving}>
              {saving ? strings.saving : editingId ? strings.saveChanges : strings.saveDraft}
            </Button>
          </div>
        </form>

        <div className="announcements-list">
          {message ? <div className="announcements-message">{message}</div> : null}
          {error ? <div className="announcements-error">{error}</div> : null}
          <AdminLoadingRegion
            loadState={loading ? 'initial_loading' : error ? 'error' : 'ready'}
            loadingLabel={strings.loading}
            errorLabel={error ?? strings.error}
            minHeight={260}
          >
            {items.length === 0 ? (
              <div className="empty-state alert">{strings.empty}</div>
            ) : (
              <>
                <div className="table-wrapper announcements-table-wrapper admin-responsive-up">
                  <table className="jobs-table announcements-table">
                    <thead>
                      <tr>
                        <th>{strings.table.announcement}</th>
                        <th>{strings.table.display}</th>
                        <th>{strings.table.status}</th>
                        <th>{strings.table.updated}</th>
                        <th>{strings.table.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div className="announcements-title-cell">
                              <strong>{item.title}</strong>
                              <span>{item.body}</span>
                            </div>
                          </td>
                          <td>{displayLabel(item.displayKind, strings)}</td>
                          <td>
                            <StatusBadge tone={statusTone(item.status)}>
                              {strings.status[item.status]}
                            </StatusBadge>
                          </td>
                          <td>{formatTimestamp(item.updatedAt, language)}</td>
                          <td>
                            <div className="table-actions announcements-actions">
                              <Button type="button" variant="outline" size="xs" onClick={() => startEdit(item)}>
                                {strings.actions.edit}
                              </Button>
                              {item.status !== 'published' ? (
                                <Button
                                  type="button"
                                  size="xs"
                                  onClick={() => void act(item.id, 'publish')}
                                  disabled={busyId === item.id}
                                >
                                  {busyId === item.id ? strings.actionBusy : strings.actions.publish}
                                </Button>
                              ) : null}
                              {item.status !== 'archived' ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  onClick={() => void act(item.id, 'archive')}
                                  disabled={busyId === item.id}
                                >
                                  {busyId === item.id ? strings.actionBusy : strings.actions.archive}
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="admin-mobile-list admin-responsive-down">
                  {items.map((item) => (
                    <article key={item.id} className="admin-mobile-card announcements-mobile-card">
                      <header className="announcements-mobile-header">
                        <strong>{item.title}</strong>
                        <StatusBadge tone={statusTone(item.status)}>
                          {strings.status[item.status]}
                        </StatusBadge>
                      </header>
                      <p>{item.body}</p>
                      <div className="admin-mobile-kv">
                        <span>{strings.table.display}</span>
                        <strong>{displayLabel(item.displayKind, strings)}</strong>
                      </div>
                      <div className="admin-mobile-kv">
                        <span>{strings.table.updated}</span>
                        <strong>{formatTimestamp(item.updatedAt, language)}</strong>
                      </div>
                      <div className="table-actions announcements-mobile-actions">
                        <Button type="button" variant="outline" size="xs" onClick={() => startEdit(item)}>
                          {strings.actions.edit}
                        </Button>
                        {item.status !== 'published' ? (
                          <Button
                            type="button"
                            size="xs"
                            onClick={() => void act(item.id, 'publish')}
                            disabled={busyId === item.id}
                          >
                            {busyId === item.id ? strings.actionBusy : strings.actions.publish}
                          </Button>
                        ) : null}
                        {item.status !== 'archived' ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => void act(item.id, 'archive')}
                            disabled={busyId === item.id}
                          >
                            {busyId === item.id ? strings.actionBusy : strings.actions.archive}
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </AdminLoadingRegion>
        </div>
      </div>
    </section>
  )
}

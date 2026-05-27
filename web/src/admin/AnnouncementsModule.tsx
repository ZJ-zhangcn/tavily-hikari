import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'

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
import MarkdownContent from '../components/MarkdownContent'
import { StatusBadge, type StatusTone } from '../components/StatusBadge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Icon } from '../lib/icons'
import type { Language } from '../i18n'

interface AnnouncementsModuleProps {
  language: Language
  refreshToken?: number
  initialMode?: 'list' | 'create'
}

interface AnnouncementDraft {
  title: string
  body: string
  displayKind: AnnouncementDisplayKind
}

type AnnouncementEditorMode =
  | { kind: 'create' }
  | { kind: 'edit'; id: string }

type AnnouncementCopy = ReturnType<typeof copy>

const EMPTY_DRAFT: AnnouncementDraft = {
  title: '',
  body: '',
  displayKind: 'modal',
}

const MarkdownEditor = lazy(() => import('../components/MarkdownEditor'))

function copy(language: Language) {
  return language === 'zh'
    ? {
        title: '公告',
        description: '发布用户控制台公告。弹窗用于强提醒，滚动公告用于低打扰提示。',
        refresh: '刷新',
        refreshing: '刷新中…',
        loading: '正在加载公告…',
        error: '公告加载失败。',
        empty: '还没有公告。',
        newAnnouncement: '新建公告',
        listTitle: '公告列表',
        listDescription: '查看公告状态，并对已有公告执行发布、归档或编辑。',
        backToList: '返回列表',
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
        empty: 'No announcements yet.',
        newAnnouncement: 'New announcement',
        listTitle: 'Announcement list',
        listDescription: 'Review announcement status, then publish, archive, or edit existing items.',
        backToList: 'Back to list',
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

function displayLabel(displayKind: AnnouncementDisplayKind, strings: AnnouncementCopy): string {
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

function AnnouncementEditorPanel({
  mode,
  draft,
  saving,
  strings,
  onBack,
  onChangeDraft,
  onSubmit,
}: {
  mode: AnnouncementEditorMode
  draft: AnnouncementDraft
  saving: boolean
  strings: AnnouncementCopy
  onBack: () => void
  onChangeDraft: (draft: AnnouncementDraft) => void
  onSubmit: () => void
}): JSX.Element {
  return (
    <form
      className="announcements-editor"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="announcements-editor-header">
        <div>
          <h3>{mode.kind === 'edit' ? strings.formTitleEdit : strings.formTitleNew}</h3>
          <p>{strings.formDescription}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onBack} disabled={saving}>
          <Icon icon="mdi:arrow-left" width={16} height={16} aria-hidden="true" />
          <span>{strings.backToList}</span>
        </Button>
      </div>
      <label className="announcements-field">
        <span>{strings.titleLabel}</span>
        <Input
          value={draft.title}
          placeholder={strings.titlePlaceholder}
          onChange={(event) => onChangeDraft({ ...draft, title: event.target.value })}
          maxLength={120}
        />
      </label>
      <div className="announcements-field">
        <span id="announcement-body-editor-label">{strings.bodyLabel}</span>
        <LazyMarkdownEditor
          ariaLabelledBy="announcement-body-editor-label"
          value={draft.body}
          placeholder={strings.bodyPlaceholder}
          disabled={saving}
          onChange={(body) => onChangeDraft({ ...draft, body })}
          fallback={(
            <TextareaFallback
              ariaLabelledBy="announcement-body-editor-label"
              value={draft.body}
              placeholder={strings.bodyPlaceholder}
              disabled={saving}
              onChange={(body) => onChangeDraft({ ...draft, body })}
            />
          )}
        />
      </div>
      <label className="announcements-field">
        <span>{strings.displayLabel}</span>
        <Select
          value={draft.displayKind}
          onValueChange={(value) => {
            onChangeDraft({
              ...draft,
              displayKind: value === 'ticker' ? 'ticker' : 'modal',
            })
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
        <Button type="button" variant="outline" onClick={onBack} disabled={saving}>
          {strings.cancel}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? strings.saving : mode.kind === 'edit' ? strings.saveChanges : strings.saveDraft}
        </Button>
      </div>
    </form>
  )
}

function TextareaFallback({
  value,
  placeholder,
  ariaLabelledBy,
  disabled,
  onChange,
}: {
  value: string
  placeholder: string
  ariaLabelledBy: string
  disabled: boolean
  onChange: (value: string) => void
}): JSX.Element {
  return (
    <textarea
      className="textarea announcements-body-fallback"
      value={value}
      aria-labelledby={ariaLabelledBy}
      placeholder={placeholder}
      rows={7}
      maxLength={4000}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

interface LazyMarkdownEditorProps {
  value: string
  placeholder: string
  ariaLabelledBy: string
  disabled: boolean
  onChange: (value: string) => void
  fallback: JSX.Element
}

function LazyMarkdownEditor({
  fallback,
  ...editorProps
}: LazyMarkdownEditorProps): JSX.Element {
  return (
    <Suspense fallback={fallback}>
      <MarkdownEditor {...editorProps} />
    </Suspense>
  )
}

function AnnouncementsListPanel({
  items,
  loading,
  error,
  busyId,
  strings,
  language,
  onCreate,
  onEdit,
  onAct,
}: {
  items: Announcement[]
  loading: boolean
  error: string | null
  busyId: string | null
  strings: AnnouncementCopy
  language: Language
  onCreate: () => void
  onEdit: (item: Announcement) => void
  onAct: (id: string, action: 'publish' | 'archive') => void
}): JSX.Element {
  return (
    <div className="announcements-list">
      <div className="announcements-list-header">
        <div>
          <h3>{strings.listTitle}</h3>
          <p>{strings.listDescription}</p>
        </div>
        <Button type="button" size="sm" onClick={onCreate}>
          <Icon icon="mdi:plus" width={16} height={16} aria-hidden="true" />
          <span>{strings.newAnnouncement}</span>
        </Button>
      </div>
      <AdminLoadingRegion
        loadState={loading ? 'initial_loading' : error ? 'error' : 'ready'}
        loadingLabel={strings.loading}
        errorLabel={error ?? strings.error}
        minHeight={260}
      >
        {items.length === 0 ? (
          <div className="empty-state alert announcements-empty-state">
            <span>{strings.empty}</span>
            <Button type="button" size="sm" onClick={onCreate}>
              <Icon icon="mdi:plus" width={16} height={16} aria-hidden="true" />
              <span>{strings.newAnnouncement}</span>
            </Button>
          </div>
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
                          <MarkdownContent content={item.body} compact />
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
                          <Button type="button" variant="outline" size="xs" onClick={() => onEdit(item)}>
                            {strings.actions.edit}
                          </Button>
                          {item.status !== 'published' ? (
                            <Button
                              type="button"
                              size="xs"
                              onClick={() => onAct(item.id, 'publish')}
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
                              onClick={() => onAct(item.id, 'archive')}
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
                  <MarkdownContent
                    content={item.body}
                    className="announcements-mobile-body"
                  />
                  <div className="admin-mobile-kv">
                    <span>{strings.table.display}</span>
                    <strong>{displayLabel(item.displayKind, strings)}</strong>
                  </div>
                  <div className="admin-mobile-kv">
                    <span>{strings.table.updated}</span>
                    <strong>{formatTimestamp(item.updatedAt, language)}</strong>
                  </div>
                  <div className="table-actions announcements-mobile-actions">
                    <Button type="button" variant="outline" size="xs" onClick={() => onEdit(item)}>
                      {strings.actions.edit}
                    </Button>
                    {item.status !== 'published' ? (
                      <Button
                        type="button"
                        size="xs"
                        onClick={() => onAct(item.id, 'publish')}
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
                        onClick={() => onAct(item.id, 'archive')}
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
  )
}

export default function AnnouncementsModule({
  language,
  refreshToken = 0,
  initialMode = 'list',
}: AnnouncementsModuleProps): JSX.Element {
  const strings = useMemo(() => copy(language), [language])
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [draft, setDraft] = useState<AnnouncementDraft>(EMPTY_DRAFT)
  const [editorMode, setEditorMode] = useState<AnnouncementEditorMode | null>(
    () => initialMode === 'create' ? { kind: 'create' } : null,
  )
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

  const startCreate = () => {
    setEditorMode({ kind: 'create' })
    setDraft(EMPTY_DRAFT)
    setMessage(null)
    setError(null)
  }

  const startEdit = (item: Announcement) => {
    setEditorMode({ kind: 'edit', id: item.id })
    setDraft(toDraft(item))
    setMessage(null)
    setError(null)
  }

  const closeEditor = () => {
    setEditorMode(null)
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
      if (editorMode?.kind === 'edit') {
        await updateAnnouncement(editorMode.id, payload)
      } else {
        await createAnnouncement(payload)
      }
      closeEditor()
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

      {message ? <div className="announcements-message">{message}</div> : null}
      {error && !loading ? <div className="announcements-error">{error}</div> : null}

      {editorMode ? (
        <AnnouncementEditorPanel
          mode={editorMode}
          draft={draft}
          saving={saving}
          strings={strings}
          onBack={closeEditor}
          onChangeDraft={setDraft}
          onSubmit={() => void submit()}
        />
      ) : (
        <AnnouncementsListPanel
          items={items}
          loading={loading}
          error={error}
          busyId={busyId}
          strings={strings}
          language={language}
          onCreate={startCreate}
          onEdit={startEdit}
          onAct={(id, action) => void act(id, action)}
        />
      )}
    </section>
  )
}

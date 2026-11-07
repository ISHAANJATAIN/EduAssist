import { useId, useState, type FormEvent } from 'react'

import type { TopicIn, TopicOut } from '@/api/topics'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import {
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import {
  useCreateTopic,
  useDeleteTopic,
  useExtractTopics,
  useTopics,
  useUpdateTopic,
} from '@/hooks/useTopics'

interface TopicFormProps {
  topics: TopicOut[]
  editing: TopicOut | null
  saving: boolean
  onSubmit: (payload: TopicIn) => Promise<unknown>
  onCancel: () => void
}

function TopicForm({
  topics,
  editing,
  saving,
  onSubmit,
  onCancel,
}: TopicFormProps) {
  const nameId = useId()
  const descriptionId = useId()
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [prerequisiteIds, setPrerequisiteIds] = useState<string[]>(
    editing?.prerequisite_ids ?? [],
  )

  const options = topics.filter((topic) => topic.id !== editing?.id)

  const togglePrerequisite = (topicId: string) => {
    setPrerequisiteIds((current) =>
      current.includes(topicId)
        ? current.filter((id) => id !== topicId)
        : [...current, topicId],
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await onSubmit({
        name,
        description: description.trim() ? description.trim() : null,
        prerequisite_ids: prerequisiteIds,
      })
    } catch {
      // The mutation error is rendered by TopicEditor.
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-raised mt-5 space-y-3 p-4">
      <div>
        <label htmlFor={nameId} className="field-label">
          Topic name
        </label>
        <input
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="field-input"
          placeholder="e.g. Deadlock avoidance"
          maxLength={160}
          required
          disabled={saving}
        />
      </div>

      <div>
        <label htmlFor={descriptionId} className="field-label">
          Description (optional)
        </label>
        <textarea
          id={descriptionId}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="field-input h-auto min-h-[80px] py-2"
          placeholder="One sentence about what this topic covers"
          disabled={saving}
        />
      </div>

      {options.length > 0 ? (
        <fieldset>
          <legend className="field-label">Prerequisites (optional)</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {options.map((topic) => (
              <label
                key={topic.id}
                className="flex items-center gap-2 text-sm text-neutral-700"
              >
                <input
                  type="checkbox"
                  checked={prerequisiteIds.includes(topic.id)}
                  onChange={() => togglePrerequisite(topic.id)}
                  className="h-4 w-4 rounded border-neutral-300"
                  disabled={saving}
                />
                <span className="truncate">{topic.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {editing ? 'Save topic' : 'Add topic'}
        </Button>
      </div>
    </form>
  )
}

export function TopicEditor() {
  const topics = useTopics()
  const createTopic = useCreateTopic()
  const updateTopic = useUpdateTopic()
  const removeTopic = useDeleteTopic()
  const extract = useExtractTopics()

  const [formOpen, setFormOpen] = useState(false)
  const [editingTopic, setEditingTopic] = useState<TopicOut | null>(null)
  const [confirming, setConfirming] = useState<TopicOut | null>(null)

  const openCreate = () => {
    setEditingTopic(null)
    setFormOpen(true)
  }

  const openEdit = (topic: TopicOut) => {
    setEditingTopic(topic)
    setFormOpen(true)
  }

  const save = async (payload: TopicIn) => {
    if (editingTopic) {
      await updateTopic.mutateAsync({ topicId: editingTopic.id, payload })
    } else {
      await createTopic.mutateAsync(payload)
    }
    setFormOpen(false)
    setEditingTopic(null)
  }

  const byId = new Map<string, string>(
    (topics.data ?? []).map((topic) => [topic.id, topic.name]),
  )
  const actionError =
    createTopic.error ??
    updateTopic.error ??
    removeTopic.error ??
    extract.error

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Topics</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Topics drive mastery, quizzes and the planner.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => extract.mutate()}
            loading={extract.isPending}
          >
            <SparklesIcon size={16} />
            Extract
          </Button>
          <Button variant="secondary" onClick={openCreate}>
            <PlusIcon size={16} />
            Add
          </Button>
        </div>
      </div>

      {topics.error ? (
        <div className="mt-4">
          <ErrorBanner
            error={topics.error}
            onRetry={() => void topics.refetch()}
          />
        </div>
      ) : null}
      {actionError ? (
        <div className="mt-4">
          <ErrorBanner error={actionError} />
        </div>
      ) : null}

      {formOpen ? (
        <TopicForm
          key={editingTopic?.id ?? 'new'}
          topics={topics.data ?? []}
          editing={editingTopic}
          saving={createTopic.isPending || updateTopic.isPending}
          onSubmit={save}
          onCancel={() => {
            setFormOpen(false)
            setEditingTopic(null)
          }}
        />
      ) : null}

      {topics.isLoading ? (
        <div className="mt-6 flex justify-center text-neutral-500">
          <Spinner />
        </div>
      ) : null}

      {topics.data && topics.data.length === 0 ? (
        <p className="mt-5 rounded-md border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
          No topics yet. Add one, or upload a handout and extract topics
          automatically.
        </p>
      ) : null}

      <ul className="mt-5 space-y-2">
        {topics.data?.map((topic) => {
          const prerequisites = topic.prerequisite_ids ?? []
          return (
            <li key={topic.id} className="glass-raised p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-900">
                    {topic.name}
                  </p>
                  {topic.description ? (
                    <p className="mt-0.5 text-xs text-neutral-600">
                      {topic.description}
                    </p>
                  ) : null}
                  {prerequisites.length > 0 ? (
                    <p className="mt-1.5 text-xs text-neutral-500">
                      Needs:{' '}
                      {prerequisites
                        .map((id) => byId.get(id) ?? 'Unknown topic')
                        .join(', ')}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(topic)}
                    className="rounded-full px-2.5 py-1 text-xs font-semibold text-ink underline decoration-ink/25 underline-offset-2 transition hover:bg-ink/5 hover:decoration-ink"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${topic.name}`}
                    onClick={() => setConfirming(topic)}
                    className="rounded-md p-1.5 text-neutral-500 transition hover:bg-danger-bg hover:text-danger-text"
                  >
                    <TrashIcon size={16} />
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <ConfirmDialog
        open={confirming !== null}
        title="Delete topic?"
        description={
          confirming
            ? `"${confirming.name}" and its prerequisite links will be removed.`
            : undefined
        }
        confirmLabel="Delete"
        loading={removeTopic.isPending}
        onConfirm={() => {
          if (!confirming) return
          removeTopic.mutate(confirming.id, {
            onSettled: () => setConfirming(null),
          })
        }}
        onCancel={() => setConfirming(null)}
      />
    </div>
  )
}

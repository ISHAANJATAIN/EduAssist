import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { deleteMyData } from '@/api/account'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { CheckIcon, InfoIcon, TrashIcon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { useCourse, useUpdateCourse } from '@/hooks/useCourse'
import { useChatStore } from '@/store/chatStore'

export function SettingsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const course = useCourse()
  const updateCourse = useUpdateCourse()
  const [name, setName] = useState('')
  const [examDate, setExamDate] = useState('')
  const [freeHours, setFreeHours] = useState('2')
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!course.data) return
    setName(course.data.name)
    setExamDate(course.data.exam_date ?? '')
    setFreeHours(String(course.data.free_hours_per_day))
  }, [course.data])

  const remove = useMutation({
    mutationFn: deleteMyData,
    onSuccess: () => {
      useChatStore.getState().reset()
      queryClient.clear()
      setConfirming(false)
      navigate('/chat', { replace: true })
    },
    onError: () => setConfirming(false),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    setSaved(false)

    const trimmed = name.trim()
    const hours = Number(freeHours)
    if (!trimmed) {
      setFormError('Course name cannot be empty.')
      return
    }
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      setFormError('Free hours must be between 0 and 24.')
      return
    }

    updateCourse.mutate(
      {
        name: trimmed,
        exam_date: examDate || null,
        free_hours_per_day: hours,
      },
      { onSuccess: () => setSaved(true) },
    )
  }

  const openConfirm = () => {
    remove.reset()
    setConfirming(true)
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-[28px] font-semibold leading-tight text-ink">Settings</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Course defaults, privacy information, and your data controls.
        </p>
      </header>

      <section className="glass p-6" aria-labelledby="course-settings-heading">
        <h3
          id="course-settings-heading"
          className="text-lg font-semibold text-neutral-900"
        >
          Course settings
        </h3>
        <p className="mt-1 text-sm text-neutral-600">
          These defaults are used by the planner when you do not give a date or
          daily study time.
        </p>

        {course.isLoading ? (
          <div className="flex justify-center py-8 text-neutral-500">
            <Spinner />
          </div>
        ) : course.error ? (
          <div className="mt-4">
            <ErrorBanner
              error={course.error}
              onRetry={() => void course.refetch()}
            />
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            <div>
              <label htmlFor="course-name" className="field-label">
                Course name
              </label>
              <input
                id="course-name"
                value={name}
                maxLength={120}
                onChange={(event) => {
                  setName(event.target.value)
                  setSaved(false)
                }}
                className="field-input"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="course-exam-date" className="field-label">
                  Exam date
                </label>
                <input
                  id="course-exam-date"
                  type="date"
                  value={examDate}
                  onChange={(event) => {
                    setExamDate(event.target.value)
                    setSaved(false)
                  }}
                  className="field-input"
                />
                <p className="field-hint">
                  Leave empty until your exam date is confirmed.
                </p>
              </div>
              <div>
                <label htmlFor="course-free-hours" className="field-label">
                  Free hours per day
                </label>
                <input
                  id="course-free-hours"
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={freeHours}
                  onChange={(event) => {
                    setFreeHours(event.target.value)
                    setSaved(false)
                  }}
                  className="field-input"
                />
                <p className="field-hint">Study blocks are 30 minutes long.</p>
              </div>
            </div>

            {formError ? <ErrorBanner error={formError} /> : null}
            {updateCourse.error ? <ErrorBanner error={updateCourse.error} /> : null}

            <div className="flex flex-wrap items-center justify-end gap-3">
              {saved ? (
                <p
                  role="status"
                  className="inline-flex items-center gap-1.5 text-sm text-success-text"
                >
                  <CheckIcon size={16} />
                  Settings saved
                </p>
              ) : null}
              <Button type="submit" loading={updateCourse.isPending}>
                Save settings
              </Button>
            </div>
          </form>
        )}
      </section>

      <section className="glass p-6" aria-labelledby="privacy-heading">
        <div className="flex items-start gap-3">
          <InfoIcon size={20} className="mt-0.5 shrink-0 text-brand-600" />
          <div>
            <h3
              id="privacy-heading"
              className="text-lg font-semibold text-neutral-900"
            >
              Privacy
            </h3>
            <div className="mt-2 space-y-2 text-sm text-neutral-600">
              <p>
                Your documents, embeddings, quizzes, progress, plans and chat
                history stay in this EduAssist installation: local Postgres and
                the <code>backend/data</code> folder.
              </p>
              <p>
                By default every AI request runs locally through Ollama. If the
                optional Groq provider is enabled in <code>.env</code>, question
                text and retrieved excerpts are sent to Groq to generate an
                answer. No account or payment is needed for the local setup.
              </p>
              <p>
                Deleting your data removes the uploads you saved, their vectors,
                extracted topics, quizzes and attempts, mastery scores, plans and
                chat. Your login and these course settings are kept.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        className="rounded-lg border border-danger/30 bg-white/62 p-6 shadow-glass backdrop-blur-glass backdrop-saturate-150"
        aria-labelledby="danger-zone-heading"
      >
        <div className="flex items-start gap-3">
          <TrashIcon size={20} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <h3
              id="danger-zone-heading"
              className="text-lg font-semibold text-neutral-900"
            >
              Delete my data
            </h3>
            <p className="mt-1 text-sm text-neutral-600">
              Permanently remove your study material and everything generated
              from it. This cannot be undone, but your login stays active.
            </p>

            {remove.error ? (
              <div className="mt-4">
                <ErrorBanner error={remove.error} />
              </div>
            ) : null}

            <div className="mt-5">
              <Button variant="danger" onClick={openConfirm}>
                Delete my data
              </Button>
            </div>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirming}
        title="Delete all study data?"
        description={
          <>
            This removes every document and uploaded file, indexed chunk, topic,
            quiz and attempt, mastery score, study plan and chat message. Your
            login and course settings stay. <strong>This cannot be undone.</strong>
          </>
        }
        confirmLabel="Delete everything"
        confirmText="DELETE"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  )
}

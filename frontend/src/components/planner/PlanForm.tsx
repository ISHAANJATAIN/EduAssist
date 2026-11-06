import { useRef, useState, type FormEvent } from 'react'

import type { PlanIn } from '@/api/planner'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { todayIso } from '@/lib/format'

interface OverrideRow {
  id: number
  date: string
  hours: string
}

interface PlanFormProps {
  defaultExamDate: string | null
  defaultFreeHours: number
  onSubmit: (payload: PlanIn) => void
  pending?: boolean
  error?: unknown
}

function dayBefore(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`)
  date.setDate(date.getDate() - 1)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export function PlanForm({
  defaultExamDate,
  defaultFreeHours,
  onSubmit,
  pending = false,
  error,
}: PlanFormProps) {
  const [examDate, setExamDate] = useState(defaultExamDate ?? '')
  const [freeHours, setFreeHours] = useState(String(defaultFreeHours))
  const [overrides, setOverrides] = useState<OverrideRow[]>([])
  const [localError, setLocalError] = useState<string | null>(null)
  const nextId = useRef(1)
  const minDate = todayIso()

  const addOverride = () => {
    const id = nextId.current
    nextId.current += 1
    setOverrides((rows) => [...rows, { id, date: '', hours: '' }])
  }

  const updateOverride = (
    id: number,
    field: 'date' | 'hours',
    value: string,
  ) => {
    setOverrides((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    )
  }

  const removeOverride = (id: number) => {
    setOverrides((rows) => rows.filter((row) => row.id !== id))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setLocalError(null)

    const hours = Number(freeHours)
    if (!examDate) {
      setLocalError('Choose your exam date.')
      return
    }
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      setLocalError('Free hours must be between 0 and 24.')
      return
    }

    const overrideMap: Record<string, number> = {}
    for (const row of overrides) {
      if (!row.date && !row.hours) continue
      if (!row.date) {
        setLocalError('Choose a date for every override.')
        return
      }
      if (!row.hours) {
        setLocalError('Set hours for every override date.')
        return
      }
      if (row.date < minDate) {
        setLocalError('Overrides cannot be in the past.')
        return
      }
      if (row.date >= examDate) {
        setLocalError('Overrides must be before the exam date.')
        return
      }
      const value = Number(row.hours)
      if (!Number.isFinite(value) || value < 0 || value > 24) {
        setLocalError('Override hours must be between 0 and 24.')
        return
      }
      overrideMap[row.date] = value
    }

    onSubmit({
      exam_date: examDate,
      free_hours_per_day: hours,
      overrides: Object.keys(overrideMap).length > 0 ? overrideMap : null,
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="plan-exam-date" className="field-label">
            Exam date
          </label>
          <input
            id="plan-exam-date"
            type="date"
            min={minDate}
            required
            value={examDate}
            onChange={(event) => setExamDate(event.target.value)}
            className="field-input"
          />
        </div>
        <div>
          <label htmlFor="plan-free-hours" className="field-label">
            Free hours per day
          </label>
          <input
            id="plan-free-hours"
            type="number"
            min={0}
            max={24}
            step={0.5}
            required
            value={freeHours}
            onChange={(event) => setFreeHours(event.target.value)}
            className="field-input"
          />
          <p className="field-hint">Study blocks are 30 minutes long.</p>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="field-label">Day overrides</p>
            <p className="field-hint mt-0">
              Optional: change the available hours for a specific day.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={addOverride}>
            Add day
          </Button>
        </div>

        {overrides.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {overrides.map((row) => (
              <li key={row.id} className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={`override-date-${row.id}`}
                    className="sr-only"
                  >
                    Override date
                  </label>
                  <input
                    id={`override-date-${row.id}`}
                    type="date"
                    min={minDate}
                    max={examDate ? dayBefore(examDate) : undefined}
                    value={row.date}
                    onChange={(event) =>
                      updateOverride(row.id, 'date', event.target.value)
                    }
                    className="field-input"
                  />
                </div>
                <div className="w-28">
                  <label
                    htmlFor={`override-hours-${row.id}`}
                    className="sr-only"
                  >
                    Override hours
                  </label>
                  <input
                    id={`override-hours-${row.id}`}
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    placeholder="Hours"
                    value={row.hours}
                    onChange={(event) =>
                      updateOverride(row.id, 'hours', event.target.value)
                    }
                    className="field-input"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => removeOverride(row.id)}
                  aria-label={`Remove override ${row.id}`}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {localError ? <ErrorBanner error={localError} /> : null}
      {error ? <ErrorBanner error={error} /> : null}

      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Build plan
        </Button>
      </div>
    </form>
  )
}

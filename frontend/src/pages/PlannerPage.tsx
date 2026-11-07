import { normalizeError } from '@/api/client'
import { PlanCalendar } from '@/components/planner/PlanCalendar'
import { PlanForm } from '@/components/planner/PlanForm'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Spinner } from '@/components/ui/Spinner'
import { useCourse } from '@/hooks/useCourse'
import { useCreatePlan, useLatestPlan } from '@/hooks/usePlan'
import { daysUntil } from '@/lib/format'

export function PlannerPage() {
  const course = useCourse()
  const latest = useLatestPlan()
  const create = useCreatePlan()

  const plan = latest.data
  const latestError = latest.error ? normalizeError(latest.error) : null
  const noPlanYet = latestError?.code === 'not_found'

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-[28px] font-semibold leading-tight text-ink">Planner</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Build a day-by-day study plan around your exam date.
        </p>
      </header>

      {course.isLoading ? (
        <div className="flex justify-center py-12 text-neutral-500">
          <Spinner />
        </div>
      ) : course.error ? (
        <ErrorBanner
          error={course.error}
          onRetry={() => void course.refetch()}
        />
      ) : (
        <section
          className="glass p-6"
          aria-labelledby="plan-form-heading"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3
              id="plan-form-heading"
              className="text-lg font-semibold text-neutral-900"
            >
              {plan ? 'Rebuild your plan' : 'New plan'}
            </h3>
            {plan ? (
              <p className="text-xs text-neutral-500">
                Exam in {Math.max(daysUntil(plan.exam_date), 0)} days
              </p>
            ) : null}
          </div>
          <div className="mt-4">
            <PlanForm
              defaultExamDate={
                course.data?.exam_date ?? plan?.exam_date ?? null
              }
              defaultFreeHours={course.data?.free_hours_per_day ?? 2}
              onSubmit={(payload) => create.mutate(payload)}
              pending={create.isPending}
              error={create.error}
            />
          </div>
        </section>
      )}

      {latest.isLoading ? (
        <div className="flex justify-center py-12 text-neutral-500">
          <Spinner />
        </div>
      ) : latestError && !noPlanYet ? (
        <ErrorBanner
          error={latest.error}
          onRetry={() => void latest.refetch()}
        />
      ) : plan ? (
        <section className="glass p-6">
          <PlanCalendar plan={plan} />
        </section>
      ) : null}
    </div>
  )
}

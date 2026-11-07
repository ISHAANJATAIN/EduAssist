import { MasteryChart } from '@/components/dashboard/MasteryChart'
import { RecommendationList } from '@/components/dashboard/RecommendationList'
import { TopicTable } from '@/components/dashboard/TopicTable'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Spinner } from '@/components/ui/Spinner'
import { usePerformance, useRecommendations } from '@/hooks/usePerformance'

function StatTile({
  label,
  value,
  tone = 'text-neutral-900',
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="glass p-4">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  )
}

export function DashboardPage() {
  const performance = usePerformance()
  const recommendations = useRecommendations()

  const topics = performance.data?.topics ?? []
  const tested = topics.filter((topic) => topic.attempts > 0)
  const average =
    tested.length === 0
      ? null
      : Math.round(
          tested.reduce((sum, topic) => sum + topic.mastery, 0) / tested.length,
        )

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-[28px] font-semibold leading-tight text-ink">Dashboard</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Mastery across your topics. It updates after every quiz attempt.
        </p>
      </header>

      {performance.isLoading ? (
        <div className="flex justify-center py-12 text-neutral-500">
          <Spinner />
        </div>
      ) : performance.error ? (
        <ErrorBanner
          error={performance.error}
          onRetry={() => void performance.refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Topics tracked" value={String(topics.length)} />
            <StatTile
              label="Weak"
              value={String(performance.data?.weak_topic_ids.length ?? 0)}
              tone="text-danger-text"
            />
            <StatTile
              label="Strong"
              value={String(performance.data?.strong_topic_ids.length ?? 0)}
              tone="text-success-text"
            />
            <StatTile
              label="Average mastery"
              value={average === null ? '—' : `${average}%`}
            />
          </div>

          <section className="glass p-6" aria-labelledby="mastery-heading">
            <h3
              id="mastery-heading"
              className="text-lg font-semibold text-neutral-900"
            >
              Mastery by topic
            </h3>
            <div className="mt-4">
              <MasteryChart topics={topics} />
            </div>
          </section>

          <div className="grid items-start gap-6 lg:grid-cols-5">
            <section
              className="glass min-w-0 p-6 lg:col-span-3"
              aria-labelledby="topics-heading"
            >
              <h3
                id="topics-heading"
                className="text-lg font-semibold text-neutral-900"
              >
                Topics
              </h3>
              <div className="mt-4">
                <TopicTable topics={topics} />
              </div>
              <p className="mt-4 text-xs text-neutral-500">
                Mastery follows the A12 formula: 0.6 × new score + 0.4 × old.
              </p>
            </section>

            <section
              className="glass min-w-0 p-6 lg:col-span-2"
              aria-labelledby="recommendations-heading"
            >
              <h3
                id="recommendations-heading"
                className="text-lg font-semibold text-neutral-900"
              >
                Recommendations
              </h3>
              <div className="mt-4">
                {recommendations.isLoading ? (
                  <div className="flex justify-center py-6 text-neutral-500">
                    <Spinner />
                  </div>
                ) : recommendations.error ? (
                  <ErrorBanner
                    error={recommendations.error}
                    onRetry={() => void recommendations.refetch()}
                  />
                ) : (
                  <RecommendationList items={recommendations.data ?? []} />
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}

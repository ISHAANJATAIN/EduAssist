import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { MasteryStatus, TopicPerformance } from '@/api/performance'

const STATUS_COLORS: Record<MasteryStatus, string> = {
  untested: 'rgb(var(--mastery-untested))',
  weak: 'rgb(var(--danger))',
  developing: 'rgb(var(--warning))',
  strong: 'rgb(var(--success))',
}

const GRID_COLOR = 'rgb(var(--line))'
const TICK_COLOR = 'rgb(var(--content-muted))'

const LEGEND: ReadonlyArray<{ status: MasteryStatus; label: string }> = [
  { status: 'weak', label: 'Weak' },
  { status: 'developing', label: 'Developing' },
  { status: 'strong', label: 'Strong' },
]

const ROW_HEIGHT = 34

export function MasteryChart({ topics }: { topics: TopicPerformance[] }) {
  if (topics.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-neutral-500">
        Add topics in the Library to see mastery here.
      </p>
    )
  }

  const tested = topics.filter((topic) => topic.attempts > 0)
  if (tested.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-neutral-500">
        No quiz attempts yet. Take a quiz to start tracking mastery.
      </p>
    )
  }

  const data = tested.map((topic) => ({
    name: topic.topic_name,
    mastery: Math.round(topic.mastery),
    status: topic.status,
  }))
  const untested = topics.length - tested.length

  return (
    <div>
      <div style={{ height: tested.length * ROW_HEIGHT + 40 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 40, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={GRID_COLOR}
              horizontal={false}
            />
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fontSize: 12, fill: TICK_COLOR }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={132}
              tick={{ fontSize: 12, fill: TICK_COLOR }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'rgb(var(--surface-card))',
                border: '1px solid rgb(var(--line))',
                borderRadius: 10,
                color: 'rgb(var(--ink))',
                fontSize: 12,
              }}
              labelStyle={{ color: 'rgb(var(--content-soft))' }}
            />
            <Bar dataKey="mastery" name="Mastery" maxBarSize={18} radius={[0, 6, 6, 0]}>
              <LabelList
                dataKey="mastery"
                position="right"
                formatter={(value: number) => `${value}%`}
                fill={TICK_COLOR}
                fontSize={12}
              />
              {data.map((entry) => (
                <Cell key={entry.name} fill={STATUS_COLORS[entry.status]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul
        aria-label="Mastery legend"
        className="mt-3 flex flex-wrap items-center justify-center gap-4"
      >
        {LEGEND.map(({ status, label }) => (
          <li key={status} className="flex items-center gap-1.5 text-xs text-neutral-500">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[status] }}
            />
            {label}
          </li>
        ))}
      </ul>

      {untested > 0 ? (
        <p className="mt-2 text-center text-xs text-neutral-500">
          {untested} {untested === 1 ? 'topic has' : 'topics have'} no attempts yet
          and {untested === 1 ? 'is' : 'are'} left out of this chart.
        </p>
      ) : null}
    </div>
  )
}

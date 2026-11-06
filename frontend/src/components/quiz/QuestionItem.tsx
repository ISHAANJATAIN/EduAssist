import type { QuizQuestion } from '@/api/quizzes'

interface QuestionItemProps {
  item: QuizQuestion
  selected?: number
  onSelect: (optionIndex: number) => void
}

export function QuestionItem({ item, selected, onSelect }: QuestionItemProps) {
  const groupName = `question-${item.id}`

  return (
    <fieldset>
      <legend className="text-base font-semibold text-neutral-900">
        {item.question}
      </legend>
      <div className="mt-3 grid gap-2">
        {item.options.map((option, optionIndex) => {
          const id = `${groupName}-${optionIndex}`
          const active = selected === optionIndex

          return (
            <label
              key={id}
              htmlFor={id}
              className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm transition ${
                active
                  ? 'border-brand-500 bg-brand-50 text-neutral-900'
                  : 'border-neutral-200 bg-white/72 text-neutral-700 hover:bg-white/90'
              }`}
            >
              <input
                id={id}
                type="radio"
                name={groupName}
                value={optionIndex}
                checked={active}
                onChange={() => onSelect(optionIndex)}
                className="mt-0.5 h-4 w-4 accent-brand-600"
              />
              <span className="break-words">{option}</span>
            </label>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        {item.source.filename}
        {item.source.page ? ` · p.${item.source.page}` : ''}
      </p>
    </fieldset>
  )
}

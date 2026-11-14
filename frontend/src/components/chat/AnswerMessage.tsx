import type { AnswerReply } from '@/api/chat'
import { CitationList } from '@/components/chat/CitationList'
import { InfoIcon } from '@/components/ui/Icon'

export function AnswerMessage({ reply }: { reply: AnswerReply }) {
  return (
    <div className="flex justify-start">
      <article className="w-full max-w-chat rounded-lg rounded-bl-sm border border-neutral-200/70 bg-neutral-50/95 px-4 py-3 text-base text-neutral-700 shadow-card backdrop-blur-glass">
        {reply.grounded ? null : (
          <div className="mb-3 flex items-start gap-2 rounded-md bg-info-bg px-3 py-2 text-sm text-info-text">
            <InfoIcon size={16} className="mt-0.5 shrink-0" />
            <p>General answer, not from your uploaded material.</p>
          </div>
        )}
        <p className="whitespace-pre-wrap break-words">{reply.text}</p>
        <CitationList citations={reply.citations ?? []} />
      </article>
    </div>
  )
}

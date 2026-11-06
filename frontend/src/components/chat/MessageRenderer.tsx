import { AnswerMessage } from '@/components/chat/AnswerMessage'
import { ClarifyMessage } from '@/components/chat/ClarifyMessage'
import { PerformanceMessage } from '@/components/chat/PerformanceMessage'
import { PlanMessage } from '@/components/chat/PlanMessage'
import { QuizMessage } from '@/components/chat/QuizMessage'
import { UserMessage } from '@/components/chat/UserMessage'
import type { ChatItem } from '@/store/chatStore'

export function MessageRenderer({ message }: { message: ChatItem }) {
  if (message.role === 'user') {
    return <UserMessage text={message.text ?? ''} />
  }

  if (!message.reply) return null

  if (message.reply.type === 'answer') {
    return <AnswerMessage reply={message.reply} />
  }

  if (message.reply.type === 'quiz') {
    return <QuizMessage quiz={message.reply.quiz} />
  }

  if (message.reply.type === 'performance') {
    return <PerformanceMessage reply={message.reply} />
  }

  if (message.reply.type === 'plan') {
    return <PlanMessage reply={message.reply} />
  }

  return <ClarifyMessage reply={message.reply} />
}

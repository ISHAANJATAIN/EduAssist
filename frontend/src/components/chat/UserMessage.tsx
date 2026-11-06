export function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-lg rounded-br-sm bg-brand-600 px-4 py-3 text-base text-white shadow-card md:max-w-chat">
        <p className="whitespace-pre-wrap break-words">{text}</p>
      </div>
    </div>
  )
}

export function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-bubble px-4 py-3 text-base leading-relaxed text-on-bubble shadow-card md:max-w-chat">
        <p className="whitespace-pre-wrap break-words">{text}</p>
      </div>
    </div>
  )
}

interface SpinnerProps {
  size?: 'sm' | 'md'
  className?: string
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const dimensions = size === 'sm' ? 'h-4 w-4 border-2' : 'h-6 w-6 border-2'
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-current border-t-transparent ${dimensions} ${className}`}
    />
  )
}

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'

import { Button } from '@/components/ui/Button'

interface ErrorBoundaryState {
  error: Error | null
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="glass max-w-md p-6">
            <h1 className="text-xl font-semibold text-neutral-900">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-neutral-600">{this.state.error.message}</p>
            <Button className="mt-4" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <Outlet />
    </ErrorBoundary>
  )
}

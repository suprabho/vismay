'use client'

import { Component, type ReactNode } from 'react'

interface Props {
  fallback: (error: Error) => ReactNode
  children: ReactNode
  /** Reset state when this key changes (e.g. switching previewed type). */
  resetKey?: string
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) return this.props.fallback(this.state.error)
    return this.props.children
  }
}

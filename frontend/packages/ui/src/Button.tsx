import {
  useCallback,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'
import './Button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'onClick' | 'children'
> {
  /** Required — no implicit default so a button inside a <form> never submits by accident. */
  type: 'button' | 'submit'
  variant?: ButtonVariant
  loading?: boolean
  children: ReactNode
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<unknown>
}

/**
 * Canonical button. Renders a real <button>, owns its own pending/disabled guard
 * (so a rapid double-click during an async action fires the handler once), and
 * derives every visual from the DESIGN.md tokens defined by the host app.
 */
export function Button({
  type,
  variant = 'primary',
  loading = false,
  disabled = false,
  children,
  onClick,
  className = '',
  ...rest
}: ButtonProps) {
  const [pending, setPending] = useState(false)
  const isBusy = loading || pending

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (disabled || isBusy) return
      const result = onClick?.(event)
      if (result instanceof Promise) {
        setPending(true)
        void result.finally(() => setPending(false))
      }
    },
    [onClick, disabled, isBusy],
  )

  return (
    <button
      type={type}
      className={`sg-button sg-button--${variant} ${className}`.trim()}
      disabled={disabled || isBusy}
      aria-busy={isBusy || undefined}
      onClick={handleClick}
      {...rest}
    >
      <span className="sg-button__label">{children}</span>
      {isBusy && (
        <span className="sg-button__spinner" aria-hidden="true">
          <span className="sg-button__spinner-ring" />
        </span>
      )}
    </button>
  )
}

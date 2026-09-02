import type { AnchorHTMLAttributes, ReactNode } from 'react'
import type { ButtonVariant } from './Button'

export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant
  children: ReactNode
}

/** A real <a> styled like a Button — for genuine navigation, never for actions. */
export function LinkButton({
  variant = 'primary',
  children,
  className = '',
  ...rest
}: LinkButtonProps) {
  return (
    <a className={`sg-button sg-button--${variant} ${className}`.trim()} {...rest}>
      <span className="sg-button__label">{children}</span>
    </a>
  )
}

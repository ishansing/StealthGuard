import { Button, type ButtonProps } from './Button'

export interface IconButtonProps extends Omit<ButtonProps, 'children'> {
  /** Material Symbols icon name. */
  icon: string
  /** Accessible name for the icon-only button. */
  label: string
}

/** Icon-only button sharing the Button contract; requires an accessible label. */
export function IconButton({ icon, label, ...rest }: IconButtonProps) {
  return (
    <Button aria-label={label} title={label} {...rest}>
      <span className="material-symbols-outlined" aria-hidden="true">
        {icon}
      </span>
    </Button>
  )
}

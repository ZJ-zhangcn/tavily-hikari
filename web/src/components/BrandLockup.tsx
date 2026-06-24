import { cn } from '../lib/utils'

interface BrandMarkProps {
  className?: string
  imageClassName?: string
}

export function BrandMark({
  className,
  imageClassName,
}: BrandMarkProps): JSX.Element {
  return (
    <span className={cn('brand-mark', className)} aria-hidden="true">
      <img
        src="/relay-mesh-mark.png"
        alt=""
        className={cn('brand-mark-image', imageClassName)}
        loading="eager"
        decoding="async"
      />
    </span>
  )
}

interface BrandWordmarkProps {
  title?: string
  compact?: boolean
  className?: string
  titleClassName?: string
  markClassName?: string
}

export default function BrandLockup({
  title = 'Tavily Hikari',
  compact = false,
  className,
  titleClassName,
  markClassName,
}: BrandWordmarkProps): JSX.Element {
  return (
    <span className={cn('brand-lockup', compact && 'brand-lockup-compact', className)}>
      <img
        src="/relay-mesh-lockup.png"
        alt={title}
        className={cn(
          'brand-lockup-image',
          compact && 'brand-lockup-image-compact',
          titleClassName,
          markClassName,
        )}
        loading="eager"
        decoding="async"
      />
    </span>
  )
}

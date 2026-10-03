import type { ReactNode } from 'react'

// Card frame of the Production Schedule page (mockup .card + .card h3 + .tag).
export function SchedCard({
  icon,
  title,
  tag,
  className = '',
  children,
}: {
  icon: string
  title: string
  tag?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section aria-label={title} className={`bg-white border border-[#d8dde3] rounded-xl overflow-hidden min-w-0 ${className}`}>
      <h3 className="m-0 flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-semibold text-[#1f2733] border-b border-[#d8dde3] bg-[#f8fafc]">
        <span aria-hidden>{icon}</span>
        {title}
        {tag != null && tag !== '' && <span className="ml-auto font-mono text-[10px] font-medium text-[#6b7682] text-right">{tag}</span>}
      </h3>
      {children}
    </section>
  )
}

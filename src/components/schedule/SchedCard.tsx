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
    <section aria-label={title} className={`bg-white border border-[#E0E0E0] rounded-lg overflow-hidden min-w-0 ${className}`}>
      <h3 className="m-0 flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-semibold text-[#1F1F1F] border-b border-[#E0E0E0] bg-[#FAFAFA]">
        <span aria-hidden>{icon}</span>
        {title}
        {tag != null && tag !== '' && <span className="ml-auto font-mono text-[10px] font-medium text-[#555555] text-right">{tag}</span>}
      </h3>
      {children}
    </section>
  )
}

import type { ReactNode } from 'react'

export interface MobileTab<T extends string> {
  key: T
  label: string
  icon: ReactNode
}

interface Props<T extends string> {
  tabs: MobileTab<T>[]
  active: T
  onChange: (tab: T) => void
}

// Bottom nav bar for the project/zone progress screens — replaces the old
// "stack everything on one scrolling page" layout. Sits as a normal flex
// child (not position: fixed) inside the page's h-screen/overflow-hidden
// shell, so it never needs a manual bottom-padding offset and can't be
// scrolled out of view.
export function MobileTabBar<T extends string>({ tabs, active, onChange }: Props<T>) {
  return (
    <div
      className="flex-shrink-0 bg-white border-t border-chrome-100 flex"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={[
            'flex-1 flex flex-col items-center gap-1 py-2.5 active:bg-chrome-50',
            active === t.key ? 'text-ssi-600' : 'text-chrome-400',
          ].join(' ')}
        >
          {t.icon}
          <span style={{ fontSize: 11, fontWeight: active === t.key ? 600 : 500 }}>{t.label}</span>
        </button>
      ))}
    </div>
  )
}

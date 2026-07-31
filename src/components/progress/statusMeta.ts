import type { ProgressStatus, ProgressShade } from '../../api/projectProgress'

// Order matters — rendered left→right as the isolate button strip,
// following the real workflow: Fabrication → Transport → Erection.
export const STATUS_ORDER: ProgressStatus[] = ['notstart', 'fabrication', 'load', 'erection', 'done']

// Two shades per phase: light = in progress, dark = phase complete and
// waiting for the next one. Single-shade statuses repeat the same hex in
// both slots so lookup code never branches. Pills use `dark`.
//
// Light hexes are TUNABLE — pixel-verified during E2E against the real
// model so they stay clearly distinguishable from notstart's #C7CBD1 and
// the isolate dim-gray #4A4A4A (the Sprint 24 color-collision lesson).
export const STATUS_META: Record<ProgressStatus, { label: string; light: string; dark: string }> = {
  notstart: { label: 'Not Start', light: '#C7CBD1', dark: '#C7CBD1' },
  fabrication: { label: 'Fabrication', light: '#F2C14E', dark: '#D48A0F' },
  load: { label: 'Load', light: '#85B4E6', dark: '#2F6DB5' },
  erection: { label: 'Erection', light: '#9C8CE0', dark: '#9C8CE0' },
  done: { label: 'Done', light: '#2E9E5F', dark: '#2E9E5F' },
}

export const statusHex = (status: ProgressStatus, shade: ProgressShade) => STATUS_META[status][shade]

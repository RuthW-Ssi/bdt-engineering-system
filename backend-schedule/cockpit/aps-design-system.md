# APS Design System

Shared light-theme design system for the APS scheduler UI, extracted from
`aps-scheduler-mockup.html`. One stylesheet: `aps-design-system.css`.

Use it:
```html
<link rel="stylesheet" href="aps-design-system.css">
```
(Fonts — Kanit / IBM Plex Sans Thai / IBM Plex Mono — load via an `@import` at
the top of the CSS, so linking the stylesheet is enough.)

> Light theme. The existing dark `cockpit.html` is a separate skin and is not
> covered by this system (can be re-skinned later if desired).

## Tokens (CSS custom properties on `:root`)

**Surfaces** — `--bg` #eef1f5 · `--panel` #fff · `--panel-head` #f8fafc ·
`--ink` #1f2733 · `--muted` #6b7682 · `--line` #d8dde3

**Brand** — `--accent` #e8590c (orange) · `--accent2` #fd7e14 · `--green` #1f9d57

**Op-type palette** (operation / work-center colors) — `--cut` #2f6f9f ·
`--fit` #2a9d8f · `--weld` #e8731a · `--blast` #7a828c · `--paint` #3a9d5d ·
`--assy` #6f5bd0. Helper classes: `.op-cut .op-fit .op-weld .op-blast .op-paint .op-assy`.

**Late state** — `--late-fill` · `--late-bd` #dc2626 · `--late-ink` #b91c1c

**Heatmap ramp** — `--heat-0`…`--heat-4` (cool blues) + `--heat-over` (orange,
>100%). Use for load ÷ (available × OEE).

**Spacing** — `--sp-1` 6 · `--sp-2` 10 · `--sp-3` 12 · `--sp-4` 16 (px).
**Radius** — `--r-sm` 6 · `--r-md` 8 · `--r-lg` 12 · `--r-pill` 999.
**Type** — `--font-body` (IBM Plex Sans Thai) · `--font-head` (Kanit) ·
`--font-mono` (IBM Plex Mono). Headings use Kanit; numbers/timestamps use mono.
**Elevation** — `--sh-1` (bar) · `--sh-2` (topbar) · `--sh-pop` (popover/editcard).

## Components

| group | classes |
|---|---|
| Layout | `.app` (max-1560 centered) · `.grid` (206 / 1fr / 280, collapses <1200px) |
| Topbar | `.topbar` (dark gradient) · `.badge` / `.badge.edit` |
| KPI | `.kpis` (4-col) · `.kpi` · `.kpi.good/.bad/.accent` · `.v` `.l` |
| Controls | `.controls` · `.seg` + `button.on` · `.ctl-label` · `.chk` · `.zoom` · `.vline` · `.editbtn` `.primary` `.go` · `.editing-hint` · `.legend` `.lg` `.sw` |
| Card | `.card` · `.card h3` + `.tag` |
| Backlog | `.bl-list` · `.wo-card` `.draggable` · `.wo-top` · `.wo-chips .c .due .urgent` · `.wo-route` · `.rseg` · `.wo-auto` · `.wo-ghost` |
| Gantt | `.gantt` · `.res-col` `.res-head` `.res-cell` `.res-dot` · `.tl-wrap` `.tl-head` `.tl-day` `.tl-body` · `.row-bg` `.alt` `.validdrop` · `.offband` · `.bar` `.setup` `.late` `.sel` `.dim` `.dragging` `.manual` · `.cursor-line` `.cursor-lbl` · `.drop-caret` `.drop-lbl` · `.editcard` `.ec-h` `.ec-row` `.ec-n` · `.duelane` `.due` `.dia` |
| Heatmap | `.heat` · `table.hm` · `.hc` |
| Load bars | `.load` · `.lbars` · `.lbar` `.fill` `.over` `.cap` `.vv` `.xx` |
| Detail panel | `.panel` `.empty` · `.dl dt dd` · `.pill` `.ok` `.late` · `.unbtn` · `.ordrow` `.bl` `.nm` `.meta` · `.selchip` |
| Misc | `.foot` · `#tip` / `.tip` · `.modal` `.mc` `.row` |

## Conventions
- Op bars/dots colored by op-type token (`background:var(--weld)` etc.).
- Late items: red outline on bars (`.bar.late`), red diamond on due lane, `.pill.late`.
- Numbers, timestamps, durations → `var(--font-mono)`. Headings → Kanit.
- Sentence case, Thai labels (the plant's working language).

*SP1 of the APS scheduler productionization (SP1 design system → SP2 gantt →
SP3 backlog+heatmap → SP4 edit → SP5 save). Consumers: SP2+ `aps-scheduler.html`.*

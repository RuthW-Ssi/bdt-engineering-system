import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { activateScheduleVersion, getScheduleBoard, getScheduleFourM, runSchedule, type RunScheduleInput } from '../api/schedule'

// Production Schedule page (ADR-0015). One read-only board query per version;
// a run or an activation changes what every version's board shows (new
// version row, ★ moves), so both invalidate the whole ['schedule', 'board'] prefix.
// The 4M query sits under that prefix too (['schedule', 'board', 'fourm', id],
// like its URL), so the same invalidation refreshes it.
const BOARD_KEY = ['schedule', 'board'] as const

/**
 * GET /schedule/board. `versionId` null/undefined → the server picks
 * (active → newest version with rows). The previous board stays on screen
 * while another version loads. Errors are shown by the page, not toasted.
 */
export function useScheduleBoard(versionId?: number | null) {
  return useQuery({
    queryKey: [...BOARD_KEY, versionId ?? null],
    queryFn: () => getScheduleBoard(versionId),
    placeholderData: keepPreviousData,
    meta: { skipGlobalErrorToast: true },
  })
}

/**
 * GET /schedule/board/fourm — the 4M + WIP panel's data. Pass the version the
 * board actually shows and `enabled: false` until the board is in, so the
 * panel loads after the board and never for a different version. The
 * previous version's data stays while another loads (the panel shows its
 * loading stub until the versions match). Errors are shown by the panel.
 */
export function useScheduleFourM(versionId?: number | null, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...BOARD_KEY, 'fourm', versionId ?? null],
    queryFn: () => getScheduleFourM(versionId),
    enabled,
    placeholderData: keepPreviousData,
    meta: { skipGlobalErrorToast: true },
  })
}

// Both mutations invalidate on settle, not only on success: a 504 only aborts
// the backend's own call to prod-scheduler, which may still persist / activate
// a version afterwards.

/** POST /schedule/runs — 409 / 422 / 5xx are rendered by the run form (describeScheduleError). */
export function useRunSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: RunScheduleInput) => runSchedule(body),
    onSettled: () => qc.invalidateQueries({ queryKey: BOARD_KEY }),
  })
}

/** POST /schedule/versions/:id/activate. */
export function useActivateVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => activateScheduleVersion(id),
    onSettled: () => qc.invalidateQueries({ queryKey: BOARD_KEY }),
  })
}

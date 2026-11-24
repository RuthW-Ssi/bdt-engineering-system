import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  assignHeatToSheet, assignHeatToSheets, getBackwardTrace, getForwardTrace, getHeatLots, getProjectTrace, getSheetHistory, getSheetTraces, upsertHeatLot, voidPlateCut,
  type AssignHeatPayload, type ProjectTraceParams, type UpsertHeatLotPayload,
} from '../api/traceability'

export function useHeatLots(search?: string, enabled = true) {
  return useQuery({ queryKey: ['traceability', 'heat-lots', search ?? ''], queryFn: () => getHeatLots(search), enabled })
}

export function useSheetTraces(uploadId: number, enabled = true) {
  return useQuery({ queryKey: ['traceability', 'sheets', uploadId], queryFn: () => getSheetTraces(uploadId), enabled: enabled && !!uploadId })
}

// Audit trail of one sheet (ACTIVE + VOID records); fetched only when the user opens it.
export function useSheetHistory(nestingId: number | null, enabled = true) {
  return useQuery({ queryKey: ['traceability', 'sheet-history', nestingId], queryFn: () => getSheetHistory(nestingId!), enabled: enabled && !!nestingId })
}

export function useProjectTrace(projectId: number | null, params?: ProjectTraceParams) {
  return useQuery({ queryKey: ['traceability', 'project', projectId, params], queryFn: () => getProjectTrace(projectId!, params), enabled: !!projectId })
}

export function useForwardTrace(heatNo: string | null) {
  return useQuery({ queryKey: ['traceability', 'forward', heatNo], queryFn: () => getForwardTrace(heatNo!), enabled: !!heatNo })
}

export function useBackwardTrace(partMark: string | null, projectCode?: string) {
  return useQuery({ queryKey: ['traceability', 'backward', partMark, projectCode ?? ''], queryFn: () => getBackwardTrace(partMark!, projectCode), enabled: !!partMark })
}

// Every traceability view reads the same three tables, so one write refreshes them all.
export function useAssignHeat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ nestingId, payload }: { nestingId: number; payload: AssignHeatPayload }) => assignHeatToSheet(nestingId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['traceability'] }),
  })
}

export function useAssignHeatBulk() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ nestingIds, payload }: { nestingIds: number[]; payload: AssignHeatPayload }) => assignHeatToSheets(nestingIds, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['traceability'] }),
  })
}

export function useVoidPlateCut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => voidPlateCut(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['traceability'] }),
  })
}

export function useUpsertHeatLot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpsertHeatLotPayload) => upsertHeatLot(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['traceability'] }),
  })
}

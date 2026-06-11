import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getMachines, getMachine, getMaintenanceLogs, getRepairTickets, getStatusHistory,
  createMaintenanceLog, openRepairTicket, closeRepairTicket, changeStatus,
  type EquipmentStatus,
} from '../api/machines'

export function useMachines(params?: { status?: EquipmentStatus; area?: string; name?: string }) {
  return useQuery({
    queryKey: ['machines', params],
    queryFn: () => getMachines(params),
  })
}

export function useMachine(id: number) {
  return useQuery({
    queryKey: ['machines', id],
    queryFn: () => getMachine(id),
    enabled: !!id,
  })
}

export function useMachineMaintenanceLogs(machineId: number) {
  return useQuery({
    queryKey: ['machines', machineId, 'maintenance-logs'],
    queryFn: () => getMaintenanceLogs(machineId),
    enabled: !!machineId,
  })
}

export function useMachineRepairTickets(machineId: number) {
  return useQuery({
    queryKey: ['machines', machineId, 'repair-tickets'],
    queryFn: () => getRepairTickets(machineId),
    enabled: !!machineId,
  })
}

export function useMachineStatusHistory(machineId: number) {
  return useQuery({
    queryKey: ['machines', machineId, 'status-history'],
    queryFn: () => getStatusHistory(machineId),
    enabled: !!machineId,
  })
}

export function useCreateMaintenanceLog(machineId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof createMaintenanceLog>[1]) =>
      createMaintenanceLog(machineId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machines', machineId] })
      qc.invalidateQueries({ queryKey: ['machines', machineId, 'maintenance-logs'] })
      qc.invalidateQueries({ queryKey: ['machines'] })
    },
  })
}

export function useOpenRepairTicket(machineId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof openRepairTicket>[1]) =>
      openRepairTicket(machineId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machines', machineId] })
      qc.invalidateQueries({ queryKey: ['machines', machineId, 'repair-tickets'] })
    },
  })
}

export function useCloseRepairTicket(machineId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ticketId, payload }: { ticketId: number; payload: Parameters<typeof closeRepairTicket>[2] }) =>
      closeRepairTicket(machineId, ticketId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machines', machineId] })
      qc.invalidateQueries({ queryKey: ['machines', machineId, 'repair-tickets'] })
    },
  })
}

export function useChangeStatus(machineId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof changeStatus>[1]) =>
      changeStatus(machineId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machines', machineId] })
      qc.invalidateQueries({ queryKey: ['machines', machineId, 'status-history'] })
      qc.invalidateQueries({ queryKey: ['machines'] })
    },
  })
}

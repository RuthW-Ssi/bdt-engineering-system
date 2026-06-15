import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { libraryApi } from '../api/library'
import type { CreateLibraryEntryPayload, UpdateLibraryEntryPayload } from '../api/types'

export function useLibraryEntries(params?: Parameters<typeof libraryApi.list>[0]) {
  return useQuery({
    queryKey: ['library-entries', params],
    queryFn: () => libraryApi.list(params),
    staleTime: 5 * 60 * 1000,
  })
}

export function useLibraryEntry(id: number) {
  return useQuery({
    queryKey: ['library-entry', id],
    queryFn: () => libraryApi.get(id),
    enabled: !!id,
  })
}

export function useCreateLibraryEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateLibraryEntryPayload) => libraryApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-entries'] }),
  })
}

export function useUpdateLibraryEntry(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateLibraryEntryPayload) => libraryApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library-entries'] })
      qc.invalidateQueries({ queryKey: ['library-entry', id] })
    },
  })
}

export function useDeleteLibraryEntry(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => libraryApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-entries'] }),
  })
}

export function useHardDeleteLibraryEntry(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => libraryApi.hardDelete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-entries'] }),
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createDocument, deleteDocument, listDocuments, updateDocument, type DocumentFields,
} from '../api/documents'

const KEY = ['documents']

const errorMessage = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback

export function useDocuments() {
  return useQuery({ queryKey: KEY, queryFn: listDocuments })
}

export function useSaveDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, fields, file }: { id?: number; fields: DocumentFields; file: File | null }) =>
      id ? updateDocument(id, fields, file) : createDocument(fields, file!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
      toast.success('Document saved')
    },
    onError: (e) => toast.error(errorMessage(e, 'Failed to save document — please try again')),
  })
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteDocument(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e) => toast.error(errorMessage(e, 'Failed to delete document — please try again')),
  })
}

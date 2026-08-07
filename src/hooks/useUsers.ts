import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getUsers,
  getUser,
  createUser,
  updateUser,
  setUserPermissions,
  resetUserPassword,
  type CreateUserPayload,
  type UpdateUserPayload,
  type PermissionEntry,
} from '../api/users'

export function useUsers(params?: Parameters<typeof getUsers>[0]) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => getUsers(params),
  })
}

export function useUser(id: number | null) {
  return useQuery({
    queryKey: ['users', id],
    queryFn: () => getUser(id as number),
    enabled: id != null,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateUserPayload) => createUser(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    meta: { showGlobalErrorToast: true },
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateUserPayload }) => updateUser(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    meta: { showGlobalErrorToast: true },
  })
}

export function useSetUserPermissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, permissions }: { id: number; permissions: PermissionEntry[] }) => setUserPermissions(id, permissions),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['users', vars.id] })
    },
    meta: { showGlobalErrorToast: true },
  })
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) => resetUserPassword(id, password),
    meta: { showGlobalErrorToast: true },
  })
}

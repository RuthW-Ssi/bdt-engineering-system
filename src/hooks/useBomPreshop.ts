import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getPreshop, savePreshop, type PreshopScope } from '../api/bomPreshop'

const key = (s: PreshopScope | null) => ['bom-preshop', s?.project_id ?? null, s?.zone_id ?? null, s?.sub_zone_id ?? null]

export function usePreshopCurrent(scope: PreshopScope | null) {
  // No background refetch: a new dispatch_id remounts the editor and would throw away unsaved work
  // (POC accounts are shared). Our own save invalidates this key, which is the refresh we want.
  return useQuery({ queryKey: key(scope), queryFn: () => getPreshop(scope!), enabled: !!scope, refetchOnWindowFocus: false, refetchOnReconnect: false, staleTime: Infinity })
}

export function useSavePreshop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: savePreshop,
    onSuccess: (_r, body) => {
      qc.invalidateQueries({ queryKey: key(body) })
      qc.invalidateQueries({ queryKey: ['dispatches'] })
    },
  })
}

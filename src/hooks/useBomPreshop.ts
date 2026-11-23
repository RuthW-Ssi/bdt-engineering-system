import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getPreshop, savePreshop, type PreshopScope } from '../api/bomPreshop'

const key = (s: PreshopScope | null) => ['bom-preshop', s?.project_id ?? null, s?.zone_id ?? null, s?.sub_zone_id ?? null]

export function usePreshopCurrent(scope: PreshopScope | null) {
  return useQuery({ queryKey: key(scope), queryFn: () => getPreshop(scope!), enabled: !!scope })
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

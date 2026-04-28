import { useState, useEffect } from 'react'
import { getDrawingsByProduct } from '../api/drawings'
import type { DrawingDTO } from '../api/drawings'

export function useDrawings(productCode: string | undefined) {
  const [drawings, setDrawings] = useState<DrawingDTO[]>([])
  const [loading, setLoading] = useState(!!productCode)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!productCode) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    getDrawingsByProduct(productCode)
      .then(setDrawings)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load drawings'))
      .finally(() => setLoading(false))
  }, [productCode])

  return { drawings, loading, error }
}

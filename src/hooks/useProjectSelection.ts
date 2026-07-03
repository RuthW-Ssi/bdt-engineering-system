import { useEffect } from 'react'
import type { useSearchParams } from 'react-router-dom'
import { useProjects } from './useProjects'
import type { ProjectDTO } from '../api/types'

const LAST_PROJECT_KEY = 'bdt.lastProjectId'

type SetSearchParams = ReturnType<typeof useSearchParams>[1]

export function useProjectSelection(searchParams: URLSearchParams, setSearchParams: SetSearchParams) {
  const { data: projectsData } = useProjects({ limit: 20 })
  const projects = projectsData?.items ?? []

  const paramId = searchParams.get('project_id')
  const activeProject = paramId
    ? projects.find(p => p.id === Number(paramId)) ?? null
    : null

  // Resolve a project when the URL doesn't already name a valid one:
  // remembered choice from a previous visit, else the first project.
  useEffect(() => {
    if (activeProject || projects.length === 0) return
    const remembered = sessionStorage.getItem(LAST_PROJECT_KEY)
    const rememberedProject = remembered
      ? projects.find(p => p.id === Number(remembered))
      : undefined
    const fallback = rememberedProject ?? projects[0]
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('project_id', String(fallback.id))
      return next
    }, { replace: true })
  }, [activeProject, projects, setSearchParams])

  function selectProject(project: ProjectDTO) {
    sessionStorage.setItem(LAST_PROJECT_KEY, String(project.id))
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('project_id', String(project.id))
      return next
    }, { replace: true })
  }

  return { projects, activeProject, selectProject }
}

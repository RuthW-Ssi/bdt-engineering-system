import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ProjectDTO } from '../api/types'
import { useProjects } from '../hooks/useProjects'

interface ProjectContextValue {
  activeProject: ProjectDTO | null
  setActiveProject: (p: ProjectDTO | null) => void
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [activeProject, setActiveProject] = useState<ProjectDTO | null>(null)

  // Auto-select the first project so any Context-consuming page (Dashboard,
  // RoutingApply, BomUpload, ProjectList) sees a populated activeProject even
  // if the user never visited a page that syncs one in first. This used to
  // live in Topbar (deleted in the project-selector-relocate branch), which
  // was the only thing that ever auto-populated this Context.
  const { data: projectsData } = useProjects({ limit: 20 })
  const projectItems = projectsData?.items ?? []

  useEffect(() => {
    if (!activeProject && projectItems.length > 0) {
      setActiveProject(projectItems[0])
    }
  }, [projectItems, activeProject, setActiveProject])

  return (
    <ProjectContext.Provider value={{ activeProject, setActiveProject }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useActiveProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useActiveProject must be used inside ProjectProvider')
  return ctx
}

import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { ProjectDTO } from '../api/types'

interface ProjectContextValue {
  activeProject: ProjectDTO | null
  setActiveProject: (p: ProjectDTO | null) => void
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [activeProject, setActiveProject] = useState<ProjectDTO | null>(null)

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

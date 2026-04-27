import { create } from 'zustand'
import type { Routing, RoutingStep, RoutingStatus, Category, OpCode } from '../types'
import { mockRoutings, mockRoutingSteps } from '../data/mock'
import { genId } from '../data/utils'

interface RoutingStore {
  // List state
  routings: Routing[]
  filterStatus: RoutingStatus | 'all'
  filterCat: Category | 'all'
  filterSearch: string
  setFilterStatus: (v: RoutingStatus | 'all') => void
  setFilterCat: (v: Category | 'all') => void
  setFilterSearch: (v: string) => void
  resetFilters: () => void

  // Editor state
  selectedCode: string | null
  steps: RoutingStep[]
  unsaved: boolean
  validateState: 'pass' | 'fail' | null
  editingStepId: string | null
  addStepOpen: boolean
  deleteConfirmId: string | null

  openEditor: (code: string) => void
  closeEditor: () => void

  setSteps: (steps: RoutingStep[]) => void
  updateStep: (id: string, patch: Partial<RoutingStep>) => void
  addStep: (op_code: OpCode, work_center: string, std_time_min: number, note: string) => void
  duplicateStep: (id: string) => void
  deleteStep: (id: string) => void

  setEditingStep: (id: string | null) => void
  setAddStepOpen: (open: boolean) => void
  setDeleteConfirm: (id: string | null) => void
  setValidateState: (v: 'pass' | 'fail' | null) => void
}

function renumber(steps: RoutingStep[]): RoutingStep[] {
  return steps.map((s, i) => ({ ...s, step_no: (i + 1) * 10 }))
}

export const useRoutingStore = create<RoutingStore>((set) => ({
  routings: mockRoutings,
  filterStatus: 'all',
  filterCat: 'all',
  filterSearch: '',
  setFilterStatus: (v) => set({ filterStatus: v }),
  setFilterCat: (v) => set({ filterCat: v }),
  setFilterSearch: (v) => set({ filterSearch: v }),
  resetFilters: () => set({ filterStatus: 'all', filterCat: 'all', filterSearch: '' }),

  selectedCode: null,
  steps: [],
  unsaved: false,
  validateState: null,
  editingStepId: null,
  addStepOpen: false,
  deleteConfirmId: null,

  openEditor: (code) => set({
    selectedCode: code,
    steps: mockRoutingSteps.map(s => ({ ...s })),
    unsaved: false,
    validateState: null,
    editingStepId: null,
    addStepOpen: false,
    deleteConfirmId: null,
  }),

  closeEditor: () => set({ selectedCode: null }),

  setSteps: (steps) => set({ steps, unsaved: true, validateState: null }),

  updateStep: (id, patch) => set((state) => ({
    steps: state.steps.map(s => s.id === id ? { ...s, ...patch } : s),
    unsaved: true,
    validateState: null,
  })),

  addStep: (op_code, work_center, std_time_min, note) => set((state) => {
    const newStep: RoutingStep = {
      id: genId(),
      step_no: 0,
      op_code,
      name_th: op_code,
      work_center,
      std_time_min,
      note,
    }
    return {
      steps: renumber([...state.steps, newStep]),
      unsaved: true,
      validateState: null,
      addStepOpen: false,
    }
  }),

  duplicateStep: (id) => set((state) => {
    const idx = state.steps.findIndex(s => s.id === id)
    if (idx === -1) return {}
    const dup = { ...state.steps[idx], id: genId() }
    const next = [...state.steps.slice(0, idx + 1), dup, ...state.steps.slice(idx + 1)]
    return { steps: renumber(next), unsaved: true, validateState: null }
  }),

  deleteStep: (id) => set((state) => ({
    steps: renumber(state.steps.filter(s => s.id !== id)),
    unsaved: true,
    validateState: null,
    deleteConfirmId: null,
  })),

  setEditingStep: (id) => set({ editingStepId: id, deleteConfirmId: null }),
  setAddStepOpen: (open) => set({ addStepOpen: open, editingStepId: null }),
  setDeleteConfirm: (id) => set({ deleteConfirmId: id, editingStepId: null }),
  setValidateState: (v) => set({ validateState: v }),
}))

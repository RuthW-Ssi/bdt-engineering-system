import { Upload, FileStack, Plus, Boxes, Workflow, MapPin, FolderOpen } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const ACTIONS = [
  { label: 'Upload BOM',        icon: <Upload size={20} />,    path: '/bom/upload' },
  { label: 'View Dispatches',   icon: <FileStack size={20} />, path: '/bom' },
  { label: 'New Product',       icon: <Plus size={20} />,      path: '/engineer-products' },
  { label: 'Materials',         icon: <Boxes size={20} />,     path: '/materials' },
  { label: 'Routings',          icon: <Workflow size={20} />,  path: '/routings' },
  { label: 'Zones',             icon: <MapPin size={20} />,    path: '/zones' },
  { label: 'Projects',          icon: <FolderOpen size={20} />,path: '/projects' },
]

export function QuickActions() {
  const navigate = useNavigate()
  return (
    <div className="bg-white rounded-xl shadow-card">
      <div className="px-5 py-4 border-b border-chrome-100">
        <h3 className="text-sm font-semibold text-chrome-800">Quick Actions</h3>
      </div>
      <div className="p-5 grid grid-cols-4 gap-3">
        {ACTIONS.map((a) => (
          <button
            key={a.path}
            onClick={() => navigate(a.path)}
            className="bg-chrome-50 hover:bg-chrome-100 rounded-xl p-4 flex flex-col items-center gap-2 text-center cursor-pointer transition-colors border border-transparent hover:border-chrome-200"
          >
            <span className="text-steel-600">{a.icon}</span>
            <span className="text-xs text-chrome-700 font-medium leading-tight">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

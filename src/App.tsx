import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProjectProvider } from './context/ProjectContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/layout/AppShell'
import { LoginPage } from './pages/LoginPage'
import { CustomerList } from './pages/CustomerList'
import { ProjectList } from './pages/ProjectList'
import { ZoneList } from './pages/ZoneList'
import { RoutingList } from './pages/RoutingList'
import { RoutingBuilder } from './pages/RoutingBuilder'
import { WorkcenterMaster } from './pages/WorkcenterMaster'
import { ProductList } from './pages/ProductList'
import { ProductDetail } from './pages/ProductDetail'
import { MaterialList } from './pages/MaterialList'
import { BomList } from './pages/BomList'
import { BomUpload } from './pages/BomUpload'
import { BomDispatchDetail } from './pages/BomDispatchDetail'
import { BomPaintConfig } from './pages/BomPaintConfig'
import { BomRoutingConfig } from './pages/BomRoutingConfig'
import { BomEditor } from './pages/BomEditor'
import { BomDiffReview } from './pages/BomDiffReview'
import { BindingRuleManager } from './pages/BindingRuleManager'
import OperationLibraryList from './pages/OperationLibraryList'
import OperationBuilder from './pages/OperationBuilder'
import { ActivityLibraryList } from './pages/ActivityLibraryList'
import { Dashboard } from './pages/Dashboard'
import { MachineDetail } from './pages/MachineDetail'
import { ResourceList } from './pages/ResourceList'
import { MoNew } from './pages/MoNew'
import { MoDetail } from './pages/MoDetail'
import { OrderHub } from './pages/OrderHub'
import { WoDetail } from './pages/WoDetail'

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 56px)', color: '#8E8E8E', fontSize: 14 }}>
      {title} — coming soon
    </div>
  )
}

function RedirectOpEdit() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/operation-library/${id}/edit`} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <ProjectProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/customers" element={<CustomerList />} />
            <Route path="/projects" element={<ProjectList />} />
            <Route path="/zones" element={<ZoneList />} />
            <Route path="/engineer-products" element={<ProductList />} />
            <Route path="/engineer-products/:code" element={<ProductDetail />} />
            <Route path="/materials" element={<MaterialList />} />
            <Route path="/materials/:code" element={<ProductDetail />} />
            <Route path="/bom" element={<BomList />} />
            <Route path="/bom/upload" element={<BomUpload />} />
            <Route path="/bom/dispatch/:id/paint" element={<BomPaintConfig />} />
            <Route path="/bom/dispatch/:id/routing" element={<BomRoutingConfig />} />
            <Route path="/bom/dispatch/:id" element={<BomDispatchDetail />} />
            <Route path="/bom/:code" element={<BomEditor />} />
            <Route path="/bom/:code/diff" element={<BomDiffReview />} />
            <Route path="/routings" element={<RoutingList />} />
            <Route path="/routings/new" element={<RoutingBuilder />} />
            <Route path="/routings/:id/edit" element={<RoutingBuilder />} />
            <Route path="/admin/workcenters" element={<WorkcenterMaster />} />
            <Route path="/admin/binding-rules" element={<BindingRuleManager />} />

            {/* New canonical routes */}
            <Route path="/operation-library" element={<OperationLibraryList />} />
            <Route path="/operation-library/new" element={<OperationBuilder />} />
            <Route path="/operation-library/:id/edit" element={<OperationBuilder />} />

            {/* Redirects from old paths */}
            <Route path="/admin/operation-library" element={<Navigate to="/operation-library" replace />} />
            <Route path="/admin/operation-library/new" element={<Navigate to="/operation-library/new" replace />} />
            <Route path="/admin/operation-library/:id/edit" element={<RedirectOpEdit />} />

            <Route path="/activity-library" element={<ActivityLibraryList />} />
            <Route path="/activity-library/new" element={<Navigate to="/activity-library" replace />} />
            <Route path="/activity-library/:id/edit" element={<ActivityLibraryList />} />
            <Route path="/resources" element={<ResourceList />} />
            <Route path="/machines" element={<Navigate to="/resources" replace />} />
            <Route path="/machines/:id" element={<MachineDetail />} />
            {/* Sprint 14: Order Hub (MO ↔ WO tabs) */}
            <Route path="/order" element={<OrderHub />} />
            <Route path="/order/wo/:id" element={<WoDetail />} />
            {/* Sprint 13: Manufacturing Order · /mo list now aliases into the hub */}
            <Route path="/mo" element={<Navigate to="/order?tab=mo" replace />} />
            <Route path="/mo/new" element={<MoNew />} />
            <Route path="/mo/:id/edit" element={<MoNew />} />
            <Route path="/mo/:id" element={<MoDetail />} />
            <Route path="/eco" element={<Placeholder title="ECO" />} />
            <Route path="/qc" element={<Placeholder title="QC" />} />
            <Route path="/reports" element={<Placeholder title="Reports" />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </ProjectProvider>
    </AuthProvider>
  )
}

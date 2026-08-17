import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from './context/AuthContext'
import { ProjectProvider } from './context/ProjectContext'
import { ConfirmProvider } from './components/ui/ConfirmDialog'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/layout/AppShell'
import { LoginPage } from './pages/LoginPage'
import { CustomerList } from './pages/CustomerList'
import { ProjectList } from './pages/ProjectList'
import { ProjectProgress } from './pages/ProjectProgress'
import { ProjectProgressHistory } from './pages/ProjectProgressHistory'
import { ZoneList } from './pages/ZoneList'
import { RoutingList } from './pages/RoutingList'
import { RoutingBuilder } from './pages/RoutingBuilder'
import { WorkcenterMaster } from './pages/WorkcenterMaster'
import { ProductList } from './pages/ProductList'
import { ProductDetail } from './pages/ProductDetail'
import { MaterialList } from './pages/MaterialList'
import { MaterialDetail } from './pages/MaterialDetail'
import { BomList } from './pages/BomList'
import { BomUpload } from './pages/BomUpload'
import { BomDispatchDetail } from './pages/BomDispatchDetail'
import { BomPaintConfig } from './pages/BomPaintConfig'
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
import { CuttingPlanList } from './pages/CuttingPlanList'
import { CuttingPlanUpload } from './pages/CuttingPlanUpload'
import { CuttingPlanDetail } from './pages/CuttingPlanDetail'
import { BimViewer } from './pages/BimViewer'
import { UsersPage } from './pages/UsersPage'

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
      <ConfirmProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { fontFamily: 'inherit', fontSize: 13, borderRadius: 8 },
          classNames: {},
        }}
        richColors
      />
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
            <Route path="/customers" element={<ProtectedRoute viewModules={['customers']}><CustomerList /></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute viewModules={['projects']}><ProjectList /></ProtectedRoute>} />
            <Route path="/projects/:code/progress" element={<ProtectedRoute viewModules={['project-tracking']}><ProjectProgress /></ProtectedRoute>} />
            <Route path="/projects/:code/progress/history" element={<ProtectedRoute viewModules={['project-tracking']}><ProjectProgressHistory /></ProtectedRoute>} />
            <Route path="/zones" element={<ProtectedRoute viewModules={['project-zones', 'sub-zones']}><ZoneList /></ProtectedRoute>} />
            <Route path="/engineer-products" element={<ProtectedRoute viewModules={['products']}><ProductList /></ProtectedRoute>} />
            <Route path="/engineer-products/:code" element={<ProtectedRoute viewModules={['products']}><ProductDetail /></ProtectedRoute>} />
            <Route path="/materials" element={<ProtectedRoute viewModules={['materials']}><MaterialList /></ProtectedRoute>} />
            <Route path="/materials/:code" element={<ProtectedRoute viewModules={['materials']}><MaterialDetail /></ProtectedRoute>} />
            <Route path="/bom" element={<ProtectedRoute viewModules={['boms']}><BomList /></ProtectedRoute>} />
            <Route path="/bom/upload" element={<ProtectedRoute viewModules={['boms']}><BomUpload /></ProtectedRoute>} />
            <Route path="/bom/dispatch/:id/paint" element={<ProtectedRoute viewModules={['boms']}><BomPaintConfig /></ProtectedRoute>} />
            <Route path="/bom/dispatch/:id" element={<ProtectedRoute viewModules={['boms']}><BomDispatchDetail /></ProtectedRoute>} />
            <Route path="/bim-viewer" element={<ProtectedRoute viewModules={['bim']}><BimViewer /></ProtectedRoute>} />
            <Route path="/routings" element={<ProtectedRoute viewModules={['routings']}><RoutingList /></ProtectedRoute>} />
            <Route path="/routings/new" element={<ProtectedRoute viewModules={['routings']}><RoutingBuilder /></ProtectedRoute>} />
            <Route path="/routings/:id/edit" element={<ProtectedRoute viewModules={['routings']}><RoutingBuilder /></ProtectedRoute>} />
            <Route path="/admin/workcenters" element={<ProtectedRoute viewModules={['routings']}><WorkcenterMaster /></ProtectedRoute>} />
            <Route path="/admin/binding-rules" element={<ProtectedRoute viewModules={['routings']}><BindingRuleManager /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute roles={['admin']}><UsersPage /></ProtectedRoute>} />

            {/* New canonical routes */}
            <Route path="/operation-library" element={<ProtectedRoute viewModules={['routings']}><OperationLibraryList /></ProtectedRoute>} />
            <Route path="/operation-library/new" element={<ProtectedRoute viewModules={['routings']}><OperationBuilder /></ProtectedRoute>} />
            <Route path="/operation-library/:id/edit" element={<ProtectedRoute viewModules={['routings']}><OperationBuilder /></ProtectedRoute>} />

            {/* Redirects from old paths */}
            <Route path="/admin/operation-library" element={<Navigate to="/operation-library" replace />} />
            <Route path="/admin/operation-library/new" element={<Navigate to="/operation-library/new" replace />} />
            <Route path="/admin/operation-library/:id/edit" element={<RedirectOpEdit />} />

            {/* 2026-08-05: Activity Library folded into `routings` permission
                (not its own module) — it's a sibling of Routing Template /
                Operation Library in the same sidebar group, and nothing
                outside routings reads its data */}
            <Route path="/activity-library" element={<ProtectedRoute viewModules={['routings']}><ActivityLibraryList /></ProtectedRoute>} />
            <Route path="/activity-library/new" element={<Navigate to="/activity-library" replace />} />
            <Route path="/activity-library/:id/edit" element={<ProtectedRoute viewModules={['routings']}><ActivityLibraryList /></ProtectedRoute>} />
            <Route path="/resources" element={<ProtectedRoute viewModules={['machines']}><ResourceList /></ProtectedRoute>} />
            <Route path="/machines" element={<Navigate to="/resources" replace />} />
            <Route path="/machines/:id" element={<ProtectedRoute viewModules={['machines']}><MachineDetail /></ProtectedRoute>} />
            {/* Sprint 14: Order Hub (MO ↔ WO tabs) */}
            <Route path="/order" element={<ProtectedRoute viewModules={['orders']}><OrderHub /></ProtectedRoute>} />
            <Route path="/order/wo/:id" element={<ProtectedRoute viewModules={['orders']}><WoDetail /></ProtectedRoute>} />
            {/* Sprint 13: Manufacturing Order · /mo list now aliases into the hub */}
            <Route path="/mo" element={<Navigate to="/order?tab=mo" replace />} />
            <Route path="/mo/new" element={<ProtectedRoute viewModules={['orders']}><MoNew /></ProtectedRoute>} />
            <Route path="/mo/:id/edit" element={<ProtectedRoute viewModules={['orders']}><MoNew /></ProtectedRoute>} />
            <Route path="/mo/:id" element={<ProtectedRoute viewModules={['orders']}><MoDetail /></ProtectedRoute>} />
            <Route path="/eco" element={<Placeholder title="ECO" />} />
            <Route path="/qc" element={<Placeholder title="QC" />} />
            <Route path="/reports" element={<Placeholder title="Reports" />} />
            <Route path="/cutting-plan" element={<ProtectedRoute viewModules={['cutting-plan']}><CuttingPlanList /></ProtectedRoute>} />
            <Route path="/cutting-plan/upload" element={<ProtectedRoute viewModules={['cutting-plan']}><CuttingPlanUpload /></ProtectedRoute>} />
            <Route path="/cutting-plan/:id" element={<ProtectedRoute viewModules={['cutting-plan']}><CuttingPlanDetail /></ProtectedRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
      </ConfirmProvider>
      </ProjectProvider>
    </AuthProvider>
  )
}

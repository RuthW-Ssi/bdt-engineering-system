import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProjectProvider } from './context/ProjectContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/layout/AppShell'
import { LoginPage } from './pages/LoginPage'
import { CustomerList } from './pages/CustomerList'
import { ProjectList } from './pages/ProjectList'
import { ZoneList } from './pages/ZoneList'
import { RoutingList } from './pages/RoutingList'
import { RoutingApply } from './pages/RoutingApply'
import { RoutingEditor } from './pages/RoutingEditor'
import { RoutingBuilder } from './pages/RoutingBuilder'
import { WorkcenterMaster } from './pages/WorkcenterMaster'
import { ActivityTemplateMaster } from './pages/ActivityTemplateMaster'
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
import { CustomRoutingEditor } from './pages/CustomRoutingEditor'
import { BindingRuleManager } from './pages/BindingRuleManager'
import { BulkOverrideAdmin } from './pages/BulkOverrideAdmin'
import OperationLibraryList from './pages/OperationLibraryList'
import OperationBuilder from './pages/OperationBuilder'
import { ActivityLibraryList } from './pages/ActivityLibraryList'
import { ActivityBuilder } from './pages/ActivityBuilder'
import { Dashboard } from './pages/Dashboard'

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 56px)', color: '#8E8E8E', fontSize: 14 }}>
      {title} — coming soon
    </div>
  )
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
            <Route path="/routings/apply" element={<RoutingApply />} />
            <Route path="/routings/new" element={<RoutingBuilder />} />
            <Route path="/routings/:id/edit" element={<RoutingBuilder />} />
            <Route path="/routings/:code" element={<RoutingEditor />} />
            <Route path="/admin/workcenters" element={<WorkcenterMaster />} />
            <Route path="/admin/activity-templates" element={<ActivityTemplateMaster />} />
            <Route path="/products/:code/custom-routing" element={<CustomRoutingEditor />} />
            <Route path="/admin/binding-rules" element={<BindingRuleManager />} />
            <Route path="/admin/bulk-overrides" element={<BulkOverrideAdmin />} />
            <Route path="/admin/operation-library" element={<OperationLibraryList />} />
            <Route path="/admin/operation-library/new" element={<OperationBuilder />} />
            <Route path="/admin/operation-library/:id/edit" element={<OperationBuilder />} />
            <Route path="/activity-library" element={<ActivityLibraryList />} />
            <Route path="/activity-library/new" element={<ActivityBuilder />} />
            <Route path="/activity-library/:id/edit" element={<ActivityBuilder />} />
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

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { RoutingList } from './pages/RoutingList'
import { RoutingEditor } from './pages/RoutingEditor'
import { WorkcenterMaster } from './pages/WorkcenterMaster'
import { ActivityTemplateMaster } from './pages/ActivityTemplateMaster'
import { ProductList } from './pages/ProductList'
import { ProductDetail } from './pages/ProductDetail'
import { MaterialList } from './pages/MaterialList'
import { BomEditor } from './pages/BomEditor'
import { BomDiffReview } from './pages/BomDiffReview'
import { CustomRoutingEditor } from './pages/CustomRoutingEditor'
import { BindingRuleManager } from './pages/BindingRuleManager'

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 56px)', color: '#8E8E8E', fontSize: 14 }}>
      {title} — coming soon
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/engineer-products" replace />} />
          <Route path="/dashboard" element={<Placeholder title="Dashboard" />} />
          <Route path="/projects" element={<Placeholder title="Projects" />} />
          <Route path="/engineer-products" element={<ProductList />} />
          <Route path="/engineer-products/:code" element={<ProductDetail />} />
          <Route path="/materials" element={<MaterialList />} />
          <Route path="/materials/:code" element={<ProductDetail />} />
          <Route path="/bom/:code" element={<BomEditor />} />
          <Route path="/bom/:code/diff" element={<BomDiffReview />} />
          <Route path="/routings" element={<RoutingList />} />
          <Route path="/routings/:code" element={<RoutingEditor />} />
          <Route path="/admin/workcenters" element={<WorkcenterMaster />} />
          <Route path="/admin/activity-templates" element={<ActivityTemplateMaster />} />
          <Route path="/products/:code/custom-routing" element={<CustomRoutingEditor />} />
          <Route path="/admin/binding-rules" element={<BindingRuleManager />} />
          <Route path="/eco" element={<Placeholder title="ECO" />} />
          <Route path="/qc" element={<Placeholder title="QC" />} />
          <Route path="/reports" element={<Placeholder title="Reports" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

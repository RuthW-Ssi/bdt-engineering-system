import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { RoutingList } from './pages/RoutingList'
import { RoutingEditor } from './pages/RoutingEditor'
import { ProductList } from './pages/ProductList'
import { ProductDetail } from './pages/ProductDetail'
import { BomEditor } from './pages/BomEditor'
import { BomDiffReview } from './pages/BomDiffReview'

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
          <Route index element={<Navigate to="/products" replace />} />
          <Route path="/dashboard" element={<Placeholder title="Dashboard" />} />
          <Route path="/projects" element={<Placeholder title="Projects" />} />
          <Route path="/products" element={<ProductList />} />
          <Route path="/products/:code" element={<ProductDetail />} />
          <Route path="/bom/:code" element={<BomEditor />} />
          <Route path="/bom/:code/diff" element={<BomDiffReview />} />
          <Route path="/routings" element={<RoutingList />} />
          <Route path="/routings/:code" element={<RoutingEditor />} />
          <Route path="/eco" element={<Placeholder title="ECO" />} />
          <Route path="/qc" element={<Placeholder title="QC" />} />
          <Route path="/reports" element={<Placeholder title="Reports" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

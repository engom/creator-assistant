import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { FeedPage } from '@/pages/FeedPage'
import { AnalyzePage } from '@/pages/AnalyzePage'
import { ActivityPage } from '@/pages/ActivityPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ToastContainer } from '@/components/ui/Toast'
import { PushBanner } from '@/components/notifications/PushBanner'

export default function App() {
  return (
    <BrowserRouter>
      <PushBanner />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<FeedPage />} />
          <Route path="/analyze" element={<AnalyzePage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  )
}

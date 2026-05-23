import { HashRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { Toaster } from '@/components/ui/Toaster'
import { Layout } from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import ActivityLog from '@/pages/ActivityLog'
import PlanView from '@/pages/PlanView'
import PlanDetail from '@/pages/PlanDetail'
import Export from '@/pages/Export'
import Progress from '@/pages/Progress'
import Settings from '@/pages/Settings'
import Habits from '@/pages/Habits'
import DailyCheckin from '@/pages/DailyCheckin'
import Body from '@/pages/Body'
import Nutrition from '@/pages/Nutrition'
import Recovery from '@/pages/Recovery'
import Challenges from '@/pages/Challenges'

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="activities" element={<ActivityLog />} />
              <Route path="plan" element={<PlanView />} />
              <Route path="plan/:id" element={<PlanDetail />} />
              <Route path="export" element={<Export />} />
              <Route path="progress" element={<Progress />} />
              <Route path="settings" element={<Settings />} />
              <Route path="habits" element={<Habits />} />
              <Route path="checkin" element={<DailyCheckin />} />
              <Route path="body" element={<Body />} />
              <Route path="nutrition" element={<Nutrition />} />
              <Route path="recovery" element={<Recovery />} />
              <Route path="challenges" element={<Challenges />} />
            </Route>
          </Routes>
          <Toaster />
        </HashRouter>
      </ToastProvider>
    </ThemeProvider>
  )
}

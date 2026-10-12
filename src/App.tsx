import { lazy } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { Toaster } from '@/components/ui/Toaster'
import { Layout } from '@/components/Layout'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const ActivityLog = lazy(() => import('@/pages/ActivityLog'))
const PlanView = lazy(() => import('@/pages/PlanView'))
const PlanDetail = lazy(() => import('@/pages/PlanDetail'))
const Coach = lazy(() => import('@/pages/Coach'))
const Progress = lazy(() => import('@/pages/Progress'))
const Settings = lazy(() => import('@/pages/Settings'))
const Recovery = lazy(() => import('@/pages/Recovery'))
const Onboarding = lazy(() => import('@/pages/Onboarding'))

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
              <Route path="coach" element={<Coach />} />
              <Route path="export" element={<Coach />} />
              <Route path="progress" element={<Progress />} />
              <Route path="settings" element={<Settings />} />
              <Route path="checkin" element={<Navigate to="/recovery" replace />} />
              <Route path="willkommen" element={<Onboarding />} />
              <Route path="recovery" element={<Recovery />} />
            </Route>
          </Routes>
          <Toaster />
        </HashRouter>
      </ToastProvider>
    </ThemeProvider>
  )
}

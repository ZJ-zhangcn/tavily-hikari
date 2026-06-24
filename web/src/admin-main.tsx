import React from 'react'
import ReactDOM from 'react-dom/client'
import AdminDashboard from './AdminDashboard'
import { installDemoRuntime } from './api/demo'
import { TooltipProvider } from './components/ui/tooltip'
import { LanguageProvider } from './i18n'
import { bootstrapOfflineShellDocument, normalizeAdminShellPath, registerPwaServiceWorker } from './pwa/runtime'
import { ThemeProvider } from './theme'
import './index.css'

installDemoRuntime()
normalizeAdminShellPath()
bootstrapOfflineShellDocument()
void registerPwaServiceWorker('admin')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <ThemeProvider>
        <TooltipProvider delayDuration={120} skipDelayDuration={250}>
          <AdminDashboard />
        </TooltipProvider>
      </ThemeProvider>
    </LanguageProvider>
  </React.StrictMode>,
)

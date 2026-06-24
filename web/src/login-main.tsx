import React from 'react'
import ReactDOM from 'react-dom/client'
import { installDemoRuntime } from './api/demo'
import { TooltipProvider } from './components/ui/tooltip'
import { LanguageProvider } from './i18n'
import AdminLogin from './pages/AdminLogin'
import { bootstrapOfflineShellDocument, registerPwaServiceWorker } from './pwa/runtime'
import { ThemeProvider } from './theme'
import './index.css'

installDemoRuntime()
bootstrapOfflineShellDocument()
void registerPwaServiceWorker('public')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <ThemeProvider>
        <TooltipProvider delayDuration={120} skipDelayDuration={250}>
          <AdminLogin />
        </TooltipProvider>
      </ThemeProvider>
    </LanguageProvider>
  </React.StrictMode>,
)

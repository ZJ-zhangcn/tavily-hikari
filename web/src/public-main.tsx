import React from 'react'
import ReactDOM from 'react-dom/client'
import { installDemoRuntime } from './api/demo'
import { TooltipProvider } from './components/ui/tooltip'
import { LanguageProvider } from './i18n'
import NotFoundFallbackPreview from './components/NotFoundFallbackPreview'
import { bootstrapOfflineShellDocument, registerPwaServiceWorker } from './pwa/runtime'
import PublicHome from './PublicHome'
import { ThemeProvider } from './theme'
import './index.css'

installDemoRuntime()
bootstrapOfflineShellDocument()

const isPublicHomePath = window.location.pathname === '/' || window.location.pathname === '/index.html'
void registerPwaServiceWorker('public')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <ThemeProvider>
        <TooltipProvider delayDuration={120} skipDelayDuration={250}>
          {isPublicHomePath ? <PublicHome /> : <NotFoundFallbackPreview originalPath={window.location.pathname} />}
        </TooltipProvider>
      </ThemeProvider>
    </LanguageProvider>
  </React.StrictMode>,
)

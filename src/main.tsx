import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { registerSW } from 'virtual:pwa-register'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@core/auth/AuthProvider'
import { ThemeProvider } from '@common/theme/ThemeProvider'
import '@core/firebase/app'
import '@core/firebase/firestore'
import { i18n } from '@common/i18n'
import '@common/styles/main.scss'
import App from '@core/app/App'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ThemeProvider>
      </I18nextProvider>
    </BrowserRouter>
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { ui } from '@clerk/ui'
import { dark } from '@clerk/ui/themes'
import './style.css'
import App from './App'
import { ThemeProvider, useTheme } from './components/ThemeToggle.tsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key")
}

function AppWithClerk() {
  const { theme } = useTheme()
  
  return (
    <ClerkProvider 
      key={theme}
      publishableKey={PUBLISHABLE_KEY}
      // @ts-ignore - version mismatch between @clerk/react and @clerk/ui
      ui={ui}
      appearance={{
        theme: theme === 'dark' ? dark : undefined,
      }}
    >
      <App />
    </ClerkProvider>
  )
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <ThemeProvider>
      <AppWithClerk />
    </ThemeProvider>
  </StrictMode>,
)

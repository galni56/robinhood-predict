import '@/solana/polyfills'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SolanaProvider } from '@/solana/SolanaProvider'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient()

// HashRouter (not BrowserRouter): GitHub Pages is static file hosting with no
// server-side rewrite rule, so a deep link or refresh on a nested route would
// 404 with real paths. Hash routing keeps the routed part after `#`.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SolanaProvider>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <App />
        </HashRouter>
      </QueryClientProvider>
    </SolanaProvider>
  </StrictMode>,
)

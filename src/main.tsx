import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '@/chain/config'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient()

// HashRouter (not BrowserRouter): GitHub Pages is static file hosting with no
// server-side rewrite rule, so a deep link or refresh on e.g. /markets/xyz
// would 404 with real paths. Hash routing keeps the routed part after `#`,
// which never leaves the browser — no server involvement needed.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <App />
        </HashRouter>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)

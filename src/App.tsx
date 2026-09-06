import { Navigate, Route, Routes } from 'react-router-dom'
import { ChainEngine } from '@/components/ChainEngine'
import { DisclaimerBanner } from '@/components/DisclaimerBanner'
import { Navbar } from '@/components/Navbar'
import { AuroraBackground } from '@/components/AuroraBackground'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AddressDetailPage } from '@/pages/AddressDetailPage'
import { ArchivePage } from '@/pages/ArchivePage'
import { BlockDetailPage } from '@/pages/BlockDetailPage'
import { CreateMarketPage } from '@/pages/CreateMarketPage'
import { ExplorerPage } from '@/pages/ExplorerPage'
import { LeaderboardPage } from '@/pages/LeaderboardPage'
import { LoginPage } from '@/pages/LoginPage'
import { MarketDetailPage } from '@/pages/MarketDetailPage'
import { MarketsPage } from '@/pages/MarketsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { OnchainCreateMarketPage } from '@/pages/OnchainCreateMarketPage'
import { OnchainMarketPage } from '@/pages/OnchainMarketPage'
import { OnchainMarketsListPage } from '@/pages/OnchainMarketsListPage'
import { PortfolioPage } from '@/pages/PortfolioPage'
import { PublicProfilePage } from '@/pages/PublicProfilePage'
import { RegisterPage } from '@/pages/RegisterPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TxDetailPage } from '@/pages/TxDetailPage'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col relative z-10">
      <AuroraBackground />
      <ChainEngine />
      <DisclaimerBanner />
      <Navbar />

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/markets" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/onchain" element={<OnchainMarketsListPage />} />
          <Route path="/onchain/create" element={<OnchainCreateMarketPage />} />
          <Route path="/onchain/:id" element={<OnchainMarketPage />} />

          {/* Browsing is public — login is only required to place a bet,
              create a market, or view account-specific pages (see BetForm). */}
          <Route path="/markets" element={<MarketsPage />} />
          <Route path="/markets/:marketId" element={<MarketDetailPage />} />
          <Route
            path="/markets/create"
            element={
              <ProtectedRoute>
                <CreateMarketPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portfolio"
            element={
              <ProtectedRoute>
                <PortfolioPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/archive" element={<ArchivePage />} />
          <Route path="/u/:userId" element={<PublicProfilePage />} />
          <Route path="/explorer" element={<ExplorerPage />} />
          <Route path="/explorer/block/:number" element={<BlockDetailPage />} />
          <Route path="/explorer/tx/:hash" element={<TxDetailPage />} />
          <Route path="/explorer/address/:address" element={<AddressDetailPage />} />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  )
}

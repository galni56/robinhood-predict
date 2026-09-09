import { Route, Routes } from 'react-router-dom'
import { ChainEngine } from '@/components/ChainEngine'
import { DisclaimerBanner } from '@/components/DisclaimerBanner'
import { Footer } from '@/components/Footer'
import { Navbar } from '@/components/Navbar'
import { OnchainLayout } from '@/components/OnchainLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AddressDetailPage } from '@/pages/AddressDetailPage'
import { ArchivePage } from '@/pages/ArchivePage'
import { BlockDetailPage } from '@/pages/BlockDetailPage'
import { CreateMarketPage } from '@/pages/CreateMarketPage'
import { ExplorerPage } from '@/pages/ExplorerPage'
import { LandingPage } from '@/pages/LandingPage'
import { LeaderboardPage } from '@/pages/LeaderboardPage'
import { LoginPage } from '@/pages/LoginPage'
import { MarketDetailPage } from '@/pages/MarketDetailPage'
import { MarketsPage } from '@/pages/MarketsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { OnchainCreateMarketPage } from '@/pages/OnchainCreateMarketPage'
import { OnchainLeaderboardPage } from '@/pages/OnchainLeaderboardPage'
import { OnchainMarketPage } from '@/pages/OnchainMarketPage'
import { OnchainMarketsListPage } from '@/pages/OnchainMarketsListPage'
import { OnchainPortfolioPage } from '@/pages/OnchainPortfolioPage'
import { PortfolioPage } from '@/pages/PortfolioPage'
import { PublicProfilePage } from '@/pages/PublicProfilePage'
import { RegisterPage } from '@/pages/RegisterPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TermsPage } from '@/pages/TermsPage'
import { TxDetailPage } from '@/pages/TxDetailPage'
import { WhitepaperPage } from '@/pages/WhitepaperPage'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <ChainEngine />
      <DisclaimerBanner />
      <Navbar />

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/whitepaper" element={<WhitepaperPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/onchain" element={<OnchainLayout />}>
            <Route index element={<OnchainMarketsListPage />} />
            <Route path="create" element={<OnchainCreateMarketPage />} />
            <Route path="portfolio" element={<OnchainPortfolioPage />} />
            <Route path="leaderboard" element={<OnchainLeaderboardPage />} />
            <Route path=":id" element={<OnchainMarketPage />} />
          </Route>

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
          {/* Public — shows a log-in/sign-up CTA itself when logged out. */}
          <Route path="/portfolio" element={<PortfolioPage />} />
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

      <Footer />
    </div>
  )
}

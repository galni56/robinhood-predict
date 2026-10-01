import { Suspense, lazy } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { AnimatedBackground } from '@/components/AnimatedBackground'
import { ChainEngine } from '@/components/ChainEngine'
import { DisclaimerBanner } from '@/components/DisclaimerBanner'
import { Footer } from '@/components/Footer'
import { Navbar } from '@/components/Navbar'
import { OnchainLayout } from '@/components/OnchainLayout'
import { PageSkeleton } from '@/components/PageSkeleton'
import { RealNavbar } from '@/components/RealNavbar'
import { TickerTape } from '@/components/TickerTape'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { isLocalAssetRace } from '@/chain/config'
import { AssetRaceLiveDisplayProvider } from '@/chain/useAssetRaceLiveDisplay'

// Every page is its own lazy chunk: the initial download carries only the
// app shell (navbars, providers, this router) and the first visited page.
// Heavy dependencies (recharts, explorer views, the mock demo) load when a
// route that uses them is actually opened.
const OnchainLandingPage = lazy(() => import('@/pages/OnchainLandingPage').then((m) => ({ default: m.OnchainLandingPage })))
const LandingPage = lazy(() => import('@/pages/LandingPage').then((m) => ({ default: m.LandingPage })))
const WhitepaperPage = lazy(() => import('@/pages/WhitepaperPage').then((m) => ({ default: m.WhitepaperPage })))
const RoadmapPage = lazy(() => import('@/pages/RoadmapPage').then((m) => ({ default: m.RoadmapPage })))
const TermsPage = lazy(() => import('@/pages/TermsPage').then((m) => ({ default: m.TermsPage })))
const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('@/pages/RegisterPage').then((m) => ({ default: m.RegisterPage })))
const OnchainMarketsListPage = lazy(() => import('@/pages/OnchainMarketsListPage').then((m) => ({ default: m.OnchainMarketsListPage })))
const OnchainCreateMarketPage = lazy(() => import('@/pages/OnchainCreateMarketPage').then((m) => ({ default: m.OnchainCreateMarketPage })))
const OnchainPortfolioPage = lazy(() => import('@/pages/OnchainPortfolioPage').then((m) => ({ default: m.OnchainPortfolioPage })))
const OnchainLeaderboardPage = lazy(() => import('@/pages/OnchainLeaderboardPage').then((m) => ({ default: m.OnchainLeaderboardPage })))
const OnchainArchivePage = lazy(() => import('@/pages/OnchainArchivePage').then((m) => ({ default: m.OnchainArchivePage })))
const AssetPriceChartPage = lazy(() => import('@/pages/AssetPriceChartPage').then((m) => ({ default: m.AssetPriceChartPage })))
const OnchainRacesListPage = lazy(() => import('@/pages/OnchainRacesListPage').then((m) => ({ default: m.OnchainRacesListPage })))
const OnchainCreateRacePage = lazy(() => import('@/pages/OnchainCreateRacePage').then((m) => ({ default: m.OnchainCreateRacePage })))
const OnchainRacePage = lazy(() => import('@/pages/OnchainRacePage').then((m) => ({ default: m.OnchainRacePage })))
const OnchainArenasListPage = lazy(() => import('@/pages/OnchainArenasListPage').then((m) => ({ default: m.OnchainArenasListPage })))
const OnchainCreateArenaPage = lazy(() => import('@/pages/OnchainCreateArenaPage').then((m) => ({ default: m.OnchainCreateArenaPage })))
const OnchainArenaPage = lazy(() => import('@/pages/OnchainArenaPage').then((m) => ({ default: m.OnchainArenaPage })))
const OnchainLegacyMarketsPage = lazy(() => import('@/pages/OnchainLegacyMarketsPage').then((m) => ({ default: m.OnchainLegacyMarketsPage })))
const OnchainMarketPage = lazy(() => import('@/pages/OnchainMarketPage').then((m) => ({ default: m.OnchainMarketPage })))
const MarketsPage = lazy(() => import('@/pages/MarketsPage').then((m) => ({ default: m.MarketsPage })))
const MarketDetailPage = lazy(() => import('@/pages/MarketDetailPage').then((m) => ({ default: m.MarketDetailPage })))
const CreateMarketPage = lazy(() => import('@/pages/CreateMarketPage').then((m) => ({ default: m.CreateMarketPage })))
const PortfolioPage = lazy(() => import('@/pages/PortfolioPage').then((m) => ({ default: m.PortfolioPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const LeaderboardPage = lazy(() => import('@/pages/LeaderboardPage').then((m) => ({ default: m.LeaderboardPage })))
const ArchivePage = lazy(() => import('@/pages/ArchivePage').then((m) => ({ default: m.ArchivePage })))
const PublicProfilePage = lazy(() => import('@/pages/PublicProfilePage').then((m) => ({ default: m.PublicProfilePage })))
const ExplorerPage = lazy(() => import('@/pages/ExplorerPage').then((m) => ({ default: m.ExplorerPage })))
const BlockDetailPage = lazy(() => import('@/pages/BlockDetailPage').then((m) => ({ default: m.BlockDetailPage })))
const TxDetailPage = lazy(() => import('@/pages/TxDetailPage').then((m) => ({ default: m.TxDetailPage })))
const AddressDetailPage = lazy(() => import('@/pages/AddressDetailPage').then((m) => ({ default: m.AddressDetailPage })))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

export default function App() {
  const { pathname } = useLocation()
  // Real mode ("/" and everything under /onchain) gets its own full-size
  // navbar (RealNavbar) pointed at real routes - the mock Navbar's links
  // and its Log in/Sign up don't apply to a wallet-based flow. Whitepaper
  // and Terms are shared/neutral pages linked from both modes, but default
  // to real mode too -- a real-mode visitor clicking through to either used
  // to land on the mock navbar with no way back to real "/", only a route
  // to mock pages ("testnet"). Mock-mode visitors can still get back to the
  // demo via RealNavbar's own "Demo" link.
  const isRealMode = pathname === '/' || pathname.startsWith('/onchain') || pathname === '/roadmap' || pathname === '/whitepaper' || pathname === '/terms'
  const isLocalRaceRoute = isLocalAssetRace && pathname.startsWith('/onchain/races')

  return (
    <AssetRaceLiveDisplayProvider enabled={isRealMode}>
      <div className="min-h-screen flex flex-col">
        <AnimatedBackground />
        <ChainEngine />
        <DisclaimerBanner />
        {isRealMode ? (
          <>
            <RealNavbar />
            {!isLocalRaceRoute && <TickerTape />}
          </>
        ) : (
          <Navbar />
        )}

        <main className="flex-1">
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
            <Route path="/" element={<OnchainLandingPage />} />
            <Route path="/demo" element={<LandingPage />} />
            <Route path="/whitepaper" element={<WhitepaperPage />} />
            <Route path="/roadmap" element={<RoadmapPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/onchain" element={<OnchainLayout />}>
              <Route index element={<OnchainMarketsListPage />} />
              <Route path="create" element={<OnchainCreateMarketPage />} />
              <Route path="portfolio" element={<OnchainPortfolioPage />} />
              <Route path="leaderboard" element={<OnchainLeaderboardPage />} />
              <Route path="archive" element={<OnchainArchivePage />} />
              <Route path="charts/:symbol" element={<AssetPriceChartPage />} />
              <Route path="races" element={<OnchainRacesListPage />} />
              <Route path="races/create" element={<OnchainCreateRacePage />} />
              <Route path="races/:raceId" element={<OnchainRacePage />} />
              <Route path="arenas" element={<OnchainArenasListPage />} />
              <Route path="arenas/create" element={<OnchainCreateArenaPage />} />
              <Route path="arenas/:arenaId" element={<OnchainArenaPage />} />
              <Route path="legacy" element={<OnchainLegacyMarketsPage />} />
              <Route path="legacy/races/:raceId" element={<OnchainRacePage legacy />} />
              <Route path="legacy/arenas/:arenaId" element={<OnchainArenaPage legacy />} />
              <Route path="legacy/:id" element={<OnchainMarketPage legacy />} />
              <Route path=":id" element={<OnchainMarketPage />} />
            </Route>

            {/* Browsing is public - login is only required to place a bet,
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
            {/* Public - shows a log-in/sign-up CTA itself when logged out. */}
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
          </Suspense>
        </main>

        <Footer />
      </div>
    </AssetRaceLiveDisplayProvider>
  )
}

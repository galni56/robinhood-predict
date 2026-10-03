import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AnimatedBackground } from '@/components/AnimatedBackground'
import { DisclaimerBanner } from '@/components/DisclaimerBanner'
import { Footer } from '@/components/Footer'
import { OnchainLayout } from '@/components/OnchainLayout'
import { PageSkeleton } from '@/components/PageSkeleton'
import { RealNavbar } from '@/components/RealNavbar'

// Every page is its own lazy chunk: the initial download carries only the
// app shell (navbar, providers, this router) and the first visited page.
const OnchainLandingPage = lazy(() => import('@/pages/OnchainLandingPage').then((m) => ({ default: m.OnchainLandingPage })))
const WhitepaperPage = lazy(() => import('@/pages/WhitepaperPage').then((m) => ({ default: m.WhitepaperPage })))
const RoadmapPage = lazy(() => import('@/pages/RoadmapPage').then((m) => ({ default: m.RoadmapPage })))
const TermsPage = lazy(() => import('@/pages/TermsPage').then((m) => ({ default: m.TermsPage })))
const OnchainPortfolioPage = lazy(() => import('@/pages/OnchainPortfolioPage').then((m) => ({ default: m.OnchainPortfolioPage })))
const OnchainLeaderboardPage = lazy(() => import('@/pages/OnchainLeaderboardPage').then((m) => ({ default: m.OnchainLeaderboardPage })))
const OnchainArchivePage = lazy(() => import('@/pages/OnchainArchivePage').then((m) => ({ default: m.OnchainArchivePage })))
const OnchainRacesListPage = lazy(() => import('@/pages/OnchainRacesListPage').then((m) => ({ default: m.OnchainRacesListPage })))
const OnchainCreateRacePage = lazy(() => import('@/pages/OnchainCreateRacePage').then((m) => ({ default: m.OnchainCreateRacePage })))
const OnchainRacePage = lazy(() => import('@/pages/OnchainRacePage').then((m) => ({ default: m.OnchainRacePage })))
const OnchainArenasListPage = lazy(() => import('@/pages/OnchainArenasListPage').then((m) => ({ default: m.OnchainArenasListPage })))
const OnchainCreateArenaPage = lazy(() => import('@/pages/OnchainCreateArenaPage').then((m) => ({ default: m.OnchainCreateArenaPage })))
const OnchainArenaPage = lazy(() => import('@/pages/OnchainArenaPage').then((m) => ({ default: m.OnchainArenaPage })))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <AnimatedBackground />
      <DisclaimerBanner />
      <RealNavbar />

      <main className="flex-1">
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/" element={<OnchainLandingPage />} />
            <Route path="/whitepaper" element={<WhitepaperPage />} />
            <Route path="/roadmap" element={<RoadmapPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/onchain" element={<OnchainLayout />}>
              {/* Prediction Markets were retired with the move to Solana. */}
              <Route index element={<Navigate to="/onchain/races" replace />} />
              <Route path="portfolio" element={<OnchainPortfolioPage />} />
              <Route path="leaderboard" element={<OnchainLeaderboardPage />} />
              <Route path="archive" element={<OnchainArchivePage />} />
              <Route path="races" element={<OnchainRacesListPage />} />
              <Route path="races/create" element={<OnchainCreateRacePage />} />
              <Route path="races/:raceId" element={<OnchainRacePage />} />
              <Route path="arenas" element={<OnchainArenasListPage />} />
              <Route path="arenas/create" element={<OnchainCreateArenaPage />} />
              <Route path="arenas/:arenaId" element={<OnchainArenaPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>

      <Footer />
    </div>
  )
}

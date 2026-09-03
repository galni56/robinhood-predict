import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="text-5xl font-semibold text-white/20 mb-2">404</div>
      <p className="text-white/50 mb-4">Такой страницы нет.</p>
      <Link to="/markets" className="text-emerald-400 hover:underline text-sm">
        На главную
      </Link>
    </div>
  )
}

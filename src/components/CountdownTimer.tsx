import { useEffect, useState } from 'react'
import { formatCountdown } from '@/lib/format'

export function CountdownTimer({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return <span>{formatCountdown(deadline - now)}</span>
}

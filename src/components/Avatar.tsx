import { initialsFor } from '@/lib/avatar'

export function Avatar({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold shrink-0 text-black/80"
      style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}
    >
      {initialsFor(name)}
    </div>
  )
}

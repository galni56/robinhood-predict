import { Area, AreaChart, ResponsiveContainer, ReferenceLine, Tooltip, YAxis } from 'recharts'
import { formatUsd } from '@/lib/format'
import type { PricePoint } from '@/types'

export function PriceChart({
  data,
  target,
  height = 220,
  color = '#34d399',
}: {
  data: PricePoint[]
  target?: number
  height?: number
  color?: string
}) {
  const prices = data.map((d) => d.price)
  const min = Math.min(...prices, target ?? Infinity)
  const max = Math.max(...prices, target ?? -Infinity)
  const pad = (max - min) * 0.1 || 1

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis domain={[min - pad, max + pad]} hide />
        {target != null && (
          <ReferenceLine
            y={target}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            label={{ value: `$${target}`, position: 'right', fill: '#f59e0b', fontSize: 11 }}
          />
        )}
        <Tooltip
          contentStyle={{ background: '#16171d', border: '1px solid #2e303a', borderRadius: 8, fontSize: 12 }}
          labelFormatter={(t) => new Date(t as number).toLocaleTimeString()}
          formatter={(v) => [formatUsd(v as number), 'price']}
        />
        <Area type="monotone" dataKey="price" stroke={color} strokeWidth={2} fill="url(#priceFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function Sparkline({ data, height = 48, color = '#34d399' }: { data: PricePoint[]; height?: number; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Area type="monotone" dataKey="price" stroke={color} strokeWidth={1.5} fill="url(#sparkFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

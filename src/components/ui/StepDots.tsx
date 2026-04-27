import { OP_META } from '../../data/meta'
import type { OpCode } from '../../types'

interface Props {
  steps: OpCode[]
}

export function StepDots({ steps }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      {steps.map((op, i) => {
        const color = OP_META[op]?.color ?? '#8E8E8E'
        return (
          <span
            key={i}
            title={op}
            style={{ background: color, width: 8, height: 8, borderRadius: 999, display: 'inline-block' }}
          />
        )
      })}
    </div>
  )
}

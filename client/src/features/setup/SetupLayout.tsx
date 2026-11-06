import { clsx } from 'clsx'
import { Outlet, useMatches } from 'react-router'
import { FocusLayout } from '../../layouts/FocusLayout.tsx'

export type SetupHandle = { setupStep: number }

const steps = ['About you', 'Who you care for', 'Anyone else']

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="text-small">
      <ol aria-label="Setup progress" className="flex gap-2">
        {steps.map((label, index) => {
          const step = index + 1
          return (
            <li key={label} aria-current={step === current ? 'step' : undefined} className="min-w-0 flex-1">
              <div className={clsx('h-1.5 rounded-full', step <= current ? 'bg-primary' : 'bg-line')} />
              {/* Phones show only the current step's name, below, so labels never wrap. */}
              <p
                className={clsx('mt-2 max-sm:sr-only', step === current ? 'font-semibold text-primary' : 'text-muted')}
              >
                {step} · {label}
                {step < current && <span className="sr-only"> (done)</span>}
              </p>
            </li>
          )
        })}
      </ol>
      <p aria-hidden className="mt-2 font-semibold text-primary sm:hidden">
        Step {current} of {steps.length} · {steps[current - 1]}
      </p>
    </div>
  )
}

export function SetupLayout() {
  const current =
    useMatches()
      .map((match) => (match.handle as SetupHandle | undefined)?.setupStep)
      .find((step) => step !== undefined) ?? 1
  return (
    <FocusLayout>
      <StepIndicator current={current} />
      <div className="mt-8">
        <Outlet />
      </div>
    </FocusLayout>
  )
}

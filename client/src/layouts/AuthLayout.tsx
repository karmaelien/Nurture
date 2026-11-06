import { Check } from 'lucide-react'
import { Link, Outlet } from 'react-router'
import { Logo } from '../components/ui/Logo.tsx'
import { ThemeSwitch } from '../components/ui/ThemeSwitch.tsx'

const benefits = [
  'Medications, appointments, and documents in one shared place',
  "Everyone sees what's been done and what's next",
  'A heads-up when care costs start to rise',
]

export function AuthLayout() {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="flex flex-col bg-brand px-4 py-4 text-brand-foreground sm:px-8 lg:sticky lg:top-0 lg:h-dvh lg:px-12 lg:py-10">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="rounded-control" aria-label="Nurture home">
            <Logo />
          </Link>
          <ThemeSwitch onBrand />
        </div>
        <div className="mt-auto hidden lg:block">
          <p className="max-w-[16ch] font-display text-[2.5rem] leading-[1.05] font-bold tracking-[-0.025em]">
            Everything your family needs to care for someone, in one place.
          </p>
          <ul className="mt-8 grid gap-3 text-brand-foreground/85">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex gap-3">
                <Check className="mt-1 size-[18px] flex-none" aria-hidden />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="flex justify-center px-4 py-10 sm:px-8 sm:py-16 lg:items-center lg:py-12">
        <div className="w-full max-w-[400px]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

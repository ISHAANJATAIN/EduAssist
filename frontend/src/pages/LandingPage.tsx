import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useAuthStore } from '@/store/authStore'

const shell = 'mx-auto w-full max-w-[1180px] px-5 sm:px-8'

const inkButton =
  'group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-action px-6 text-sm font-semibold text-on-action shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition duration-200 hover:-translate-y-0.5 hover:bg-action-hover hover:shadow-[0_14px_28px_-16px_rgb(var(--shadow-rgb)/0.65)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper'

const quietLink =
  'group inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-ink underline decoration-ink/25 decoration-1 underline-offset-4 transition duration-200 hover:bg-ink/5 hover:decoration-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper'

const label =
  'font-label text-[11px] uppercase tracking-[0.22em] text-gold'

function Arrow({ className = '' }: { className?: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M3 8h9M8.75 4.25 12.5 8l-3.75 3.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.disconnect()
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -6% 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`reveal${visible ? ' is-visible' : ''}${className ? ` ${className}` : ''}`}
      style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  )
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.25 8.5 6.5 11.75 12.75 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SectionHeading({
  index,
  title,
  children,
}: {
  index: string
  title: ReactNode
  children?: ReactNode
}) {
  return (
    <Reveal>
      <div className="max-w-[38rem]">
        <p className={label}>
          {index} <span className="mx-2 text-gold/50">/</span> EduAssist
        </p>
        <h2 className="font-display mt-4 text-[clamp(1.9rem,3.4vw,2.9rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-ink">
          {title}
        </h2>
        {children ? (
          <p className="mt-4 text-[16px] leading-[1.7] text-neutral-600">{children}</p>
        ) : null}
      </div>
    </Reveal>
  )
}

function HeroPanel() {
  return (
    <div className="rise rise-2 relative mx-auto w-full max-w-[500px] px-1 sm:px-0">
      <div
        aria-hidden="true"
        className="absolute -inset-10 rounded-[40px] bg-[radial-gradient(closest-side,rgba(79,70,229,0.14),rgba(138,106,59,0.08),transparent)] blur-2xl"
      />

      <div className="relative -rotate-[0.6deg] rounded-2xl border border-ink/10 bg-paper-card p-5 shadow-[0_36px_70px_-38px_rgb(var(--shadow-rgb)/0.45)] sm:p-6">
        <div className="flex items-center justify-between border-b border-ink/10 pb-4">
          <div className="flex items-center gap-2" aria-hidden="true">
            <span className="h-2 w-2 rounded-full bg-ink/15" />
            <span className="h-2 w-2 rounded-full bg-ink/15" />
            <span className="h-2 w-2 rounded-full bg-ink/15" />
          </div>
          <p className="font-label ml-3 truncate text-[10px] uppercase tracking-[0.16em] text-ink/40">
            Operating Systems · Week 4
          </p>
        </div>

        <div className="mt-5 flex justify-end">
          <p className="max-w-[15rem] rounded-2xl rounded-br-md bg-panel px-4 py-3 text-sm leading-relaxed text-on-panel">
            Why does thrashing happen?
          </p>
        </div>

        <div className="mt-4 max-w-[22rem]">
          <p className="text-[13.5px] leading-[1.65] text-neutral-700">
            Thrashing happens when the working set no longer fits in physical
            memory, so the system spends more time paging than executing.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/25 bg-brand-500/10 px-2.5 py-1 font-label text-[10px] tracking-wide text-brand-500">
              <span className="h-1 w-1 rounded-full bg-brand-500" />
              Slide 4
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 font-label text-[10px] tracking-wide text-success-text">
              <Check />
              Grounded in your notes
            </span>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-ink/10 pt-4">
          <p className="font-label text-[10px] uppercase tracking-[0.14em] text-ink/40">
            2 sources read · 1.4s
          </p>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink/60">
            Ask again <Arrow />
          </span>
        </div>
      </div>

      <div className="absolute -bottom-14 -left-4 hidden w-[196px] rotate-[2.5deg] rounded-xl border border-[#FFFDF7]/10 bg-panel p-4 text-on-panel shadow-[0_24px_50px_-24px_rgb(var(--shadow-rgb)/0.6)] sm:block">
        <p className="font-label text-[9px] uppercase tracking-[0.2em] text-on-panel/40">
          Mastery
        </p>
        <p className="font-display mt-1 text-[19px] leading-tight">Virtual memory</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper-card/10">
          <div className="h-full w-[84%] rounded-full bg-gold-light" />
        </div>
        <p className="mt-2 text-[10px] tracking-wide text-on-panel/50">
          84% · strong
        </p>
      </div>

      <div className="absolute -top-12 -right-3 hidden rotate-[2deg] rounded-xl border border-ink/10 bg-paper-card px-4 py-3 shadow-[0_18px_36px_-20px_rgb(var(--shadow-rgb)/0.5)] sm:block">
        <p className="font-label text-[9px] uppercase tracking-[0.18em] text-ink/40">
          Next up
        </p>
        <p className="mt-0.5 text-[13px] font-semibold text-ink">
          Deadlock · 25 min
        </p>
      </div>
    </div>
  )
}

const problems = [
  {
    title: 'Answers without sources',
    body: 'A confident paragraph you cannot check is a guess with better grammar.',
  },
  {
    title: 'Practice that ignores your syllabus',
    body: 'Generic questions cannot tell you what your exam is actually likely to ask.',
  },
  {
    title: 'Revision by vibes',
    body: 'Re-reading feels productive. It rarely shows you what is still missing.',
  },
]

const benefits = [
  {
    index: '01',
    title: 'Cited answers',
    body: 'Every response points back to the slide or page it came from. When your material does not cover something, EduAssist says so instead of inventing it.',
  },
  {
    index: '02',
    title: 'Practice from your pages',
    body: 'Quizzes and flashcards built from your own lectures, with explanations that trace back to the source paragraph.',
  },
  {
    index: '03',
    title: 'A map of what you know',
    body: 'Per-topic mastery from real attempts, plus rule-based next steps: what to review now, what to leave alone.',
  },
  {
    index: '04',
    title: 'A plan that fits your week',
    body: 'A constraint-solved schedule around your exam date, available hours, prerequisites and revision time.',
  },
]

const steps = [
  {
    index: '01',
    title: 'Add your material',
    body: 'Upload lecture slides, notes or readings. Topics and prerequisites are extracted for you.',
  },
  {
    index: '02',
    title: 'Ask and practise',
    body: 'Get cited answers, then turn the same pages into quizzes and flashcards.',
  },
  {
    index: '03',
    title: 'Follow the plan',
    body: 'The planner turns weak topics and free hours into a day-by-day schedule.',
  },
]

export function LandingPage() {
  const token = useAuthStore((state) => state.token)

  if (token) return <Navigate to="/chat" replace />

  return (
    <div className="landing relative min-h-screen overflow-x-hidden bg-paper text-ink">
      <div aria-hidden="true" className="landing-grain pointer-events-none fixed inset-0 z-50" />

      <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/85 backdrop-blur-md">
        <div className={`${shell} flex h-16 items-center justify-between`}>
          <Link to="/" aria-label="EduAssist home" className="rounded-sm">
            <Logo size={26} />
          </Link>

          <nav
            aria-label="Landing"
            className="hidden items-center gap-8 font-label text-[10px] uppercase tracking-[0.2em] text-ink/50 md:flex"
          >
            <a href="#why" className="transition hover:text-ink">
              Why
            </a>
            <a href="#benefits" className="transition hover:text-ink">
              Benefits
            </a>
            <a href="#method" className="transition hover:text-ink">
              Method
            </a>
            <a href="#privacy" className="transition hover:text-ink">
              Privacy
            </a>
          </nav>

          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle className="mr-1" />
            <Link
              to="/login"
              className="rounded-full px-3 py-2 text-sm font-medium text-ink/70 transition hover:text-ink"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="inline-flex h-9 items-center rounded-full bg-action px-4 text-[13px] font-semibold text-on-action transition duration-200 hover:-translate-y-0.5 hover:bg-action-hover hover:shadow-[0_10px_20px_-12px_rgb(var(--shadow-rgb)/0.65)] active:translate-y-0"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className={`${shell} grid gap-16 pb-24 pt-14 lg:grid-cols-[1.04fr_0.96fr] lg:items-center lg:gap-10 lg:pb-32 lg:pt-24`}>
          <div className="rise">
            <p className={`${label} flex items-center gap-3`}>
              <span className="h-px w-8 bg-gold/50" aria-hidden="true" />
              BMU CSE · Group 10
            </p>

            <h1 className="font-display mt-6 text-[clamp(2.7rem,5.4vw,4.5rem)] font-semibold leading-[0.97] tracking-[-0.035em]">
              Your lectures, turned into answers you can{' '}
              <em className="italic text-brand-500">trust</em>.
            </h1>

            <p className="mt-7 max-w-[34rem] text-[17px] leading-[1.72] text-neutral-600">
              EduAssist reads your slides, notes and readings — then answers with
              citations, builds practice from the same pages, tracks what you
              actually know, and plans the weeks before your exam.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link to="/register" className={inkButton}>
                Start studying free{' '}
                <Arrow className="transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <a href="#method" className={quietLink}>
                See how it works{' '}
                <Arrow className="transition-transform duration-200 group-hover:translate-x-1" />
              </a>
            </div>

            <p className="mt-9 font-label text-[10px] uppercase tracking-[0.18em] text-ink/40">
              Local-first · Free · One course at a time
            </p>
          </div>

          <HeroPanel />
        </section>

        <section id="why" className="border-y border-ink/10 bg-paper-deep/60">
          <div className={`${shell} py-20 lg:py-24`}>
            <SectionHeading
              index="01"
              title={
                <>
                  Generic AI knows everything.
                  <br />
                  <span className="text-ink/40">
                    Your course is the one thing it does not.
                  </span>
                </>
              }
            />

            <div className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-8">
              {problems.map((problem, i) => (
                <div
                  key={problem.title}
                  className="border-t border-ink/15 pt-5"
                >
                  <Reveal delay={i * 90}>
                    <p className="font-label text-[10px] tracking-[0.2em] text-gold">
                      0{i + 1}
                    </p>
                    <h3 className="font-display mt-3 text-[21px] leading-snug">
                      {problem.title}
                    </h3>
                    <p className="mt-2.5 text-[14.5px] leading-[1.65] text-neutral-600">
                      {problem.body}
                    </p>
                  </Reveal>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="benefits" className={`${shell} py-20 lg:py-28`}>
          <SectionHeading index="02" title="Four things it actually does.">
            One workspace instead of five tabs — every part working from the same
            source material.
          </SectionHeading>

          <div className="mt-14 grid gap-4 sm:grid-cols-2">
            {benefits.map((benefit, i) => (
              <article
                key={benefit.index}
                className="group rounded-2xl border border-ink/10 bg-paper-card p-7 transition duration-300 hover:-translate-y-1 hover:border-ink/25 hover:shadow-[0_24px_48px_-32px_rgb(var(--shadow-rgb)/0.4)] sm:p-8"
              >
                <Reveal delay={i * 70}>
                  <div className="flex items-baseline justify-between">
                    <p className="font-label text-[10px] tracking-[0.2em] text-gold">
                      {benefit.index}
                    </p>
                    <span className="h-px w-8 bg-ink/10 transition group-hover:bg-gold/50" aria-hidden="true" />
                  </div>
                  <h3 className="font-display mt-5 text-[24px] leading-tight tracking-[-0.02em]">
                    {benefit.title}
                  </h3>
                  <p className="mt-3 text-[14.5px] leading-[1.68] text-neutral-600">
                    {benefit.body}
                  </p>
                </Reveal>
              </article>
            ))}
          </div>
        </section>

        <section id="method" className="border-y border-ink/10 bg-paper-deep/60">
          <div className={`${shell} py-20 lg:py-28`}>
            <SectionHeading index="03" title="Three steps, then it is a habit." />

            <ol className="mt-14 grid gap-12 sm:grid-cols-3 sm:gap-8">
              {steps.map((step, i) => (
                <li key={step.index} className="relative">
                  <Reveal delay={i * 110}>
                    <div className="flex items-center gap-4">
                      <span className="font-display text-[44px] leading-none text-ink/20">
                        {step.index}
                      </span>
                      <span className="h-px flex-1 bg-ink/15" aria-hidden="true" />
                    </div>
                    <h3 className="mt-6 text-[17px] font-semibold">{step.title}</h3>
                    <p className="mt-2 text-[14.5px] leading-[1.65] text-neutral-600">
                      {step.body}
                    </p>
                    {i < steps.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="absolute -right-4 top-4 hidden text-gold/50 sm:block"
                      >
                        <Arrow />
                      </span>
                    ) : null}
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="privacy" className="bg-panel text-on-panel">
          <div className={`${shell} grid gap-12 py-20 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:py-28`}>
            <div>
              <Reveal>
                <p className="font-label text-[11px] uppercase tracking-[0.22em] text-gold-light">
                  04 / Privacy
                </p>
                <h2 className="font-display mt-4 text-[clamp(1.9rem,3.4vw,2.9rem)] font-semibold leading-[1.08] tracking-[-0.03em]">
                  Your material stays yours.
                </h2>
                <p className="mt-4 max-w-[28rem] text-[15px] leading-[1.7] text-on-panel/60">
                  EduAssist is built to run on your machine, not someone else&apos;s
                  server.
                </p>
              </Reveal>
            </div>

            <ul className="grid gap-5">
              {[
                'Answers run on a local Ollama model by default — no upload required.',
                'Documents, embeddings, chats and plans live in your own storage.',
                'One click deletes everything it generated, while keeping your login.',
              ].map((item, i) => (
                <li key={item} className="border-b border-[#FFFDF7]/10 pb-5 last:border-0 last:pb-0">
                  <Reveal className="flex gap-4" delay={i * 90}>
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold-light/40 text-gold-light">
                      <Check />
                    </span>
                    <p className="text-[14.5px] leading-[1.65] text-on-panel/80">{item}</p>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={`${shell} py-24 text-center lg:py-32`}>
          <Reveal>
            <p className="font-label text-[11px] uppercase tracking-[0.22em] text-gold">
              Ready when you are
            </p>
            <h2 className="font-display mx-auto mt-5 max-w-[34rem] text-[clamp(2.2rem,4.4vw,3.6rem)] font-semibold leading-[1.05] tracking-[-0.035em]">
              Bring your syllabus. Leave the guesswork.
            </h2>
            <p className="mx-auto mt-5 max-w-[30rem] text-[15.5px] leading-[1.7] text-neutral-600">
              Create an account, add one course, and ask your first question in
              under five minutes.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link to="/register" className={inkButton}>
                Create your account{' '}
                <Arrow className="transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <Link to="/login" className={quietLink}>
                I already have one
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-ink/10">
        <div className={`${shell} flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between`}>
          <div className="flex items-center gap-3">
            <Logo size={22} />
            <span className="font-label text-[10px] uppercase tracking-[0.16em] text-ink/40">
              BMU CSE · Group 10 · 2026
            </span>
          </div>
          <nav aria-label="Footer" className="flex items-center gap-6 text-[13px] text-ink/50">
            <Link to="/login" className="transition hover:text-ink">
              Sign in
            </Link>
            <Link to="/register" className="transition hover:text-ink">
              Create account
            </Link>
            <a href="#privacy" className="transition hover:text-ink">
              Privacy
            </a>
          </nav>
        </div>
      </footer>
    </div>
  )
}

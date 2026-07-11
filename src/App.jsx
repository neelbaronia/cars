import { lazy, Suspense, useEffect, useState } from 'react'
import { CarFront, Sparkles } from 'lucide-react'

const EngineLab = lazy(() => import('./labs/EngineLab.jsx'))
const MotionLab = lazy(() => import('./labs/MotionLab.jsx'))
const SimulatorLab = lazy(() => import('./labs/SimulatorLab.jsx'))

const labs = [
  { id: 'engine', number: '01', label: 'Engine mechanics', short: 'Engine', component: EngineLab },
  { id: 'motion', number: '02', label: 'Making it move', short: 'Motion', component: MotionLab },
  { id: 'simulator', number: '03', label: 'Full car simulator', short: 'Drive', component: SimulatorLab },
]

function LoadingLab() {
  return (
    <div className="lab-loading" role="status">
      <span className="loading-wheel" />
      <strong>Rolling the car into the studio…</strong>
    </div>
  )
}

export default function App() {
  const initialHash = window.location.hash.replace('#', '')
  const [activeId, setActiveId] = useState(labs.some((lab) => lab.id === initialHash) ? initialHash : 'engine')
  const activeIndex = Math.max(0, labs.findIndex((lab) => lab.id === activeId))
  const ActiveLab = labs[activeIndex].component

  useEffect(() => {
    const onHash = () => {
      const next = window.location.hash.replace('#', '')
      setActiveId(labs.some((lab) => lab.id === next) ? next : 'engine')
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const chooseLab = (id) => {
    setActiveId(id)
    window.history.replaceState(null, '', `#${id}`)
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' })
  }

  return (
    <main className={`app-shell app-shell--${activeId === 'engine' ? 'painted-notes' : 'cake-box'}`}>
      <header className="site-header">
        <a className="brand" href="#engine" onClick={(event) => { event.preventDefault(); chooseLab('engine') }}>
          <span className="brand-mark"><CarFront size={22} /></span>
          <span><strong>HOW A CAR WORKS</strong><small>A hands-on mechanics studio</small></span>
        </a>
        <div className="header-note"><Sparkles size={16} /> Fuel · force · motion</div>
        <a className="site-credit" href="https://www.nbaronia.com" target="_blank" rel="noreferrer">
          <span>Made by</span>
          <strong>nbaronia</strong>
        </a>
      </header>

      <nav className="lab-tabs" aria-label="Car mechanics experiments">
        {labs.map((lab, index) => (
          <button
            key={lab.id}
            type="button"
            className={index === activeIndex ? 'is-active' : ''}
            onClick={() => chooseLab(lab.id)}
            aria-current={index === activeIndex ? 'page' : undefined}
          >
            <span>{lab.number}</span>
            <strong className="tab-long">{lab.label}</strong>
            <strong className="tab-short">{lab.short}</strong>
          </button>
        ))}
      </nav>

      <div className="lab-stage" key={labs[activeIndex].id}>
        <Suspense fallback={<LoadingLab />}><ActiveLab /></Suspense>
      </div>
    </main>
  )
}

import { Gauge, Lightbulb, RefreshCw, RotateCcw } from 'lucide-react'

export function Slider({ label, value, min, max, step = 1, unit = '', onChange, accent = '#e6543f', disabled = false }) {
  const progress = ((value - min) / (max - min)) * 100
  const digits = step < 0.1 ? 2 : step < 1 ? 1 : 0
  return (
    <label className={`slider-control ${disabled ? 'is-disabled' : ''}`}>
      <span className="control-label"><span>{label}</span><output>{Number(value).toFixed(digits)}{unit}</output></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ '--range-progress': `${progress}%`, '--range-accent': accent }}
      />
    </label>
  )
}

export function Metric({ label, value, tone = 'coral', hint }) {
  return (
    <div className={`metric metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  )
}

export function Equation({ children, caption, values }) {
  return (
    <div className="equation-block">
      <div className="equation">{children}</div>
      {values && <div className="equation-values">{values}</div>}
      <p>{caption}</p>
    </div>
  )
}

export function Note({ children }) {
  return <div className="note"><Lightbulb size={17} aria-hidden="true" /><p>{children}</p></div>
}

export function ResetButton({ onClick }) {
  return (
    <button className="icon-button" type="button" onClick={onClick} title="Reset experiment" aria-label="Reset experiment">
      <RotateCcw size={18} />
    </button>
  )
}

export function SceneBadge({ children }) {
  return <div className="scene-badge"><Gauge size={15} aria-hidden="true" /><span>{children}</span></div>
}

export function SectionHeader({ kicker, title, children }) {
  return (
    <header className="lesson-heading">
      <span className="lesson-kicker">{kicker}</span>
      <h1>{title}</h1>
      <p>{children}</p>
    </header>
  )
}

export function Segmented({ label, options, value, onChange, className = '' }) {
  return (
    <div className={`segmented ${className}`} role="group" aria-label={label}>
      {options.map((option) => {
        const item = typeof option === 'string' ? { value: option, label: option } : option
        return (
          <button key={item.value} type="button" className={value === item.value ? 'is-active' : ''}
            onClick={() => onChange(item.value)} aria-pressed={value === item.value}>
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

export function FlowChain({ items, activeIndex = -1 }) {
  return (
    <div className="flow-chain" aria-label={items.join(' then ')}>
      {items.map((item, index) => (
        <span key={item} className={index === activeIndex ? 'is-active' : ''}>
          <b>{item}</b>{index < items.length - 1 && <i aria-hidden="true">→</i>}
        </span>
      ))}
    </div>
  )
}

export function ReadoutStrip({ items }) {
  return (
    <div className="hud-strip">
      {items.map(({ label, value }) => <span key={label}><small>{label}</small><b>{value}</b></span>)}
    </div>
  )
}

export function RenderFallback({ onRetry }) {
  return (
    <div className="render-fallback" role="alert">
      <span className="render-fallback__wheel" aria-hidden="true" />
      <strong>The 3D studio needs a quick restart.</strong>
      <p>Your lesson controls and progress are safe.</p>
      <button type="button" onClick={onRetry}><RefreshCw size={15} /> Retry 3D view</button>
    </div>
  )
}

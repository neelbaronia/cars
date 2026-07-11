import { Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EngineDiagram } from '../components/EngineDiagram.jsx'
import { Equation, FlowChain, Metric, Note, ResetButton, SceneBadge, SectionHeader, Segmented, Slider } from '../components/LabUI.jsx'
import { engineOutput } from '../physics.js'

const STROKES = [
  { name: 'Intake', verb: 'Fill', color: '#3f9a9d', detail: 'Intake valve open · piston down' },
  { name: 'Compression', verb: 'Squeeze', color: '#76569b', detail: 'Both valves closed · piston up' },
  { name: 'Power', verb: 'Push', color: '#e6543f', detail: 'Spark + expanding gas · piston down' },
  { name: 'Exhaust', verb: 'Clear', color: '#d38d27', detail: 'Exhaust valve open · piston up' },
]

function effectiveLoad(throttle, rpm) {
  if (throttle > 0) return throttle
  return rpm <= 950 ? 8 : 0
}

function cylinderPressure(progress, spark, throttle, rpm) {
  const stroke = Math.floor(progress) % 4
  const within = progress - Math.floor(progress)
  const load = effectiveLoad(throttle, rpm)
  if (stroke === 0) return 0.88 + load * 0.001
  if (stroke === 1) return 1 + within ** 2 * 10
  if (stroke === 2 && spark && load > 0) return 11 + (1 - within) ** 2 * (8 + load * 0.45)
  if (stroke === 2) return 1 + 10 * (1 - within) ** 1.5
  return 1.08 + (1 - within) * 0.35
}

export default function EngineLab() {
  const [progress, setProgress] = useState(0.12)
  const [running, setRunning] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const [throttle, setThrottle] = useState(38)
  const [rpm, setRpm] = useState(2200)
  const [spark, setSpark] = useState(true)
  const [mode, setMode] = useState('path')
  const [playbackRate, setPlaybackRate] = useState(0.65)

  useEffect(() => {
    if (!running) return undefined
    const timer = window.setInterval(() => {
      setProgress((current) => (current + 0.02 * playbackRate) % 4)
    }, 50)
    return () => window.clearInterval(timer)
  }, [playbackRate, running])

  const strokeIndex = Math.floor(progress) % 4
  const stroke = STROKES[strokeIndex]
  const combustionActive = spark && effectiveLoad(throttle, rpm) > 0
  const displayedStrokeName = strokeIndex === 2 && !combustionActive ? 'Expansion' : stroke.name
  const displayedStrokeDetail = strokeIndex === 2 && !combustionActive
    ? spark ? 'Fuel cut · compressed air expands without a burn' : 'No spark · compressed mixture expands without a burn'
    : stroke.detail
  const crankAngle = Math.round(progress * 180)
  const pressureBar = cylinderPressure(progress, spark, throttle, rpm)
  const pistonForce = (pressureBar - 1) * 100000 * 0.0055
  const displayedPistonForce = Math.abs(pistonForce) < 50 ? 0 : pistonForce
  const instantaneousTorque = pistonForce * 0.043 * Math.sin(progress * Math.PI)
  const output = engineOutput({ rpm, throttle: throttle / 100, spark })
  const fuelPerCycleMg = output.fuelRateGps > 0 ? (output.fuelRateGps / Math.max(1, rpm / 120 * 4)) * 1000 : 0
  const useful = output.powerKw > 0 ? Math.round(output.efficiency * 100) : 0

  const reset = () => { setProgress(0.12); setRunning(true); setThrottle(38); setRpm(2200); setSpark(true); setMode('path'); setPlaybackRate(0.65) }
  const chooseStroke = (index) => { setProgress(index + 0.12); setRunning(false); setMode('cycle') }

  return (
    <div className="lab-layout lab-layout--painted-notes">
      <section className="demo-pane demo-pane--engine" aria-label="Interactive cutaway gasoline engine">
        <div className="scene-toolbar"><SceneBadge>{displayedStrokeName} · {crankAngle}° / 720°</SceneBadge><ResetButton onClick={reset} /></div>
        <div className="scene-mode">
          <Segmented label="Engine view" value={mode} onChange={setMode} options={[
            { value: 'path', label: 'Fuel path' }, { value: 'cycle', label: '4 strokes' }, { value: 'energy', label: 'Force + heat' },
          ]} />
        </div>
        <EngineDiagram progress={progress} throttle={throttle} rpm={rpm} spark={spark} mode={mode}
          pressureBar={pressureBar} pistonForce={pistonForce} />
        <div className="cycle-ribbon">
          <span style={{ '--stroke-color': stroke.color }}>{strokeIndex + 1}</span>
          <p><small>{strokeIndex === 2 && !combustionActive ? 'Recover' : stroke.verb}</small><strong>{displayedStrokeName}</strong><b>{displayedStrokeDetail}</b></p>
        </div>
      </section>

      <aside className="lesson-pane">
        <SectionHeader kicker="Experiment 01 · Engine mechanics" title="A controlled burn becomes a turning shaft.">
          Follow one drop of gasoline from a protected tank near the rear axle to a precisely timed spray inside the engine—then watch pressure become force, torque, and power.
        </SectionHeader>

        <div className="control-group">
          <div className="group-title"><span>Run one idealized cylinder</span><small>Slow-motion view · one cycle = two crank turns</small></div>
          <div className="stroke-picker">
            {STROKES.map((item, index) => <button key={item.name} type="button" className={strokeIndex === index ? 'is-active' : ''}
              onClick={() => chooseStroke(index)}><b>0{index + 1}</b><span>{item.name}</span></button>)}
          </div>
          <button className="play-button" type="button" onClick={() => setRunning((value) => !value)}>
            {running ? <Pause size={15} /> : <Play size={15} />}{running ? 'Pause cycle' : 'Play cycle'}
          </button>
          <div className="playback-control">
            <span>Slow-motion playback</span>
            <Segmented label="Cycle playback speed" value={playbackRate} onChange={setPlaybackRate} options={[
              { value: 0.65, label: 'Slow' }, { value: 1, label: 'Study' }, { value: 1.6, label: 'Faster' },
            ]} />
          </div>
          <Slider label="Crank angle" value={crankAngle} min={0} max={719} unit="°" onChange={(value) => { setProgress(value / 180); setRunning(false); setMode('cycle') }} accent="#76569b" />
          <Slider label="Accelerator request" value={throttle} min={0} max={100} unit="%" onChange={setThrottle} />
          <Slider label="Engine speed" value={rpm} min={800} max={6000} step={100} unit=" rpm" onChange={setRpm} accent="#28778c" />
          <label className="switch-row"><span><strong>Spark enabled</strong><small>Turn it off: air and fuel still enter, but useful torque vanishes.</small></span>
            <input type="checkbox" checked={spark} onChange={(event) => setSpark(event.target.checked)} /><i /></label>
        </div>

        <div className="metric-grid">
          <Metric label="Cylinder pressure" value={`${pressureBar.toFixed(1)} bar`} />
          <Metric label="Net gas force" value={`${displayedPistonForce > 0 ? '+' : ''}${(displayedPistonForce / 1000).toFixed(1)} kN`} tone="blue" />
          <Metric label="Whole-engine net torque" value={`${output.torqueNm.toFixed(0)} N·m`} tone="violet" />
          <Metric label="Shaft power" value={`${output.powerKw.toFixed(1)} kW`} tone="yellow" />
        </div>

        <section className="lesson-section">
          <h2>First: fuel and air have separate paths</h2>
          <FlowChain items={['Tank', 'Electric pump', 'Fuel rail', 'Port injector', 'Intake valve']} activeIndex={mode === 'path' ? strokeIndex === 0 ? 3 : 4 : -1} />
          <p className="body-copy body-copy--spaced">This teaching engine uses port injection: the pump supplies fuel through a line under the floor, and each injector sprays near an intake valve. The accelerator is a torque request—not a gasoline faucet. As the piston descends, cylinder volume grows, pressure falls, and atmospheric pressure pushes air inward.</p>
          <Note>Gasoline is normally pumped forward, not gravity-fed. Air arrives through the filter and throttle; spent gas leaves through the catalyst and muffler.</Note>
        </section>

        <section className="lesson-section step-list">
          <h2>Four strokes, 720° of crank rotation</h2>
          {STROKES.map((item, index) => (
            <div key={item.name}><b>{index + 1}</b><p><strong>{item.name}: {item.verb.toLowerCase()}.</strong><span>{item.detail}. {index === 2 ? 'A spark starts a fast, controlled burn; the spark itself does not push the piston.' : ''}</span></p></div>
          ))}
          <Note>Each cylinder produces one power stroke every two crankshaft rotations. Several cylinders and a flywheel overlap and smooth those pulses.</Note>
        </section>

        <section className="lesson-section">
          <h2>Pressure pushes an area</h2>
          <Equation caption="Hot gas presses on the piston crown. During intake, the negative result means the cylinder's lower pressure resists the piston slightly."
            values={`(${(pressureBar - 1).toFixed(1)} × 100,000 Pa) × 0.0055 m² = ${pistonForce.toFixed(0)} N = ${(pistonForce / 1000).toFixed(1)} kN`}>
            F = Δp × A
          </Equation>
          <Equation caption="The sign matters: compression and exhaust usually resist the crank; combustion expansion drives it. Other cylinders and the flywheel carry this cylinder through its resisting strokes."
            values={`${pistonForce.toFixed(0)} N × 0.043 m × sin(φ) ≈ ${instantaneousTorque.toFixed(0)} N·m instantaneous`}>
            τ ≈ F r sin(φ)
          </Equation>
        </section>

        <section className="lesson-section">
          <h2>Torque is twist. Power is twist per second.</h2>
          <Equation caption="At the same torque, doubling engine speed doubles power because the shaft completes work twice as quickly."
            values={`${output.torqueNm.toFixed(0)} N·m × 2π × ${rpm.toLocaleString()} ÷ 60 ÷ 1,000 = ${output.powerKw.toFixed(1)} kW`}>
            P = τω
          </Equation>
          {output.powerKw > 0 ? (
            <div className="energy-ledger">
              <span style={{ flex: useful }}><b>{useful}%</b> shaft</span>
              <span style={{ flex: Math.max(1, 100 - useful) }}><b>{100 - useful}%</b> heat + pumping + friction</span>
            </div>
          ) : (
            <div className="energy-ledger energy-ledger--overrun"><span><b>Overrun</b> wheels → engine pumping + friction → heat</span></div>
          )}
          <p className="body-copy">This inline-four model meters about <strong>{fuelPerCycleMg.toFixed(1)} mg per cylinder cycle</strong> at this setting. Real efficiency shifts constantly with speed, load, temperature, and engine design.</p>
        </section>

        <section className="lesson-section">
          <h2>How a turning shaft becomes forward motion</h2>
          <FlowChain items={['Crankshaft', 'Clutch or converter', 'Gearbox', 'Differential', 'Driven tires']} />
          <p className="body-copy body-copy--spaced">When a drive gear is selected and the coupling is engaged, the flywheel or flexplate carries crankshaft rotation into a clutch, torque converter, or launch clutch. The gearbox trades rotational speed for torque, and the final drive and differential route that torque to the driven wheels.</p>
          <Equation caption="A smaller effective tire radius or more gear reduction produces more force at the road for a given engine torque. Gears trade speed for torque; they do not create energy.">
            F<sub>road</sub> ≈ τ<sub>wheel</sub> ÷ r<sub>tire</sub>
          </Equation>
          <p className="body-copy">At each contact patch, the driven tire pushes backward on the road. Static friction from the road pushes forward on the tire—and therefore the whole car. If the requested force exceeds available grip, the tire spins instead of producing more acceleration.</p>
          <Note>Front-, rear-, and all-wheel-drive cars route the shafts differently. The differential also lets the left and right wheels turn at different speeds in a corner.</Note>
        </section>
        <a className="next-lab" href="#motion"><span>Next experiment</span><strong>Send that torque to the tires →</strong></a>
      </aside>
    </div>
  )
}

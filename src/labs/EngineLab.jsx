import { Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EngineDiagram } from '../components/EngineDiagram.jsx'
import { Equation, FlowChain, Metric, Note, ResetButton, SceneBadge, SectionHeader, Segmented, Slider } from '../components/LabUI.jsx'
import { engineOutput, gasolineMixtureOutput } from '../physics.js'

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

function mixturePresentation(mixture) {
  if (mixture.status === 'too-lean') return {
    title: 'Too lean · unstable burn',
    detail: 'Too little fuel makes the flame unreliable. Misfire risk rises while pressure, torque, and heat fall.',
  }
  if (mixture.status === 'lean') return {
    title: 'Lean · less fuel',
    detail: 'The charge still burns, but the smaller fuel dose gives up some pressure and torque in this fixed-air comparison.',
  }
  if (mixture.status === 'too-rich') return {
    title: 'Too rich · incomplete burn',
    detail: 'Excess fuel cannot burn completely. Fuel use stays high while useful pressure, torque, and heat collapse.',
  }
  if (mixture.status === 'rich' && mixture.equivalenceRatio <= 1.16) return {
    title: 'Slightly rich · best-power region',
    detail: 'A modest extra fuel dose produces the strongest torque in this simplified gasoline-engine model.',
  }
  if (mixture.status === 'rich') return {
    title: 'Rich · extra fuel',
    detail: 'Beyond the best-power region, extra gasoline raises fuel use while combustion quality and output begin falling.',
  }
  return {
    title: Math.abs(mixture.equivalenceRatio - 1) < 0.005
      ? 'Stoichiometric · balanced chemistry'
      : 'Near stoichiometric · stable burn',
    detail: 'There is about enough oxygen to burn the gasoline completely, which suits normal catalyst operation.',
  }
}

function cylinderPressure(progress, spark, throttle, rpm, mixture) {
  const stroke = Math.floor(progress) % 4
  const within = progress - Math.floor(progress)
  const load = effectiveLoad(throttle, rpm)
  const manifoldBar = 0.32 + load * 0.0066
  const compressionPeakBar = manifoldBar * 15
  const firedPeakBar = compressionPeakBar + load * 0.38 * mixture.torqueMultiplier
  if (stroke === 0) return manifoldBar
  if (stroke === 1) return manifoldBar + (compressionPeakBar - manifoldBar) * within ** 1.6
  if (stroke === 2 && spark && load > 0) return 1 + (firedPeakBar - 1) * (1 - within) ** 1.45
  if (stroke === 2) return 1 + (compressionPeakBar - 1) * (1 - within) ** 1.45
  return 1.08 + (1 - within) * 0.35
}

export default function EngineLab() {
  const [progress, setProgress] = useState(0.12)
  const [running, setRunning] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const [throttle, setThrottle] = useState(38)
  const [rpm, setRpm] = useState(2200)
  const [richness, setRichness] = useState(100)
  const [spark, setSpark] = useState(true)
  const [mode, setMode] = useState('path')
  const [playbackRate, setPlaybackRate] = useState(0.65)

  useEffect(() => {
    if (!running) return undefined
    const timer = window.setInterval(() => {
      setProgress((current) => (current + 0.02 * playbackRate * (rpm / 2200)) % 4)
    }, 50)
    return () => window.clearInterval(timer)
  }, [playbackRate, rpm, running])

  const strokeIndex = Math.floor(progress) % 4
  const stroke = STROKES[strokeIndex]
  const equivalenceRatio = richness / 100
  const mixture = gasolineMixtureOutput(equivalenceRatio)
  const mixtureCopy = mixturePresentation(mixture)
  const mixtureExtreme = mixture.status === 'too-lean' || mixture.status === 'too-rich'
  const combustionActive = spark && effectiveLoad(throttle, rpm) > 0 && mixture.combustionQuality > 0.08
  const displayedStrokeName = strokeIndex === 2 && !combustionActive
    ? 'Expansion'
    : strokeIndex === 2 && mixtureExtreme ? 'Weak power' : stroke.name
  const displayedStrokeDetail = strokeIndex === 2 && !combustionActive
    ? spark ? 'Fuel cut · compressed air expands without a burn' : 'No spark · compressed mixture expands without a burn'
    : strokeIndex === 2 && mixtureExtreme ? mixtureCopy.detail
    : stroke.detail
  const crankAngle = Math.round(progress * 180)
  const pressureBar = cylinderPressure(progress, spark, throttle, rpm, mixture)
  const pistonForce = (pressureBar - 1) * 100000 * 0.0055
  const displayedPistonForce = Math.abs(pistonForce) < 50 ? 0 : pistonForce
  const instantaneousTorque = pistonForce * 0.043 * Math.sin(progress * Math.PI)
  const output = engineOutput({ rpm, throttle: throttle / 100, spark, equivalenceRatio })
  const fuelPerCycleMg = output.fuelRateGps > 0 ? (output.fuelRateGps / Math.max(1, rpm / 120 * 4)) * 1000 : 0
  const useful = output.powerKw > 0 ? Math.round(output.efficiency * 100) : 0
  const crankTurnsPerSecond = rpm / 60
  const cylinderCyclesPerSecond = rpm / 120
  const realCycleMs = 120000 / rpm
  const displayedCycleSeconds = 22000 / (playbackRate * rpm)
  const angularSpeedRadPerSecond = crankTurnsPerSecond * Math.PI * 2

  const reset = () => { setProgress(0.12); setRunning(true); setThrottle(38); setRpm(2200); setRichness(100); setSpark(true); setMode('path'); setPlaybackRate(0.65) }
  const chooseStroke = (index) => { setProgress(index + 0.12); setRunning(false); setMode('cycle') }
  const chooseMixture = (value) => {
    setRichness(value)
    setProgress(2.22)
    setRunning(false)
    setMode('energy')
  }

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
          pressureBar={pressureBar} pistonForce={pistonForce} mixture={mixture} fuelPerCycleMg={fuelPerCycleMg} />
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
          <Slider label="Accelerator request" value={throttle} min={0} max={100} unit="%" onChange={setThrottle}
            hint="Opens the throttle to admit more air; the fuel system then meters gasoline to match the selected recipe." />
          <Slider label="Engine speed" value={rpm} min={800} max={6000} step={100} unit=" rpm" onChange={setRpm} accent="#28778c"
            hint="Changes the relative crank speed and torque-to-power calculation; the cutaway remains slow-motion." />
          <div className="engine-control-feedback">
            <p><span>Request</span><strong>{throttle}% → {fuelPerCycleMg.toFixed(1)} mg fuel / cylinder cycle</strong></p>
            <p><span>Mixture</span><strong>{richness}% richness · {mixture.airFuelRatio.toFixed(1)}:1 air/fuel · {mixtureCopy.title}</strong></p>
            <p><span>Speed</span><strong>{rpm.toLocaleString()} rpm → {cylinderCyclesPerSecond.toFixed(1)} cycles/s · {realCycleMs.toFixed(1)} ms/cycle</strong></p>
            <p><span>Output</span><strong>{output.torqueNm.toFixed(0)} N·m × {angularSpeedRadPerSecond.toFixed(0)} rad/s → {output.powerKw.toFixed(1)} kW</strong></p>
            <small>Dyno-style controls isolate request from RPM. This {displayedCycleSeconds.toFixed(1)} s cutaway is about {(displayedCycleSeconds / (realCycleMs / 1000)).toFixed(0)}× slower than the real cycle.</small>
          </div>
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

        <section className="lesson-section mixture-lab" aria-labelledby="mixture-lab-title">
          <span className="mixture-lab__eyebrow">Live mixture experiment</span>
          <h2 id="mixture-lab-title">Change the recipe, not the airflow.</h2>
          <p className="body-copy">Richness is the gasoline dose for the same trapped air charge. At 100%, the recipe is stoichiometric; 60% is much leaner and 150% is much richer. Modern road-car electronics normally manage this automatically.</p>

          <div className="mixture-lab__tool" data-mixture-status={mixture.status}>
            <Slider label="Fuel richness" value={richness} min={60} max={150} step={1} unit="%"
              onChange={chooseMixture} accent="#d38d27"
              hint="Moving the slider pauses near the start of the power stroke so flame, pressure, force, and heat can be compared directly." />

            <div className="mixture-lab__scale" aria-hidden="true">
              <span>Too lean</span><span>Lean</span><span>Balanced / power</span><span>Too rich</span>
              <i className="mixture-lab__marker mixture-lab__marker--stoich"><b>100</b> stoich</i>
              <i className="mixture-lab__marker mixture-lab__marker--power"><b>110</b> best power</i>
            </div>

            <div className="mixture-lab__status" aria-live="polite">
              <p><span>{spark ? mixtureCopy.title : 'Spark off · no combustion'}</span><strong>{mixture.airFuelRatio.toFixed(1)} : 1</strong><small>air mass : gasoline mass</small></p>
              <p>{spark ? mixtureCopy.detail : 'Air and gasoline can still enter, but without a spark there is no controlled flame or useful combustion torque.'}</p>
            </div>

            <div className="mixture-lab__outputs" aria-label="Live mixture effects relative to the stoichiometric recipe">
              <span style={{ '--mixture-meter': `${mixture.combustionQuality * 100}%` }}><small>Burn quality</small><b>{Math.round(mixture.combustionQuality * 100)}%</b><i /></span>
              <span style={{ '--mixture-meter': `${Math.min(100, mixture.torqueMultiplier / 1.04 * 100)}%` }}><small>Torque potential</small><b>{Math.round(mixture.torqueMultiplier * 100)}%</b><i /></span>
              <span style={{ '--mixture-meter': `${mixture.fuelConsumptionMultiplier / 1.5 * 100}%` }}><small>Fuel dose</small><b>{Math.round(mixture.fuelConsumptionMultiplier * 100)}%</b><i /></span>
              <span style={{ '--mixture-meter': `${mixture.exhaustHeatTendency * 100}%` }}><small>Exhaust heat tendency</small><b>{Math.round(mixture.exhaustHeatTendency * 100)}%</b><i /></span>
            </div>
          </div>

          <div className="mixture-lab__regions">
            <span><b>Lean</b><small>Less fuel for the same air. Output falls as the flame becomes harder to sustain.</small></span>
            <span><b>Stoichiometric</b><small>About 14.7 parts air to one part gasoline by mass: balanced chemistry, not maximum power.</small></span>
            <span><b>Slightly rich</b><small>Around 110% richness makes the best torque here, at the cost of extra fuel.</small></span>
            <span><b>Extremes</b><small>Either shortage or excess can cause incomplete, unstable burns and sharply reduced output.</small></span>
          </div>
          <Note>Stoichiometric means the chemical proportions are balanced. It is not the same as best power: this simplified engine peaks slightly rich, while very rich and very lean mixtures both lose torque.</Note>
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

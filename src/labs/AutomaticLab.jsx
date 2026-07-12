import { Html, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Gauge, Play, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { ExplodedMechanismModel } from '../components/ExplodedMechanismModel.jsx'
import { FlowChain, Metric, RenderFallback, ResetButton, SceneBadge, SectionHeader, Slider } from '../components/LabUI.jsx'
import { FlowDots, PaintedBox, StudioFloor, StudioLights } from '../components/SceneKit.jsx'
import { TEACHING_GEAR_APPLICATIONS } from '../motionParts.js'
import {
  FINAL_DRIVE_RATIO,
  REDLINE_RPM,
  automaticGearDecision,
  automaticShiftThresholds,
  clamp,
  engineOutput,
  getGearRatio,
  transmissionKinematics,
} from '../physics.js'
import { usePerspectiveInput } from '../usePerspectiveInput.js'

const WHEEL_RADIUS = 0.31
const SHIFT_PHASES = Object.freeze([
  Object.freeze({ id: 'torque-cut', label: 'Unload torque', short: 'Unload', duration: 480 }),
  Object.freeze({ id: 'release', label: 'Release old pair', short: 'Release', duration: 560 }),
  Object.freeze({ id: 'select', label: 'Route pressure', short: 'Route', duration: 700 }),
  Object.freeze({ id: 'apply', label: 'Clamp new pair', short: 'Clamp', duration: 900 }),
])
const SHIFT_TOTAL_MS = SHIFT_PHASES.reduce((sum, phase) => sum + phase.duration, 0)
const DEFAULTS = Object.freeze({ throttle: 28, speedKph: 15, gear: 1 })
const GEAR_COLORS = Object.freeze({ 1: '#e6543f', 2: '#d39b27', 3: '#3f9a9d', 4: '#76569b' })

function shiftSnapshot(elapsedMs) {
  const elapsed = clamp(elapsedMs, 0, SHIFT_TOTAL_MS)
  let cursor = 0
  for (let index = 0; index < SHIFT_PHASES.length; index += 1) {
    const phase = SHIFT_PHASES[index]
    const end = cursor + phase.duration
    if (elapsed < end || index === SHIFT_PHASES.length - 1) {
      return {
        stage: phase.id,
        phaseIndex: index,
        phaseProgress: clamp((elapsed - cursor) / phase.duration, 0, 1),
        overallProgress: elapsed / SHIFT_TOTAL_MS,
      }
    }
    cursor = end
  }
  return { stage: 'apply', phaseIndex: 3, phaseProgress: 1, overallProgress: 1 }
}

function torqueTransferForShift(shift) {
  if (!shift) return 1
  const progress = shift.phaseProgress
  if (shift.stage === 'torque-cut') return 1 - progress * 0.65
  if (shift.stage === 'release') return 0.35 * (1 - progress)
  if (shift.stage === 'select') return 0.04
  if (shift.stage === 'apply') return 0.08 + progress * 0.92
  return 1
}

function SignalLabel({ position, color, title, detail }) {
  return (
    <Html position={position} center sprite distanceFactor={9} zIndexRange={[130, 0]}
      wrapperClass="auto-signal-label-layer" style={{ pointerEvents: 'auto' }}>
      <button type="button" className="auto-signal-label" style={{ '--signal-color': color }}
        onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
        <span>{title}</span><i aria-hidden="true">?</i><b role="tooltip">{detail}</b>
      </button>
    </Html>
  )
}

function SpeedSensor({ speedKph }) {
  const rotor = useRef()
  useFrame((_, delta) => {
    if (rotor.current) rotor.current.rotation.x -= delta * (.35 + speedKph / 18)
  })
  return (
    <group position={[3.45, 1.75, -1.05]}>
      <group ref={rotor}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[.42, .42, .18, 24]} />
          <meshStandardMaterial color="#77bdd2" roughness={.55} />
        </mesh>
        <PaintedBox size={[.22, .68, .055]} color="#fff4c8" />
      </group>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[.52, .055, 10, 28]} />
        <meshStandardMaterial color="#28778c" />
      </mesh>
      <SignalLabel position={[0, .82, 0]} color="#28778c" title="OUTPUT-SPEED SENSOR"
        detail="A toothed wheel and magnetic sensor report output-shaft speed. Because the final drive and tire size are known, the controller can infer road speed." />
    </group>
  )
}

function PedalSensor({ throttle }) {
  const pedalAngle = THREE.MathUtils.degToRad(-36 + throttle * 25)
  return (
    <group position={[-3.5, 1.68, -1.05]}>
      <PaintedBox size={[.75, .62, .52]} color="#f0ae9d" opacity={.92} />
      <group position={[0, -.18, .12]} rotation={[0, 0, pedalAngle]}>
        <PaintedBox size={[.13, .74, .16]} position={[0, -.25, 0]} color="#e6543f" />
        <PaintedBox size={[.38, .24, .2]} position={[0, -.62, 0]} color="#fff0b4" />
      </group>
      <SignalLabel position={[0, .9, 0]} color="#e6543f" title="PEDAL-POSITION SENSOR"
        detail="The pedal is an electronic torque request. A large request tells the controller to hold a lower gear longer or command kickdown." />
    </group>
  )
}

function ControllerBox({ fromGear, toGear, shifting }) {
  return (
    <group position={[0, 2.65, -1.1]}>
      <PaintedBox size={[1.75, .68, .8]} color="#315964" emissive="#315964"
        emissiveIntensity={shifting ? .28 : .04} />
      <Html position={[0, 0, .45]} center sprite distanceFactor={8.5} style={{ pointerEvents: 'none' }}>
        <span className={`auto-controller-chip ${shifting ? 'is-shifting' : ''}`}>
          <small>TRANSMISSION CONTROLLER</small><b>{shifting ? `G${fromGear} → G${toGear}` : `HOLD G${fromGear}`}</b>
        </span>
      </Html>
      <SignalLabel position={[0, .72, 0]} color="#315964" title="SHIFT MAP + TCM"
        detail="Software compares pedal demand with output speed, applies hysteresis, checks the resulting engine rpm, then commands shift solenoids in the valve body." />
    </group>
  )
}

function AutomaticSignalRig({ throttle, speedKph, gear, targetGear, shifting }) {
  return (
    <group>
      <PedalSensor throttle={throttle} />
      <SpeedSensor speedKph={speedKph} />
      <ControllerBox fromGear={gear} toGear={targetGear} shifting={shifting} />
      <FlowDots points={[[-3.18, 1.72, -1.02], [-2.6, 2.35, -1.05], [-.9, 2.65, -1.08]]}
        color="#e6543f" speed={.5 + throttle * 1.2} count={6} radius={.045} active />
      <FlowDots points={[[3.1, 1.78, -1.02], [2.55, 2.35, -1.05], [.9, 2.65, -1.08]]}
        color="#28778c" speed={.45 + speedKph / 90} count={6} radius={.045} active />
      <FlowDots points={[[0, 2.3, -.9], [0, 1.4, -.2], [0, -.8, .7], [0, -1.4, .9]]}
        color="#f2c94d" speed={1.1} count={8} radius={.05} active={shifting} />
    </group>
  )
}

function AutomaticScene({ throttle, speedKph, gear, targetGear, shift, torqueTransfer, inputRpm, outputRpm, perspectiveInputRef, resetSignal }) {
  const { camera } = useThree()
  const controls = useRef()
  const target = useMemo(() => new THREE.Vector3(0, -.15, 0), [])
  const spherical = useRef(new THREE.Spherical())

  useEffect(() => {
    camera.position.set(7.9, 5.25, 8.8)
    camera.lookAt(target)
    if (controls.current) {
      controls.current.target.copy(target)
      controls.current.update()
    }
  }, [camera, resetSignal, target])

  useFrame((_, delta) => {
    const input = perspectiveInputRef.current
    const horizontal = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    const vertical = (input.down ? 1 : 0) - (input.up ? 1 : 0)
    if (!horizontal && !vertical) return
    const offset = camera.position.clone().sub(target)
    spherical.current.setFromVector3(offset)
    spherical.current.theta += horizontal * delta * 1.2
    spherical.current.phi = THREE.MathUtils.clamp(spherical.current.phi + vertical * delta * .9, .35, 1.4)
    camera.position.copy(target).add(offset.setFromSpherical(spherical.current))
    camera.lookAt(target)
    controls.current?.update()
  })

  const modelStage = shift?.stage || 'engaged'
  const displayTarget = shift?.to ?? targetGear
  return (
    <>
      <color attach="background" args={['#ead9c8']} />
      <StudioLights />
      <StudioFloor size={22} color="#e8cc91" y={-2.45} />
      <group position={[0, -.22, .2]} scale={.86}>
        <ExplodedMechanismModel partId="gearbox" rpm={inputRpm} speed={speedKph / 3.6}
          gear={gear} engagedGear={shift?.from ?? gear} targetGear={displayTarget}
          shiftStage={modelStage} shiftProgress={shift?.phaseProgress ?? 1} torqueTransfer={torqueTransfer}
          gearboxInputRpm={inputRpm} gearboxOutputRpm={outputRpm} />
      </group>
      <AutomaticSignalRig throttle={throttle} speedKph={speedKph} gear={shift?.from ?? gear}
        targetGear={displayTarget} shifting={Boolean(shift)} />
      <OrbitControls ref={controls} makeDefault enablePan={false} target={[0, -.15, 0]}
        minDistance={6.4} maxDistance={16} minPolarAngle={.34} maxPolarAngle={Math.PI * .47} />
    </>
  )
}

function ShiftMap({ throttle, speedKph, gear, targetGear }) {
  const paths = useMemo(() => [1, 2, 3].map((fromGear) => {
    const points = Array.from({ length: 21 }, (_, index) => {
      const pedal = index / 20
      const threshold = automaticShiftThresholds(pedal).upshift[fromGear]
      const x = 38 + threshold / 130 * 296
      const y = 154 - pedal * 122
      return `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`
    }).join(' ')
    return { fromGear, path: points }
  }), [])
  const dotX = 38 + clamp(speedKph, 0, 130) / 130 * 296
  const dotY = 154 - clamp(throttle, 0, 1) * 122

  return (
    <figure className="auto-shift-map">
      <figcaption><span>Live shift map</span><strong>More pedal moves each upshift line right</strong></figcaption>
      <svg viewBox="0 0 360 180" role="img"
        aria-label={`${speedKph.toFixed(0)} kilometers per hour and ${(throttle * 100).toFixed(0)} percent pedal; gear ${gear}${targetGear !== gear ? ` targeting gear ${targetGear}` : ''}`}>
        <rect x="38" y="25" width="296" height="129" rx="3" className="auto-map-field" />
        {[0, 40, 80, 120].map((speed) => {
          const x = 38 + speed / 130 * 296
          return <g key={speed}><line x1={x} y1="25" x2={x} y2="154" /><text x={x} y="170">{speed}</text></g>
        })}
        {[0, 50, 100].map((pedal) => {
          const y = 154 - pedal / 100 * 122
          return <g key={pedal}><line x1="38" y1={y} x2="334" y2={y} /><text x="29" y={y + 3}>{pedal}</text></g>
        })}
        {paths.map(({ fromGear, path }) => <path key={fromGear} d={path}
          className={`auto-map-line auto-map-line--${fromGear}`} />)}
        <text x="335" y="170" className="auto-map-axis">km/h</text>
        <text x="7" y="19" className="auto-map-axis">PEDAL %</text>
        <circle cx={dotX} cy={dotY} r="8" className="auto-map-dot-halo" />
        <circle cx={dotX} cy={dotY} r="4.5" className="auto-map-dot" />
        <text x={Math.min(305, dotX + 10)} y={Math.max(31, dotY - 9)} className="auto-map-live-label">G{targetGear}</text>
      </svg>
      <div className="auto-map-legend">
        {[1, 2, 3].map((fromGear) => <span key={fromGear} style={{ '--gear-tone': GEAR_COLORS[fromGear] }}>{fromGear}→{fromGear + 1}</span>)}
      </div>
    </figure>
  )
}

export default function AutomaticLab() {
  const { perspectiveInputRef, releasePerspective } = usePerspectiveInput()
  const [throttle, setThrottle] = useState(DEFAULTS.throttle)
  const [speedKph, setSpeedKph] = useState(DEFAULTS.speedKph)
  const [gear, setGear] = useState(DEFAULTS.gear)
  const [shift, setShift] = useState(null)
  const [lastShift, setLastShift] = useState(null)
  const [demo, setDemo] = useState(null)
  const [resetSignal, setResetSignal] = useState(0)
  const [webglLost, setWebglLost] = useState(false)
  const [rendererKey, setRendererKey] = useState(0)
  const demoTimers = useRef([])

  const decision = useMemo(() => automaticGearDecision({
    speedKph,
    throttle: throttle / 100,
    currentGear: gear,
  }), [gear, speedKph, throttle])

  useEffect(() => {
    if (shift || !decision.willShift) return undefined
    const snapshot = shiftSnapshot(0)
    const timer = window.setTimeout(() => {
      setShift({
        id: `${gear}-${decision.targetGear}-${Date.now()}`,
        from: gear,
        to: decision.targetGear,
        startedAt: performance.now(),
        reason: decision.reason,
        reasonDetail: decision.reasonDetail,
        ...snapshot,
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [decision.reason, decision.reasonDetail, decision.targetGear, decision.willShift, gear, shift])

  useEffect(() => {
    if (!shift?.startedAt) return undefined
    const timer = window.setInterval(() => {
      setShift((current) => {
        if (!current) return current
        const elapsed = performance.now() - current.startedAt
        if (elapsed >= SHIFT_TOTAL_MS) return { ...current, ...shiftSnapshot(SHIFT_TOTAL_MS) }
        return { ...current, ...shiftSnapshot(elapsed) }
      })
    }, 40)
    const fromRatio = Math.abs(getGearRatio(shift.from))
    const toRatio = Math.abs(getGearRatio(shift.to))
    const completionTimer = window.setTimeout(() => {
      setGear(shift.to)
      setLastShift({
        from: shift.from,
        to: shift.to,
        reason: shift.reason,
        direction: shift.to > shift.from ? 'up' : 'down',
        fromRatio,
        toRatio,
        rpmChange: toRatio / fromRatio - 1,
        torqueChange: toRatio / fromRatio - 1,
      })
      setShift((current) => current?.id === shift.id ? null : current)
    }, SHIFT_TOTAL_MS)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(completionTimer)
    }
  }, [shift?.from, shift?.id, shift?.reason, shift?.startedAt, shift?.to])

  useEffect(() => {
    if (demo !== 'launch') return undefined
    const startedAt = performance.now()
    const timer = window.setInterval(() => {
      const nextSpeed = Math.min(108, (performance.now() - startedAt) * .01)
      setSpeedKph(nextSpeed)
      if (nextSpeed >= 108) setDemo(null)
    }, 50)
    return () => window.clearInterval(timer)
  }, [demo])

  useEffect(() => () => {
    demoTimers.current.forEach((timer) => window.clearTimeout(timer))
  }, [])

  const clearDemoTimers = useCallback(() => {
    demoTimers.current.forEach((timer) => window.clearTimeout(timer))
    demoTimers.current = []
  }, [])

  const stopDemo = useCallback(() => {
    clearDemoTimers()
    setDemo(null)
  }, [clearDemoTimers])

  const runLaunch = () => {
    stopDemo()
    setShift(null)
    setLastShift(null)
    setGear(1)
    setSpeedKph(0)
    setThrottle(62)
    setDemo('launch')
  }

  const runKickdown = () => {
    stopDemo()
    setShift(null)
    setLastShift(null)
    setGear(4)
    setSpeedKph(72)
    setThrottle(18)
    setDemo('kickdown')
    demoTimers.current.push(window.setTimeout(() => setThrottle(90), 900))
    demoTimers.current.push(window.setTimeout(() => setDemo(null), 7600))
  }

  const setCruise = () => {
    stopDemo()
    setShift(null)
    setLastShift(null)
    setGear(4)
    setSpeedKph(88)
    setThrottle(20)
  }

  const reset = () => {
    stopDemo()
    setThrottle(DEFAULTS.throttle)
    setSpeedKph(DEFAULTS.speedKph)
    setGear(DEFAULTS.gear)
    setShift(null)
    setLastShift(null)
    releasePerspective()
    setResetSignal((value) => value + 1)
  }

  const chooseThrottle = (value) => { stopDemo(); setThrottle(value) }
  const chooseSpeed = (value) => { stopDemo(); setSpeedKph(value) }
  const torqueTransfer = torqueTransferForShift(shift)
  const displayedGear = shift && (shift.stage === 'select' || shift.stage === 'apply') ? shift.to : shift?.from ?? gear
  const speedMps = speedKph / 3.6
  const wheelRpm = speedMps / (2 * Math.PI * WHEEL_RADIUS) * 60
  const outputRpm = wheelRpm * FINAL_DRIVE_RATIO
  const ratio = Math.abs(getGearRatio(displayedGear))
  const coupledInputRpm = outputRpm * ratio
  const converterSlip = 110 + throttle * 5.8 + (shift ? (1 - torqueTransfer) * 760 : 0)
  const engineRpm = clamp(Math.max(850, coupledInputRpm + converterSlip), 850, REDLINE_RPM)
  const engine = engineOutput({ rpm: engineRpm, throttle: throttle / 100 })
  const transmission = transmissionKinematics({
    engineRpm,
    engineTorque: engine.torqueNm,
    speed: speedMps,
    wheelRadius: WHEEL_RADIUS,
    gear: displayedGear,
    torqueTransfer,
  })
  const targetGear = shift?.to ?? decision.targetGear
  const application = TEACHING_GEAR_APPLICATIONS[targetGear]
  const reason = shift?.reasonDetail ?? decision.reasonDetail
  const phaseIndex = shift ? shift.phaseIndex + 2 : decision.willShift ? 1 : 0
  const shiftLabel = shift ? `G${shift.from} → G${shift.to} · ${SHIFT_PHASES[shift.phaseIndex].short}` : `Gear ${gear} held`
  const threshold = decision.nextUpshiftKph
  const retryRenderer = () => { setWebglLost(false); setRendererKey((value) => value + 1) }
  const rendererReady = ({ gl }) => {
    gl.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault()
      setWebglLost(true)
    }, { once: true })
  }

  const lastShiftSentence = lastShift
    ? lastShift.direction === 'up'
      ? `G${lastShift.from}→G${lastShift.to}: engine/input rpm falls ${Math.abs(lastShift.rpmChange * 100).toFixed(0)}% at the same road speed; ideal torque multiplication falls by the same proportion.`
      : `G${lastShift.from}→G${lastShift.to}: engine/input rpm rises ${Math.abs(lastShift.rpmChange * 100).toFixed(0)}% and the lower ratio restores more wheel leverage.`
    : 'Cross a shift line or run a demo to compare the old and new ratios.'

  return (
    <div className="lab-layout lab-layout--cake-box auto-layout">
      <section className="demo-pane demo-pane--automatic" aria-label="Interactive exploded automatic transmission controlled by pedal demand and road speed">
        <div className="scene-toolbar"><SceneBadge>{speedKph.toFixed(0)} km/h · {shiftLabel}</SceneBadge><ResetButton onClick={reset} /></div>
        <p className="auto-scene-help">Drag or use arrows to orbit · hover ? labels for details</p>
        <section className={`auto-decision-card ${shift ? 'is-shifting' : ''}`} aria-live="polite">
          <header><span>Transmission controller</span><strong>{shift ? `SHIFT G${shift.from} → G${shift.to}` : `HOLD G${gear}`}</strong></header>
          <div><span><small>Driver request</small><b>{throttle}% pedal</b></span><i>+</i><span><small>Output sensor</small><b>{speedKph.toFixed(0)} km/h</b></span><i>→</i><span><small>Decision</small><b>G{targetGear}</b></span></div>
          <p>{reason}</p>
        </section>
        {webglLost ? <RenderFallback onRetry={retryRenderer} /> : (
          <Canvas key={rendererKey} camera={{ position: [7.9, 5.25, 8.8], fov: 42 }} shadows dpr={[1, 1.35]}
            onCreated={rendererReady} fallback={<RenderFallback onRetry={retryRenderer} />}>
            <AutomaticScene throttle={throttle / 100} speedKph={speedKph} gear={gear} targetGear={targetGear}
              shift={shift} torqueTransfer={torqueTransfer} inputRpm={coupledInputRpm} outputRpm={outputRpm}
              perspectiveInputRef={perspectiveInputRef} resetSignal={resetSignal} />
          </Canvas>
        )}
        <div className="auto-shift-ribbon" aria-label="Automatic shift sequence">
          {['Sense', 'Decide', ...SHIFT_PHASES.map((phase) => phase.short), 'New ratio'].map((item, index) => {
            const active = shift ? index === phaseIndex : index === 0
            const complete = shift ? index < phaseIndex : false
            return <span key={item} className={`${active ? 'is-active' : ''} ${complete ? 'is-complete' : ''}`}><b>{index + 1}</b>{item}</span>
          })}
        </div>
      </section>

      <aside className="lesson-pane auto-lesson-pane">
        <SectionHeader kicker="Experiment 03 · Automatic shifting" title="The driver selects Drive. The controller selects the ratio.">
          This conventional four-speed automatic compares accelerator demand with vehicle speed, then uses solenoids and hydraulic pressure to swap the friction elements that control its planetary gears.
        </SectionHeader>

        <section className="control-group auto-controls" aria-label="Automatic transmission inputs">
          <header className="group-title"><span>Give the controller two inputs</span><small>{demo ? `${demo} demo running` : 'Live bench'}</small></header>
          <Slider label="Accelerator request" value={throttle} min={0} max={100} unit="%" onChange={chooseThrottle}
            hint="More pedal asks for power, so the controller holds lower gears longer or kicks down." />
          <Slider label="Vehicle speed" value={speedKph} min={0} max={130} unit=" km/h" accent="#28778c" onChange={chooseSpeed}
            hint="The output-shaft sensor tells the controller how fast the road side of the transmission is turning." />
          <div className="auto-demo-buttons">
            <button type="button" onClick={runLaunch}><Play size={15} /> 0→108 launch</button>
            <button type="button" onClick={runKickdown}><Zap size={15} /> Kickdown</button>
            <button type="button" onClick={setCruise}><Gauge size={15} /> Easy cruise</button>
          </div>
        </section>

        <section className="auto-why-card" aria-live="polite">
          <header><span>Why gear {targetGear}?</span><strong>{speedKph.toFixed(0)} km/h + {throttle}% pedal → G{targetGear}</strong></header>
          <p>{reason}</p>
          <div>
            <span><small>Current ratio</small><b>{getGearRatio(displayedGear).toFixed(2)}:1</b></span>
            <span><small>Next upshift</small><b>{threshold ? `${threshold.toFixed(0)} km/h` : 'Top gear'}</b></span>
            <span><small>Clutches selected</small><b>{application?.circuits.map((circuit) => circuit.id).join(' + ') || 'Open'}</b></span>
          </div>
        </section>

        <ShiftMap throttle={throttle / 100} speedKph={speedKph} gear={gear} targetGear={targetGear} />

        <section className="auto-causal-chain">
          <h2>One decision becomes a mechanical handoff</h2>
          <FlowChain items={['Pedal + speed', 'TCM decision', 'Solenoid', 'Valve body', 'Clutch pair', 'Planetary ratio']} activeIndex={shift ? Math.min(5, shift.phaseIndex + 2) : decision.willShift ? 1 : 0} />
          <p><strong>The controller never slides a literal gear along a shaft.</strong> It changes which planetary member is driven or held by releasing one clutch/brake combination and applying another.</p>
        </section>

        <div className="metric-grid metric-grid--three auto-metrics">
          <Metric label="Engine" value={`${engineRpm.toFixed(0)} rpm`} tone="coral" />
          <Metric label="Gearbox output" value={`${outputRpm.toFixed(0)} rpm`} tone="blue" />
          <Metric label="Wheel leverage" value={`${(Math.abs(getGearRatio(displayedGear)) * FINAL_DRIVE_RATIO).toFixed(1)}×`} tone="violet" />
          <Metric label="Torque transfer" value={`${Math.round(torqueTransfer * 100)}%`} tone="yellow" />
          <Metric label="Gearbox torque" value={`${transmission.gearboxOutputTorque.toFixed(0)} N·m`} tone="coral" />
          <Metric label="Converter slip" value={`${Math.max(0, engineRpm - coupledInputRpm).toFixed(0)} rpm`} tone="blue" />
        </div>

        <section className="auto-result-card">
          <span>Mechanical consequence</span><strong>{lastShiftSentence}</strong>
          <p>During an upshift the road keeps the output shaft turning, so the input and engine slow to match the taller ratio. During kickdown the inverse happens: engine rpm and torque multiplication rise.</p>
        </section>

        <p className="motion-scope-note"><strong>Scope:</strong> this is a representative torque-converter, planetary automatic. Dual-clutch transmissions and CVTs select ratios differently.</p>
        <a className="next-lab" href="#simulator"><span>Final experiment</span><strong>Drive the complete car →</strong></a>
      </aside>
    </div>
  )
}

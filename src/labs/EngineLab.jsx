import { Canvas } from '@react-three/fiber'
import { Edges, Line, OrbitControls } from '@react-three/drei'
import { Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { Equation, FlowChain, Metric, Note, ResetButton, SceneBadge, SectionHeader, Segmented, Slider } from '../components/LabUI.jsx'
import { FlowDots, ForceArrow, PaintedBox, PartLabel, StudioFloor, StudioLights } from '../components/SceneKit.jsx'
import { engineOutput } from '../physics.js'

const STROKES = [
  { name: 'Intake', verb: 'Fill', color: '#3f9a9d', detail: 'Intake valve open · piston down' },
  { name: 'Compression', verb: 'Squeeze', color: '#76569b', detail: 'Both valves closed · piston up' },
  { name: 'Power', verb: 'Push', color: '#e6543f', detail: 'Spark + expanding gas · piston down' },
  { name: 'Exhaust', verb: 'Clear', color: '#d38d27', detail: 'Exhaust valve open · piston up' },
]
const ENGINE_AIR_PATH = [[-4.2, 1.15, 0], [-3.15, 1.15, 0], [-2.1, 1.45, 0], [-1.35, 1.38, 0]]
const ENGINE_FUEL_PATH = [[3.65, -0.85, 0.55], [2.7, -0.72, 0.5], [1.8, 0.55, 0.3], [-0.95, 1.58, 0.12]]
const ENGINE_EXHAUST_PATH = [[-0.65, 1.38, -0.05], [0.25, 1.48, -0.1], [1.05, 0.95, -0.16], [3.7, 0.92, -0.25]]

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

function Valve({ position, open, color }) {
  return (
    <group position={[position[0], position[1] - (open ? 0.18 : 0), position[2]]}>
      <mesh><cylinderGeometry args={[0.055, 0.055, 0.5, 12]} /><meshStandardMaterial color={color} roughness={0.55} /></mesh>
      <mesh position={[0, -0.25, 0]}><cylinderGeometry args={[0.18, 0.11, 0.08, 16]} /><meshStandardMaterial color={color} /></mesh>
    </group>
  )
}

function CycleEngine({ progress, throttle, rpm, spark, mode }) {
  const stroke = Math.floor(progress) % 4
  const radians = progress * Math.PI
  const crankRadius = 0.48
  const rodLength = 1.25
  const crankPin = [Math.sin(radians) * crankRadius, -1.18 + Math.cos(radians) * crankRadius, 0.06]
  const pistonY = crankPin[1] + Math.sqrt(rodLength ** 2 - crankPin[0] ** 2) + 0.15
  const load = effectiveLoad(throttle, rpm)
  const firing = spark && load > 0
  const pressure = cylinderPressure(progress, spark, throttle, rpm)
  const netGasForce = (pressure - 1) * 100000 * 0.0055
  const chargeColor = stroke === 0 ? '#66b8c0' : stroke === 1 ? '#ad94c7' : stroke === 2 && firing ? '#e6543f' : '#c6a574'
  const chargeScale = 0.48 + (pistonY + 0.68) * 0.18
  const fuelActive = load > 0 && stroke === 0

  return (
    <group>
      <StudioFloor size={18} y={-1.62} />

      <group>
        <PaintedBox size={[1.5, 0.7, 1.05]} position={[3.55, -0.9, 0.55]} color="#f2c348" opacity={mode === 'cycle' ? 0.3 : 1} />
        <PartLabel position={[3.55, -0.25, 0.55]} color="#8b6515">FUEL TANK · REAR OF CAR</PartLabel>
        <FlowDots points={ENGINE_FUEL_PATH} color="#f2c348" speed={0.4 + throttle / 50} count={11} active={fuelActive && mode !== 'energy'} />
        <FlowDots points={ENGINE_AIR_PATH} color="#3f9a9d" speed={0.6 + throttle / 70} count={10} active={stroke === 0 && mode !== 'energy'} />
        <FlowDots points={ENGINE_EXHAUST_PATH} color="#b47b45" speed={0.8} count={9} active={stroke === 3 && mode !== 'energy'} />
        <PartLabel position={[-3.4, 1.55, 0]} color="#347d80">AIR FILTER + THROTTLE</PartLabel>
        <PartLabel position={[2.65, 1.3, -0.1]} color="#8a6632">CATALYST → MUFFLER</PartLabel>
      </group>

      <group position={[-0.75, 0, 0]}>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[1.45, 2.55, 1.25]} />
          <meshStandardMaterial color="#e8d9c5" roughness={0.75} transparent opacity={0.23} side={THREE.DoubleSide} depthWrite={false} />
          <Edges color="#7a5b50" />
        </mesh>
        <PaintedBox size={[1.2, 0.28, 1.08]} position={[0, pistonY, 0]} color="#f4c95a" emissive="#e6543f" emissiveIntensity={stroke === 2 && spark ? throttle / 180 : 0} />
        <mesh position={[0, (pistonY + 1.18) / 2, 0]} scale={[chargeScale, Math.max(0.18, 1.15 - pistonY * 0.36), chargeScale]}>
          <sphereGeometry args={[0.72, 24, 16]} />
          <meshStandardMaterial color={chargeColor} transparent opacity={mode === 'energy' ? 0.72 : 0.43}
            emissive={chargeColor} emissiveIntensity={stroke === 2 && firing ? pressure / 34 : 0} depthWrite={false} />
        </mesh>
        <Line points={[[0, pistonY - 0.15, 0.03], crankPin]} color="#76569b" lineWidth={9} />
        <mesh position={crankPin}><sphereGeometry args={[0.16, 16, 12]} /><meshStandardMaterial color="#65468b" /></mesh>
        <mesh position={[0, -1.18, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.48, 0.07, 10, 28]} /><meshStandardMaterial color="#76569b" /></mesh>
        <Line points={[[0, -1.18, -0.58], [0, -1.18, 1.15]]} color="#76569b" lineWidth={7} />
        <Valve position={[-0.38, 1.65, 0]} open={stroke === 0} color="#3f9a9d" />
        <Valve position={[0.38, 1.65, 0]} open={stroke === 3} color="#d38d27" />
        <mesh position={[0, 1.72, 0.18]}>
          <cylinderGeometry args={[0.06, 0.06, 0.42, 10]} /><meshStandardMaterial color="#f7efe4" />
        </mesh>
        {firing && stroke === 2 && progress % 1 < 0.18 && (
          <group position={[0, 1.46, 0.18]}>
            <mesh><octahedronGeometry args={[0.19, 0]} /><meshBasicMaterial color="#fff7a8" /></mesh>
            <pointLight color="#ff9b56" intensity={5} distance={2.2} />
          </group>
        )}
        {mode === 'energy' && Math.abs(netGasForce) > 500 && (
          <ForceArrow from={[0.72, pistonY + 0.1, 0.4]} direction={[0, netGasForce >= 0 ? -1 : 1, 0]}
            length={Math.min(1.55, Math.abs(netGasForce) / 11000)} color="#e6543f" label="NET GAS FORCE" />
        )}
        {mode === 'energy' && <PartLabel position={[0.9, -1.25, 0.25]} color="#65468b">CRANKSHAFT TORQUE</PartLabel>}
      </group>
    </group>
  )
}

export default function EngineLab() {
  const [progress, setProgress] = useState(0.12)
  const [running, setRunning] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const [throttle, setThrottle] = useState(38)
  const [rpm, setRpm] = useState(2200)
  const [spark, setSpark] = useState(true)
  const [mode, setMode] = useState('path')

  useEffect(() => {
    if (!running) return undefined
    const timer = window.setInterval(() => {
      setProgress((current) => (current + 0.035 + rpm / 50000) % 4)
    }, 50)
    return () => window.clearInterval(timer)
  }, [rpm, running])

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
  const instantaneousTorque = pistonForce * 0.043 * Math.sin(progress * Math.PI)
  const output = engineOutput({ rpm, throttle: throttle / 100, spark })
  const fuelPerCycleMg = output.fuelRateGps > 0 ? (output.fuelRateGps / Math.max(1, rpm / 120 * 4)) * 1000 : 0
  const useful = output.powerKw > 0 ? Math.round(output.efficiency * 100) : 0

  const reset = () => { setProgress(0.12); setRunning(true); setThrottle(38); setRpm(2200); setSpark(true); setMode('path') }
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
        <Canvas camera={{ position: [8.5, 4.3, 8], fov: 42 }} shadows dpr={[1, 1.7]} gl={{ preserveDrawingBuffer: true }}>
          <color attach="background" args={['#f3e8d8']} />
          <StudioLights />
          <CycleEngine progress={progress} throttle={throttle} rpm={rpm} spark={spark} mode={mode} />
          <OrbitControls makeDefault enablePan={false} minDistance={6} maxDistance={14} target={[0, 0.15, 0]} maxPolarAngle={Math.PI * 0.48} />
        </Canvas>
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
          <Slider label="Crank angle" value={crankAngle} min={0} max={719} unit="°" onChange={(value) => { setProgress(value / 180); setRunning(false); setMode('cycle') }} accent="#76569b" />
          <Slider label="Accelerator request" value={throttle} min={0} max={100} unit="%" onChange={setThrottle} />
          <Slider label="Engine speed" value={rpm} min={800} max={6000} step={100} unit=" rpm" onChange={setRpm} accent="#28778c" />
          <label className="switch-row"><span><strong>Spark enabled</strong><small>Turn it off: air and fuel still enter, but useful torque vanishes.</small></span>
            <input type="checkbox" checked={spark} onChange={(event) => setSpark(event.target.checked)} /><i /></label>
        </div>

        <div className="metric-grid">
          <Metric label="Cylinder pressure" value={`${pressureBar.toFixed(1)} bar`} />
          <Metric label="Net gas force" value={`${pistonForce >= 0 ? '+' : ''}${(pistonForce / 1000).toFixed(1)} kN`} tone="blue" />
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
        <a className="next-lab" href="#motion"><span>Next experiment</span><strong>Send that torque to the tires →</strong></a>
      </aside>
    </div>
  )
}

import { OrbitControls, useCursor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { MotionDrivetrainModel } from '../components/MotionDrivetrainModel.jsx'
import { RenderFallback, ResetButton, SceneBadge, SectionHeader, Segmented, Slider } from '../components/LabUI.jsx'
import { ForceArrow, StudioFloor, StudioLights } from '../components/SceneKit.jsx'
import { MOTION_PARTS } from '../motionParts.js'
import { drivetrainOutput, engineOutput, getGearRatio, stepVehicle } from '../physics.js'
import { usePerspectiveInput } from '../usePerspectiveInput.js'

const INITIAL = { speed: 0, rpm: 850, heading: 0, x: 0, z: 0, gear: 1, mass: 1450, wheelRadius: 0.31, wheelbase: 2.7 }
const PART_BY_ID = Object.fromEntries(MOTION_PARTS.map((part) => [part.id, part]))

function MovingRoadMarks({ speed }) {
  const marks = useRef([])
  useFrame((_, delta) => {
    marks.current.forEach((mark) => {
      if (!mark) return
      mark.position.z += speed * delta
      if (mark.position.z > 6) mark.position.z -= 12
    })
  })
  return (
    <group>
      {[-2.65, 2.65].flatMap((x) => [-5, -3, -1, 1, 3, 5].map((z) => [x, z])).map(([x, z], index) => (
        <mesh key={`${x}-${z}`} ref={(node) => { marks.current[index] = node }} position={[x, -0.575, z]} receiveShadow>
          <boxGeometry args={[0.08, 0.018, 0.72]} /><meshStandardMaterial color="#fff0b4" roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

function MotionScene({ speed, rpm, throttle, gear, roadForce, activePart, hoveredPart, onHover, onSelect, perspectiveInputRef, viewResetSignal }) {
  const { camera } = useThree()
  const controls = useRef()
  const cameraTarget = useRef(new THREE.Vector3(0, -0.05, 0))
  const spherical = useRef(new THREE.Spherical())
  useCursor(Boolean(hoveredPart))
  const forceLength = Math.min(2.5, Math.max(0, roadForce) / 2200)
  const showForce = forceLength > 0.08

  useEffect(() => {
    camera.position.set(6.8, 4.6, 7.4)
    camera.lookAt(cameraTarget.current)
    if (controls.current) {
      controls.current.target.copy(cameraTarget.current)
      controls.current.update()
    }
  }, [camera, viewResetSignal])

  useFrame((_, delta) => {
    const input = perspectiveInputRef.current
    const horizontal = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    const vertical = (input.down ? 1 : 0) - (input.up ? 1 : 0)
    if (horizontal === 0 && vertical === 0) return
    const offset = camera.position.clone().sub(cameraTarget.current)
    spherical.current.setFromVector3(offset)
    spherical.current.theta += horizontal * delta * 1.25
    spherical.current.phi = THREE.MathUtils.clamp(spherical.current.phi + vertical * delta * 0.9, 0.36, 1.38)
    camera.position.copy(cameraTarget.current).add(offset.setFromSpherical(spherical.current))
    camera.lookAt(cameraTarget.current)
    controls.current?.update()
  })

  return (
    <>
      <color attach="background" args={['#e4cbb5']} />
      <StudioLights />
      <StudioFloor size={20} color="#d9bd83" y={-0.59} />
      <MovingRoadMarks speed={speed} />
      <MotionDrivetrainModel activePart={activePart} onHover={onHover} onSelect={onSelect}
        rpm={rpm} speed={speed} throttle={throttle} gear={gear} roadForce={roadForce} />
      {showForce && (
        <>
          <ForceArrow from={[-1.18, -0.53, 1.74]} direction={[0, 0, -1]} length={forceLength}
            color="#28778c" label="ROAD PUSHES CAR FORWARD" />
          <ForceArrow from={[1.18, -0.55, 1.74]} direction={[0, 0, 1]} length={forceLength}
            color="#e6543f" label="TIRE PUSHES ROAD BACK" />
        </>
      )}
      <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={6.7} maxDistance={15} target={[0, -0.05, 0]}
        minPolarAngle={0.48} maxPolarAngle={Math.PI * 0.46} />
    </>
  )
}

export default function MotionLab() {
  const { perspectiveInputRef, releasePerspective } = usePerspectiveInput()
  const [throttle, setThrottle] = useState(42)
  const [gear, setGear] = useState(1)
  const [vehicle, setVehicle] = useState(() => stepVehicle(INITIAL, { throttle: 0.42, gear: 1 }, 0))
  const [hoveredPart, setHoveredPart] = useState(null)
  const [selectedPart, setSelectedPart] = useState('engine')
  const [webglLost, setWebglLost] = useState(false)
  const [rendererKey, setRendererKey] = useState(0)
  const [viewResetSignal, setViewResetSignal] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVehicle((current) => stepVehicle(current, { throttle: throttle / 100, gear }, 0.05))
    }, 50)
    return () => window.clearInterval(timer)
  }, [gear, throttle])

  const output = vehicle.engine || engineOutput({ rpm: vehicle.rpm, throttle: throttle / 100 })
  const drivetrain = vehicle.drivetrain || drivetrainOutput({ engineTorque: output.torqueNm, gear, speed: vehicle.speed })
  const gearRatio = getGearRatio(gear)
  const gearboxTorque = output.torqueNm * gearRatio * 0.9
  const activePartId = hoveredPart || selectedPart
  const activePart = PART_BY_ID[activePartId] || PART_BY_ID.engine
  const speedKph = Math.abs(vehicle.speed) * 3.6
  const accelerationG = drivetrain.acceleration / 9.81
  const resistanceForce = drivetrain.aeroDrag + drivetrain.rollingResistance
  const roadForceDirection = drivetrain.tractionLimitedForce >= 0 ? 'forward' : 'backward'

  const liveValues = {
    metering: `${throttle}% accelerator request · ${output.fuelRateGps.toFixed(2)} g/s fuel`,
    engine: `${output.torqueNm.toFixed(0)} N·m at ${vehicle.rpm.toFixed(0)} rpm`,
    coupling: gear === 0 ? 'Engine turning; no drive gear selected' : 'Coupling carries rotation toward the selected gear',
    gearbox: gear === 0 ? 'Neutral · 0.00:1 · torque path open' : `Gear ${gear} · ${gearRatio.toFixed(2)}:1 · ${gearboxTorque.toFixed(0)} N·m after gearbox losses`,
    shaft: gear === 0 ? 'No driven torque in neutral' : `${gearboxTorque.toFixed(0)} N·m carried toward the rear axle`,
    differential: `${drivetrain.wheelTorque.toFixed(0)} N·m after the 3.90:1 final drive`,
    tires: `${Math.abs(drivetrain.tractionLimitedForce / 1000).toFixed(1)} kN ${roadForceDirection} force at the road`,
  }

  const reset = () => {
    setThrottle(42)
    setGear(1)
    setHoveredPart(null)
    setSelectedPart('engine')
    releasePerspective()
    setViewResetSignal((value) => value + 1)
    setVehicle(stepVehicle(INITIAL, { throttle: 0.42, gear: 1 }, 0))
  }
  const chooseGear = (value) => { setGear(value); setSelectedPart('gearbox') }
  const retryRenderer = () => { setWebglLost(false); setRendererKey((value) => value + 1) }
  const rendererReady = ({ gl }) => {
    gl.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault()
      setWebglLost(true)
    }, { once: true })
  }

  return (
    <div className="lab-layout lab-layout--cake-box motion-focus-layout">
      <section className="demo-pane demo-pane--motion" aria-label="Hoverable drivetrain showing how engine torque becomes road force">
        <div className="scene-toolbar"><SceneBadge>{speedKph.toFixed(0)} km/h · gear {gear === 0 ? 'N' : gear}</SceneBadge><ResetButton onClick={reset} /></div>
        <p className="motion-scene-help">Hover a part · click to pin · drag or use ← → to orbit · ↑ ↓ changes height</p>
        {webglLost ? <RenderFallback onRetry={retryRenderer} /> : (
          <Canvas key={rendererKey} camera={{ position: [6.8, 4.6, 7.4], fov: 40 }} shadows dpr={[1, 1.35]}
            style={{ cursor: hoveredPart ? 'pointer' : 'grab' }} onCreated={rendererReady} fallback={<RenderFallback onRetry={retryRenderer} />}>
            <MotionScene speed={vehicle.speed} rpm={vehicle.rpm} throttle={throttle / 100} gear={gear}
              roadForce={drivetrain.tractionLimitedForce} activePart={activePartId} hoveredPart={hoveredPart}
              onHover={setHoveredPart} onSelect={setSelectedPart} perspectiveInputRef={perspectiveInputRef} viewResetSignal={viewResetSignal} />
          </Canvas>
        )}

        <div className="motion-scene-inspector" style={{ '--part-color': activePart.color }}>
          <span>{activePart.number} · {activePart.short}</span>
          <strong>{activePart.summary}</strong>
          <b>{liveValues[activePart.id]}</b>
        </div>

        <div className="motion-torque-strip" aria-label="Live torque path">
          <span><small>Engine</small><b>{output.torqueNm.toFixed(0)} N·m</b></span>
          <i>× {gearRatio.toFixed(2)} gear × 3.90 final × 0.90</i>
          <span><small>Driven wheels</small><b>{drivetrain.wheelTorque.toFixed(0)} N·m</b></span>
          <i>÷ 0.31 m tire</i>
          <span><small>Road on car</small><b>{(drivetrain.tractionLimitedForce / 1000).toFixed(1)} kN</b></span>
        </div>
      </section>

      <aside className="lesson-pane motion-lesson-pane">
        <SectionHeader kicker="Experiment 02 · Torque to road" title="A turning shaft moves nothing until the tires push the road.">
          Trace one causal path through this rear-wheel-drive teaching car. Hover any numbered component to see what it contributes, then change accelerator request or gear and watch the live values propagate.
        </SectionHeader>

        <section className="motion-simple-controls" aria-label="Drivetrain experiment controls">
          <Slider label="Accelerator request" value={throttle} min={0} max={100} unit="%"
            onChange={(value) => { setThrottle(value); setSelectedPart('metering') }}
            hint="Requests more engine torque by admitting more air and matching fuel." />
          <div className="gear-selector">
            <span>Selected gear</span>
            <Segmented label="Transmission gear" value={gear} onChange={chooseGear}
              options={[{ value: 0, label: 'N' }, 1, 2, 3, 4].map((value) => typeof value === 'number' ? { value, label: String(value) } : value)} />
          </div>
          <p>Try first gear, then fourth: the engine can make similar torque while wheel torque changes dramatically.</p>
        </section>

        <section className="motion-part-inspector" style={{ '--part-color': activePart.color }}>
          <header><span>{activePart.number}</span><p><small>Inspecting</small><strong>{activePart.name}</strong></p></header>
          <output>{liveValues[activePart.id]}</output>
          <p><strong>{activePart.summary}</strong> {activePart.detail}</p>
        </section>

        <section className="motion-causal-story">
          <h2>Torque changes twice before the car moves</h2>
          <ol>
            <li><b>1</b><p><strong>The engine makes twist.</strong><span>Combustion pressure becomes {output.torqueNm.toFixed(0)} N·m at the crankshaft.</span></p></li>
            <li><b>2</b><p><strong>Gears trade speed for torque.</strong><span>{output.torqueNm.toFixed(0)} × {gearRatio.toFixed(2)} × 3.90 × 0.90 = {drivetrain.wheelTorque.toFixed(0)} N·m at the driven wheels.</span></p></li>
            <li><b>3</b><p><strong>The tire radius turns twist into force.</strong><span>{drivetrain.wheelTorque.toFixed(0)} N·m ÷ 0.31 m = {(drivetrain.driveForce / 1000).toFixed(1)} kN requested at the road.</span></p></li>
            <li><b>4</b><p><strong>The road accelerates the car.</strong><span>Grip supplies {Math.abs(drivetrain.tractionLimitedForce / 1000).toFixed(1)} kN {roadForceDirection}; resistance removes {(resistanceForce / 1000).toFixed(1)} kN, leaving {accelerationG >= 0 ? '+' : ''}{accelerationG.toFixed(2)} g.</span></p></li>
          </ol>

          <div className="motion-equation-line">
            <strong>τ<sub>wheel</sub> = τ<sub>engine</sub> × i<sub>gear</sub> × i<sub>final</sub> × η</strong>
            <p>Low gear multiplies torque more, but the wheels turn fewer times per engine revolution. No energy is created.</p>
          </div>
          <div className="motion-equation-line">
            <strong>F<sub>road</sub> = τ<sub>wheel</sub> ÷ r<sub>tire</sub> &nbsp;·&nbsp; a = ΣF ÷ m</strong>
            <p>The tire pushes backward; static friction from the road pushes the entire car forward, up to the grip limit.</p>
          </div>
        </section>

        <p className="motion-scope-note"><strong>What moved to the simulator:</strong> brakes, hydraulics, steering, and suspension are still fully explorable in the final tab. This window intentionally isolates the drivetrain.</p>
        <a className="next-lab" href="#simulator"><span>Final experiment</span><strong>Drive it with every system exposed →</strong></a>
      </aside>
    </div>
  )
}

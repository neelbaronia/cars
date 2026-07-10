import { Canvas, useFrame } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CarModel } from '../components/CarModel.jsx'
import { Equation, FlowChain, Metric, Note, RenderFallback, ResetButton, SceneBadge, SectionHeader, Segmented, Slider } from '../components/LabUI.jsx'
import { ForceArrow, StudioFloor, StudioLights } from '../components/SceneKit.jsx'
import { drivetrainOutput, engineOutput, getGearRatio, steeringOutput, stepVehicle } from '../physics.js'

function RoadRollers({ speed }) {
  const rollers = useRef([])
  useFrame((_, delta) => {
    rollers.current.forEach((roller) => {
      if (roller) roller.rotation.x += speed * delta / 0.42
    })
  })
  return (
    <group position={[0, -1.08, 0]}>
      {[-2.05, 2.05].flatMap((z) => [-1.55, 1.55].map((x) => [x, z])).map(([x, z], index) => (
        <mesh key={`${x}-${z}`} ref={(node) => { rollers.current[index] = node }} position={[x, 0, z]} rotation={[0, 0, Math.PI / 2]} receiveShadow>
          <cylinderGeometry args={[0.4, 0.4, 0.68, 20]} /><meshStandardMaterial color="#c48464" roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

function TurnGuide({ radius, steering }) {
  const points = useMemo(() => {
    if (Math.abs(steering) < 0.5 || Math.abs(radius) > 500) return [[0, -1.43, -3], [0, -1.43, -8]]
    const direction = Math.sign(steering)
    const displayRadius = Math.min(15, Math.abs(radius))
    return Array.from({ length: 35 }, (_, index) => {
      const theta = (index / 34) * 0.85
      return [direction * displayRadius * (1 - Math.cos(theta)), -1.43, -3 - displayRadius * Math.sin(theta)]
    })
  }, [radius, steering])
  return <Line points={points} color="#3f9a9d" lineWidth={4} dashed dashSize={0.35} gapSize={0.2} />
}

function MotionScene({ mode, speed, throttle, brake, steering, outputs }) {
  const focus = mode === 'brakes' ? 'brakes' : mode === 'steering' ? 'steering' : mode === 'power' ? 'power' : 'all'
  const driveLength = Math.min(2.8, Math.abs(outputs.drivetrain.tractionLimitedForce) / 2200)
  const resistance = outputs.drivetrain.brakeForce + outputs.drivetrain.aeroDrag + outputs.drivetrain.rollingResistance
  return (
    <>
      <color attach="background" args={['#e4cbb5']} />
      <StudioLights />
      <StudioFloor size={26} color="#f0d887" y={-1.46} />
      <RoadRollers speed={speed} />
      <group rotation={[Math.max(-0.035, Math.min(0.035, -outputs.drivetrain.acceleration * 0.012)), 0, 0]}>
        <CarModel bodyOpacity={0.16} focus={focus} throttle={throttle} brake={brake} steering={steering} speed={speed} labels explode={mode === 'power' ? 0.14 : 0} suspensionLoad={brake - throttle * 0.35} />
      </group>
      {(mode === 'road' || mode === 'power') && driveLength > 0.05 && (
        <ForceArrow from={[0, -0.85, 2.05]} direction={[0, 0, outputs.drivetrain.tractionLimitedForce >= 0 ? -1 : 1]}
          length={driveLength} color="#76569b" label="ROAD ON TIRE" />
      )}
      {mode === 'road' && resistance > 1 && (
        <ForceArrow from={[0, 0.35, -2.4]} direction={[0, 0, 1]} length={Math.min(2.4, resistance / 2800)} color="#e6543f" label="RESISTANCE" />
      )}
      {mode === 'steering' && <TurnGuide radius={outputs.steering.turnRadius} steering={steering} />}
      <OrbitControls makeDefault enablePan={false} minDistance={6} maxDistance={14} target={[0, 0, 0]} maxPolarAngle={Math.PI * 0.48} />
    </>
  )
}

const INITIAL = { speed: 0, rpm: 850, heading: 0, x: 0, z: 0, gear: 1, mass: 1450, wheelRadius: 0.31, wheelbase: 2.7 }

export default function MotionLab() {
  const [mode, setMode] = useState('power')
  const [throttle, setThrottle] = useState(42)
  const [brake, setBrake] = useState(0)
  const [steering, setSteering] = useState(0)
  const [gear, setGear] = useState(1)
  const [vehicle, setVehicle] = useState(() => stepVehicle(INITIAL, { throttle: 0.42, gear: 1 }, 0))
  const [webglLost, setWebglLost] = useState(false)
  const [rendererKey, setRendererKey] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVehicle((current) => stepVehicle(current, { throttle: throttle / 100, brake: brake / 100, steeringDeg: steering, gear }, 0.05))
    }, 50)
    return () => window.clearInterval(timer)
  }, [brake, gear, steering, throttle])

  const output = vehicle.engine || engineOutput({ rpm: vehicle.rpm, throttle: throttle / 100 })
  const drivetrain = vehicle.drivetrain || drivetrainOutput({ engineTorque: output.torqueNm, gear, brake: brake / 100, speed: vehicle.speed })
  const steeringState = vehicle.steering || steeringOutput({ speed: vehicle.speed, steeringDeg: steering })
  const outputs = { engine: output, drivetrain, steering: steeringState }
  const speedKph = Math.abs(vehicle.speed) * 3.6
  const brakePressure = brake * 0.9
  const kineticEnergyKj = 0.5 * 1450 * vehicle.speed ** 2 / 1000
  const radiusText = Math.abs(steeringState.turnRadius) > 1000 ? 'Straight' : `${Math.abs(steeringState.turnRadius).toFixed(1)} m`
  const accelerationG = drivetrain.acceleration / 9.81

  const reset = () => { setThrottle(42); setBrake(0); setSteering(0); setGear(1); setMode('power'); setVehicle(stepVehicle(INITIAL, { throttle: 0.42, gear: 1 }, 0)) }
  const retryRenderer = () => { setWebglLost(false); setRendererKey((value) => value + 1) }
  const rendererReady = ({ gl }) => {
    gl.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault()
      setWebglLost(true)
    }, { once: true })
  }

  return (
    <div className="lab-layout lab-layout--cake-box">
      <section className="demo-pane demo-pane--motion" aria-label="Interactive rolling chassis and drivetrain">
        <div className="scene-toolbar"><SceneBadge>{speedKph.toFixed(0)} km/h · gear {gear === 0 ? 'N' : gear}</SceneBadge><ResetButton onClick={reset} /></div>
        <div className="scene-mode scene-mode--four">
          <Segmented label="Chassis system" value={mode} onChange={setMode} options={[
            { value: 'power', label: 'Drivetrain' }, { value: 'road', label: 'Tire forces' }, { value: 'brakes', label: 'Brakes' }, { value: 'steering', label: 'Steering' },
          ]} />
        </div>
        {webglLost ? <RenderFallback onRetry={retryRenderer} /> : (
          <Canvas key={rendererKey} camera={{ position: [7.8, 5.6, 8.6], fov: 42 }} shadows dpr={[1, 1.35]}
            onCreated={rendererReady} fallback={<RenderFallback onRetry={retryRenderer} />}>
            <MotionScene mode={mode} speed={vehicle.speed} throttle={throttle / 100} brake={brake / 100} steering={steering} outputs={outputs} />
          </Canvas>
        )}
        <div className="hud-strip hud-strip--four">
          <span><small>Engine</small><b>{output.torqueNm.toFixed(0)} N·m</b></span>
          <span><small>At wheels</small><b>{drivetrain.wheelTorque.toFixed(0)} N·m</b></span>
          <span><small>Road force</small><b>{(drivetrain.tractionLimitedForce / 1000).toFixed(1)} kN</b></span>
          <span><small>Acceleration</small><b>{accelerationG >= 0 ? '+' : ''}{accelerationG.toFixed(2)} g</b></span>
        </div>
      </section>

      <aside className="lesson-pane">
        <SectionHeader kicker="Experiment 02 · Pedals to pavement" title="The tires push the road. The road pushes the car.">
          In this front-engine, rear-wheel-drive teaching sedan, every part trades speed, force, or direction. The road supplies the external force that finally moves the whole car.
        </SectionHeader>

        <div className="control-group">
          <div className="group-title"><span>Rolling chassis</span><small>Try first gear, then fourth</small></div>
          <Slider label="Accelerator" value={throttle} min={0} max={100} unit="%" onChange={(value) => { setThrottle(value); if (value > 0) setMode('power') }} />
          <Slider label="Brake pedal" value={brake} min={0} max={100} unit="%" onChange={(value) => { setBrake(value); if (value > 0) setMode('brakes') }} accent="#28778c" />
          <Slider label="Front wheel angle" value={steering} min={-28} max={28} unit="°" onChange={(value) => { setSteering(value); if (Math.abs(value) > 1) setMode('steering') }} accent="#3f9a9d" />
          <div className="gear-selector"><span>Gear</span><Segmented label="Transmission gear" value={gear} onChange={setGear}
            options={[{ value: 0, label: 'N' }, 1, 2, 3, 4, 5, 6].map((value) => typeof value === 'number' ? { value, label: String(value) } : value)} /></div>
        </div>

        <div className="metric-grid">
          <Metric label="Road speed" value={`${speedKph.toFixed(1)} km/h`} />
          <Metric label="Engine speed" value={`${vehicle.rpm.toFixed(0)} rpm`} tone="blue" />
          <Metric label="Brake pressure" value={`${brakePressure.toFixed(0)} bar`} tone="violet" />
          <Metric label="Turn radius" value={radiusText} tone="yellow" />
        </div>

        <section className="lesson-section">
          <h2>The accelerator asks for torque</h2>
          <FlowChain items={['Pedal sensor', 'Engine computer', 'Air + fuel + spark', 'Crank torque']} activeIndex={throttle > 0 ? 2 : -1} />
          <p className="body-copy body-copy--spaced">A modern pedal sends an electrical request. The engine computer opens the throttle for more air, meters fuel to match, and chooses spark timing. The result is crankshaft torque.</p>
        </section>

        <section className="lesson-section">
          <h2>Gears multiply torque—not energy</h2>
          <FlowChain items={['Crankshaft', 'Torque converter', 'Gearbox', 'Driveshaft', 'Differential', 'Axles']} activeIndex={gear === 0 ? 1 : 4} />
          <Equation caption="A low gear sends more torque to the wheels while they turn fewer times per engine revolution. Neutral breaks the torque path."
            values={`${output.torqueNm.toFixed(0)} × ${getGearRatio(gear).toFixed(2)} × 3.90 × 0.90 = ${drivetrain.wheelTorque.toFixed(0)} N·m`}>
            τ<sub>wheel</sub> = τ<sub>engine</sub> i<sub>gear</sub> i<sub>final</sub> η
          </Equation>
        </section>

        <section className="lesson-section">
          <h2>A turning tire needs the road</h2>
          <Equation caption="Wheel torque tries to twist the contact patch backward. Static friction from the road pushes the tire—and therefore the car—forward."
            values={`${drivetrain.wheelTorque.toFixed(0)} N·m ÷ 0.31 m = ${drivetrain.driveForce.toFixed(0)} N = ${(drivetrain.driveForce / 1000).toFixed(1)} kN before the grip limit`}>
            F<sub>drive</sub> = τ<sub>wheel</sub> ÷ r<sub>tire</sub>
          </Equation>
          <Equation caption="Drive force is opposed by rolling resistance, air drag, and braking. Their difference accelerates the car."
            values={`${(drivetrain.netForce / 1000).toFixed(1)} kN ÷ 1,450 kg = ${drivetrain.acceleration.toFixed(2)} m/s²`}>
            a = ΣF ÷ m
          </Equation>
          <Note>Static friction is whatever force is needed up to a limit; it is not always μN. If the requested tire force exceeds the available grip, the tire slips.</Note>
        </section>

        <section className="lesson-section">
          <h2>Hydraulics carry your brake command</h2>
          <FlowChain items={['Pedal + booster', 'Master cylinder', 'Fluid pressure', 'Calipers', 'Rotors', 'Tires']} activeIndex={brake > 0 ? 3 : -1} />
          <Equation caption="The master cylinder turns pedal force into fluid pressure. Larger caliper piston area turns that pressure back into a larger clamp force, at the cost of moving less distance."
            values={`This model: ${brake}% pedal → ${brakePressure.toFixed(0)} bar line pressure`}>
            p = F<sub>master</sub> ÷ A<sub>master</sub>
          </Equation>
          <Equation caption="Rotors absorb the car's kinetic energy as heat. Doubling speed makes four times the braking energy."
            values={`½ × 1,450 kg × ${Math.abs(vehicle.speed).toFixed(1)}² = ${(kineticEnergyKj * 1000).toFixed(0)} J = ${kineticEnergyKj.toFixed(0)} kJ`}>
            E<sub>kinetic</sub> = ½mv²
          </Equation>
          <Note>Calipers slow wheel rotation; tire-road forces slow the car. ABS rapidly modulates pressure to avoid sustained wheel lock and preserve steering.</Note>
        </section>

        <section className="lesson-section">
          <h2>Steering bends the velocity path</h2>
          <Equation caption="The rack and tie rods turn the front wheels. A larger angle makes a tighter circle; the inner front wheel must turn slightly farther than the outer one."
            values={`2.70 m ÷ tan(${Math.abs(steering).toFixed(0)}°) = ${radiusText}`}>
            R ≈ L ÷ tan(δ)
          </Equation>
          <Equation caption="Angled, deforming tire contact patches create sideways road force. That external force supplies the centripetal acceleration that bends the velocity path."
            values={`${Math.abs(vehicle.speed).toFixed(1)}² ÷ ${radiusText === 'Straight' ? '∞' : Math.abs(steeringState.turnRadius).toFixed(1)} = ${radiusText === 'Straight' ? '0.00' : (vehicle.speed ** 2 / Math.abs(steeringState.turnRadius)).toFixed(2)} m/s²`}>
            a<sub>lateral</sub> = v² ÷ R
          </Equation>
          <p className="body-copy body-copy--spaced">In a turn, the differential lets the inner and outer driven wheels rotate at different speeds because the outer wheel travels the longer path.</p>
          <p className="body-copy body-copy--spaced">Springs support the car and store bump energy. Oil-filled dampers dissipate bouncing. During braking, load shifts toward the front tires; during a turn, it shifts toward the outside tires.</p>
        </section>
        <a className="next-lab" href="#simulator"><span>Final experiment</span><strong>Drive it with every system exposed →</strong></a>
      </aside>
    </div>
  )
}

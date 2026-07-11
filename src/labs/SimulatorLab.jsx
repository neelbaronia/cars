import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { CAR_TIRE_EXPLODE_OFFSET, CarModel } from '../components/CarModel.jsx'
import { Equation, FlowChain, Metric, Note, RenderFallback, ResetButton, SceneBadge, SectionHeader, Segmented, Slider } from '../components/LabUI.jsx'
import { ForceArrow, StudioLights } from '../components/SceneKit.jsx'
import { clamp, stepVehicle } from '../physics.js'
import { usePerspectiveInput } from '../usePerspectiveInput.js'

const INITIAL_TELEMETRY = {
  speed: 0, rpm: 850, gear: 1, fuel: 44, brakePressure: 0, steeringDeg: 0,
  acceleration: 0, lateralG: 0, grip: 0, engineTorque: 0, driveForce: 0,
  resistanceForce: 0, brakeForce: 0, aeroDrag: 0, rollingResistance: 0,
  appliedThrottle: 0, parkingBrake: 0,
  brakeTemp: 22, status: 'Ready', x: 0, z: -42,
}
const CAR_VISUAL_SCALE = .68
const CAR_RIDE_HEIGHT = -1.07

function automaticGear(speed, throttle) {
  const kph = Math.max(0, speed * 3.6)
  const stretch = throttle > 0.72 ? 1.25 : throttle < 0.25 ? 0.8 : 1
  if (kph < 18 * stretch) return 1
  if (kph < 36 * stretch) return 2
  if (kph < 62 * stretch) return 3
  if (kph < 92 * stretch) return 4
  if (kph < 130 * stretch) return 5
  return 6
}

function initialSimulationState() {
  const seeded = stepVehicle({
    speed: 0, rpm: 850, heading: 0, x: 0, z: -42, gear: 1,
    mass: 1450, wheelRadius: 0.31, wheelbase: 2.7,
  }, { throttle: 0, brake: 0, steeringDeg: 0, gear: 1 }, 0)
  return { ...seeded, fuel: 44, brakeTemp: 22 }
}

function TestTrack() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
        <planeGeometry args={[420, 420]} /><meshStandardMaterial color="#8fc69c" roughness={0.98} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.485, 0]} receiveShadow>
        <planeGeometry args={[12, 390]} /><meshStandardMaterial color="#596c6d" roughness={0.93} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.477, 54]} receiveShadow>
        <planeGeometry args={[180, 10]} /><meshStandardMaterial color="#596c6d" roughness={0.93} />
      </mesh>
      {Array.from({ length: 54 }, (_, index) => (
        <mesh key={`dash-main-${index}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.465, index * 7 - 185]}>
          <planeGeometry args={[0.18, 3.4]} /><meshBasicMaterial color="#f7e4a6" />
        </mesh>
      ))}
      {Array.from({ length: 24 }, (_, index) => (
        <mesh key={`dash-cross-${index}`} rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[index * 7 - 80, -1.46, 54]}>
          <planeGeometry args={[0.18, 3.4]} /><meshBasicMaterial color="#f7e4a6" />
        </mesh>
      ))}
      {[-5.5, 5.5].map((x) => <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, -1.46, 0]}>
        <planeGeometry args={[0.14, 390]} /><meshBasicMaterial color="#fff8dd" />
      </mesh>)}
      {Array.from({ length: 9 }, (_, index) => {
        const z = 18 + index * 10
        const x = index % 2 === 0 ? -2.6 : 2.6
        return <group key={`cone-${index}`} position={[x, -1.42, z]}>
          <mesh><coneGeometry args={[0.28, 0.72, 12]} /><meshStandardMaterial color="#e6543f" /></mesh>
          <mesh position={[0, -0.34, 0]}><cylinderGeometry args={[0.38, 0.38, 0.06, 12]} /><meshStandardMaterial color="#fff0cb" /></mesh>
        </group>
      })}
      {[-1, 1].flatMap((side) => Array.from({ length: 16 }, (_, index) => (
        <group key={`tree-${side}-${index}`} position={[side * (14 + (index % 3) * 4), -1.2, index * 22 - 155]}>
          <mesh position={[0, 1.1, 0]}><cylinderGeometry args={[0.15, 0.2, 2.2, 8]} /><meshStandardMaterial color="#956542" /></mesh>
          <mesh position={[0, 2.45, 0]}><sphereGeometry args={[1.1, 14, 10]} /><meshStandardMaterial color={index % 2 ? '#eec35b' : '#e99aab'} roughness={0.9} /></mesh>
        </group>
      )))}
      <Grid args={[420, 420]} position={[0, -1.455, 0]} cellSize={7} cellThickness={0.25} cellColor="#6da57a" sectionSize={35} sectionThickness={0.45} sectionColor="#5f966f" fadeDistance={210} fadeStrength={1} infiniteGrid={false} />
    </group>
  )
}

function DriveScene({ inputRef, perspectiveInputRef, displayTelemetry, driveMode, focus, explode, commands, cameraMode, resetSignal, onTelemetry, onCameraView }) {
  const { camera } = useThree()
  const car = useRef()
  const accumulator = useRef(0)
  const reportClock = useRef(0)
  const steeringVisual = useRef(0)
  const cameraYaw = useRef(0)
  const cameraElevationOffset = useRef(0)
  const cameraReportClock = useRef(0)
  const state = useRef(initialSimulationState())

  useEffect(() => {
    state.current = initialSimulationState()
    steeringVisual.current = 0
    accumulator.current = 0
    reportClock.current = 0
  }, [resetSignal])

  useEffect(() => {
    cameraYaw.current = 0
    cameraElevationOffset.current = 0
    onCameraView({ yaw: 0, elevation: cameraMode === 'top' ? 81 : 22 })
  }, [cameraMode, onCameraView, resetSignal])

  useFrame((_, frameDelta) => {
    const fixedStep = 1 / 120
    accumulator.current += Math.min(frameDelta, 0.05)
    let lastThrottle = 0
    let lastServiceBrake = 0
    let lastParkingBrake = 0
    let lastSteering = steeringVisual.current
    let cameraShiftX = 0
    let cameraShiftZ = 0

    while (accumulator.current >= fixedStep) {
      const input = inputRef.current
      // Positive steering is a left turn in the physics model; map the driver-facing A/D controls accordingly.
      const steeringTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0)
      const steeringRate = steeringTarget === 0 ? 5.2 : 7.5
      steeringVisual.current += (steeringTarget * 30 - steeringVisual.current) * Math.min(1, steeringRate * fixedStep)
      const fuelAvailable = state.current.fuel > 0.001
      const directionReady = driveMode === 'R' ? state.current.speed < 0.25 : driveMode === 'D' ? state.current.speed > -0.25 : false
      const throttle = input.gas && fuelAvailable ? 1 : 0
      const serviceBrake = input.brake ? 0.88 : 0
      const parkingBrake = input.handbrake ? 0.55 : 0
      const brake = Math.max(serviceBrake, parkingBrake)
      const gear = !directionReady || driveMode === 'N' ? 'N' : driveMode === 'R' ? 'R' : automaticGear(state.current.speed, throttle)
      const movementDirection = Math.abs(state.current.speed) > 0.05
        ? Math.sign(state.current.speed)
        : Math.sign(state.current.drivetrain.tractionLimitedForce)
      const tireLongitudinalForce = state.current.drivetrain.tractionLimitedForce
        - movementDirection * state.current.drivetrain.brakeForce
      const longitudinalTireAcceleration = tireLongitudinalForce / state.current.mass
      const lateralBudget = Math.sqrt(Math.max(0.2, (0.9 * 9.81) ** 2 - longitudinalTireAcceleration ** 2))
      const gripLimitedSteering = Math.abs(state.current.speed) < 2
        ? 30
        : Math.atan((lateralBudget * state.current.wheelbase) / state.current.speed ** 2) * 180 / Math.PI
      const physicsSteering = clamp(steeringVisual.current, -gripLimitedSteering, gripLimitedSteering)
      const next = stepVehicle(state.current, { throttle, brake, steeringDeg: physicsSteering, gear }, fixedStep)
      next.speed = clamp(next.speed, -10, 58)
      const fuelUsed = next.engine.fuelRateGps / 745 * fixedStep
      next.fuel = Math.max(0, state.current.fuel - fuelUsed)
      const brakePower = next.drivetrain.brakeForce * Math.abs(next.speed)
      next.brakeTemp = Math.max(22, state.current.brakeTemp + brakePower / 150000 * fixedStep - (state.current.brakeTemp - 22) * 0.018 * fixedStep)
      if (next.x > 180) { next.x -= 360; cameraShiftX -= 360 }
      if (next.x < -180) { next.x += 360; cameraShiftX += 360 }
      if (next.z > 180) { next.z -= 360; cameraShiftZ -= 360 }
      if (next.z < -180) { next.z += 360; cameraShiftZ += 360 }
      state.current = next
      lastThrottle = throttle
      lastServiceBrake = serviceBrake
      lastParkingBrake = parkingBrake
      lastSteering = physicsSteering
      accumulator.current -= fixedStep
    }

    const current = state.current
    const position = new THREE.Vector3(current.x, CAR_RIDE_HEIGHT, current.z)
    const forward = new THREE.Vector3(Math.sin(current.heading), 0, Math.cos(current.heading))
    if (cameraShiftX || cameraShiftZ) camera.position.add(new THREE.Vector3(cameraShiftX, 0, cameraShiftZ))
    if (car.current) {
      car.current.position.copy(position)
      car.current.rotation.y = current.heading + Math.PI
      const longitudinalTilt = clamp(-current.drivetrain.acceleration * 0.012, -0.07, 0.07)
      const lateralAcceleration = current.speed * current.steering.yawRate
      car.current.rotation.x = longitudinalTilt
      car.current.rotation.z = clamp(-lateralAcceleration * 0.016, -0.11, 0.11)
    }

    const cameraInput = perspectiveInputRef.current
    const yawDirection = (cameraInput.right ? 1 : 0) - (cameraInput.left ? 1 : 0)
    const elevationDirection = (cameraInput.up ? 1 : 0) - (cameraInput.down ? 1 : 0)
    cameraYaw.current += yawDirection * frameDelta * 1.25
    cameraYaw.current = Math.atan2(Math.sin(cameraYaw.current), Math.cos(cameraYaw.current))
    cameraElevationOffset.current += elevationDirection * frameDelta * 0.72

    const baseElevation = cameraMode === 'top' ? 1.42 : .39
    const elevation = cameraMode === 'top'
      ? clamp(baseElevation + cameraElevationOffset.current, 1.0, 1.52)
      : clamp(baseElevation + cameraElevationOffset.current, 0.2, 1.15)
    cameraElevationOffset.current = elevation - baseElevation
    cameraReportClock.current += frameDelta
    if ((yawDirection !== 0 || elevationDirection !== 0) && cameraReportClock.current > 0.08) {
      onCameraView({ yaw: Math.round(cameraYaw.current * 180 / Math.PI), elevation: Math.round(elevation * 180 / Math.PI) })
      cameraReportClock.current = 0
    }
    const cameraRadius = (cameraMode === 'top' ? 11.8 : 8.1) + explode * (cameraMode === 'top' ? .8 : 1.4)
    const rear = forward.clone().negate()
    // With y up, forward × up is the driver's/camera's right-hand side.
    const right = new THREE.Vector3(-forward.z, 0, forward.x)
    const horizontal = rear.multiplyScalar(Math.cos(cameraYaw.current)).addScaledVector(right, Math.sin(cameraYaw.current))
    const desired = position.clone()
      .addScaledVector(horizontal, cameraRadius * Math.cos(elevation))
      .add(new THREE.Vector3(0, cameraRadius * Math.sin(elevation), 0))
    camera.position.lerp(desired, 1 - Math.exp(-frameDelta * (cameraMode === 'top' ? 5 : 3.2)))
    const target = position.clone().addScaledVector(forward, cameraMode === 'top' ? 0 : 1.5).add(new THREE.Vector3(0, .55 + explode * .24, 0))
    camera.lookAt(target)

    reportClock.current += frameDelta
    if (reportClock.current > 0.075) {
      const lateralAcceleration = current.speed * current.steering.yawRate
      const movementDirection = Math.abs(current.speed) > 0.05 ? Math.sign(current.speed) : Math.sign(current.drivetrain.tractionLimitedForce)
      const tireLongitudinalForce = current.drivetrain.tractionLimitedForce - movementDirection * current.drivetrain.brakeForce
      const longitudinalTireG = tireLongitudinalForce / (current.mass * 9.81)
      const lateralG = lateralAcceleration / 9.81
      const grip = Math.min(120, Math.hypot(longitudinalTireG, lateralG) / 0.9 * 100)
      const status = lastServiceBrake > 0 || lastParkingBrake > 0 ? 'Braking'
        : lastThrottle > 0 && current.gear === 'N' && driveMode !== 'N' ? 'Stop to change direction'
          : lastThrottle > 0 && current.gear === 'N' ? 'Engine revving'
          : lastThrottle > 0 ? 'Accelerating' : Math.abs(current.speed) > 0.2 ? 'Coasting' : 'Ready'
      onTelemetry({
        speed: current.speed, rpm: current.rpm, gear: current.gear, fuel: current.fuel,
        brakePressure: lastServiceBrake * (90 / 0.88), parkingBrake: lastParkingBrake, steeringDeg: lastSteering,
        acceleration: current.drivetrain.acceleration, lateralG, grip,
        engineTorque: current.engine.torqueNm, driveForce: current.drivetrain.tractionLimitedForce,
        resistanceForce: current.drivetrain.brakeForce + current.drivetrain.aeroDrag + current.drivetrain.rollingResistance,
        brakeForce: current.drivetrain.brakeForce, aeroDrag: current.drivetrain.aeroDrag,
        rollingResistance: current.drivetrain.rollingResistance,
        appliedThrottle: lastThrottle,
        brakeTemp: current.brakeTemp, status, x: current.x, z: current.z,
      })
      reportClock.current = 0
    }
  })

  const showForces = focus === 'forces'
  const driveForce = displayTelemetry.driveForce
  const driveArrowLength = Math.min(2.6, Math.abs(driveForce) / 2200)
  const brakeArrowLength = Math.min(2.8, displayTelemetry.brakeForce / 4000)
  const dragArrowLength = Math.min(2.4, displayTelemetry.aeroDrag / 1000)
  const rollingArrowLength = Math.min(1.2, displayTelemetry.rollingResistance / 500)
  const wheelX = 1.57 + explode * CAR_TIRE_EXPLODE_OFFSET
  const shellOpacity = focus === 'body'
    ? THREE.MathUtils.lerp(.96, .1, explode)
    : focus === 'all' || focus === 'drive' || focus === 'live'
      ? THREE.MathUtils.lerp(.54, .05, explode)
      : focus === 'forces' ? THREE.MathUtils.lerp(.76, .18, explode) : THREE.MathUtils.lerp(.2, .04, explode)
  return (
    <>
      <color attach="background" args={['#87cad8']} />
      <fog attach="fog" args={['#9dd1d5', 75, 205]} />
      <StudioLights />
      <TestTrack />
      <group ref={car}>
        <group scale={CAR_VISUAL_SCALE}>
          <CarModel explode={explode} focus={focus} bodyOpacity={shellOpacity}
            throttle={displayTelemetry.appliedThrottle} rpm={displayTelemetry.rpm} gear={displayTelemetry.gear}
            brake={displayTelemetry.brakePressure / 90} parkingBrake={displayTelemetry.parkingBrake}
            steering={displayTelemetry.steeringDeg} speed={displayTelemetry.speed}
            suspensionLoad={clamp(-displayTelemetry.acceleration / 7, -0.5, 1)} commands={commands} />
          {showForces && (
            <group>
              {driveArrowLength > .05 && [-wheelX, wheelX].map((x, index) => <ForceArrow key={`drive-${x}`} from={[x, -.6, 2.05]}
                direction={[0, 0, driveForce >= 0 ? -1 : 1]} length={driveArrowLength} color="#76569b"
                label={index === 0 ? (driveForce >= 0 ? 'ROAD DRIVES CAR' : 'DRIVETRAIN DRAG') : undefined} />)}
              {brakeArrowLength > .05 && (displayTelemetry.brakePressure > 0
                ? [[-wheelX, -2.05], [wheelX, -2.05], [-wheelX, 2.05], [wheelX, 2.05]]
                : [[-wheelX, 2.05], [wheelX, 2.05]]).map(([x, z], index) => <ForceArrow key={`brake-${x}-${z}`}
                  from={[x, -.6, z]} direction={[0, 0, displayTelemetry.speed >= 0 ? 1 : -1]} length={brakeArrowLength}
                  color="#e6543f" label={index === 0 ? (displayTelemetry.brakePressure > 0 ? 'SERVICE BRAKES' : 'PARKING BRAKE') : undefined} />)}
              {rollingArrowLength > .05 && Math.abs(displayTelemetry.speed) > .05
                && [[-wheelX, -2.05], [wheelX, -2.05], [-wheelX, 2.05], [wheelX, 2.05]].map(([x, z], index) => <ForceArrow key={`rolling-${x}-${z}`}
                  from={[x, -.61, z]} direction={[0, 0, displayTelemetry.speed >= 0 ? 1 : -1]} length={rollingArrowLength}
                  color="#df9d34" label={index === 3 ? 'ROLLING LOSS' : undefined} />)}
              {dragArrowLength > .05 && Math.abs(displayTelemetry.speed) > .4 && <ForceArrow from={[0, .45, -.2]}
                direction={[0, 0, displayTelemetry.speed >= 0 ? 1 : -1]} length={dragArrowLength} color="#287f98" label="AERO DRAG" />}
            </group>
          )}
        </group>
      </group>
    </>
  )
}

function useDriveInput() {
  const inputRef = useRef({ gas: false, brake: false, left: false, right: false, handbrake: false })
  const [pressed, setPressed] = useState({ gas: false, brake: false, left: false, right: false, handbrake: false })

  const setControl = useCallback((control, active) => {
    inputRef.current = { ...inputRef.current, [control]: active }
    setPressed(inputRef.current)
  }, [])

  const releaseAll = useCallback(() => {
    inputRef.current = { gas: false, brake: false, left: false, right: false, handbrake: false }
    setPressed(inputRef.current)
  }, [])

  useEffect(() => {
    const keyMap = { w: 'gas', s: 'brake', a: 'left', d: 'right', ' ': 'handbrake' }
    const update = (event, active) => {
      const control = keyMap[event.key.toLowerCase()]
      if (!control) return
      if (event.target instanceof Element && event.target.closest('input, button, select, textarea, [contenteditable="true"]')) return
      event.preventDefault()
      setControl(control, active)
    }
    const onKeyDown = (event) => update(event, true)
    const onKeyUp = (event) => update(event, false)
    window.addEventListener('keydown', onKeyDown, { passive: false })
    window.addEventListener('keyup', onKeyUp, { passive: false })
    window.addEventListener('blur', releaseAll)
    document.addEventListener('visibilitychange', releaseAll)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseAll)
      document.removeEventListener('visibilitychange', releaseAll)
    }
  }, [releaseAll, setControl])

  const bind = (control) => ({
    onPointerDown: (event) => { event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); setControl(control, true) },
    onPointerUp: (event) => { event.preventDefault(); setControl(control, false) },
    onPointerCancel: () => setControl(control, false),
    onPointerLeave: (event) => { if (event.buttons === 0) setControl(control, false) },
    onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setControl(control, true) } },
    onKeyUp: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setControl(control, false) } },
    onBlur: () => setControl(control, false),
  })
  return { inputRef, pressed, bind, releaseAll }
}

export default function SimulatorLab() {
  const { inputRef, pressed, bind, releaseAll } = useDriveInput()
  const { perspectiveInputRef, releasePerspective } = usePerspectiveInput()
  const [driveMode, setDriveMode] = useState('D')
  const [focus, setFocus] = useState('body')
  const [explodePercent, setExplodePercent] = useState(0)
  const [cameraMode, setCameraMode] = useState('chase')
  const [cameraView, setCameraView] = useState({ yaw: 0, elevation: 22 })
  const [resetSignal, setResetSignal] = useState(0)
  const [telemetry, setTelemetry] = useState(INITIAL_TELEMETRY)
  const [webglLost, setWebglLost] = useState(false)
  const [rendererKey, setRendererKey] = useState(0)
  const speedKph = Math.abs(telemetry.speed) * 3.6
  const gearLabel = telemetry.gear === 'N' && driveMode !== 'N' ? `${driveMode} WAIT` : driveMode === 'D' ? telemetry.gear : driveMode
  const displayedTorque = Math.abs(telemetry.engineTorque) < 0.5 ? 0 : telemetry.engineTorque
  const displayedDriveForce = Math.abs(telemetry.driveForce) < 5 ? 0 : telemetry.driveForce
  const liveCommands = [
    pressed.gas && { key: 'W', label: 'Accelerator', path: 'Air + fuel → engine → driveshaft → rear wheels', color: '#76569b' },
    (pressed.left || pressed.right) && { key: pressed.left && pressed.right ? 'A + D' : pressed.left ? 'A' : 'D', label: 'Steering', path: 'Steering wheel → rack → tie rods → front wheels', color: '#2f9a96' },
    pressed.brake && { key: 'S', label: 'Service brake', path: 'Pedal → master cylinder → fluid → four calipers', color: '#287f98' },
    pressed.handbrake && { key: 'SPACE', label: 'Parking brake', path: 'Lever → rear brake mechanism → rear rotors', color: '#e6543f' },
  ].filter(Boolean)

  const reset = () => {
    releaseAll()
    releasePerspective()
    setTelemetry(INITIAL_TELEMETRY)
    setCameraView({ yaw: 0, elevation: 22 })
    setDriveMode('D'); setFocus('body'); setExplodePercent(0); setCameraMode('chase'); setResetSignal((value) => value + 1)
  }
  const retryRenderer = () => { setWebglLost(false); setRendererKey((value) => value + 1) }
  const rendererReady = ({ gl }) => {
    gl.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault()
      setWebglLost(true)
    }, { once: true })
  }

  return (
    <div className="lab-layout lab-layout--cake-box">
      <section className="demo-pane demo-pane--simulator" aria-label="Drivable car simulator with x-ray systems">
        <div className="scene-toolbar"><SceneBadge>{telemetry.status} · {speedKph.toFixed(0)} km/h</SceneBadge><ResetButton onClick={reset} /></div>
        <div className="scene-mode simulator-scene-mode">
          <Segmented label="Visible car system" value={focus} onChange={setFocus} options={[
            { value: 'body', label: 'Exterior' }, { value: 'live', label: 'Live' }, { value: 'power', label: 'Drivetrain' }, { value: 'brakes', label: 'Brakes' }, { value: 'steering', label: 'Steering' },
          ]} />
        </div>
        <div className="sim-camera-hint"><span>← →</span> orbit <span>↑ ↓</span> height <b>{cameraView.yaw}° / {cameraView.elevation}°</b></div>
        {explodePercent > 2 && (
          <div className="sim-command-trace" aria-live="polite">
            <header><span>Live mechanical response</span><small>{focus === 'live' ? 'Auto-highlighting is on' : 'Choose Live to highlight automatically'}</small></header>
            {liveCommands.length > 0 ? liveCommands.map((command) => (
              <div key={command.key} style={{ '--command-color': command.color }}><kbd>{command.key}</kbd><p><strong>{command.label}</strong><span>{command.path}</span></p></div>
            )) : <p className="sim-command-idle">Hold W, A/D, S, or Space to watch that command travel through the exploded car.</p>}
          </div>
        )}
        {webglLost ? <RenderFallback onRetry={retryRenderer} /> : (
          <Canvas key={rendererKey} camera={{ position: [0, 4.8, -51], fov: 48 }} shadows dpr={[1, 1.35]}
            onCreated={rendererReady} fallback={<RenderFallback onRetry={retryRenderer} />}>
            <DriveScene inputRef={inputRef} perspectiveInputRef={perspectiveInputRef} displayTelemetry={telemetry} driveMode={driveMode} focus={focus} explode={explodePercent / 100} commands={pressed}
              cameraMode={cameraMode} resetSignal={resetSignal} onTelemetry={setTelemetry} onCameraView={setCameraView} />
          </Canvas>
        )}

        <div className="drive-controls" aria-label="Touch driving controls">
          <button type="button" className={pressed.left ? 'is-active' : ''} {...bind('left')} aria-label="Steer left" aria-pressed={pressed.left}>A<br /><span>LEFT</span></button>
          <button type="button" className={`drive-gas ${pressed.gas ? 'is-active' : ''}`} {...bind('gas')} aria-label="Accelerator" aria-pressed={pressed.gas}>W<br /><span>GAS</span></button>
          <button type="button" className={`drive-brake ${pressed.brake ? 'is-active' : ''}`} {...bind('brake')} aria-label="Brake" aria-pressed={pressed.brake}>S<br /><span>BRAKE</span></button>
          <button type="button" className={pressed.right ? 'is-active' : ''} {...bind('right')} aria-label="Steer right" aria-pressed={pressed.right}>D<br /><span>RIGHT</span></button>
        </div>
        <div className="hud-strip hud-strip--sim">
          <span><small>Speed</small><b>{speedKph.toFixed(0)} km/h</b></span>
          <span><small>Engine</small><b>{telemetry.rpm.toFixed(0)} rpm</b></span>
          <span><small>Gear</small><b>{gearLabel}</b></span>
          <span><small>Tire demand</small><b>{telemetry.grip.toFixed(0)}%</b></span>
          <span><small>Fuel</small><b>{telemetry.fuel.toFixed(1)} L</b></span>
        </div>
      </section>

      <aside className="lesson-pane">
        <SectionHeader kicker="Experiment 03 · Drive + x-ray" title="Drive it. Pull it apart. Watch every command travel.">
          The exploded offsets are visual only: the same car physics continues underneath while fuel flows, shafts rotate, brake pressure builds, and steering links move.
        </SectionHeader>

        <div className="drive-instruction"><kbd>W</kbd><span>gas</span><kbd>A</kbd><kbd>D</kbd><span>steer</span><kbd>S</kbd><span>brake</span><kbd>space</kbd><span>parking brake</span><kbd>←</kbd><kbd>→</kbd><span>orbit</span><kbd>↑</kbd><kbd>↓</kbd><span>view height</span></div>

        <div className="control-group simulator-controls">
          <div className="group-title"><span>Driver + x-ray</span><small>Keyboard or scene buttons</small></div>
          <div className="control-pair"><label>Selector<Segmented label="Drive selector" value={driveMode} onChange={setDriveMode} options={['D', 'N', 'R']} /></label>
            <label>Camera<Segmented label="Camera" value={cameraMode} onChange={setCameraMode} options={[{ value: 'chase', label: 'Chase' }, { value: 'top', label: 'Top' }]} /></label></div>
          <Slider label="Exploded view" value={explodePercent} min={0} max={100} unit="%"
            onChange={setExplodePercent} accent="#76569b"
            hint="Pulls the body, cabin, seats, wheels, and live systems apart without changing the driving physics." />
          <div className="system-filter">
            <span>Trace a system</span>
            <Segmented label="X-ray system" value={focus} onChange={setFocus} options={[
              { value: 'body', label: 'None' }, { value: 'live', label: 'Live inputs' }, { value: 'all', label: 'All traces' }, { value: 'fuel', label: 'Fuel' }, { value: 'power', label: 'Drivetrain' }, { value: 'brakes', label: 'Hydraulics' },
              { value: 'steering', label: 'Steering' }, { value: 'suspension', label: 'Suspension' }, { value: 'forces', label: 'Forces' },
            ]} />
          </div>
        </div>

        <div className="metric-grid metric-grid--three">
          <Metric label="Engine torque" value={`${displayedTorque.toFixed(0)} N·m`} />
          <Metric label="Drive force" value={`${(displayedDriveForce / 1000).toFixed(1)} kN`} tone="violet" />
          <Metric label="Brake line" value={`${telemetry.brakePressure.toFixed(0)} bar`} tone="blue" />
          <Metric label="Steering" value={`${telemetry.steeringDeg.toFixed(1)}°`} tone="yellow" />
          <Metric label="Longitudinal" value={`${(telemetry.acceleration / 9.81).toFixed(2)} g`} tone="coral" />
          <Metric label="Lateral" value={`${telemetry.lateralG.toFixed(2)} g`} tone="blue" />
        </div>

        <section className="lesson-section">
          <h2>One live energy chain</h2>
          <FlowChain items={['Fuel', 'Hot gas', 'Crank', 'Gears', 'Tires', 'Road']} activeIndex={telemetry.appliedThrottle > 0 ? 4 : -1} />
          <Equation caption="The automatic transmission chooses a ratio, the final drive multiplies again, and tire radius turns wheel torque into road force. Tire grip caps the result."
            values={`${telemetry.engineTorque.toFixed(0)} N·m at the engine → ${(telemetry.driveForce / 1000).toFixed(1)} kN drive force at the road`}>
            F<sub>drive</sub> = τ<sub>engine</sub> i<sub>gear</sub> i<sub>final</sub> η ÷ r
          </Equation>
          <Note>Shift to neutral while rolling: the engine is disconnected, but air drag and tire deformation still slow the car. Select reverse explicitly; the brake pedal never becomes a reverse pedal.</Note>
        </section>

        <section className="lesson-section">
          <h2>Braking sends motion into heat</h2>
          <FlowChain items={['Foot force', 'Fluid pressure', 'Pad clamp', 'Rotor heat', 'Road force']} activeIndex={telemetry.brakePressure > 0 ? 3 : -1} />
          <p className="body-copy">Hold the brake and select the blue fluid view. Pressure travels from the master cylinder to all four calipers. The model's rotor-temperature proxy is now <strong>{telemetry.brakeTemp.toFixed(0)}°C</strong>.</p>
          <Equation caption="At twice the speed, the car carries four times the energy for its brakes and tires to remove."
            values={`At ${speedKph.toFixed(0)} km/h: ${Math.round(0.5 * 1450 * telemetry.speed ** 2)} J = ${Math.round(0.5 * 1450 * telemetry.speed ** 2 / 1000)} kJ`}>
            E<sub>kinetic</sub> = ½mv²
          </Equation>
          <Note>The Space control is a simplified rear-wheel parking brake, separate from the blue hydraulic service-brake circuit. Use S to trace pedal pressure through all four calipers.</Note>
        </section>

        <section className="lesson-section">
          <h2>Steering and braking share finite grip</h2>
          <Equation caption="A front-wheel angle produces yaw gradually. Faster speed at the same radius demands much more sideways tire force."
            values={`${Math.abs(telemetry.speed).toFixed(1)} m/s × tan(${Math.abs(telemetry.steeringDeg).toFixed(1)}°) ÷ 2.70 m`}>
            yaw rate ≈ v tan(δ) ÷ L
          </Equation>
          <div className="grip-meter" style={{ '--grip': `${Math.min(100, telemetry.grip)}%` }}><span /><b>{telemetry.grip.toFixed(0)}% combined tire demand</b></div>
          <p className="body-copy body-copy--spaced">Hard braking and hard cornering compete for the same contact-patch capability. The body pitches and rolls because those tire forces transfer load through the suspension.</p>
          <Note>The simplified model trims effective steering as the shared tire budget fills. A demand near 100% means there is almost no grip left for another command; a real tire asked for more begins to slide.</Note>
        </section>

        <section className="lesson-section challenge-list">
          <h2>Try three experiments</h2>
          <div><b>01</b><p><strong>Coast.</strong><span>Reach 30 km/h, release W, then watch resistance keep acting with no accelerator.</span></p></div>
          <div><b>02</b><p><strong>Trace a stop.</strong><span>Explode the car, choose Fluid, and brake. Follow foot → master cylinder → calipers → road.</span></p></div>
          <div><b>03</b><p><strong>Spend the grip.</strong><span>Hold a turn while adding speed, then brake too. Watch the combined tire-demand meter rise.</span></p></div>
        </section>
      </aside>
    </div>
  )
}

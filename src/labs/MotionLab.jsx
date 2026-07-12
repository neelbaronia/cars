import { OrbitControls, useCursor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ArrowDown, ArrowUp, Play } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { ExplodedMechanismModel } from '../components/ExplodedMechanismModel.jsx'
import { MotionDrivetrainModel } from '../components/MotionDrivetrainModel.jsx'
import { RenderFallback, ResetButton, SceneBadge, SectionHeader, Segmented, Slider } from '../components/LabUI.jsx'
import { ForceArrow, StudioFloor, StudioLights } from '../components/SceneKit.jsx'
import { MOTION_PARTS, TEACHING_GEAR_APPLICATIONS } from '../motionParts.js'
import { FINAL_DRIVE_RATIO, INLINE_FOUR_FIRING_EVENTS, REDLINE_RPM, drivetrainOutput, engineOutput, getGearRatio, openDifferentialKinematics, stepVehicle, transmissionKinematics } from '../physics.js'
import { usePerspectiveInput } from '../usePerspectiveInput.js'

const INITIAL = { speed: 0, rpm: 850, heading: 0, x: 0, z: 0, gear: 1, mass: 1450, wheelRadius: 0.31, wheelbase: 2.7 }
const PART_BY_ID = Object.fromEntries(MOTION_PARTS.map((part) => [part.id, part]))
const SHIFT_PHASES = [
  { id: 'torque-cut', label: 'Unload old clutch pair', short: 'Cut' },
  { id: 'release', label: 'Release old pair', short: 'Open' },
  { id: 'select', label: 'Route pressure to new pair', short: 'Route' },
  { id: 'apply', label: 'Clamp new pair', short: 'Clamp' },
]
const SHIFT_TRANSFER = { 'torque-cut': 0.32, release: 0, select: 0, apply: 0.55 }
const SHIFT_TIMING = { release: 650, select: 1350, apply: 2100, complete: 3000 }
const SHIFT_DEMO_SPACING = 3400
const GEAR_ROLES = [
  { gear: 1, role: 'Launch', note: 'Most wheel torque' },
  { gear: 2, role: 'Accelerate', note: 'Smaller step' },
  { gear: 3, role: 'Road speed', note: 'Speed rises' },
  { gear: 4, role: 'Cruise', note: 'Near direct drive' },
]
const STUDY_GEARS = [0, 1, 2, 3, 4]
const DIFFERENTIAL_TURNS = Object.freeze([
  Object.freeze({ id: 'left', label: '↶ Left turn', bias: .3 }),
  Object.freeze({ id: 'straight', label: '↑ Straight', bias: 0 }),
  Object.freeze({ id: 'right', label: 'Right turn ↷', bias: -.3 }),
])
const DIFFERENTIAL_TURN_BY_ID = Object.fromEntries(DIFFERENTIAL_TURNS.map((turn) => [turn.id, turn]))
const crankDegrees = (radians) => Math.round(radians * 180 / Math.PI)
const rotationDialDuration = (rpm) => `${Math.min(4, Math.max(.3, 1200 / Math.max(1, Math.abs(rpm))))}s`
const roadSpeedKphAtInputRpm = (rpm, gear) => {
  const ratio = Math.abs(getGearRatio(gear))
  if (!ratio) return 0
  const wheelRpm = rpm / ratio / FINAL_DRIVE_RATIO
  return wheelRpm * Math.PI * 2 * INITIAL.wheelRadius / 60 * 3.6
}

function CylinderCountLesson({ rpm }) {
  const eventsPerSecond = Math.max(0, rpm) * INLINE_FOUR_FIRING_EVENTS.length / 120
  return (
    <section className="cylinder-count-lesson" aria-label="Why a four-stroke engine uses multiple cylinders">
      <header><span>Why multiple cylinders?</span><strong>A new crankshaft push every 180°</strong></header>
      <p>One four-stroke cylinder produces one power stroke every two crank turns, or 720°. Four evenly phased cylinders divide that cycle into four power events.</p>
      <div className="cylinder-fire-sequence" aria-label="Four power events spaced at zero, 180, 360, and 540 crankshaft degrees">
        {INLINE_FOUR_FIRING_EVENTS.map((event) => (
          <span key={event.cylinder}><b>Cyl {event.cylinder}</b><i aria-hidden="true">●</i><small>{crankDegrees(event.firingAngle)}°</small></span>
        ))}
      </div>
      <div className="cylinder-event-rate">At {rpm.toFixed(0)} rpm: <strong>about {eventsPerSecond.toFixed(0)} power events each second</strong></div>
      <div className="cylinder-count-effects">
        <span><b>Smoother torque</b><small>Shorter gaps between pushes reduce crank-speed ripple; the flywheel blends the remaining pulses.</small></span>
        <span><b>More usable speed</b><small>Dividing displacement among smaller pistons can reduce each piston’s mass and make higher rpm practical.</small></span>
        <span><b>The cost</b><small>More pistons, valves, bearings, and surfaces add friction, weight, complexity, and expense.</small></span>
      </div>
      <p className="cylinder-count-caveat"><strong>Cylinder count alone does not set power.</strong> Total displacement, airflow, boost, combustion efficiency, and rpm matter too.</p>
      <p className="cylinder-count-caveat"><strong>1–3–4–2 is a common inline-four firing order.</strong> Other engine layouts can use different orders.</p>
    </section>
  )
}

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

function MotionScene({ speed, rpm, throttle, gear, engagedGear, requestedGear, torqueTransfer, shiftStage, roadForce, brake, brakePressureBar, brakeForce, transmission, activePart, hoveredPart, onHover, onSelect, onEnginePowerCylinder, perspectiveInputRef, viewResetSignal, studyPartId, differentialTurnBias }) {
  const { camera, size } = useThree()
  const controls = useRef()
  const cameraTarget = useRef(new THREE.Vector3(0, -0.05, 0))
  const overviewPosition = useRef(new THREE.Vector3(6.8, 4.6, 7.4))
  const overviewTarget = useRef(new THREE.Vector3(0, -0.05, 0))
  const previousStudy = useRef(null)
  const previousResetSignal = useRef(viewResetSignal)
  const spherical = useRef(new THREE.Spherical())
  useCursor(Boolean(hoveredPart) && !studyPartId)
  const forceLength = Math.min(2.5, Math.max(0, roadForce) / 2200)
  const showForce = forceLength > 0.08
  const narrowStudy = Boolean(studyPartId) && size.width / size.height < 1
  const studyTargetX = studyPartId === 'gearbox' && !narrowStudy ? -.62 : 0

  useEffect(() => {
    const wasStudying = Boolean(previousStudy.current)
    const explicitReset = previousResetSignal.current !== viewResetSignal
    if (studyPartId && !wasStudying) {
      overviewPosition.current.copy(camera.position)
      overviewTarget.current.copy(controls.current?.target || cameraTarget.current)
    }
    if (studyPartId) {
      cameraTarget.current.set(studyTargetX, 0, 0)
      camera.position.set(...(narrowStudy ? [7.8, 4.8, 8.9] : [5.6, 3.5, 6.4]))
    } else if (wasStudying && !explicitReset) {
      cameraTarget.current.copy(overviewTarget.current)
      camera.position.copy(overviewPosition.current)
    } else {
      cameraTarget.current.set(0, -0.05, 0)
      camera.position.set(6.8, 4.6, 7.4)
    }
    camera.lookAt(cameraTarget.current)
    if (controls.current) {
      controls.current.target.copy(cameraTarget.current)
      controls.current.update()
    }
    previousStudy.current = studyPartId
    previousResetSignal.current = viewResetSignal
  }, [camera, narrowStudy, studyPartId, studyTargetX, viewResetSignal])

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
      <color attach="background" args={[studyPartId ? '#ead9c8' : '#e4cbb5']} />
      <StudioLights />
      <StudioFloor size={20} color={studyPartId ? '#e8cc91' : '#d9bd83'} y={studyPartId ? -2.25 : -0.59} />
      {studyPartId ? (
        <ExplodedMechanismModel partId={studyPartId} rpm={rpm} speed={speed} throttle={throttle} gear={gear}
          engagedGear={engagedGear} targetGear={requestedGear} torqueTransfer={torqueTransfer} shiftStage={shiftStage || 'engaged'}
          inputRpm={transmission.inputRpm} outputRpm={transmission.outputRpm}
          gearboxTorque={transmission.gearboxOutputTorque} wheelTorque={transmission.wheelTorque} roadForce={roadForce}
          brake={brake} brakePressureBar={brakePressureBar} brakeForce={brakeForce}
          differentialTurnBias={differentialTurnBias}
          onEnginePowerCylinder={onEnginePowerCylinder} />
      ) : (
        <>
          <MovingRoadMarks speed={speed} />
          <MotionDrivetrainModel activePart={activePart} onHover={onHover} onSelect={onSelect}
            rpm={rpm} speed={speed} throttle={throttle} gear={gear} roadForce={roadForce}
            brake={brake} brakePressureBar={brakePressureBar} />
        </>
      )}
      {!studyPartId && showForce && (
        <>
          <ForceArrow from={[-1.18, -0.53, 1.74]} direction={[0, 0, -1]} length={forceLength}
            color="#28778c" label={size.width < 500 ? 'ROAD → CAR' : 'ROAD PUSHES CAR FORWARD'} />
          <ForceArrow from={[1.18, -0.55, 1.74]} direction={[0, 0, 1]} length={forceLength}
            color="#e6543f" label={size.width < 500 ? 'TIRE → ROAD' : 'TIRE PUSHES ROAD BACK'} />
        </>
      )}
      <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={studyPartId ? 4.2 : 6.7} maxDistance={studyPartId ? 16 : 15}
        target={[studyTargetX, studyPartId ? 0 : -0.05, 0]} minPolarAngle={0.34} maxPolarAngle={Math.PI * 0.47} />
    </>
  )
}

export default function MotionLab() {
  const { perspectiveInputRef, releasePerspective } = usePerspectiveInput()
  const [throttle, setThrottle] = useState(42)
  const [brake, setBrake] = useState(0)
  const [gear, setGear] = useState(1)
  const [requestedGear, setRequestedGear] = useState(1)
  const [shift, setShift] = useState(null)
  const [shiftMessage, setShiftMessage] = useState('Gear 1 engaged')
  const [hoveredGear, setHoveredGear] = useState(null)
  const [differentialTurn, setDifferentialTurn] = useState('straight')
  const [vehicle, setVehicle] = useState(() => stepVehicle(INITIAL, { throttle: 0.42, gear: 1 }, 0))
  const [hoveredPart, setHoveredPart] = useState(null)
  const [selectedPart, setSelectedPart] = useState('engine')
  const [studyPartId, setStudyPartId] = useState(null)
  const [activeCylinder, setActiveCylinder] = useState(1)
  const [webglLost, setWebglLost] = useState(false)
  const [rendererKey, setRendererKey] = useState(0)
  const [viewResetSignal, setViewResetSignal] = useState(0)
  const studyFocusRef = useRef()
  const shouldFocusStudyBack = useRef(false)
  const shiftTimers = useRef([])
  const demoTimers = useRef([])
  const requestShiftRef = useRef()

  const torqueTransfer = shift ? SHIFT_TRANSFER[shift.stage] ?? 0 : 1

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVehicle((current) => stepVehicle(current, {
        throttle: throttle / 100,
        brake: brake / 100,
        gear,
        torqueTransfer,
      }, 0.05))
    }, 50)
    return () => window.clearInterval(timer)
  }, [brake, gear, throttle, torqueTransfer])

  const output = vehicle.engine || engineOutput({ rpm: vehicle.rpm, throttle: throttle / 100 })
  const drivetrain = vehicle.drivetrain || drivetrainOutput({
    engineTorque: output.torqueNm,
    gear,
    speed: vehicle.speed,
    brake: brake / 100,
    torqueTransfer,
  })
  const transmission = transmissionKinematics({
    engineRpm: vehicle.rpm,
    engineTorque: output.torqueNm,
    speed: vehicle.speed,
    wheelRadius: INITIAL.wheelRadius,
    gear,
    torqueTransfer,
  })
  const gearRatio = getGearRatio(gear)
  const gearboxTorque = transmission.gearboxOutputTorque
  const displayedGear = shift && (shift.stage === 'select' || shift.stage === 'apply')
    ? shift.to
    : shift?.from ?? gear
  const displayedRatio = Math.abs(getGearRatio(displayedGear))
  const displayedApplication = TEACHING_GEAR_APPLICATIONS[displayedGear] || TEACHING_GEAR_APPLICATIONS[0]
  const explainedGear = hoveredGear ?? requestedGear
  const explainedApplication = TEACHING_GEAR_APPLICATIONS[explainedGear] || TEACHING_GEAR_APPLICATIONS[0]
  const explainedRatio = Math.abs(getGearRatio(explainedGear))
  const explainedRedlineSpeed = roadSpeedKphAtInputRpm(REDLINE_RPM, explainedGear)
  const liveRatioStatus = displayedGear === 0 ? 'Open'
    : shift?.stage === 'release'
      ? 'Open · old ratio released'
      : shift?.stage === 'select'
        ? `Pending · ${displayedRatio.toFixed(2)}:1`
        : `${Math.round(torqueTransfer * 100)}% · ${displayedRatio.toFixed(2)}:1`
  const liveGearboxInputRpm = displayedGear !== 0 && transmission.inputRpm < 1 && transmission.outputRpm > 0
    ? displayedRatio * transmission.outputRpm
    : transmission.inputRpm
  const lowerGear = displayedGear > 1 ? displayedGear - 1 : null
  const lowerGearRatio = lowerGear ? Math.abs(getGearRatio(lowerGear)) : 0
  const downshiftInputRpm = lowerGear ? transmission.outputRpm * lowerGearRatio : 0
  const downshiftSpeedLimit = lowerGear ? roadSpeedKphAtInputRpm(REDLINE_RPM, lowerGear) : 0
  const downshiftRpmJump = lowerGear && displayedRatio > 0 ? (lowerGearRatio / displayedRatio - 1) * 100 : 0
  const downshiftSafe = downshiftInputRpm <= REDLINE_RPM
  const selectedDifferentialTurn = DIFFERENTIAL_TURN_BY_ID[differentialTurn] || DIFFERENTIAL_TURN_BY_ID.straight
  const roadCarrierRpm = Math.abs(vehicle.speed) / (Math.PI * 2 * INITIAL.wheelRadius) * 60
  const differentialUsesTeachingSpeed = roadCarrierRpm < 45
  const differentialCarrierRpm = differentialUsesTeachingSpeed ? 120 : roadCarrierRpm
  const differentialSpeeds = openDifferentialKinematics({
    carrierSpeed: differentialCarrierRpm,
    turnBias: selectedDifferentialTurn.bias,
  })
  const differentialLeftRole = differentialTurn === 'straight' ? 'same speed'
    : differentialTurn === 'left' ? 'inner · slower' : 'outer · faster'
  const differentialRightRole = differentialTurn === 'straight' ? 'same speed'
    : differentialTurn === 'left' ? 'outer · faster' : 'inner · slower'
  const differentialLeftArrow = differentialTurn === 'straight' ? '→' : differentialTurn === 'left' ? '↓' : '↑'
  const differentialRightArrow = differentialTurn === 'straight' ? '→' : differentialTurn === 'left' ? '↑' : '↓'
  const activePartId = studyPartId || hoveredPart || selectedPart
  const activePart = PART_BY_ID[activePartId] || PART_BY_ID.engine
  const speedKph = Math.abs(vehicle.speed) * 3.6
  const accelerationG = drivetrain.acceleration / 9.81
  const passiveResistanceForce = drivetrain.aeroDrag + drivetrain.rollingResistance
  const totalResistanceForce = passiveResistanceForce + drivetrain.brakeForce
  const brakePressureBar = brake * 0.9
  const brakingPowerKw = drivetrain.brakeForce * Math.abs(vehicle.speed) / 1000
  const roadForceDirection = drivetrain.tractionLimitedForce > 1 ? 'forward' : drivetrain.tractionLimitedForce < -1 ? 'backward' : null
  const roadForcePhrase = roadForceDirection
    ? `${Math.abs(drivetrain.tractionLimitedForce / 1000).toFixed(1)} kN ${roadForceDirection}`
    : 'no longitudinal force'

  const liveValues = {
    metering: `${throttle}% accelerator request · ${output.fuelRateGps.toFixed(2)} g/s fuel`,
    engine: `${output.torqueNm.toFixed(0)} N·m at ${vehicle.rpm.toFixed(0)} rpm`,
    coupling: gear === 0 ? 'Engine turning; no drive gear selected' : 'Coupling carries rotation toward the selected gear',
    gearbox: gear === 0 ? 'Neutral · 0.00:1 · torque path open' : `Gear ${gear} · ${gearRatio.toFixed(2)}:1 · ${gearboxTorque.toFixed(0)} N·m after gearbox losses`,
    shaft: gear === 0 ? 'No driven torque in neutral' : `${gearboxTorque.toFixed(0)} N·m carried toward the rear axle`,
    differential: `${drivetrain.wheelTorque.toFixed(0)} N·m total driven-axle torque after the 3.90:1 final drive`,
    tires: roadForceDirection ? `${roadForcePhrase} force at the road` : 'No longitudinal force at the road',
    brakes: `${brakePressureBar.toFixed(0)} bar · ${(drivetrain.brakeForce / 1000).toFixed(1)} kN slowing force · ${brakingPowerKw.toFixed(1)} kW to heat`,
  }

  const clearShiftTimers = useCallback(() => {
    shiftTimers.current.forEach((timer) => window.clearTimeout(timer))
    shiftTimers.current = []
  }, [])

  const clearDemoTimers = useCallback(() => {
    demoTimers.current.forEach((timer) => window.clearTimeout(timer))
    demoTimers.current = []
  }, [])

  const requestShift = useCallback((value) => {
    const nextGear = Number(value)
    if (shift) return

    const predicted = transmissionKinematics({
      engineRpm: vehicle.rpm,
      engineTorque: output.torqueNm,
      speed: vehicle.speed,
      wheelRadius: INITIAL.wheelRadius,
      gear: nextGear,
    })
    if (nextGear > 0 && predicted.inputRpm > REDLINE_RPM) {
      setShiftMessage(`Shift blocked: gear ${nextGear} would demand ${predicted.inputRpm.toFixed(0)} rpm`)
      return
    }

    clearShiftTimers()
    setRequestedGear(nextGear)
    if (nextGear === gear && !shift) {
      setShiftMessage(`${nextGear === 0 ? 'Neutral' : `Gear ${nextGear}`} already engaged`)
      return
    }

    const fromGear = shift?.to ?? gear
    const fromLabel = fromGear === 0 ? 'N' : fromGear
    const toLabel = nextGear === 0 ? 'N' : nextGear
    setSelectedPart('gearbox')
    setShift({ from: fromGear, to: nextGear, stage: 'torque-cut' })
    setShiftMessage(`${fromLabel} → ${toLabel}: engine torque reduced`)

    shiftTimers.current.push(window.setTimeout(() => {
      setGear(0)
      setShift((current) => current ? { ...current, stage: 'release' } : current)
      setShiftMessage(`${fromLabel} → ${toLabel}: old clutch released; torque path open`)
    }, SHIFT_TIMING.release))
    shiftTimers.current.push(window.setTimeout(() => {
      setShift((current) => current ? { ...current, stage: 'select' } : current)
      setShiftMessage(`${fromLabel} → ${toLabel}: pressure routed; new friction elements filling`)
    }, SHIFT_TIMING.select))
    shiftTimers.current.push(window.setTimeout(() => {
      setGear(nextGear)
      setShift((current) => current ? { ...current, stage: 'apply' } : current)
      setShiftMessage(`${fromLabel} → ${toLabel}: next clutch applying`)
    }, SHIFT_TIMING.apply))
    shiftTimers.current.push(window.setTimeout(() => {
      setGear(nextGear)
      setShift(null)
      setShiftMessage(`${nextGear === 0 ? 'Neutral selected; torque path open' : `Gear ${nextGear} engaged`}`)
      shiftTimers.current = []
    }, SHIFT_TIMING.complete))
  }, [clearShiftTimers, gear, output.torqueNm, shift, vehicle.rpm, vehicle.speed])

  useEffect(() => {
    requestShiftRef.current = requestShift
  }, [requestShift])

  const chooseGear = useCallback((value) => {
    clearDemoTimers()
    requestShift(value)
  }, [clearDemoTimers, requestShift])

  const runShiftDemo = useCallback(() => {
    clearDemoTimers()
    clearShiftTimers()
    setVehicle(stepVehicle({ ...INITIAL, speed: 4, rpm: 1900 }, { throttle: throttle / 100, gear: 1 }, 0))
    setGear(1)
    setRequestedGear(1)
    setShift(null)
    setSelectedPart('gearbox')
    setShiftMessage('Demo staged in first gear')
    ;[2, 3, 4].forEach((nextGear, index) => {
      demoTimers.current.push(window.setTimeout(() => requestShiftRef.current?.(nextGear), 500 + index * SHIFT_DEMO_SPACING))
    })
  }, [clearDemoTimers, clearShiftTimers, throttle])

  const openStudy = useCallback((id) => {
    shouldFocusStudyBack.current = true
    setHoveredPart(null)
    setSelectedPart(id)
    setStudyPartId(id)
    releasePerspective()
  }, [releasePerspective])

  const closeStudy = useCallback(() => {
    const closingPart = studyPartId
    setHoveredPart(null)
    setStudyPartId(null)
    releasePerspective()
    window.setTimeout(() => document.querySelector(`[data-part-id="${closingPart}"]`)?.focus(), 180)
  }, [releasePerspective, studyPartId])

  const changeStudy = useCallback((direction) => {
    const currentIndex = Math.max(0, MOTION_PARTS.findIndex((part) => part.id === studyPartId))
    const nextIndex = (currentIndex + direction + MOTION_PARTS.length) % MOTION_PARTS.length
    const nextId = MOTION_PARTS[nextIndex].id
    setSelectedPart(nextId)
    setStudyPartId(nextId)
    releasePerspective()
  }, [releasePerspective, studyPartId])

  useEffect(() => {
    if (!studyPartId) return undefined
    if (shouldFocusStudyBack.current) {
      studyFocusRef.current?.focus()
      shouldFocusStudyBack.current = false
    }
    const onKeyDown = (event) => { if (event.key === 'Escape') closeStudy() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeStudy, studyPartId])

  useEffect(() => () => {
    clearShiftTimers()
    clearDemoTimers()
  }, [clearDemoTimers, clearShiftTimers])

  const reset = () => {
    clearShiftTimers()
    clearDemoTimers()
    setThrottle(42)
    setBrake(0)
    setGear(1)
    setRequestedGear(1)
    setShift(null)
    setShiftMessage('Gear 1 engaged')
    setHoveredGear(null)
    setDifferentialTurn('straight')
    setHoveredPart(null)
    setSelectedPart('engine')
    setStudyPartId(null)
    setActiveCylinder(1)
    releasePerspective()
    setViewResetSignal((value) => value + 1)
    setVehicle(stepVehicle(INITIAL, { throttle: 0.42, gear: 1 }, 0))
  }
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
        <div className="scene-toolbar"><SceneBadge>{speedKph.toFixed(0)} km/h · {shift ? `${shift.from === 0 ? 'N' : shift.from}→${shift.to === 0 ? 'N' : shift.to}` : `gear ${gear === 0 ? 'N' : gear}`}</SceneBadge><ResetButton onClick={reset} /></div>
        {!studyPartId && <p className="motion-scene-help">Hover to preview · click a part to open it · drag or use arrows to orbit</p>}
        {studyPartId && (
          <div ref={studyFocusRef} className="motion-study-toolbar" style={{ '--part-color': activePart.color }}
            tabIndex={-1} aria-label={`${activePart.name} exploded study controls`}>
            <button type="button" onClick={closeStudy}>← Whole drivetrain</button>
            <span>{activePart.number} · Exploded study · hover ? to explain</span>
            <div><button type="button" onClick={() => changeStudy(-1)} aria-label="Previous component">‹</button><b>{MOTION_PARTS.findIndex((part) => part.id === studyPartId) + 1} / {MOTION_PARTS.length}</b><button type="button" onClick={() => changeStudy(1)} aria-label="Next component">›</button></div>
          </div>
        )}
        {studyPartId === 'engine' && (
          <div className="motion-cylinder-summary" style={{ '--part-color': activePart.color }} aria-hidden="true">
            <span>Common inline-four · firing 1–3–4–2</span>
            <strong>A power stroke every 180°</strong>
            <div>{INLINE_FOUR_FIRING_EVENTS.map((event) => <i key={event.cylinder} className={activeCylinder === event.cylinder ? 'is-active' : ''}><b>C{event.cylinder}</b><small>{crankDegrees(event.firingAngle)}°</small></i>)}</div>
            <p><strong>Piston motion:</strong> 1 + 4 together · 2 + 3 opposite.<br /><strong>Combustion:</strong> each cylinder fires once per 720°.</p>
            <b>≈ {(Math.max(0, vehicle.rpm) * 4 / 120).toFixed(0)} real events/s at {vehicle.rpm.toFixed(0)} rpm · animation slowed</b>
          </div>
        )}
        {studyPartId === 'gearbox' && (
          <section className={`motion-shift-deck ${shift ? 'is-shifting' : ''}`}
            style={{ '--part-color': activePart.color }} aria-label="Shift the exploded transmission">
            <header>
              <span>Select a ratio</span>
              <strong aria-live="polite">{shift
                ? `${shift.from === 0 ? 'N' : shift.from} → ${shift.to === 0 ? 'N' : shift.to} · ${SHIFT_PHASES.find((phase) => phase.id === shift.stage)?.short || 'Shift'}`
                : gear === 0 ? 'Neutral · path open' : `Gear ${gear} · ${Math.abs(getGearRatio(gear)).toFixed(2)}:1`}</strong>
            </header>
            <div className="motion-shift-gears" role="group" aria-label="Choose a transmission gear">
              {STUDY_GEARS.map((value) => (
                <button key={value} type="button" onClick={() => { setHoveredGear(null); chooseGear(value) }} disabled={Boolean(shift)}
                  className={`${requestedGear === value ? 'is-requested' : ''} ${gear === value ? 'is-engaged' : ''} ${hoveredGear === value ? 'is-previewed' : ''}`}
                  aria-pressed={requestedGear === value} aria-label={value === 0 ? 'Shift to neutral' : `Shift to gear ${value}`}
                  aria-describedby="motion-gear-hover-explanation"
                  onMouseEnter={() => setHoveredGear(value)} onMouseLeave={() => setHoveredGear(null)}
                  onFocus={() => setHoveredGear(value)} onBlur={() => setHoveredGear(null)}>
                  <b>{value === 0 ? 'N' : value}</b>
                  <small>{value === 0 ? 'open' : `${getGearRatio(value).toFixed(2)}:1`}</small>
                  <i>{gear === value ? (value === 0 ? 'path open' : 'engaged') : 'select'}</i>
                </button>
              ))}
            </div>
            {!shift && (hoveredGear === null ? (
              <div id="motion-gear-hover-explanation" className="motion-gear-current-summary" aria-live="polite">
                <strong>{displayedGear === 0 ? 'Neutral · path open' : `G${displayedGear} · ${displayedApplication.circuits.map((circuit) => circuit.id).join(' + ')}`}</strong>
                <span>{displayedGear === 0 ? 'Input disconnected from output' : `${displayedRatio.toFixed(2)} input turns → 1 output turn`}</span>
                <small>Hover or focus a gear to compare why its clutch pair is used.</small>
              </div>
            ) : (
              <div id="motion-gear-hover-explanation" className="motion-gear-hover-explanation" aria-live="polite">
                <header>
                  <strong>{explainedGear === 0 ? 'Neutral · path open' : `G${explainedGear} · ${explainedApplication.circuits.map((circuit) => circuit.id).join(' + ')}`}</strong>
                  <span>{explainedGear === 0 ? 'Input disconnected from output' : `${explainedRatio.toFixed(2)} input turns → 1 output turn`}</span>
                </header>
                <p>{explainedApplication.detail}</p>
                <footer>{explainedGear === 0
                  ? 'No friction pair is clamped.'
                  : `Modeled redline limit ≈ ${explainedRedlineSpeed.toFixed(0)} km/h in G${explainedGear}.`}
                  <b>All gear teeth stay meshed; the other packs stay open.</b>
                </footer>
              </div>
            ))}
            {shift && <div className="motion-selection-path" aria-live="polite">
              <span><small>Hydraulic selection</small><strong>{displayedApplication.circuits.length ? displayedApplication.circuits.map((circuit) => (
                <b key={circuit.id}><i>{circuit.id}</i>{circuit.label}</b>
              )) : <b className="is-open">No clutches</b>}</strong></span>
              <i aria-hidden="true">→</i>
              <span><small>Torque path</small><b>{liveRatioStatus}</b></span>
            </div>}
            {shift && <div className="motion-shift-phases" aria-label={shiftMessage}>
              {SHIFT_PHASES.map((phase, index) => (
                <span key={phase.id} className={shift?.stage === phase.id ? 'is-active' : ''}>
                  <b>{index + 1}</b>{phase.short}
                </span>
              ))}
            </div>}
          </section>
        )}
        {studyPartId === 'differential' && (
          <section className="motion-differential-deck" style={{ '--part-color': activePart.color }}
            aria-label="Open differential cornering demonstration">
            <header><span>Open differential demo</span><strong>{selectedDifferentialTurn.label.replace(/[↶↑↷]/g, '').trim()}</strong></header>
            <div className="motion-differential-turns" role="group" aria-label="Choose a driving path">
              {DIFFERENTIAL_TURNS.map((turn) => (
                <button key={turn.id} type="button" className={differentialTurn === turn.id ? 'is-active' : ''}
                  aria-pressed={differentialTurn === turn.id} onClick={() => setDifferentialTurn(turn.id)}>
                  {turn.label}
                </button>
              ))}
            </div>
            <p aria-live="polite">{differentialTurn === 'straight'
              ? 'Both axles match the carrier; the spider gears do not spin relative to it.'
              : `${differentialTurn === 'left' ? 'Left' : 'Right'} is the shorter inside path. The opposite axle speeds up by the same amount.`}</p>
            <footer><b>Speed may split ±30%</b><span>Ideal axle torque ≈ equal</span></footer>
          </section>
        )}
        {webglLost ? <RenderFallback onRetry={retryRenderer} /> : (
          <Canvas key={rendererKey} camera={{ position: [6.8, 4.6, 7.4], fov: 40 }} shadows dpr={[1, 1.35]}
            style={{ cursor: !studyPartId && hoveredPart ? 'pointer' : 'grab' }} onCreated={rendererReady} fallback={<RenderFallback onRetry={retryRenderer} />}>
            <MotionScene speed={vehicle.speed} rpm={vehicle.rpm} throttle={throttle / 100} gear={gear}
              engagedGear={shift?.from ?? gear} requestedGear={requestedGear} torqueTransfer={torqueTransfer} shiftStage={shift?.stage || null}
              roadForce={drivetrain.tractionLimitedForce} brake={brake / 100} brakePressureBar={brakePressureBar}
              brakeForce={drivetrain.brakeForce} transmission={transmission}
              activePart={activePartId} hoveredPart={hoveredPart}
              onHover={setHoveredPart} onSelect={openStudy} onEnginePowerCylinder={setActiveCylinder} perspectiveInputRef={perspectiveInputRef}
              viewResetSignal={viewResetSignal} studyPartId={studyPartId} differentialTurnBias={selectedDifferentialTurn.bias} />
          </Canvas>
        )}

        {!studyPartId && (
          <div className="motion-scene-inspector" style={{ '--part-color': activePart.color }}>
            <span>{activePart.number} · {activePart.short}</span>
            <strong>{activePart.summary}</strong>
            <b>{liveValues[activePart.id]}</b>
          </div>
        )}

        {studyPartId === 'gearbox' ? (
          <section className="motion-gear-effect" style={{ '--part-color': activePart.color }} aria-live="polite">
            <header>
              <span>What input and output mean</span>
              <div className="motion-gear-effect__live"
                aria-label={`Live gearbox rotation: input ${Math.round(liveGearboxInputRpm)} rpm, output ${Math.round(transmission.outputRpm)} rpm`}>
                <span><i className={`motion-gear-effect__dial is-input ${liveGearboxInputRpm < 10 ? 'is-stopped' : ''}`}
                  style={{ '--spin-duration': rotationDialDuration(liveGearboxInputRpm) }}><b /></i><small>Engine-side input</small><strong>{Math.round(liveGearboxInputRpm)} rpm</strong></span>
                <em>vs</em>
                <span><i className={`motion-gear-effect__dial is-output ${transmission.outputRpm < 10 ? 'is-stopped' : ''}`}
                  style={{ '--spin-duration': rotationDialDuration(transmission.outputRpm) }}><b /></i><small>Driveshaft output</small><strong>{Math.round(transmission.outputRpm)} rpm</strong></span>
              </div>
              <strong>{displayedGear === 0 ? 'Neutral · open' : `G${displayedGear} · ${displayedRatio.toFixed(2)} input turns = 1 output turn`}</strong>
            </header>
            <div className={`motion-downshift-check ${lowerGear ? (downshiftSafe ? 'is-safe' : 'is-blocked') : 'is-lowest'}`}>
              <span>{lowerGear ? `Why slow before G${lowerGear}?` : 'Already in the lowest gear'}</span>
              {lowerGear ? <p>At {speedKph.toFixed(0)} km/h, G{lowerGear} would force the engine-side input to <strong>{Math.round(downshiftInputRpm)} rpm</strong>—a {downshiftRpmJump.toFixed(0)}% jump. {downshiftSafe
                ? `That is below the ${REDLINE_RPM.toLocaleString()} rpm redline, so the downshift is safe and restores more wheel torque.`
                : `That exceeds the ${REDLINE_RPM.toLocaleString()} rpm redline, so this lab blocks the shift. Slow below about ${downshiftSpeedLimit.toFixed(0)} km/h first.`}</p>
                : <p>G1 already gives the largest ratio and strongest launch leverage. An upshift lowers input RPM and trades some torque multiplication for more road speed.</p>}
            </div>
          </section>
        ) : studyPartId === 'differential' ? (
          <section className="motion-differential-effect" style={{ '--part-color': activePart.color }}>
            <header>
              <span>Open differential · {selectedDifferentialTurn.label.replace(/[↶↑↷]/g, '').trim()}</span>
              <strong>{differentialUsesTeachingSpeed ? 'Slow-motion teaching rotation' : `Live carrier · ${Math.round(differentialCarrierRpm)} rpm`}</strong>
            </header>
            <div className="motion-differential-readout">
              <span className="is-left"><small>Vehicle left</small><strong>{Math.round(differentialSpeeds.leftSpeed)} rpm {differentialLeftArrow}</strong><b>{differentialLeftRole} · {(1 - selectedDifferentialTurn.bias).toFixed(2)}×</b></span>
              <span className="is-carrier"><small>Carrier average</small><strong>{Math.round(differentialSpeeds.carrierSpeed)} rpm</strong><b>({Math.round(differentialSpeeds.leftSpeed)} + {Math.round(differentialSpeeds.rightSpeed)}) ÷ 2</b></span>
              <span className="is-right"><small>Vehicle right</small><strong>{Math.round(differentialSpeeds.rightSpeed)} rpm {differentialRightArrow}</strong><b>{differentialRightRole} · {(1 + selectedDifferentialTurn.bias).toFixed(2)}×</b></span>
            </div>
            <footer><span>Pinion ≈ {Math.round(differentialSpeeds.carrierSpeed * FINAL_DRIVE_RATIO)} rpm before 3.90:1 reduction</span><b>Different speed, approximately equal torque · low grip on one side can limit both</b></footer>
          </section>
        ) : studyPartId ? (
          <div className="motion-study-flow" style={{ '--part-color': activePart.color }}>
            <span>Internal handoff</span>
            {activePart.studyFlow.map((item, index) => <b key={`${index}-${item}`}>{index + 1}<em>{item}</em>{index < 2 && <i>→</i>}</b>)}
          </div>
        ) : (
          <div className="motion-torque-strip" aria-label="Live torque path">
            <span><small>Engine</small><b>{output.torqueNm.toFixed(0)} N·m</b></span>
            <i>× {gearRatio.toFixed(2)} gear × 3.90 final × 0.90{shift ? ` × ${torqueTransfer.toFixed(2)} clutch` : ''}</i>
            <span><small>Driven wheels</small><b>{drivetrain.wheelTorque.toFixed(0)} N·m</b></span>
            <i>÷ 0.31 m tire</i>
            <span><small>Road on car</small><b>{(drivetrain.tractionLimitedForce / 1000).toFixed(1)} kN</b></span>
          </div>
        )}
      </section>

      <aside className="lesson-pane motion-lesson-pane">
        <SectionHeader kicker="Experiment 02 · Torque to road" title="A turning shaft moves nothing until the tires push the road.">
          Trace one causal path through this rear-wheel-drive teaching car. Hover to preview, then click any numbered component to open its internal mechanics. Change accelerator request or gear and watch the live values propagate.
        </SectionHeader>

        <section className="motion-simple-controls" aria-label="Drivetrain experiment controls">
          <Slider label="Accelerator request" value={throttle} min={0} max={100} unit="%"
            onChange={(value) => { setThrottle(value); if (!studyPartId) setSelectedPart('metering') }}
            hint="Requests more engine torque by admitting more air and matching fuel." />
          <div className="gear-selector">
            <div className="gear-control-heading"><span>Requested gear</span><b>{gear === 0
              ? (shift ? `${shift.from === 0 ? 'N' : shift.from}→${shift.to === 0 ? 'N' : shift.to} · torque path open` : 'Neutral · torque path open')
              : `${gear} mechanically engaged`}</b></div>
            <Segmented label="Transmission gear" value={requestedGear} onChange={chooseGear}
              options={[{ value: 0, label: 'N' }, 1, 2, 3, 4].map((value) => typeof value === 'number' ? { value, label: String(value) } : value)} />
            <div className="shift-command-row">
              <button type="button" onClick={() => chooseGear(Math.max(1, requestedGear - 1))} disabled={requestedGear <= 1 || Boolean(shift)}><ArrowDown size={14} /> Shift down</button>
              <button type="button" onClick={() => chooseGear(Math.min(4, Math.max(1, requestedGear + 1)))} disabled={requestedGear >= 4 || Boolean(shift)}><ArrowUp size={14} /> Shift up</button>
              <button type="button" onClick={runShiftDemo} disabled={Boolean(shift)}><Play size={14} /> 1→4 demo</button>
            </div>
            <div className="shift-status" aria-live="polite">
              <strong>{shiftMessage}</strong>
              <div>{SHIFT_PHASES.map((phase) => <span key={phase.id} className={shift?.stage === phase.id ? 'is-active' : ''}>{phase.label}</span>)}</div>
            </div>
            <div className="gear-role-map" aria-label="What each forward gear is for">
              {GEAR_ROLES.map((item) => <span key={item.gear} className={requestedGear === item.gear ? 'is-active' : ''}><b>{item.gear}</b><strong>{item.role}</strong><small>{getGearRatio(item.gear).toFixed(2)}:1 · {item.note}</small></span>)}
            </div>
          </div>
          <Slider label="Brake pedal" value={brake} min={0} max={100} unit="%" accent="#28778c"
            onChange={(value) => { setBrake(value); if (!studyPartId) setSelectedPart('brakes') }}
            hint={`${brakePressureBar.toFixed(0)} bar teaching pressure · ${(drivetrain.brakeForce / 1000).toFixed(1)} kN slowing force`} />
          <p>Low gears multiply torque for launch. Higher gears trade multiplication for wheel speed. The brake pedal builds hydraulic pressure, but the tire-road contact patches are what slow the whole car.</p>
        </section>

        <section id="motion-part-study" className={`motion-part-inspector ${studyPartId ? 'is-study' : ''}`} style={{ '--part-color': activePart.color }} aria-label={`${activePart.name} explanation`}>
          <header><span>{activePart.number}</span><p><small>{studyPartId ? 'Exploded study' : 'Inspecting'}</small><strong>{activePart.name}</strong></p></header>
          <output>{liveValues[activePart.id]}</output>
          <p><strong>{activePart.summary}</strong> {activePart.detail}</p>
          {studyPartId && (
            <>
              <div className="motion-study-steps">{activePart.studyFlow.map((item, index) => <span key={item}><b>{index + 1}</b>{item}</span>)}</div>
              {studyPartId === 'engine' && <CylinderCountLesson rpm={vehicle.rpm} />}
              {studyPartId === 'gearbox' && (
                <section className="gearbox-live-lesson" aria-label="Live automatic transmission shift">
                  <header><span>Live ratio trade</span><strong>{gear === 0 ? 'Torque path open' : `Gear ${gear} · ${gearRatio.toFixed(2)}:1`}</strong></header>
                  <div className="gearbox-live-readouts">
                    <span><small>Engine</small><b>{vehicle.rpm.toFixed(0)} rpm</b></span>
                    <span><small>Gearbox input</small><b>{transmission.inputRpm.toFixed(0)} rpm</b></span>
                    <span><small>Input torque</small><b>{(output.torqueNm * torqueTransfer).toFixed(0)} N·m</b></span>
                    <span><small>Output</small><b>{transmission.outputRpm.toFixed(0)} rpm</b></span>
                    <span><small>Output torque</small><b>{gearboxTorque.toFixed(0)} N·m</b></span>
                    <span><small>Converter slip</small><b>{transmission.converterSlipRpm.toFixed(0)} rpm</b></span>
                  </div>
                  <p><strong>An upshift changes two things, depending on what you hold constant.</strong> During the shift, road speed keeps the output and wheels turning nearly continuously, so gearbox-input RPM drops to match the taller ratio. Later, at the same gearbox-input RPM, that taller gear produces more output speed but less torque multiplication.</p>
                  <div className="gearbox-application-chart" aria-label="Teaching clutch application chart">
                    {GEAR_ROLES.map((item) => {
                      const application = TEACHING_GEAR_APPLICATIONS[item.gear]
                      return <span key={item.gear} className={displayedGear === item.gear ? 'is-active' : ''}>
                        <b>G{item.gear}</b><strong>{application.circuits.map((circuit) => circuit.id).join(' + ')}</strong>
                        <small>{application.circuits.map((circuit) => circuit.label).join(' · ')}</small>
                      </span>
                    })}
                  </div>
                  <p className="gearbox-chart-note">This is a functional four-speed application chart. Real gearboxes may use different element names, but all select ratios by applying a specific clutch-and-brake combination.</p>
                  <div className="gearbox-input-output-lesson">
                    <header><span>Read the ratio from left to right</span><strong>{displayedGear === 0 ? 'Input disconnected from output' : `${displayedRatio.toFixed(2)} input turns → 1 output turn`}</strong></header>
                    <div>
                      <span><small>Engine-side input</small><b>{Math.round(liveGearboxInputRpm)} rpm</b><p>Rotation and torque entering from the torque converter.</p></span>
                      <i aria-hidden="true">→</i>
                      <span><small>Driveshaft output</small><b>{Math.round(transmission.outputRpm)} rpm</b><p>Rotation leaving for the final drive and wheels.</p></span>
                    </div>
                    <p><strong>No gear slides into mesh.</strong> {displayedApplication.detail} The other friction packs remain open so they do not fight this constraint.</p>
                    {lowerGear && <p className={downshiftSafe ? 'is-safe' : 'is-blocked'}><strong>Why slow before G{lowerGear}?</strong> At the same {speedKph.toFixed(0)} km/h road speed, its larger {lowerGearRatio.toFixed(2)}:1 ratio would demand {Math.round(downshiftInputRpm)} input rpm. {downshiftSafe
                      ? `That is safe and would restore more torque multiplication.`
                      : `That exceeds the ${REDLINE_RPM.toLocaleString()} rpm redline; slow below about ${downshiftSpeedLimit.toFixed(0)} km/h first.`}</p>}
                  </div>
                  <div className="gearbox-clutch-sequence">{SHIFT_PHASES.map((phase, index) => <span key={phase.id} className={shift?.stage === phase.id ? 'is-active' : ''}><b>{index + 1}</b>{phase.label}</span>)}</div>
                </section>
              )}
              {studyPartId === 'brakes' && (
                <section className="brake-live-lesson" aria-label="Live hydraulic brake mechanics">
                  <header><span>Pedal to road</span><strong>{brakePressureBar.toFixed(0)} bar in the hydraulic lines</strong></header>
                  <div><span><small>Pedal</small><b>{brake}%</b></span><i>→</i><span><small>Caliper clamp</small><b>{(brake * 0.055).toFixed(1)} kN</b></span><i>→</i><span><small>Tire force</small><b>{(drivetrain.brakeForce / 1000).toFixed(1)} kN</b></span><i>→</i><span><small>Heat</small><b>{brakingPowerKw.toFixed(1)} kW</b></span></div>
                  <p><strong>Fluid transmits pressure; it does not directly stop the car.</strong> Calipers squeeze rotors to resist wheel rotation. The tires then push the road forward, and the road pushes the car backward. Kinetic energy becomes heat in the rotors and pads.</p>
                </section>
              )}
              <div className="motion-internals"><strong>Parts separated in this study</strong><ul>{activePart.internals.map((item) => <li key={item}>{item}</li>)}</ul></div>
              {studyPartId === 'engine' && <a className="motion-engine-link" href="#engine">Open the full Engine Mechanics lab →</a>}
            </>
          )}
        </section>

        <section className="motion-causal-story">
          <h2>Torque changes twice before the car moves</h2>
          <ol>
            <li><b>1</b><p><strong>The engine makes twist.</strong><span>Combustion pressure becomes {output.torqueNm.toFixed(0)} N·m at the crankshaft.</span></p></li>
            <li><b>2</b><p><strong>Gears trade speed for torque.</strong><span>{output.torqueNm.toFixed(0)} × {gearRatio.toFixed(2)} × 3.90 × 0.90 = {drivetrain.wheelTorque.toFixed(0)} N·m at the driven wheels.</span></p></li>
            <li><b>3</b><p><strong>The tire radius turns twist into force.</strong><span>{drivetrain.wheelTorque.toFixed(0)} N·m ÷ 0.31 m = {(drivetrain.driveForce / 1000).toFixed(1)} kN requested at the road.</span></p></li>
            <li><b>4</b><p><strong>The road accelerates or slows the car.</strong><span>Drive grip supplies {roadForcePhrase}; brakes plus rolling and air resistance remove {(totalResistanceForce / 1000).toFixed(1)} kN, leaving {accelerationG >= 0 ? '+' : ''}{accelerationG.toFixed(2)} g.</span></p></li>
          </ol>

          <div className="motion-equation-line">
            <strong>τ<sub>wheel</sub> = τ<sub>engine</sub> × i<sub>gear</sub> × i<sub>final</sub> × η</strong>
            <p>Low gear multiplies torque more, but the wheels turn fewer times per engine revolution. No energy is created.</p>
          </div>
          <div className="motion-equation-line">
            <strong>F<sub>road</sub> = τ<sub>wheel</sub> ÷ r<sub>tire</sub> &nbsp;·&nbsp; a = ΣF ÷ m</strong>
            <p>The tire pushes backward; static friction from the road pushes the entire car forward, up to the grip limit.</p>
          </div>
          <div className="motion-equation-line motion-equation-line--brake">
            <strong>p = F<sub>pedal</sub> ÷ A &nbsp;·&nbsp; E<sub>motion</sub> → heat</strong>
            <p>The master cylinder turns pedal force into fluid pressure. Calipers turn that pressure into pad force and brake torque; tire grip carries the slowing force to the car.</p>
          </div>
        </section>

        <p className="motion-scope-note"><strong>Scope of this bench:</strong> the complete power path and hydraulic service brakes are live here. Steering and suspension remain fully explorable in the final simulator.</p>
        <a className="next-lab" href="#simulator"><span>Final experiment</span><strong>Drive it with every system exposed →</strong></a>
      </aside>
    </div>
  )
}

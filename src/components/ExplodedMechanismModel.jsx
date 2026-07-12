import { Edges, Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { TEACHING_GEAR_APPLICATIONS } from '../motionParts.js'
import { FINAL_DRIVE_RATIO, INLINE_FOUR_CYLINDERS, activePowerCylinder, getGearRatio, sliderCrankPose } from '../physics.js'
import { FlowDots, ForceArrow, PaintedBox } from './SceneKit.jsx'

const COLORS = {
  ink: '#304e54', air: '#3f9a9d', fuel: '#f2c348', burn: '#e6543f',
  power: '#76569b', powerDark: '#65468b', metal: '#a9aaa3', cream: '#fff0b4', road: '#8b8179',
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const ReducedMotionContext = createContext(false)
const WHEEL_RADIUS = 0.31
const VISUAL_ROTATION_SCALE = 0.35
const METERING_RUNNER_ZS = [-.42, -.14, .14, .42]
const METERING_AIR_PATH = [[-3, .45, 0], [-2.25, .45, 0], [-1.05, .45, 0], [.2, .42, 0]]
const METERING_FUEL_RAIL_PATH = [[.82, 1.25, -.62], [.82, 1.25, .62]]
const METERING_RUNNER_PATHS = METERING_RUNNER_ZS.map((z) => [
  [.2, .42, z], [.55, .25, z], [1.45, .05, z], [1.88, -.03, z],
])
const METERING_INJECTOR_PATHS = METERING_RUNNER_ZS.map((z) => [
  [.82, 1.2, z], [.86, .7, z], [.98, .25, z], [1.35, .07, z], [1.88, -.03, z],
])
const GEAR_PATH_LANES = Object.freeze({ 1: -.72, 2: -.24, 3: .24, 4: .72 })
const CLUTCH_CIRCUITS = Object.freeze([
  Object.freeze({ id: 'A', label: 'FORWARD', y: .78 }),
  Object.freeze({ id: 'B', label: 'LOW', y: .39 }),
  Object.freeze({ id: 'C', label: 'SECOND', y: 0 }),
  Object.freeze({ id: 'D', label: 'DIRECT', y: -.39 }),
  Object.freeze({ id: 'E', label: 'OVERDRIVE', y: -.78 }),
])

const clamp01 = (value, fallback = 0) => THREE.MathUtils.clamp(
  Number.isFinite(Number(value)) ? Number(value) : fallback,
  0,
  1,
)

const normalizeShiftStage = (stage) => String(stage || 'engaged')
  .trim()
  .toLowerCase()
  .replace(/[ _]+/g, '-')

function StudyLabel({ position, color = COLORS.ink, children, detail, tooltipSide = 'below', className = '' }) {
  const tooltipId = useId()
  return (
    <Html position={position} center sprite distanceFactor={9} zIndexRange={[120, 0]}
      wrapperClass={`exploded-label-layer ${className}`.trim()} style={{ pointerEvents: 'auto' }}>
      <button type="button" className="exploded-part-label" data-tooltip-side={tooltipSide}
        style={{ '--label-color': color }} aria-describedby={tooltipId}
        onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
        <span>{children}</span><i aria-hidden="true">?</i>
        <span id={tooltipId} role="tooltip" className="exploded-part-tooltip">{detail}</span>
      </button>
    </Html>
  )
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => Boolean(
    typeof window !== 'undefined' && window.matchMedia?.(REDUCED_MOTION_QUERY).matches
  ))

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const query = window.matchMedia(REDUCED_MOTION_QUERY)
    const updatePreference = (event) => setReducedMotion(event.matches)
    query.addEventListener?.('change', updatePreference)
    return () => query.removeEventListener?.('change', updatePreference)
  }, [])

  return reducedMotion
}

function drivelineSpeeds(speed) {
  const signedSpeed = Number.isFinite(speed) ? speed : 0
  const wheelSpeed = signedSpeed / WHEEL_RADIUS * VISUAL_ROTATION_SCALE
  return {
    wheel: THREE.MathUtils.clamp(wheelSpeed, -7, 7),
    propshaft: THREE.MathUtils.clamp(wheelSpeed * FINAL_DRIVE_RATIO, -11, 11),
  }
}

function Shaft({ start, end, color = COLORS.power, radius = 0.065, opacity = 1 }) {
  const { midpoint, length, quaternion } = useMemo(() => {
    const a = new THREE.Vector3(...start)
    const b = new THREE.Vector3(...end)
    const direction = b.clone().sub(a)
    return {
      midpoint: a.clone().add(b).multiplyScalar(0.5).toArray(),
      length: direction.length(),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
    }
  }, [start, end])
  return (
    <mesh position={midpoint} quaternion={quaternion} castShadow>
      <cylinderGeometry args={[radius, radius, length, 16]} />
      <meshStandardMaterial color={color} roughness={0.55} transparent opacity={opacity} />
    </mesh>
  )
}

function ExplodedPiece({ from = [0, 0, 0], to, children }) {
  const group = useRef()
  const started = useRef(false)
  const target = useMemo(() => new THREE.Vector3(...to), [to])
  const reducedMotion = useContext(ReducedMotionContext)
  useFrame((_, delta) => {
    if (!group.current) return
    if (!started.current) {
      group.current.position.set(...(reducedMotion ? to : from))
      started.current = true
    }
    if (reducedMotion) group.current.position.copy(target)
    else group.current.position.lerp(target, 1 - Math.exp(-delta * 5.5))
  })
  return <group ref={group}>{children}</group>
}

function RotatingDisc({ position, radius, depth = 0.14, color, speed = 1.5, axis = 'x', opacity = 1, spokes = true, phaseRef }) {
  const group = useRef()
  const reducedMotion = useContext(ReducedMotionContext)
  useFrame((_, delta) => {
    if (!group.current || reducedMotion) return
    if (phaseRef) group.current.rotation[axis] = phaseRef.current
    else group.current.rotation[axis] -= delta * speed
  })
  const meshRotation = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0]
  return (
    <group ref={group} position={position}>
      <mesh rotation={meshRotation} castShadow>
        <cylinderGeometry args={[radius, radius, depth, 24]} />
        <meshStandardMaterial color={color} roughness={0.58} transparent opacity={opacity} />
        <Edges color={COLORS.ink} />
      </mesh>
      {spokes && axis === 'x' && (
        <group>
          <PaintedBox size={[depth + .03, radius * 1.45, .045]} color={COLORS.cream} opacity={opacity} />
          <PaintedBox size={[depth + .03, .045, radius * 1.45]} color={COLORS.cream} opacity={opacity} />
        </group>
      )}
    </group>
  )
}

function ThrottlePlate({ throttle }) {
  const plateAngle = THREE.MathUtils.degToRad(6 + throttle * 76)
  return (
    <group position={[-1.05, 0.45, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.38, 0.38, 0.42, 22]} />
        <meshStandardMaterial color="#d7f1ef" transparent opacity={0.5} /><Edges color="#28778c" />
      </mesh>
      <group rotation={[0, 0, plateAngle]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.31, 0.31, 0.035, 22]} />
          <meshStandardMaterial color={COLORS.burn} roughness={0.62} /><Edges color="#8e573d" />
        </mesh>
        <Shaft start={[0, 0, -.38]} end={[0, 0, .38]} color={COLORS.powerDark} radius={.035} />
      </group>
    </group>
  )
}

function MeteringStudy({ throttle, rpm }) {
  const reducedMotion = useContext(ReducedMotionContext)
  const engineRunning = rpm >= 200
  const effectiveThrottle = engineRunning ? Math.max(throttle, 0.045) : 0
  const flowSpeed = reducedMotion ? 0 : .24 + effectiveThrottle * 1.4
  return (
    <group>
      <ExplodedPiece from={[-1.3, .45, 0]} to={[-2.35, .45, 0]}>
        <PaintedBox size={[0.9, 0.85, 1]} color={COLORS.air} opacity={0.9} />
      </ExplodedPiece>
      <ExplodedPiece from={[-1.3, .45, 0]} to={[0, 0, 0]}><ThrottlePlate throttle={effectiveThrottle} /></ExplodedPiece>
      <ExplodedPiece from={[0, .42, 0]} to={[.25, .42, 0]}>
        <PaintedBox size={[1.15, .7, 1.25]} color="#8ccbd5" opacity={0.72} />
        {METERING_RUNNER_ZS.map((z) => <Shaft key={z} start={[.55, .25, z]} end={[1.45, .05, z]} color={COLORS.air} radius={.08} />)}
      </ExplodedPiece>
      <ExplodedPiece from={[.4, .7, 0]} to={[0, .28, 0]}>
        <Shaft start={[.82, 1.25, -.62]} end={[.82, 1.25, .62]} color={COLORS.fuel} radius={.1} />
        {METERING_RUNNER_ZS.map((z) => <Shaft key={z} start={[.82, 1.18, z]} end={[.98, .25, z]} color={COLORS.fuel} radius={.055} />)}
      </ExplodedPiece>
      <FlowDots points={METERING_AIR_PATH} color={COLORS.air} speed={flowSpeed} count={9} active={engineRunning} radius={.05} />
      <FlowDots points={METERING_FUEL_RAIL_PATH} color={COLORS.fuel} speed={reducedMotion ? 0 : .18 + effectiveThrottle}
        count={5} active={engineRunning} radius={.04} />
      {METERING_RUNNER_PATHS.map((points, index) => <FlowDots key={`runner-air-${index}`} points={points} color={COLORS.air}
        speed={flowSpeed} phase={index / METERING_RUNNER_PATHS.length} count={5} active={engineRunning} radius={.047} />)}
      {METERING_INJECTOR_PATHS.map((points, index) => <FlowDots key={`runner-fuel-${index}`} points={points} color={COLORS.fuel}
        speed={reducedMotion ? 0 : .2 + effectiveThrottle} phase={index / METERING_INJECTOR_PATHS.length} count={3}
        active={engineRunning} radius={.039} />)}

      <group position={[0, -1.25, 0]}>
        <mesh position={[-.5, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[.52, 1.05, 22, 1, true]} /><meshStandardMaterial color="#b5d8d8" transparent opacity={.42} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[.5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[.52, 1.05, 22, 1, true]} /><meshStandardMaterial color="#b5d8d8" transparent opacity={.42} side={THREE.DoubleSide} />
        </mesh>
        <PaintedBox size={[.8, .55, .8]} position={[0, -.48, -.72]} color={COLORS.fuel} opacity={.58} />
        <Shaft start={[0, -.35, -.5]} end={[0, -.05, 0]} color={COLORS.fuel} radius={.045} />
      </group>

      <StudyLabel position={[-2.35, 1.15, 0]} color={COLORS.air}
        detail="Traps abrasive dust while allowing the engine to draw a clean, low-restriction stream of intake air.">AIR FILTER</StudyLabel>
      <StudyLabel position={[-1.05, 1.08, 0]} color="#28778c"
        detail="An electric actuator rotates the butterfly plate, changing airflow and therefore the torque the engine can produce.">BUTTERFLY + ACTUATOR</StudyLabel>
      <StudyLabel position={[.3, 1.02, .45]} color={COLORS.air}
        detail="Split the plenum’s metered air into four paths. Each cylinder’s intake stroke draws a pulse; its port injector adds the yellow fuel spray near the valve.">INTAKE RUNNERS</StudyLabel>
      <StudyLabel position={[.82, 1.65, 0]} color="#9b741b"
        detail="The rail supplies pressurized fuel; electronically timed injectors spray measured pulses toward each cylinder’s intake valve.">FUEL RAIL + INJECTORS</StudyLabel>
      <StudyLabel position={[0, -2.02, 0]} color="#8a6632" tooltipSide="above"
        detail="Fast air through the venturi lowers pressure and draws fuel through calibrated jets, replacing electronic injection rather than supplementing it.">OLDER ALTERNATIVE · CARBURETOR VENTURI + JET</StudyLabel>
    </group>
  )
}

function EngineCylinderChip({ cylinder, x, chipRef }) {
  return (
    <Html position={[x, 1.28, .48]} center sprite distanceFactor={9} zIndexRange={[115, 0]}
      style={{ pointerEvents: 'none' }}>
      <span ref={chipRef} className="engine-cylinder-chip">C{cylinder}</span>
    </Html>
  )
}

function AnimatedInlineFourCore({ phaseRef, throttle = 0, onPowerCylinder }) {
  const pistons = useRef([])
  const rods = useRef([])
  const crank = useRef()
  const chamberMaterials = useRef([])
  const pistonMaterials = useRef([])
  const rodMaterials = useRef([])
  const cylinderChips = useRef([])
  const lastPowerCylinder = useRef(null)
  const vectors = useMemo(() => INLINE_FOUR_CYLINDERS.map(() => ({ rodDirection: new THREE.Vector3() })), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const crankCenterY = -1.05
  const crankRadius = .31
  const rodLength = 1.28
  const pistonCrownOffset = .15

  useEffect(() => {
    onPowerCylinder?.(1)
  }, [onPowerCylinder])

  useFrame(() => {
    const cycleAngle = phaseRef.current
    const powerEvent = activePowerCylinder(cycleAngle)
    const load = .28 + clamp01(throttle) * .72
    // Pressure rises sharply just after ignition near TDC, then decays as the
    // expanding gases push the piston through the rest of the power stroke.
    const rapidRise = 1 - Math.exp(-powerEvent.progress * 42)
    const expansionDecay = Math.exp(-powerEvent.progress * 2.8)
    const pressurePulse = rapidRise * expansionDecay * load

    if (lastPowerCylinder.current !== powerEvent.cylinder) {
      lastPowerCylinder.current = powerEvent.cylinder
      onPowerCylinder?.(powerEvent.cylinder)
      cylinderChips.current.forEach((chip, index) => {
        chip?.classList.toggle('is-power', INLINE_FOUR_CYLINDERS[index].cylinder === powerEvent.cylinder)
      })
    }
    if (crank.current) crank.current.rotation.x = cycleAngle

    INLINE_FOUR_CYLINDERS.forEach((cylinder, index) => {
      const pose = sliderCrankPose(cycleAngle + cylinder.crankThrowPhase, {
        crankCenterY,
        crankRadius,
        rodLength,
        pistonCrownOffset,
      })
      const active = powerEvent.cylinder === cylinder.cylinder
      const piston = pistons.current[index]
      const rod = rods.current[index]
      if (piston) piston.position.set(cylinder.x, pose.pistonY, 0)
      if (rod) {
        rod.position.set(cylinder.x, pose.rodMidpointY, pose.rodMidpointZ)
        vectors[index].rodDirection.set(0, pose.rodDeltaY, pose.rodDeltaZ).normalize()
        rod.quaternion.setFromUnitVectors(up, vectors[index].rodDirection)
      }

      const chamberMaterial = chamberMaterials.current[index]
      if (chamberMaterial) {
        chamberMaterial.opacity = active ? .16 + pressurePulse * .64 : .035
        chamberMaterial.emissiveIntensity = active ? .4 + pressurePulse * 1.4 : 0
      }
      const pistonMaterial = pistonMaterials.current[index]
      if (pistonMaterial) pistonMaterial.emissiveIntensity = active ? .08 + pressurePulse * .48 : 0
      const rodMaterial = rodMaterials.current[index]
      if (rodMaterial) rodMaterial.emissiveIntensity = active ? .06 + pressurePulse * .38 : 0
    })
  })

  return (
    <group>
      {INLINE_FOUR_CYLINDERS.map((cylinder, index) => (
        <group key={cylinder.cylinder}>
          <mesh position={[cylinder.x, .45, 0]}>
            <cylinderGeometry args={[.34, .34, 1.55, 20, 1, true]} />
            <meshStandardMaterial color="#d7f1ef" transparent opacity={.16} depthWrite={false} side={THREE.DoubleSide} />
            <Edges color="#75483f" />
          </mesh>
          <mesh position={[cylinder.x, 1.12, 0]}>
            <cylinderGeometry args={[.3, .3, .2, 20]} />
            <meshStandardMaterial ref={(node) => { chamberMaterials.current[index] = node }}
              color="#fff0b4" emissive={COLORS.burn} transparent opacity={.035} depthWrite={false} />
          </mesh>
          <group ref={(node) => { pistons.current[index] = node }}>
            <mesh>
              <cylinderGeometry args={[.29, .29, .25, 20]} />
              <meshStandardMaterial ref={(node) => { pistonMaterials.current[index] = node }}
                color={COLORS.fuel} emissive={COLORS.burn} />
              <Edges color="#8e573d" />
            </mesh>
            {[.065, .12].map((y) => <mesh key={y} position={[0, y, 0]}><torusGeometry args={[.285, .016, 7, 20]} /><meshStandardMaterial color={COLORS.ink} /></mesh>)}
          </group>
          <mesh ref={(node) => { rods.current[index] = node }} scale={[.72, rodLength, .72]}>
            <cylinderGeometry args={[.065, .065, 1, 12]} />
            <meshStandardMaterial ref={(node) => { rodMaterials.current[index] = node }}
              color={COLORS.power} emissive={COLORS.burn} />
          </mesh>
          <EngineCylinderChip cylinder={cylinder.cylinder} x={cylinder.x}
            chipRef={(node) => { cylinderChips.current[index] = node }} />
        </group>
      ))}

      <group ref={crank} position={[0, crankCenterY, 0]}>
        <Shaft start={[-1.65, 0, 0]} end={[1.65, 0, 0]} color={COLORS.powerDark} radius={.1} />
        {INLINE_FOUR_CYLINDERS.map((cylinder) => (
          <group key={cylinder.cylinder} position={[cylinder.x, 0, 0]} rotation={[cylinder.crankThrowPhase, 0, 0]}>
            <PaintedBox size={[.11, crankRadius * 2.05, .12]} color={COLORS.power} />
            <Shaft start={[-.14, crankRadius, 0]} end={[.14, crankRadius, 0]} color={COLORS.cream} radius={.085} />
            <mesh position={[0, -crankRadius * .72, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[.18, .25, .12, 16]} />
              <meshStandardMaterial color={COLORS.powerDark} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

function EngineStudy({ rpm, throttle, onPowerCylinder }) {
  const phase = useRef(0)
  const reducedMotion = useContext(ReducedMotionContext)
  useFrame((_, delta) => {
    if (reducedMotion || rpm < 200) return
    const teachingSpeed = 1.65 + Math.min(.55, Math.max(0, rpm) / 6000 * .55)
    phase.current = (phase.current + delta * teachingSpeed) % (Math.PI * 4)
  })
  return (
    <group rotation={[0, .2, 0]}>
      <ExplodedPiece from={[0, 1.1, 0]} to={[0, 1.9, 0]}>
        <PaintedBox size={[3.25, .38, .94]} color="#f1c75b" opacity={.86} />
        {INLINE_FOUR_CYLINDERS.map((cylinder) => (
          <group key={cylinder.cylinder}>
            <Shaft start={[cylinder.x, -.35, -.2]} end={[cylinder.x, .18, -.2]} color={COLORS.air} radius={.048} />
            <Shaft start={[cylinder.x, -.35, .2]} end={[cylinder.x, .18, .2]} color="#d38d27" radius={.048} />
            <mesh position={[cylinder.x, -.28, 0]}><coneGeometry args={[.075, .28, 9]} /><meshStandardMaterial color="#fff176" /></mesh>
          </group>
        ))}
      </ExplodedPiece>
      <AnimatedInlineFourCore phaseRef={phase} throttle={throttle} onPowerCylinder={onPowerCylinder} />
      <ExplodedPiece from={[0, 0, 0]} to={[.42, 0, 0]}>
        <Shaft start={[1.5, -1.05, 0]} end={[2.08, -1.05, 0]} color={COLORS.powerDark} radius={.1} />
        <RotatingDisc position={[2.35, -1.05, 0]} radius={.62} depth={.18} color={COLORS.power} phaseRef={phase} />
      </ExplodedPiece>
      <StudyLabel position={[0, 2.18, 0]} color="#9b741b"
        detail="Valve and spark timing decide whether each cylinder is on intake, compression, power, or exhaust—even when paired pistons share the same position.">CYLINDER HEAD · VALVES · PLUGS</StudyLabel>
      <StudyLabel position={[-1.92, .62, .1]} color="#8e573d"
        detail="Combustion pushes one piston at a time. Its rod loads an offset crankpin; the other cylinders are simultaneously completing different strokes.">4 PISTONS + CONNECTING RODS</StudyLabel>
      <StudyLabel position={[0, -1.72, .48]} color={COLORS.power} tooltipSide="above"
        detail="Throws for cylinders 1 and 4 align; throws for 2 and 3 align opposite. Those offset crankpins give every rod leverage on one shared shaft.">CRANK THROW PAIRS · 180° OPPOSED</StudyLabel>
      <StudyLabel position={[2.28, -1.72, 0]} color={COLORS.powerDark} tooltipSide="above"
        detail="The flywheel stores rotational energy between combustion pulses, smooths crank speed, and passes torque toward the coupling and gearbox.">OUTPUT FLYWHEEL</StudyLabel>
    </group>
  )
}

function CouplingStudy({ rpm, vehicleSpeed, gear }) {
  const engineSpeed = Math.min(6, Math.max(0, rpm) / 850 * 2.2)
  const ratio = Math.abs(getGearRatio(gear))
  const turbineSpeed = gear === 0 ? 0 : THREE.MathUtils.clamp(drivelineSpeeds(vehicleSpeed).propshaft * ratio, -6, 6)
  return (
    <group>
      <ExplodedPiece from={[0, 0, 0]} to={[-2.35, 0, 0]}><RotatingDisc position={[0, 0, 0]} radius={1.05} depth={.12} color={COLORS.fuel} speed={engineSpeed} /></ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[-1.18, 0, 0]}><RotatingDisc position={[0, 0, 0]} radius={.94} depth={.25} color={COLORS.burn} speed={engineSpeed} /></ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[-.2, 0, 0]}><RotatingDisc position={[0, 0, 0]} radius={.72} depth={.22} color="#77bdd2" speed={turbineSpeed} /></ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[-.2, 0, 0]}><RotatingDisc position={[.52, 0, 0]} radius={.36} depth={.24} color={COLORS.powerDark} speed={0} /></ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[1.35, 0, 0]}><RotatingDisc position={[0, 0, 0]} radius={.9} depth={.16} color="#d8c8e8" speed={turbineSpeed} /></ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[2.2, 0, 0]}><Shaft start={[-.1, 0, 0]} end={[1.1, 0, 0]} color={COLORS.power} radius={.12} /></ExplodedPiece>
      <mesh rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[1.22, .08, 12, 32]} /><meshStandardMaterial color="#b9a89c" transparent opacity={.35} /></mesh>
      <StudyLabel position={[-2.35, 1.4, 0]} color="#9b741b"
        detail="Bolted to the crankshaft, the flexplate carries engine torque into the converter while tolerating slight alignment movement.">FLEXPLATE · ENGINE INPUT</StudyLabel>
      <StudyLabel position={[-1.18, 1.12, 0]} color={COLORS.burn}
        detail="Engine-driven impeller vanes accelerate transmission fluid outward, creating the moving fluid that transfers torque across the converter.">IMPELLER MOVES FLUID</StudyLabel>
      <StudyLabel position={[-.2, -1.25, 0]} color="#28778c"
        detail="Fluid drives the turbine; the stator redirects returning flow to increase launch torque before its one-way clutch overruns.">TURBINE + STATOR</StudyLabel>
      <StudyLabel position={[1.35, 1.18, 0]} color={COLORS.power}
        detail="Clamps the turbine to the converter cover during steady driving, eliminating fluid slip and improving efficiency.">LOCK-UP CLUTCH</StudyLabel>
      <StudyLabel position={[2.55, .55, 0]} color={COLORS.powerDark}
        detail="Receives turbine or lock-up-clutch torque and carries it into the transmission’s planetary gearsets.">GEARBOX INPUT SHAFT</StudyLabel>
    </group>
  )
}

function PlanetarySet({ inputSpeed, outputSpeed, selecting = false, torqueTransfer = 1, selectedGear = 0 }) {
  const carrier = useRef()
  const reducedMotion = useContext(ReducedMotionContext)
  useFrame((_, delta) => {
    if (carrier.current && !reducedMotion) carrier.current.rotation.x -= delta * outputSpeed
  })
  const pathOpacity = .3 + clamp01(torqueTransfer, 1) * .7
  return (
    <group>
      {[1, 2, 3, 4].map((gearValue, index) => {
        const active = Number(selectedGear) === gearValue
        return (
          <group key={gearValue} position={[(index - 1.5) * .17, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <mesh>
              <torusGeometry args={[1.27, active ? .055 : .028, 8, 34]} />
              <meshStandardMaterial color={active ? COLORS.burn : COLORS.metal} transparent
                opacity={active ? .96 : .2} emissive={COLORS.burn}
                emissiveIntensity={active ? (selecting ? .7 : .3) : 0} />
            </mesh>
          </group>
        )
      })}
      <group rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <torusGeometry args={[1.05, .14, 12, 34]} />
          <meshStandardMaterial color={COLORS.power} transparent opacity={pathOpacity}
            emissive={COLORS.power} emissiveIntensity={selecting ? .42 : .08} />
        </mesh>
      </group>
      <RotatingDisc position={[0, 0, 0]} radius={.32} depth={.22} color={COLORS.fuel}
        speed={inputSpeed} opacity={pathOpacity} />
      <group ref={carrier}>
        {[[0, .62], [.54, -.31], [-.54, -.31]].map(([y, z], index) => (
          <RotatingDisc key={index} position={[0, y, z]} radius={.25} depth={.2} color="#d8c8e8"
            speed={-(inputSpeed - outputSpeed) * 1.2} opacity={pathOpacity} />
        ))}
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[.72, .045, 8, 28]} />
          <meshStandardMaterial color={selecting ? COLORS.burn : COLORS.cream}
            emissive={COLORS.burn} emissiveIntensity={selecting ? .34 : 0} />
        </mesh>
      </group>
    </group>
  )
}

function ClutchCircuitTag({ circuit, selected, pressurized }) {
  if (!selected) return null
  return (
    <Html position={[0, 0, .43]} center sprite distanceFactor={8.5} zIndexRange={[80, 0]}
      style={{ pointerEvents: 'none' }}>
      <span className={`gear-clutch-tag is-selected ${pressurized ? 'is-pressurized' : ''}`}
        aria-label={`${circuit.id} ${circuit.label} clutch selected`}>
        <b>{circuit.id}</b>
      </span>
    </Html>
  )
}

function MiniClutchPack({ circuit, inputSpeed, selected, clampAmount, pressurized }) {
  const leftPlate = useRef()
  const rightPlate = useRef()
  const reducedMotion = useContext(ReducedMotionContext)

  useFrame((_, delta) => {
    const blend = reducedMotion ? 1 : 1 - Math.exp(-delta * 13)
    const gap = .055 + (1 - clamp01(clampAmount)) * .105
    if (leftPlate.current) leftPlate.current.position.x = THREE.MathUtils.lerp(leftPlate.current.position.x, -gap, blend)
    if (rightPlate.current) rightPlate.current.position.x = THREE.MathUtils.lerp(rightPlate.current.position.x, gap, blend)
  })

  const color = selected ? COLORS.burn : '#b9aeb6'
  const opacity = selected ? .96 : .25
  return (
    <group position={[0, circuit.y, 0]}>
      <Shaft start={[-.42, 0, 0]} end={[.42, 0, 0]} color={selected ? COLORS.power : COLORS.metal}
        radius={.035} opacity={selected ? .9 : .25} />
      <group ref={leftPlate} position={[-.16, 0, 0]}>
        <RotatingDisc position={[0, 0, 0]} radius={.245} depth={.055} color={color} speed={inputSpeed} opacity={opacity} />
      </group>
      <group ref={rightPlate} position={[.16, 0, 0]}>
        <RotatingDisc position={[0, 0, 0]} radius={.245} depth={.055}
          color={selected ? COLORS.power : '#d8c8d6'} speed={inputSpeed} opacity={opacity} />
      </group>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[.3, .025, 8, 22]} />
        <meshStandardMaterial color={pressurized ? '#2f9a96' : COLORS.metal} transparent opacity={selected ? .95 : .2}
          emissive="#2f9a96" emissiveIntensity={pressurized ? .6 : 0} />
      </mesh>
      <ClutchCircuitTag circuit={circuit} selected={selected} pressurized={pressurized} />
    </group>
  )
}

function ClutchApplicationBank({ inputSpeed, selectedCircuitIds, clampAmount, pressurized }) {
  const selected = useMemo(() => new Set(selectedCircuitIds), [selectedCircuitIds])
  return (
    <group>
      <Shaft start={[-.58, 0, 0]} end={[.58, 0, 0]} color={COLORS.power} radius={.085} />
      {CLUTCH_CIRCUITS.map((circuit) => <MiniClutchPack key={circuit.id} circuit={circuit}
        inputSpeed={inputSpeed} selected={selected.has(circuit.id)}
        clampAmount={selected.has(circuit.id) ? clampAmount : 0}
        pressurized={selected.has(circuit.id) && pressurized} />)}
    </group>
  )
}

function ValvePortTag({ gear, active }) {
  if (!active) return null
  return (
    <Html position={[0, 0, .32]} center sprite distanceFactor={8.5} zIndexRange={[70, 0]}
      style={{ pointerEvents: 'none' }}>
      <span className={`gear-valve-port ${active ? 'is-active' : ''}`}>{gear === 0 ? 'N' : `G${gear}`}</span>
    </Html>
  )
}

function HydraulicGearSelector({ selectedGear, application, selecting, applying, statusLabel }) {
  const spool = useRef()
  const reducedMotion = useContext(ReducedMotionContext)
  const portX = (Number(selectedGear) - 2) * .58
  const circuitIds = application.circuits.map((circuit) => circuit.id)
  const pressureMoving = selecting || applying

  useFrame((_, delta) => {
    if (!spool.current) return
    const blend = reducedMotion ? 1 : 1 - Math.exp(-delta * 10)
    spool.current.position.x = THREE.MathUtils.lerp(spool.current.position.x, portX, blend)
  })

  return (
    <group>
      <PaintedBox size={[3.25, .38, .78]} position={[0, -1.47, .92]} color="#79bdc5" opacity={.7} />
      <Shaft start={[-1.45, -1.47, .92]} end={[1.45, -1.47, .92]} color="#d9f0eb" radius={.085} opacity={.9} />
      {[0, 1, 2, 3, 4].map((gear) => {
        const x = (gear - 2) * .58
        return (
          <group key={gear} position={[x, -1.47, .92]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[.13, .13, .42, 14]} />
              <meshStandardMaterial color={gear === selectedGear ? COLORS.burn : '#d3e3df'}
                emissive={COLORS.burn} emissiveIntensity={gear === selectedGear ? .38 : 0} />
            </mesh>
            <ValvePortTag gear={gear} active={gear === selectedGear} />
          </group>
        )
      })}
      <group ref={spool} position={[portX, -1.47, .92]}>
        <PaintedBox size={[.42, .64, .34]} color={COLORS.burn} opacity={.95} />
      </group>
      {CLUTCH_CIRCUITS.filter((circuit) => circuitIds.includes(circuit.id)).map((circuit, index) => {
        const points = [
          [portX, -1.26, .92],
          [-.2 - index * .18, -1.08, .76],
          [-1.0, circuit.y, .48],
          [-1.75, circuit.y, .2],
        ]
        return <FlowDots key={circuit.id} points={points} color="#2f9a96" speed={.7 + index * .12}
          count={5} active={pressureMoving} radius={.038} />
      })}
      <StudyLabel position={[.25, -1.76, 1.02]} color="#28778c" tooltipSide="above"
        className="gearbox-study-label gearbox-study-label--valve"
        detail="A control unit commands hydraulic solenoids. The valve-body spool routes pressurized fluid to the clutch pair in the teaching application chart. Exact clutch names and combinations vary by transmission.">
        VALVE BODY · {statusLabel}
      </StudyLabel>
    </group>
  )
}

function GearboxStudy({
  engagedGear,
  targetGear,
  shiftStage = 'engaged',
  shiftProgress = 1,
  torqueTransfer = 1,
  gearboxInputRpm,
  gearboxOutputRpm,
  vehicleSpeed,
}) {
  const stage = normalizeShiftStage(shiftStage)
  const progress = clamp01(shiftProgress, stage === 'engaged' ? 1 : 0)
  const engaged = Number.isFinite(Number(engagedGear)) ? Number(engagedGear) : 0
  const target = Number.isFinite(Number(targetGear)) ? Number(targetGear) : engaged
  const selecting = stage.includes('select') || stage.includes('ratio') || stage.includes('match')
  const applying = stage.includes('apply') || (stage.includes('engage') && stage !== 'engaged')
  const releasing = stage.includes('release') || stage.includes('open')
  const displayGear = selecting || applying ? target : engaged
  const ratio = Math.abs(getGearRatio(displayGear))
  const safeTransfer = clamp01(torqueTransfer, stage === 'engaged' ? 1 : 0)
  const application = TEACHING_GEAR_APPLICATIONS[displayGear] || TEACHING_GEAR_APPLICATIONS[0]
  const selectedCircuitIds = application.circuits.map((circuit) => circuit.id)
  const applicationLabel = selectedCircuitIds.length ? selectedCircuitIds.join(' + ') : 'NONE'
  const clutchClamp = displayGear === 0 ? 0
    : releasing ? 1 - progress
      : selecting ? 0
        : applying ? .25 + progress * .65
          : 1
  const clutchPressurized = displayGear !== 0 && (selecting || applying || stage === 'engaged')
  const wheelRpm = Math.abs(Number(vehicleSpeed) || 0) / (2 * Math.PI * WHEEL_RADIUS) * 60
  const fallbackOutputRpm = wheelRpm * FINAL_DRIVE_RATIO
  const outputRpm = Number.isFinite(Number(gearboxOutputRpm)) ? Math.abs(Number(gearboxOutputRpm)) : fallbackOutputRpm
  const inputRpm = Number.isFinite(Number(gearboxInputRpm))
    ? Math.abs(Number(gearboxInputRpm))
    : ratio * outputRpm
  const inputSpeed = THREE.MathUtils.clamp(inputRpm / 720, -5.5, 5.5)
  const outputSpeed = THREE.MathUtils.clamp(outputRpm / 720, -5.5, 5.5)
  const torqueFlowing = displayGear !== 0 && safeTransfer > .03
  const valveStatus = displayGear === 0 ? 'OPEN'
    : selecting ? `ROUTING ${applicationLabel}`
      : applying ? `CLAMPING ${applicationLabel}`
        : releasing ? `RELEASING ${applicationLabel}`
          : `${applicationLabel} HELD`
  const laneY = GEAR_PATH_LANES[displayGear] || 0
  const torquePath = [
    [-2.85, 0, 0], [-1.5, 0, 0], [-.82, laneY, 0],
    [.78, laneY, 0], [1.5, 0, 0], [2.85, 0, 0],
  ]

  return (
    <group>
      <ExplodedPiece from={[0, 0, 0]} to={[0, 1.6, 0]}><PaintedBox size={[4.4, .42, 2.75]} color="#bda8d1" opacity={.2} /></ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[0, -1.6, 0]}><PaintedBox size={[4.4, .42, 2.75]} color="#bda8d1" opacity={.2} /></ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[-1.75, 0, 0]}>
        <ClutchApplicationBank inputSpeed={inputSpeed} selectedCircuitIds={selectedCircuitIds}
          clampAmount={clutchClamp} pressurized={clutchPressurized} />
      </ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[.05, 0, 0]}>
        <PlanetarySet inputSpeed={inputSpeed} outputSpeed={outputSpeed}
          selecting={selecting} torqueTransfer={safeTransfer} selectedGear={displayGear} />
      </ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[1.85, 0, 0]}>
        <RotatingDisc position={[-.55, 0, 0]} radius={.78} depth={.13}
          color={displayGear === 0 ? COLORS.metal : COLORS.burn} speed={outputSpeed}
          opacity={.38 + safeTransfer * .62} />
        <Shaft start={[-.45, 0, 0]} end={[1.15, 0, 0]} color={COLORS.powerDark} radius={.12} />
      </ExplodedPiece>
      {[1, 2, 3, 4].map((gearValue) => {
        const y = GEAR_PATH_LANES[gearValue]
        const path = [[-1.5, 0, 0], [-.82, y, 0], [.78, y, 0], [1.5, 0, 0]]
        const active = gearValue === displayGear
        return (
          <group key={gearValue}>
            {path.slice(1).map((point, index) => <Shaft key={index} start={path[index]} end={point}
              color={active ? COLORS.burn : COLORS.metal} radius={active ? .03 : .014}
              opacity={active ? .18 + safeTransfer * .55 : .12} />)}
            {active && <Html position={[0, y, .38]} center sprite distanceFactor={8.5} zIndexRange={[65, 0]}
              style={{ pointerEvents: 'none' }}>
              <span className="gear-ratio-lane is-active">G{gearValue}</span>
            </Html>}
          </group>
        )
      })}
      <FlowDots points={torquePath} color={COLORS.burn} speed={.35 + safeTransfer * .9}
        count={12} active={torqueFlowing} radius={.045} />
      <HydraulicGearSelector selectedGear={displayGear} application={application}
        selecting={selecting} applying={applying} statusLabel={valveStatus} />
      <StudyLabel position={[-2.2, -.92, .08]} color="#a9443a" tooltipSide="above"
        className="gearbox-study-label gearbox-study-label--clutches"
        detail="A ratio is established by clamping a specific pair of friction elements. The selected plates close; unselected packs remain released. Exact clutch names vary by transmission.">
        CLUTCH PACKS · {displayGear === 0 ? 'OPEN' : applicationLabel}
      </StudyLabel>
      <StudyLabel position={[.15, 1.25, 0]} color={COLORS.power}
        className="gearbox-study-label gearbox-study-label--planetary"
        detail="The four thin selector rings are a teaching map of the available ratio circuits, not four literal gears. The glowing ring is the selected circuit. Real automatics combine several planetary members according to a clutch application chart.">
        PLANETARY SET · {displayGear === 0 ? 'OPEN' : `G${displayGear} · ${ratio.toFixed(2)}:1`}
      </StudyLabel>
    </group>
  )
}

function UJoint({ position, color = COLORS.power }) {
  return (
    <group position={position}>
      <mesh rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[.42, .08, 10, 24]} /><meshStandardMaterial color={color} /></mesh>
      <PaintedBox size={[.18, .86, .18]} color={COLORS.cream} />
      <PaintedBox size={[.18, .18, .86]} color={COLORS.cream} />
    </group>
  )
}

function DriveshaftStudy({ speed }) {
  const assembly = useRef()
  const reducedMotion = useContext(ReducedMotionContext)
  const { propshaft } = drivelineSpeeds(speed)
  useFrame((_, delta) => {
    if (assembly.current && !reducedMotion) assembly.current.rotation.x -= delta * propshaft
  })
  return (
    <group>
      <group ref={assembly}>
        <ExplodedPiece from={[0, 0, 0]} to={[-2.65, 0, 0]}><RotatingDisc position={[0, 0, 0]} radius={.62} depth={.18} color={COLORS.powerDark} speed={0} /></ExplodedPiece>
        <ExplodedPiece from={[0, 0, 0]} to={[-1.85, 0, 0]}><UJoint position={[0, 0, 0]} /></ExplodedPiece>
        <ExplodedPiece from={[0, 0, 0]} to={[-.92, 0, 0]}>
          <Shaft start={[-.55, 0, 0]} end={[.55, 0, 0]} color="#d8c8e8" radius={.18} />
          {[-.42, -.22, 0, .22, .42].map((x) => <PaintedBox key={x} size={[.055, .36, .055]} position={[x, 0, 0]} color={COLORS.powerDark} />)}
        </ExplodedPiece>
        <ExplodedPiece from={[0, 0, 0]} to={[.45, 0, 0]}>
          <Shaft start={[-.85, 0, 0]} end={[.85, 0, 0]} color={COLORS.power} radius={.27} />
          <Shaft start={[-.8, 0, 0]} end={[.8, 0, 0]} color="#efe4f5" radius={.16} opacity={.42} />
        </ExplodedPiece>
        <ExplodedPiece from={[0, 0, 0]} to={[1.82, 0, 0]}><UJoint position={[0, 0, 0]} /></ExplodedPiece>
        <ExplodedPiece from={[0, 0, 0]} to={[2.62, 0, 0]}><RotatingDisc position={[0, 0, 0]} radius={.62} depth={.18} color={COLORS.powerDark} speed={0} /></ExplodedPiece>
      </group>
      <StudyLabel position={[-2.65, 1.0, 0]} color={COLORS.powerDark}
        detail="A centered bolted joint connects the transmission output to the driveshaft and transfers torque without relative slip.">GEARBOX FLANGE</StudyLabel>
      <StudyLabel position={[-1.85, -1.0, 0]} color={COLORS.power}
        detail="Allows the rotating shafts to meet at an angle while continuing to transmit torque through the articulated cross.">UNIVERSAL JOINT</StudyLabel>
      <StudyLabel position={[-.9, 1.0, 0]} color={COLORS.powerDark}
        detail="Telescopes as driveline length changes with suspension movement while interlocking teeth continue transmitting torque.">SLIDING SPLINE</StudyLabel>
      <StudyLabel position={[.45, 1.0, 0]} color={COLORS.power}
        detail="The hollow driveshaft tube carries torsional load efficiently, providing high stiffness with less mass than a solid shaft.">HOLLOW TORQUE TUBE</StudyLabel>
      <StudyLabel position={[1.82, -1.0, 0]} color={COLORS.power}
        detail="Accommodates the pinion angle; correctly phased joint pairs minimize the speed variation created by each joint.">UNIVERSAL JOINT</StudyLabel>
      <StudyLabel position={[2.62, 1.0, 0]} color={COLORS.powerDark}
        detail="Bolts the rear universal joint to the differential’s drive pinion, completing the propshaft torque handoff.">PINION FLANGE</StudyLabel>
    </group>
  )
}

function DifferentialStudy({ speed }) {
  const carrierAssembly = useRef()
  const reducedMotion = useContext(ReducedMotionContext)
  const { wheel, propshaft } = drivelineSpeeds(speed)
  useFrame((_, delta) => {
    if (carrierAssembly.current && !reducedMotion) carrierAssembly.current.rotation.x -= delta * wheel
  })
  return (
    <group>
      <ExplodedPiece from={[0, 0, 0]} to={[0, 0, -1.65]}>
        <Shaft start={[0, 0, -1]} end={[0, 0, .65]} color={COLORS.power} radius={.12} />
        <RotatingDisc position={[0, 0, .6]} radius={.38} depth={.22} color={COLORS.fuel} speed={propshaft} axis="z" />
      </ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[0, 0, 0]}>
        <group ref={carrierAssembly}>
          <group rotation={[0, Math.PI / 2, 0]}><mesh><torusGeometry args={[1.1, .16, 12, 34]} /><meshStandardMaterial color={COLORS.power} /></mesh></group>
          <mesh><sphereGeometry args={[.72, 18, 12]} /><meshStandardMaterial color="#d8c8e8" transparent opacity={.28} /><Edges color={COLORS.powerDark} /></mesh>
          <RotatingDisc position={[-.52, 0, 0]} radius={.36} depth={.15} color="#77bdd2" speed={0} />
          <RotatingDisc position={[.52, 0, 0]} radius={.36} depth={.15} color="#77bdd2" speed={0} />
          <RotatingDisc position={[0, .38, 0]} radius={.22} depth={.13} color={COLORS.fuel} speed={0} axis="z" />
          <RotatingDisc position={[0, -.38, 0]} radius={.22} depth={.13} color={COLORS.fuel} speed={0} axis="z" />
        </group>
      </ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[-1.45, 0, 0]}><Shaft start={[-1.3, 0, 0]} end={[.55, 0, 0]} color={COLORS.powerDark} radius={.11} /></ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[1.45, 0, 0]}><Shaft start={[-.55, 0, 0]} end={[1.3, 0, 0]} color={COLORS.powerDark} radius={.11} /></ExplodedPiece>
      <StudyLabel position={[0, 1.65, -.95]} color="#9b741b"
        detail="The small bevel pinion turns the larger ring gear through 90 degrees, reducing speed and multiplying torque.">DRIVE PINION</StudyLabel>
      <StudyLabel position={[0, 1.45, 0]} color={COLORS.power}
        detail="The ring gear is rigidly bolted to the carrier, so both rotate together at the final-drive output speed.">RING GEAR + CARRIER</StudyLabel>
      <StudyLabel position={[0, -1.25, 0]} color="#9b741b"
        detail="Permit left and right axle speeds to differ while an open differential delivers approximately equal torque to both sides.">SPIDER + SIDE GEARS</StudyLabel>
      <StudyLabel position={[-2.25, .65, 0]} color={COLORS.powerDark}
        detail="Carries torque from the left side gear to its wheel hub while rotating independently of the right axle.">LEFT AXLE</StudyLabel>
      <StudyLabel position={[2.25, .65, 0]} color={COLORS.powerDark}
        detail="Carries torque from the right side gear to its wheel hub while allowing a different cornering speed.">RIGHT AXLE</StudyLabel>
    </group>
  )
}

function TireAssembly({ angularSpeed }) {
  const tire = useRef()
  const reducedMotion = useContext(ReducedMotionContext)
  useFrame((_, delta) => {
    if (tire.current && !reducedMotion) tire.current.rotation.x -= delta * angularSpeed
  })
  return (
    <group ref={tire}>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[.92, .28, 16, 36]} /><meshStandardMaterial color="#303b3d" roughness={.92} /><Edges color="#18282b" />
      </mesh>
      {Array.from({ length: 12 }, (_, index) => {
        const angle = index / 12 * Math.PI * 2
        return <PaintedBox key={index} size={[.34, .09, .28]} position={[0, Math.cos(angle) * 1.18, Math.sin(angle) * 1.18]}
          rotation={[angle, 0, 0]} color="#202b2d" />
      })}
    </group>
  )
}

function TiresStudy({ speed, roadForce }) {
  const { wheel } = drivelineSpeeds(speed)
  const signedRoadForce = Number.isFinite(roadForce) ? roadForce : 0
  const forceSign = Math.sign(signedRoadForce)
  const forceLength = Math.min(2.4, Math.abs(signedRoadForce) / 2100)
  const showForces = forceSign !== 0 && forceLength > .08
  return (
    <group>
      <ExplodedPiece from={[0, 0, 0]} to={[-2.4, 0, 0]}><Shaft start={[-.7, 0, 0]} end={[.7, 0, 0]} color={COLORS.powerDark} radius={.14} /></ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[-1.25, 0, 0]}><RotatingDisc position={[0, 0, 0]} radius={.42} depth={.42} color={COLORS.metal} speed={wheel} /></ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[-.15, 0, 0]}><RotatingDisc position={[0, 0, 0]} radius={.78} depth={.3} color="#f3dfbd" speed={wheel} /></ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[1.3, 0, 0]}><TireAssembly angularSpeed={wheel} /></ExplodedPiece>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.3, -1.28, 0]} receiveShadow>
        <planeGeometry args={[4.2, 5]} /><meshStandardMaterial color="#8d8177" roughness={.95} />
      </mesh>
      <PaintedBox size={[.62, .035, .5]} position={[1.3, -1.23, 0]} color={COLORS.air} emissive={COLORS.air} emissiveIntensity={.42} />
      {showForces && (
        <>
          <ForceArrow from={[.95, -1.14, 0]} direction={[0, 0, -forceSign]} length={forceLength} color="#28778c" label="ROAD PUSHES CAR" />
          <ForceArrow from={[1.65, -1.17, 0]} direction={[0, 0, forceSign]} length={forceLength} color={COLORS.burn} label="TIRE PUSHES ROAD" />
        </>
      )}
      <StudyLabel position={[-2.4, .85, 0]} color={COLORS.powerDark}
        detail="Interlocking splines transfer axle torque into the hub without slipping while allowing the assembly to be serviced.">AXLE + SPLINES</StudyLabel>
      <StudyLabel position={[-1.25, .85, 0]} color={COLORS.metal}
        detail="The hub supports and centers the wheel; bearings carry vehicle loads while allowing low-friction rotation.">HUB + BEARINGS</StudyLabel>
      <StudyLabel position={[-.15, 1.08, 0]} color="#8a6632"
        detail="Bolts to the hub, retains the tire beads, and transmits hub torque into the tire carcass.">WHEEL RIM</StudyLabel>
      <StudyLabel position={[1.3, 1.62, 0]} color={COLORS.ink}
        detail="The carcass contains pressure and carries load, belts stabilize the tread, and tread rubber interacts with the road.">CARCASS · BELTS · TREAD</StudyLabel>
      <StudyLabel position={[1.3, -1.78, 0]} color="#28778c" tooltipSide="above"
        detail="Tire deformation creates a finite footprint where static friction transmits acceleration, braking, and cornering forces until grip is exceeded.">FLATTENED CONTACT PATCH</StudyLabel>
    </group>
  )
}

function BrakeStudy({ brake = 0, brakePressureBar, speed = 0 }) {
  const reducedMotion = useContext(ReducedMotionContext)
  const pedal = useRef()
  const masterPiston = useRef()
  const leftPad = useRef()
  const rightPad = useRef()
  const pressure = Number.isFinite(Number(brakePressureBar))
    ? THREE.MathUtils.clamp(Number(brakePressureBar), 0, 140)
    : clamp01(brake) * 90
  const application = Math.max(clamp01(brake), clamp01(pressure / 90))
  const wheelSpeed = drivelineSpeeds(speed).wheel

  useFrame((_, delta) => {
    const blend = reducedMotion ? 1 : 1 - Math.exp(-delta * 12)
    if (pedal.current) {
      pedal.current.rotation.z = THREE.MathUtils.lerp(pedal.current.rotation.z, -.12 - application * .42, blend)
    }
    if (masterPiston.current) {
      masterPiston.current.position.x = THREE.MathUtils.lerp(masterPiston.current.position.x, -.84 + application * .3, blend)
    }
    if (leftPad.current) {
      leftPad.current.position.x = THREE.MathUtils.lerp(leftPad.current.position.x, 2.12 + application * .11, blend)
    }
    if (rightPad.current) {
      rightPad.current.position.x = THREE.MathUtils.lerp(rightPad.current.position.x, 2.58 - application * .11, blend)
    }
  })

  const fluidPath = [[-.55, .28, .15], [.15, .28, .15], [.78, .42, .42], [1.55, .45, .72], [1.95, .28, .72]]
  const clampLength = application * .62
  return (
    <group>
      <ExplodedPiece from={[-1.4, 0, 0]} to={[-2.75, .1, 0]}>
        <group ref={pedal} rotation={[0, 0, -.12]}>
          <Shaft start={[0, .32, 0]} end={[.16, -.72, 0]} color={COLORS.ink} radius={.075} />
          <PaintedBox size={[.42, .16, .5]} position={[.19, -.78, 0]} color={COLORS.road} />
          <mesh position={[0, .32, 0]}><sphereGeometry args={[.11, 14, 10]} /><meshStandardMaterial color={COLORS.powerDark} /></mesh>
        </group>
      </ExplodedPiece>

      <ExplodedPiece from={[-1.5, .2, 0]} to={[-1.95, .25, 0]}>
        <RotatingDisc position={[0, 0, 0]} radius={.82} depth={.25} color={COLORS.ink} speed={0} spokes={false} />
        <RotatingDisc position={[.18, 0, 0]} radius={.62} depth={.18} color="#77bdd2" speed={0} spokes={false}
          opacity={.42 + application * .46} />
        <Shaft start={[-.65, 0, 0]} end={[.65, 0, 0]} color={COLORS.powerDark} radius={.08} />
      </ExplodedPiece>

      <ExplodedPiece from={[-.8, .25, 0]} to={[-.7, .25, 0]}>
        <Shaft start={[-.65, 0, 0]} end={[.72, 0, 0]} color="#9fcbd5" radius={.24} opacity={.58} />
        <group ref={masterPiston} position={[-.84, 0, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[.18, .18, .22, 18]} />
            <meshStandardMaterial color={COLORS.burn} emissive={COLORS.burn} emissiveIntensity={application * .3} />
          </mesh>
        </group>
        <PaintedBox size={[.55, .46, .62]} position={[.18, .55, 0]} color="#77bdd2" opacity={.56} />
      </ExplodedPiece>

      <Shaft start={[-.55, .28, .15]} end={[-.05, .28, .15]} color="#28778c" radius={.055} />
      <Shaft start={[-.05, .28, .15]} end={[.78, .42, .42]} color="#28778c" radius={.055} />
      <Shaft start={[.78, .42, .42]} end={[1.55, .45, .72]} color="#28778c" radius={.055} />
      <Shaft start={[1.55, .45, .72]} end={[1.95, .28, .72]} color="#28778c" radius={.055} />
      <FlowDots points={fluidPath} color="#77bdd2" speed={.3 + application * 1.1}
        count={11} active={application > .015} radius={.05} />

      <ExplodedPiece from={[1.25, 0, 0]} to={[2.35, 0, 0]}>
        <RotatingDisc position={[0, 0, 0]} radius={1.05} depth={.13} color={application > .55 ? '#d98762' : COLORS.metal}
          speed={wheelSpeed} spokes={false} />
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[.58, .11, 12, 30]} />
          <meshStandardMaterial color={COLORS.burn} transparent opacity={application * .5}
            emissive={COLORS.burn} emissiveIntensity={application * .48} />
        </mesh>
      </ExplodedPiece>

      <group>
        <PaintedBox size={[.68, .28, .38]} position={[2.35, .75, .55]} color="#28778c" />
        <PaintedBox size={[.68, .28, .38]} position={[2.35, -.75, .55]} color="#28778c" />
        <PaintedBox size={[.68, 1.28, .28]} position={[2.35, 0, .76]} color="#28778c" opacity={.68} />
        <group ref={leftPad} position={[2.12, 0, .48]}>
          <PaintedBox size={[.12, 1.15, .42]} color={COLORS.road} emissive={COLORS.burn} emissiveIntensity={application * .38} />
        </group>
        <group ref={rightPad} position={[2.58, 0, .48]}>
          <PaintedBox size={[.12, 1.15, .42]} color={COLORS.road} emissive={COLORS.burn} emissiveIntensity={application * .38} />
        </group>
      </group>

      {clampLength > .03 && (
        <>
          <ForceArrow from={[1.55, 0, .48]} direction={[1, 0, 0]} length={clampLength}
            color="#28778c" label="PAD CLAMP" />
          <ForceArrow from={[3.15, 0, .48]} direction={[-1, 0, 0]} length={clampLength} color="#28778c" />
        </>
      )}

      <StudyLabel position={[-2.55, 1.28, 0]} color={COLORS.ink}
        detail="The pedal provides leverage. The vacuum booster adds force, but braking still remains available with a harder pedal if boost is lost.">
        PEDAL + BOOSTER · {Math.round(application * 100)}%
      </StudyLabel>
      <StudyLabel position={[-.75, 1.2, 0]} color="#28778c"
        detail="The master-cylinder piston displaces nearly incompressible brake fluid. Its two real circuits provide redundancy; this schematic draws one path for clarity.">
        MASTER CYLINDER · {pressure.toFixed(0)} BAR
      </StudyLabel>
      <StudyLabel position={[.55, -.72, .35]} color="#28778c" tooltipSide="above"
        detail="Pressure is transmitted through sealed fluid, but fluid does not continuously flow to the caliper once pressure is established. Moving dots indicate pressure propagation, not circulation.">
        SEALED HYDRAULIC LINE
      </StudyLabel>
      <StudyLabel position={[2.0, 1.55, .65]} color="#28778c"
        detail="Hydraulic pistons squeeze pads against both faces of the rotor. Clamp force and pad friction create braking torque at the hub.">
        CALIPER + PADS
      </StudyLabel>
      <StudyLabel position={[2.8, -1.35, 0]} color={COLORS.burn} tooltipSide="above"
        detail="The rotating disc absorbs vehicle kinetic energy as heat. This is one wheel-end schematic; a service-brake master cylinder feeds multiple calipers.">
        ROTOR · FRICTION TO HEAT
      </StudyLabel>
    </group>
  )
}

export function ExplodedMechanismModel({
  partId,
  rpm,
  throttle,
  gear,
  engagedGear = gear,
  requestedGear,
  targetGear,
  shiftStage = 'engaged',
  shiftProgress = 1,
  torqueTransfer = 1,
  inputRpm,
  gearboxInputRpm,
  outputRpm,
  gearboxOutputRpm,
  gearboxTorque,
  gearboxOutputTorque,
  wheelTorque,
  speed,
  roadForce,
  brake = 0,
  brakePressureBar,
  onEnginePowerCylinder,
}) {
  const reducedMotion = usePrefersReducedMotion()
  const resolvedTargetGear = targetGear ?? requestedGear ?? engagedGear
  const resolvedInputRpm = gearboxInputRpm ?? inputRpm
  const resolvedOutputRpm = gearboxOutputRpm ?? outputRpm
  const resolvedGearboxTorque = gearboxOutputTorque ?? gearboxTorque
  const resolvedWheelTorque = wheelTorque ?? (
    Number.isFinite(Number(resolvedGearboxTorque)) ? Number(resolvedGearboxTorque) * FINAL_DRIVE_RATIO : undefined
  )
  let study
  if (partId === 'metering') study = <MeteringStudy throttle={throttle} rpm={rpm} />
  else if (partId === 'engine') study = <EngineStudy rpm={rpm} throttle={throttle} onPowerCylinder={onEnginePowerCylinder} />
  else if (partId === 'coupling') study = <CouplingStudy rpm={rpm} vehicleSpeed={speed} gear={gear} />
  else if (partId === 'gearbox') study = <GearboxStudy rpm={rpm} engagedGear={engagedGear} targetGear={resolvedTargetGear}
    shiftStage={shiftStage} shiftProgress={shiftProgress} torqueTransfer={torqueTransfer}
    gearboxInputRpm={resolvedInputRpm} gearboxOutputRpm={resolvedOutputRpm}
    gearboxOutputTorque={resolvedGearboxTorque} wheelTorque={resolvedWheelTorque} vehicleSpeed={speed} />
  else if (partId === 'shaft') study = <DriveshaftStudy speed={speed} />
  else if (partId === 'differential') study = <DifferentialStudy speed={speed} />
  else if (partId === 'brakes' || partId === 8 || partId === '8') study = <BrakeStudy brake={brake}
    brakePressureBar={brakePressureBar} speed={speed} />
  else study = <TiresStudy speed={speed} roadForce={roadForce} />

  return <ReducedMotionContext.Provider value={reducedMotion}>{study}</ReducedMotionContext.Provider>
}

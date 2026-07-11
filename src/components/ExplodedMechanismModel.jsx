import { Edges, Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { FINAL_DRIVE_RATIO } from '../physics.js'
import { FlowDots, ForceArrow, PaintedBox } from './SceneKit.jsx'

const COLORS = {
  ink: '#304e54', air: '#3f9a9d', fuel: '#f2c348', burn: '#e6543f',
  power: '#76569b', powerDark: '#65468b', metal: '#a9aaa3', cream: '#fff0b4', road: '#8b8179',
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const ReducedMotionContext = createContext(false)
const WHEEL_RADIUS = 0.31
const VISUAL_ROTATION_SCALE = 0.35
const STUDY_GEAR_RATIOS = [0, 3.55, 2.19, 1.52, 1.16]
const METERING_RUNNER_ZS = [-.42, -.14, .14, .42]
const METERING_AIR_PATH = [[-3, .45, 0], [-2.25, .45, 0], [-1.05, .45, 0], [.2, .42, 0]]
const METERING_FUEL_RAIL_PATH = [[.82, 1.25, -.62], [.82, 1.25, .62]]
const METERING_RUNNER_PATHS = METERING_RUNNER_ZS.map((z) => [
  [.2, .42, z], [.55, .25, z], [1.45, .05, z], [1.88, -.03, z],
])
const METERING_INJECTOR_PATHS = METERING_RUNNER_ZS.map((z) => [
  [.82, 1.2, z], [.86, .7, z], [.98, .25, z], [1.35, .07, z], [1.88, -.03, z],
])

function StudyLabel({ position, color = COLORS.ink, children, detail, tooltipSide = 'below' }) {
  const tooltipId = useId()
  return (
    <Html position={position} center sprite distanceFactor={9} zIndexRange={[120, 0]}
      wrapperClass="exploded-label-layer" style={{ pointerEvents: 'auto' }}>
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

function AnimatedEngineCore({ phaseRef }) {
  const piston = useRef()
  const crank = useRef()
  const rod = useRef()
  const rodDirection = useMemo(() => new THREE.Vector3(), [])
  const pistonPin = useMemo(() => new THREE.Vector3(), [])
  const crankPin = useMemo(() => new THREE.Vector3(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const crankCenterY = -1.05
  const crankRadius = .38
  const rodLength = 1.35
  useFrame(() => {
    const angle = phaseRef.current
    const crankLateral = Math.sin(angle) * crankRadius
    const pistonPinY = crankCenterY + Math.cos(angle) * crankRadius
      + Math.sqrt(rodLength ** 2 - crankLateral ** 2)
    crankPin.set(0, crankCenterY + Math.cos(angle) * crankRadius, crankLateral)
    pistonPin.set(0, pistonPinY, 0)
    if (piston.current) piston.current.position.y = pistonPinY + .18
    if (crank.current) crank.current.rotation.x = angle
    if (rod.current) {
      rodDirection.subVectors(crankPin, pistonPin)
      rod.current.position.copy(pistonPin).add(crankPin).multiplyScalar(.5)
      rod.current.quaternion.setFromUnitVectors(up, rodDirection.normalize())
    }
  })
  return (
    <group>
      <mesh position={[0, .45, 0]}>
        <cylinderGeometry args={[.58, .58, 1.75, 24, 1, true]} />
        <meshStandardMaterial color="#d7f1ef" transparent opacity={.2} side={THREE.DoubleSide} /><Edges color="#75483f" />
      </mesh>
      <group ref={piston}>
        <mesh><cylinderGeometry args={[.5, .5, .3, 24]} /><meshStandardMaterial color={COLORS.fuel} /><Edges color="#8e573d" /></mesh>
        {[.08, .14].map((y) => <mesh key={y} position={[0, y, 0]}><torusGeometry args={[.49, .025, 8, 24]} /><meshStandardMaterial color={COLORS.ink} /></mesh>)}
      </group>
      <mesh ref={rod} scale={[1, rodLength, 1]}><cylinderGeometry args={[.09, .09, 1, 14]} /><meshStandardMaterial color={COLORS.power} /></mesh>
      <group ref={crank} position={[0, -1.05, 0]}>
        <mesh rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[.38, .09, 12, 28]} /><meshStandardMaterial color={COLORS.powerDark} /></mesh>
        <PaintedBox size={[.12, .82, .12]} color={COLORS.power} />
        <mesh position={[0, .38, 0]}><sphereGeometry args={[.13, 14, 10]} /><meshStandardMaterial color={COLORS.cream} /></mesh>
      </group>
    </group>
  )
}

function EngineStudy({ rpm }) {
  const phase = useRef(0)
  const reducedMotion = useContext(ReducedMotionContext)
  useFrame((_, delta) => {
    if (reducedMotion) return
    const angularSpeed = Math.min(6.5, Math.max(0, rpm) / 850 * 2.2)
    phase.current = (phase.current + delta * angularSpeed) % (Math.PI * 2)
  })
  return (
    <group>
      <ExplodedPiece from={[0, 1.1, 0]} to={[0, 1.9, 0]}>
        <PaintedBox size={[1.5, .38, 1.35]} color="#f1c75b" opacity={.86} />
        <Shaft start={[-.32, -.35, 0]} end={[-.32, .18, 0]} color={COLORS.air} radius={.075} />
        <Shaft start={[.32, -.35, 0]} end={[.32, .18, 0]} color="#d38d27" radius={.075} />
        <mesh position={[0, -.28, 0]}><coneGeometry args={[.11, .35, 10]} /><meshStandardMaterial color="#fff176" /></mesh>
      </ExplodedPiece>
      <AnimatedEngineCore phaseRef={phase} />
      <ExplodedPiece from={[0, -1.05, 0]} to={[0, -1.52, 0]}>
        <Shaft start={[-1.65, 0, 0]} end={[1.65, 0, 0]} color={COLORS.powerDark} radius={.12} />
        <RotatingDisc position={[1.72, 0, 0]} radius={.72} depth={.18} color={COLORS.power} phaseRef={phase} />
      </ExplodedPiece>
      <StudyLabel position={[0, 2.05, 0]} color="#9b741b"
        detail="Timed valves control gas exchange, while the spark plug ignites the compressed air-fuel charge near top dead center.">CYLINDER HEAD · VALVES · SPARK PLUG</StudyLabel>
      <StudyLabel position={[-1.05, .55, 0]} color="#8e573d"
        detail="Combustion pressure pushes the piston; rings seal the chamber, control oil, and transfer heat into the cylinder wall.">PISTON + RINGS</StudyLabel>
      <StudyLabel position={[1.0, -.25, 0]} color={COLORS.power}
        detail="Carries alternating compression and tension between piston and offset crankpin, converting linear piston motion into crank rotation.">CONNECTING ROD</StudyLabel>
      <StudyLabel position={[0, -2.15, 0]} color={COLORS.powerDark} tooltipSide="above"
        detail="Crank throws convert rod force into torque; the flywheel smooths combustion pulses and passes rotation toward the coupling.">CRANKSHAFT + OUTPUT FLYWHEEL</StudyLabel>
    </group>
  )
}

function CouplingStudy({ rpm, vehicleSpeed, gear }) {
  const engineSpeed = Math.min(6, Math.max(0, rpm) / 850 * 2.2)
  const ratio = STUDY_GEAR_RATIOS[gear] || 0
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

function PlanetarySet({ inputSpeed, outputSpeed }) {
  const carrier = useRef()
  const reducedMotion = useContext(ReducedMotionContext)
  useFrame((_, delta) => {
    if (carrier.current && !reducedMotion) carrier.current.rotation.x -= delta * outputSpeed
  })
  return (
    <group>
      <group rotation={[0, Math.PI / 2, 0]}>
        <mesh><torusGeometry args={[1.05, .14, 12, 34]} /><meshStandardMaterial color={COLORS.power} /></mesh>
      </group>
      <RotatingDisc position={[0, 0, 0]} radius={.32} depth={.22} color={COLORS.fuel} speed={inputSpeed} />
      <group ref={carrier}>
        {[[0, .62], [.54, -.31], [-.54, -.31]].map(([y, z], index) => (
          <RotatingDisc key={index} position={[0, y, z]} radius={.25} depth={.2} color="#d8c8e8" speed={-(inputSpeed - outputSpeed) * 1.2} />
        ))}
        <mesh rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[.72, .045, 8, 28]} /><meshStandardMaterial color={COLORS.cream} /></mesh>
      </group>
    </group>
  )
}

function GearboxStudy({ rpm, gear, vehicleSpeed }) {
  const ratio = gear === 0 ? 0 : STUDY_GEAR_RATIOS[gear] || 1.16
  const engineSpeed = Math.min(5.5, Math.max(0, rpm) / 850 * 2)
  const outputSpeed = THREE.MathUtils.clamp(drivelineSpeeds(vehicleSpeed).propshaft, -5.5, 5.5)
  const inputSpeed = gear === 0 ? engineSpeed * .45 : THREE.MathUtils.clamp(outputSpeed * ratio, -5.5, 5.5)
  return (
    <group>
      <ExplodedPiece from={[0, 0, 0]} to={[0, 1.6, 0]}><PaintedBox size={[4.4, .42, 2.75]} color="#bda8d1" opacity={.2} /></ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[0, -1.6, 0]}><PaintedBox size={[4.4, .42, 2.75]} color="#bda8d1" opacity={.2} /></ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[-1.75, 0, 0]}>
        <Shaft start={[-1.1, 0, 0]} end={[.6, 0, 0]} color={COLORS.power} radius={.11} />
        {[-.65, -.32, .02].map((x) => <RotatingDisc key={x} position={[x, 0, 0]} radius={.72} depth={.1} color="#efa7bb" speed={inputSpeed} />)}
      </ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[.05, 0, 0]}><PlanetarySet inputSpeed={inputSpeed} outputSpeed={outputSpeed} /></ExplodedPiece>
      <ExplodedPiece from={[0, 0, 0]} to={[1.85, 0, 0]}>
        <RotatingDisc position={[-.55, 0, 0]} radius={.78} depth={.13} color={gear === 0 ? COLORS.metal : COLORS.burn} speed={outputSpeed} />
        <Shaft start={[-.45, 0, 0]} end={[1.15, 0, 0]} color={COLORS.powerDark} radius={.12} />
      </ExplodedPiece>
      <StudyLabel position={[-2.25, 1.25, 0]} color="#a9443a"
        detail="Hydraulic pressure clamps alternating friction plates, coupling or holding selected planetary members to establish a gear ratio.">HYDRAULIC CLUTCH PACKS</StudyLabel>
      <StudyLabel position={[0, 1.35, 0]} color={COLORS.power}
        detail="Different combinations of driven, held, and output members trade rotational speed for torque through meshing planetary gears.">SUN · PLANETS · RING</StudyLabel>
      <StudyLabel position={[2.35, 1.05, 0]} color={gear === 0 ? COLORS.metal : COLORS.burn}
        detail={gear === 0
          ? 'Released clutch packs interrupt the engine-to-output torque path, although downstream parts may keep rotating while the car coasts.'
          : 'The applied clutch combination constrains planetary members, producing the displayed input-to-output speed and torque ratio.'}>
        {gear === 0 ? 'NEUTRAL · OUTPUT OPEN' : `SELECTED RATIO · ${ratio.toFixed(2)}:1`}
      </StudyLabel>
      <StudyLabel position={[2.5, -.8, 0]} color={COLORS.powerDark}
        detail="Carries the transmission’s selected speed and torque onward to the driveshaft.">OUTPUT SHAFT</StudyLabel>
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

export function ExplodedMechanismModel({ partId, rpm, throttle, gear, speed, roadForce }) {
  const reducedMotion = usePrefersReducedMotion()
  let study
  if (partId === 'metering') study = <MeteringStudy throttle={throttle} rpm={rpm} />
  else if (partId === 'engine') study = <EngineStudy rpm={rpm} />
  else if (partId === 'coupling') study = <CouplingStudy rpm={rpm} vehicleSpeed={speed} gear={gear} />
  else if (partId === 'gearbox') study = <GearboxStudy rpm={rpm} gear={gear} vehicleSpeed={speed} />
  else if (partId === 'shaft') study = <DriveshaftStudy speed={speed} />
  else if (partId === 'differential') study = <DifferentialStudy speed={speed} />
  else study = <TiresStudy speed={speed} roadForce={roadForce} />

  return <ReducedMotionContext.Provider value={reducedMotion}>{study}</ReducedMotionContext.Provider>
}

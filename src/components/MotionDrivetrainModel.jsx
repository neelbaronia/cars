import { Edges, Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { MOTION_PARTS } from '../motionParts.js'
import { FlowDots, PaintedBox } from './SceneKit.jsx'

const PART_BY_ID = Object.fromEntries(MOTION_PARTS.map((part) => [part.id, part]))
const POWER_PATH = [[0, -0.18, -1.5], [0, -0.18, -0.78], [0, -0.18, 1.58], [-1.35, -0.18, 1.73]]
const BRAKE_COLOR = '#2f8ea1'
const BRAKE_LINE_PATHS = [
  [[0.72, 0.46, -0.82], [0.68, 0.14, -0.82], [0, 0.02, -1.12], [-1.12, -0.02, -1.72], [-1.52, -0.04, -1.96]],
  [[0.72, 0.46, -0.82], [0.68, 0.14, -0.82], [0.92, 0.02, -1.2], [1.52, -0.04, -1.96]],
  [[0.72, 0.46, -0.82], [0.48, 0.12, -0.4], [0, 0.01, 0.35], [-0.72, -0.02, 1.2], [-1.55, -0.04, 1.75]],
  [[0.72, 0.46, -0.82], [0.48, 0.12, -0.4], [0, 0.01, 0.35], [0.72, -0.02, 1.2], [1.55, -0.04, 1.75]],
]
const clampUnit = (value) => Math.min(1, Math.max(0, value))

function Shaft({ start, end, color, radius = 0.065, opacity = 1 }) {
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
      <cylinderGeometry args={[radius, radius, length, 14]} />
      <meshStandardMaterial color={color} roughness={0.55} transparent opacity={opacity} depthWrite={opacity > 0.45} />
    </mesh>
  )
}

function Hotspot({ part, position, active, onHover, onSelect }) {
  return (
    <Html position={position} center sprite distanceFactor={8.5} style={{ pointerEvents: 'auto' }}>
      <button type="button" className={`drivetrain-hotspot ${active ? 'is-active' : ''}`}
        style={{ '--part-color': part.color }} data-part-id={part.id}
        aria-label={`Open exploded study of ${part.name}`} aria-controls="motion-part-study"
        onMouseEnter={() => onHover(part.id)} onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(part.id)} onBlur={() => onHover(null)}
        onClick={(event) => { event.stopPropagation(); onSelect(part.id, event.currentTarget) }}>
        <span>{part.number}</span><b>{part.short}</b>
      </button>
    </Html>
  )
}

function PartGroup({ id, activePart, hotspot, onHover, onSelect, children }) {
  const part = PART_BY_ID[id]
  const active = activePart === id
  const opacity = active ? 1 : 0.42
  const handlers = {
    onPointerOver: (event) => { event.stopPropagation(); onHover(id) },
    onPointerOut: (event) => { event.stopPropagation(); onHover(null) },
    onClick: (event) => {
      event.stopPropagation()
      if ((event.delta ?? 0) > 4) return
      onSelect(id, null)
    },
  }
  return (
    <group {...handlers}>
      {children({ active, opacity, color: part.color })}
      <Hotspot part={part} position={hotspot} active={active} onHover={onHover} onSelect={onSelect} />
    </group>
  )
}

function RotatingCrank({ rpm, opacity, active }) {
  const crank = useRef()
  useFrame((_, delta) => {
    if (crank.current) crank.current.rotation.x -= delta * Math.min(9, 1.4 + rpm / 950)
  })
  return (
    <group ref={crank} position={[0, -0.39, -1.55]} rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.1, 0.1, 1.62, 14]} />
        <meshStandardMaterial color="#76569b" transparent opacity={opacity} emissive="#76569b" emissiveIntensity={active ? .35 : 0} />
      </mesh>
      <mesh position={[0.22, 0, 0]}><sphereGeometry args={[0.13, 12, 10]} /><meshStandardMaterial color="#fff8e9" transparent opacity={opacity} /></mesh>
    </group>
  )
}

function RotatingCoupling({ rpm, opacity, active }) {
  const coupling = useRef()
  useFrame((_, delta) => {
    if (coupling.current) coupling.current.rotation.z -= delta * Math.min(9, 1.4 + rpm / 950)
  })
  return (
    <group ref={coupling} position={[0, -0.04, -0.91]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.37, 0.37, 0.18, 24]} />
        <meshStandardMaterial color="#d38d27" transparent opacity={opacity} emissive="#d38d27" emissiveIntensity={active ? .32 : 0} />
        <Edges color="#8f6323" />
      </mesh>
      <PaintedBox size={[0.62, 0.055, 0.055]} position={[0, 0, -0.1]} color="#fff0b4" opacity={opacity} />
      <PaintedBox size={[0.055, 0.62, 0.055]} position={[0, 0, -0.1]} color="#fff0b4" opacity={opacity} />
    </group>
  )
}

function GearPair({ rpm, opacity, active }) {
  const large = useRef()
  const small = useRef()
  useFrame((_, delta) => {
    const turn = delta * Math.min(8, 1.2 + rpm / 1100)
    if (large.current) large.current.rotation.x -= turn
    if (small.current) small.current.rotation.x += turn * 1.45
  })
  const material = (color) => <meshStandardMaterial color={color} transparent opacity={opacity} emissive={color} emissiveIntensity={active ? .25 : 0} />
  return (
    <group>
      <group ref={large} position={[0.49, 0.08, -0.52]} rotation={[0, 0, Math.PI / 2]}>
        <mesh><cylinderGeometry args={[0.26, 0.26, 0.08, 18]} />{material('#bda8d1')}<Edges color="#65468b" /></mesh>
        <PaintedBox size={[0.38, 0.045, 0.045]} color="#65468b" opacity={opacity} />
      </group>
      <group ref={small} position={[0.49, -0.16, -0.25]} rotation={[0, 0, Math.PI / 2]}>
        <mesh><cylinderGeometry args={[0.18, 0.18, 0.08, 16]} />{material('#d7cae3')}<Edges color="#65468b" /></mesh>
        <PaintedBox size={[0.26, 0.04, 0.04]} color="#65468b" opacity={opacity} />
      </group>
    </group>
  )
}

function RotatingShaftMarker({ rpm, opacity }) {
  const marker = useRef()
  useFrame((_, delta) => {
    if (marker.current) marker.current.rotation.z -= delta * Math.min(8, 1.2 + rpm / 1100)
  })
  return (
    <group ref={marker} position={[0, -0.18, 0.68]}>
      <mesh position={[0.105, 0, 0]}><sphereGeometry args={[0.055, 10, 8]} /><meshBasicMaterial color="#fff0b4" transparent opacity={opacity} /></mesh>
    </group>
  )
}

function DriveWheel({ x, z, speed, opacity, active, context = false }) {
  const wheel = useRef()
  useFrame((_, delta) => {
    if (wheel.current) wheel.current.rotation.x -= speed * delta / 0.34
  })
  const wheelOpacity = context ? 0.2 : opacity
  return (
    <group position={[x, -0.08, z]}>
      <group ref={wheel} rotation={[0, 0, Math.PI / 2]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.48, 0.48, 0.3, 28]} />
          <meshStandardMaterial color="#303b3d" roughness={0.9} transparent opacity={wheelOpacity}
            emissive="#28778c" emissiveIntensity={!context && active ? .25 : 0} depthWrite={wheelOpacity > .45} />
          <Edges color="#18282b" />
        </mesh>
        <mesh position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.23, 0.23, 0.035, 18]} />
          <meshStandardMaterial color="#f3dfbd" transparent opacity={wheelOpacity} />
        </mesh>
      </group>
    </group>
  )
}

function BrakeCorner({ x, z, speed, brake, opacity, active }) {
  const rotorHeat = brake * clampUnit(Math.abs(speed) / 12)
  const padGap = 0.068 - brake * 0.022

  return (
    <group>
      <mesh position={[x, -0.08, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.34, 0.34, 0.045, 28]} />
        <meshStandardMaterial color="#d6c7ad" roughness={0.38} metalness={0.58} transparent opacity={opacity}
          emissive="#e6543f" emissiveIntensity={rotorHeat * 0.9} depthWrite={opacity > 0.45} />
        <Edges color={rotorHeat > 0.5 ? '#b74436' : '#765f52'} />
      </mesh>
      <mesh position={[x, -0.08, z]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.12, 0.12, 0.062, 18]} />
        <meshStandardMaterial color="#76569b" transparent opacity={opacity} />
      </mesh>
      <PaintedBox size={[0.032, 0.19, 0.13]} position={[x - padGap, 0.02, z + 0.18]}
        color="#753f3a" opacity={opacity} emissive="#e6543f" emissiveIntensity={rotorHeat * 0.55} />
      <PaintedBox size={[0.032, 0.19, 0.13]} position={[x + padGap, 0.02, z + 0.18]}
        color="#753f3a" opacity={opacity} emissive="#e6543f" emissiveIntensity={rotorHeat * 0.55} />
      <PaintedBox size={[0.19, 0.25, 0.17]} position={[x, 0.02, z + 0.21]}
        color={BRAKE_COLOR} opacity={opacity} emissive={BRAKE_COLOR}
        emissiveIntensity={active ? 0.35 + brake * 0.45 : brake * 0.55} />
    </group>
  )
}

function HydraulicBrakes({ brake, pressure, speed, active, opacity }) {
  const application = Math.max(brake, pressure)
  const applied = pressure > 0.015
  const pedalAngle = 0.08 + brake * 0.38
  const pistonTravel = application * 0.075

  return (
    <group>
      <group position={[0.72, 0.96, -0.24]} rotation={[pedalAngle, 0, 0]}>
        <Shaft start={[0, 0, 0]} end={[0, -0.48, 0.17]} color="#315964" radius={0.045} opacity={opacity} />
        <PaintedBox size={[0.24, 0.08, 0.17]} position={[0, -0.49, 0.19]} color="#315964" opacity={opacity} />
      </group>

      <Shaft start={[0.72, 0.48, -0.43 - pistonTravel]} end={[0.72, 0.48, -0.61 - pistonTravel]}
        color="#315964" radius={0.04} opacity={opacity} />
      <Shaft start={[0.72, 0.46, -0.57]} end={[0.72, 0.46, -0.87]}
        color={BRAKE_COLOR} radius={0.11} opacity={opacity} />
      <PaintedBox size={[0.3, 0.2, 0.25]} position={[0.72, 0.68, -0.72]} color="#d9f0ef" opacity={opacity}
        emissive={BRAKE_COLOR} emissiveIntensity={active ? 0.22 : pressure * 0.2} />
      <mesh position={[0.72, 0.46, -0.83 + pistonTravel]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.075, 0.075, 0.035, 14]} />
        <meshStandardMaterial color="#fff5d9" transparent opacity={opacity} emissive={BRAKE_COLOR}
          emissiveIntensity={pressure * 0.75} />
      </mesh>

      {BRAKE_LINE_PATHS.map((points, index) => (
        <FlowDots key={index} points={points} color={BRAKE_COLOR} speed={0.55 + pressure * 1.35}
          count={5} active={applied} radius={0.03} phase={index * 0.17} />
      ))}

      <BrakeCorner x={-1.52} z={-1.96} speed={speed} brake={application} opacity={opacity} active={active} />
      <BrakeCorner x={1.52} z={-1.96} speed={speed} brake={application} opacity={opacity} active={active} />
      <BrakeCorner x={-1.55} z={1.75} speed={speed} brake={application} opacity={opacity} active={active} />
      <BrakeCorner x={1.55} z={1.75} speed={speed} brake={application} opacity={opacity} active={active} />
    </group>
  )
}

export function MotionDrivetrainModel({ activePart, onHover, onSelect, rpm, speed, throttle, gear, roadForce, brake = 0, brakePressureBar }) {
  const torqueFlowing = gear !== 0 && roadForce > 40
  const brakePressure = clampUnit(Number.isFinite(Number(brake)) ? Number(brake) : 0)
  const hydraulicPressure = Number.isFinite(Number(brakePressureBar))
    ? clampUnit(Number(brakePressureBar) / 90)
    : brakePressure

  return (
    <group>
      <PaintedBox size={[0.12, 0.12, 5.05]} position={[-1.16, -0.47, 0]} color="#566a6d" opacity={0.2} />
      <PaintedBox size={[0.12, 0.12, 5.05]} position={[1.16, -0.47, 0]} color="#566a6d" opacity={0.2} />
      <PaintedBox size={[2.45, 0.1, 0.12]} position={[0, -0.47, -1.72]} color="#566a6d" opacity={0.2} />
      <PaintedBox size={[2.45, 0.1, 0.12]} position={[0, -0.47, 1.72]} color="#566a6d" opacity={0.2} />
      <DriveWheel x={-1.52} z={-1.96} speed={speed} context />
      <DriveWheel x={1.52} z={-1.96} speed={speed} context />

      <PartGroup id="metering" activePart={activePart} hotspot={[-.9, 1.17, -1.82]} onHover={onHover} onSelect={onSelect}>
        {({ active, opacity }) => (
          <group>
            <PaintedBox size={[0.68, 0.28, 0.52]} position={[0, 0.77, -1.75]} color="#3f9a9d" opacity={opacity}
              emissive="#3f9a9d" emissiveIntensity={active ? .35 : throttle * .08} />
            <mesh position={[0, 0.54, -1.56]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.18, 0.18, 0.28, 18]} />
              <meshStandardMaterial color="#d7f1ef" transparent opacity={opacity} emissive="#3f9a9d" emissiveIntensity={active ? .3 : 0} />
              <Edges color="#28778c" />
            </mesh>
            {[-.42, -.14, .14, .42].map((x) => (
              <mesh key={x} position={[x, 0.54, -1.43]}><cylinderGeometry args={[0.055, 0.055, 0.22, 10]} />
                <meshStandardMaterial color="#f2c348" transparent opacity={opacity} /></mesh>
            ))}
          </group>
        )}
      </PartGroup>

      <PartGroup id="engine" activePart={activePart} hotspot={[1.05, .76, -1.58]} onHover={onHover} onSelect={onSelect}>
        {({ active, opacity }) => (
          <group>
            <PaintedBox size={[1.38, 0.82, 1.08]} position={[0, 0.05, -1.55]} color="#f1c75b" opacity={opacity}
              emissive="#e6543f" emissiveIntensity={active ? .32 : throttle * .08} />
            {[-.42, -.14, .14, .42].map((x, index) => (
              <mesh key={x} position={[x, 0.53, -1.55]}><cylinderGeometry args={[0.1, 0.1, 0.24, 12]} />
                <meshStandardMaterial color="#e6543f" emissive="#e6543f" emissiveIntensity={active ? .45 : throttle * (.18 + index * .03)} transparent opacity={opacity} /></mesh>
            ))}
            <RotatingCrank rpm={rpm} opacity={opacity} active={active} />
          </group>
        )}
      </PartGroup>

      <PartGroup id="coupling" activePart={activePart} hotspot={[-.86, .42, -.9]} onHover={onHover} onSelect={onSelect}>
        {({ active, opacity }) => <RotatingCoupling rpm={rpm} opacity={opacity} active={active} />}
      </PartGroup>

      <PartGroup id="gearbox" activePart={activePart} hotspot={[1.02, .4, -.42]} onHover={onHover} onSelect={onSelect}>
        {({ active, opacity }) => (
          <group>
            <PaintedBox size={[0.9, 0.62, 0.92]} position={[0, -0.05, -0.4]} color="#76569b" opacity={opacity}
              emissive="#76569b" emissiveIntensity={active ? .32 : 0} />
            <GearPair rpm={rpm} opacity={opacity} active={active} />
          </group>
        )}
      </PartGroup>

      <PartGroup id="shaft" activePart={activePart} hotspot={[.85, .18, .67]} onHover={onHover} onSelect={onSelect}>
        {({ active, opacity }) => (
          <group>
            <Shaft start={[0, -0.18, 0.04]} end={[0, -0.18, 1.42]} color={active ? '#e6543f' : '#76569b'} radius={0.09} opacity={opacity} />
            <RotatingShaftMarker rpm={rpm} opacity={opacity} />
          </group>
        )}
      </PartGroup>

      <PartGroup id="differential" activePart={activePart} hotspot={[.88, .46, 1.62]} onHover={onHover} onSelect={onSelect}>
        {({ active, opacity }) => (
          <group>
            <mesh position={[0, -0.16, 1.62]} rotation={[0, Math.PI / 2, 0]} castShadow>
              <torusGeometry args={[0.36, 0.12, 12, 26]} />
              <meshStandardMaterial color="#76569b" transparent opacity={opacity} emissive="#76569b" emissiveIntensity={active ? .35 : 0} />
            </mesh>
            <mesh position={[0, -0.16, 1.62]}><octahedronGeometry args={[0.24, 0]} /><meshStandardMaterial color="#d8c8e8" transparent opacity={opacity} /></mesh>
            <Shaft start={[-1.45, -0.16, 1.62]} end={[1.45, -0.16, 1.62]} color="#65468b" radius={0.085} opacity={opacity} />
          </group>
        )}
      </PartGroup>

      <PartGroup id="tires" activePart={activePart} hotspot={[2.02, .56, 1.76]} onHover={onHover} onSelect={onSelect}>
        {({ active, opacity }) => (
          <group>
            <DriveWheel x={-1.55} z={1.75} speed={speed} opacity={opacity} active={active} />
            <DriveWheel x={1.55} z={1.75} speed={speed} opacity={opacity} active={active} />
            <PaintedBox size={[0.52, 0.035, 0.28]} position={[-1.55, -0.565, 1.75]} color="#28778c" opacity={opacity} emissive="#28778c" emissiveIntensity={active ? .5 : 0} />
            <PaintedBox size={[0.52, 0.035, 0.28]} position={[1.55, -0.565, 1.75]} color="#28778c" opacity={opacity} emissive="#28778c" emissiveIntensity={active ? .5 : 0} />
          </group>
        )}
      </PartGroup>

      <PartGroup id="brakes" activePart={activePart} hotspot={[2.52, 1.34, -.56]} onHover={onHover} onSelect={onSelect}>
        {({ active, opacity }) => (
          <HydraulicBrakes brake={brakePressure} pressure={hydraulicPressure} speed={speed} active={active} opacity={opacity} />
        )}
      </PartGroup>

      <FlowDots points={POWER_PATH} color="#e6543f" speed={0.35 + Math.min(1.5, rpm / 3600)} count={11}
        active={torqueFlowing} radius={0.045} />
    </group>
  )
}

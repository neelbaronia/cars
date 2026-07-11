import { Edges, Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { MOTION_PARTS } from '../motionParts.js'
import { FlowDots, PaintedBox } from './SceneKit.jsx'

const PART_BY_ID = Object.fromEntries(MOTION_PARTS.map((part) => [part.id, part]))
const POWER_PATH = [[0, -0.18, -1.5], [0, -0.18, -0.78], [0, -0.18, 1.58], [-1.35, -0.18, 1.73]]

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
        style={{ '--part-color': part.color }} aria-label={`Inspect ${part.name}`}
        onMouseEnter={() => onHover(part.id)} onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(part.id)} onBlur={() => onHover(null)}
        onClick={(event) => { event.stopPropagation(); onSelect(part.id) }}>
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
    onClick: (event) => { event.stopPropagation(); onSelect(id) },
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

export function MotionDrivetrainModel({ activePart, onHover, onSelect, rpm, speed, throttle, gear, roadForce }) {
  const torqueFlowing = gear !== 0 && roadForce > 40

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

      <FlowDots points={POWER_PATH} color="#e6543f" speed={0.35 + Math.min(1.5, rpm / 3600)} count={11}
        active={torqueFlowing} radius={0.045} />
    </group>
  )
}

import { Edges, Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { FlowDots, PaintedBox, PartLabel } from './SceneKit.jsx'

const COLORS = {
  ink: '#304e54',
  body: '#ef9fb5',
  bodyDark: '#d76f83',
  glass: '#8ccbd5',
  fuel: '#f2c348',
  combustion: '#e75b45',
  power: '#76569b',
  brakes: '#2f8fa3',
  steering: '#3f9a9d',
  suspension: '#df9d34',
  metal: '#a9aaa3',
  tire: '#303b3d',
}
const FUEL_PATH = [[0, -0.22, 2], [-0.8, -0.2, 1.55], [-0.7, -0.05, -0.8], [-0.45, 0.54, -1.55]]
const BRAKE_REAR_PATH = [[-0.55, 0.42, -0.55], [-0.72, -0.16, -0.25], [-0.85, -0.18, 1.95]]
const BRAKE_FRONT_PATH = [[-0.72, -0.16, -0.25], [-0.95, -0.15, -1.9], [-1.48, -0.02, -2.05]]

function visibilityFor(focus, system) {
  return focus === 'all' || focus === 'drive' || focus === system ? 1 : 0.14
}

function Tube({ start, end, color, radius = 0.045, opacity = 1 }) {
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
    <mesh position={midpoint} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, length, 10]} />
      <meshStandardMaterial color={color} roughness={0.65} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  )
}

function Wheel({ position, steer = 0, speed = 0, brake = 0, explode = 0, focus = 'all', front = false }) {
  const tire = useRef()
  const side = Math.sign(position[0])
  const explodedPosition = [position[0] + side * explode * 1.15, position[1], position[2]]
  const wheelOpacity = Math.max(visibilityFor(focus, focus === 'brakes' ? 'brakes' : 'power'), focus === 'all' ? 1 : 0.38)
  useFrame((_, delta) => {
    if (tire.current) tire.current.rotation.x -= speed * delta / 0.34
  })
  return (
    <group position={explodedPosition} rotation={[0, front ? steer : 0, 0]}>
      <group ref={tire} rotation={[0, 0, Math.PI / 2]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.46, 0.46, 0.28, 24]} />
          <meshStandardMaterial color={COLORS.tire} roughness={0.9} transparent={wheelOpacity < 1} opacity={wheelOpacity} />
          <Edges color="#18282b" />
        </mesh>
        <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.24, 0.24, 0.03, 18]} /><meshStandardMaterial color="#f3dfbd" roughness={0.55} /></mesh>
      </group>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0, side * -0.11, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.055, 20]} />
        <meshStandardMaterial color={brake > 0.6 ? '#ff765d' : '#c9b3a0'} emissive={COLORS.combustion} emissiveIntensity={brake * 0.6}
          transparent opacity={visibilityFor(focus, 'brakes')} />
      </mesh>
      <PaintedBox size={[0.08, 0.32, 0.2]} position={[side * -0.18, 0, 0]} color={COLORS.brakes}
        opacity={visibilityFor(focus, 'brakes')} emissive={COLORS.brakes} emissiveIntensity={brake * 0.85} />
    </group>
  )
}

function CoilSpring({ position, opacity = 1, compression = 0 }) {
  const points = useMemo(() => Array.from({ length: 54 }, (_, index) => {
    const t = index / 53
    const turns = t * Math.PI * 8
    return [Math.cos(turns) * 0.11, (t - 0.5) * (0.72 - compression * 0.12), Math.sin(turns) * 0.11]
  }), [compression])
  return <group position={position}><Line points={points} color={COLORS.suspension} lineWidth={3} transparent opacity={opacity} /></group>
}

function EngineBlock({ throttle = 0, opacity = 1, explode = 0 }) {
  const crank = useRef()
  useFrame((_, delta) => {
    if (crank.current) crank.current.rotation.z -= delta * (2 + throttle * 12)
  })
  return (
    <group position={[0, 0.12 + explode * 0.34, -1.55]}>
      <PaintedBox size={[1.35, 0.82, 1.05]} color="#f1c75b" opacity={opacity} emissive={COLORS.combustion} emissiveIntensity={throttle * 0.12} />
      {[[-0.43, 0.48, 0], [-0.14, 0.48, 0], [0.14, 0.48, 0], [0.43, 0.48, 0]].map((position, index) => (
        <mesh key={index} position={position}><cylinderGeometry args={[0.1, 0.1, 0.26, 12]} /><meshStandardMaterial color={COLORS.combustion}
          emissive={COLORS.combustion} emissiveIntensity={throttle * (0.35 + (index % 2) * 0.2)} transparent opacity={opacity} /></mesh>
      ))}
      <group ref={crank} position={[0, -0.48, 0]} rotation={[0, 0, Math.PI / 2]}>
        <mesh><cylinderGeometry args={[0.1, 0.1, 1.72, 14]} /><meshStandardMaterial color={COLORS.power} transparent opacity={opacity} /></mesh>
      </group>
    </group>
  )
}

function BodyShell({ opacity = 1, explode = 0 }) {
  return (
    <group>
      <PaintedBox size={[3.15, 0.62, 3.65]} position={[0, 0.52, 0]} color={COLORS.body} opacity={opacity} />
      <PaintedBox size={[2.7, 0.72, 2.05]} position={[0, 1.12 + explode * 0.5, 0.2]} color={COLORS.body} opacity={opacity} />
      <PaintedBox size={[2.45, 0.62, 1.5]} position={[0, 1.2 + explode * 0.52, 0.1]} color={COLORS.glass} edge="#356d78" opacity={Math.min(opacity, 0.54)} />
      <PaintedBox size={[3.08, 0.14, 1.56]} position={[0, 0.91 + explode * 0.65, -1.85 - explode * 0.25]} color={COLORS.bodyDark} opacity={opacity} />
      <PaintedBox size={[3.05, 0.18, 1.25]} position={[0, 0.87 + explode * 0.55, 1.72 + explode * 0.22]} color={COLORS.bodyDark} opacity={opacity} />
      <PaintedBox size={[0.14, 0.72, 2.02]} position={[-1.62 - explode * 0.65, 0.72, 0.1]} color={COLORS.bodyDark} opacity={opacity} />
      <PaintedBox size={[0.14, 0.72, 2.02]} position={[1.62 + explode * 0.65, 0.72, 0.1]} color={COLORS.bodyDark} opacity={opacity} />
      <PaintedBox size={[3.18, 0.44, 0.38]} position={[0, 0.2, -2.62 - explode * 0.3]} color={COLORS.bodyDark} opacity={opacity} />
      <PaintedBox size={[3.18, 0.44, 0.38]} position={[0, 0.2, 2.62 + explode * 0.3]} color={COLORS.bodyDark} opacity={opacity} />
      {[[-1.05, 0.35, -2.83], [1.05, 0.35, -2.83]].map((position, index) => (
        <mesh key={index} position={position}><boxGeometry args={[0.58, 0.22, 0.08]} /><meshBasicMaterial color="#fff2b5" /></mesh>
      ))}
      {[[-1.05, 0.35, 2.83], [1.05, 0.35, 2.83]].map((position, index) => (
        <mesh key={index} position={position}><boxGeometry args={[0.58, 0.22, 0.08]} /><meshBasicMaterial color="#e55749" /></mesh>
      ))}
    </group>
  )
}

export function CarModel({
  explode = 0,
  focus = 'all',
  throttle = 0,
  brake = 0,
  parkingBrake = 0,
  steering = 0,
  speed = 0,
  bodyOpacity = 0.24,
  labels = false,
  suspensionLoad = 0,
}) {
  const powerOpacity = visibilityFor(focus, 'power')
  const fuelOpacity = visibilityFor(focus, 'fuel')
  const brakeOpacity = visibilityFor(focus, 'brakes')
  const steeringOpacity = visibilityFor(focus, 'steering')
  const suspensionOpacity = visibilityFor(focus, 'suspension')
  const steerRadians = (steering * Math.PI) / 180

  return (
    <group>
      <BodyShell opacity={bodyOpacity} explode={explode} />
      <PaintedBox size={[2.75, 0.16, 5.05]} position={[0, -0.38, 0]} color="#566a6d" opacity={focus === 'all' ? 0.8 : 0.28} />

      <group visible={fuelOpacity > 0.1}>
        <PaintedBox size={[1.65, 0.5, 1.05]} position={[0, -0.05 + explode * 0.2, 1.92 + explode * 0.3]} color={COLORS.fuel}
          opacity={fuelOpacity} emissive={COLORS.fuel} emissiveIntensity={throttle * 0.35} />
        <FlowDots points={FUEL_PATH} color={COLORS.fuel} speed={0.25 + throttle * 1.5} count={9} active={throttle > 0.02} />
      </group>

      <EngineBlock throttle={throttle} opacity={powerOpacity} explode={explode} />
      <group visible={powerOpacity > 0.1}>
        <PaintedBox size={[0.82, 0.58, 1.1]} position={[0, -0.02, -0.72]} color={COLORS.power} opacity={powerOpacity} />
        <Tube start={[0, -0.12, -0.22]} end={[0, -0.12, 1.62]} color={COLORS.power} radius={0.085} opacity={powerOpacity} />
        <mesh position={[0, -0.1, 1.72]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.37, 0.12, 12, 26]} /><meshStandardMaterial color={COLORS.power} transparent opacity={powerOpacity} />
        </mesh>
        <Tube start={[-1.35, -0.08, 1.72]} end={[1.35, -0.08, 1.72]} color={COLORS.power} radius={0.08} opacity={powerOpacity} />
      </group>

      <group visible={steeringOpacity > 0.1}>
        <Tube start={[-1.22, 0.03, -1.83]} end={[1.22, 0.03, -1.83]} color={COLORS.steering} radius={0.06} opacity={steeringOpacity} />
        <Tube start={[-0.55, 0.02, -1.83]} end={[-0.72, 0.85, -0.35]} color={COLORS.steering} radius={0.045} opacity={steeringOpacity} />
        <mesh position={[-0.72, 0.96, -0.27]} rotation={[Math.PI / 2, 0, steerRadians * 6]}>
          <torusGeometry args={[0.28, 0.035, 8, 24]} /><meshStandardMaterial color={COLORS.steering} transparent opacity={steeringOpacity} /></mesh>
      </group>

      <group visible={brakeOpacity > 0.1}>
        <PaintedBox size={[0.34, 0.25, 0.42]} position={[-0.55, 0.42, -0.55]} color={COLORS.brakes} opacity={brakeOpacity}
          emissive={COLORS.brakes} emissiveIntensity={brake * 0.75} />
        <FlowDots points={BRAKE_REAR_PATH} color={COLORS.brakes} speed={0.8 + brake} count={7} active={brake > 0.02} radius={0.04} />
        <FlowDots points={BRAKE_FRONT_PATH} color={COLORS.brakes} speed={0.8 + brake} count={7} active={brake > 0.02} radius={0.04} />
        <Line points={[[0.72, -0.18, 1.95], [0.85, -0.18, -1.95], [1.48, -0.02, -2.05]]} color={COLORS.brakes} lineWidth={2} transparent opacity={brakeOpacity * 0.7} />
      </group>

      {[[-1.34, 0.25, -2.02], [1.34, 0.25, -2.02], [-1.34, 0.25, 2.02], [1.34, 0.25, 2.02]].map((position, index) => (
        <CoilSpring key={index} position={[position[0], position[1] + explode * 0.15, position[2]]} opacity={suspensionOpacity} compression={(index < 2 ? suspensionLoad : -suspensionLoad) * 0.5} />
      ))}

      <Wheel position={[-1.55, -0.15, -2.05]} front steer={steerRadians} speed={speed} brake={brake} explode={explode} focus={focus} />
      <Wheel position={[1.55, -0.15, -2.05]} front steer={steerRadians} speed={speed} brake={brake} explode={explode} focus={focus} />
      <Wheel position={[-1.55, -0.15, 2.05]} speed={speed} brake={Math.max(brake, parkingBrake)} explode={explode} focus={focus} />
      <Wheel position={[1.55, -0.15, 2.05]} speed={speed} brake={Math.max(brake, parkingBrake)} explode={explode} focus={focus} />

      {labels && (
        <group>
          <PartLabel position={[0, 1.2 + explode * 0.4, -1.55]} color="#9e4439">ENGINE</PartLabel>
          <PartLabel position={[0, 0.62 + explode * 0.25, 2.02]} color="#9b741b">FUEL TANK</PartLabel>
          <PartLabel position={[0, 0.42, 0.55]} color="#65468b">DRIVESHAFT</PartLabel>
          <PartLabel position={[-1.05, 0.58, -2.05]} color="#257a8f">BRAKE + STEERING</PartLabel>
        </group>
      )}
    </group>
  )
}

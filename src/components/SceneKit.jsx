import { Billboard, Edges, Line, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

export function StudioLights({ dusk = false }) {
  return (
    <>
      <ambientLight intensity={dusk ? 1.1 : 1.65} color={dusk ? '#d9d2ff' : '#ffffff'} />
      <directionalLight position={[8, 12, 7]} intensity={dusk ? 1.7 : 2.2} color={dusk ? '#ffd09f' : '#ffffff'} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-8, 4, -5]} intensity={0.9} color="#f3adc1" />
    </>
  )
}

export function PaintedBox({ size, position, rotation, color, opacity = 1, transparent = opacity < 1, edge = '#75483f', emissive, emissiveIntensity = 0, children, ...props }) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow {...props}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.76} metalness={0.02} transparent={transparent} opacity={opacity}
        emissive={emissive || color} emissiveIntensity={emissiveIntensity} depthWrite={opacity > 0.45} />
      <Edges color={edge} threshold={20} />
      {children}
    </mesh>
  )
}

export function ForceArrow({ from = [0, 0, 0], direction = [0, 1, 0], length = 2, color = '#e6543f', label }) {
  const { end, quaternion, labelPosition } = useMemo(() => {
    const unit = new THREE.Vector3(...direction).normalize()
    const tip = new THREE.Vector3(...from).add(unit.clone().multiplyScalar(length))
    return {
      end: tip.toArray(),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), unit),
      labelPosition: tip.add(unit.multiplyScalar(0.22)).toArray(),
    }
  }, [from, direction, length])

  return (
    <group>
      <Line points={[from, end]} color={color} lineWidth={4} />
      <mesh position={end} quaternion={quaternion}><coneGeometry args={[0.13, 0.38, 14]} /><meshBasicMaterial color={color} /></mesh>
      {label && <Billboard position={labelPosition}><Text fontSize={0.23} color={color} outlineWidth={0.018} outlineColor="#fff9ef">{label}</Text></Billboard>}
    </group>
  )
}

export function FlowDots({ points, color = '#f2c94d', speed = 1, count = 10, active = true, radius = 0.055 }) {
  const refs = useRef([])
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point))), [points])
  useFrame(({ clock }) => {
    refs.current.forEach((dot, index) => {
      if (!dot) return
      const t = active ? (clock.elapsedTime * speed + index / count) % 1 : index / count
      dot.position.copy(curve.getPointAt(t))
      dot.visible = active
    })
  })
  return (
    <group>
      <Line points={points} color={color} lineWidth={2} transparent opacity={active ? 0.62 : 0.2} />
      {Array.from({ length: count }, (_, index) => (
        <mesh key={index} ref={(node) => { refs.current[index] = node }}>
          <sphereGeometry args={[radius, 10, 8]} /><meshBasicMaterial color={color} />
        </mesh>
      ))}
    </group>
  )
}

export function PartLabel({ position, children, color = '#315964' }) {
  return (
    <Billboard position={position}>
      <Text fontSize={0.2} color={color} outlineWidth={0.025} outlineColor="#fff8e9" anchorX="center">{children}</Text>
    </Billboard>
  )
}

export function StudioFloor({ size = 28, color = '#efd58a', y = -1.55 }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <gridHelper args={[size, 28, '#c88864', '#dfbd79']} position={[0, y + 0.006, 0]} />
    </group>
  )
}

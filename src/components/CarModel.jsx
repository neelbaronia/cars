import { Edges, Line, RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PaintedBox, PartLabel } from './SceneKit.jsx'

const COLORS = {
  ink: '#304e54',
  body: '#e98fa8',
  bodyLight: '#f4b2c2',
  bodyDark: '#b9566b',
  glass: '#77bed0',
  glassDark: '#356d78',
  fuel: '#f2c348',
  combustion: '#e6543f',
  power: '#76569b',
  powerDark: '#563a78',
  brakes: '#287f98',
  steering: '#2f9a96',
  suspension: '#df9d34',
  metal: '#a9aaa3',
  tire: '#263438',
  cream: '#fff4d1',
}

const BODY_STATIONS = [
  { z: -2.88, halfWidth: 1.14, bottom: -.34, top: .28 },
  { z: -2.58, halfWidth: 1.43, bottom: -.39, top: .51 },
  { z: -1.82, halfWidth: 1.56, bottom: -.41, top: .68 },
  { z: -.92, halfWidth: 1.6, bottom: -.42, top: .72 },
  { z: .92, halfWidth: 1.6, bottom: -.42, top: .71 },
  { z: 1.72, halfWidth: 1.55, bottom: -.4, top: .64 },
  { z: 2.5, halfWidth: 1.43, bottom: -.37, top: .53 },
  { z: 2.84, halfWidth: 1.18, bottom: -.31, top: .31 },
]

const CABIN_STATIONS = [
  { z: -1.02, halfWidth: 1.34, bottom: .68, top: .76 },
  { z: -.36, halfWidth: 1.14, bottom: .7, top: 1.48 },
  { z: .75, halfWidth: 1.13, bottom: .7, top: 1.49 },
  { z: 1.38, halfWidth: 1.33, bottom: .67, top: .77 },
]
const FRONT_AXLE_Z = -2.05
const REAR_AXLE_Z = 2.05
export const CAR_HUB_EXPLODE_OFFSET = 1.05
export const CAR_TIRE_EXPLODE_OFFSET = 1.65

function visibilityFor(focus, system) {
  if (focus === 'all' || focus === 'drive') return .58
  if (focus === 'live') return .14
  return focus === system ? 1 : 0
}

function responsiveSystemOpacity(focus, system, active) {
  if (focus === 'live') return active ? 1 : .12
  if (focus === 'all' || focus === 'drive') return active ? 1 : .5
  return focus === system ? 1 : 0
}

function buildLoftGeometry(stations) {
  const vertices = []
  const pushTriangle = (a, b, c) => vertices.push(...a, ...b, ...c)
  const pushQuad = (a, b, c, d) => {
    pushTriangle(a, b, c)
    pushTriangle(a, c, d)
  }
  const corners = (station) => ({
    lb: [-station.halfWidth, station.bottom, station.z],
    rb: [station.halfWidth, station.bottom, station.z],
    lt: [-station.halfWidth, station.top, station.z],
    rt: [station.halfWidth, station.top, station.z],
  })

  for (let index = 0; index < stations.length - 1; index += 1) {
    const a = corners(stations[index])
    const b = corners(stations[index + 1])
    pushQuad(a.lt, a.rt, b.rt, b.lt)
    pushQuad(a.rb, a.lb, b.lb, b.rb)
    pushQuad(a.lb, a.lt, b.lt, b.lb)
    pushQuad(a.rt, a.rb, b.rb, b.rt)
  }
  const front = corners(stations[0])
  const rear = corners(stations[stations.length - 1])
  pushQuad(front.lb, front.rb, front.rt, front.lt)
  pushQuad(rear.rb, rear.lb, rear.lt, rear.rt)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.computeVertexNormals()
  return geometry
}

function LoftMesh({ stations, color, opacity = 1, edge = COLORS.bodyDark, renderOrder = 0 }) {
  const geometry = useMemo(() => buildLoftGeometry(stations), [stations])
  return (
    <mesh geometry={geometry} castShadow={opacity > .55} receiveShadow={opacity > .3} renderOrder={renderOrder}>
      <meshStandardMaterial color={color} roughness={.7} metalness={.02} transparent={opacity < 1} opacity={opacity}
        depthWrite={opacity > .55} side={THREE.DoubleSide} />
      <Edges color={edge} threshold={18} transparent opacity={Math.min(1, opacity * 1.08)} />
    </mesh>
  )
}

function RoundedPiece({ size, position, rotation, color, opacity = 1, radius = .08, children }) {
  return (
    <RoundedBox args={size} radius={radius} smoothness={3} position={position} rotation={rotation}
      castShadow={opacity > .55} receiveShadow={opacity > .3}>
      <meshStandardMaterial color={color} roughness={.72} metalness={.02} transparent={opacity < 1} opacity={opacity}
        depthWrite={opacity > .55} />
      {children}
    </RoundedBox>
  )
}

function Tube({ start, end, color, radius = .045, opacity = 1, xray = false }) {
  const { midpoint, length, quaternion } = useMemo(() => {
    const a = new THREE.Vector3(...start)
    const b = new THREE.Vector3(...end)
    const direction = b.clone().sub(a)
    return {
      midpoint: a.clone().add(b).multiplyScalar(.5).toArray(),
      length: direction.length(),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
    }
  }, [start, end])
  return (
    <mesh position={midpoint} quaternion={quaternion} renderOrder={xray ? 24 : 0}>
      <cylinderGeometry args={[radius, radius, length, 12]} />
      <meshStandardMaterial color={color} roughness={.62} transparent={opacity < 1} opacity={opacity}
        emissive={color} emissiveIntensity={xray ? .3 : 0} depthTest={!xray} depthWrite={!xray && opacity > .55} />
    </mesh>
  )
}

function TracePath({ points, color, opacity = 1, active = false, speed = .8, count = 5, lineWidth = 4 }) {
  const dots = useRef([])
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point))), [points])
  useFrame(({ clock }) => {
    dots.current.forEach((dot, index) => {
      if (!dot) return
      dot.visible = active && opacity > .05
      if (dot.visible) dot.position.copy(curve.getPointAt((clock.elapsedTime * speed + index / count) % 1))
    })
  })
  if (opacity <= .02) return null
  return (
    <group>
      <Line points={points} color={COLORS.cream} lineWidth={lineWidth + 4} transparent opacity={opacity * .72}
        depthTest={false} depthWrite={false} renderOrder={30} />
      <Line points={points} color={color} lineWidth={lineWidth} transparent opacity={opacity}
        depthTest={false} depthWrite={false} renderOrder={31} />
      {[points[0], points[points.length - 1]].map((position, index) => (
        <mesh key={index} position={position} renderOrder={32}>
          <sphereGeometry args={[.075, 12, 9]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      {Array.from({ length: count }, (_, index) => (
        <mesh key={index} ref={(node) => { dots.current[index] = node }} renderOrder={33}>
          <sphereGeometry args={[.065, 12, 9]} />
          <meshBasicMaterial color={COLORS.cream} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function WheelArch({ side, z, opacity }) {
  const points = useMemo(() => Array.from({ length: 25 }, (_, index) => {
    const angle = index / 24 * Math.PI
    return [side * 1.615, -.15 + Math.sin(angle) * .61, z - Math.cos(angle) * .61]
  }), [side, z])
  return <Line points={points} color={COLORS.bodyDark} lineWidth={5} transparent opacity={opacity} />
}

function BodyShell({ opacity = 1, panelOpacity = opacity, explode = 0 }) {
  const glassOpacity = Math.min(.5, .11 + panelOpacity * .46)
  const doorOffset = explode * 1.35
  return (
    <group>
      <LoftMesh stations={BODY_STATIONS} color={COLORS.body} opacity={opacity} />

      <group position={[0, explode * 1.35, explode * .22]}>
        <LoftMesh stations={CABIN_STATIONS} color={COLORS.glass} opacity={glassOpacity} edge={COLORS.glassDark} renderOrder={1} />
        <RoundedPiece size={[2.28, .13, 1.17]} position={[0, 1.49, .2]} color={COLORS.bodyDark} opacity={panelOpacity} radius={.1} />
        {[-1, 1].map((side) => (
          <group key={side}>
            <Tube start={[side * 1.33, .71, -1]} end={[side * 1.14, 1.49, -.36]} color={COLORS.bodyDark} radius={.055} opacity={panelOpacity} />
            <Tube start={[side * 1.14, 1.49, -.36]} end={[side * 1.13, 1.49, .75]} color={COLORS.bodyDark} radius={.055} opacity={panelOpacity} />
            <Tube start={[side * 1.13, 1.49, .75]} end={[side * 1.33, .71, 1.36]} color={COLORS.bodyDark} radius={.055} opacity={panelOpacity} />
            <Tube start={[side * 1.23, .72, .18]} end={[side * 1.16, 1.48, .18]} color={COLORS.bodyDark} radius={.05} opacity={panelOpacity} />
          </group>
        ))}
      </group>

      <group position={[0, explode * 1.05, -explode * .8]} rotation={[-explode * .16, 0, 0]}>
        <RoundedPiece size={[2.82, .12, 1.52]} position={[0, .74, -1.8]} rotation={[-.035, 0, 0]}
          color={COLORS.bodyLight} opacity={panelOpacity} radius={.07} />
      </group>
      <group position={[0, explode * .9, explode * .72]} rotation={[explode * .12, 0, 0]}>
        <RoundedPiece size={[2.8, .12, 1.04]} position={[0, .68, 1.93]} rotation={[.025, 0, 0]}
          color={COLORS.bodyLight} opacity={panelOpacity} radius={.07} />
      </group>

      {[-1, 1].map((side) => (
        <group key={side}>
          <RoundedPiece size={[.08, .7, 1.55]} position={[side * (1.58 + doorOffset), .37, .18]}
            color={COLORS.bodyLight} opacity={panelOpacity} radius={.04} />
          <RoundedPiece size={[.1, .05, .3]} position={[side * (1.63 + doorOffset), .57, -.12]}
            color={COLORS.cream} opacity={panelOpacity} radius={.025} />
          <RoundedPiece size={[.23, .16, .33]} position={[side * (1.68 + doorOffset), .84 + explode * .28, -.72]}
            color={COLORS.bodyDark} opacity={panelOpacity} radius={.08} />
          <WheelArch side={side} z={-2.05} opacity={opacity} />
          <WheelArch side={side} z={2.05} opacity={opacity} />
        </group>
      ))}

      <RoundedPiece size={[2.82, .3, .28]} position={[0, .02, -2.78 - explode * .62]} color={COLORS.bodyDark} opacity={panelOpacity} radius={.1} />
      <RoundedPiece size={[2.82, .3, .28]} position={[0, .02, 2.74 + explode * .62]} color={COLORS.bodyDark} opacity={panelOpacity} radius={.1} />
      <RoundedPiece size={[1.08, .2, .06]} position={[0, .19, -2.94 - explode * .62]} color={COLORS.ink} opacity={panelOpacity} radius={.04} />
      {[-.92, .92].map((x) => (
        <RoundedPiece key={`head-${x}`} size={[.62, .23, .075]} position={[x, .38, -2.91 - explode * .62]}
          color="#fff2a8" opacity={panelOpacity} radius={.05} />
      ))}
      {[-.94, .94].map((x) => (
        <RoundedPiece key={`tail-${x}`} size={[.58, .22, .075]} position={[x, .36, 2.87 + explode * .62]}
          color="#e6543f" opacity={panelOpacity} radius={.05} />
      ))}
      <RoundedPiece size={[.58, .18, .04]} position={[0, .08, 2.9 + explode * .63]} color={COLORS.cream} opacity={panelOpacity} radius={.025} />
    </group>
  )
}

function Seat({ x, z, opacity }) {
  return (
    <group position={[x, .53, z]}>
      <RoundedPiece size={[.55, .16, .55]} position={[0, 0, 0]} color="#ead6bd" opacity={opacity} radius={.08} />
      <RoundedPiece size={[.55, .7, .16]} position={[0, .33, .22]} rotation={[-.14, 0, 0]} color="#d9bfa7" opacity={opacity} radius={.08} />
    </group>
  )
}

function GuyFieriDriver({ opacity = 1 }) {
  const materialProps = {
    roughness: .78,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity > .55,
  }
  const skin = '#d9a06f'
  const hair = '#f4e5b4'
  const beard = '#6a4936'
  const shirt = '#242b2d'
  const denim = '#46545b'
  const hairSpikes = [
    { position: [-.57, 1.43, .08], rotation: [0, 0, 0] },
    { position: [-.68, 1.405, .08], rotation: [0, 0, .5] },
    { position: [-.46, 1.405, .08], rotation: [0, 0, -.5] },
    { position: [-.57, 1.405, -.025], rotation: [-.48, 0, 0] },
    { position: [-.57, 1.405, .185], rotation: [.48, 0, 0] },
  ]

  return (
    <group>
      <RoundedPiece size={[.32, .18, .24]} position={[-.57, .67, -.08]}
        color={denim} opacity={opacity} radius={.07} />
      <RoundedPiece size={[.42, .45, .24]} position={[-.57, .96, .07]} rotation={[-.1, 0, 0]}
        color={shirt} opacity={opacity} radius={.1} />

      {[
        [-.68, .82, -.06, '#e6543f', -.18],
        [-.57, .79, -.06, '#f2c348', 0],
        [-.46, .83, -.06, '#e9872f', .18],
      ].map(([x, y, z, color, tilt]) => (
        <mesh key={`${x}-${color}`} position={[x, y, z]} rotation={[0, 0, tilt]}>
          <coneGeometry args={[.055, .18, 5]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={.08} {...materialProps} />
        </mesh>
      ))}

      <Tube start={[-.76, 1.07, .05]} end={[-.82, .93, -.04]} color={shirt} radius={.068} opacity={opacity} />
      <Tube start={[-.82, .93, -.04]} end={[-.8, 1.03, -.18]} color={skin} radius={.052} opacity={opacity} />
      <Tube start={[-.38, 1.07, .05]} end={[-.31, .93, -.04]} color={shirt} radius={.068} opacity={opacity} />
      <Tube start={[-.31, .93, -.04]} end={[-.36, 1.03, -.18]} color={skin} radius={.052} opacity={opacity} />
      {[[-.8, 1.03, -.18], [-.36, 1.03, -.18]].map((position, index) => (
        <mesh key={index} position={position} castShadow={opacity > .55}>
          <dodecahedronGeometry args={[.062, 0]} />
          <meshStandardMaterial color={skin} {...materialProps} />
        </mesh>
      ))}

      {[-.69, -.45].map((x) => (
        <group key={x}>
          <Tube start={[x, .66, -.08]} end={[x, .46, -.48]} color={denim} radius={.072} opacity={opacity} />
          <Tube start={[x, .46, -.48]} end={[x, .2, -.72]} color={denim} radius={.066} opacity={opacity} />
          <RoundedPiece size={[.16, .1, .25]} position={[x, .17, -.78]} color="#252d30" opacity={opacity} radius={.045} />
        </group>
      ))}

      <mesh position={[-.57, 1.29, .08]} castShadow={opacity > .55}>
        <dodecahedronGeometry args={[.15, 1]} />
        <meshStandardMaterial color={skin} {...materialProps} />
      </mesh>
      <mesh position={[-.57, 1.395, .095]} scale={[1, .48, 1]} castShadow={opacity > .55}>
        <sphereGeometry args={[.154, 12, 7]} />
        <meshStandardMaterial color={hair} {...materialProps} />
      </mesh>
      {hairSpikes.map((spike, index) => (
        <mesh key={index} position={spike.position} rotation={spike.rotation} castShadow={opacity > .55}>
          <coneGeometry args={[.047, .16, 5]} />
          <meshStandardMaterial color={hair} {...materialProps} />
        </mesh>
      ))}

      {[-.645, -.495].map((x) => (
        <RoundedPiece key={x} size={[.13, .075, .026]} position={[x, 1.29, -.06]}
          color="#20292c" opacity={opacity} radius={.025} />
      ))}
      <Tube start={[-.58, 1.29, -.073]} end={[-.56, 1.29, -.073]}
        color="#20292c" radius={.012} opacity={opacity} />
      <mesh position={[-.57, 1.235, -.076]} castShadow={false}>
        <dodecahedronGeometry args={[.035, 0]} />
        <meshStandardMaterial color={skin} {...materialProps} />
      </mesh>
      <RoundedPiece size={[.105, .024, .023]} position={[-.57, 1.205, -.071]}
        color={beard} opacity={opacity} radius={.012} />
      <mesh position={[-.57, 1.145, -.045]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[.055, .13, 6]} />
        <meshStandardMaterial color={beard} {...materialProps} />
      </mesh>
    </group>
  )
}

function Wheel({ position, steer = 0, speed = 0, brake = 0, explode = 0, focus = 'all', front = false }) {
  const rotating = useRef()
  const steeringPivot = useRef()
  const side = Math.sign(position[0])
  const explodedPosition = [position[0] + side * explode * CAR_HUB_EXPLODE_OFFSET, position[1], position[2]]
  const tireOffset = side * explode * (CAR_TIRE_EXPLODE_OFFSET - CAR_HUB_EXPLODE_OFFSET)
  const wheelOpacity = focus === 'all' || focus === 'drive' || focus === 'live' || focus === 'body' ? 1
    : focus === 'brakes' || focus === 'suspension' || (focus === 'steering' && front) || (focus === 'power' && !front) ? 1 : .34
  const padGap = .045 + (1 - brake) * .075
  const rotorX = side * -.1
  const rotorHeat = brake * THREE.MathUtils.clamp(Math.abs(speed) / 3, 0, 1)
  useFrame((_, delta) => {
    if (rotating.current) rotating.current.rotation.x -= speed * delta / .31
    if (front && steeringPivot.current) {
      steeringPivot.current.rotation.y = THREE.MathUtils.damp(steeringPivot.current.rotation.y, steer, 13, delta)
    }
  })
  return (
    <group ref={steeringPivot} position={explodedPosition} rotation={[0, front ? steer : 0, 0]}>
      <group ref={rotating}>
        <group position={[tireOffset, 0, 0]}>
          <mesh rotation={[0, Math.PI / 2, 0]} castShadow>
            <torusGeometry args={[.34, .12, 14, 30]} />
            <meshStandardMaterial color={COLORS.tire} roughness={.94} transparent={wheelOpacity < 1} opacity={wheelOpacity} />
            <Edges color="#152427" />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[.24, .24, .13, 22]} />
            <meshStandardMaterial color={COLORS.cream} roughness={.54} transparent={wheelOpacity < 1} opacity={wheelOpacity} />
          </mesh>
          {Array.from({ length: 5 }, (_, index) => (
            <PaintedBox key={index} size={[.15, .045, .38]} rotation={[index / 5 * Math.PI * 2, 0, 0]}
              color={COLORS.metal} opacity={wheelOpacity} />
          ))}
        </group>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[rotorX, 0, 0]}>
          <cylinderGeometry args={[.29, .29, .05, 24]} />
          <meshStandardMaterial color={rotorHeat > .6 ? '#ff765d' : '#c9b3a0'} emissive={COLORS.combustion} emissiveIntensity={rotorHeat * .65}
            transparent opacity={Math.max(.16, brake, visibilityFor(focus, 'brakes'))} />
        </mesh>
      </group>
      {[-1, 1].map((direction) => (
        <RoundedPiece key={direction} size={[.035, .28, .16]} position={[rotorX + direction * padGap, 0, 0]}
          color={COLORS.brakes} opacity={Math.max(brake, visibilityFor(focus, 'brakes'))} radius={.025} />
      ))}
      <RoundedPiece size={[.1, .32, .18]} position={[rotorX, 0, 0]} color={COLORS.brakes}
        opacity={Math.max(.1, brake, visibilityFor(focus, 'brakes'))} radius={.03} />
    </group>
  )
}

function CoilSpring({ position, opacity = 1, compression = 0 }) {
  const points = useMemo(() => Array.from({ length: 62 }, (_, index) => {
    const t = index / 61
    const turns = t * Math.PI * 9
    return [Math.cos(turns) * .105, (t - .5) * (.68 - compression * .12), Math.sin(turns) * .105]
  }), [compression])
  return (
    <group position={position}>
      <Tube start={[0, -.4, 0]} end={[0, .4, 0]} color={COLORS.metal} radius={.045} opacity={opacity} xray />
      <Line points={points} color={COLORS.suspension} lineWidth={4} transparent opacity={opacity} depthTest={false} renderOrder={25} />
    </group>
  )
}

function EngineBlock({ throttle = 0, rpm = 850, opacity = 1 }) {
  const crank = useRef()
  useFrame((_, delta) => {
    if (crank.current) crank.current.rotation.x -= delta * THREE.MathUtils.clamp(rpm / 850 * 2.2, 0, 14)
  })
  return (
    <group position={[0, .03, -1.72]}>
      <RoundedPiece size={[1.28, .72, .96]} position={[0, 0, 0]} color="#edbd4f" opacity={opacity} radius={.12} />
      <RoundedPiece size={[1.38, .22, .82]} position={[0, .45, 0]} color={COLORS.combustion} opacity={opacity} radius={.08} />
      {[-.44, -.15, .15, .44].map((x) => (
        <mesh key={x} position={[x, .6, 0]}>
          <cylinderGeometry args={[.07, .07, .18, 12]} />
          <meshStandardMaterial color={COLORS.cream} emissive={COLORS.combustion} emissiveIntensity={throttle * .55}
            transparent opacity={opacity} />
        </mesh>
      ))}
      <group ref={crank} position={[0, -.43, 0]}>
        <Tube start={[-.78, 0, 0]} end={[.78, 0, 0]} color={COLORS.power} radius={.085} opacity={opacity} xray />
        <PaintedBox size={[.13, .52, .08]} color={COLORS.cream} opacity={opacity} />
      </group>
    </group>
  )
}

function DriveShaft({ y = -.14, startZ = -.08, endZ = 1.55, speed = 0, opacity = 1 }) {
  const spinner = useRef()
  useFrame((_, delta) => {
    if (spinner.current) spinner.current.rotation.z -= delta * THREE.MathUtils.clamp(Math.abs(speed) * 2.4, 0, 12)
  })
  return (
    <group position={[0, y, 0]}>
      <Tube start={[0, 0, startZ]} end={[0, 0, endZ]} color={COLORS.powerDark} radius={.09} opacity={opacity} xray />
      <group ref={spinner}>
        {[-.02, .7, 1.42].map((z) => <PaintedBox key={z} size={[.3, .045, .045]} position={[0, 0, z]} color={COLORS.cream} opacity={opacity} />)}
      </group>
    </group>
  )
}

function SteeringWheel({ position, steerRadians, opacity, xray = false }) {
  const rotating = useRef()
  useFrame((_, delta) => {
    if (!rotating.current) return
    rotating.current.rotation.z = THREE.MathUtils.damp(
      rotating.current.rotation.z,
      steerRadians * 14.5,
      11,
      delta,
    )
  })
  const materialProps = { transparent: true, opacity, depthTest: !xray, depthWrite: false }
  return (
    <group position={position} rotation={[-.18, 0, 0]} renderOrder={28}>
      <group ref={rotating}>
        <mesh renderOrder={28}>
          <torusGeometry args={[.22, .032, 9, 26]} />
          <meshBasicMaterial color={COLORS.steering} {...materialProps} />
        </mesh>
        {[0, Math.PI * 2 / 3, Math.PI * 4 / 3].map((angle) => (
          <group key={angle} rotation={[0, 0, angle]}>
            <mesh position={[0, .095, 0]} renderOrder={28}>
              <boxGeometry args={[.032, .19, .024]} />
              <meshBasicMaterial color={COLORS.steering} {...materialProps} />
            </mesh>
          </group>
        ))}
        <mesh renderOrder={28}>
          <sphereGeometry args={[.058, 12, 9]} />
          <meshBasicMaterial color={COLORS.cream} {...materialProps} />
        </mesh>
        <mesh position={[0, .215, .01]} renderOrder={29}>
          <sphereGeometry args={[.042, 10, 8]} />
          <meshBasicMaterial color={COLORS.combustion} {...materialProps} />
        </mesh>
      </group>
    </group>
  )
}

function SystemLabels({ focus, wheelX, gear, positions }) {
  if (focus === 'all' || focus === 'drive' || focus === 'live' || focus === 'body' || focus === 'forces') return null
  if (focus === 'fuel') return <><PartLabel position={positions.fuelTank} color="#9b741b">FUEL TANK</PartLabel><PartLabel position={positions.fuelRail} color="#9b741b">FUEL RAIL + INJECTORS</PartLabel></>
  if (focus === 'power') return <><PartLabel position={positions.engine} color={COLORS.power}>ENGINE</PartLabel><PartLabel position={positions.transmission} color={COLORS.power}>{gear === 'N' ? 'NEUTRAL · PATH OPEN' : 'TRANSMISSION'}</PartLabel><PartLabel position={positions.differential} color={COLORS.power}>DIFFERENTIAL</PartLabel></>
  if (focus === 'brakes') return <><PartLabel position={positions.masterCylinder} color={COLORS.brakes}>MASTER CYLINDER</PartLabel><PartLabel position={[-wheelX, .38, -2.48]} color={COLORS.brakes}>FRONT CALIPERS</PartLabel><PartLabel position={[wheelX, .42, 2.42]} color={COLORS.brakes}>REAR CALIPERS</PartLabel></>
  if (focus === 'steering') return <><PartLabel position={positions.steeringWheel} color={COLORS.steering}>STEERING WHEEL</PartLabel><PartLabel position={positions.rack} color={COLORS.steering}>RACK + TIE RODS</PartLabel></>
  if (focus === 'suspension') return <><PartLabel position={[-wheelX, .72, -2.05]} color={COLORS.suspension}>SPRING + DAMPER</PartLabel><PartLabel position={[wheelX, .48, 2.05]} color={COLORS.suspension}>CONTROL ARM</PartLabel></>
  return null
}

export function CarModel({
  explode = 0,
  focus = 'all',
  throttle = 0,
  rpm = 850,
  gear = 1,
  brake = 0,
  parkingBrake = 0,
  steering = 0,
  speed = 0,
  bodyOpacity = .24,
  suspensionLoad = 0,
  commands = {},
}) {
  const rackVisual = useRef()
  const steerRadians = steering * Math.PI / 180
  const wheelX = 1.57 + explode * CAR_HUB_EXPLODE_OFFSET
  const drivetrainConnected = gear !== 'N'
  const gasActive = Boolean(commands.gas) || throttle > .02
  const serviceBrakeActive = Boolean(commands.brake) || brake > .02
  const parkingBrakeActive = Boolean(commands.handbrake) || parkingBrake > .02
  const brakeActive = serviceBrakeActive || parkingBrakeActive
  const steeringActive = Boolean(commands.left) || Boolean(commands.right) || Math.abs(steering) > .2
  const suspensionActive = Math.abs(suspensionLoad) > .04 || brakeActive || gasActive || steeringActive
  const powerActive = gasActive || Math.abs(speed) > .04
  const powerOpacity = responsiveSystemOpacity(focus, 'power', powerActive)
  const fuelOpacity = responsiveSystemOpacity(focus, 'fuel', gasActive)
  const brakeOpacity = responsiveSystemOpacity(focus, 'brakes', brakeActive)
  const steeringBaseOpacity = responsiveSystemOpacity(focus, 'steering', steeringActive)
  const steeringOpacity = steeringActive ? Math.max(.92, steeringBaseOpacity) : steeringBaseOpacity
  const suspensionOpacity = responsiveSystemOpacity(focus, 'suspension', suspensionActive)
  const anyDriverCommand = gasActive || brakeActive || steeringActive
  const occupantOpacity = focus === 'body' ? .98
    : focus === 'steering' ? .88
      : focus === 'live' ? (anyDriverCommand ? .7 : .42)
        : focus === 'all' || focus === 'drive' ? .48
          : focus === 'forces' ? .32 : .24
  const cockpitX = -explode * .34
  const cockpitY = explode * .86
  const cockpitZ = -explode * .08
  const engineY = explode * .55
  const engineZ = -1.72 - explode * .42
  const transmissionY = explode * .2
  const transmissionZ = -.62 - explode * .12
  const shaftY = -.14 - explode * .24
  const differentialY = -.13 + explode * .18
  const differentialZ = 1.78 + explode * .5
  const fuelTankY = -.08 + explode * .38
  const fuelTankZ = 2.18 + explode * .62
  const fuelPumpX = -.48 - explode * .28
  const fuelPumpY = fuelTankY + .03
  const fuelPumpZ = 1.5 + explode * .2
  const masterX = -.56 - explode * .42
  const masterY = .52 + explode * .42
  const steeringWheelX = -.58 + cockpitX
  const steeringWheelY = .82 + cockpitY
  const steeringWheelZ = -.18 + cockpitZ
  const rackY = -.01 - explode * .12
  const rackZ = -1.88 - explode * .4
  const rackShift = steerRadians * .46
  useFrame((_, delta) => {
    if (!rackVisual.current) return
    rackVisual.current.position.x = THREE.MathUtils.damp(rackVisual.current.position.x, rackShift, 13, delta)
  })
  const panelOpacity = THREE.MathUtils.lerp(
    bodyOpacity,
    focus === 'body' ? .52 : focus === 'all' || focus === 'drive' || focus === 'live' ? .18 : .12,
    explode,
  )

  const fuelPath = useMemo(() => [[0, fuelTankY, fuelTankZ], [fuelPumpX, fuelPumpY, fuelPumpZ], [-.58, -.05, -.65], [-.45, engineY + .55, engineZ]],
    [engineY, engineZ, fuelPumpX, fuelPumpY, fuelPumpZ, fuelTankY, fuelTankZ])
  const powerInputPath = useMemo(() => [[0, engineY - .08, engineZ], [0, transmissionY - .1, transmissionZ]], [engineY, engineZ, transmissionY, transmissionZ])
  const powerOutputPath = useMemo(() => {
    const points = [[0, transmissionY - .1, transmissionZ + .28], [0, shaftY, -.08], [0, shaftY, 1.55], [0, differentialY, differentialZ]]
    return drivetrainConnected ? points : [...points].reverse()
  }, [differentialY, differentialZ, drivetrainConnected, shaftY, transmissionY, transmissionZ])
  const powerLeftPath = useMemo(() => {
    const points = [[0, differentialY, differentialZ], [-wheelX, -.13, REAR_AXLE_Z]]
    return drivetrainConnected ? points : [...points].reverse()
  }, [differentialY, differentialZ, drivetrainConnected, wheelX])
  const powerRightPath = useMemo(() => {
    const points = [[0, differentialY, differentialZ], [wheelX, -.13, REAR_AXLE_Z]]
    return drivetrainConnected ? points : [...points].reverse()
  }, [differentialY, differentialZ, drivetrainConnected, wheelX])
  const brakePaths = useMemo(() => [
    [[masterX, masterY, -.58], [-.7, -.08, -.5], [-.9, -.12, FRONT_AXLE_Z], [-wheelX, -.08, FRONT_AXLE_Z]],
    [[masterX, masterY, -.58], [.7, -.08, -.5], [.9, -.12, FRONT_AXLE_Z], [wheelX, -.08, FRONT_AXLE_Z]],
    [[masterX, masterY, -.58], [-.7, -.1, .25], [-.92, -.12, REAR_AXLE_Z], [-wheelX, -.08, REAR_AXLE_Z]],
    [[masterX, masterY, -.58], [.7, -.1, .25], [.92, -.12, REAR_AXLE_Z], [wheelX, -.08, REAR_AXLE_Z]],
  ], [masterX, masterY, wheelX])
  const steeringPaths = useMemo(() => [
    [[steeringWheelX, steeringWheelY, steeringWheelZ], [steeringWheelX, .62 + cockpitY * .35, -.52 + cockpitZ], [rackShift, rackY, rackZ]],
    [[rackShift - 1.02, rackY, rackZ], [-wheelX, -.04, FRONT_AXLE_Z]],
    [[rackShift + 1.02, rackY, rackZ], [wheelX, -.04, FRONT_AXLE_Z]],
  ], [cockpitY, cockpitZ, rackShift, rackY, rackZ, steeringWheelX, steeringWheelY, steeringWheelZ, wheelX])

  return (
    <group>
      <BodyShell opacity={bodyOpacity} panelOpacity={panelOpacity} explode={explode} />

      <group position={[cockpitX, cockpitY, cockpitZ]}>
        <Seat x={-.57} z={-.18} opacity={Math.min(.82, .28 + bodyOpacity)} />
        <GuyFieriDriver opacity={occupantOpacity} />
      </group>
      <group position={[explode * .34, explode * .86, -explode * .08]}>
        <Seat x={.57} z={-.18} opacity={Math.min(.82, .28 + bodyOpacity)} />
      </group>
      <group position={[0, explode * .62, explode * .34]}>
        <Seat x={0} z={.72} opacity={Math.min(.72, .22 + bodyOpacity)} />
      </group>

      <group>
        <RoundedPiece size={[.24, .2, 4.75]} position={[-.92, -.39, 0]} color="#53686c" opacity={.9} radius={.07} />
        <RoundedPiece size={[.24, .2, 4.75]} position={[.92, -.39, 0]} color="#53686c" opacity={.9} radius={.07} />
        {[-1.5, 0, 1.5].map((z) => <RoundedPiece key={z} size={[2.05, .16, .16]} position={[0, -.38, z]} color="#53686c" opacity={.86} radius={.05} />)}
      </group>

      <group visible={fuelOpacity > .02}>
        <RoundedPiece size={[1.5, .46, .92]} position={[0, fuelTankY, fuelTankZ]} color={COLORS.fuel} opacity={fuelOpacity} radius={.15} />
        <mesh position={[fuelPumpX, fuelPumpY, fuelPumpZ]} renderOrder={34}><sphereGeometry args={[.13, 14, 10]} />
          <meshBasicMaterial color={COLORS.fuel} depthTest={false} toneMapped={false} /></mesh>
        <TracePath points={fuelPath} color={COLORS.fuel} opacity={fuelOpacity}
          active={rpm >= 200 && (focus !== 'live' || gasActive)} speed={.18 + throttle * 1.65} />
      </group>

      <group visible={powerOpacity > .02}>
        <group position={[0, engineY, engineZ + 1.72]}><EngineBlock throttle={throttle} rpm={rpm} opacity={powerOpacity} /></group>
        <RoundedPiece size={[.82, .56, 1.05]} position={[0, transmissionY, transmissionZ]} color={COLORS.power} opacity={powerOpacity} radius={.14} />
        <DriveShaft y={shaftY} speed={drivetrainConnected ? speed : 0} opacity={powerOpacity} />
        <mesh position={[0, differentialY, differentialZ]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[.36, .12, 12, 28]} /><meshStandardMaterial color={COLORS.power} transparent opacity={powerOpacity} />
        </mesh>
        <TracePath points={powerInputPath} color={COLORS.power} opacity={powerOpacity}
          active={rpm >= 200 && (focus !== 'live' || powerActive)} speed={.7 + throttle * 1.1} count={3} />
        <TracePath points={powerOutputPath} color={COLORS.power} opacity={powerOpacity}
          active={Math.abs(speed) > .04 || (drivetrainConnected && gasActive)} speed={1.15 + throttle * .65} />
        <TracePath points={powerLeftPath} color={COLORS.power} opacity={powerOpacity}
          active={Math.abs(speed) > .04 || (drivetrainConnected && gasActive)} speed={1.1 + throttle * .6} count={3} />
        <TracePath points={powerRightPath} color={COLORS.power} opacity={powerOpacity}
          active={Math.abs(speed) > .04 || (drivetrainConnected && gasActive)} speed={1.1 + throttle * .6} count={3} />
      </group>

      <group visible={brakeOpacity > .02}>
        <RoundedPiece size={[.36, .27, .45]} position={[masterX, masterY, -.58]} color={COLORS.brakes} opacity={brakeOpacity} radius={.07} />
        {brakePaths.map((points, index) => <TracePath key={index} points={points} color={COLORS.brakes} opacity={brakeOpacity}
          active={serviceBrakeActive} speed={.75 + brake} count={4} lineWidth={4} />)}
      </group>

      <SteeringWheel position={[steeringWheelX, steeringWheelY, steeringWheelZ]}
        steerRadians={steerRadians}
        opacity={focus === 'body' ? .9 : Math.max(.2, steeringOpacity)}
        xray={focus !== 'body' && steeringOpacity > .5} />
      <group visible={steeringOpacity > .02}>
        <group ref={rackVisual} position={[rackShift, 0, 0]}>
          <RoundedPiece size={[2.35, .16, .18]} position={[0, rackY, rackZ]}
            color={COLORS.steering} opacity={steeringOpacity} radius={.06} />
        </group>
        <Tube start={[rackShift - 1.02, rackY, rackZ]} end={[-wheelX, -.04, FRONT_AXLE_Z]}
          color={COLORS.steering} radius={.045} opacity={steeringOpacity} xray />
        <Tube start={[rackShift + 1.02, rackY, rackZ]} end={[wheelX, -.04, FRONT_AXLE_Z]}
          color={COLORS.steering} radius={.045} opacity={steeringOpacity} xray />
        {steeringPaths.map((points, index) => <TracePath key={index} points={points} color={COLORS.steering} opacity={steeringOpacity}
          active={steeringActive} speed={.65} count={index === 0 ? 3 : 2} />)}
      </group>

      {[[-wheelX, FRONT_AXLE_Z], [wheelX, FRONT_AXLE_Z], [-wheelX, REAR_AXLE_Z], [wheelX, REAR_AXLE_Z]].map(([x, z], index) => (
        <group key={`${x}-${z}`}>
          <CoilSpring position={[x * .84, .22 + explode * .28, z]} opacity={suspensionOpacity} compression={(index < 2 ? suspensionLoad : -suspensionLoad) * .5} />
          {suspensionOpacity > .02 && <TracePath points={[[x, -.12, z], [x * .86, .18, z], [x * .72, .58, z]]}
            color={COLORS.suspension} opacity={suspensionOpacity} active={suspensionActive} speed={.5} count={2} lineWidth={3} />}
        </group>
      ))}

      <Wheel position={[-1.57, -.15, FRONT_AXLE_Z]} front steer={steerRadians} speed={speed} brake={brake} explode={explode} focus={focus} />
      <Wheel position={[1.57, -.15, FRONT_AXLE_Z]} front steer={steerRadians} speed={speed} brake={brake} explode={explode} focus={focus} />
      <Wheel position={[-1.57, -.15, REAR_AXLE_Z]} speed={speed} brake={Math.max(brake, parkingBrake)} explode={explode} focus={focus} />
      <Wheel position={[1.57, -.15, REAR_AXLE_Z]} speed={speed} brake={Math.max(brake, parkingBrake)} explode={explode} focus={focus} />

      <SystemLabels focus={focus} wheelX={wheelX} gear={gear} positions={{
        fuelTank: [0, fuelTankY + .65, fuelTankZ], fuelRail: [-.42, engineY + .9, engineZ],
        engine: [0, engineY + 1.02, engineZ], transmission: [0, transmissionY + .58, transmissionZ],
        differential: [0, differentialY + .68, differentialZ], masterCylinder: [masterX, masterY + .76, -.58],
        steeringWheel: [steeringWheelX, steeringWheelY + .4, steeringWheelZ], rack: [rackShift, rackY + .56, rackZ],
      }} />
    </group>
  )
}

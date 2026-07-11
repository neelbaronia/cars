import { Edges } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

export const FLAVORTOWN_SIZE = 360

const BLOCK_SIZE = 36
const ROAD_WIDTH = 12
const CITY_FLOOR_Y = -1.5
const POOL_RADIUS = 3
const OUTLINE = '#81514b'
const SIGN_TEXTURES = new Map()

const BUILDINGS = [
  { name: 'SAUCE BOSS HQ', kind: 'cake', colors: ['#ef8fa8', '#fff0b4', '#e6543f', '#7a5067'] },
  { name: 'DOGE BANK', kind: 'bank', colors: ['#f3c85d', '#fff2ce', '#c88645', '#6a526f'] },
  { name: 'STONKS EXCHANGE', kind: 'stonks', colors: ['#83c9c5', '#f7d98e', '#e6543f', '#52627f'] },
  { name: 'SUS DINER', kind: 'diner', colors: ['#ee9fb2', '#fff1c1', '#cf5a55', '#5c7180'] },
  { name: 'SIDE QUEST ARCADE', kind: 'arcade', colors: ['#9271b5', '#8fd4cf', '#f2c348', '#e35b67'] },
  { name: '404 HOTEL', kind: 'motel', colors: ['#f0a7b8', '#f8d7a2', '#6bb5bd', '#785c78'] },
  { name: 'VIBE CHECK CLINIC', kind: 'clinic', colors: ['#a8d7cf', '#fff0c4', '#e887a2', '#587083'] },
  { name: 'YEET & EAT', kind: 'diner', colors: ['#ed765f', '#ffd581', '#efacc0', '#6d5a70'] },
  { name: 'NO CAP RECORDS', kind: 'tower', colors: ['#7bbfc3', '#f3abc0', '#f8d06f', '#65567c'] },
  { name: 'I CAN HAZ CHEEZ', kind: 'donut', colors: ['#f3bc55', '#fff0ba', '#df718c', '#6c596e'] },
  { name: 'NPC PLAZA', kind: 'tower', colors: ['#ad91c6', '#f4c8a7', '#7dc3bf', '#5e5877'] },
  { name: 'OHIO WELCOME CTR', kind: 'cake', colors: ['#ed9aaa', '#f5d677', '#83c4bd', '#76536a'] },
  { name: 'TOUCH GRASS CLUB', kind: 'arcade', colors: ['#8bc89e', '#fff0b4', '#ef8e98', '#526d6a'] },
  { name: 'MOTH LAMP CO.', kind: 'motel', colors: ['#f5d66f', '#edb5c2', '#82bbc4', '#756176'] },
]

const FLAVOR_TOWER = {
  name: 'WELCOME TO FLAVORTOWN', kind: 'flavor',
  colors: ['#ef7182', '#ffd15f', '#86c7c0', '#684d71'],
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor
}

function tileHash(x, z) {
  let value = Math.imul(x + 101, 374761393) ^ Math.imul(z - 47, 668265263)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  return (value ^ (value >>> 16)) >>> 0
}

function CityBox({ size, position, rotation, color, opacity = 1, edge = OUTLINE, emissiveIntensity = 0 }) {
  return (
    <mesh position={position} rotation={rotation} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={.82} transparent={opacity < 1} opacity={opacity}
        emissive={color} emissiveIntensity={emissiveIntensity} />
      <Edges color={edge} threshold={18} />
    </mesh>
  )
}

function CityCylinder({ radius = 1, height = 1, position, rotation, color, opacity = 1, segments = 16 }) {
  return (
    <mesh position={position} rotation={rotation} receiveShadow>
      <cylinderGeometry args={[radius, radius, height, segments]} />
      <meshStandardMaterial color={color} roughness={.8} transparent={opacity < 1} opacity={opacity} />
      <Edges color={OUTLINE} threshold={16} />
    </mesh>
  )
}

function CitySphere({ radius = 1, position, color }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[radius, 14, 9]} />
      <meshStandardMaterial color={color} roughness={.86} flatShading />
    </mesh>
  )
}

function createSignTexture(text, accent) {
  const cacheKey = `${text}-${accent}`
  if (SIGN_TEXTURES.has(cacheKey)) return SIGN_TEXTURES.get(cacheKey)
  if (typeof document === 'undefined') return null

  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const context = canvas.getContext('2d')
  context.fillStyle = '#fff4d8'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = accent
  context.fillRect(0, 0, canvas.width, 24)
  context.fillRect(0, canvas.height - 24, canvas.width, 24)
  context.strokeStyle = OUTLINE
  context.lineWidth = 14
  context.strokeRect(7, 7, canvas.width - 14, canvas.height - 14)

  const label = text.toUpperCase()
  let fontSize = 98
  do {
    context.font = `800 ${fontSize}px "DM Mono", ui-monospace, monospace`
    if (context.measureText(label).width <= 900) break
    fontSize -= 5
  } while (fontSize > 42)
  context.fillStyle = '#314f55'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(label, canvas.width / 2, canvas.height / 2 + 4)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  SIGN_TEXTURES.set(cacheKey, texture)
  return texture
}

function CitySign({ text, position, rotation = [0, 0, 0], width = 8, height = 1.4, accent = '#e6543f' }) {
  const texture = useMemo(() => createSignTexture(text, accent), [accent, text])
  const reversePosition = [position[0], position[1], -position[2]]
  const reverseRotation = [rotation[0], rotation[1] + Math.PI, rotation[2]]
  return (
    <group>
      {[{ position, rotation }, { position: reversePosition, rotation: reverseRotation }].map((face, index) => (
        <mesh key={index} position={face.position} rotation={face.rotation}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial map={texture} color={texture ? '#ffffff' : accent} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function PaintedShadow({ width = 12, depth = 10 }) {
  return <CityBox size={[width, .08, depth]} position={[.62, .04, .72]} color="#a86f72" opacity={.28} edge="#a86f72" />
}

function BurgerMarker({ y, colors }) {
  return (
    <group position={[0, y, 0]}>
      <CityCylinder radius={1.45} height={.5} position={[0, .78, 0]} color={colors[1]} />
      <CityCylinder radius={1.52} height={.28} position={[0, .46, 0]} color="#6c493c" />
      <CityBox size={[2.7, .18, 2.7]} position={[0, .22, 0]} rotation={[0, .18, 0]} color={colors[2]} />
      <CityCylinder radius={1.48} height={.42} position={[0, 0, 0]} color={colors[1]} />
    </group>
  )
}

function CakeBuilding({ definition, heightScale }) {
  const [wall, icing, accent, dark] = definition.colors
  return (
    <group>
      <PaintedShadow width={12} depth={10.5} />
      <CityBox size={[11.6, 2.45 * heightScale, 10]} position={[0, 1.225 * heightScale, 0]} color={wall} />
      <CityBox size={[12, .28, 10.35]} position={[0, 2.45 * heightScale, 0]} color={icing} />
      <CityBox size={[8.7, 2.1 * heightScale, 7.4]} position={[0, (3.5 * heightScale), -.25]} color={accent} />
      <CityBox size={[9.05, .25, 7.75]} position={[0, 4.55 * heightScale, -.25]} color={icing} />
      <CityBox size={[5.7, 1.75 * heightScale, 4.6]} position={[0, 5.42 * heightScale, -.45]} color={wall} />
      <CityBox size={[6.05, .24, 4.95]} position={[0, 6.3 * heightScale, -.45]} color={icing} />
      <CitySphere radius={.62} position={[0, 7.05 * heightScale, -.45]} color={dark} />
      <CitySign text={definition.name} position={[0, 1.45 * heightScale, 5.04]} width={9.2} height={1.25} accent={accent} />
    </group>
  )
}

function DinerBuilding({ definition, heightScale }) {
  const [wall, cream, accent, dark] = definition.colors
  return (
    <group>
      <PaintedShadow width={12.5} depth={9.8} />
      <CityBox size={[12, 3.25 * heightScale, 9]} position={[0, 1.625 * heightScale, 0]} color={wall} />
      <CityBox size={[12.55, .32, 9.55]} position={[0, 3.3 * heightScale, 0]} color={cream} />
      <CityBox size={[10.4, .78, .12]} position={[0, 1.95 * heightScale, 4.54]} color="#8ed0d1" opacity={.82} edge={dark} />
      {[-4.2, -2.1, 0, 2.1, 4.2].map((x, index) => (
        <CityBox key={x} size={[1.9, .36, .5]} position={[x, 2.92 * heightScale, 4.7]}
          rotation={[-.28, 0, 0]} color={index % 2 ? cream : accent} />
      ))}
      <CitySign text={definition.name} position={[0, 2.65 * heightScale, 4.84]} width={8.8} height={1.18} accent={accent} />
      <BurgerMarker y={3.45 * heightScale} colors={[wall, cream, accent, dark]} />
    </group>
  )
}

function DonutBuilding({ definition, heightScale }) {
  const [wall, cream, accent, dark] = definition.colors
  return (
    <group>
      <PaintedShadow width={10} depth={9.5} />
      <CityBox size={[9.2, 5.1 * heightScale, 8.5]} position={[0, 2.55 * heightScale, 0]} color={wall} />
      {[1.1, 2.35, 3.6].map((y) => <CityBox key={y} size={[7.6, .5, .14]} position={[0, y * heightScale, 4.3]} color={cream} edge={dark} />)}
      <CitySign text={definition.name} position={[0, 4.62 * heightScale, 4.34]} width={7.5} height={1.15} accent={accent} />
      <mesh position={[0, 6.45 * heightScale, 0]}>
        <torusGeometry args={[1.62, .55, 12, 28]} />
        <meshStandardMaterial color={accent} roughness={.8} />
        <Edges color={dark} threshold={12} />
      </mesh>
      {[-.72, -.2, .35, .82].map((x, index) => <CityBox key={x} size={[.11, .48, .11]}
        position={[x, 6.8 * heightScale + (index % 2) * .2, 1.48]} rotation={[0, 0, index % 2 ? .55 : -.45]} color={cream} />)}
    </group>
  )
}

function StonksBuilding({ definition, heightScale }) {
  const [wall, cream, accent, dark] = definition.colors
  return (
    <group>
      <PaintedShadow width={11.5} depth={10.5} />
      <CityBox size={[10.5, 3.2 * heightScale, 9.4]} position={[0, 1.6 * heightScale, 0]} color={wall} />
      <CityBox size={[8.2, 3 * heightScale, 7.3]} position={[.7, 4.65 * heightScale, -.4]} color={cream} />
      <CityBox size={[5.8, 2.6 * heightScale, 5.3]} position={[1.35, 7.45 * heightScale, -.8]} color={wall} />
      <CitySign text={definition.name} position={[0, 2.05 * heightScale, 4.74]} width={8.7} height={1.2} accent={accent} />
      <group position={[0, 8.25 * heightScale, 0]} rotation={[0, 0, -.62]}>
        <CityBox size={[.42, 4.2, .42]} position={[0, 0, 0]} color={accent} edge={dark} />
        <mesh position={[0, 2.45, 0]}><coneGeometry args={[.72, 1.35, 4]} /><meshStandardMaterial color={accent} /></mesh>
      </group>
    </group>
  )
}

function BankBuilding({ definition, heightScale }) {
  const [wall, cream, accent, dark] = definition.colors
  return (
    <group>
      <PaintedShadow width={12} depth={10} />
      <CityBox size={[11.4, 3.8 * heightScale, 9.2]} position={[0, 1.9 * heightScale, 0]} color={wall} />
      <CityBox size={[12, .4, 9.8]} position={[0, 3.92 * heightScale, 0]} color={cream} />
      {[-3.9, -1.3, 1.3, 3.9].map((x) => <CityCylinder key={x} radius={.34} height={3.5 * heightScale}
        position={[x, 1.78 * heightScale, 4.42]} color={cream} />)}
      <CitySign text={definition.name} position={[0, 3.18 * heightScale, 4.72]} width={8.5} height={1.15} accent={accent} />
      <CityCylinder radius={1.2} height={.34} position={[0, 5.15 * heightScale, 0]} rotation={[Math.PI / 2, 0, 0]} color={accent} />
      <CityBox size={[.14, 1.4, .14]} position={[0, 5.15 * heightScale, .19]} color={dark} />
    </group>
  )
}

function ArcadeBuilding({ definition, heightScale }) {
  const [wall, cream, accent, dark] = definition.colors
  return (
    <group>
      <PaintedShadow width={11.8} depth={10.4} />
      <CityBox size={[11.2, 4.4 * heightScale, 9.7]} position={[0, 2.2 * heightScale, 0]} color={wall} />
      <CityBox size={[11.8, .42, 10.2]} position={[0, 4.48 * heightScale, 0]} color={dark} />
      {[-4, -2.4, -.8, .8, 2.4, 4].map((x, index) => <CityBox key={x} size={[1.05, 1.5, .16]}
        position={[x, 1.55 * heightScale, 4.92]} color={index % 3 === 0 ? cream : index % 2 ? accent : '#80cbd0'} emissiveIntensity={.12} />)}
      <CitySign text={definition.name} position={[0, 3.55 * heightScale, 4.96]} width={9.3} height={1.35} accent={accent} />
      <CitySphere radius={.55} position={[-1, 5.4 * heightScale, 0]} color={accent} />
      <CityCylinder radius={.12} height={1.2} position={[-1, 4.95 * heightScale, 0]} color={cream} />
      <CityBox size={[1.7, .28, 1.7]} position={[1, 4.86 * heightScale, 0]} color={cream} />
    </group>
  )
}

function ClinicBuilding({ definition, heightScale }) {
  const [wall, cream, accent, dark] = definition.colors
  return (
    <group>
      <PaintedShadow width={11.5} depth={9.8} />
      <CityBox size={[11, 4.5 * heightScale, 9]} position={[0, 2.25 * heightScale, 0]} color={wall} />
      <CityBox size={[11.5, .35, 9.5]} position={[0, 4.58 * heightScale, 0]} color={cream} />
      <CitySign text={definition.name} position={[0, 3.45 * heightScale, 4.55]} width={8.9} height={1.25} accent={accent} />
      {[-3.4, 0, 3.4].map((x) => <CityBox key={x} size={[2.2, 1.25, .14]} position={[x, 1.45 * heightScale, 4.58]} color="#9fd7d3" edge={dark} />)}
      <group position={[0, 5.65 * heightScale, 0]} rotation={[0, 0, Math.PI / 2]}>
        <CityCylinder radius={.48} height={2.3} position={[0, 0, 0]} color={accent} />
        <CitySphere radius={.48} position={[0, 1.15, 0]} color={cream} />
        <CitySphere radius={.48} position={[0, -1.15, 0]} color={accent} />
      </group>
    </group>
  )
}

function MotelBuilding({ definition, heightScale }) {
  const [wall, cream, accent, dark] = definition.colors
  return (
    <group>
      <PaintedShadow width={12.5} depth={9.5} />
      <CityBox size={[12, 5.7 * heightScale, 8.8]} position={[0, 2.85 * heightScale, 0]} color={wall} />
      {[1.8, 3.55, 5.3].map((y) => <CityBox key={y} size={[12.35, .22, 1.05]} position={[0, y * heightScale, 4.54]} color={cream} />)}
      {[-4.2, -1.4, 1.4, 4.2].flatMap((x) => [1.05, 2.8, 4.55].map((y) => (
        <CityBox key={`${x}-${y}`} size={[1.45, .95, .14]} position={[x, y * heightScale, 4.48]} color="#9bcfd0" edge={dark} />
      )))}
      <CitySign text={definition.name} position={[0, 5.75 * heightScale, 4.46]} width={8.4} height={1.15} accent={accent} />
    </group>
  )
}

function TowerBuilding({ definition, heightScale }) {
  const [wall, cream, accent, dark] = definition.colors
  return (
    <group>
      <PaintedShadow width={10.5} depth={9.8} />
      <CityBox size={[9.8, 7.8 * heightScale, 9]} position={[0, 3.9 * heightScale, 0]} color={wall} />
      {[1.3, 2.7, 4.1, 5.5, 6.9].map((y) => <CityBox key={y} size={[8.35, .44, .14]}
        position={[0, y * heightScale, 4.54]} color={y % 2 > 1 ? accent : cream} edge={dark} />)}
      <CitySign text={definition.name} position={[0, 7.12 * heightScale, 4.58]} width={7.9} height={1.15} accent={accent} />
      <CityCylinder radius={1.05} height={1.7} position={[0, 8.7 * heightScale, 0]} color={accent} />
      <CitySphere radius={.42} position={[0, 9.72 * heightScale, 0]} color={cream} />
    </group>
  )
}

function FlavorTower({ definition }) {
  const [wall, cream, accent, dark] = definition.colors
  return (
    <group>
      <PaintedShadow width={12} depth={11} />
      <CityBox size={[10.8, 5.2, 9.6]} position={[0, 2.6, 0]} color={wall} />
      <CityBox size={[9, 3.2, 7.7]} position={[0, 6.75, -.2]} color={cream} />
      <CityBox size={[7.1, 2.5, 5.8]} position={[0, 9.55, -.4]} color={accent} />
      <CitySign text={definition.name} position={[0, 3.55, 4.88]} width={9.7} height={1.32} accent={dark} />
      <CityCylinder radius={1.72} height={1.35} position={[0, 11.55, -.4]} color={cream} />
      <mesh position={[0, 13.12, -.4]}><coneGeometry args={[1.05, 2.3, 7]} /><meshStandardMaterial color={accent} /></mesh>
      <mesh position={[.28, 13.55, -.25]}><coneGeometry args={[.54, 1.55, 7]} /><meshStandardMaterial color={cream} /></mesh>
    </group>
  )
}

function MemeBuilding({ definition, seed }) {
  const heightScale = .86 + ((seed >>> 5) % 6) * .045
  if (definition.kind === 'cake') return <CakeBuilding definition={definition} heightScale={heightScale} />
  if (definition.kind === 'diner') return <DinerBuilding definition={definition} heightScale={heightScale} />
  if (definition.kind === 'donut') return <DonutBuilding definition={definition} heightScale={heightScale} />
  if (definition.kind === 'stonks') return <StonksBuilding definition={definition} heightScale={heightScale} />
  if (definition.kind === 'bank') return <BankBuilding definition={definition} heightScale={heightScale} />
  if (definition.kind === 'arcade') return <ArcadeBuilding definition={definition} heightScale={heightScale} />
  if (definition.kind === 'clinic') return <ClinicBuilding definition={definition} heightScale={heightScale} />
  if (definition.kind === 'motel') return <MotelBuilding definition={definition} heightScale={heightScale} />
  if (definition.kind === 'flavor') return <FlavorTower definition={definition} />
  return <TowerBuilding definition={definition} heightScale={heightScale} />
}

function CandyTree({ position, seed }) {
  const foliage = ['#e98fa8', '#f0c654', '#8ac9a4', '#9b83bd'][seed % 4]
  return (
    <group position={position}>
      <CityCylinder radius={.16} height={2.1} position={[0, 1.05, 0]} color="#965d45" segments={8} />
      <CitySphere radius={.92} position={[0, 2.35, 0]} color={foliage} />
      <CitySphere radius={.55} position={[.55, 2.1, .12]} color={seed % 2 ? '#f2c45f' : '#eaa2b3'} />
    </group>
  )
}

function CityBlock({ tileX, tileZ }) {
  const worldX = (tileX + .5) * BLOCK_SIZE
  const worldZ = (tileZ + .5) * BLOCK_SIZE
  const patternX = positiveModulo(tileX, 10)
  const patternZ = positiveModulo(tileZ, 10)
  const seed = tileHash(patternX, patternZ)
  const landmark = patternX === 0 && patternZ === 9
  const definition = landmark ? FLAVOR_TOWER : BUILDINGS[seed % BUILDINGS.length]
  const offsetX = ((seed >>> 9) % 5 - 2) * .62
  const offsetZ = ((seed >>> 13) % 5 - 2) * .62
  const rotation = landmark ? -Math.PI / 2 : (seed & 1) ? 0 : Math.PI / 2
  const treeX = seed & 2 ? 7.65 : -7.65
  const treeZ = seed & 4 ? 7.65 : -7.65

  return (
    <group position={[worldX, CITY_FLOOR_Y + .12, worldZ]}>
      <CityBox size={[BLOCK_SIZE - ROAD_WIDTH, .18, BLOCK_SIZE - ROAD_WIDTH]} position={[0, -.03, 0]}
        color="#f3d8b1" edge="#c98f72" />
      <group position={[offsetX, .08, offsetZ]} rotation={[0, rotation, 0]}>
        <MemeBuilding definition={definition} seed={seed} />
      </group>
      {!landmark && <CandyTree position={[treeX, .06, treeZ]} seed={seed} />}
    </group>
  )
}

function RoadDashes({ centerTileX, centerTileZ }) {
  const vertical = useRef()
  const horizontal = useRef()
  const positions = useMemo(() => {
    const verticalMarks = []
    const horizontalMarks = []
    const tileOffsets = Array.from({ length: POOL_RADIUS * 2 + 1 }, (_, index) => index - POOL_RADIUS)
    const roadOffsets = Array.from({ length: POOL_RADIUS * 2 + 2 }, (_, index) => index - POOL_RADIUS)
    roadOffsets.forEach((offset) => {
      const streetX = (centerTileX + offset) * BLOCK_SIZE
      const streetZ = (centerTileZ + offset) * BLOCK_SIZE
      tileOffsets.forEach((alongOffset) => {
        const centerZ = (centerTileZ + alongOffset + .5) * BLOCK_SIZE
        const centerX = (centerTileX + alongOffset + .5) * BLOCK_SIZE
        ;[-7, 0, 7].forEach((dashOffset) => {
          verticalMarks.push([streetX, centerZ + dashOffset])
          horizontalMarks.push([centerX + dashOffset, streetZ])
        })
      })
    })
    return { verticalMarks, horizontalMarks }
  }, [centerTileX, centerTileZ])

  useEffect(() => {
    const matrix = new THREE.Matrix4()
    positions.verticalMarks.forEach(([street, along], index) => {
      matrix.makeTranslation(street, CITY_FLOOR_Y + .045, along)
      vertical.current?.setMatrixAt(index, matrix)
    })
    positions.horizontalMarks.forEach(([along, street], index) => {
      matrix.makeTranslation(along, CITY_FLOOR_Y + .046, street)
      horizontal.current?.setMatrixAt(index, matrix)
    })
    ;[vertical.current, horizontal.current].forEach((mesh) => {
      if (!mesh) return
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    })
  }, [positions])

  return (
    <>
      <instancedMesh ref={vertical} args={[null, null, positions.verticalMarks.length]} receiveShadow>
        <boxGeometry args={[.16, .025, 3.15]} /><meshBasicMaterial color="#f8e6a9" />
      </instancedMesh>
      <instancedMesh ref={horizontal} args={[null, null, positions.horizontalMarks.length]} receiveShadow>
        <boxGeometry args={[3.15, .025, .16]} /><meshBasicMaterial color="#f8e6a9" />
      </instancedMesh>
    </>
  )
}

export function FlavortownCity({ centerX = 0, centerZ = 0 }) {
  const centerTileX = Math.floor(centerX / BLOCK_SIZE)
  const centerTileZ = Math.floor(centerZ / BLOCK_SIZE)
  const blocks = useMemo(() => {
    const offsets = Array.from({ length: POOL_RADIUS * 2 + 1 }, (_, index) => index - POOL_RADIUS)
    return offsets.flatMap((offsetX) => offsets.map((offsetZ) => [centerTileX + offsetX, centerTileZ + offsetZ]))
  }, [centerTileX, centerTileZ])
  const floorX = centerTileX * BLOCK_SIZE
  const floorZ = centerTileZ * BLOCK_SIZE

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[floorX, CITY_FLOOR_Y - .02, floorZ]} receiveShadow>
        <planeGeometry args={[288, 288]} /><meshStandardMaterial color="#aacd9f" roughness={.98} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[floorX, CITY_FLOOR_Y, floorZ]} receiveShadow>
        <planeGeometry args={[276, 276]} /><meshStandardMaterial color="#596d70" roughness={.94} />
      </mesh>
      {blocks.map(([tileX, tileZ]) => (
        <CityBlock key={`${tileX}-${tileZ}`} tileX={tileX} tileZ={tileZ} />
      ))}
      <RoadDashes centerTileX={centerTileX} centerTileZ={centerTileZ} />
    </group>
  )
}

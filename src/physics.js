export const GRAVITY = 9.81
export const AIR_DENSITY = 1.225
export const IDLE_RPM = 850
export const REDLINE_RPM = 6800
export const STOICHIOMETRIC_AIR_FUEL_RATIO = 14.7

const TWO_PI = Math.PI * 2
const FOUR_STROKE_CYCLE_RADIANS = Math.PI * 4
const POWER_STROKE_RADIANS = Math.PI

// A conventional flat-plane inline-four. Cylinders are numbered from the
// front of the engine toward the flywheel. Cylinders 1 + 4 share one crank
// phase, while 2 + 3 share the opposite phase. Their combustion events remain
// distinct because a four-stroke cycle takes two crankshaft revolutions.
export const INLINE_FOUR_CYLINDERS = Object.freeze([
  Object.freeze({ cylinder: 1, x: -1.08, crankThrowPhase: 0, firingAngle: 0 }),
  Object.freeze({ cylinder: 2, x: -0.36, crankThrowPhase: Math.PI, firingAngle: Math.PI * 3 }),
  Object.freeze({ cylinder: 3, x: 0.36, crankThrowPhase: Math.PI, firingAngle: Math.PI }),
  Object.freeze({ cylinder: 4, x: 1.08, crankThrowPhase: 0, firingAngle: Math.PI * 2 }),
])

// Sorted separately from physical cylinder order so teaching views can step
// directly through the common 1-3-4-2 firing order.
export const INLINE_FOUR_FIRING_EVENTS = Object.freeze(
  [...INLINE_FOUR_CYLINDERS].sort((a, b) => a.firingAngle - b.firingAngle),
)

export const GEAR_RATIOS = Object.freeze({
  reverse: -3.54,
  neutral: 0,
  1: 3.55,
  2: 2.19,
  3: 1.52,
  4: 1.16,
  5: 0.93,
  6: 0.76,
})

export const FINAL_DRIVE_RATIO = 3.9
export const DRIVETRAIN_EFFICIENCY = 0.9

// A representative four-speed shift map for the teaching automatic. The
// controller raises every upshift point as accelerator demand rises, keeping a
// lower gear engaged longer when the driver asks for acceleration. Downshift
// lines sit below the matching upshift lines to provide hysteresis.
export const AUTOMATIC_SHIFT_SCHEDULE = Object.freeze({
  upshift: Object.freeze({
    1: Object.freeze({ light: 17, heavy: 55 }),
    2: Object.freeze({ light: 36, heavy: 85 }),
    3: Object.freeze({ light: 60, heavy: 117 }),
  }),
  downshift: Object.freeze({
    2: Object.freeze({ light: 10, heavy: 35 }),
    3: Object.freeze({ light: 26, heavy: 61 }),
    4: Object.freeze({ light: 48, heavy: 90 }),
  }),
})

const MAX_ENGINE_RPM = 7200
const STRAIGHT_LINE_RADIUS = 1_000_000_000
const STOP_SPEED = 0.05

// Net brake torque for a representative naturally aspirated gasoline engine.
// The broad middle and gentle falloff are characteristic of an everyday 2–3 L
// engine, rather than a turbocharged engine's flat torque plateau.
const FULL_THROTTLE_TORQUE_CURVE = [
  [0, 0],
  [400, 70],
  [IDLE_RPM, 145],
  [1200, 175],
  [2000, 210],
  [3000, 238],
  [4200, 260],
  [5200, 252],
  [6200, 220],
  [REDLINE_RPM, 165],
  [MAX_ENGINE_RPM, 0],
]

const GASOLINE_MIXTURE_LIMITS = Object.freeze({ min: 0.5, max: 1.6 })

// Equivalence ratio is actual fuel/air divided by the stoichiometric fuel/air
// ratio. These curves represent a warmed-up, naturally aspirated gasoline
// engine at a fixed air charge; outputs are normalized to stoichiometric.
const COMBUSTION_QUALITY_CURVE = [
  [0.5, 0.05],
  [0.65, 0.32],
  [0.75, 0.7],
  [0.85, 0.93],
  [1, 1],
  [1.1, 0.97],
  [1.25, 0.78],
  [1.4, 0.43],
  [1.6, 0.1],
]

const TORQUE_POWER_MULTIPLIER_CURVE = [
  [0.5, 0.03],
  [0.65, 0.28],
  [0.75, 0.67],
  [0.85, 0.9],
  [1, 1],
  [1.1, 1.04],
  [1.2, 0.99],
  [1.3, 0.83],
  [1.45, 0.46],
  [1.6, 0.12],
]

const EXHAUST_HEAT_TENDENCY_CURVE = [
  [0.5, 0.16],
  [0.65, 0.36],
  [0.75, 0.58],
  [0.85, 0.82],
  [0.95, 0.97],
  [1, 1],
  [1.1, 0.9],
  [1.25, 0.65],
  [1.4, 0.4],
  [1.6, 0.2],
]

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const finiteNumber = (value, fallback = 0) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
)

const positiveModulo = (value, modulus) => ((value % modulus) + modulus) % modulus

/**
 * Position a piston, crankpin, and connecting rod with slider-crank geometry.
 *
 * Angles are crankshaft radians and zero places the piston at top dead center.
 * Defaults match the exploded teaching model; callers may override dimensions
 * without risking a negative square root or non-finite render coordinates.
 */
export function sliderCrankPose(crankAngle = 0, options = {}) {
  const safeOptions = options && typeof options === 'object' ? options : {}
  const angle = positiveModulo(finiteNumber(crankAngle), TWO_PI)
  const crankCenterY = clamp(finiteNumber(safeOptions.crankCenterY, -1.05), -1000, 1000)
  const crankRadius = clamp(Math.abs(finiteNumber(safeOptions.crankRadius, 0.38)), 0, 100)
  const requestedRodLength = Math.abs(finiteNumber(safeOptions.rodLength, 1.35))
  const rodLength = clamp(Math.max(requestedRodLength, crankRadius + 1e-6), 1e-6, 1000)
  const pistonCrownOffset = clamp(
    finiteNumber(safeOptions.pistonCrownOffset, 0.18),
    -100,
    100,
  )

  const crankPinZ = Math.sin(angle) * crankRadius
  const crankPinY = crankCenterY + Math.cos(angle) * crankRadius
  const radicand = Math.max(0, rodLength ** 2 - crankPinZ ** 2)
  const pistonPinY = crankPinY + Math.sqrt(radicand)
  const rodDeltaY = crankPinY - pistonPinY
  const rodDeltaZ = crankPinZ

  return {
    crankAngle: angle,
    crankCenterY,
    crankRadius,
    rodLength,
    crankPinY,
    crankPinZ,
    pistonPinY,
    pistonY: pistonPinY + pistonCrownOffset,
    rodMidpointY: (pistonPinY + crankPinY) / 2,
    rodMidpointZ: crankPinZ / 2,
    rodDeltaY,
    rodDeltaZ,
  }
}

/**
 * Return the inline-four cylinder currently in its idealized 180° power
 * window. `cycleAngle` spans a 720° / 4π four-stroke cycle. The returned
 * progress is normalized from 0 at ignition/TDC to 1 just before BDC.
 */
export function activePowerCylinder(cycleAngle = 0) {
  const angle = positiveModulo(finiteNumber(cycleAngle), FOUR_STROKE_CYCLE_RADIANS)
  let event = INLINE_FOUR_FIRING_EVENTS[INLINE_FOUR_FIRING_EVENTS.length - 1]

  for (const candidate of INLINE_FOUR_FIRING_EVENTS) {
    if (candidate.firingAngle > angle) break
    event = candidate
  }

  const elapsed = positiveModulo(angle - event.firingAngle, FOUR_STROKE_CYCLE_RADIANS)
  return {
    ...event,
    progress: clamp(elapsed / POWER_STROKE_RADIANS, 0, 1),
  }
}

// Compatibility name used by early engine-study work while the public helper
// was being integrated.
export const activeInlineFourPowerEvent = activePowerCylinder

function interpolateCurve(curve, value) {
  if (value <= curve[0][0]) return curve[0][1]

  for (let index = 1; index < curve.length; index += 1) {
    const [nextX, nextY] = curve[index]
    const [previousX, previousY] = curve[index - 1]
    if (value <= nextX) {
      const progress = (value - previousX) / (nextX - previousX)
      return previousY + (nextY - previousY) * progress
    }
  }

  return curve[curve.length - 1][1]
}

/**
 * Gasoline combustion response for a given fuel/air equivalence ratio.
 *
 * A value of 1 is stoichiometric, values below 1 are lean, and values above 1
 * are rich. Fuel consumption is the injected-fuel ratio for the same air mass;
 * it can therefore keep rising even when an over-rich burn loses useful power.
 * Heat tendency is a normalized relative indicator, not an exhaust temperature.
 */
export function gasolineMixtureOutput(equivalenceRatio = 1) {
  const phi = clamp(
    finiteNumber(equivalenceRatio, 1),
    GASOLINE_MIXTURE_LIMITS.min,
    GASOLINE_MIXTURE_LIMITS.max,
  )

  let status
  if (phi < 0.78) status = 'too-lean'
  else if (phi < 0.95) status = 'lean'
  else if (phi <= 1.05) status = 'stoichiometric'
  else if (phi <= 1.25) status = 'rich'
  else status = 'too-rich'

  const torquePowerMultiplier = clamp(
    interpolateCurve(TORQUE_POWER_MULTIPLIER_CURVE, phi),
    0,
    1.04,
  )

  return {
    equivalenceRatio: phi,
    airFuelRatio: STOICHIOMETRIC_AIR_FUEL_RATIO / phi,
    combustionQuality: clamp(interpolateCurve(COMBUSTION_QUALITY_CURVE, phi), 0, 1),
    torqueMultiplier: torquePowerMultiplier,
    powerMultiplier: torquePowerMultiplier,
    fuelConsumptionMultiplier: phi,
    exhaustHeatTendency: clamp(interpolateCurve(EXHAUST_HEAT_TENDENCY_CURVE, phi), 0, 1),
    status,
  }
}

/**
 * Engine crankshaft torque in N·m.
 *
 * `throttle` is a 0–1 pedal position. At a closed pedal the idle controller
 * adds just enough throttle to hold roughly 850 rpm. Above idle, pumping and
 * friction losses make closed-throttle torque negative (engine braking).
 */
export function engineTorqueNm(rpm = IDLE_RPM, throttle = 0) {
  const safeRpm = clamp(finiteNumber(rpm, IDLE_RPM), 0, MAX_ENGINE_RPM)
  const pedal = clamp(finiteNumber(throttle), 0, 1)

  if (safeRpm === 0) return 0

  const fullThrottleTorque = interpolateCurve(FULL_THROTTLE_TORQUE_CURVE, safeRpm)
  const overrunDragTorque = 9.5 + safeRpm * 0.0036

  // At idle this fraction exactly balances drag. The proportional correction
  // catches a falling idle, as an electronic idle-air controller would.
  const holdingThrottle = overrunDragTorque
    / Math.max(1, fullThrottleTorque + overrunDragTorque)
  const idleCorrection = (IDLE_RPM - safeRpm) / 650
  const idleThrottle = clamp(holdingThrottle + idleCorrection, 0, 0.55)
  const effectiveThrottle = Math.max(pedal, idleThrottle)

  const netTorque = fullThrottleTorque * effectiveThrottle
    - overrunDragTorque * (1 - effectiveThrottle)

  // A stopped engine cannot make crankshaft torque. This fade also keeps the
  // simplified idle controller well behaved while a starter is cranking it.
  const crankingFactor = clamp(safeRpm / 400, 0, 1)
  return netTorque * crankingFactor
}

/**
 * A compact engine-energy model. Power is signed: negative power represents
 * the engine absorbing energy during closed-throttle overrun.
 */
export function engineOutput({ rpm = IDLE_RPM, throttle = 0, spark = true, equivalenceRatio = 1 } = {}) {
  const safeRpm = clamp(finiteNumber(rpm, IDLE_RPM), 0, MAX_ENGINE_RPM)
  const safeThrottle = clamp(finiteNumber(throttle), 0, 1)
  const mixture = gasolineMixtureOutput(equivalenceRatio)
  const idealMixtureTorqueNm = engineTorqueNm(safeRpm, safeThrottle)
  const combustionTorqueNm = idealMixtureTorqueNm > 0
    ? idealMixtureTorqueNm * mixture.torqueMultiplier
    : idealMixtureTorqueNm
  const hasSpark = spark !== false
  const torqueNm = hasSpark
    ? combustionTorqueNm
    : safeRpm < 200 ? 0 : -(9.5 + safeRpm * 0.0036)
  const angularSpeed = safeRpm * (2 * Math.PI / 60)
  const powerKw = torqueNm * angularSpeed / 1000

  // Gasoline engines are most efficient at moderate-to-high load near the
  // middle of the rev range. 34% is plausible for a modern spark-ignition car.
  const rpmBand = Math.exp(-(((safeRpm - 3600) / 3000) ** 2))
  const loadBand = 0.25 + 0.75 * Math.sqrt(safeThrottle)
  const combustionEfficiency = clamp(0.1 + 0.24 * rpmBand * loadBand, 0.08, 0.34)
  const mixtureEfficiency = combustionEfficiency
    * mixture.powerMultiplier
    / Math.max(0.01, mixture.fuelConsumptionMultiplier)
  const efficiency = hasSpark ? clamp(mixtureEfficiency, 0, 0.34) : 0

  let fuelRateGps
  if (safeRpm < 200) {
    fuelRateGps = 0
  } else if (safeThrottle < 0.015 && safeRpm > 1500 && torqueNm < 0) {
    // Modern engines nearly stop injecting fuel while the wheels back-drive
    // the engine. A tiny non-zero value avoids a brittle discontinuity in UI.
    fuelRateGps = 0.015
  } else {
    const idleAndAccessoryFuel = 0.16 + Math.max(0, safeRpm - IDLE_RPM) * 0.000008
    // Gasoline lower heating value ≈ 44 MJ/kg. With kW and g/s, division by
    // (44 * efficiency) performs the required unit conversion directly.
    const potentialPowerKw = Math.max(0, idealMixtureTorqueNm * angularSpeed / 1000)
    const loadFuel = potentialPowerKw / (44 * combustionEfficiency)
    fuelRateGps = idleAndAccessoryFuel + loadFuel
  }

  if (fuelRateGps > 0.02) fuelRateGps *= mixture.fuelConsumptionMultiplier

  return { torqueNm, powerKw, fuelRateGps, efficiency, mixture }
}

/** Accepts -1/"R"/"reverse", 0/"N"/"neutral", or gears 1 through 6. */
export function getGearRatio(gear = 0) {
  if (gear === -1) return GEAR_RATIOS.reverse
  if (gear === 0) return GEAR_RATIOS.neutral

  const key = String(gear).trim().toLowerCase()
  if (key === 'r' || key === 'reverse' || key === '-1') return GEAR_RATIOS.reverse
  if (key === 'n' || key === 'neutral' || key === '0') return GEAR_RATIOS.neutral
  if (Object.hasOwn(GEAR_RATIOS, key)) return GEAR_RATIOS[key]
  return GEAR_RATIOS.neutral
}

const shiftLineAtPedal = (line, pedal) => (
  line.light + (line.heavy - line.light) * pedal ** 1.08
)

/**
 * Speed thresholds used by the representative four-speed automatic.
 *
 * Values are road speed in km/h. Higher accelerator demand moves the lines to
 * the right: the controller holds a lower gear longer so the engine can make
 * more power. Separate downshift lines keep the transmission from hunting back
 * and forth when speed hovers near an upshift point.
 */
export function automaticShiftThresholds(throttle = 0) {
  const pedal = clamp(finiteNumber(throttle), 0, 1)
  return {
    throttle: pedal,
    upshift: Object.fromEntries(Object.entries(AUTOMATIC_SHIFT_SCHEDULE.upshift)
      .map(([gear, line]) => [gear, shiftLineAtPedal(line, pedal)])),
    downshift: Object.fromEntries(Object.entries(AUTOMATIC_SHIFT_SCHEDULE.downshift)
      .map(([gear, line]) => [gear, shiftLineAtPedal(line, pedal)])),
  }
}

/**
 * Choose the next ratio in Drive from road speed and accelerator demand.
 *
 * The return value describes one adjacent shift at a time so the teaching
 * animation can visibly release and apply each clutch pair. A rapid pedal push
 * can request a downshift (kickdown), while a projected-input-rpm guard blocks
 * any downshift that would over-speed the engine.
 */
export function automaticGearDecision({
  speedKph = 0,
  throttle = 0,
  currentGear = 1,
  wheelRadius = 0.31,
  redlineRpm = REDLINE_RPM,
} = {}) {
  const speed = clamp(Math.abs(finiteNumber(speedKph)), 0, 300)
  const pedal = clamp(finiteNumber(throttle), 0, 1)
  const gear = clamp(Math.round(finiteNumber(currentGear, 1)), 1, 4)
  const safeWheelRadius = clamp(finiteNumber(wheelRadius, 0.31), 0.1, 1.5)
  const safeRedline = clamp(finiteNumber(redlineRpm, REDLINE_RPM), 1000, 20_000)
  const thresholds = automaticShiftThresholds(pedal)
  let targetGear = gear
  let reason = 'hold'
  let thresholdKph = gear < 4 ? thresholds.upshift[gear] : thresholds.downshift[gear]

  if (gear < 4 && speed >= thresholds.upshift[gear]) {
    targetGear = gear + 1
    reason = 'upshift'
    thresholdKph = thresholds.upshift[gear]
  } else if (gear > 1 && speed <= thresholds.downshift[gear]) {
    targetGear = gear - 1
    reason = pedal >= 0.72 ? 'kickdown' : 'downshift'
    thresholdKph = thresholds.downshift[gear]
  }

  const speedMps = speed / 3.6
  const wheelRpm = speedMps / (2 * Math.PI * safeWheelRadius) * 60
  const outputRpm = wheelRpm * FINAL_DRIVE_RATIO
  let projectedInputRpm = outputRpm * Math.abs(getGearRatio(targetGear))

  if (targetGear < gear && projectedInputRpm > safeRedline * 0.96) {
    targetGear = gear
    reason = 'protected'
    projectedInputRpm = outputRpm * Math.abs(getGearRatio(gear))
  }

  const direction = targetGear > gear ? 'up' : targetGear < gear ? 'down' : 'hold'
  const nextUpshift = gear < 4 ? thresholds.upshift[gear] : null
  const nextDownshift = gear > 1 ? thresholds.downshift[gear] : null
  const reasonDetail = reason === 'upshift'
    ? `${speed.toFixed(0)} km/h crossed the ${gear}→${gear + 1} line at this pedal request.`
    : reason === 'kickdown'
      ? `High pedal demand moved the downshift line above ${speed.toFixed(0)} km/h, requesting more leverage.`
      : reason === 'downshift'
        ? `Road speed fell below the ${gear}→${gear - 1} downshift line.`
        : reason === 'protected'
          ? `The lower ratio would exceed the ${safeRedline.toFixed(0)} rpm protection limit.`
          : gear === 4
            ? 'Road speed and pedal demand remain inside the fourth-gear region.'
            : `The controller is waiting for ${nextUpshift.toFixed(0)} km/h before the next upshift.`

  return {
    speedKph: speed,
    throttle: pedal,
    currentGear: gear,
    targetGear,
    direction,
    reason,
    reasonDetail,
    willShift: targetGear !== gear,
    kickdown: reason === 'kickdown',
    thresholdKph,
    nextUpshiftKph: nextUpshift,
    nextDownshiftKph: nextDownshift,
    projectedInputRpm,
    outputRpm,
    thresholds,
  }
}

/**
 * Rotational speeds and torque multiplication through the teaching automatic.
 * Gearbox output is the propshaft side, before the fixed final-drive reduction.
 * In neutral, input RPM is reported as zero with `connected: false`; the engine
 * may still spin freely and `converterSlipRpm` shows that uncoupled difference.
 */
export function transmissionKinematics({
  engineRpm = IDLE_RPM,
  engineTorque = 0,
  speed = 0,
  wheelRadius = 0.31,
  gear = 0,
  torqueTransfer = 1,
} = {}) {
  const safeEngineRpm = clamp(finiteNumber(engineRpm, IDLE_RPM), 0, MAX_ENGINE_RPM)
  const safeEngineTorque = clamp(finiteNumber(engineTorque), -1000, 1000)
  const safeSpeed = clamp(finiteNumber(speed), -120, 120)
  const safeWheelRadius = clamp(finiteNumber(wheelRadius, 0.31), 0.1, 1.5)
  const safeTransfer = clamp(finiteNumber(torqueTransfer, 1), 0, 1)
  const gearRatio = getGearRatio(gear)
  const connected = gearRatio !== 0
  const wheelRpm = Math.abs(safeSpeed) / (2 * Math.PI * safeWheelRadius) * 60
  const outputRpm = wheelRpm * FINAL_DRIVE_RATIO
  const inputRpm = connected ? outputRpm * Math.abs(gearRatio) : 0
  const gearboxOutputTorque = safeEngineTorque * gearRatio * DRIVETRAIN_EFFICIENCY * safeTransfer
  const wheelTorque = gearboxOutputTorque * FINAL_DRIVE_RATIO

  return {
    connected,
    gearRatio,
    wheelRpm,
    inputRpm,
    outputRpm,
    converterSlipRpm: safeEngineRpm - inputRpm,
    gearboxOutputTorque,
    wheelTorque,
    torqueTransfer: safeTransfer,
  }
}

/**
 * Longitudinal tire and road forces in SI units.
 *
 * `speed` is signed m/s and `roadGrade` is rise/run (0.05 means a 5% uphill
 * grade in the car's forward direction). Drive forces are signed. The named
 * resistance forces are positive magnitudes; `netForce` carries direction.
 */
export function drivetrainOutput({
  engineTorque = 0,
  gear = 0,
  torqueTransfer = 1,
  brake = 0,
  speed = 0,
  mass = 1450,
  wheelRadius = 0.31,
  roadGrade = 0,
} = {}) {
  const safeEngineTorque = clamp(finiteNumber(engineTorque), -1000, 1000)
  const safeTorqueTransfer = clamp(finiteNumber(torqueTransfer, 1), 0, 1)
  const safeBrake = clamp(finiteNumber(brake), 0, 1)
  const safeSpeed = clamp(finiteNumber(speed), -120, 120)
  const safeMass = clamp(finiteNumber(mass, 1450), 250, 50_000)
  const safeWheelRadius = clamp(finiteNumber(wheelRadius, 0.31), 0.1, 1.5)
  const safeGrade = clamp(finiteNumber(roadGrade), -0.5, 0.5)

  const gearRatio = getGearRatio(gear)
  const finalDrive = FINAL_DRIVE_RATIO
  const drivetrainEfficiency = DRIVETRAIN_EFFICIENCY
  const wheelTorque = safeEngineTorque * gearRatio * finalDrive * drivetrainEfficiency * safeTorqueTransfer
  const driveForce = wheelTorque / safeWheelRadius

  const gradeAngle = Math.atan(safeGrade)
  const normalForce = safeMass * GRAVITY * Math.cos(gradeAngle)
  const tireFrictionLimit = 0.9 * normalForce
  // The teaching sedan is rear-wheel drive. In a straight, steady condition,
  // roughly 55% of its normal load is available at the driven rear axle.
  const tractionLimit = 0.55 * tireFrictionLimit
  const tractionLimitedForce = clamp(driveForce, -tractionLimit, tractionLimit)

  const roadGradeForce = -safeMass * GRAVITY * Math.sin(gradeAngle)
  const forceBeforeResistance = tractionLimitedForce + roadGradeForce
  const movementDirection = Math.abs(safeSpeed) > STOP_SPEED
    ? Math.sign(safeSpeed)
    : Math.sign(forceBeforeResistance)

  const brakeCapacity = safeBrake * tireFrictionLimit
  const aerodynamicCapacity = 0.5 * AIR_DENSITY * 0.64 * safeSpeed ** 2
  const rollingCapacity = 0.012 * normalForce

  let brakeForce = movementDirection === 0 ? 0 : brakeCapacity
  const aeroDrag = movementDirection === 0 ? 0 : aerodynamicCapacity
  let rollingResistance = movementDirection === 0 ? 0 : rollingCapacity

  if (Math.abs(safeSpeed) <= STOP_SPEED && movementDirection !== 0) {
    // At rest, brakes and tire deformation can cancel a tendency to move, but
    // cannot create motion in the opposite direction by themselves.
    let remainingForce = Math.abs(forceBeforeResistance)
    brakeForce = Math.min(brakeForce, remainingForce)
    remainingForce -= brakeForce
    rollingResistance = Math.min(rollingResistance, remainingForce)
  }

  const resistanceForce = movementDirection * (brakeForce + aeroDrag + rollingResistance)
  const netForce = forceBeforeResistance - resistanceForce
  const acceleration = netForce / safeMass

  return {
    gearRatio,
    finalDrive,
    torqueTransfer: safeTorqueTransfer,
    wheelTorque,
    driveForce,
    brakeForce,
    aeroDrag,
    rollingResistance,
    roadGradeForce,
    tireFrictionLimit,
    tractionLimit,
    tractionLimitedForce,
    netForce,
    acceleration,
  }
}

/**
 * Kinematic bicycle steering model. Turn radius is signed in meters and yaw
 * rate is signed radians/s. Straight ahead uses a large finite radius so every
 * simulator output remains JSON- and chart-friendly.
 */
export function steeringOutput({ speed = 0, steeringDeg = 0, wheelbase = 2.7 } = {}) {
  const safeSpeed = clamp(finiteNumber(speed), -120, 120)
  const safeSteeringDeg = clamp(finiteNumber(steeringDeg), -40, 40)
  const safeWheelbase = clamp(finiteNumber(wheelbase, 2.7), 1, 10)
  const steeringRadians = safeSteeringDeg * Math.PI / 180

  if (Math.abs(steeringRadians) < 1e-7) {
    return { turnRadius: STRAIGHT_LINE_RADIUS, yawRate: 0 }
  }

  const turnRadius = safeWheelbase / Math.tan(steeringRadians)
  const yawRate = safeSpeed / turnRadius
  return { turnRadius, yawRate }
}

/**
 * Kinematics for a symmetric open differential. `carrierSpeed` can be any
 * angular-speed unit (rpm, rad/s, or a normalized teaching rate) as long as
 * the caller uses the returned values in the same unit. Positive turn bias is
 * a left turn: the vehicle-left axle slows while the vehicle-right axle speeds
 * up by the same amount. The carrier always remains their arithmetic mean.
 */
export function openDifferentialKinematics({ carrierSpeed = 0, turnBias = 0 } = {}) {
  const safeCarrierSpeed = clamp(finiteNumber(carrierSpeed), -100_000, 100_000)
  const safeTurnBias = clamp(finiteNumber(turnBias), -0.8, 0.8)
  const speedSplit = safeCarrierSpeed * safeTurnBias

  return {
    carrierSpeed: safeCarrierSpeed,
    leftSpeed: safeCarrierSpeed - speedSplit,
    rightSpeed: safeCarrierSpeed + speedSplit,
    speedSplit,
    turnBias: safeTurnBias,
  }
}

const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle))

/**
 * Advance the simplified vehicle by `dt` seconds. State uses meters, seconds,
 * radians, and rpm; heading 0 points along +z. Controls accept throttle/gas,
 * brake/brakes, steeringDeg/steering, gear, and roadGrade.
 */
export function stepVehicle(state = {}, controls = {}, dt = 1 / 60) {
  const safeState = state && typeof state === 'object' ? state : {}
  const safeControls = controls && typeof controls === 'object' ? controls : {}
  const timeStep = clamp(finiteNumber(dt), 0, 0.25)

  const speed = clamp(finiteNumber(safeState.speed), -120, 120)
  const previousRpm = clamp(finiteNumber(safeState.rpm, IDLE_RPM), 0, MAX_ENGINE_RPM)
  const previousHeading = normalizeAngle(finiteNumber(safeState.heading))
  const previousX = finiteNumber(safeState.x)
  const previousZ = finiteNumber(safeState.z)
  const mass = clamp(finiteNumber(safeState.mass, 1450), 250, 50_000)
  const wheelRadius = clamp(finiteNumber(safeState.wheelRadius, 0.31), 0.1, 1.5)
  const wheelbase = clamp(finiteNumber(safeState.wheelbase, 2.7), 1, 10)

  const throttle = clamp(finiteNumber(safeControls.throttle ?? safeControls.gas), 0, 1)
  const brake = clamp(finiteNumber(safeControls.brake ?? safeControls.brakes), 0, 1)
  const torqueTransfer = clamp(finiteNumber(safeControls.torqueTransfer, 1), 0, 1)
  const steeringDeg = clamp(
    finiteNumber(safeControls.steeringDeg ?? safeControls.steering),
    -40,
    40,
  )
  const gear = safeControls.gear ?? safeState.gear ?? 1
  const roadGrade = clamp(
    finiteNumber(safeControls.roadGrade ?? safeState.roadGrade),
    -0.5,
    0.5,
  )

  const gearRatio = getGearRatio(gear)
  const wheelRpm = Math.abs(speed) / (2 * Math.PI * wheelRadius) * 60
  const coupledRpm = Math.max(IDLE_RPM, wheelRpm * Math.abs(gearRatio) * FINAL_DRIVE_RATIO)
  const launchSlip = IDLE_RPM
    + throttle * 1200 * clamp(1 - Math.abs(speed) / 8, 0, 1)
  const freeRevRpm = IDLE_RPM + throttle * (REDLINE_RPM - IDLE_RPM)
  const targetRpm = gearRatio === 0
    ? freeRevRpm
    : Math.max(coupledRpm, launchSlip)
  const rpmResponse = gearRatio === 0
    ? (targetRpm > previousRpm ? 3.8 : 2.2)
    : 10
  const rpmBlend = 1 - Math.exp(-rpmResponse * timeStep)
  const rpm = clamp(
    previousRpm + (clamp(targetRpm, 0, MAX_ENGINE_RPM) - previousRpm) * rpmBlend,
    0,
    MAX_ENGINE_RPM,
  )

  const engine = engineOutput({ rpm, throttle })
  const drivetrain = drivetrainOutput({
    engineTorque: engine.torqueNm,
    gear,
    torqueTransfer,
    brake,
    speed,
    mass,
    wheelRadius,
    roadGrade,
  })

  let nextSpeed = clamp(speed + drivetrain.acceleration * timeStep, -120, 120)
  const poweredDriveDirection = engine.torqueNm > 0 ? Math.sign(gearRatio) : 0
  const canDriveBackward = poweredDriveDirection < 0 || drivetrain.roadGradeForce < 0
  const canDriveForward = poweredDriveDirection > 0 || drivetrain.roadGradeForce > 0
  // Resistive forces can bring the car to rest, but cannot push it through zero.
  // Crossing is allowed only when the selected gear or gravity pulls that way.
  if (speed > 0 && nextSpeed < 0 && !canDriveBackward) nextSpeed = 0
  if (speed < 0 && nextSpeed > 0 && !canDriveForward) nextSpeed = 0

  const averageSpeed = (speed + nextSpeed) / 2
  const steering = steeringOutput({ speed: averageSpeed, steeringDeg, wheelbase })
  const heading = normalizeAngle(previousHeading + steering.yawRate * timeStep)
  const midpointHeading = normalizeAngle(
    previousHeading + steering.yawRate * timeStep * 0.5,
  )
  const distance = averageSpeed * timeStep
  const x = previousX + Math.sin(midpointHeading) * distance
  const z = previousZ + Math.cos(midpointHeading) * distance

  const outputs = { engine, drivetrain, steering }
  return {
    ...safeState,
    speed: nextSpeed,
    rpm,
    heading,
    x,
    z,
    gear,
    engine,
    drivetrain,
    steering,
    outputs,
  }
}

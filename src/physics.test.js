import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DRIVETRAIN_EFFICIENCY,
  FINAL_DRIVE_RATIO,
  IDLE_RPM,
  INLINE_FOUR_CYLINDERS,
  INLINE_FOUR_FIRING_EVENTS,
  STOICHIOMETRIC_AIR_FUEL_RATIO,
  activePowerCylinder,
  automaticGearDecision,
  automaticShiftThresholds,
  clamp,
  drivetrainOutput,
  engineOutput,
  engineTorqueNm,
  gasolineMixtureOutput,
  getGearRatio,
  openDifferentialKinematics,
  sliderCrankPose,
  steeringOutput,
  stepVehicle,
  transmissionKinematics,
} from './physics.js'

function assertFiniteTree(value, path = 'value') {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} should be finite, got ${value}`)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    assertFiniteTree(child, `${path}.${key}`)
  }
}

test('clamp keeps values inside an inclusive interval', () => {
  assert.equal(clamp(-2, 0, 1), 0)
  assert.equal(clamp(0.4, 0, 1), 0.4)
  assert.equal(clamp(3, 0, 1), 1)
})

test('automatic shift map upshifts earlier with a light pedal', () => {
  const light = automaticGearDecision({ speedKph: 30, throttle: 0.15, currentGear: 1 })
  const heavy = automaticGearDecision({ speedKph: 30, throttle: 0.9, currentGear: 1 })

  assert.equal(light.targetGear, 2)
  assert.equal(light.reason, 'upshift')
  assert.equal(heavy.targetGear, 1)
  assert.equal(heavy.reason, 'hold')
})

test('automatic shift map uses hysteresis instead of hunting at one boundary', () => {
  const thresholds = automaticShiftThresholds(0.4)
  const betweenLines = (thresholds.downshift[2] + thresholds.upshift[1]) / 2
  const decision = automaticGearDecision({ speedKph: betweenLines, throttle: 0.4, currentGear: 2 })

  assert.ok(thresholds.downshift[2] < thresholds.upshift[1])
  assert.equal(decision.targetGear, 2)
  assert.equal(decision.reason, 'hold')
})

test('a large accelerator request can command a kickdown', () => {
  const decision = automaticGearDecision({ speedKph: 52, throttle: 0.92, currentGear: 3 })

  assert.equal(decision.targetGear, 2)
  assert.equal(decision.reason, 'kickdown')
  assert.equal(decision.direction, 'down')
})

test('automatic shift decision sanitizes inputs and protects an unsafe downshift', () => {
  const sanitized = automaticGearDecision({
    speedKph: Number.POSITIVE_INFINITY,
    throttle: Number.NaN,
    currentGear: Number.NEGATIVE_INFINITY,
  })
  const protectedShift = automaticGearDecision({
    speedKph: 35,
    throttle: 1,
    currentGear: 2,
    redlineRpm: 1000,
  })

  assertFiniteTree(sanitized, 'automaticGearDecision.invalid')
  assert.equal(sanitized.currentGear, 1)
  assert.equal(protectedShift.targetGear, 2)
  assert.equal(protectedShift.reason, 'protected')
})

test('inline-four configuration is immutable and fires in 1-3-4-2 order', () => {
  assert.ok(Object.isFrozen(INLINE_FOUR_CYLINDERS))
  assert.ok(INLINE_FOUR_CYLINDERS.every(Object.isFrozen))
  assert.ok(Object.isFrozen(INLINE_FOUR_FIRING_EVENTS))
  assert.deepEqual(
    INLINE_FOUR_FIRING_EVENTS.map(({ cylinder }) => cylinder),
    [1, 3, 4, 2],
  )
  assert.deepEqual(
    INLINE_FOUR_FIRING_EVENTS.map(({ firingAngle }) => firingAngle),
    [0, Math.PI, Math.PI * 2, Math.PI * 3],
  )
})

test('flat-plane inline-four pairs cylinders 1 + 4 and 2 + 3', () => {
  const cycleAngle = 0.73
  const poses = new Map(INLINE_FOUR_CYLINDERS.map((cylinder) => [
    cylinder.cylinder,
    sliderCrankPose(cycleAngle + cylinder.crankThrowPhase),
  ]))

  assert.ok(Math.abs(poses.get(1).pistonPinY - poses.get(4).pistonPinY) < 1e-12)
  assert.ok(Math.abs(poses.get(2).pistonPinY - poses.get(3).pistonPinY) < 1e-12)
  assert.ok(Math.abs(poses.get(1).pistonPinY - poses.get(2).pistonPinY) > 0.1)
  assert.ok(Math.abs(poses.get(1).crankPinZ - poses.get(4).crankPinZ) < 1e-12)
  assert.ok(Math.abs(poses.get(2).crankPinZ - poses.get(3).crankPinZ) < 1e-12)
})

test('piston geometry repeats after 2π while firing identity repeats after 4π', () => {
  const cycleAngle = 0.35

  for (const cylinder of INLINE_FOUR_CYLINDERS) {
    const first = sliderCrankPose(cycleAngle + cylinder.crankThrowPhase)
    const nextTurn = sliderCrankPose(cycleAngle + Math.PI * 2 + cylinder.crankThrowPhase)
    assert.ok(Math.abs(first.pistonPinY - nextTurn.pistonPinY) < 1e-12)
    assert.ok(Math.abs(first.crankPinY - nextTurn.crankPinY) < 1e-12)
    assert.ok(Math.abs(first.crankPinZ - nextTurn.crankPinZ) < 1e-12)
  }

  const firstPowerEvent = activePowerCylinder(cycleAngle)
  const nextTurnPowerEvent = activePowerCylinder(cycleAngle + Math.PI * 2)
  const nextCyclePowerEvent = activePowerCylinder(cycleAngle + Math.PI * 4)
  assert.equal(firstPowerEvent.cylinder, 1)
  assert.equal(nextTurnPowerEvent.cylinder, 4)
  assert.equal(nextCyclePowerEvent.cylinder, firstPowerEvent.cylinder)
  assert.ok(Math.abs(nextCyclePowerEvent.progress - firstPowerEvent.progress) < 1e-12)
})

test('active inline-four power event reports normalized stroke progress', () => {
  const cases = [
    [0, 1],
    [Math.PI, 3],
    [Math.PI * 2, 4],
    [Math.PI * 3, 2],
  ]

  for (const [firingAngle, cylinder] of cases) {
    const start = activePowerCylinder(firingAngle)
    const halfway = activePowerCylinder(firingAngle + Math.PI / 2)
    assert.equal(start.cylinder, cylinder)
    assert.equal(start.progress, 0)
    assert.equal(halfway.cylinder, cylinder)
    assert.ok(Math.abs(halfway.progress - 0.5) < 1e-12)
  }
})

test('inline-four kinematics sanitize invalid dimensions and cycle angles', () => {
  const invalidPose = sliderCrankPose(Number.NaN, {
    crankCenterY: Number.POSITIVE_INFINITY,
    crankRadius: Number.NEGATIVE_INFINITY,
    rodLength: Number.NaN,
    pistonCrownOffset: Number.POSITIVE_INFINITY,
  })
  const shortRodPose = sliderCrankPose(Number.MAX_VALUE, {
    crankRadius: 8,
    rodLength: 0.01,
  })
  const invalidEvent = activePowerCylinder(Number.NEGATIVE_INFINITY)

  assertFiniteTree(invalidPose, 'sliderCrankPose.invalid')
  assertFiniteTree(shortRodPose, 'sliderCrankPose.shortRod')
  assertFiniteTree(invalidEvent, 'activePowerCylinder.invalid')
  assert.ok(shortRodPose.rodLength > shortRodPose.crankRadius)
  assert.equal(invalidEvent.cylinder, 1)
  assert.equal(invalidEvent.progress, 0)
})

test('gasoline mixture output anchors stoichiometric combustion at 14.7:1', () => {
  const mixture = gasolineMixtureOutput(1)

  assert.equal(mixture.equivalenceRatio, 1)
  assert.equal(mixture.airFuelRatio, STOICHIOMETRIC_AIR_FUEL_RATIO)
  assert.equal(mixture.combustionQuality, 1)
  assert.equal(mixture.torqueMultiplier, 1)
  assert.equal(mixture.powerMultiplier, mixture.torqueMultiplier)
  assert.equal(mixture.fuelConsumptionMultiplier, 1)
  assert.equal(mixture.exhaustHeatTendency, 1)
  assert.equal(mixture.status, 'stoichiometric')
})

test('gasoline mixture status distinguishes lean and rich operating regions', () => {
  const cases = [
    [0.65, 'too-lean'],
    [0.85, 'lean'],
    [1, 'stoichiometric'],
    [1.15, 'rich'],
    [1.4, 'too-rich'],
  ]

  for (const [equivalenceRatio, status] of cases) {
    assert.equal(gasolineMixtureOutput(equivalenceRatio).status, status)
  }

  assert.ok(gasolineMixtureOutput(0.85).airFuelRatio > STOICHIOMETRIC_AIR_FUEL_RATIO)
  assert.ok(gasolineMixtureOutput(1.15).airFuelRatio < STOICHIOMETRIC_AIR_FUEL_RATIO)
})

test('best-power richness is modest while extreme mixtures lose useful output', () => {
  const tooLean = gasolineMixtureOutput(0.65)
  const stoichiometric = gasolineMixtureOutput(1)
  const bestPower = gasolineMixtureOutput(1.1)
  const tooRich = gasolineMixtureOutput(1.45)

  assert.ok(bestPower.torqueMultiplier > stoichiometric.torqueMultiplier)
  assert.ok(tooLean.torqueMultiplier < stoichiometric.torqueMultiplier)
  assert.ok(tooRich.torqueMultiplier < stoichiometric.torqueMultiplier)
  assert.ok(tooLean.combustionQuality < stoichiometric.combustionQuality)
  assert.ok(tooRich.combustionQuality < stoichiometric.combustionQuality)
})

test('mixture fuel dose rises with richness while heat peaks near stoichiometric', () => {
  const lean = gasolineMixtureOutput(0.85)
  const stoichiometric = gasolineMixtureOutput(1)
  const rich = gasolineMixtureOutput(1.25)

  assert.equal(lean.fuelConsumptionMultiplier, 0.85)
  assert.equal(rich.fuelConsumptionMultiplier, 1.25)
  assert.ok(lean.exhaustHeatTendency < stoichiometric.exhaustHeatTendency)
  assert.ok(rich.exhaustHeatTendency < stoichiometric.exhaustHeatTendency)
})

test('gasoline mixture output clamps and sanitizes invalid controls', () => {
  const invalid = gasolineMixtureOutput(Number.NaN)
  const tooLow = gasolineMixtureOutput(-10)
  const tooHigh = gasolineMixtureOutput(10)

  assert.equal(invalid.equivalenceRatio, 1)
  assert.equal(tooLow.equivalenceRatio, 0.5)
  assert.equal(tooLow.status, 'too-lean')
  assert.equal(tooHigh.equivalenceRatio, 1.6)
  assert.equal(tooHigh.status, 'too-rich')
  assertFiniteTree(invalid, 'gasolineMixtureOutput.invalid')
  assertFiniteTree(tooLow, 'gasolineMixtureOutput.tooLow')
  assertFiniteTree(tooHigh, 'gasolineMixtureOutput.tooHigh')
})

test('gear ratios cover reverse, neutral, and six forward gears', () => {
  assert.ok(getGearRatio('R') < 0)
  assert.equal(getGearRatio(-1), getGearRatio('reverse'))
  assert.equal(getGearRatio('N'), 0)
  assert.equal(getGearRatio(0), 0)
  assert.ok(getGearRatio(1) > getGearRatio(2))
  assert.ok(getGearRatio(2) > getGearRatio(3))
  assert.ok(getGearRatio(3) > getGearRatio(4))
  assert.ok(getGearRatio(4) > getGearRatio(5))
  assert.ok(getGearRatio(5) > getGearRatio(6))
  assert.equal(getGearRatio('unknown'), 0)
})

test('engine torque has idle control, throttle response, and overrun braking', () => {
  const heldIdleTorque = engineTorqueNm(IDLE_RPM, 0)
  assert.ok(Math.abs(heldIdleTorque) < 1, `idle torque was ${heldIdleTorque}`)
  assert.ok(engineTorqueNm(600, 0) > 0, 'idle controller should catch falling rpm')
  assert.ok(engineTorqueNm(2500, 0) < 0, 'closed throttle above idle should brake')

  const halfThrottle = engineTorqueNm(3500, 0.5)
  const fullThrottle = engineTorqueNm(3500, 1)
  assert.ok(halfThrottle > 0)
  assert.ok(fullThrottle > halfThrottle)
  assert.ok(engineTorqueNm(4200, 1) > engineTorqueNm(6800, 1))
})

test('engine output preserves the torque-power relationship and realistic bounds', () => {
  const output = engineOutput({ rpm: 4000, throttle: 1 })
  const expectedPowerKw = output.torqueNm * 4000 * (2 * Math.PI / 60) / 1000

  assert.ok(Math.abs(output.powerKw - expectedPowerKw) < 1e-10)
  assert.ok(output.powerKw > 90)
  assert.ok(output.efficiency > 0 && output.efficiency <= 0.34)
  assert.ok(output.fuelRateGps > 0)

  const coast = engineOutput({ rpm: 3000, throttle: 0 })
  assert.ok(coast.powerKw < 0)
  assert.ok(coast.fuelRateGps < output.fuelRateGps)
  assertFiniteTree(output, 'engineOutput')
})

test('a disabled spark removes combustion torque without pretending fuel vanished', () => {
  const firing = engineOutput({ rpm: 2500, throttle: 0.6, spark: true })
  const misfiring = engineOutput({ rpm: 2500, throttle: 0.6, spark: false })

  assert.ok(firing.torqueNm > 0)
  assert.ok(misfiring.torqueNm < 0)
  assert.equal(misfiring.efficiency, 0)
  assert.ok(misfiring.fuelRateGps > 0)
})

test('engine output applies mixture to useful torque, fuel rate, and efficiency', () => {
  const lean = engineOutput({ rpm: 3500, throttle: 0.8, equivalenceRatio: 0.7 })
  const balanced = engineOutput({ rpm: 3500, throttle: 0.8, equivalenceRatio: 1 })
  const richPower = engineOutput({ rpm: 3500, throttle: 0.8, equivalenceRatio: 1.1 })
  const tooRich = engineOutput({ rpm: 3500, throttle: 0.8, equivalenceRatio: 1.5 })

  assert.ok(lean.torqueNm < balanced.torqueNm)
  assert.ok(richPower.torqueNm > balanced.torqueNm)
  assert.ok(tooRich.torqueNm < balanced.torqueNm)
  assert.ok(lean.fuelRateGps < balanced.fuelRateGps)
  assert.ok(tooRich.fuelRateGps > balanced.fuelRateGps)
  assert.ok(tooRich.efficiency < balanced.efficiency)
  assert.equal(richPower.mixture.status, 'rich')
})

test('transmission kinematics exposes the low-gear torque and high-gear speed trade', () => {
  const shared = { engineRpm: 3000, engineTorque: 200, speed: 18, wheelRadius: 0.31 }
  const first = transmissionKinematics({ ...shared, gear: 1 })
  const fourth = transmissionKinematics({ ...shared, gear: 4 })
  const neutral = transmissionKinematics({ ...shared, gear: 0 })

  assert.ok(first.inputRpm > fourth.inputRpm)
  assert.ok(first.gearboxOutputTorque > fourth.gearboxOutputTorque)
  assert.ok(first.wheelTorque > fourth.wheelTorque)
  assert.equal(first.gearboxOutputTorque, 200 * getGearRatio(1) * DRIVETRAIN_EFFICIENCY)
  assert.equal(first.wheelTorque, first.gearboxOutputTorque * FINAL_DRIVE_RATIO)
  assert.equal(neutral.connected, false)
  assert.equal(neutral.inputRpm, 0)
  assert.equal(neutral.gearboxOutputTorque, 0)
  assertFiniteTree(first, 'transmissionKinematics.first')
})

test('transmission torque transfer fades without changing the selected ratio', () => {
  const engaged = transmissionKinematics({ engineRpm: 3200, engineTorque: 220, speed: 14, gear: 2, torqueTransfer: 1 })
  const releasing = transmissionKinematics({ engineRpm: 3200, engineTorque: 220, speed: 14, gear: 2, torqueTransfer: 0.25 })
  const open = transmissionKinematics({ engineRpm: 3200, engineTorque: 220, speed: 14, gear: 2, torqueTransfer: 0 })

  assert.equal(releasing.gearRatio, engaged.gearRatio)
  assert.equal(releasing.gearboxOutputTorque, engaged.gearboxOutputTorque * 0.25)
  assert.equal(open.gearboxOutputTorque, 0)
})

test('drivetrain torque transfer opens the road-force path during a shift', () => {
  const shared = { engineTorque: 210, gear: 2, speed: 12 }
  const engaged = drivetrainOutput({ ...shared, torqueTransfer: 1 })
  const applying = drivetrainOutput({ ...shared, torqueTransfer: 0.45 })
  const open = drivetrainOutput({ ...shared, torqueTransfer: 0 })

  assert.equal(applying.wheelTorque, engaged.wheelTorque * 0.45)
  assert.equal(open.wheelTorque, 0)
  assert.equal(open.tractionLimitedForce, 0)
  assert.equal(applying.torqueTransfer, 0.45)
})

test('neutral disconnects the engine while road loads slow a moving car', () => {
  const output = drivetrainOutput({
    engineTorque: 250,
    gear: 'neutral',
    speed: 20,
  })

  assert.equal(output.gearRatio, 0)
  assert.equal(output.wheelTorque, 0)
  assert.equal(output.driveForce, 0)
  assert.equal(output.tractionLimitedForce, 0)
  assert.ok(output.aeroDrag > 0)
  assert.ok(output.rollingResistance > 0)
  assert.ok(output.netForce < 0)
  assert.ok(output.acceleration < 0)
})

test('gearing multiplies torque and tire grip caps tractive force', () => {
  const ordinary = drivetrainOutput({
    engineTorque: 200,
    gear: 1,
    speed: 5,
    wheelRadius: 0.31,
  })
  const expectedWheelTorque = 200 * getGearRatio(1) * FINAL_DRIVE_RATIO * 0.9

  assert.ok(Math.abs(ordinary.wheelTorque - expectedWheelTorque) < 1e-10)
  assert.ok(ordinary.driveForce > 0)

  const excessive = drivetrainOutput({
    engineTorque: 1000,
    gear: 1,
    speed: 5,
    mass: 900,
  })
  assert.ok(Math.abs(excessive.driveForce) > excessive.tractionLimit)
  assert.ok(Math.abs(excessive.tractionLimitedForce) <= excessive.tractionLimit)
})

test('braking and an uphill grade reduce forward acceleration', () => {
  const base = {
    engineTorque: 180,
    gear: 3,
    speed: 15,
    mass: 1450,
  }
  const level = drivetrainOutput(base)
  const braking = drivetrainOutput({ ...base, brake: 0.7 })
  const uphill = drivetrainOutput({ ...base, roadGrade: 0.08 })

  assert.ok(braking.brakeForce > 0)
  assert.ok(braking.acceleration < level.acceleration)
  assert.ok(uphill.roadGradeForce < 0)
  assert.ok(uphill.acceleration < level.acceleration)
  assertFiniteTree(braking, 'drivetrainOutput')
})

test('brakes can hold a stationary car without pushing it backward', () => {
  const held = drivetrainOutput({
    engineTorque: 180,
    gear: 1,
    brake: 1,
    speed: 0,
  })
  assert.equal(held.netForce, 0)
  assert.equal(held.acceleration, 0)
})

test('steering uses bicycle-model radius and speed-dependent yaw', () => {
  const straight = steeringOutput({ speed: 20, steeringDeg: 0 })
  const leftSlow = steeringOutput({ speed: 5, steeringDeg: 12 })
  const leftFast = steeringOutput({ speed: 20, steeringDeg: 12 })
  const right = steeringOutput({ speed: 20, steeringDeg: -12 })

  assert.equal(straight.yawRate, 0)
  assert.ok(Number.isFinite(straight.turnRadius))
  assert.ok(leftSlow.turnRadius > 0)
  assert.ok(right.turnRadius < 0)
  assert.ok(Math.abs(leftFast.yawRate) > Math.abs(leftSlow.yawRate))
  assert.ok(Math.abs(leftFast.yawRate + right.yawRate) < 1e-12)
})

test('an open differential keeps carrier speed at the axle-speed average', () => {
  const straight = openDifferentialKinematics({ carrierSpeed: 200, turnBias: 0 })
  const leftTurn = openDifferentialKinematics({ carrierSpeed: 200, turnBias: 0.3 })
  const rightTurn = openDifferentialKinematics({ carrierSpeed: 200, turnBias: -0.3 })

  assert.deepEqual(straight, {
    carrierSpeed: 200,
    leftSpeed: 200,
    rightSpeed: 200,
    speedSplit: 0,
    turnBias: 0,
  })
  assert.equal(leftTurn.leftSpeed, 140)
  assert.equal(leftTurn.rightSpeed, 260)
  assert.equal((leftTurn.leftSpeed + leftTurn.rightSpeed) / 2, leftTurn.carrierSpeed)
  assert.equal(rightTurn.leftSpeed, 260)
  assert.equal(rightTurn.rightSpeed, 140)
  assert.equal((rightTurn.leftSpeed + rightTurn.rightSpeed) / 2, rightTurn.carrierSpeed)
})

test('open differential kinematics clamps and sanitizes teaching inputs', () => {
  const invalid = openDifferentialKinematics({
    carrierSpeed: Number.NaN,
    turnBias: Number.POSITIVE_INFINITY,
  })
  const clamped = openDifferentialKinematics({ carrierSpeed: 100, turnBias: 5 })

  assertFiniteTree(invalid, 'openDifferentialKinematics.invalid')
  assert.equal(invalid.carrierSpeed, 0)
  assert.equal(invalid.turnBias, 0)
  assert.equal(clamped.turnBias, 0.8)
  assert.equal((clamped.leftSpeed + clamped.rightSpeed) / 2, 100)
})

test('stepVehicle accelerates, turns, and reports current subsystem outputs', () => {
  const initial = {
    speed: 0,
    rpm: IDLE_RPM,
    heading: 0,
    x: 0,
    z: 0,
    gear: 1,
  }
  const next = stepVehicle(initial, {
    throttle: 1,
    brake: 0,
    steeringDeg: 10,
    gear: 1,
  }, 0.1)

  assert.ok(next.speed > initial.speed)
  assert.ok(next.rpm > initial.rpm)
  assert.ok(next.z > initial.z)
  assert.ok(next.heading > initial.heading)
  assert.equal(next.engine, next.outputs.engine)
  assert.equal(next.drivetrain, next.outputs.drivetrain)
  assert.equal(next.steering, next.outputs.steering)
  assert.deepEqual(initial, {
    speed: 0,
    rpm: IDLE_RPM,
    heading: 0,
    x: 0,
    z: 0,
    gear: 1,
  }, 'stepVehicle must not mutate its input state')
  assertFiniteTree(next, 'stepVehicle')
})

test('stepVehicle braking stops at zero instead of numerically reversing', () => {
  const stopped = stepVehicle({
    speed: 0.2,
    rpm: 1800,
    heading: 0,
    x: 0,
    z: 0,
    gear: 1,
  }, { throttle: 0, brake: 1, gear: 1 }, 0.25)

  assert.equal(stopped.speed, 0)
})

test('all public models sanitize non-finite simulator inputs', () => {
  assertFiniteTree(engineOutput({ rpm: Number.NaN, throttle: Number.POSITIVE_INFINITY }))
  assertFiniteTree(drivetrainOutput({
    engineTorque: Number.NaN,
    speed: Number.POSITIVE_INFINITY,
    mass: Number.NEGATIVE_INFINITY,
  }))
  assertFiniteTree(steeringOutput({
    speed: Number.NaN,
    steeringDeg: Number.POSITIVE_INFINITY,
  }))
  assertFiniteTree(openDifferentialKinematics({
    carrierSpeed: Number.NaN,
    turnBias: Number.POSITIVE_INFINITY,
  }))
  assertFiniteTree(stepVehicle({
    speed: Number.POSITIVE_INFINITY,
    rpm: Number.NaN,
    heading: Number.NEGATIVE_INFINITY,
    x: Number.NaN,
    z: Number.POSITIVE_INFINITY,
  }, {
    throttle: Number.NaN,
    brake: Number.POSITIVE_INFINITY,
    steeringDeg: Number.NEGATIVE_INFINITY,
  }, Number.POSITIVE_INFINITY))
})

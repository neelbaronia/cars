import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FINAL_DRIVE_RATIO,
  IDLE_RPM,
  clamp,
  drivetrainOutput,
  engineOutput,
  engineTorqueNm,
  getGearRatio,
  steeringOutput,
  stepVehicle,
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

export const MOTION_PARTS = [
  {
    id: 'metering', number: '01', short: 'AIR + FUEL', name: 'Throttle body + injectors', color: '#3f9a9d',
    summary: 'The accelerator requests torque by admitting more air and matching fuel.',
    detail: 'This modern engine uses a throttle body to meter air and electronic injectors to meter fuel. An older carburetor used fast air through a venturi to draw fuel from calibrated jets; an injected car does not use both systems at once.',
    studyFlow: ['Pedal request', 'Air + fuel metered', 'Charge enters cylinders'],
    internals: ['Air filter and intake duct', 'Throttle housing, butterfly, and actuator', 'Fuel rail and electronic injectors', 'Intake plenum and runners', 'Carburetor venturi and jet as an older alternative'],
  },
  {
    id: 'engine', number: '02', short: 'ENGINE', name: 'Pistons + crankshaft', color: '#e6543f',
    summary: 'Combustion pressure becomes a twisting crankshaft.',
    detail: 'Hot gas pushes four pistons. Their connecting rods push off-center on a shared flat-plane crankshaft, turning straight piston force into engine torque. Cylinders 1 and 4 move together, cylinders 2 and 3 move together in the opposite phase, and the common 1-3-4-2 firing order gives the crank a new power stroke every 180°.',
    studyFlow: ['Staggered gas-pressure pulses', 'Four pistons + connecting rods', 'Shared crankshaft torque'],
    internals: ['Shared cylinder head with intake and exhaust valves', 'Four spark plugs and combustion chambers', 'Four pistons with sealing rings', 'Four connecting rods and crank throws', 'Shared flat-plane crankshaft and output flywheel'],
  },
  {
    id: 'coupling', number: '03', short: 'COUPLING', name: 'Flywheel + coupling', color: '#d38d27',
    summary: 'The flywheel smooths pulses; a coupling connects the engine to the gearbox.',
    detail: 'A manual uses friction plates called a clutch. A conventional automatic usually uses a fluid torque converter and lock-up clutch. Either can let engine and wheel speed differ during launch.',
    studyFlow: ['Engine flexplate', 'Fluid coupling + lock-up', 'Gearbox input shaft'],
    internals: ['Flexplate', 'Converter impeller', 'Turbine', 'Stator and one-way clutch', 'Lock-up clutch', 'Transmission input shaft'],
  },
  {
    id: 'gearbox', number: '04', short: 'GEARBOX', name: 'Transmission gears', color: '#76569b',
    summary: 'Gears trade rotational speed for torque.',
    detail: 'A low gear turns the output fewer times per engine revolution, multiplying output torque. A high gear gives less multiplication and more wheel speed. Neutral interrupts the torque path.',
    studyFlow: ['Input rotation', 'Clutch packs + planetary set', 'Selected output ratio'],
    internals: ['Valve body, shift solenoids, and hydraulic passages', 'Hydraulic clutch and brake packs', 'Sun gear', 'Planet gears and carrier', 'Ring gear', 'Output shaft and bearings'],
  },
  {
    id: 'shaft', number: '05', short: 'DRIVESHAFT', name: 'Driveshaft', color: '#76569b',
    summary: 'A rotating tube carries gearbox torque toward the rear axle.',
    detail: 'This teaching sedan is rear-wheel drive, so it needs a long driveshaft. Front-wheel-drive cars usually package the gearbox and differential together and use shorter half-shafts instead.',
    studyFlow: ['Gearbox flange', 'Tube + joints carry twist', 'Pinion flange'],
    internals: ['Front and rear flanges', 'Universal joints', 'Splined slip joint', 'Hollow torque tube'],
  },
  {
    id: 'differential', number: '06', short: 'DIFFERENTIAL', name: 'Final drive + differential + axles', color: '#65468b',
    summary: 'A final reduction multiplies torque again and sends it left and right.',
    detail: 'The carrier turns at the average of the left and right axle speeds. Spider gears let one axle slow while the other speeds up by the same amount; an ideal open differential still supplies approximately equal torque to both sides, so one low-grip tire can limit both.',
    studyFlow: ['Pinion input', 'Ring + spider gears', 'Left and right axles'],
    internals: ['Drive pinion', 'Ring gear and final reduction', 'Carrier', 'Spider gears', 'Side gears', 'Axle shafts'],
  },
  {
    id: 'tires', number: '07', short: 'TIRES + ROAD', name: 'Driven tires + contact patches', color: '#28778c',
    summary: 'Wheel torque becomes a force where rubber meets the road.',
    detail: 'The tire pushes backward on the road. Static friction from the road pushes the tire—and the car—forward. If the requested force exceeds available grip, the tire spins instead of making more acceleration.',
    studyFlow: ['Axle torque', 'Wheel + tire deform', 'Road pushes car'],
    internals: ['Splined axle and hub', 'Wheel bearings', 'Rim', 'Tire carcass and reinforcing belts', 'Tread blocks and contact patch'],
  },
  {
    id: 'brakes', number: '08', short: 'BRAKES', name: 'Pedal + hydraulic disc brakes', color: '#2f8ea1',
    summary: 'Pedal force becomes hydraulic pressure, then clamping friction at four rotors.',
    detail: 'The pedal pushes a master-cylinder piston, raising pressure in nearly incompressible brake fluid. Separate lines carry that pressure to caliper pistons at each wheel. Pads squeeze both faces of each rotating disc, converting the car’s kinetic energy into heat; tire grip supplies the road force that actually slows the car.',
    studyFlow: ['Pedal drives master cylinder', 'Fluid pressure reaches calipers', 'Pads clamp rotors → heat'],
    internals: ['Brake pedal and pushrod', 'Fluid reservoir and tandem master cylinder', 'Split hydraulic circuits and rigid/flexible lines', 'Caliper pistons and friction pads', 'Ventilated brake rotors at all four wheels'],
  },
]

// A functional teaching chart for the four-speed automatic shown in the
// exploded gearbox study. Real transmissions use different names and exact
// clutch combinations, but the selection principle is the same: a valve body
// pressurizes a particular pair of friction elements to establish each ratio.
export const TEACHING_CLUTCH_ELEMENTS = Object.freeze({
  A: Object.freeze({
    id: 'A', label: 'Forward clutch', short: 'FORWARD', role: 'Drive element',
    detail: 'Connects the input shaft to the forward planetary path. It stays applied in G1–G3; the second active element changes the reaction constraint and therefore the ratio.',
  }),
  B: Object.freeze({
    id: 'B', label: 'Low brake', short: 'LOW BRAKE', role: 'Holding element',
    detail: 'Anchors the low-gear reaction path to the transmission case. With A applied, it creates the deepest 3.55:1 reduction and the most launch torque.',
  }),
  C: Object.freeze({
    id: 'C', label: 'Second-gear brake', short: 'SECOND BRAKE', role: 'Holding element',
    detail: 'Anchors the second-gear reaction path instead of B. With A applied, it creates the 2.19:1 ratio: less torque multiplication, but more output speed.',
  }),
  D: Object.freeze({
    id: 'D', label: 'Direct clutch', short: 'DIRECT', role: 'Drive/coupling element',
    detail: 'Couples another rotating planetary path instead of holding it stationary. With A it creates G3; with E it supplies the input side of G4.',
  }),
  E: Object.freeze({
    id: 'E', label: 'Fourth-gear brake', short: 'FOURTH BRAKE', role: 'Holding element',
    detail: 'Anchors the fourth-gear reaction path. With D applied, it creates the near-direct 1.16:1 cruise ratio. Because 1.16 is still above 1.00, this teaching gearbox does not include an overdrive ratio.',
  }),
})

export const TEACHING_GEAR_APPLICATIONS = Object.freeze({
  0: Object.freeze({
    gear: 0, circuits: Object.freeze([]), result: 'Torque path open',
    detail: 'No friction-element pair is clamped, so the engine-side input can turn without driving the output shaft.',
  }),
  1: Object.freeze({
    gear: 1,
    circuits: Object.freeze([TEACHING_CLUTCH_ELEMENTS.A, TEACHING_CLUTCH_ELEMENTS.B]),
    result: 'Largest reduction for launch',
    detail: 'A drives; B holds. The input turns 3.55 times for one output turn, giving about 3.55× ideal gearbox torque multiplication before losses. Best for starting; at a given road speed it also demands the highest engine RPM.',
  }),
  2: Object.freeze({
    gear: 2,
    circuits: Object.freeze([TEACHING_CLUTCH_ELEMENTS.A, TEACHING_CLUTCH_ELEMENTS.C]),
    result: 'Middle reduction for acceleration',
    detail: 'A drives; C holds. The input turns 2.19 times per output turn: less launch leverage than G1, but 62% more output speed at the same input RPM. Used once the car is moving.',
  }),
  3: Object.freeze({
    gear: 3,
    circuits: Object.freeze([TEACHING_CLUTCH_ELEMENTS.A, TEACHING_CLUTCH_ELEMENTS.D]),
    result: 'Smaller reduction for road speed',
    detail: 'A and D couple two rotating paths. The input turns 1.52 times per output turn: 44% more output speed than G2 at the same input RPM, with 31% less ideal torque multiplication.',
  }),
  4: Object.freeze({
    gear: 4,
    circuits: Object.freeze([TEACHING_CLUTCH_ELEMENTS.D, TEACHING_CLUTCH_ELEMENTS.E]),
    result: 'Near-direct ratio for cruise',
    detail: 'D drives; E holds. The input turns 1.16 times per output turn: 31% more output speed than G3 at the same input RPM, with 24% less ideal torque multiplication. Best for low-RPM cruising.',
  }),
})

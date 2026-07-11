export const MOTION_PARTS = [
  {
    id: 'metering', number: '01', short: 'AIR + FUEL', name: 'Throttle body + injectors', color: '#3f9a9d',
    summary: 'The accelerator requests torque by admitting more air and matching fuel.',
    detail: 'This modern engine uses a throttle body to meter air and electronic injectors to meter fuel. An older carburetor used fast air through a venturi to draw fuel from calibrated jets; an injected car does not use both systems at once.',
  },
  {
    id: 'engine', number: '02', short: 'ENGINE', name: 'Pistons + crankshaft', color: '#e6543f',
    summary: 'Combustion pressure becomes a twisting crankshaft.',
    detail: 'Hot gas pushes the pistons. Connecting rods push off-center on the crank throws, turning straight piston force into engine torque. Several cylinders overlap their power strokes to keep the shaft turning.',
  },
  {
    id: 'coupling', number: '03', short: 'COUPLING', name: 'Flywheel + coupling', color: '#d38d27',
    summary: 'The flywheel smooths pulses; a coupling connects the engine to the gearbox.',
    detail: 'A manual uses friction plates called a clutch. A conventional automatic usually uses a fluid torque converter and lock-up clutch. Either can let engine and wheel speed differ during launch.',
  },
  {
    id: 'gearbox', number: '04', short: 'GEARBOX', name: 'Transmission gears', color: '#76569b',
    summary: 'Gears trade rotational speed for torque.',
    detail: 'A low gear turns the output fewer times per engine revolution, multiplying output torque. A high gear gives less multiplication and more wheel speed. Neutral interrupts the torque path.',
  },
  {
    id: 'shaft', number: '05', short: 'DRIVESHAFT', name: 'Driveshaft', color: '#76569b',
    summary: 'A rotating tube carries gearbox torque toward the rear axle.',
    detail: 'This teaching sedan is rear-wheel drive, so it needs a long driveshaft. Front-wheel-drive cars usually package the gearbox and differential together and use shorter half-shafts instead.',
  },
  {
    id: 'differential', number: '06', short: 'DIFFERENTIAL', name: 'Final drive + differential + axles', color: '#65468b',
    summary: 'A final reduction multiplies torque again and sends it left and right.',
    detail: 'The differential drives both axles while allowing the two wheels to rotate at different speeds in a corner. The axle shafts carry that torque to the wheel hubs.',
  },
  {
    id: 'tires', number: '07', short: 'TIRES + ROAD', name: 'Driven tires + contact patches', color: '#28778c',
    summary: 'Wheel torque becomes a force where rubber meets the road.',
    detail: 'The tire pushes backward on the road. Static friction from the road pushes the tire—and the car—forward. If the requested force exceeds available grip, the tire spins instead of making more acceleration.',
  },
]

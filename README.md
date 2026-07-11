# How a Car Works

An interactive, first-principles introduction to a gasoline car for curious learners. The site follows energy from a rear fuel tank through a four-stroke engine, transmission, tires, steering, suspension, and hydraulic brakes.

**Live demo:** [cars.nbaronia.com](https://cars.nbaronia.com)

The reference vehicle is a simplified front-engine, rear-wheel-drive automatic sedan. Real cars rearrange these systems, but the underlying mechanics are the same.

## The three labs

- **Engine mechanics** — trace fuel and air, scrub through all 720° of a four-stroke cycle, disable spark, and connect pressure to torque and power.
- **Making it move** — operate a live rolling chassis, change gears, steer, brake, and inspect the forces between tires and road.
- **Full car simulator** — drive with WASD or touch controls, switch between drive/neutral/reverse, explode the car, and isolate fuel, powertrain, brake-fluid, steering, suspension, or road-force views.

The simulations are intentionally approachable teaching models, not vehicle-engineering or safety tools.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the URL printed by Vite.

## Checks

```bash
npm test
npm run lint
npm run build
```

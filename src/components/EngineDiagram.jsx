function DiagramLabel({ x, y, width, children, tone = 'ink' }) {
  return (
    <g className={`diagram-label diagram-label--${tone}`} transform={`translate(${x} ${y})`}>
      <rect width={width} height="34" rx="3" />
      <text x={width / 2} y="22" textAnchor="middle">{children}</text>
    </g>
  )
}

export function EngineDiagram({ progress, throttle, rpm, spark, mode, pressureBar, pistonForce }) {
  const stroke = Math.floor(progress) % 4
  const within = progress - Math.floor(progress)
  const radians = progress * Math.PI
  const crankCenter = { x: 412, y: 485 }
  const crankRadius = 56
  const rodLength = 164
  const crankPin = {
    x: crankCenter.x + Math.sin(radians) * crankRadius,
    y: crankCenter.y - Math.cos(radians) * crankRadius,
  }
  const pistonPinY = crankPin.y - Math.sqrt(rodLength ** 2 - (crankPin.x - crankCenter.x) ** 2)
  const pistonTop = pistonPinY - 24
  const load = throttle > 0 ? throttle : rpm <= 950 ? 8 : 0
  const firing = spark && load > 0
  const intakeOpen = stroke === 0
  const exhaustOpen = stroke === 3
  const chargeColor = stroke === 0 ? '#77bdd2' : stroke === 1 ? '#a98ac1' : stroke === 2 && firing ? '#e6543f' : '#d6a157'
  const forceDirection = pistonForce >= 0 ? 1 : -1
  const forceLength = Math.min(112, Math.max(22, Math.abs(pistonForce) / 95))
  const fuelFlowing = stroke === 0 && load > 0 && mode !== 'energy'
  const airFlowing = stroke === 0 && mode !== 'energy'
  const exhaustFlowing = stroke === 3 && mode !== 'energy'
  const chamberHeight = Math.max(18, pistonTop - 202)
  const mixtureVisible = load > 0 && (stroke === 0 || stroke === 1 || (stroke === 2 && within < 0.16))
  const mixtureDotCount = 6 + Math.round(load / 7)
  const mixtureDots = Array.from({ length: mixtureDotCount }, (_, index) => ({
    x: 354 + (index * 37) % 116,
    y: 211 + (((index * 47) % 100) / 100) * Math.max(8, chamberHeight - 18),
    fuel: index % 3 === 0,
  }))
  const burnProgress = stroke === 2 && firing ? Math.min(1, within / 0.62) : 0
  const shaftDegrees = progress * 180
  const wheelDegrees = progress * 78
  const fuelDropletCount = fuelFlowing ? Math.max(1, Math.ceil(load / 20)) : 0
  const sprayParticleCount = fuelFlowing ? Math.max(1, Math.ceil(load / 25)) : 0
  const fuelTravelSeconds = Math.max(1.15, 3.5 - load * 0.022)
  const throttlePlateDegrees = 90 - throttle * 0.9

  return (
    <div className={`engine-diagram engine-diagram--${mode}`}>
      <svg viewBox="0 0 900 650" role="img" aria-label="Animated schematic showing the fuel path, four-stroke cylinder, crankshaft, drivetrain, driven wheel, and forward road force">
        <defs>
          <marker id="diagram-arrow-coral" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#e6543f" />
          </marker>
          <marker id="diagram-arrow-violet" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#76569b" />
          </marker>
          <marker id="diagram-arrow-violet-small" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#76569b" />
          </marker>
          <marker id="diagram-arrow-coral-small" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#e6543f" />
          </marker>
          <marker id="diagram-arrow-teal-small" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#28778c" />
          </marker>
          <pattern id="paper-grid" width="42" height="42" patternUnits="userSpaceOnUse">
            <path d="M42 0H0V42" fill="none" stroke="#3f9a9d" strokeOpacity=".12" strokeWidth="1" />
          </pattern>
          <radialGradient id="combustion-glow" cx="42%" cy="18%" r="78%">
            <stop offset="0" stopColor="#fff4a3" stopOpacity=".98" />
            <stop offset=".34" stopColor="#f2c348" stopOpacity=".92" />
            <stop offset=".72" stopColor="#e6543f" stopOpacity=".78" />
            <stop offset="1" stopColor="#b94335" stopOpacity=".16" />
          </radialGradient>
          <clipPath id="diagram-chamber-clip">
            <rect x="342" y="202" width="140" height={chamberHeight} rx="12" />
          </clipPath>
        </defs>

        <rect width="900" height="650" fill="#f3e8d8" />
        <rect width="900" height="650" fill="url(#paper-grid)" />
        <text className="diagram-schematic-note" x="72" y="104">MECHANICAL SCHEMATIC · COMPONENTS NOT TO SCALE</text>
        <text className="diagram-speed-note" x="828" y="104" textAnchor="end">ACTUAL · {(rpm / 60).toFixed(1)} CRANK REV/S · {(120000 / rpm).toFixed(1)} MS/CYCLE</text>
        <g className="diagram-material-key" transform="translate(610 145)">
          <circle cx="0" cy="0" r="6" className="is-fuel" /><text x="12" y="4">FUEL</text>
          <circle cx="72" cy="0" r="6" className="is-air" /><text x="84" y="4">AIR</text>
          <circle cx="132" cy="0" r="6" className="is-burn" /><text x="144" y="4">BURN</text>
        </g>

        <g className={`diagram-paths ${mode === 'cycle' ? 'is-muted' : ''}`}>
          <path className={`diagram-pipe diagram-pipe--air ${airFlowing ? 'is-flowing' : ''}`} d="M72 188 H230 Q275 188 318 214 L350 228"
            style={{ '--diagram-flow-duration': `${Math.max(.42, 1.05 - load * .006)}s`, strokeWidth: 8 + load * .055 }} />
          <path className={`diagram-pipe diagram-pipe--fuel ${fuelFlowing ? 'is-flowing' : ''}`} d="M724 468 Q640 435 604 365 Q558 272 454 176"
            style={{ '--diagram-flow-duration': `${Math.max(.45, 1.1 - load * .006)}s`, strokeWidth: 8 + load * .05 }} />
          <path className={`diagram-pipe diagram-pipe--exhaust ${exhaustFlowing ? 'is-flowing' : ''}`} d="M491 226 Q555 226 585 263 H798" />
          <g className="diagram-throttle-body" transform="translate(248 188)">
            <circle r="16" />
            <line x1="-14" y1="0" x2="14" y2="0" transform={`rotate(${throttlePlateDegrees})`} />
            <text x="0" y="34" textAnchor="middle">{throttle}% OPEN</text>
          </g>
          {Array.from({ length: fuelDropletCount }, (_, index) => (
            <circle key={index} r={5 + load * .025} className="diagram-fuel-droplet">
              <animateMotion dur={`${fuelTravelSeconds}s`} begin={`${index * -(fuelTravelSeconds / Math.max(1, fuelDropletCount))}s`} repeatCount="indefinite"
                path="M724 468 Q640 435 604 365 Q558 272 454 176" />
            </circle>
          ))}
          <circle cx="671" cy="447" r="15" className="diagram-pump" />
          <text className="diagram-small-label" x="671" y="477" textAnchor="middle">PUMP</text>
          <DiagramLabel x={72} y={128} width={174} tone="air">AIR FILTER + THROTTLE</DiagramLabel>
          <DiagramLabel x={655} y={211} width={166} tone="exhaust">CATALYST → MUFFLER</DiagramLabel>
          <rect x="664" y="388" width="145" height="82" rx="11" className="diagram-tank" />
          <text className="diagram-tank-title" x="736" y="434" textAnchor="middle">FUEL TANK</text>
          <path d="M454 176 l-14 23 h28z" className="diagram-injector" />
          <text className="diagram-small-label" x="482" y="176">PORT INJECTOR</text>
          {fuelFlowing && (
            <g className="diagram-fuel-spray">
              <path d="M454 192 Q424 202 389 224" />
              {Array.from({ length: sprayParticleCount }, (_, index) => (
                <circle key={index} r="4">
                  <animateMotion dur={`${Math.max(.35, .9 - load * .005)}s`} begin={`${index * -0.18}s`} repeatCount="indefinite" path="M454 192 Q424 202 389 224" />
                </circle>
              ))}
              <text x="500" y="205">FUEL DOSE · {throttle}% REQUEST</text>
            </g>
          )}
        </g>

        <g className="diagram-engine">
          <rect x="330" y="188" width="164" height="282" rx="7" className="diagram-cylinder" />
          <rect x="342" y="202" width="140" height={chamberHeight} rx="12" fill={chargeColor} opacity={mode === 'energy' ? '.72' : '.42'} />
          {mixtureVisible && (
            <g className="diagram-mixture" clipPath="url(#diagram-chamber-clip)">
              {mixtureDots.map((dot, index) => (
                <circle key={index} cx={dot.x} cy={dot.y} r={dot.fuel ? 4.5 : 3.2}
                  className={dot.fuel ? 'diagram-mixture-dot diagram-mixture-dot--fuel' : 'diagram-mixture-dot diagram-mixture-dot--air'} />
              ))}
            </g>
          )}
          {burnProgress > 0 && (
            <g className="diagram-combustion" clipPath="url(#diagram-chamber-clip)">
              <circle cx="417" cy="204" r={12 + burnProgress * (85 + load * .6)} fill="url(#combustion-glow)"
                className="diagram-combustion-front" opacity={.58 + load * .004} />
              {within < .28 && <path className="diagram-flame-core" d="M417 198c-24 28-17 50 0 62 18-12 25-35 7-54 1 14-7 18-12 25 2-14-2-22 5-33z" />}
            </g>
          )}
          {burnProgress > 0 && <text className="diagram-combustion-label" x="512" y="236">{throttle}% REQUEST → CONTROLLED BURN → HOT GAS</text>}
          <text className="diagram-pressure" x="412" y="236" textAnchor="middle">{pressureBar.toFixed(1)} BAR</text>

          <g className={`diagram-valve ${intakeOpen ? 'is-open' : ''}`} transform={`translate(378 ${intakeOpen ? 8 : 0})`}>
            <line x1="0" y1="150" x2="0" y2="201" /><path d="M-15 202h30l-7 12H-8z" />
          </g>
          <g className={`diagram-valve diagram-valve--exhaust ${exhaustOpen ? 'is-open' : ''}`} transform={`translate(456 ${exhaustOpen ? 8 : 0})`}>
            <line x1="0" y1="150" x2="0" y2="201" /><path d="M-15 202h30l-7 12H-8z" />
          </g>
          <text className="diagram-small-label" x="350" y="142">INTAKE</text>
          <text className="diagram-small-label" x="451" y="142">EXHAUST</text>

          <line x1="417" y1="151" x2="417" y2="197" className="diagram-spark-plug" />
          {firing && stroke === 2 && within < .2 && <path className="diagram-spark" d="M417 190l-12 18 13-3-8 20 24-26-13 3 8-16z" />}

          <rect x="342" y={pistonTop} width="140" height="49" rx="5" className="diagram-piston" />
          <line x1="412" y1={pistonPinY} x2={crankPin.x} y2={crankPin.y} className="diagram-rod" />
          <circle cx="412" cy={pistonPinY} r="9" className="diagram-pin" />
          <circle cx={crankCenter.x} cy={crankCenter.y} r={crankRadius} className="diagram-crank" />
          <line x1={crankCenter.x} y1={crankCenter.y} x2={crankPin.x} y2={crankPin.y} className="diagram-crank-arm" />
          <circle cx={crankPin.x} cy={crankPin.y} r="11" className="diagram-pin" />
          <line x1="300" y1={crankCenter.y} x2="536" y2={crankCenter.y} className="diagram-shaft" />
          <text className="diagram-small-label" x="412" y="577" textAnchor="middle">CRANKSHAFT · TWO TURNS PER CYCLE</text>
        </g>

        <g className={`diagram-drivetrain ${burnProgress > 0 ? 'is-driven' : ''}`} role="group"
          aria-label="Crankshaft torque passes through a coupling and gearbox, driveshaft, differential, axle, and driven wheels">
          <text className="diagram-drivetrain-label" x="592" y="443" textAnchor="middle">COUPLING + GEARBOX</text>
          <path className="diagram-power-link" d="M536 485H552" />
          <path className="diagram-coupling" d="M550 466v38m9-38v38" />
          <rect className="diagram-gearbox-shell" x="564" y="454" width="82" height="62" rx="8" />
          <g className="diagram-gear" transform={`rotate(${shaftDegrees} 590 483)`}>
            <circle cx="590" cy="483" r="18" /><path d="M590 465v36M572 483h36" />
          </g>
          <g className="diagram-gear" transform={`rotate(${-shaftDegrees * 1.28} 619 489)`}>
            <circle cx="619" cy="489" r="13" /><path d="M619 476v26M606 489h26" />
          </g>

          <path className="diagram-power-link diagram-driveshaft" d="M646 489 688 524"
            markerEnd={`url(#diagram-arrow-${burnProgress > 0 ? 'coral' : 'violet'}-small)`} />
          <text className="diagram-drivetrain-label" x="653" y="542" textAnchor="middle">DRIVESHAFT</text>

          <g className="diagram-differential" transform={`translate(718 535) rotate(${-wheelDegrees})`}>
            <circle r="25" /><path d="M-15 0 0-15 15 0 0 15Z" /><circle r="6" />
          </g>
          <text className="diagram-drivetrain-label" x="718" y="579" textAnchor="middle">DIFFERENTIAL</text>
          <path className="diagram-power-link diagram-axle" d="M743 535H790"
            markerEnd={`url(#diagram-arrow-${burnProgress > 0 ? 'coral' : 'violet'}-small)`} />

          <g className="diagram-drive-wheel" transform={`translate(832 535) rotate(${wheelDegrees})`}>
            <circle className="diagram-drive-tire" r="40" />
            <circle className="diagram-drive-rim" r="21" />
            <path className="diagram-drive-spokes" d="M-20 0h40M0-20v40M-14-14l28 28M14-14l-28 28" />
            <circle className="diagram-drive-hub" r="6" />
          </g>
          <text className="diagram-drivetrain-label" x="832" y="589" textAnchor="middle">DRIVEN WHEELS</text>
          <path className="diagram-road" d="M774 579H890" />
          <text className="diagram-tire-push-label" x="777" y="603" textAnchor="end">← TIRE PUSHES ROAD BACK</text>
          <path className="diagram-road-force" d="M780 614H875" markerEnd="url(#diagram-arrow-teal-small)" />
          <text className="diagram-road-force-label" x="875" y="635" textAnchor="end">ROAD PUSHES CAR FORWARD</text>
        </g>

        <g className="diagram-energy">
          <line x1="514" y1={pistonPinY} x2="514" y2={pistonPinY + forceDirection * forceLength}
            className="diagram-force" markerEnd="url(#diagram-arrow-coral)" />
          <text className="diagram-force-label" x="535" y={pistonPinY + forceDirection * forceLength / 2}>NET GAS FORCE</text>
          <path d="M356 522 A78 78 0 0 0 471 530" className="diagram-torque" markerEnd="url(#diagram-arrow-violet)" />
          <text className="diagram-torque-label" x="410" y="627" textAnchor="middle">TORQUE</text>
          {stroke === 2 && firing && <g className="diagram-heat"><path d="M521 248q18-18 0-36" /><path d="M550 270q18-18 0-36" /><path d="M579 253q18-18 0-36" /></g>}
        </g>

        <g className="diagram-cycle-key" transform="translate(78 590)">
          {['INTAKE', 'COMPRESSION', firing ? 'POWER' : 'EXPANSION', 'EXHAUST'].map((label, index) => (
            <g key={label} transform={`translate(${index * 153} 0)`} className={stroke === index ? 'is-active' : ''}>
              <circle cx="8" cy="8" r="8" /><text x="24" y="13">{label}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}

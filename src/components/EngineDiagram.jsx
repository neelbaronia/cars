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
  const mixtureDots = Array.from({ length: 12 }, (_, index) => ({
    x: 354 + (index * 37) % 116,
    y: 211 + (((index * 47) % 100) / 100) * Math.max(8, chamberHeight - 18),
    fuel: index % 3 === 0,
  }))
  const burnProgress = stroke === 2 && firing ? Math.min(1, within / 0.62) : 0

  return (
    <div className={`engine-diagram engine-diagram--${mode}`}>
      <svg viewBox="0 0 900 650" role="img" aria-label="Animated cutaway showing the fuel path, four-stroke cylinder, piston, connecting rod, crankshaft, and exhaust path">
        <defs>
          <marker id="diagram-arrow-coral" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#e6543f" />
          </marker>
          <marker id="diagram-arrow-violet" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#76569b" />
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
        <path className="diagram-car-outline" d="M78 520h714l-22-165-100-36-87-136H260l-82 134-76 38z" />
        <text className="diagram-orientation" x="86" y="552">FRONT OF CAR</text>
        <text className="diagram-orientation" x="695" y="552">REAR OF CAR</text>
        <g className="diagram-material-key" transform="translate(610 145)">
          <circle cx="0" cy="0" r="6" className="is-fuel" /><text x="12" y="4">FUEL</text>
          <circle cx="72" cy="0" r="6" className="is-air" /><text x="84" y="4">AIR</text>
          <circle cx="132" cy="0" r="6" className="is-burn" /><text x="144" y="4">BURN</text>
        </g>

        <g className={`diagram-paths ${mode === 'cycle' ? 'is-muted' : ''}`}>
          <path className={`diagram-pipe diagram-pipe--air ${airFlowing ? 'is-flowing' : ''}`} d="M72 188 H230 Q275 188 318 214 L350 228" />
          <path className={`diagram-pipe diagram-pipe--fuel ${fuelFlowing ? 'is-flowing' : ''}`} d="M724 468 Q640 435 604 365 Q558 272 454 176" />
          <path className={`diagram-pipe diagram-pipe--exhaust ${exhaustFlowing ? 'is-flowing' : ''}`} d="M491 226 Q555 226 585 263 H798" />
          {fuelFlowing && [0, 1, 2].map((index) => (
            <circle key={index} r="7" className="diagram-fuel-droplet">
              <animateMotion dur="2.8s" begin={`${index * -0.92}s`} repeatCount="indefinite"
                path="M724 468 Q640 435 604 365 Q558 272 454 176" />
            </circle>
          ))}
          <circle cx="671" cy="447" r="15" className="diagram-pump" />
          <text className="diagram-small-label" x="671" y="477" textAnchor="middle">PUMP</text>
          <DiagramLabel x={72} y={128} width={174} tone="air">AIR FILTER + THROTTLE</DiagramLabel>
          <DiagramLabel x={642} y={510} width={160} tone="fuel">FUEL TANK</DiagramLabel>
          <DiagramLabel x={655} y={211} width={166} tone="exhaust">CATALYST → MUFFLER</DiagramLabel>
          <rect x="664" y="388" width="145" height="82" rx="11" className="diagram-tank" />
          <path d="M454 176 l-14 23 h28z" className="diagram-injector" />
          <text className="diagram-small-label" x="482" y="176">PORT INJECTOR</text>
          {fuelFlowing && (
            <g className="diagram-fuel-spray">
              <path d="M454 192 Q424 202 389 224" />
              {[0, 1, 2, 3].map((index) => (
                <circle key={index} r="4">
                  <animateMotion dur=".72s" begin={`${index * -0.18}s`} repeatCount="indefinite" path="M454 192 Q424 202 389 224" />
                </circle>
              ))}
              <text x="500" y="205">FUEL SPRAY</text>
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
              <circle cx="417" cy="204" r={12 + burnProgress * 145} fill="url(#combustion-glow)" className="diagram-combustion-front" />
              {within < .28 && <path className="diagram-flame-core" d="M417 198c-24 28-17 50 0 62 18-12 25-35 7-54 1 14-7 18-12 25 2-14-2-22 5-33z" />}
            </g>
          )}
          {burnProgress > 0 && <text className="diagram-combustion-label" x="512" y="236">CONTROLLED BURN → HOT GAS</text>}
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

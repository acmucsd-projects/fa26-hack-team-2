import './Bubble.css'

function Bubble({ size, color, circles }) {
  return (
    <div
      className="bubble"
      style={{ width: size, height: size, background: `var(--bubble-${color})` }}
    >
      {circles.map((circle) => {
        const percent = Math.min(circle.percent, 100)
        const diameter = circle.maxSize * Math.sqrt(percent / 100)
        return (
          <div
            key={circle.name}
            className="bubble-inner"
            style={{
              width: `${diameter}%`,
              height: `${diameter}%`,
              left: `${circle.x}%`,
              top: `${circle.y}%`,
              background: `var(--bubble-${circle.color})`,
            }}
          />
        )
      })}
    </div>
  )
}

export default Bubble
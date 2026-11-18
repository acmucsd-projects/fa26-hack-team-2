import './DayTile.css'

function DayTile({ dayName, date, state, caloriesPercent, budgetPercent, onClick }) {
  const showFill = state !== 'future'

  return (
    <button className={`day-tile day-tile-${state}`} onClick={onClick}>
      <span className="day-tile-name">{dayName}</span>
      <span className="day-tile-date">{date}</span>
      <div className="day-tile-bars">
        <div className="day-tile-bar day-tile-bar-calories">
          {showFill && (
            <div className="day-tile-fill" style={{ width: `${Math.min(caloriesPercent, 100)}%` }} />
          )}
        </div>
        <div className="day-tile-bar day-tile-bar-budget">
          {showFill && (
            <div className="day-tile-fill" style={{ width: `${Math.min(budgetPercent, 100)}%` }} />
          )}
        </div>
      </div>
    </button>
  )
}

export default DayTile
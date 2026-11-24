import './DayTile.css'

function percentOf(value, goal) {
  if (!goal) return 0
  return Math.min(((value ?? 0) / goal) * 100, 100)
}

function DayTile({ dayName, date, state, isSelected = false, calories, calorieGoal, spentCents, budgetCents, onClick }) {
  const showFill = state !== 'future'
  const className = `day-tile day-tile-${state}${isSelected ? ' day-tile-selected' : ''}`

  return (
    <button className={className} onClick={onClick} aria-pressed={isSelected}>
      <span className="day-tile-name">{dayName}</span>
      <span className="day-tile-date">{date}</span>
      <div className="day-tile-bars">
        <div className="day-tile-bar day-tile-bar-calories">
          {showFill && (
            <div className="day-tile-fill" style={{ width: `${percentOf(calories, calorieGoal)}%` }} />
          )}
        </div>
        <div className="day-tile-bar day-tile-bar-budget">
          {showFill && (
            <div className="day-tile-fill" style={{ width: `${percentOf(spentCents, budgetCents)}%` }} />
          )}
        </div>
      </div>
    </button>
  )
}

export default DayTile
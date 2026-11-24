import DayTile from '../DayTile/DayTile'
import arrowLeft from '../../assets/arrow-left.svg'
import arrowRight from '../../assets/arrow-right.svg'
import './WeekStrip.css'

function WeekStrip({ title = 'This week', rangeLabel, days, goals, selectedDate, onPrevWeek, onNextWeek, onDayClick }) {
  return (
    <div className="week-strip">
      <div className="week-strip-header">
        <div className="week-strip-nav">
          <button className="week-strip-arrow" onClick={onPrevWeek} aria-label="Previous week">
            <img src={arrowLeft} alt="" />
          </button>
          <span className="week-strip-title">{title}</span>
          <span className="week-strip-range">{rangeLabel}</span>
          <button className="week-strip-arrow" onClick={onNextWeek} aria-label="Next week">
            <img src={arrowRight} alt="" />
          </button>
        </div>

        <div className="week-strip-legend">
          <span className="week-strip-legend-item">
            <span className="week-strip-swatch week-strip-swatch-calories" />
            Calories
          </span>
          <span className="week-strip-legend-item">
            <span className="week-strip-swatch week-strip-swatch-budget" />
            Budget
          </span>
        </div>
      </div>

      <div className="week-strip-days">
        {days.map((day) => (
          <DayTile
            key={day.date}
            dayName={day.dayName}
            date={day.dayNumber}
            state={day.state}
            isSelected={day.date === selectedDate}
            calories={day.totals.calories}
            calorieGoal={goals.calories}
            spentCents={day.totals.spentCents}
            budgetCents={goals.budgetCents}
            onClick={() => onDayClick(day)}
          />
        ))}
      </div>
    </div>
  )
}

export default WeekStrip
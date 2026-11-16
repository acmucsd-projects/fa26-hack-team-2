import Bubble from '../Bubble/Bubble'
import titleCalories from '../../assets/title-calories.svg'
import titleBudget from '../../assets/title-budget.svg'
import titleMacros from '../../assets/title-macros.svg'
import './StatBubbles.css'

function percent(item) {
  return (item.current / item.goal) * 100
}

function StatBubbles({ calories, budget, macros }) {
  return (
    <div className="stat-bubbles">
      <div className="stat-bubbles-item stat-bubbles-calories">
        <Bubble
          size={280}
          color="yellow"
          circles={[
            { name: 'eaten', color: 'teal', percent: percent(calories), maxSize: 70, x: 66, y: 40 },
          ]}
        />
      </div>

      <div className="stat-bubbles-item stat-bubbles-budget">
        <Bubble
          size={224}
          color="coral"
          circles={[
            { name: 'spent', color: 'blue', percent: percent(budget), maxSize: 57, x: 57, y: 60 },
          ]}
        />
      </div>

      <div className="stat-bubbles-item stat-bubbles-macros">
        <Bubble
          size={280}
          color="pink"
          circles={[
            { name: 'carbs', color: 'yellow', percent: percent(macros.carbs), maxSize: 58, x: 46, y: 30 },
            { name: 'protein', color: 'teal', percent: percent(macros.protein), maxSize: 26, x: 32, y: 64 },
            { name: 'fat', color: 'blue', percent: percent(macros.fat), maxSize: 26, x: 62, y: 64 },
          ]}
        />
      </div>

      <img src={titleCalories} alt="" className="stat-bubbles-title stat-bubbles-title-calories" />
      <img src={titleBudget} alt="" className="stat-bubbles-title stat-bubbles-title-budget" />
      <img src={titleMacros} alt="" className="stat-bubbles-title stat-bubbles-title-macros" />
    </div>
  )
}

export default StatBubbles
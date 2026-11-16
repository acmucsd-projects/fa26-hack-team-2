import { useState } from 'react'
import Bubble from '../Bubble/Bubble'
import titleCalories from '../../assets/title-calories.svg'
import titleBudget from '../../assets/title-budget.svg'
import titleMacros from '../../assets/title-macros.svg'
import './StatBubbles.css'

function percent(item) {
  return (item.current / item.goal) * 100
}

function StatBubbles({ calories, budget, macros }) {
  const [hovered, setHovered] = useState(null)

  const bubbles = [
    {
      key: 'calories',
      label: 'Calories',
      size: 280,
      color: 'yellow',
      circles: [
        { name: 'eaten', color: 'teal', percent: percent(calories), maxSize: 70, x: 66, y: 40 },
      ],
    },
    {
      key: 'budget',
      label: 'Budget',
      size: 224,
      color: 'coral',
      circles: [
        { name: 'spent', color: 'blue', percent: percent(budget), maxSize: 57, x: 57, y: 60 },
      ],
    },
    {
      key: 'macros',
      label: 'Macros',
      size: 280,
      color: 'pink',
      circles: [
        { name: 'carbs', color: 'yellow', percent: percent(macros.carbs), maxSize: 58, x: 46, y: 30 },
        { name: 'protein', color: 'teal', percent: percent(macros.protein), maxSize: 26, x: 32, y: 64 },
        { name: 'fat', color: 'blue', percent: percent(macros.fat), maxSize: 26, x: 62, y: 64 },
      ],
    },
  ]

  return (
    <div className={hovered ? 'stat-bubbles stat-bubbles-hovering' : 'stat-bubbles'}>
      {bubbles.map((bubble) => (
        <div
          key={bubble.key}
          className={`stat-bubbles-item stat-bubbles-${bubble.key} ${hovered === bubble.key ? 'stat-bubbles-item-active' : ''}`}
          onMouseEnter={() => setHovered(bubble.key)}
          onMouseLeave={() => setHovered(null)}
        >
          <Bubble size={bubble.size} color={bubble.color} circles={bubble.circles} />
          {hovered === bubble.key && (
            <span className="stat-bubbles-label">{bubble.label}</span>
          )}
        </div>
      ))}

      <img src={titleCalories} alt="" className="stat-bubbles-title stat-bubbles-title-calories" />
      <img src={titleBudget} alt="" className="stat-bubbles-title stat-bubbles-title-budget" />
      <img src={titleMacros} alt="" className="stat-bubbles-title stat-bubbles-title-macros" />
    </div>
  )
}

export default StatBubbles
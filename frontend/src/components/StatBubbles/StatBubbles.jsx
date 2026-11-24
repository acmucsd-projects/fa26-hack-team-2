import { useState } from 'react'
import Bubble from '../Bubble/Bubble'
import DetailsPopup from '../DetailsPopup/DetailsPopup'
import titleCalories from '../../assets/title-calories.svg'
import titleBudget from '../../assets/title-budget.svg'
import titleMacros from '../../assets/title-macros.svg'
import './StatBubbles.css'

function percentOf(value, goal) {
  if (!goal) return 0
  return ((value ?? 0) / goal) * 100
}

function dollars(cents) {
  return `$${((cents ?? 0) / 100).toFixed(2)}`
}

function buildDetails(stats, goals, meals, week) {
  const caloriesLeft = Math.round((goals.calories ?? 0) - (stats.calories ?? 0))
  const centsLeft = (goals.budgetCents ?? 0) - (stats.spentCents ?? 0)

  return {
    calories: {
      amount: Math.round(stats.calories ?? 0).toLocaleString(),
      amountLabel: `of ${(goals.calories ?? 0).toLocaleString()} cal`,
      lines: meals.map((meal) => ({
        label: meal.locationName ? `${meal.name} · ${meal.locationName}` : meal.name,
        value: meal.calories == null ? '? cal' : `${Math.round(meal.calories)} cal`,
      })),
      total: { label: 'Left today', value: `${caloriesLeft.toLocaleString()} cal` },
    },
    budget: {
      amount: dollars(stats.spentCents),
      amountLabel: `of ${dollars(goals.budgetCents)}`,
      lines: meals.map((meal) => ({
        label: meal.locationName ? `${meal.name} · ${meal.locationName}` : meal.name,
        value: meal.priceCents == null ? '?' : dollars(meal.priceCents),
      })),
      total: week
        ? { label: 'This week', value: `${dollars(week.spentCents)} / ${dollars(week.budgetCents)}` }
        : { label: 'Left today', value: dollars(centsLeft) },
    },
    macros: {
      lines: [
        { label: 'Protein', value: `${Math.round(stats.proteinG ?? 0)} / ${goals.proteinG ?? 0} g` },
        { label: 'Carbs', value: `${Math.round(stats.carbsG ?? 0)} / ${goals.carbsG ?? 0} g` },
        { label: 'Fat', value: `${Math.round(stats.fatG ?? 0)} / ${goals.fatG ?? 0} g` },
      ],
    },
  }
}

function StatBubbles({ stats, goals, meals = [], week }) {
  const [hovered, setHovered] = useState(null)
  const details = buildDetails(stats, goals, meals, week)

  const bubbles = [
    {
      key: 'calories',
      label: 'Calories',
      size: 280,
      color: 'yellow',
      circles: [
        { name: 'eaten', color: 'teal', percent: percentOf(stats.calories, goals.calories), maxSize: 70, x: 66, y: 40 },
      ],
    },
    {
      key: 'budget',
      label: 'Budget',
      size: 224,
      color: 'coral',
      circles: [
        { name: 'spent', color: 'blue', percent: percentOf(stats.spentCents, goals.budgetCents), maxSize: 57, x: 57, y: 60 },
      ],
    },
    {
      key: 'macros',
      label: 'Macros',
      size: 280,
      color: 'pink',
      circles: [
        { name: 'carbs', color: 'yellow', percent: percentOf(stats.carbsG, goals.carbsG), maxSize: 58, x: 46, y: 30 },
        { name: 'protein', color: 'teal', percent: percentOf(stats.proteinG, goals.proteinG), maxSize: 26, x: 32, y: 64 },
        { name: 'fat', color: 'blue', percent: percentOf(stats.fatG, goals.fatG), maxSize: 26, x: 62, y: 64 },
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
            <>
              <span className="stat-bubbles-label">{bubble.label}</span>
              <div className={`stat-bubbles-popup stat-bubbles-popup-${bubble.key}`}>
                <DetailsPopup {...details[bubble.key]} />
              </div>
            </>
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
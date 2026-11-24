import Button from '../Button/Button'
import Row from '../Row/Row'
import './RecentMeals.css'

function formatMeal(meal) {
  const price = meal.priceCents == null ? 'Price unknown' : `$${(meal.priceCents / 100).toFixed(2)}`
  const calories = meal.calories == null ? '? cal' : `${Math.round(meal.calories)} cal`
  return `${price} · ${calories}`
}

function RecentMeals({ meals, onAddFood, onMealClick }) {
  return (
    <div className="recent-meals">
      <Button onClick={onAddFood}>+ Add food</Button>
      <p className="recent-meals-heading">RECENT MEALS</p>
      {meals.length === 0 && <p className="recent-meals-empty">No meals logged yet.</p>}
      {meals.slice(0, 4).map((meal) => (
        <Row
          key={meal.id}
          label={meal.name}
          detail={formatMeal(meal)}
          onClick={() => onMealClick(meal)}
        />
      ))}
    </div>
  )
}

export default RecentMeals
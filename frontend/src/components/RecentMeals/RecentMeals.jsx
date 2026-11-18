import Button from '../Button/Button'
import Row from '../Row/Row'
import './RecentMeals.css'

function RecentMeals({ meals, onAddFood, onMealClick }) {
  return (
    <div className="recent-meals">
      <Button onClick={onAddFood}>+ Add food</Button>
      <p className="recent-meals-heading">RECENT MEALS</p>
      {meals.slice(0, 4).map((meal) => (
        <Row
          key={meal.id}
          label={meal.name}
          detail={`$${meal.price.toFixed(2)} · ${meal.calories} cal`}
          onClick={() => onMealClick(meal)}
        />
      ))}
    </div>
  )
}

export default RecentMeals
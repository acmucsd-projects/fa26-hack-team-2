import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom';
import ProfileMenu from "../components/ProfileMenu/ProfileMenu"
import WeekStrip from "../components/WeekStrip/WeekStrip"
import StatBubbles from "../components/StatBubbles/StatBubbles"
import RecentMeals from "../components/RecentMeals/RecentMeals"
import AddFoodPopup from "../components/AddFoodPopup/AddFoodPopup"
import { addFoodLog } from "../api/foodLogs"
import "./Dashboard.css";

const DEFAULT_USER = {
  name: 'John Cena',
  initials: 'JC',
}

const DEFAULT_GOALS = {
  calories: 2000,
  budget: 25,
  macros: {
    carbs: 250,
    protein: 150,
    fat: 65,
  },
}

// random junk to fill out items
const DEFAULT_WEEKS = [
  {
    rangeLabel: 'Nov 16 – Nov 22',
    days: [
      {
        dayName: 'Mon',
        date: '16',
        isFuture: false,
        stats: {
          calories: 1850,
          budget: 18.5,
          macros: { carbs: 210, protein: 140, fat: 58 },
        },
        meals: [
          { id: 'm1', name: 'Oatmeal & Berries', price: 4.5, calories: 380 },
          { id: 'm2', name: 'Chicken Burrito Bowl', price: 11.0, calories: 790 },
          { id: 'm3', name: 'Greek Yogurt', price: 3.0, calories: 180 },
        ],
      },
      {
        dayName: 'Tue',
        date: '17',
        isFuture: false,
        stats: {
          calories: 1920,
          budget: 22.0,
          macros: { carbs: 225, protein: 145, fat: 60 },
        },
        meals: [
          { id: 'm4', name: 'Avocado Toast', price: 7.5, calories: 420 },
          { id: 'm5', name: 'Salmon Poke Bowl', price: 14.5, calories: 720 },
        ],
      },
      {
        dayName: 'Wed',
        date: '18',
        isFuture: false,
        stats: {
          calories: 1450,
          budget: 15.75,
          macros: { carbs: 170, protein: 110, fat: 48 },
        },
        meals: [
          { id: 'm6', name: 'Turkey Sandwich', price: 9.25, calories: 540 },
          { id: 'm7', name: 'Protein Smoothie', price: 6.5, calories: 360 },
        ],
      },
      {
        dayName: 'Thu',
        date: '19',
        isFuture: false,
        stats: {
          calories: 2100,
          budget: 24.0,
          macros: { carbs: 240, protein: 155, fat: 70 },
        },
        meals: [
          { id: 'm8', name: 'Breakfast Tacos', price: 8.0, calories: 520 },
          { id: 'm9', name: 'Steak Salad', price: 16.0, calories: 680 },
        ],
      },
      {
        dayName: 'Fri',
        date: '20',
        isFuture: false,
        stats: {
          calories: 1620,
          budget: 19.25,
          macros: { carbs: 190, protein: 120, fat: 52 },
        },
        meals: [
          { id: 'm10', name: 'Bagel & Lox', price: 9.75, calories: 490 },
          { id: 'm11', name: 'Ramen Bowl', price: 9.5, calories: 640 },
        ],
      },
      {
        dayName: 'Sat',
        date: '21',
        isFuture: true,
        stats: {
          calories: 0,
          budget: 0,
          macros: { carbs: 0, protein: 0, fat: 0 },
        },
        meals: [],
      },
      {
        dayName: 'Sun',
        date: '22',
        isFuture: true,
        stats: {
          calories: 0,
          budget: 0,
          macros: { carbs: 0, protein: 0, fat: 0 },
        },
        meals: [],
      },
    ],
  },
]

function buildDetails(stats, goals) {
  const calRemaining = Math.max(goals.calories - stats.calories, 0)
  const budgetRemaining = Math.max(goals.budget - stats.budget, 0)

  return {
    calories: {
      amount: `${stats.calories}`,
      amountLabel: `/ ${goals.calories} cal`,
      lines: [
        { label: 'Eaten', value: `${stats.calories} cal` },
        { label: 'Remaining', value: `${calRemaining} cal` },
      ],
      total: { label: 'Daily Goal', value: `${goals.calories} cal` },
    },
    budget: {
      amount: `$${stats.budget.toFixed(2)}`,
      amountLabel: `/ $${goals.budget.toFixed(2)}`,
      lines: [
        { label: 'Spent', value: `$${stats.budget.toFixed(2)}` },
        { label: 'Remaining', value: `$${budgetRemaining.toFixed(2)}` },
      ],
      total: { label: 'Daily Budget', value: `$${goals.budget.toFixed(2)}` },
    },
    macros: {
      lines: [
        { label: 'Carbs', value: `${stats.macros.carbs}g / ${goals.macros.carbs}g` },
        { label: 'Protein', value: `${stats.macros.protein}g / ${goals.macros.protein}g` },
        { label: 'Fat', value: `${stats.macros.fat}g / ${goals.macros.fat}g` },
      ],
    },
  }
}

function Dashboard({
  user = DEFAULT_USER,
  goals = DEFAULT_GOALS,
  weeks = DEFAULT_WEEKS,
  onSettings,
  onSignOut,
  onFoodAdded = () => {},
  onMealClick = () => {},
  extraSections = [],
}) {
  const navigate = useNavigate();
  const handleSettings = onSettings ?? (() => navigate('/settings'))
  const handleSignOut = onSignOut ?? (() => navigate('/login'))

  const [isAddFoodOpen, setIsAddFoodOpen] = useState(false)
  // Meals added in this session, keyed by day. Temporary: once the backend
  // has food logs, refetch the day's meals after adding instead.
  const [addedMeals, setAddedMeals] = useState({})

  const [weekIndex, setWeekIndex] = useState(0)
  const currentWeek = weeks[weekIndex] ?? weeks[0]

  const [selectedDate, setSelectedDate] = useState(() => {
    const firstActive = currentWeek.days.find((d) => !d.isFuture)
    return firstActive ? firstActive.date : currentWeek.days[0]?.date
  })

  const activeDay = useMemo(() => {
    return (
      currentWeek.days.find((d) => d.date === selectedDate) ??
      currentWeek.days[0]
    )
  }, [currentWeek, selectedDate])

  const formattedDays = useMemo(() => {
    return currentWeek.days.map((day) => {
      let state = 'past'
      if (day.isFuture) state = 'future'
      if (day.date === activeDay?.date) state = 'selected'

      return {
        ...day,
        state,
        caloriesPercent: goals.calories ? (day.stats.calories / goals.calories) * 100 : 0,
        budgetPercent: goals.budget ? (day.stats.budget / goals.budget) * 100 : 0,
      }
    })
  }, [currentWeek, activeDay, goals])

  const statBubblesProps = useMemo(() => {
    const stats = activeDay?.stats ?? {
      calories: 0,
      budget: 0,
      macros: { carbs: 0, protein: 0, fat: 0 },
    }

    return {
      calories: { current: stats.calories, goal: goals.calories },
      budget: { current: stats.budget, goal: goals.budget },
      macros: {
        carbs: { current: stats.macros.carbs, goal: goals.macros.carbs },
        protein: { current: stats.macros.protein, goal: goals.macros.protein },
        fat: { current: stats.macros.fat, goal: goals.macros.fat },
      },
      details: buildDetails(stats, goals),
    }
  }, [activeDay, goals])

  function handlePrevWeek() {
    setWeekIndex((prev) => {
      const nextIndex = Math.max(prev - 1, 0)
      const nextWeek = weeks[nextIndex]
      if (nextWeek?.days.length) setSelectedDate(nextWeek.days[0].date)
      return nextIndex
    })
  }

  function handleNextWeek() {
    setWeekIndex((prev) => {
      const nextIndex = Math.min(prev + 1, weeks.length - 1)
      const nextWeek = weeks[nextIndex]
      if (nextWeek?.days.length) setSelectedDate(nextWeek.days[0].date)
      return nextIndex
    })
  }

  function handleDayClick(day) {
    setSelectedDate(day.date)
  }

  async function handleAddFood(entry) {
    const saved = await addFoodLog(entry)
    const meal = {
      id: saved.id,
      name: saved.name,
      price: (saved.priceCents ?? 0) / 100,
      calories: saved.nutrition?.calories ?? 0,
    }
    setAddedMeals((prev) => ({
      ...prev,
      [activeDay.date]: [meal, ...(prev[activeDay.date] ?? [])],
    }))
    onFoodAdded(saved, activeDay)
  }

  const activeDayMeals = [...(addedMeals[activeDay?.date] ?? []), ...(activeDay?.meals ?? [])]

  // Config-driven section registry for easy reordering or extending.
  // Order matters: the grid lays sections out in this order
  // (bubbles left, recent meals right, week strip full-width underneath).
  const sections = [
    {
      id: 'stat-bubbles',
      Component: StatBubbles,
      props: statBubblesProps,
    },
    {
      id: 'recent-meals',
      Component: RecentMeals,
      props: {
        meals: activeDayMeals,
        onAddFood: () => setIsAddFoodOpen(true),
        onMealClick: (meal) => onMealClick(meal, activeDay),
      },
    },
    {
      id: 'week-strip',
      Component: WeekStrip,
      props: {
        rangeLabel: currentWeek.rangeLabel,
        days: formattedDays,
        onPrevWeek: handlePrevWeek,
        onNextWeek: handleNextWeek,
        onDayClick: handleDayClick,
      },
    },
    ...extraSections,
  ]

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1 className="dashboard-title">Dashboard</h1>
        <ProfileMenu
          name={user.name}
          initials={user.initials}
          onSettings={handleSettings}
          onSignOut={handleSignOut}
        />
      </header>

      <main className="dashboard-content">
        {sections.map(({ id, Component, props }) => (
          <section key={id} className={`dashboard-section dashboard-section-${id}`}>
            <Component {...props} />
          </section>
        ))}
      </main>

      {isAddFoodOpen && (
        <AddFoodPopup
          // TODO: give each day a full ISO date ('2026-11-16') so this can
          // say "Mon, Nov 16" and the log entry gets a real `date`.
          dayLabel={activeDay ? `${activeDay.dayName} ${activeDay.date}` : null}
          date={activeDay?.isoDate ?? null}
          onClose={() => setIsAddFoodOpen(false)}
          onSubmit={handleAddFood}
        />
      )}
    </div>
  )
}

export default Dashboard
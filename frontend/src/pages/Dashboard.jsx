import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import ProfileMenu from '../components/ProfileMenu/ProfileMenu'
import WeekStrip from '../components/WeekStrip/WeekStrip'
import StatBubbles from '../components/StatBubbles/StatBubbles'
import RecentMeals from '../components/RecentMeals/RecentMeals'
import AddFoodPopup from '../components/AddFoodPopup/AddFoodPopup'
import { addFoodLog } from '../api/foodLogs'
import { logout } from '../api/auth'
import useHomeData from '../hooks/useHomeData'
import './Dashboard.css'

function Dashboard({ onMealClick = () => {}, extraSections = [] }) {
  const navigate = useNavigate()
  const { data, error, isLoading, reload, prevWeek, nextWeek } = useHomeData()
  const [isAddFoodOpen, setIsAddFoodOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)

  if (error?.status === 401) return <Navigate to="/login" replace />
  if (isLoading) return <p className="dashboard-status">Loading…</p>
  if (error) {
    return (
      <div className="dashboard-status">
        <p>{error.message}</p>
        <button type="button" onClick={reload}>Try again</button>
      </div>
    )
  }

  const { user, goals, week } = data
  const activeDay =
    week.days.find((day) => day.date === selectedDate) ??
    week.days.find((day) => day.state === 'today') ??
    week.days[0]

  async function handleAddFood(entry) {
    try {
      await addFoodLog(entry)
      await reload()
    } catch (err) {
      alert(err.message)
      throw err
    }
  }

  async function handleSignOut() {
    try {
      await logout()
    } finally {
      navigate('/login')
    }
  }

  // Config-driven section registry for easy reordering or extending.
  // Order matters: the grid lays sections out in this order
  // (bubbles left, recent meals right, week strip full-width underneath).
  const sections = [
    {
      id: 'stat-bubbles',
      Component: StatBubbles,
      props: {
        stats: activeDay.totals,
        goals,
        meals: activeDay.meals,
        week: { spentCents: week.spentCents, budgetCents: week.budgetCents },
      },
    },
    {
      id: 'recent-meals',
      Component: RecentMeals,
      props: {
        meals: activeDay.meals,
        onAddFood: () => setIsAddFoodOpen(true),
        onMealClick: (meal) => onMealClick(meal, activeDay),
      },
    },
    {
      id: 'week-strip',
      Component: WeekStrip,
      props: {
        title: week.title,
        rangeLabel: week.rangeLabel,
        days: week.days,
        goals,
        selectedDate: activeDay.date,
        onPrevWeek: prevWeek,
        onNextWeek: nextWeek,
        onDayClick: (day) => setSelectedDate(day.date),
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
          onSettings={() => navigate('/settings')}
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
          dayLabel={activeDay.label}
          date={activeDay.date}
          onClose={() => setIsAddFoodOpen(false)}
          onSubmit={handleAddFood}
        />
      )}
    </div>
  )
}

export default Dashboard
import { useCallback, useEffect, useState } from 'react'
import { getMe, getLog, getWeek } from '../api/me'

function dollars(cents) {
  return (cents ?? 0) / 100
}

function goalOf(range) {
  return range.max ?? range.min
}

function toDateString(date) {
  return date.toLocaleDateString('en-CA')
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00`)
  date.setDate(date.getDate() + days)
  return toDateString(date)
}

function formatDate(dateString, options) {
  return new Date(`${dateString}T12:00`).toLocaleDateString('en-US', options)
}

function buildHomeData({ today, me, log, week }) {
  const todayLog = log[log.length - 1]
  const totals = todayLog.totals

  const caloriesGoal = goalOf(me.goals.calories)
  const budgetGoal = dollars(me.budget.dailyCents)

  const initials = me.name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const recentMeals = [...log]
    .reverse()
    .flatMap((day) =>
      [...day.meals]
        .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
        .map((meal) => ({
          id: meal.id,
          date: day.date,
          name: meal.name,
          price: dollars(meal.priceCents),
          calories: Math.round(meal.calories ?? 0),
        }))
    )

  const caloriesLeft = Math.round(caloriesGoal - totals.calories)

  return {
    dateLabel: formatDate(today, { weekday: 'long', month: 'short', day: 'numeric' }),
    caloriesLeft,
    moneyLeft: budgetGoal - dollars(totals.spentCents),
    user: { name: me.name, initials },
    bubbles: {
      calories: { current: totals.calories, goal: caloriesGoal },
      budget: { current: dollars(totals.spentCents), goal: budgetGoal },
      macros: {
        protein: { current: totals.proteinG, goal: goalOf(me.goals.proteinG) },
        carbs: { current: totals.carbsG, goal: goalOf(me.goals.carbsG) },
        fat: { current: totals.fatG, goal: goalOf(me.goals.fatG) },
      },
      details: {
        calories: {
          amount: Math.round(totals.calories).toLocaleString(),
          amountLabel: `of ${caloriesGoal.toLocaleString()} cal`,
          lines: todayLog.meals.map((meal) => ({
            label: `${meal.name} · ${meal.locationName}`,
            value: `${Math.round(meal.calories ?? 0)} cal`,
          })),
          total: { label: 'Left today', value: `${caloriesLeft.toLocaleString()} cal` },
        },
        budget: {
          amount: `$${dollars(totals.spentCents).toFixed(2)}`,
          amountLabel: `of $${budgetGoal.toFixed(2)}`,
          lines: todayLog.meals.map((meal) => ({
            label: `${meal.name} · ${meal.locationName}`,
            value: `$${dollars(meal.priceCents).toFixed(2)}`,
          })),
          total: {
            label: 'This week',
            value: `$${dollars(week.totals.spentCents).toFixed(2)} / $${dollars(week.goals.weeklyBudgetCents).toFixed(0)}`,
          },
        },
        macros: {
          lines: [
            { label: 'Protein', value: `${Math.round(totals.proteinG)} / ${goalOf(me.goals.proteinG)} g` },
            { label: 'Carbs', value: `${Math.round(totals.carbsG)} / ${goalOf(me.goals.carbsG)} g` },
            { label: 'Fat', value: `${Math.round(totals.fatG)} / ${goalOf(me.goals.fatG)} g` },
          ],
        },
      },
    },
    recentMeals,
    week: {
      rangeLabel: `${formatDate(week.start, { month: 'short', day: 'numeric' })} – ${formatDate(week.end, { month: 'short', day: 'numeric' })}`,
      days: week.days.map((day) => ({
        date: Number(day.date.slice(8)),
        fullDate: day.date,
        dayName: day.date === today ? 'TODAY' : formatDate(day.date, { weekday: 'short' }).toUpperCase(),
        state: day.date < today ? 'past' : day.date === today ? 'today' : 'future',
        caloriesPercent: day.caloriesPercent ?? 0,
        budgetPercent: day.budgetPercent ?? 0,
      })),
    },
  }
}

export default function useHomeData() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    try {
      const today = toDateString(new Date())
      const [me, log, week] = await Promise.all([
        getMe(),
        getLog(addDays(today, -6), today),
        getWeek(),
      ])
      setData(buildHomeData({ today, me, log, week }))
      setError(null)
    } catch (err) {
      setError(err)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { data, error, isLoading: !data && !error, reload }
}
import { useCallback, useEffect, useState } from 'react'
import { getMe, getLog, getWeek } from '../api/me'

const EMPTY_TOTALS = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, spentCents: 0 }

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

function goalOf(range) {
  return range?.max ?? range?.min ?? null
}

function initialsOf(name) {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function weekTitle(start, end, today) {
  const contains = (date) => date >= start && date <= end
  if (contains(today)) return 'This week'
  if (contains(addDays(today, -7))) return 'Last week'
  if (contains(addDays(today, 7))) return 'Next week'
  return `Week of ${formatDate(start, { month: 'short', day: 'numeric' })}`
}

function buildHomeData({ today, me, week, log }) {
  const days = week.days.map((day) => {
    const logDay = log.find((entry) => entry.date === day.date)
    return {
      date: day.date,
      dayNumber: Number(day.date.slice(8)),
      dayName: day.date === today ? 'TODAY' : formatDate(day.date, { weekday: 'short' }).toUpperCase(),
      label: formatDate(day.date, { weekday: 'short', month: 'short', day: 'numeric' }),
      state: day.date < today ? 'past' : day.date === today ? 'today' : 'future',
      totals: logDay?.totals ?? EMPTY_TOTALS,
      meals: [...(logDay?.meals ?? [])].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)),
    }
  })

  return {
    user: { name: me.name, initials: initialsOf(me.name) },
    goals: {
      calories: goalOf(me.goals.calories),
      budgetCents: me.budget.dailyCents,
      proteinG: goalOf(me.goals.proteinG),
      carbsG: goalOf(me.goals.carbsG),
      fatG: goalOf(me.goals.fatG),
    },
    week: {
      start: week.start,
      end: week.end,
      title: weekTitle(week.start, week.end, today),
      rangeLabel: `${formatDate(week.start, { month: 'short', day: 'numeric' })} – ${formatDate(week.end, { month: 'short', day: 'numeric' })}`,
      spentCents: week.totals.spentCents,
      budgetCents: week.goals.weeklyBudgetCents,
      days,
    },
  }
}

export default function useHomeData() {
  const [weekStart, setWeekStart] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    try {
      const [me, week] = await Promise.all([getMe(), getWeek(weekStart)])
      const log = await getLog(week.start, week.end)
      setData(buildHomeData({ today: toDateString(new Date()), me, week, log }))
      setError(null)
    } catch (err) {
      setError(err)
    }
  }, [weekStart])

  useEffect(() => {
    reload()
  }, [reload])

  function prevWeek() {
    if (data) setWeekStart(addDays(data.week.start, -7))
  }

  function nextWeek() {
    if (data) setWeekStart(addDays(data.week.start, 7))
  }

  return { data, error, isLoading: !data && !error, reload, prevWeek, nextWeek }
}
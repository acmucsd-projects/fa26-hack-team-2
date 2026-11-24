# hooks

Custom React hooks: reusable logic that pages and components can share.

## useHomeData

Loads everything the Dashboard needs from the backend (the user, their goals, and one week of their food log) and gives it back in the shapes the Home components expect.

```jsx
import useHomeData from '../hooks/useHomeData'

const { data, error, isLoading, reload, prevWeek, nextWeek } = useHomeData()
```

- `isLoading`: true while waiting for the first answer
- `error`: set if something went wrong. `error.status` is `401` when nobody is logged in
- `reload()`: fetches everything again. Call it after adding, editing, or deleting a meal
- `prevWeek()`, `nextWeek()`: switch to the previous or next week
- `data`:
  - `user`: `{ name, initials }` for ProfileMenu
  - `goals`: `{ calories, budgetCents, proteinG, carbsG, fatG }`, passed to StatBubbles and WeekStrip
  - `week`: `{ start, end, title, rangeLabel, spentCents, budgetCents, days }`
    - `title` is "This week", "Last week", "Next week", or "Week of ..."
    - each day is `{ date, dayNumber, dayName, label, state, totals, meals }`. `totals` and `meals` come straight from the backend, so they can be passed to StatBubbles and RecentMeals as-is

The components handle their own math (percentages and cents-to-dollars), so pages pass these values in without converting them. See `pages/Dashboard.jsx` for an example.

Requires a logged-in user, since it uses the `/api/me` routes.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button/Button'
import './Settings.css'

// TODO: replace with real per-day amounts for each UCSD dining plan
// (or fetch them from the backend once that exists).
const DINING_PLANS = [
  { id: 'triton-gold', name: 'Triton Gold', dailyBudget: 28 },
  { id: 'triton-blue', name: 'Triton Blue', dailyBudget: 24 },
  { id: 'triton', name: 'Triton', dailyBudget: 20 },
  { id: 'sun-god-gold', name: 'Sun God Gold', dailyBudget: 17 },
  { id: 'sun-god-blue', name: 'Sun God Blue', dailyBudget: 14 },
  { id: 'triton-community', name: 'Triton Community', dailyBudget: 10 },
]

const CUSTOM_PLAN_ID = 'custom'

// Used to turn "money left" on a custom plan into a per-day amount.
// TODO: update every quarter (or move to config).
const QUARTER_END = new Date('2026-12-12')

const DEFAULT_SETTINGS = {
  planId: 'triton',
  customMoneyLeft: '',
  budgetView: 'daily',
  goals: { calories: 2200, protein: 110, carbs: 275, fat: 70 },
}

const GOAL_FIELDS = [
  { key: 'calories', label: 'Calories', unit: 'cal', step: 50, color: 'var(--bubble-blue)' },
  { key: 'protein', label: 'Protein', unit: 'g', step: 5, color: 'var(--bubble-teal)' },
  { key: 'carbs', label: 'Carbs', unit: 'g', step: 5, color: 'var(--bubble-yellow)' },
  { key: 'fat', label: 'Fat', unit: 'g', step: 5, color: 'var(--bubble-pink)' },
]

// calories per gram of each macro
const CAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 }

function daysUntil(date) {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.max(Math.ceil((date - new Date()) / msPerDay), 1)
}

function formatMoney(amount) {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`
}

function DiningPlanSection({ planId, customMoneyLeft, onSelectPlan, onCustomMoneyChange }) {
  const isCustom = planId === CUSTOM_PLAN_ID

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">Dining plan</h2>
      <p className="settings-section-subtitle">Pick the one on your account</p>

      <div className="settings-plan-list" role="radiogroup" aria-label="Dining plan">
        {DINING_PLANS.map((plan) => {
          const selected = plan.id === planId
          return (
            <button
              key={plan.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`settings-plan ${selected ? 'settings-plan-selected' : ''}`}
              onClick={() => onSelectPlan(plan.id)}
            >
              {plan.name}
              {selected && <span className="settings-plan-check" aria-hidden="true">✓</span>}
            </button>
          )
        })}

        {isCustom ? (
          <label className="settings-plan settings-plan-custom settings-plan-custom-active">
            <span>Money left $</span>
            <input
              type="number"
              min="0"
              step="0.01"
              autoFocus
              className="settings-plan-input"
              value={customMoneyLeft}
              onChange={(e) => onCustomMoneyChange(e.target.value)}
              placeholder="0.00"
            />
          </label>
        ) : (
          <button
            type="button"
            role="radio"
            aria-checked={false}
            className="settings-plan settings-plan-custom"
            onClick={() => onSelectPlan(CUSTOM_PLAN_ID)}
          >
            Custom · enter money left
          </button>
        )}
      </div>
    </section>
  )
}

function BudgetSection({ dailyBudget, planName, view, onViewChange }) {
  const weeklyBudget = dailyBudget * 7
  const isDaily = view === 'daily'

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">Budget</h2>
      <p className="settings-section-subtitle">Set from your {planName} plan</p>

      <div className="settings-toggle" role="tablist" aria-label="Budget period">
        {['daily', 'weekly'].map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={view === option}
            className={`settings-toggle-option ${view === option ? 'settings-toggle-option-active' : ''}`}
            onClick={() => onViewChange(option)}
          >
            {option === 'daily' ? 'Daily' : 'Weekly'}
          </button>
        ))}
      </div>

      <p className="settings-budget-amount">
        {formatMoney(isDaily ? dailyBudget : weeklyBudget)}
        <span className="settings-budget-period">{isDaily ? 'per day' : 'per week'}</span>
      </p>
      <p className="settings-budget-note">
        ≈ {isDaily ? `${formatMoney(weeklyBudget)} per week` : `${formatMoney(dailyBudget)} per day`}
      </p>
    </section>
  )
}

function DailyGoalsSection({ goals, onChangeGoal, onSuggestGoals }) {
  const split = useMemo(() => {
    const cals = {
      protein: goals.protein * CAL_PER_GRAM.protein,
      carbs: goals.carbs * CAL_PER_GRAM.carbs,
      fat: goals.fat * CAL_PER_GRAM.fat,
    }
    const total = cals.protein + cals.carbs + cals.fat
    if (!total) return { protein: 0, carbs: 0, fat: 0 }
    const protein = Math.round((cals.protein / total) * 100)
    const carbs = Math.round((cals.carbs / total) * 100)
    // fat takes the remainder so the three always add up to 100%
    return { protein, carbs, fat: 100 - protein - carbs }
  }, [goals])

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">Daily goals</h2>
      <p className="settings-section-subtitle">Calories and macros per day</p>

      <ul className="settings-goals">
        {GOAL_FIELDS.map(({ key, label, unit, step, color }) => (
          <li key={key} className="settings-goal">
            <span className="settings-goal-label">
              <span className="settings-goal-dot" style={{ background: color }} />
              {label}
            </span>
            <span className="settings-stepper">
              <button
                type="button"
                className="settings-stepper-button"
                aria-label={`Decrease ${label}`}
                onClick={() => onChangeGoal(key, Math.max(goals[key] - step, 0))}
              >
                −
              </button>
              <span className="settings-stepper-value">
                {goals[key].toLocaleString()}
                <span className="settings-stepper-unit">{unit}</span>
              </span>
              <button
                type="button"
                className="settings-stepper-button"
                aria-label={`Increase ${label}`}
                onClick={() => onChangeGoal(key, goals[key] + step)}
              >
                +
              </button>
            </span>
          </li>
        ))}
      </ul>

      <p className="settings-split-label">Where your calories come from</p>
      <div className="settings-split-bar" aria-hidden="true">
        <span style={{ width: `${split.protein}%`, background: 'var(--bubble-teal)' }} />
        <span style={{ width: `${split.carbs}%`, background: 'var(--bubble-yellow)' }} />
        <span style={{ width: `${split.fat}%`, background: 'var(--bubble-pink)' }} />
      </div>
      <p className="settings-split-note">
        {split.protein}% protein · {split.carbs}% carbs · {split.fat}% fat
      </p>

      <button type="button" className="settings-suggest" onClick={onSuggestGoals}>
        <span className="settings-suggest-title">Suggest goals for me</span>
        <span className="settings-suggest-subtitle">Based on your age, weight and activity</span>
      </button>
    </section>
  )
}

export default function Settings({
  initialSettings = DEFAULT_SETTINGS,
  onSave,
  onSuggestGoals = () => {},
}) {
  const navigate = useNavigate()
  const [planId, setPlanId] = useState(initialSettings.planId)
  const [customMoneyLeft, setCustomMoneyLeft] = useState(initialSettings.customMoneyLeft)
  const [budgetView, setBudgetView] = useState(initialSettings.budgetView)
  const [goals, setGoals] = useState(initialSettings.goals)

  const isCustom = planId === CUSTOM_PLAN_ID
  const selectedPlan = DINING_PLANS.find((plan) => plan.id === planId)

  const dailyBudget = useMemo(() => {
    if (!isCustom) return selectedPlan?.dailyBudget ?? 0
    const moneyLeft = parseFloat(customMoneyLeft) || 0
    return Math.round((moneyLeft / daysUntil(QUARTER_END)) * 100) / 100
  }, [isCustom, selectedPlan, customMoneyLeft])

  function handleChangeGoal(key, value) {
    setGoals((prev) => ({ ...prev, [key]: value }))
  }

  function handleClose() {
    navigate('/')
  }

  function handleSave() {
    onSave?.({ planId, customMoneyLeft, budgetView, dailyBudget, goals })
    navigate('/')
  }

  return (
    <div className="settings-page">
      <div className="settings-card" role="dialog" aria-labelledby="settings-title">
        <header className="settings-header">
          <h1 id="settings-title" className="settings-title">Settings</h1>
          <button
            type="button"
            className="settings-close"
            aria-label="Close settings"
            onClick={handleClose}
          >
            ×
          </button>
        </header>

        <div className="settings-sections">
          <DiningPlanSection
            planId={planId}
            customMoneyLeft={customMoneyLeft}
            onSelectPlan={setPlanId}
            onCustomMoneyChange={setCustomMoneyLeft}
          />
          <BudgetSection
            dailyBudget={dailyBudget}
            planName={isCustom ? 'custom' : selectedPlan?.name}
            view={budgetView}
            onViewChange={setBudgetView}
          />
          <DailyGoalsSection
            goals={goals}
            onChangeGoal={handleChangeGoal}
            onSuggestGoals={onSuggestGoals}
          />
        </div>

        <footer className="settings-footer">
          <Button onClick={handleSave}>Save</Button>
        </footer>
      </div>
    </div>
  )
}

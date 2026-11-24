import { useEffect, useMemo, useState } from 'react'
import Modal from '../Modal/Modal'
import Button from '../Button/Button'
import arrowRight from '../../assets/arrow-right.svg'
import arrowLeft from '../../assets/arrow-left.svg'
import { fetchLocations } from '../../api/locations'
import { fetchMenuItems } from '../../api/menus'
import './AddFoodPopup.css'

// "Add food" popup. Three steps:
//   1. locations — pick where you ate (GET /api/locations)
//   2. menu      — pick an item from that location (GET /api/menus?location=)
//   3. manual    — type a meal in yourself
// When the user picks something it calls onSubmit(entry) with the shape
// documented in api/foodLogs.js. Saving is the parent's job.

// Loads data with `loader(signal)` whenever `deps` change.
// Returns { data, error, loading, retry }.
function useLoad(loader, deps) {
  const [attempt, setAttempt] = useState(0)
  const key = JSON.stringify([...deps, attempt])
  // `result.key` says which request the stored result belongs to, so a
  // mismatch with the current key means we're still loading.
  const [result, setResult] = useState({ key: null, data: null, error: null })

  useEffect(() => {
    const controller = new AbortController()
    loader(controller.signal)
      .then((data) => setResult({ key, data, error: null }))
      .catch((error) => {
        if (error.name !== 'AbortError') setResult({ key, data: null, error })
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const loading = result.key !== key
  return {
    data: loading ? null : result.data,
    error: loading ? null : result.error,
    loading,
    retry: () => setAttempt((n) => n + 1),
  }
}

function matches(text, query) {
  return text.toLowerCase().includes(query.trim().toLowerCase())
}

function formatPrice(cents) {
  return cents == null ? null : `$${(cents / 100).toFixed(2)}`
}

function ForkIcon() {
  return (
    <svg className="add-food-row-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 2v8a2 2 0 0 0 2 2v10h2V12a2 2 0 0 0 2-2V2h-1.5v7h-1V2H9v7H8V2H7Zm10 0c-1.7 0-3 2-3 5v6h2v9h2V2h-1Z"
        fill="currentColor"
      />
    </svg>
  )
}

function ListStatus({ loading, error, empty, emptyText, onRetry }) {
  if (loading) return <p className="add-food-status">Loading…</p>
  if (error) {
    return (
      <div className="add-food-status add-food-status-error">
        <p>{error.message}</p>
        <button type="button" className="add-food-link" onClick={onRetry}>Try again</button>
      </div>
    )
  }
  if (empty) return <p className="add-food-status">{emptyText}</p>
  return null
}

function LocationStep({ search, onPick }) {
  const { data, error, loading, retry } = useLoad((signal) => fetchLocations({ signal }), [])

  // TODO: "Search foods or dining halls" — searching foods across every hall
  // needs a backend route (e.g. GET /api/menus/search?q=). For now this only
  // filters halls by name.
  const locations = useMemo(
    () => (data ?? []).filter((loc) => matches(loc.name, search)),
    [data, search],
  )

  return (
    <>
      <p className="add-food-label">Where did you eat?</p>
      <ListStatus
        loading={loading}
        error={error}
        empty={locations.length === 0}
        emptyText={search ? `No dining halls match “${search}”` : 'No dining halls found'}
        onRetry={retry}
      />
      {!loading && !error && (
        <ul className="add-food-list">
          {locations.map((loc) => (
            <li key={loc.id}>
              <button type="button" className="add-food-row" onClick={() => onPick(loc)}>
                <ForkIcon />
                <span className="add-food-row-name">{loc.name}</span>
                <img className="add-food-row-chevron" src={arrowRight} alt="" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function MenuStep({ location, search, onPick }) {
  const { data, error, loading, retry } = useLoad(
    (signal) => fetchMenuItems(location.id, { signal, sort: 'name' }),
    [location.id],
  )

  const items = useMemo(
    () => (data ?? []).filter((item) => matches(item.name, search)),
    [data, search],
  )

  return (
    <>
      <p className="add-food-label">{location.name} menu</p>
      <ListStatus
        loading={loading}
        error={error}
        empty={items.length === 0}
        emptyText={search ? `No items match “${search}”` : 'No menu items found'}
        onRetry={retry}
      />
      {!loading && !error && (
        <ul className="add-food-list">
          {items.map((item) => {
            const details = [
              formatPrice(item.priceCents),
              item.nutrition?.calories != null ? `${item.nutrition.calories} cal` : null,
            ].filter(Boolean).join(' · ')

            return (
              <li key={item.id}>
                <button type="button" className="add-food-row" onClick={() => onPick(item)}>
                  <span className="add-food-row-text">
                    <span className="add-food-row-name">{item.name}</span>
                    {item.stationName && (
                      <span className="add-food-row-sub">{item.stationName}</span>
                    )}
                  </span>
                  <span className="add-food-row-detail">{details}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

const MANUAL_FIELDS = [
  { key: 'name', label: 'Meal', type: 'text', placeholder: 'e.g. Turkey sandwich', full: true },
  { key: 'price', label: 'Price ($)', type: 'number', step: '0.01' },
  { key: 'calories', label: 'Calories (kcal)', type: 'number' },
  { key: 'protein', label: 'Protein (g)', type: 'number' },
  { key: 'carbs', label: 'Carbs (g)', type: 'number' },
  { key: 'fat', label: 'Fat (g)', type: 'number' },
]

function ManualStep({ initialName, onSubmit }) {
  const [form, setForm] = useState({
    name: initialName, price: '', calories: '', protein: '', carbs: '', fat: '',
  })

  const toNumber = (value) => (value === '' ? null : Number(value))

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit({
      name: form.name.trim(),
      priceCents: form.price === '' ? null : Math.round(Number(form.price) * 100),
      nutrition: {
        calories: toNumber(form.calories),
        proteinG: toNumber(form.protein),
        carbsG: toNumber(form.carbs),
        fatG: toNumber(form.fat),
      },
    })
  }

  return (
    <form id="add-food-manual" className="add-food-form" onSubmit={handleSubmit}>
      {MANUAL_FIELDS.map(({ key, label, full, ...input }) => (
        <label key={key} className={`add-food-field ${full ? 'add-food-field-full' : ''}`}>
          <span className="add-food-field-label">{label}</span>
          <input
            {...input}
            min={input.type === 'number' ? 0 : undefined}
            required={key === 'name'}
            autoFocus={key === 'name'}
            className="add-food-input"
            value={form[key]}
            onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
          />
        </label>
      ))}
    </form>
  )
}

function AddFoodPopup({ dayLabel, date = null, onClose, onSubmit }) {
  const [step, setStep] = useState('locations')
  const [location, setLocation] = useState(null)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  function goTo(nextStep) {
    setStep(nextStep)
    setSearch('')
  }

  async function submit(entry) {
    setSaving(true)
    try {
      await onSubmit({
        date,
        servings: 1,
        menuItemId: null,
        foodId: null,
        locationId: null,
        ...entry,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function handlePickItem(item) {
    submit({
      source: 'menu',
      menuItemId: item.id,
      foodId: item.foodId,
      locationId: item.locationId,
      name: item.name,
      priceCents: item.priceCents,
      nutrition: {
        calories: item.nutrition?.calories ?? null,
        proteinG: item.nutrition?.proteinG ?? null,
        carbsG: item.nutrition?.carbsG ?? null,
        fatG: item.nutrition?.fatG ?? null,
      },
    })
  }

  const footer =
    step === 'manual' ? (
      <div className="add-food-footer-actions">
        <Button type="submit" form="add-food-manual" disabled={saving}>
          {saving ? 'Adding…' : 'Add meal'}
        </Button>
      </div>
    ) : (
      // keeps the search text so it can prefill the meal name
      <button type="button" className="add-food-manual-button" onClick={() => setStep('manual')}>
        + Enter a meal manually
      </button>
    )

  return (
    <Modal
      title="Add food"
      onClose={onClose}
      subtitle={dayLabel && <span className="add-food-chip">Adding to {dayLabel}</span>}
      footer={footer}
    >
      {step !== 'locations' && (
        <button
          type="button"
          className="add-food-back"
          onClick={() => goTo(step === 'menu' || !location ? 'locations' : 'menu')}
        >
          <img src={arrowLeft} alt="" /> Back
        </button>
      )}

      {step !== 'manual' && (
        <input
          type="search"
          autoFocus
          className="add-food-input add-food-search"
          placeholder={step === 'menu' ? `Search ${location.name}` : 'Search foods or dining halls'}
          aria-label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {step === 'locations' && (
        <LocationStep
          search={search}
          onPick={(loc) => {
            setLocation(loc)
            goTo('menu')
          }}
        />
      )}
      {step === 'menu' && (
        <MenuStep location={location} search={search} onPick={handlePickItem} />
      )}
      {step === 'manual' && (
        <ManualStep
          initialName={search}
          onSubmit={(fields) => submit({ source: 'manual', locationId: location?.id ?? null, ...fields })}
        />
      )}
    </Modal>
  )
}

export default AddFoodPopup

import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EMPTY_FOOD, foodKcal, MACROS, sumFoods, validateFood } from '../../models/mealPlan.model.js';
import { ui } from '../ui/styles.js';

function AddFoodForm({ mealLabel, onAdd, onCancel }) {
  const [food, setFood] = useState(EMPTY_FOOD);
  const [errors, setErrors] = useState({});
  const set = (field) => (e) => setFood((prev) => ({ ...prev, [field]: e.target.value }));

  function handleSubmit(event) {
    event.preventDefault();
    const validation = validateFood(food);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;
    onAdd({
      name: food.name.trim(),
      portion: food.portion.trim(),
      ...Object.fromEntries(MACROS.map((m) => [m.code, Number(food[m.code])])),
    });
    setFood(EMPTY_FOOD);
  }

  const input = (name, label, props) => (
    <label className="block text-xs text-muted">
      {label}
      <input className={`${ui.input} mt-1`} value={food[name]} onChange={set(name)} aria-invalid={Boolean(errors[name])} {...props} />
      {errors[name] && <span className={ui.fieldError}>{errors[name]}</span>}
    </label>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-3 rounded-lg bg-tint p-4" aria-label={`Agregar alimento a ${mealLabel}`}>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        {input('name', 'Alimento', { maxLength: 80, autoFocus: true })}
        {input('portion', 'Porcion', { maxLength: 30, placeholder: '1 taza' })}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {MACROS.map((m) => (
          <div key={m.code}>{input(m.code, `${m.label} (g)`, { type: 'number', min: 0, max: 300, step: '0.5', inputMode: 'decimal' })}</div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button type="submit" className={ui.btnPrimary}>
          Agregar
        </button>
        <button type="button" className={ui.btnSecondary} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default function MealSection({ meal, items, kcalGoal, readOnly, onAdd, onRemove }) {
  const [adding, setAdding] = useState(false);
  const totals = sumFoods(items);

  return (
    <li className="relative pl-8">
      <span className="absolute top-1.5 left-0 flex size-4 items-center justify-center rounded-full border-2 border-accent bg-tint" aria-hidden="true" />
      <div className="flex flex-wrap items-baseline gap-x-3">
        <time className="font-bold tabular-nums text-muted">{meal.time}</time>
        <h3 className="text-lg font-semibold">{meal.label}</h3>
        <p className="ml-auto text-sm tabular-nums">
          <span className="font-bold">{totals.kcal}</span>
          <span className="text-muted"> / {kcalGoal} kcal sugeridas</span>
        </p>
      </div>

      {items.length > 0 ? (
        <ul className="mt-2 divide-y divide-line">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
              <span className="min-w-40 flex-1">
                <span className="font-bold">{item.name}</span> <span className="text-muted">{item.portion}</span>
              </span>
              <span className="text-muted tabular-nums">
                P {item.protein} g, C {item.carbs} g, G {item.fat} g
              </span>
              <span className="w-16 text-right font-bold tabular-nums">{foodKcal(item)} kcal</span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="rounded p-1 text-muted hover:bg-tint-strong hover:text-danger print:hidden"
                  aria-label={`Quitar ${item.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Sin alimentos asignados.</p>
      )}

      {!readOnly &&
        (adding ? (
          <AddFoodForm mealLabel={meal.label} onAdd={onAdd} onCancel={() => setAdding(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-highlight hover:underline print:hidden"
          >
            <Plus className="size-4" aria-hidden="true" /> Agregar alimento
          </button>
        ))}
    </li>
  );
}

// Tiempos de comida en orden del dia; share = parte de las kcal diarias sugerida para cada uno.
export const MEALS = Object.freeze([
  { code: 'desayuno', label: 'Desayuno', time: '08:00', share: 0.25 },
  { code: 'colacion1', label: 'Colacion de media manana', time: '11:00', share: 0.1 },
  { code: 'comida', label: 'Comida', time: '14:30', share: 0.35 },
  { code: 'colacion2', label: 'Colacion de la tarde', time: '17:30', share: 0.1 },
  { code: 'cena', label: 'Cena', time: '20:30', share: 0.2 },
]);

// Distribucion de macronutrientes de referencia y su aporte energetico por gramo.
export const MACROS = Object.freeze([
  { code: 'protein', label: 'Proteinas', share: 0.25, kcalPerGram: 4, color: 'var(--chart-4)' },
  { code: 'carbs', label: 'Carbohidratos', share: 0.5, kcalPerGram: 4, color: 'var(--chart-3)' },
  { code: 'fat', label: 'Grasas', share: 0.25, kcalPerGram: 9, color: 'var(--chart-1)' },
]);

export function macroTargets(kcal) {
  return Object.fromEntries(MACROS.map((m) => [m.code, Math.round((kcal * m.share) / m.kcalPerGram)]));
}

export function foodKcal(item) {
  return Math.round(MACROS.reduce((sum, m) => sum + (Number(item[m.code]) || 0) * m.kcalPerGram, 0));
}

export function sumFoods(items) {
  return items.reduce(
    (acc, item) => ({
      kcal: acc.kcal + foodKcal(item),
      protein: acc.protein + Number(item.protein),
      carbs: acc.carbs + Number(item.carbs),
      fat: acc.fat + Number(item.fat),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function planTotals(plan) {
  return sumFoods(MEALS.flatMap((meal) => plan.meals[meal.code] ?? []));
}

export const EMPTY_FOOD = Object.freeze({ name: '', portion: '', protein: '', carbs: '', fat: '' });

export function validateFood(food) {
  const errors = {};
  if (!food.name.trim()) errors.name = 'Escribe el alimento';
  if (!food.portion.trim()) errors.portion = 'Indica la porcion';
  for (const m of MACROS) {
    const value = Number(food[m.code]);
    if (food[m.code] === '' || !(value >= 0 && value <= 300)) errors[m.code] = '0 a 300 g';
  }
  return errors;
}

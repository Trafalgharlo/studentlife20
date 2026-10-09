(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StudentLife = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const days = [
    "Понедельник",
    "Вторник",
    "Среда",
    "Четверг",
    "Пятница",
    "Суббота",
    "Воскресенье",
  ];
  const categories = ["Еда", "Одежда", "Мыльно-рыльное", "Прочее"];
  const dateKey = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  function addDays(date, amount) {
    const result = new Date(`${date}T12:00:00`);
    result.setDate(result.getDate() + amount);
    return dateKey(result);
  }
  function monday(date) {
    const d = new Date(`${date}T12:00:00`);
    return addDays(date, -((d.getDay() + 6) % 7));
  }
  function nutrition(ingredients) {
    const total = { grams: 0, kcal: 0, protein: 0, fat: 0, carbs: 0 };
    for (const item of ingredients || []) {
      total.grams += Number(item.grams) || 0;
      for (const key of ["kcal", "protein", "fat", "carbs"])
        total[key] +=
          ((Number(item[key]) || 0) * (Number(item.grams) || 0)) / 100;
    }
    return total;
  }
  function weeklyExpenses(finance, week) {
    const end = addDays(week, 7);
    const totals = Object.fromEntries(
      categories.map((category) => [category, 0]),
    );
    for (const item of finance) {
      if (item.kind !== "Расход" || item.date < week || item.date >= end)
        continue;
      const category = categories.includes(item.category)
        ? item.category
        : "Прочее";
      totals[category] += Math.round(Number(item.amount) * 100);
    }
    for (const category of categories) totals[category] /= 100;
    return {
      categories: totals,
      total:
        Object.values(totals).reduce(
          (sum, value) => sum + Math.round(value * 100),
          0,
        ) / 100,
    };
  }
  function nextDate(day, from) {
    const index = (new Date(`${from}T12:00:00`).getDay() + 6) % 7;
    return addDays(from, (days.indexOf(day) - index + 7) % 7);
  }
  function defaultWorkouts() {
    return [0, 1, 3, 4].map((day, index) => ({
      id: `routine-${day}`,
      title: index % 2 ? "Низ тела" : "Верх тела",
      type: index % 2 ? "Низ" : "Верх",
      day: days[day],
      time: "17:30",
      exercises: [],
      demo: false,
    }));
  }
  function migrate(old) {
    const value = structuredClone(old);
    value.products ||= [];
    value.gymLogs ||= [];
    value.schedule = (value.schedule || []).map((item) => ({
      ...item,
      homework: Array.isArray(item.homework) ? item.homework : [],
    }));
    value.meals = (value.meals || []).map((item) => ({
      ...item,
      servings: item.servings || 1,
      ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
      legacyIngredients:
        typeof item.ingredients === "string"
          ? item.ingredients
          : item.legacyIngredients || "",
    }));
    value.finance = (value.finance || []).map((item) => ({
      ...item,
      category:
        item.category === "Продукты"
          ? "Еда"
          : categories.includes(item.category)
            ? item.category
            : "Прочее",
    }));
    if (
      (!value.schemaVersion && !value.gym?.length) ||
      value.gym?.some((item) => !Array.isArray(item.exercises))
    ) {
      const legacy = value.gym || [];
      value.gym = defaultWorkouts();
      for (const item of legacy) {
        const workout = {
          id: item.id,
          title: item.title,
          type: "Другое",
          day: days[(new Date(`${item.date}T12:00:00`).getDay() + 6) % 7],
          time: "17:30",
          demo: item.demo,
          exercises: [
            {
              id: `${item.id}-exercise`,
              name: item.title,
              weighted: false,
              sets: Array.from(
                { length: Math.min(100, item.sets || 1) },
                () => ({ reps: item.reps || 0, weight: 0, done: !!item.done }),
              ),
            },
          ],
        };
        value.gym.push(workout);
        value.gymLogs.push({
          workoutId: item.id,
          title: item.title,
          time: "17:30",
          date: item.date,
          exercises: structuredClone(workout.exercises),
          done: !!item.done,
          demo: item.demo,
        });
      }
    }
    // Retain removed dorm data in storage for recovery, but never display or upload it.
    value.schemaVersion = 2;
    return value;
  }
  function zonedParts(now, timeZone) {
    return Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(now)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
  }
  function zonedDate(now, timeZone) {
    const p = zonedParts(now, timeZone);
    return `${p.year}-${p.month}-${p.day}`;
  }
  function toUTC(date, time, timeZone) {
    const target = Date.parse(`${date}T${time}:00Z`);
    if (!Number.isFinite(target)) throw new Error("Invalid date/time");
    let result = target;
    for (let i = 0; i < 4; i++) {
      const p = zonedParts(new Date(result), timeZone);
      const wall = Date.parse(
        `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
      );
      const delta = target - wall;
      result += delta;
      if (!delta) break;
    }
    return result;
  }
  function notificationEvents(state, now = new Date()) {
    const timezone = state.timezone;
    const current = zonedDate(now, timezone);
    const events = [];
    function push(id, due, expires, text) {
      if (due > now.getTime())
        events.push({
          id,
          due_at: new Date(due).toISOString(),
          expires_at: new Date(expires).toISOString(),
          text: text.slice(0, 4000),
        });
    }
    for (const item of state.schedule.filter((item) => !item.demo)) {
      for (let i = 0; i < 8; i++) {
        const date = addDays(current, i);
        if (days[(new Date(`${date}T12:00:00`).getDay() + 6) % 7] !== item.day)
          continue;
        const start = toUTC(date, item.start, timezone);
        push(
          `leave:${item.id}:${date}`,
          start - 30 * 60000,
          start,
          `🎒 Пора выходить! Через 30 минут ${item.title}, в ${item.start}. ${item.room || ""}`,
        );
      }
      for (const homework of item.homework || []) {
        if (homework.done) continue;
        const start = toUTC(homework.date, item.start, timezone);
        for (const [hours, label] of [
          [48, "2 дня"],
          [24, "1 день"],
          [10, "10 часов"],
        ]) {
          push(
            `hw:${item.id}:${homework.id}:${homework.date}:${hours}`,
            start - hours * 3600000,
            start,
            `📚 До пары «${item.title}» ${label}. ДЗ: ${homework.text}. Срок: ${homework.date} ${homework.time || item.start}.`,
          );
        }
      }
    }
    for (const item of state.reminders.filter(
      (item) => !item.demo && !item.done,
    )) {
      const due = toUTC(item.date, item.time, timezone);
      push(
        `task:${item.id}:${item.date}:${item.time}`,
        due,
        due + 3600000,
        `🔔 ${item.title}${item.note ? "\n" + item.note : ""}`,
      );
    }
    const week = monday(current);
    // Sunday 21:00 summary. The cron worker recomputes it from the latest saved expenses.
    for (const start of [week, addDays(week, 7)]) {
      const due = toUTC(addDays(start, 6), "21:00", timezone);
      const report = weeklyExpenses(
        state.finance.filter((item) => !item.demo),
        start,
      );
      push(
        `weekly:${start}`,
        due,
        due + 12 * 3600000,
        `💸 Расходы за неделю ${start}–${addDays(start, 6)}: ${report.total.toFixed(2)} ₸\n` +
          categories
            .map(
              (category) =>
                `${category}: ${report.categories[category].toFixed(2)} ₸`,
            )
            .join("\n"),
      );
    }
    return events;
  }
  return {
    days,
    categories,
    dateKey,
    addDays,
    monday,
    nutrition,
    weeklyExpenses,
    nextDate,
    defaultWorkouts,
    migrate,
    toUTC,
    zonedDate,
    notificationEvents,
  };
});

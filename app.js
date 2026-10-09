"use strict";
(() => {
  const D = StudentLife,
    $ = (s) => document.querySelector(s),
    uid = () => crypto.randomUUID(),
    today = () => D.dateKey(new Date());
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const num = (n) =>
      new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(n),
    money = (n) =>
      new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) +
      " ₸";
  const day = () => D.days[(new Date().getDay() + 6) % 7];
  const modules = {
    schedule: {
      title: "Расписание пар",
      icon: "📚",
      desc: "Пары, домашние задания и время выходить.",
      color: "#eee9ff",
    },
    reminders: {
      title: "Напоминания",
      icon: "🔔",
      desc: "Твои задачи и уведомления в Telegram.",
      color: "#fff1d8",
    },
    meals: {
      title: "Что приготовить?",
      icon: "🍳",
      desc: "Твои блюда, ингредиенты и расчёт КБЖУ.",
      color: "#ffede5",
    },
    gym: {
      title: "Качалка",
      icon: "🏋️",
      desc: "Верх / низ. План и результаты каждой тренировки.",
      color: "#e8efff",
    },
    finance: {
      title: "Финансы",
      icon: "💸",
      desc: "Каждая покупка на месте. Вся неделя перед глазами.",
      color: "#fce8f1",
    },
  };
  const fields = {
    schedule: [
      ["title", "Предмет", "text"],
      ["day", "День недели", D.days],
      ["start", "Начало пары", "time"],
      ["end", "Конец пары", "time"],
      ["room", "Аудитория", "text"],
      ["teacher", "Преподаватель", "text", true],
    ],
    reminders: [
      ["title", "Что нужно сделать?", "text"],
      ["date", "Дата", "date"],
      ["time", "Время", "time"],
      ["note", "Заметка", "textarea", true],
    ],
    meals: [
      ["title", "Название блюда", "text"],
      ["minutes", "Время приготовления, мин", "number"],
      ["servings", "Количество порций", "number"],
      ["recipe", "Как приготовить", "textarea", true],
    ],
    gym: [
      ["title", "Название тренировки", "text"],
      ["type", "Тип", ["Верх", "Низ", "Другое"]],
      ["day", "День недели", D.days],
      ["time", "Начало", "time"],
    ],
    finance: [
      ["title", "Что купил / описание дохода", "text"],
      ["kind", "Тип", ["Расход", "Доход"]],
      ["amount", "Сумма, ₸", "money"],
      ["category", "Категория", D.categories],
      ["date", "Дата (сегодня подставляется автоматически)", "date"],
    ],
  };
  const seed = {
    schemaVersion: 2,
    schedule: [
      {
        title: "Высшая математика",
        day: day(),
        start: "09:00",
        end: "10:30",
        room: "Корпус А · 304",
        teacher: "Иванова А. С.",
        homework: [],
      },
    ],
    reminders: [
      {
        title: "Сдать лабораторную работу",
        date: today(),
        time: "18:00",
        note: "Проверить выводы и прикрепить отчёт.",
      },
    ],
    meals: [
      {
        title: "Рис с яйцом",
        minutes: 20,
        servings: 1,
        recipe: "Отвари рис, приготовь яйцо и соедини.",
        ingredients: [
          {
            name: "Рис (сухой)",
            grams: 100,
            kcal: 350,
            protein: 7,
            fat: 1,
            carbs: 78,
          },
          {
            name: "Яйцо",
            grams: 60,
            kcal: 155,
            protein: 13,
            fat: 11,
            carbs: 1.1,
          },
        ],
      },
    ],
    gym: D.defaultWorkouts(),
    gymLogs: [],
    products: [],
    finance: [
      {
        title: "Продукты на неделю",
        kind: "Расход",
        amount: 8500,
        date: today(),
        category: "Еда",
      },
    ],
    notifications: {
      enabled: false,
      timezone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Qyzylorda",
    },
  };
  for (const key of ["schedule", "reminders", "meals", "finance"])
    seed[key].forEach((item, i) =>
      Object.assign(item, { id: `demo-${key}-${i}`, demo: true, done: false }),
    );
  const storageKey = "student-life:v2";
  let data = structuredClone(seed),
    week = D.monday(today()),
    financeWeek = week,
    category = "Все",
    selectedDay = day(),
    selectedMeal = null,
    editing = null,
    deleting = null,
    toastTimer,
    syncTimer,
    syncInFlight = false,
    syncAgain = null,
    notificationStatus = "";
  function toast(text) {
    $("#status").textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("#status").textContent = ""), 5000);
  }
  try {
    const raw = localStorage.getItem(storageKey),
      old = localStorage.getItem("student-life:v1");
    if (raw || old) {
      const saved = JSON.parse(raw || old);
      if (
        !saved ||
        !Object.keys(modules).every(
          (k) =>
            Array.isArray(saved[k]) &&
            saved[k].every(
              (x) =>
                x && typeof x.id === "string" && typeof x.title === "string",
            ),
        )
      )
        throw Error("Invalid data");
      data = D.migrate(saved);
      data.notifications ||= structuredClone(seed.notifications);
      if (!raw) localStorage.setItem(storageKey, JSON.stringify(data));
    }
  } catch {
    toast(
      "Не удалось прочитать данные. Открыты примеры; старое хранилище сохранено.",
    );
  }
  function persist(sync = true) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      toast(
        "Браузер не сохранил изменения. Они доступны до закрытия страницы.",
      );
      return false;
    }
    if (sync && data.notifications.enabled) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => syncNotifications(), 600);
    }
    return true;
  }
  const tg = window.Telegram?.WebApp;
  function theme() {
    document.documentElement.dataset.theme =
      tg?.colorScheme ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    for (const edge of ["top", "bottom", "left", "right"])
      document.documentElement.style.setProperty(
        `--safe-${edge}`,
        `${(tg?.contentSafeAreaInset?.[edge] || 0) + (tg?.safeAreaInset?.[edge] || 0)}px`,
      );
  }
  theme();
  if (tg) {
    tg.ready();
    tg.expand();
    for (const event of [
      "themeChanged",
      "safeAreaChanged",
      "contentSafeAreaChanged",
    ])
      tg.onEvent?.(event, theme);
    tg.BackButton?.onClick(() => {
      if ($("#editor").open) $("#editor").close();
      else if ($("#confirm").open) $("#confirm").close();
      else location.hash = "home";
    });
  } else
    matchMedia("(prefers-color-scheme: dark)").addEventListener(
      "change",
      theme,
    );
  const route = () =>
    Object.hasOwn(modules, location.hash.slice(1))
      ? location.hash.slice(1)
      : "home";
  function syncBack() {
    if (tg?.BackButton)
      tg.BackButton[
        route() !== "home" || $("#editor").open || $("#confirm").open
          ? "show"
          : "hide"
      ]();
  }
  const badge = (x) => (x.demo ? '<span class="badge">Демо</span>' : "");
  const stat = (icon, value, label) =>
    `<div class="stat"><span class="icon-tile">${icon}</span><div><strong>${esc(value)}</strong><small>${label}</small></div></div>`;
  const empty = (text) =>
    `<div class="empty"><span>☁</span><p>${text}</p></div>`;
  const actions = (x) =>
    `<div class="actions"><button class="icon-button" data-edit="${esc(x.id)}" aria-label="Редактировать: ${esc(x.title)}">✎</button><button class="icon-button" data-delete="${esc(x.id)}" aria-label="Удалить: ${esc(x.title)}">×</button></div>`;
  function macros(ingredients, servings = 1) {
    const t = D.nutrition(ingredients),
      line = (div = 1) =>
        `${num(t.kcal / div)} ккал · Б ${num(t.protein / div)} · Ж ${num(t.fat / div)} · У ${num(t.carbs / div)} г`;
    return `<div class="nutrition"><strong>Всё блюдо: ${line()}</strong><span>Порция: ${line(servings)} · порций: ${servings}</span>${t.grams ? `<span>На 100 г ингредиентов: ${line(t.grams / 100)}</span>` : ""}<small>По введённым значениям. Масса ингредиентов до приготовления; изменение массы при готовке не учтено.</small></div>`;
  }
  function row(key, x) {
    let detail = "",
      extra = "";
    if (key === "schedule") {
      detail = `${x.start}–${x.end} · ${x.room}\n${x.teacher || ""}`;
      extra = `<p class="hint">🎒 Выход за 30 минут до каждой пары</p><div class="homework-list">${x.homework.map((hw) => `<label class="homework-item ${hw.done ? "completed" : ""}"><input class="check" type="checkbox" data-homework="${esc(hw.id)}" data-class="${esc(x.id)}" ${hw.done ? "checked" : ""}><span><strong>ДЗ: ${esc(hw.text)}</strong><small>Пара ${esc(hw.date)} в ${esc(x.start)} · сдать до ${esc(hw.time)}</small></span></label>`).join("")}</div>`;
    }
    if (key === "reminders")
      detail = `${x.date} · ${x.time}${x.note ? "\n" + x.note : ""}`;
    if (key === "meals") {
      detail = `${x.minutes} мин · ${x.servings} порц.\n${x.ingredients.map((i) => `${i.name} — ${i.grams} г`).join(", ")}${x.legacyIngredients ? "\nСтарый состав: " + x.legacyIngredients : ""}${x.recipe ? "\n" + x.recipe : ""}`;
      extra = x.ingredients.length
        ? macros(x.ingredients, x.servings)
        : '<p class="hint">КБЖУ ещё не заполнено. Добавь ингредиенты и значения на 100 г.</p>';
    }
    if (key === "finance") {
      detail = `${x.date} · ${x.category}`;
      extra = `<strong class="${x.kind === "Доход" ? "money-positive" : "money-negative"}">${x.kind === "Доход" ? "+" : "−"}${money(x.amount)}</strong>`;
    }
    return `<article class="row ${x.done ? "done" : ""}">${key === "reminders" ? `<input class="check" type="checkbox" data-toggle="${esc(x.id)}" ${x.done ? "checked" : ""} aria-label="Выполнено: ${esc(x.title)}">` : `<span class="icon-tile" aria-hidden="true">${modules[key].icon}</span>`}<div class="row-body"><h3>${esc(x.title)}${badge(x)}</h3><p>${esc(detail)}</p>${extra}</div>${actions(x)}</article>`;
  }
  const workoutDate = (x) => D.addDays(week, D.days.indexOf(x.day));
  function historyPanel() {
    const logs = data.gymLogs
      .filter((log) => log.date >= week && log.date < D.addDays(week, 7))
      .sort((a, b) => b.date.localeCompare(a.date));
    if (!logs.length) return "";
    return `<div class="section-head"><h2>Журнал за неделю</h2></div><div class="rows">${logs
      .map((log) => {
        const name =
          log.title ||
          data.gym.find((x) => x.id === log.workoutId)?.title ||
          "Тренировка";
        return `<article class="panel history-record"><h3>${esc(name)}${badge(log)}</h3><p class="hint">${esc(log.date)} · ${esc(log.time || "17:30")}</p><div class="exercise-summary">${log.exercises.map((ex) => `<div><strong>${esc(ex.name)}</strong><small>${ex.sets.map((s) => `${s.reps} повт.${ex.weighted ? " × " + s.weight + " кг" : ""}${s.done ? " ✓" : ""}`).join(" · ")}</small></div>`).join("")}</div><button class="secondary" data-log="${esc(log.workoutId)}" data-log-date="${esc(log.date)}">Изменить запись</button></article>`;
      })
      .join("")}</div>`;
  }
  function gymCard(x) {
    const date = workoutDate(x),
      log = data.gymLogs.find((l) => l.workoutId === x.id && l.date === date),
      exercises = log?.exercises || x.exercises,
      done =
        log?.exercises.reduce(
          (n, e) => n + e.sets.filter((s) => s.done).length,
          0,
        ) || 0,
      count = exercises.reduce((n, e) => n + e.sets.length, 0);
    return `<article class="panel workout"><div class="section-head"><div><span class="badge">${esc(x.type)}</span><h2>${esc(x.title)}${badge(x)}</h2><p class="hint">${esc(x.day)} · ${date} · ${esc(x.time)}</p></div>${actions(x)}</div><div class="exercise-summary">${exercises.length ? exercises.map((e) => `<div><strong>${esc(e.name)}</strong><small>${e.weighted ? "С доп. весом" : "Без доп. веса"} · ${e.sets.map((s, i) => `${i + 1}: ${s.reps || "—"} повт.${e.weighted ? " × " + (s.weight || 0) + " кг" : ""}${s.done ? " ✓" : ""}`).join(" · ")}</small></div>`).join("") : empty("Добавь упражнения в план тренировки.")}</div><div class="section-head"><span class="hint">${log ? `Записано: ${done}/${count} подходов` : "Результаты за этот день ещё не записаны"}</span><button class="primary" data-log="${esc(x.id)}" ${x.exercises.length ? "" : "disabled"}>Записать результат</button></div></article>`;
  }
  function weekPicker(value, kind) {
    return `<div class="week-picker"><button class="secondary" data-week="${kind}" data-shift="-7" aria-label="Предыдущая неделя">←</button><strong>${value} — ${D.addDays(value, 6)}</strong><button class="secondary" data-week="${kind}" data-shift="7" aria-label="Следующая неделя">→</button><button class="secondary" data-week="${kind}" data-shift="0">Эта неделя</button></div>`;
  }
  function financePanel() {
    const r = D.weeklyExpenses(data.finance, financeWeek),
      previous = D.weeklyExpenses(
        data.finance,
        D.addDays(D.monday(today()), -7),
      );
    return `${weekPicker(financeWeek, "finance")}<section class="panel"><h2>Расходы за выбранную неделю</h2><div class="stats finance-stats">${stat("💸", money(r.total), "Всего · включая демо")}${stat("↶", money(previous.total), "Прошлая завершённая неделя")}</div><div class="expense-chart">${D.categories.map((c) => `<div><div class="chart-label"><span>${c}</span><strong>${money(r.categories[c])}</strong></div><progress aria-label="${c}" max="${r.total || 1}" value="${r.categories[c]}"></progress></div>`).join("")}</div><p class="hint">Неделя: понедельник–воскресенье. Итог в Telegram: воскресенье, 21:00, если подключены уведомления.</p></section><div class="tabs" role="group" aria-label="Категории расходов">${["Все", ...D.categories].map((c) => `<button class="tab ${c === category ? "active" : ""}" data-category="${c}" aria-pressed="${c === category}">${c}</button>`).join("")}</div>`;
  }
  function notificationPanel() {
    return `<section class="panel notification-settings"><div class="section-head"><h2>Уведомления на телефон</h2><span class="badge">${data.notifications.enabled ? "Подключены" : "Не подключены"}</span></div><p>ДЗ: за 2 дня, за день и за 10 часов до пары. Выход: за 30 минут до каждой пары. Задачи: в указанное время. Финансы: итог недели в воскресенье в 21:00.</p><label class="field">Часовой пояс<input id="timezone" value="${esc(data.notifications.timezone)}" maxlength="80" placeholder="Asia/Qyzylorda"></label><p class="hint">После настройки сервера сообщения приходят в чат бота, даже когда приложение закрыто. Демо-записи не отправляются. Звук выбери в Telegram: профиль бота → Уведомления → Звук. Доставка зависит также от настроек телефона и Telegram.</p><p id="notification-status" role="status">${esc(notificationStatus || "Для подключения открой Mini App в Telegram. Сервер должен быть настроен владельцем приложения.")}</p><div class="form-actions"><button class="secondary" data-notifications="disable" ${data.notifications.enabled ? "" : "disabled"}>Отключить</button><button class="primary" data-notifications="enable">${data.notifications.enabled ? "Сохранить и синхронизировать" : "Подключить Telegram"}</button></div></section>`;
  }
  function mealPanel() {
    const x = data.meals.find((x) => x.id === selectedMeal);
    return `<section class="random"><span aria-hidden="true">🍲</span><h2>${x ? esc(x.title) + badge(x) : "Что сегодня приготовить?"}</h2><p>${x ? esc(x.ingredients.map((i) => `${i.name} — ${i.grams} г`).join(", ")) : "Добавляй свои блюда и выбирай случайное из списка."}</p>${x && x.ingredients.length ? macros(x.ingredients, x.servings) : ""}<button class="primary" data-random ${data.meals.length ? "" : "disabled"}>↻ ${x ? "Ещё вариант" : "Выбрать блюдо"}</button></section><p class="hint">Сохранённых ингредиентов: ${data.products.length}. Выбери название при добавлении состава, чтобы подставить КБЖУ.</p>`;
  }
  function home() {
    return `<section class="hero"><span class="eyebrow">ЖИЗНЬ — ЭТО БОЛЬШЕ, ЧЕМ ПАРЫ</span><h2>Планы в порядке.<br>Ты — в моменте.</h2><p>Учись, тренируйся и находи время для себя. Остальное соберём здесь.</p><a class="primary" href="#schedule">Моё расписание →</a><span class="hero-art" aria-hidden="true">🎒</span></section><div class="section-head"><h2>Твой день в цифрах</h2><small>Включая демонстрационные записи</small></div><div class="stats">${stat("📚", data.schedule.filter((x) => x.day === day()).length, "Пар сегодня")}${stat("☑", data.reminders.filter((x) => x.date === today() && !x.done).length, "Дел на сегодня")}${stat("⚡", data.gym.filter((x) => x.day === day()).length, "Тренировок сегодня")}</div><div class="section-head"><h2>Всё, что тебе нужно</h2><small>Пять разделов. Один ритм.</small></div><div class="cards">${Object.entries(
      modules,
    )
      .map(
        ([k, m]) =>
          `<a class="module" href="#${k}"><div class="module-top"><span class="icon-tile" style="--tile:${m.color}">${m.icon}</span><span class="arrow">↗</span></div><h3>${m.title}</h3><p>${m.desc}</p><div class="module-meta">${data[k].length} записей · открыть →</div></a>`,
      )
      .join("")}</div>`;
  }
  function render() {
    const key = route();
    $("#navigation").innerHTML = [
      ["home", { title: "Мой день", icon: "◈" }],
      ...Object.entries(modules),
    ]
      .map(
        ([k, m]) =>
          `<a href="#${k}" class="nav-link ${k === key ? "active" : ""}" ${k === key ? 'aria-current="page"' : ""}><span class="nav-icon" aria-hidden="true">${m.icon}</span>${m.title}</a>`,
      )
      .join("");
    $("#heading").textContent =
      key === "home" ? "Привет! Как твой день?" : modules[key].title;
    $("#subtitle").textContent =
      key === "home"
        ? "Твой маленький помощник для большой студенческой жизни."
        : modules[key].desc;
    $("#date").textContent = new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      weekday: "short",
    }).format(new Date());
    if (key === "home") $("#view").innerHTML = home();
    else {
      let extra = "",
        items = [...data[key]];
      if (key === "schedule") {
        extra = `<div class="tabs" role="group" aria-label="День недели">${D.days.map((d) => `<button class="tab ${d === selectedDay ? "active" : ""}" data-day="${d}" aria-label="${d}" aria-pressed="${d === selectedDay}">${d.slice(0, 2)}</button>`).join("")}</div><p class="hint">Расписание повторяется каждую неделю. ДЗ привязывается к дате пары; сдать можно к своему времени. Уведомления подключаются в разделе «Напоминания».</p>`;
        items = items
          .filter((x) => x.day === selectedDay)
          .sort((a, b) => a.start.localeCompare(b.start));
      }
      if (key === "reminders") {
        extra = notificationPanel();
        items.sort(
          (a, b) =>
            Number(a.done) - Number(b.done) ||
            a.date.localeCompare(b.date) ||
            a.time.localeCompare(b.time),
        );
      }
      if (key === "finance") {
        extra = financePanel();
        items = items
          .filter(
            (x) =>
              x.date >= financeWeek &&
              x.date < D.addDays(financeWeek, 7) &&
              (category === "Все" || x.category === category),
          )
          .sort((a, b) => b.date.localeCompare(a.date));
      }
      if (key === "meals") extra = mealPanel();
      if (key === "gym") {
        extra =
          weekPicker(week, "gym") +
          '<p class="hint">Верх — Пн/Чт, низ — Вт/Пт в 17:30. План повторяется каждую неделю, дни и упражнения можно менять. Результаты сохраняются отдельно по датам.</p>';
        items.sort(
          (a, b) =>
            D.days.indexOf(a.day) - D.days.indexOf(b.day) ||
            a.time.localeCompare(b.time),
        );
      }
      $("#view").innerHTML =
        extra +
        `<div class="section-head"><h2>${key === "schedule" ? selectedDay : key === "gym" ? "План тренировок" : key === "meals" ? "Мои блюда" : "Мои записи"} <span class="badge">${items.length}</span></h2><button class="primary" data-add="${key}">＋ ${key === "gym" ? "Тренировка" : "Добавить"}</button></div><div class="rows">${items.length ? items.map((x) => (key === "gym" ? gymCard(x) : row(key, x))).join("") : empty("Здесь пока пусто. Добавь первую запись.")}</div>`;
    }
    if (key === "gym")
      $("#view").insertAdjacentHTML("beforeend", historyPanel());
    syncBack();
  }
  function field(name, label, type, value = "", optional = false) {
    let input;
    if (Array.isArray(type))
      input = `<select name="${name}">${type.map((o) => `<option ${o === value ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    else if (type === "textarea")
      input = `<textarea name="${name}" maxlength="2000" ${optional ? "" : "required"}>${esc(value)}</textarea>`;
    else
      input = `<input name="${name}" type="${type === "money" ? "number" : type}" value="${esc(value)}" ${optional ? "" : "required"} ${["number", "money"].includes(type) ? `min="${type === "money" ? "0.01" : "1"}" max="${type === "money" ? "1000000000" : "10000"}" step="${type === "money" ? "0.01" : "1"}"` : 'maxlength="150"'}>`;
    return `<label class="field">${label}${optional ? " (необязательно)" : ""}${input}</label>`;
  }
  function numeric(name, label, value, min = 0, max = 10000, step = "any") {
    return `<label class="field">${label}<input data-value="${name}" type="number" min="${min}" max="${max}" step="${step}" value="${esc(value)}" required></label>`;
  }
  function setRow(s = {}, weighted = false) {
    return `<div class="set-row">${numeric("reps", "Повторения", s.reps || 0, 0, 1000, "1")}<div class="weight-field" ${weighted ? "" : "hidden"}>${numeric("weight", "Вес, кг", weighted ? s.weight || 0 : 0, 0, 1000, "any")}</div>${editing?.mode === "log" ? `<label class="checkbox-label"><input type="checkbox" data-value="done" ${s.done ? "checked" : ""}> Сделано</label>` : ""}<button type="button" class="icon-button" data-remove-set aria-label="Удалить подход">×</button></div>`;
  }
  function exerciseRow(e = {}) {
    return `<fieldset class="exercise-editor" data-exercise-id="${esc(e.id || uid())}"><legend>Упражнение</legend><div class="section-head"><label class="field grow">Название<input data-value="name" value="${esc(e.name || "")}" maxlength="150" required></label><button type="button" class="icon-button" data-remove-exercise aria-label="Удалить упражнение">×</button></div><label class="checkbox-label"><input type="checkbox" data-weighted ${e.weighted ? "checked" : ""}> Упражнение с доп. весом</label><div class="set-list">${(e.sets?.length ? e.sets : [{}]).map((s) => setRow(s, e.weighted)).join("")}</div><button type="button" class="secondary" data-add-set>＋ Подход</button></fieldset>`;
  }
  function ingredientRow(i = {}) {
    return `<fieldset class="ingredient-editor"><legend>Ингредиент</legend><div class="section-head"><label class="field grow">Название<input data-value="name" list="products" value="${esc(i.name || "")}" maxlength="150" required placeholder="Введи или выбери сохранённый"></label><button type="button" class="icon-button" data-remove-ingredient aria-label="Удалить ингредиент">×</button></div><div class="ingredient-values">${numeric("grams", "В блюде, г", i.grams ?? 100, 0.1, 100000)}${numeric("kcal", "Ккал / 100 г", i.kcal ?? "", 0, 1000)}${numeric("protein", "Белки / 100 г", i.protein ?? "", 0, 100)}${numeric("fat", "Жиры / 100 г", i.fat ?? "", 0, 100)}${numeric("carbs", "Углеводы / 100 г", i.carbs ?? "", 0, 100)}</div></fieldset>`;
  }
  function homeworkRow(hw = {}, item = {}) {
    return `<fieldset class="homework-editor" data-homework-id="${esc(hw.id || uid())}"><legend>Домашнее задание</legend><div class="section-head"><label class="field grow">Задание<textarea data-value="text" maxlength="2000" required>${esc(hw.text || "")}</textarea></label><button type="button" class="icon-button" data-remove-homework aria-label="Удалить домашнее задание">×</button></div><div class="ingredient-values"><label class="field">Дата пары<input data-value="date" type="date" value="${esc(hw.date || D.nextDate(item.day || selectedDay, today()))}" required></label><label class="field">Сдать до<input data-value="time" type="time" value="${esc(hw.time || item.start || "09:00")}" required></label></div><label class="checkbox-label"><input data-value="done" type="checkbox" ${hw.done ? "checked" : ""}> ДЗ выполнено</label><p class="hint">Напоминания за 48, 24 и 10 часов до начала пары в эту дату.</p></fieldset>`;
  }
  function openEditor(key, id, mode = "plan", recordDate) {
    const historical = recordDate
      ? data.gymLogs.find(
          (log) => log.workoutId === id && log.date === recordDate,
        )
      : null;
    const item =
        data[key].find((x) => x.id === id) ||
        (historical
          ? {
              ...historical,
              id,
              title: historical.title || "Тренировка",
              time: historical.time || "17:30",
            }
          : null),
      defaults = {
        date: today(),
        day: selectedDay,
        time: "17:30",
        servings: 1,
        minutes: 20,
        category: category === "Все" ? "Еда" : category,
      };
    editing = { key, id, mode, workout: item };
    $("#editor-title").textContent =
      mode === "log"
        ? "Результаты тренировки"
        : item
          ? "Редактировать запись"
          : "Новая запись";
    $("#form-error").textContent = "";
    let html = "";
    if (mode === "log") {
      const date = recordDate || workoutDate(item),
        log = data.gymLogs.find((x) => x.workoutId === id && x.date === date);
      html = `<p>${esc(item.title)} · ${date} · ${esc(item.time)}</p><input type="hidden" name="date" value="${date}"><p class="hint">Запиши фактические повторения и вес каждого подхода. «Сделано» отмечает выполненный подход. Этот журнал не меняет план других недель.</p><div id="exercises">${(log?.exercises || item.exercises).map((e) => exerciseRow({ ...e, sets: e.sets.map((s) => (log ? s : { reps: 0, weight: 0, done: false })) })).join("")}</div><button type="button" class="secondary" data-add-exercise>＋ Упражнение</button>`;
    } else {
      html = fields[key]
        .map(([n, l, t, o]) =>
          field(n, l, t, item?.[n] ?? defaults[n] ?? "", o),
        )
        .join("");
      if (key === "gym")
        html += `<p class="hint">План на каждую неделю. Результаты вводятся кнопкой «Записать результат».</p><div id="exercises">${(item?.exercises || []).map(exerciseRow).join("")}</div><button type="button" class="secondary" data-add-exercise>＋ Упражнение</button>`;
      if (key === "meals")
        html += `${item?.legacyIngredients ? `<p class="hint">Старый состав: ${esc(item.legacyIngredients)}. Перенеси ингредиенты ниже и укажи КБЖУ.</p>` : ""}<h3>Состав и КБЖУ на 100 г</h3><p class="hint">Вводи значения с упаковки. Ингредиенты сохранятся для следующих блюд. Для воды и других продуктов допустимы нулевые значения.</p><datalist id="products">${data.products.map((p) => `<option value="${esc(p.name)}"></option>`).join("")}</datalist><div id="ingredients">${(item?.ingredients.length ? item.ingredients : [{}]).map(ingredientRow).join("")}</div><button type="button" class="secondary" data-add-ingredient>＋ Ингредиент</button><div id="nutrition-preview"></div>`;
      if (key === "schedule")
        html += `<h3>ДЗ к конкретным парам</h3><div id="homeworks">${(item?.homework || []).map((hw) => homeworkRow(hw, item)).join("")}</div><button type="button" class="secondary" data-add-homework>＋ Домашнее задание</button>`;
    }
    if (item?.demo && mode !== "log")
      html +=
        '<label class="checkbox-label"><input type="checkbox" name="personal"> Это мои данные — убрать метку «Демо» и разрешить уведомления</label>';
    $("#fields").innerHTML = html;
    if (key === "meals") updateNutrition();
    $("#editor").showModal();
    syncBack();
  }
  function ingredients() {
    return [...document.querySelectorAll(".ingredient-editor")].map((r) =>
      Object.fromEntries(
        [...r.querySelectorAll("[data-value]")].map((i) => [
          i.dataset.value,
          i.dataset.value === "name" ? i.value.trim() : Number(i.value),
        ]),
      ),
    );
  }
  function exercises() {
    return [...document.querySelectorAll(".exercise-editor")].map((r) => ({
      id: r.dataset.exerciseId,
      name: r.querySelector('[data-value="name"]').value.trim(),
      weighted: r.querySelector("[data-weighted]").checked,
      sets: [...r.querySelectorAll(".set-row")].map((s) => ({
        reps: Number(s.querySelector('[data-value="reps"]').value),
        weight: r.querySelector("[data-weighted]").checked
          ? Number(s.querySelector('[data-value="weight"]').value)
          : 0,
        done: !!s.querySelector('[data-value="done"]')?.checked,
      })),
    }));
  }
  function updateNutrition() {
    if ($("#nutrition-preview"))
      $("#nutrition-preview").innerHTML = macros(
        ingredients(),
        Math.max(1, Number($('#fields [name="servings"]').value) || 1),
      );
  }
  const fail = (text) => ($("#form-error").textContent = text);
  $("#edit-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const { key, id, mode } = editing,
      old = data[key].find((x) => x.id === id) || editing.workout,
      v = Object.fromEntries(new FormData(event.target));
    if (mode === "log") {
      const e = exercises();
      if (
        !e.length ||
        e.some(
          (x) =>
            !x.name ||
            !x.sets.length ||
            x.sets.some((s) => s.done && s.reps < 1),
        )
      )
        return fail(
          "Добавь упражнение и подход. У выполненного подхода должно быть больше 0 повторений.",
        );
      data.gymLogs = data.gymLogs.filter(
        (x) => !(x.workoutId === id && x.date === v.date),
      );
      data.gymLogs.push({
        workoutId: id,
        title: old.title,
        time: old.time,
        date: v.date,
        exercises: e,
        demo: old.demo || false,
        done: e.every((x) => x.sets.every((s) => s.done)),
      });
    } else {
      for (const [n, , t, o] of fields[key]) {
        v[n] = ["number", "money"].includes(t) ? Number(v[n]) : v[n].trim();
        if (!o && !v[n])
          return fail(
            "Заполни обязательные поля. Пробелы не считаются текстом.",
          );
      }
      if (key === "schedule") {
        if (v.end <= v.start)
          return fail("Конец пары должен быть позже начала.");
        v.homework = [...document.querySelectorAll(".homework-editor")].map(
          (r) => ({
            id: r.dataset.homeworkId,
            ...Object.fromEntries(
              [...r.querySelectorAll("[data-value]")].map((i) => [
                i.dataset.value,
                i.type === "checkbox" ? i.checked : i.value.trim(),
              ]),
            ),
          }),
        );
        if (v.homework.some((hw) => !hw.text))
          return fail("Напиши текст каждого домашнего задания.");
        if (
          v.homework.some(
            (hw) =>
              D.days[(new Date(`${hw.date}T12:00:00`).getDay() + 6) % 7] !==
              v.day,
          )
        )
          return fail(
            "Дата ДЗ должна совпадать с днём недели пары. Исправь дату или день пары.",
          );
      }
      if (key === "gym") {
        v.exercises = exercises();
        if (v.exercises.some((e) => !e.name || !e.sets.length))
          return fail(
            "У каждого упражнения должно быть название и хотя бы один подход.",
          );
      }
      if (key === "meals") {
        v.ingredients = ingredients();
        if (!v.ingredients.length || v.ingredients.some((x) => !x.name))
          return fail("Добавь хотя бы один ингредиент и его название.");
        for (const i of v.ingredients) {
          const p = { ...i };
          delete p.grams;
          const index = data.products.findIndex(
            (x) => x.name.toLocaleLowerCase() === p.name.toLocaleLowerCase(),
          );
          if (index === -1) data.products.push(p);
          else data.products[index] = p;
        }
      }
      const personal = v.personal === "on";
      delete v.personal;
      const item = {
        ...old,
        ...v,
        id: old?.id || uid(),
        demo: (old?.demo || false) && !personal,
        done: old?.done || false,
      };
      if (old) data[key] = data[key].map((x) => (x.id === id ? item : x));
      else data[key].push(item);
      if (key === "schedule") selectedDay = v.day;
      if (key === "finance") {
        financeWeek = D.monday(v.date);
        category = "Все";
      }
    }
    const saved = persist();
    $("#editor").close();
    render();
    if (saved) toast("Сохранено в этом браузере.");
  });
  function notificationMessage(text) {
    notificationStatus = text;
    if ($("#notification-status")) $("#notification-status").textContent = text;
  }
  async function syncNotifications(enabled = data.notifications.enabled) {
    if (!tg?.initData) {
      notificationMessage("Открой Mini App внутри Telegram для подключения.");
      return false;
    }
    if (syncInFlight) {
      syncAgain = enabled;
      return false;
    }
    syncInFlight = true;
    notificationMessage("Синхронизация с сервером…");
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData: tg.initData,
          enabled,
          timezone: data.notifications.timezone,
          schedule: data.schedule,
          reminders: data.reminders,
          finance: data.finance,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Сервер недоступен.");
      data.notifications.enabled = enabled;
      persist(false);
      notificationMessage(
        enabled
          ? "Данные синхронизированы. Уведомления отправляет Telegram-бот."
          : "Уведомления отключены на сервере.",
      );
      if (route() === "reminders") render();
      return true;
    } catch (error) {
      notificationMessage(
        error.message === "Failed to fetch"
          ? "Сервер недоступен. Изменения сохранены только локально."
          : error.message,
      );
      if (data.notifications.enabled)
        toast(
          "Уведомления не обновлены: проверь подключение в разделе «Напоминания».",
        );
      return false;
    } finally {
      syncInFlight = false;
      if (syncAgain !== null) {
        const nextEnabled = syncAgain;
        syncAgain = null;
        setTimeout(() => syncNotifications(nextEnabled), 300);
      }
    }
  }
  async function connectNotifications(action) {
    clearTimeout(syncTimer);
    if (!tg?.initData)
      return notificationMessage(
        "Открой Mini App внутри Telegram. В браузере подключение недоступно.",
      );
    const timezone = $("#timezone").value.trim();
    try {
      new Intl.DateTimeFormat("ru-RU", { timeZone: timezone }).format();
    } catch {
      return notificationMessage(
        "Укажи действительный часовой пояс, например Asia/Qyzylorda.",
      );
    }
    data.notifications.timezone = timezone;
    persist(false);
    if (action === "disable") return syncNotifications(false);
    if (tg.requestWriteAccess && tg.isVersionAtLeast?.("6.9")) {
      const allowed = await new Promise((resolve) =>
        tg.requestWriteAccess(resolve),
      );
      if (!allowed)
        return notificationMessage(
          "Разреши боту отправлять сообщения для подключения уведомлений.",
        );
    }
    await syncNotifications(true);
  }
  document.addEventListener("click", (event) => {
    const b = event.target.closest("button");
    if (!b) return;
    const key = route();
    if (b.hasAttribute("data-close")) $("#editor").close();
    if (b.dataset.add) openEditor(b.dataset.add);
    if (b.dataset.edit) openEditor(key, b.dataset.edit);
    if (b.dataset.log)
      openEditor("gym", b.dataset.log, "log", b.dataset.logDate);
    if (b.dataset.day) {
      selectedDay = b.dataset.day;
      render();
    }
    if (b.dataset.category) {
      category = b.dataset.category;
      render();
    }
    if (b.dataset.week) {
      const current = b.dataset.week === "gym" ? week : financeWeek,
        value =
          Number(b.dataset.shift) === 0
            ? D.monday(today())
            : D.addDays(current, Number(b.dataset.shift));
      if (b.dataset.week === "gym") week = value;
      else financeWeek = value;
      render();
    }
    if (b.dataset.delete) {
      deleting = { key, id: b.dataset.delete };
      $("#confirm").showModal();
      syncBack();
    }
    if (b.hasAttribute("data-random")) {
      const pool = data.meals.filter(
        (x) => data.meals.length === 1 || x.id !== selectedMeal,
      );
      if (pool.length) {
        selectedMeal = pool[Math.floor(Math.random() * pool.length)].id;
        render();
      }
    }
    if (b.hasAttribute("data-add-exercise"))
      $("#exercises").insertAdjacentHTML("beforeend", exerciseRow());
    if (b.hasAttribute("data-remove-exercise"))
      b.closest(".exercise-editor").remove();
    if (b.hasAttribute("data-add-set")) {
      const e = b.closest(".exercise-editor");
      e.querySelector(".set-list").insertAdjacentHTML(
        "beforeend",
        setRow({}, e.querySelector("[data-weighted]").checked),
      );
    }
    if (b.hasAttribute("data-remove-set")) b.closest(".set-row").remove();
    if (b.hasAttribute("data-add-ingredient")) {
      $("#ingredients").insertAdjacentHTML("beforeend", ingredientRow());
      updateNutrition();
    }
    if (b.hasAttribute("data-remove-ingredient")) {
      b.closest(".ingredient-editor").remove();
      updateNutrition();
    }
    if (b.hasAttribute("data-add-homework")) {
      const f = $("#edit-form");
      $("#homeworks").insertAdjacentHTML(
        "beforeend",
        homeworkRow(
          {},
          { day: f.elements.day.value, start: f.elements.start.value },
        ),
      );
    }
    if (b.hasAttribute("data-remove-homework"))
      b.closest(".homework-editor").remove();
    if (b.dataset.notifications) connectNotifications(b.dataset.notifications);
  });
  document.addEventListener("input", (event) => {
    if (
      event.target.closest(".ingredient-editor") ||
      event.target.name === "servings"
    )
      updateNutrition();
    if (event.target.matches('.ingredient-editor [data-value="name"]')) {
      const p = data.products.find(
        (x) =>
          x.name.toLocaleLowerCase() ===
          event.target.value.trim().toLocaleLowerCase(),
      );
      if (p) {
        for (const k of ["kcal", "protein", "fat", "carbs"])
          event.target
            .closest("fieldset")
            .querySelector(`[data-value="${k}"]`).value = p[k];
        updateNutrition();
      }
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.hasAttribute("data-weighted"))
      event.target
        .closest(".exercise-editor")
        .querySelectorAll(".weight-field")
        .forEach((f) => {
          f.hidden = !event.target.checked;
          if (!event.target.checked) f.querySelector("input").value = 0;
        });
    if (event.target.dataset.toggle) {
      data.reminders.find((x) => x.id === event.target.dataset.toggle).done =
        event.target.checked;
      persist();
      render();
    }
    if (event.target.dataset.homework) {
      const hw = data.schedule
        .find((x) => x.id === event.target.dataset.class)
        ?.homework.find((x) => x.id === event.target.dataset.homework);
      if (hw) {
        hw.done = event.target.checked;
        persist();
        render();
      }
    }
  });
  $("#cancel-delete").onclick = () => $("#confirm").close();
  $("#confirm-delete").onclick = () => {
    if (!deleting) return;
    data[deleting.key] = data[deleting.key].filter((x) => x.id !== deleting.id);
    const saved = persist();
    $("#confirm").close();
    deleting = null;
    render();
    if (saved) toast("Запись удалена.");
  };
  for (const dialog of [$("#editor"), $("#confirm")])
    dialog.addEventListener("close", syncBack);
  window.addEventListener("hashchange", () => {
    if ($("#editor").open) $("#editor").close();
    if ($("#confirm").open) $("#confirm").close();
    render();
    $("#content").focus({ preventScroll: true });
  });
  render();
  if (data.notifications.enabled && tg?.initData) syncNotifications();
})();

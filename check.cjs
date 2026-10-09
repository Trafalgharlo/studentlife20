"use strict";
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
require("./preview.cjs");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.TEST_BROWSER_CHANNEL
      ? { channel: process.env.TEST_BROWSER_CHANNEL }
      : {}),
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://telegram.org/**", (r) => r.fulfill({ body: "" }));
  const go = async (key) => {
    await page.goto("http://127.0.0.1:4175/#" + key);
  };
  const fill = async (n, v) => page.locator(`[name="${n}"]`).fill(v);
  const save = async () => page.locator('#edit-form [type="submit"]').click();
  await go("home");
  assert.equal(await page.locator(".module").count(), 5);
  assert.equal(await page.getByText("Общага с друзьями").count(), 0);
  await page.screenshot({ path: "desktop-preview.png", fullPage: true });
  await go("gym");
  assert.equal(await page.locator(".workout").count(), 4);
  assert.equal(await page.getByText(/17:30/).count(), 5);
  await page.locator(".workout").first().locator("[data-edit]").click();
  await page.locator("[data-add-exercise]").click();
  let ex = page.locator(".exercise-editor").first();
  await ex.locator('[data-value="name"]').fill("Жим лёжа");
  await ex.locator("[data-weighted]").check();
  await ex.locator('[data-value="reps"]').fill("10");
  await ex.locator('[data-value="weight"]').fill("40");
  await ex.locator("[data-add-set]").click();
  await ex.locator('[data-value="reps"]').nth(1).fill("8");
  await ex.locator('[data-value="weight"]').nth(1).fill("45");
  await page.locator("[data-add-exercise]").click();
  ex = page.locator(".exercise-editor").nth(1);
  await ex.locator('[data-value="name"]').fill("Приседания");
  await ex.locator("[data-weighted]").check();
  await ex.locator('[data-value="weight"]').fill("20");
  await ex.locator("[data-weighted]").uncheck();
  assert.equal(await ex.locator('[data-value="weight"]').inputValue(), "0");
  assert.equal(await ex.locator(".weight-field").isVisible(), false);
  await ex.locator('[data-value="reps"]').fill("15");
  await save();
  await page.reload();
  assert.match(await page.locator(".workout").first().innerText(), /Жим лёжа/);
  await page.locator(".workout").first().locator("[data-log]").click();
  assert.equal(await page.locator(".exercise-editor").count(), 2);
  ex = page.locator(".exercise-editor").first();
  await ex.locator('[data-value="reps"]').first().fill("9");
  await ex.locator('[data-value="weight"]').first().fill("42.5");
  await ex.locator('[data-value="done"]').first().check();
  await save();
  await page.reload();
  assert.match(await page.locator(".workout").first().innerText(), /42.5 кг/);
  await page.locator('[data-week="gym"][data-shift="7"]').click();
  assert.match(
    await page.locator(".workout").first().innerText(),
    /ещё не записаны/,
  );
  assert.doesNotMatch(
    await page.locator(".workout").first().innerText(),
    /42.5 кг/,
  );
  await page.locator('[data-week="gym"][data-shift="-7"]').click();
  assert.match(await page.locator(".workout").first().innerText(), /42.5 кг/);
  await page.screenshot({ path: "gym-preview.png", fullPage: true });
  await page.locator(".workout").first().locator("[data-delete]").click();
  await page.locator("#confirm-delete").click();
  assert.match(await page.locator(".history-record").innerText(), /42.5 кг/);
  await page.locator(".history-record [data-log]").click();
  await page
    .locator(".exercise-editor")
    .first()
    .locator('[data-value="reps"]')
    .first()
    .fill("11");
  await save();
  assert.match(await page.locator(".history-record").innerText(), /11 повт./);
  console.log(
    "PASS upper/lower plan, multiple exercises/sets, optional weight, dated results and week isolation",
  );
  await go("meals");
  await page.locator("[data-add]").click();
  await fill("title", "Мой обед");
  await fill("servings", "2");
  let ingredient = page.locator(".ingredient-editor").first();
  for (const [k, v] of Object.entries({
    name: "Рис тест",
    grams: "200",
    kcal: "100",
    protein: "10",
    fat: "2",
    carbs: "20",
  }))
    await ingredient.locator(`[data-value="${k}"]`).fill(v);
  await page.locator("[data-add-ingredient]").click();
  ingredient = page.locator(".ingredient-editor").nth(1);
  for (const [k, v] of Object.entries({
    name: "Сыр тест",
    grams: "50",
    kcal: "400",
    protein: "20",
    fat: "10",
    carbs: "30",
  }))
    await ingredient.locator(`[data-value="${k}"]`).fill(v);
  assert.match(
    await page.locator("#nutrition-preview").innerText(),
    /Всё блюдо: 400 ккал/,
  );
  assert.match(
    await page.locator("#nutrition-preview").innerText(),
    /Порция: 200 ккал/,
  );
  await page.screenshot({ path: "meal-editor-preview.png", fullPage: true });
  await save();
  await page.reload();
  assert.match(
    await page
      .locator(".row")
      .filter({
        has: page.getByRole("heading", { name: "Мой обед", exact: true }),
      })
      .innerText(),
    /400 ккал/,
  );
  await page.locator("[data-add]").click();
  await fill("title", "Второе блюдо");
  ingredient = page.locator(".ingredient-editor").first();
  await ingredient.locator('[data-value="name"]').fill("Рис тест");
  assert.equal(
    await ingredient.locator('[data-value="kcal"]').inputValue(),
    "100",
  );
  await save();
  await page.locator("[data-random]").click();
  const first = await page.locator(".random h2").innerText();
  await page.locator("[data-random]").click();
  assert.notEqual(await page.locator(".random h2").innerText(), first);
  console.log(
    "PASS ingredient library reuse, nutrition totals/servings, persistence and randomizer",
  );
  await go("schedule");
  await page.locator("[data-add]").click();
  await fill("title", "Моя пара");
  await page.locator('[name="day"]').selectOption("Понедельник");
  await fill("start", "09:00");
  await fill("end", "10:30");
  await fill("room", "101");
  await page.locator("[data-add-homework]").click();
  const hw = page.locator(".homework-editor");
  await hw.locator('[data-value="text"]').fill("Задачи 1–3");
  await hw.locator('[data-value="date"]').fill("2026-10-13");
  await save();
  assert.match(await page.locator("#form-error").innerText(), /совпадать/);
  await hw.locator('[data-value="date"]').fill("2026-10-12");
  await hw.locator('[data-value="time"]').fill("08:00");
  await save();
  await page.reload();
  await page.locator('[data-day="Понедельник"]').click();
  let row = page.locator(".row").filter({
    has: page.getByRole("heading", { name: "Моя пара", exact: true }),
  });
  assert.match(await row.innerText(), /Задачи 1–3/);
  await row.locator("[data-homework]").check();
  await page.reload();
  await page.locator('[data-day="Понедельник"]').click();
  assert.equal(await row.locator("[data-homework]").isChecked(), true);
  console.log(
    "PASS homework date/time, weekday validation, completion and reload",
  );

  await go("schedule");
  const anchor = await page.evaluate(() =>
    StudentLife.monday(StudentLife.dateKey(new Date())),
  );
  await page.locator("#cycle-anchor").fill(anchor);
  await page.locator("#cycle-anchor-type").selectOption("Числитель");
  await page.locator('#cycle-form [type="submit"]').click();
  await page.locator('[data-day="Понедельник"]').click();
  for (const [title, type] of [
    ["Числитель тест", "Числитель"],
    ["Знаменатель тест", "Знаменатель"],
  ]) {
    await page.locator("[data-add]").click();
    await fill("title", title);
    await page.locator('[name="day"]').selectOption("Понедельник");
    await page.locator('[name="weekType"]').selectOption(type);
    await fill("start", "11:00");
    await fill("end", "12:30");
    await fill("room", "202");
    await save();
  }
  const numerator = page
      .locator(".row")
      .filter({
        has: page.getByRole("heading", { name: "Числитель тест", exact: true }),
      }),
    denominator = page
      .locator(".row")
      .filter({
        has: page.getByRole("heading", {
          name: "Знаменатель тест",
          exact: true,
        }),
      });
  assert.equal(await denominator.count(), 1);
  assert.equal(await numerator.count(), 0);
  assert.equal(
    await page.getByRole("heading", { name: "Моя пара", exact: true }).count(),
    1,
  );
  await page.locator('[data-week="schedule"][data-shift="7"]').click();
  assert.equal(await numerator.count(), 1);
  assert.equal(await denominator.count(), 0);
  await page.locator('[data-cycle-type="Знаменатель"]').click();
  assert.equal(await denominator.count(), 1);
  assert.equal(await numerator.count(), 0);
  await page.locator('[data-week="schedule"][data-shift="0"]').click();
  assert.equal(await numerator.count(), 1);
  await numerator.locator("[data-edit]").click();
  await page.locator("[data-add-homework]").click();
  let cycleHw = page.locator(".homework-editor");
  await cycleHw.locator('[data-value="text"]').fill("ДЗ только числитель");
  await cycleHw
    .locator('[data-value="date"]')
    .fill(await page.evaluate((a) => StudentLife.addDays(a, 7), anchor));
  await save();
  assert.match(await page.locator("#form-error").innerText(), /числителем/);
  await cycleHw.locator('[data-value="date"]').fill(anchor);
  await save();
  await page.reload();
  await page.locator('[data-day="Понедельник"]').click();
  assert.equal(await numerator.count(), 1);
  assert.match(await numerator.innerText(), /ДЗ только числитель/);
  await page.screenshot({ path: "schedule-preview.png", fullPage: true });
  console.log(
    "PASS numerator/denominator setup, automatic week switching, common classes, homework parity and persistence",
  );

  await go("finance");
  await page.locator('[data-category="Одежда"]').click();
  await page.locator("[data-add]").click();
  assert.equal(await page.locator('[name="category"]').inputValue(), "Одежда");
  assert.equal(
    await page.locator('[name="date"]').inputValue(),
    await page.evaluate(() => StudentLife.dateKey(new Date())),
  );
  await fill("title", "Футболка");
  await fill("amount", "3500");
  await save();
  await page.reload();
  row = page.locator(".row").filter({
    has: page.getByRole("heading", { name: "Футболка", exact: true }),
  });
  assert.equal(await row.count(), 1);
  await page.locator('[data-category="Еда"]').click();
  assert.equal(await row.count(), 0);
  await page.locator('[data-category="Одежда"]').click();
  assert.equal(await row.count(), 1);
  await row.locator("[data-edit]").click();
  await fill("amount", "4000");
  await save();
  assert.match(
    await page.locator('progress[aria-label="Одежда"]').getAttribute("value"),
    /4000/,
  );
  await row.locator("[data-delete]").click();
  await page.locator("#cancel-delete").click();
  assert.equal(await row.count(), 1);
  await row.locator("[data-delete]").click();
  await page.locator("#confirm-delete").click();
  assert.equal(await row.count(), 0);
  console.log(
    "PASS finance auto-date, category tabs, weekly totals, editing, delete/cancel",
  );
  await go("reminders");
  await page.locator('[data-notifications="enable"]').click();
  assert.match(
    await page.locator("#notification-status").innerText(),
    /Telegram/,
  );
  await page.locator("[data-add]").click();
  await fill("title", "<img src=x onerror=alert(1)>");
  await fill("time", "18:00");
  await save();
  assert.equal(await page.locator(".row img").count(), 0);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const key of [
      "home",
      "gym",
      "meals",
      "schedule",
      "finance",
      "reminders",
    ]) {
      await go(key);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${key} overflow ${width}`,
      );
    }
    await go("gym");
    await page.locator(".workout").first().locator("[data-edit]").click();
    assert.equal(
      await page
        .locator("#editor")
        .evaluate((d) => d.scrollWidth <= d.clientWidth + 1),
      true,
    );
    await page.locator("[data-close]").first().click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await go("home");
  await page.evaluate(
    () => (document.querySelector("#status").textContent = ""),
  );
  await page.screenshot({ path: "mobile-preview.png", fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  assert.deepEqual(errors, []);
  const telegram = await browser.newPage();
  await telegram.route("https://telegram.org/**", (r) =>
    r.fulfill({ body: "" }),
  );
  await telegram.addInitScript(() => {
    window.calls = [];
    window.events = {};
    window.Telegram = {
      WebApp: {
        initData: "mock-sdk-session",
        colorScheme: "dark",
        contentSafeAreaInset: { top: 10, bottom: 5 },
        safeAreaInset: { top: 20, bottom: 10 },
        ready() {
          calls.push("ready");
        },
        expand() {
          calls.push("expand");
        },
        onEvent(n, cb) {
          events[n] = cb;
        },
        isVersionAtLeast() {
          return true;
        },
        requestWriteAccess(cb) {
          calls.push("permission");
          cb(true);
        },
        BackButton: {
          onClick(cb) {
            window.back = cb;
          },
          show() {
            calls.push("show");
          },
          hide() {
            calls.push("hide");
          },
        },
      },
    };
  });
  await telegram.goto("http://127.0.0.1:4175/#reminders");
  await telegram.locator('[data-notifications="enable"]').click();
  await telegram
    .getByText(/Локальный предпросмотр: сервер уведомлений/)
    .waitFor();
  assert.equal(
    await telegram.locator(".notification-settings .badge").innerText(),
    "Не подключены",
  );
  let uploaded;
  await telegram.route("**/api/notifications", async (r) => {
    uploaded = r.request().postDataJSON();
    await r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ enabled: uploaded.enabled }),
    });
  });
  await telegram.locator('[data-notifications="enable"]').click();
  await telegram
    .getByText("Данные синхронизированы. Уведомления отправляет Telegram-бот.")
    .waitFor();
  assert.equal(uploaded.enabled, true);
  assert.equal(uploaded.gym, undefined);
  assert.equal(uploaded.meals, undefined);
  await telegram.locator('[data-notifications="disable"]').click();
  await telegram.getByText("Уведомления отключены на сервере.").waitFor();
  assert.equal(uploaded.enabled, false);
  await telegram.locator("[data-add]").click();
  await telegram.evaluate(() => back());
  assert.equal(
    await telegram.locator("#editor").evaluate((d) => d.open),
    false,
  );
  await telegram.evaluate(() => back());
  await telegram.waitForURL("**/#home");
  await telegram.evaluate(() => {
    Telegram.WebApp.colorScheme = "light";
    events.themeChanged();
  });
  assert.equal(
    await telegram.locator("html").getAttribute("data-theme"),
    "light",
  );
  assert.equal(
    await telegram.evaluate(() =>
      document.documentElement.style.getPropertyValue("--safe-top"),
    ),
    "30px",
  );
  console.log(
    "PASS SDK ready/expand/back/theme, notification failure/success/disable and minimal upload (mock)",
  );
  const migration = await browser.newPage();
  await migration.route("https://telegram.org/**", (r) =>
    r.fulfill({ body: "" }),
  );
  await migration.goto("http://127.0.0.1:4175");
  await migration.evaluate(() =>
    localStorage.setItem(
      "student-life:v1",
      JSON.stringify({
        schedule: [],
        reminders: [],
        gym: [
          {
            id: "legacy",
            title: "Старое упражнение",
            date: "2026-10-09",
            sets: 3,
            reps: 12,
            done: true,
          },
        ],
        meals: [
          {
            id: "legacy-meal",
            title: "Старое блюдо",
            minutes: 15,
            ingredients: "Картошка",
            recipe: "Сварить",
          },
        ],
        finance: [],
        dorm: [{ id: "d", title: "Старое дело" }],
      }),
    ),
  );
  await migration.reload();
  await migration.goto("http://127.0.0.1:4175/#meals");
  assert.match(await migration.locator(".row").innerText(), /Картошка/);
  await migration.goto("http://127.0.0.1:4175/#gym");
  assert.equal(await migration.locator(".workout").count(), 5);
  assert.equal(
    await migration.evaluate(
      () => JSON.parse(localStorage.getItem("student-life:v2")).gymLogs.length,
    ),
    1,
  );
  assert.equal(
    await migration.evaluate(
      () => JSON.parse(localStorage.getItem("student-life:v1")).dorm.length,
    ),
    1,
  );
  console.log(
    "PASS old data migration and hidden dorm backup; all mobile layouts and safe HTML",
  );

  const rollover=await browser.newPage();
  await rollover.route('https://telegram.org/**',r=>r.fulfill({body:''}));
  await rollover.clock.install({time:new Date('2026-10-11T23:59:00')});
  await rollover.goto('http://127.0.0.1:4175');
  await rollover.evaluate(()=>localStorage.setItem('student-life:v2',JSON.stringify({schemaVersion:2,scheduleCycle:{anchorMonday:'2026-10-05',anchorType:'Числитель',confirmed:true},schedule:[{id:'sun',title:'Воскресенье числителя',day:'Воскресенье',weekType:'Числитель',start:'09:00',end:'10:00',room:'1',homework:[]},{id:'mon',title:'Понедельник знаменателя',day:'Понедельник',weekType:'Знаменатель',start:'09:00',end:'10:00',room:'2',homework:[]}],reminders:[],meals:[],gym:[],gymLogs:[],products:[],finance:[],notifications:{enabled:false,timezone:'Asia/Qyzylorda'}})));
  await rollover.goto('http://127.0.0.1:4175/#schedule');await rollover.reload();
  assert.equal(await rollover.getByRole('heading',{name:'Воскресенье числителя',exact:true}).count(),1);
  await rollover.clock.runFor(120000);
  assert.equal(await rollover.getByRole('heading',{name:'Понедельник знаменателя',exact:true}).count(),1);
  assert.equal(await rollover.locator('[data-cycle-type="Знаменатель"]').getAttribute('aria-pressed'),'true');
  console.log('PASS automatic Sunday-to-Monday rollover while the app stays open');

  await browser.close();
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

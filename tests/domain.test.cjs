const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createHmac } = require("node:crypto");
const D = require("../lib/domain.js");
const S = require("../lib/server.cjs");
const signed = (id = 123, now = Date.now()) => {
  const p = new URLSearchParams({
    auth_date: String(Math.floor(now / 1000)),
    user: JSON.stringify({ id }),
  });
  const text = [...p]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData")
    .update("test-token-not-real")
    .digest();
  p.set("hash", createHmac("sha256", secret).update(text).digest("hex"));
  return p.toString();
};
const state = () => ({
  enabled: true,
  timezone: "Asia/Qyzylorda",
  schedule: [
    {
      id: "class",
      title: "Математика",
      day: "Понедельник",
      start: "09:00",
      end: "10:30",
      room: "101",
      homework: [
        {
          id: "hw",
          text: "Задачи 1–3",
          date: "2026-10-12",
          time: "08:00",
          done: false,
        },
      ],
    },
  ],
  reminders: [],
  finance: [],
});
test("nutrition uses grams and preserves zeros", () => {
  assert.deepEqual(
    D.nutrition([
      { grams: 200, kcal: 100, protein: 10, fat: 2, carbs: 20 },
      { grams: 50, kcal: 400, protein: 20, fat: 10, carbs: 30 },
    ]),
    { grams: 250, kcal: 400, protein: 30, fat: 9, carbs: 55 },
  );
  assert.equal(D.nutrition([{ grams: 100, kcal: 0 }]).kcal, 0);
});
test("weekly expenses include Monday/Sunday, exclude income and next Monday", () => {
  const items = [
    { kind: "Расход", date: "2026-10-05", category: "Еда", amount: 0.1 },
    { kind: "Расход", date: "2026-10-11", category: "Еда", amount: 0.2 },
    { kind: "Доход", date: "2026-10-05", category: "Прочее", amount: 100 },
    { kind: "Расход", date: "2026-10-12", category: "Одежда", amount: 999 },
  ];
  assert.equal(D.weeklyExpenses(items, "2026-10-05").total, 0.3);
  assert.equal(D.monday("2026-01-01"), "2025-12-29");
});
test("default routines match requested split and time", () => {
  const routines = D.defaultWorkouts();
  assert.deepEqual(
    routines.map((x) => [x.day, x.type, x.time]),
    [
      ["Понедельник", "Верх", "17:30"],
      ["Вторник", "Низ", "17:30"],
      ["Четверг", "Верх", "17:30"],
      ["Пятница", "Низ", "17:30"],
    ],
  );
});
test("migration retains previous ingredients, workout history, dorm backup and expenses", () => {
  const old = {
    schedule: [],
    reminders: [],
    meals: [{ title: "Паста", ingredients: "Макароны" }],
    gym: [
      {
        id: "old",
        title: "Присед",
        date: "2026-10-09",
        sets: 3,
        reps: 12,
        done: true,
      },
    ],
    finance: [{ category: "Продукты" }],
    dorm: [{ title: "Старое дело" }],
  };
  const migrated = D.migrate(old);
  assert.equal(migrated.meals[0].legacyIngredients, "Макароны");
  assert.equal(migrated.gym.length, 5);
  assert.equal(migrated.gymLogs[0].exercises[0].sets.length, 3);
  assert.equal(migrated.finance[0].category, "Еда");
  assert.equal(migrated.dorm[0].title, "Старое дело");
  assert.equal(old.meals[0].ingredients, "Макароны");
  assert.equal(
    D.migrate({
      schemaVersion: 2,
      gym: [],
      schedule: [],
      meals: [],
      finance: [],
    }).gym.length,
    0,
  );
});
test("timezone conversion and reminder offsets are exact", () => {
  assert.equal(
    new Date(D.toUTC("2026-10-12", "09:00", "Asia/Qyzylorda")).toISOString(),
    "2026-10-12T04:00:00.000Z",
  );
  const events = D.notificationEvents(
    state(),
    new Date("2026-10-09T00:00:00Z"),
  );
  const hw = events.filter((x) => x.id.startsWith("hw:"));
  assert.equal(hw.length, 3);
  assert.deepEqual(
    hw.map((x) => x.due_at),
    [
      "2026-10-10T04:00:00.000Z",
      "2026-10-11T04:00:00.000Z",
      "2026-10-11T18:00:00.000Z",
    ],
  );
  assert.equal(
    events.find((x) => x.id === "leave:class:2026-10-12").due_at,
    "2026-10-12T03:30:00.000Z",
  );
  assert.equal(
    events.find((x) => x.id === "weekly:2026-10-05").due_at,
    "2026-10-11T16:00:00.000Z",
  );
});
test("demo and completed homework never generate reminders", () => {
  const s = state();
  s.schedule[0].demo = true;
  assert.equal(
    D.notificationEvents(s, new Date("2026-10-09")).filter((x) =>
      /^(hw|leave):/.test(x.id),
    ).length,
    0,
  );
  s.schedule[0].demo = false;
  s.schedule[0].homework[0].done = true;
  assert.equal(
    D.notificationEvents(s, new Date("2026-10-09")).filter((x) =>
      x.id.startsWith("hw:"),
    ).length,
    0,
  );
});
test("Telegram authentication rejects tampering, expired and duplicate fields", () => {
  const now = Date.now(),
    auth = signed(123, now);
  assert.equal(S.authenticate(auth, "test-token-not-real", now), 123);
  assert.throws(() =>
    S.authenticate(auth.replace("123", "999"), "test-token-not-real", now),
  );
  assert.throws(() =>
    S.authenticate(signed(123, now - 90000000), "test-token-not-real", now),
  );
  assert.throws(() =>
    S.authenticate(auth + "&auth_date=0", "test-token-not-real", now),
  );
});
test("server accepts valid data, rejects invalid dates, weekdays, duplicates and zones", () => {
  assert.equal(S.validateState(state()).schedule.length, 1);
  for (const mutate of [
    (s) => (s.schedule[0].homework[0].date = "2026-10-13"),
    (s) => (s.timezone = "Invalid/Zone"),
    (s) => s.schedule.push(s.schedule[0]),
    (s) => (s.schedule[0].start = "99:00"),
  ]) {
    const s = state();
    mutate(s);
    assert.throws(() => S.validateState(s));
  }
  const s = state();
  s.schedule[0].demo = true;
  assert.equal(S.validateState(s).schedule.length, 0);
  assert.equal(S.validateState({ ...s, enabled: false }).schedule.length, 0);
});
function response() {
  return {
    statusCode: 200,
    body: null,
    setHeader() {},
    status(n) {
      this.statusCode = n;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}
test("API requires configuration and verified Telegram identity; cron rejects unauthenticated callers", async () => {
  const notify = require("../api/notifications.js"),
    cron = require("../api/cron.js");
  const old = { ...process.env };
  try {
    for (const key of [
      "TELEGRAM_BOT_TOKEN",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "CRON_SECRET",
    ])
      delete process.env[key];
    let res = response();
    await notify({ method: "POST", body: {} }, res);
    assert.equal(res.statusCode, 503);
    res = response();
    await cron({ method: "GET", headers: {} }, res);
    assert.equal(res.statusCode, 401);
    Object.assign(process.env, {
      TELEGRAM_BOT_TOKEN: "test-token-not-real",
      SUPABASE_URL: "https://test.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "test-placeholder",
      CRON_SECRET: "test-placeholder",
    });
    res = response();
    await notify(
      { method: "POST", body: { ...state(), initData: "bad" } },
      res,
    );
    assert.equal(res.statusCode, 401);
  } finally {
    process.env = old;
  }
});
test("cron claims only due events and respects deduplication (mock network)", async () => {
  const cron = require("../api/cron.js"),
    oldEnv = { ...process.env },
    oldFetch = global.fetch;
  Object.assign(process.env, {
    TELEGRAM_BOT_TOKEN: "test-token-not-real",
    SUPABASE_URL: "https://test.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "test-placeholder",
    CRON_SECRET: "test-placeholder",
  });
  const now = new Date(),
    p = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Qyzylorda",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(now.getTime() - 60000));
  const s = {
    enabled: true,
    timezone: "Asia/Qyzylorda",
    schedule: [],
    finance: [],
    reminders: [
      {
        id: "due",
        title: "Test",
        date: D.zonedDate(new Date(now.getTime() - 60000), "Asia/Qyzylorda"),
        time: p,
        done: false,
      },
    ],
  };
  let sends = 0,
    claimed = false;
  global.fetch = async (url, options) => {
    let result;
    if (url.includes("student_states?"))
      result = [{ user_id: 123, state: s, updated_at: now.toISOString() }];
    else if (url.includes("claim_student_notification")) {
      result = !claimed;
      claimed = true;
    } else if (url.includes("finish_student_notification")) result = null;
    else if (url.startsWith("https://api.telegram.org/")) {
      assert.equal(JSON.parse(options.body).disable_notification, false);
      sends++;
      result = { ok: true };
    } else throw Error("Unexpected URL");
    return {
      ok: true,
      text: async () => JSON.stringify(result),
      json: async () => result,
    };
  };
  try {
    for (let i = 0; i < 2; i++) {
      const res = response();
      await cron(
        {
          method: "GET",
          headers: { authorization: "Bearer test-placeholder" },
        },
        res,
      );
      assert.equal(res.statusCode, 200);
    }
    assert.equal(sends, 1);
  } finally {
    process.env = oldEnv;
    global.fetch = oldFetch;
  }
});

test("notification sync stores only verified user data and server-selected fields (mock network)", async () => {
  const notify = require("../api/notifications.js");
  const oldEnv = { ...process.env },
    oldFetch = global.fetch;
  Object.assign(process.env, {
    TELEGRAM_BOT_TOKEN: "test-token-not-real",
    SUPABASE_URL: "https://test.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "test-placeholder",
    CRON_SECRET: "test-placeholder",
  });
  let stored;
  global.fetch = async (url, options) => {
    stored = JSON.parse(options.body);
    return { ok: true, text: async () => "" };
  };
  try {
    const res = response();
    await notify(
      {
        method: "POST",
        body: {
          ...state(),
          initData: signed(123),
          chat_id: 999,
          user_id: 999,
          meals: [{ private: "not uploaded" }],
        },
      },
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(stored.user_id, 123);
    assert.equal(stored.state.meals, undefined);
    assert.equal(stored.state.initData, undefined);
    assert.equal(stored.state.schedule[0].homework.length, 1);
  } finally {
    process.env = oldEnv;
    global.fetch = oldFetch;
  }
});

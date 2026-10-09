"use strict";
const { createHmac, timingSafeEqual } = require("node:crypto");
const D = require("./domain.js");

function authenticate(initData, token, now = Date.now()) {
  if (typeof initData !== "string" || initData.length > 16000)
    throw new Error("auth");
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (
    !hash ||
    !/^[a-f0-9]{64}$/.test(hash) ||
    [...params.keys()].some((key, i, keys) => keys.indexOf(key) !== i)
  )
    throw new Error("auth");
  params.delete("hash");
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(check).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex")))
    throw new Error("auth");
  const age = now / 1000 - Number(params.get("auth_date"));
  if (!Number.isFinite(age) || age < -60 || age > 86400)
    throw new Error("auth");
  const user = JSON.parse(params.get("user") || "{}");
  if (!Number.isSafeInteger(user.id) || user.id <= 0) throw new Error("auth");
  return user.id;
}

const text = (value, max = 150) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const date = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const time = (value) =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
function validateState(body) {
  if (!body || typeof body.enabled !== "boolean" || !text(body.timezone, 80))
    throw new Error("validation");
  try {
    new Intl.DateTimeFormat("en", { timeZone: body.timezone }).format();
  } catch {
    throw new Error("validation");
  }
  if (!body.enabled)
    return {
      enabled: false,
      timezone: body.timezone,
      schedule: [],
      reminders: [],
      finance: [],
    };
  for (const key of ["schedule", "reminders", "finance"]) {
    if (
      !Array.isArray(body[key]) ||
      body[key].length > 1000 ||
      body[key].some((item) => !item || typeof item !== "object")
    )
      throw new Error("validation");
  }
  let cycle;
  if (body.cycle !== undefined) {
    const c = body.cycle;
    if (
      !c ||
      !date(c.anchorMonday) ||
      D.monday(c.anchorMonday) !== c.anchorMonday ||
      !["Числитель", "Знаменатель"].includes(c.anchorType) ||
      typeof c.confirmed !== "boolean"
    )
      throw new Error("validation");
    cycle = {
      anchorMonday: c.anchorMonday,
      anchorType: c.anchorType,
      confirmed: c.confirmed,
    };
  }
  if (
    body.schedule.some(
      (x) => !x.demo && x.weekType && x.weekType !== "Каждую неделю",
    ) &&
    !cycle?.confirmed
  )
    throw new Error("cycle");
  const schedule = body.schedule
    .filter((x) => !x.demo)
    .map((x) => {
      if (
        !text(x.id) ||
        !text(x.title) ||
        !D.days.includes(x.day) ||
        (x.weekType !== undefined && !D.weekTypes.includes(x.weekType)) ||
        !time(x.start) ||
        !time(x.end) ||
        x.end <= x.start ||
        !text(x.room) ||
        !Array.isArray(x.homework) ||
        x.homework.length > 100
      )
        throw new Error("validation");
      const homework = x.homework.map((hw) => {
        if (
          !hw ||
          typeof hw !== "object" ||
          !text(hw.id) ||
          !text(hw.text, 2000) ||
          !date(hw.date) ||
          !time(hw.time) ||
          typeof hw.done !== "boolean" ||
          (!hw.done && !D.classOnDate(x, hw.date, cycle))
        )
          throw new Error("validation");
        return {
          id: hw.id,
          text: hw.text,
          date: hw.date,
          time: hw.time,
          done: hw.done,
        };
      });
      return {
        id: x.id,
        title: x.title,
        day: x.day,
        weekType: x.weekType || "Каждую неделю",
        start: x.start,
        end: x.end,
        room: x.room,
        homework,
      };
    });
  const reminders = body.reminders
    .filter((x) => !x.demo)
    .map((x) => {
      if (
        !text(x.id) ||
        !text(x.title) ||
        !date(x.date) ||
        !time(x.time) ||
        typeof x.done !== "boolean" ||
        typeof x.note !== "string" ||
        x.note.length > 2000
      )
        throw new Error("validation");
      return {
        id: x.id,
        title: x.title,
        date: x.date,
        time: x.time,
        done: x.done,
        note: x.note,
      };
    });
  const finance = body.finance
    .filter((x) => !x.demo)
    .map((x) => {
      if (
        !text(x.id) ||
        !text(x.title) ||
        !date(x.date) ||
        !D.categories.includes(x.category) ||
        !["Доход", "Расход"].includes(x.kind) ||
        !Number.isFinite(x.amount) ||
        x.amount <= 0 ||
        x.amount > 1e9
      )
        throw new Error("validation");
      return {
        id: x.id,
        title: x.title,
        date: x.date,
        category: x.category,
        kind: x.kind,
        amount: x.amount,
      };
    });
  for (const items of [schedule, reminders, finance])
    if (new Set(items.map((x) => x.id)).size !== items.length)
      throw new Error("validation");
  return {
    enabled: true,
    timezone: body.timezone,
    ...(cycle ? { cycle } : {}),
    schedule,
    reminders,
    finance,
  };
}

function configured() {
  return [
    "TELEGRAM_BOT_TOKEN",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "CRON_SECRET",
  ].every((key) => !!process.env[key]);
}
async function database(path, options = {}) {
  const response = await fetch(
    `${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`,
    {
      ...options,
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!response.ok) throw new Error("database");
  const result = await response.text();
  return result ? JSON.parse(result) : null;
}
function reply(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}
module.exports = { authenticate, validateState, configured, database, reply };

"use strict";
const S = require("../lib/server.cjs");
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return S.reply(res, 405, { error: "Метод не поддерживается." });
  }
  if (!S.configured())
    return S.reply(res, 503, {
      error:
        "Уведомления ещё не настроены: нужны бот, база и планировщик. Локальные данные сохранены.",
    });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (Buffer.byteLength(JSON.stringify(body || {})) > 750000)
      return S.reply(res, 413, {
        error: "Слишком много данных для синхронизации.",
      });
    const userId = S.authenticate(
      body?.initData,
      process.env.TELEGRAM_BOT_TOKEN,
    );
    const state = S.validateState(body);
    await S.database("student_states?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        user_id: userId,
        enabled: state.enabled,
        state,
        updated_at: new Date().toISOString(),
      }),
    });
    return S.reply(res, 200, { enabled: state.enabled });
  } catch (error) {
    if (error.message === "auth")
      return S.reply(res, 401, {
        error:
          "Сессия Telegram истекла или недействительна. Закрой и заново открой Mini App.",
      });
    if (error.message === "validation" || error instanceof SyntaxError)
      return S.reply(res, 400, {
        error: "Проверь даты, время и записи: сервер не принял данные.",
      });
    return S.reply(res, 503, {
      error:
        "Не удалось сохранить расписание на сервере. Изменения доступны локально; повтори синхронизацию.",
    });
  }
};

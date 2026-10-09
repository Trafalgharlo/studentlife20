"use strict";
const { timingSafeEqual } = require("node:crypto");
const D = require("../lib/domain.js");
const S = require("../lib/server.cjs");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return S.reply(res, 405, { error: "Method not allowed" });
  }
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`);
  const actual = Buffer.from(req.headers.authorization || "");
  if (
    !process.env.CRON_SECRET ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return S.reply(res, 401, { error: "Unauthorized" });
  if (!S.configured()) return S.reply(res, 503, { error: "Not configured" });
  let sent = 0,
    failed = 0;
  try {
    const now = new Date();
    // A short catch-up window tolerates scheduler delays; old departure alerts expire at class start.
    for (let offset = 0; ; offset += 100) {
      const users = await S.database(
        `student_states?enabled=eq.true&select=user_id,state,updated_at&order=user_id&limit=100&offset=${offset}`,
      );
      for (const user of users) {
        const events = D.notificationEvents(
          user.state,
          new Date(now.getTime() - 15 * 60000),
        ).filter(
          (event) =>
            Date.parse(event.due_at) <= now.getTime() &&
            Date.parse(event.expires_at) > now.getTime(),
        );
        for (const event of events) {
          const claim = await S.database("rpc/claim_student_notification", {
            method: "POST",
            body: JSON.stringify({
              p_user: user.user_id,
              p_event: event.id,
              p_revision: user.updated_at,
            }),
          });
          if (!claim) continue;
          let delivered = false;
          try {
            const response = await fetch(
              `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: user.user_id,
                  text: event.text,
                  disable_notification: false,
                }),
                signal: AbortSignal.timeout(10000),
              },
            );
            const result = await response.json();
            delivered = response.ok && result.ok === true;
          } catch {
            /* Do not expose Telegram URLs or secrets in logs/responses. */
          }
          await S.database("rpc/finish_student_notification", {
            method: "POST",
            body: JSON.stringify({
              p_user: user.user_id,
              p_event: event.id,
              p_delivered: delivered,
            }),
          });
          if (delivered) sent++;
          else failed++;
        }
      }
      if (users.length < 100) break;
    }
    return S.reply(res, failed ? 503 : 200, { sent, failed });
  } catch {
    return S.reply(res, 503, {
      error: "Notification worker failed",
      sent,
      failed,
    });
  }
};

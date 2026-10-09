-- Vercel Hobby-compatible scheduler: run in the Supabase SQL editor after schema.sql.
-- First enable Cron / pg_net in the Supabase Dashboard.
-- In Supabase Vault create these secrets using the Dashboard (never commit their values):
--   student_life_cron_url    = https://YOUR-PRODUCTION-DOMAIN/api/cron
--   student_life_cron_secret = the SAME value as CRON_SECRET in Vercel
-- The endpoint must be publicly reachable; do not use a protected preview deployment.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'student_life_cron_url')
    or not exists (select 1 from vault.decrypted_secrets where name = 'student_life_cron_secret')
  then
    raise exception 'Create student_life_cron_url and student_life_cron_secret in Supabase Vault first';
  end if;
end $$;

select cron.schedule(
  'student-life-notifications',
  '* * * * *',
  $job$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'student_life_cron_url'),
      headers := jsonb_build_object('Authorization', 'Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name = 'student_life_cron_secret')),
      timeout_milliseconds := 55000
    );
  $job$
);

-- Monitoring: inspect Cron job runs and net._http_response in the Dashboard.
-- Stop the scheduler when needed:
-- select cron.unschedule('student-life-notifications');

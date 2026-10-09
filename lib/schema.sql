-- Run once in the Supabase SQL editor. Secrets belong in server environment variables.
create table if not exists public.student_states (
  user_id bigint primary key,
  enabled boolean not null default false,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.student_notification_deliveries (
  user_id bigint not null references public.student_states(user_id) on delete cascade,
  event_id text not null,
  delivered boolean not null default false,
  attempts integer not null default 0,
  lease_until timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
alter table public.student_states enable row level security;
alter table public.student_notification_deliveries enable row level security;
revoke all on public.student_states, public.student_notification_deliveries from anon, authenticated;
grant all on public.student_states, public.student_notification_deliveries to service_role;

create or replace function public.claim_student_notification(p_user bigint, p_event text, p_revision timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  -- Serialize with state updates so a stale worker cannot claim removed/disabled events.
  perform 1 from public.student_states where user_id = p_user and enabled and updated_at = p_revision for update;
  if not found then return false; end if;
  insert into public.student_notification_deliveries(user_id, event_id, attempts, lease_until)
    values (p_user, p_event, 1, now() + interval '2 minutes')
    on conflict (user_id, event_id) do update set
      attempts = student_notification_deliveries.attempts + 1,
      lease_until = now() + interval '2 minutes', updated_at = now()
    where not student_notification_deliveries.delivered
      and student_notification_deliveries.attempts < 5
      and student_notification_deliveries.lease_until < now();
  get diagnostics changed = row_count;
  return changed = 1;
end $$;

create or replace function public.finish_student_notification(p_user bigint, p_event text, p_delivered boolean)
returns void language sql security definer set search_path = '' as $$
  update public.student_notification_deliveries
  set delivered = p_delivered, updated_at = now(), lease_until = now() + interval '2 minutes'
  where user_id = p_user and event_id = p_event;
$$;
revoke all on function public.claim_student_notification(bigint, text, timestamptz) from public, anon, authenticated;
revoke all on function public.finish_student_notification(bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_student_notification(bigint, text, timestamptz) to service_role;
grant execute on function public.finish_student_notification(bigint, text, boolean) to service_role;

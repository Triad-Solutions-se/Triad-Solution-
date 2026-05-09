-- Add device/browser/os parsed from user_agent at ingest time, plus
-- finer-grained geo (region + city) sourced from Vercel edge headers.

alter table public.analytics_pageviews
  add column if not exists region  text,
  add column if not exists city    text,
  add column if not exists device  text,  -- 'mobile' | 'tablet' | 'desktop'
  add column if not exists browser text,  -- 'Chrome' | 'Safari' | 'Firefox' | 'Edge' | 'Opera' | 'Other'
  add column if not exists os      text;  -- 'Windows' | 'macOS' | 'iOS' | 'Android' | 'Linux' | 'Other'

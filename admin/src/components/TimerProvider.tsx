"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// The signed-in member's running project timer, shared by the mobile shortcut
// (TimerFab) and the project page so both stay in sync without a reload.
// Start/stop go through RPCs (migration 0033) so the database clock sets the
// times and starting on another project stops the current one atomically.

export type RunningTimer = {
  id: string;
  project_id: string;
  project_name: string;
  started_at: string;
};

type TimerContextValue = {
  ready: boolean;
  userId: string | null;
  running: RunningTimer | null;
  busy: boolean;
  start: (project: { id: string; name: string }) => Promise<void>;
  stop: () => Promise<void>;
};

const TimerContext = createContext<TimerContextValue | null>(null);

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [running, setRunning] = useState<RunningTimer | null>(null);
  const [busy, setBusy] = useState(false);

  const sync = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data } = await supabase
      .from("time_entries")
      .select("id,project_id,started_at,project:projects(name)")
      .eq("profile_id", user.id)
      .is("ended_at", null)
      .maybeSingle();
    const row = data as any;
    setRunning(
      row
        ? {
            id: row.id,
            project_id: row.project_id,
            started_at: row.started_at,
            project_name: row.project?.name ?? "Projekt",
          }
        : null,
    );
    setReady(true);
  }, [supabase]);

  useEffect(() => {
    sync();
    // The timer may have been started or stopped on another device.
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [sync]);

  const start = useCallback(
    async (project: { id: string; name: string }) => {
      setBusy(true);
      const { data, error } = await supabase.rpc("start_project_timer", {
        p_project_id: project.id,
      });
      setBusy(false);
      if (error) {
        // 23505 = another device started a timer at the same moment.
        if (error.code !== "23505") alert(error.message);
        await sync();
        return;
      }
      setRunning({
        id: data.id,
        project_id: project.id,
        started_at: data.started_at,
        project_name: project.name,
      });
      router.refresh();
    },
    [supabase, router, sync],
  );

  const stop = useCallback(async () => {
    setBusy(true);
    const { error } = await supabase.rpc("stop_project_timer");
    setBusy(false);
    if (error) {
      alert(error.message);
      await sync();
      return;
    }
    setRunning(null);
    router.refresh();
  }, [supabase, router, sync]);

  const value = useMemo(
    () => ({ ready, userId, running, busy, start, stop }),
    [ready, userId, running, busy, start, stop],
  );

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer must be used inside <TimerProvider>");
  return ctx;
}

// Current time, re-read every second while `active`. Null until mounted so
// server and client render the same markup.
export function useNow(active: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

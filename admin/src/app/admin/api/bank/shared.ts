import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { PsuHeaders } from "@/lib/enable-banking";

/** Inloggad användare som också är medlem (har en profil), annars null. */
export async function requireMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  return data ? user : null;
}

/** Användarens IP och webbläsare, så att banken ser att hen är närvarande. */
export function psuFrom(req: NextRequest): PsuHeaders {
  return {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip"),
    userAgent: req.headers.get("user-agent"),
  };
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Server-only GitHub-klient för "delivery health" per projekt.
//
// Auth: en token i env GITHUB_TOKEN. I Fas 1 räcker en fine-grained PAT med
// läsrätt (Contents, Issues, Pull requests, Actions, Metadata) på de repon vi
// vill koppla. Samma kod fungerar senare med en GitHub App genom att mata in
// ett installations-token i samma env-variabel.
//
// Importera ALDRIG denna modul från klientkod. GITHUB_TOKEN saknar
// NEXT_PUBLIC_-prefix och bundlas därför aldrig in i klientkoden.

const API = "https://api.github.com";

export type RepoRef = { owner: string; repo: string };

export type RepoCommit = {
  sha: string;
  message: string;
  author: string | null;
  date: string | null;
  url: string;
};

export type RepoHealth = {
  ref: RepoRef;
  htmlUrl: string;
  defaultBranch: string;
  pushedAt: string | null;
  openIssues: number | null;
  openPullRequests: number | null;
  commits: RepoCommit[];
  ci: { status: string; conclusion: string | null; url: string | null } | null;
};

export type RepoHealthResult =
  | { ok: true; health: RepoHealth }
  | { ok: false; reason: "no-token" | "not-found" | "error"; message: string };

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

/** Tolka "owner/repo", en github.com-URL eller en .git-URL till en RepoRef. */
export function parseRepoRef(input: string | null | undefined): RepoRef | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  // owner/repo
  const slug = raw.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (slug) return { owner: slug[1], repo: slug[2] };

  // URL-former (https, ssh, med eller utan .git)
  const url = raw.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/i);
  if (url) return { owner: url[1], repo: url[2] };

  return null;
}

export function repoRefToString(ref: RepoRef | null): string {
  return ref ? `${ref.owner}/${ref.repo}` : "";
}

export function repoHtmlUrl(ref: RepoRef): string {
  return `https://github.com/${ref.owner}/${ref.repo}`;
}

async function gh(path: string, revalidate = 300): Promise<Response> {
  return fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    // Next cachar på servern så vi inte spammar GitHub vid varje sidladdning.
    next: { revalidate },
  });
}

/**
 * Hämtar en kompakt hälsobild av ett repo. Anropen körs parallellt och
 * degraderar var för sig — om t.ex. Actions-API:t fallerar får vi ändå
 * commits/issues. Returnerar aldrig kastat fel uppåt.
 */
export async function getRepoHealth(ref: RepoRef): Promise<RepoHealthResult> {
  if (!githubConfigured()) {
    return { ok: false, reason: "no-token", message: "GITHUB_TOKEN saknas" };
  }

  let repoRes: Response;
  try {
    repoRes = await gh(`/repos/${ref.owner}/${ref.repo}`);
  } catch (e) {
    return { ok: false, reason: "error", message: msg(e) };
  }
  if (repoRes.status === 404) {
    return { ok: false, reason: "not-found", message: "Repo hittades inte (eller saknar åtkomst)" };
  }
  if (!repoRes.ok) {
    return { ok: false, reason: "error", message: `GitHub svarade ${repoRes.status}` };
  }

  const repo = (await repoRes.json()) as {
    default_branch: string;
    pushed_at: string | null;
    html_url: string;
  };
  const defaultBranch = repo.default_branch ?? "main";

  const [commits, openPRs, openIssues, ci] = await Promise.all([
    fetchCommits(ref, defaultBranch),
    fetchOpenCount(ref, "pr"),
    fetchOpenCount(ref, "issue"),
    fetchLatestCi(ref, defaultBranch),
  ]);

  return {
    ok: true,
    health: {
      ref,
      htmlUrl: repo.html_url ?? repoHtmlUrl(ref),
      defaultBranch,
      pushedAt: repo.pushed_at,
      openIssues,
      openPullRequests: openPRs,
      commits,
      ci,
    },
  };
}

async function fetchCommits(ref: RepoRef, branch: string): Promise<RepoCommit[]> {
  try {
    const res = await gh(
      `/repos/${ref.owner}/${ref.repo}/commits?sha=${encodeURIComponent(branch)}&per_page=5`,
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as any[];
    return rows.map((c) => ({
      sha: c.sha?.slice(0, 7) ?? "",
      message: (c.commit?.message ?? "").split("\n")[0],
      author: c.commit?.author?.name ?? c.author?.login ?? null,
      date: c.commit?.author?.date ?? null,
      url: c.html_url ?? "",
    }));
  } catch {
    return [];
  }
}

// Antal öppna PR:er / issues via search-API:t (returnerar total_count).
// type=issue exkluderar PR:er explicit så siffrorna inte dubbelräknas.
async function fetchOpenCount(ref: RepoRef, kind: "pr" | "issue"): Promise<number | null> {
  try {
    const q = `repo:${ref.owner}/${ref.repo}+type:${kind}+state:open`;
    const res = await gh(`/search/issues?q=${q}&per_page=1`);
    if (!res.ok) return null;
    const json = (await res.json()) as { total_count?: number };
    return typeof json.total_count === "number" ? json.total_count : null;
  } catch {
    return null;
  }
}

async function fetchLatestCi(
  ref: RepoRef,
  branch: string,
): Promise<RepoHealth["ci"]> {
  try {
    const res = await gh(
      `/repos/${ref.owner}/${ref.repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=1`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { workflow_runs?: any[] };
    const run = json.workflow_runs?.[0];
    if (!run) return null;
    return {
      status: run.status ?? "unknown", // queued | in_progress | completed
      conclusion: run.conclusion ?? null, // success | failure | cancelled | ...
      url: run.html_url ?? null,
    };
  } catch {
    return null;
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Leveranshälsa: live-status från projektets GitHub-repo. Server-komponent —
// hämtar via lib/github.ts (token stannar på servern). Degraderar snällt när
// token saknas, repo inte är kopplat eller GitHub fallerar.
import {
  Github,
  GitCommit,
  GitPullRequest,
  CircleDot,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { Chip } from "@/components/Chip";
import { fmtDateTime } from "@/lib/date";
import {
  getRepoHealth,
  githubConfigured,
  parseRepoRef,
  repoHtmlUrl,
  type RepoRef,
} from "@/lib/github";

export async function ProjectRepoHealth({
  owner,
  repo,
}: {
  owner: string | null;
  repo: string | null;
}) {
  const ref: RepoRef | null =
    owner && repo ? { owner, repo } : parseRepoRef(repo) ?? null;

  if (!ref) {
    return (
      <Muted>
        Inget repo kopplat. Lägg till <code className="text-white/80">owner/repo</code> under
        Projektinfo för att se commits, PR:er och CI här.
      </Muted>
    );
  }

  if (!githubConfigured()) {
    return (
      <div className="space-y-2">
        <RepoLink ref={ref} />
        <Muted>
          GitHub-token saknas på servern (<code className="text-white/80">GITHUB_TOKEN</code>).
          Lägg till den i miljövariablerna för att aktivera live-status.
        </Muted>
      </div>
    );
  }

  const result = await getRepoHealth(ref);

  if (!result.ok) {
    return (
      <div className="space-y-2">
        <RepoLink ref={ref} />
        <Muted>
          {result.reason === "not-found"
            ? "Repot hittades inte eller saknar åtkomst för token."
            : `Kunde inte hämta status: ${result.message}`}
        </Muted>
      </div>
    );
  }

  const h = result.health;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <a
          href={h.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[var(--triad-teal)] hover:underline min-w-0"
        >
          <Github size={14} className="shrink-0" />
          <span className="truncate">
            {h.ref.owner}/{h.ref.repo}
          </span>
          <ExternalLink size={11} className="opacity-70 shrink-0" />
        </a>
        <CiBadge ci={h.ci} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<GitPullRequest size={14} />} label="Öppna PR" value={h.openPullRequests} />
        <Stat icon={<CircleDot size={14} />} label="Öppna issues" value={h.openIssues} />
        <Stat
          icon={<Clock size={14} />}
          label="Senaste push"
          value={h.pushedAt ? relTime(h.pushedAt) : "—"}
          mono={false}
        />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1.5">
          Senaste commits · {h.defaultBranch}
        </div>
        {h.commits.length === 0 ? (
          <Muted>Inga commits hittades.</Muted>
        ) : (
          <ul className="space-y-1.5">
            {h.commits.map((c) => (
              <li key={c.sha} className="flex items-start gap-2 text-xs">
                <GitCommit size={13} className="mt-0.5 shrink-0 text-[var(--muted)]" />
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 hover:text-white"
                >
                  <span className="block truncate text-white/90">{c.message || c.sha}</span>
                  <span className="text-[var(--muted)]">
                    {c.author ?? "okänd"} · {c.date ? fmtDateTime(c.date) : "—"}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CiBadge({ ci }: { ci: { status: string; conclusion: string | null } | null }) {
  if (!ci) return null;
  if (ci.status !== "completed") {
    return (
      <Chip tone="yellow">
        <Clock size={11} className="mr-1" /> CI kör
      </Chip>
    );
  }
  if (ci.conclusion === "success") {
    return (
      <Chip tone="green">
        <CheckCircle2 size={11} className="mr-1" /> CI grön
      </Chip>
    );
  }
  return (
    <Chip tone="red">
      <XCircle size={11} className="mr-1" /> CI {ci.conclusion ?? "fel"}
    </Chip>
  );
}

function Stat({
  icon,
  label,
  value,
  mono = true,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string | null;
  mono?: boolean;
}) {
  return (
    <div className="rounded-btn border border-white/10 bg-black/20 px-3 py-2">
      <div className="flex items-center gap-1 text-[var(--muted)] text-[10px] uppercase tracking-wider">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-0.5 text-white ${mono ? "font-mono text-lg" : "text-sm"}`}>
        {value ?? "—"}
      </div>
    </div>
  );
}

function RepoLink({ ref }: { ref: RepoRef }) {
  return (
    <a
      href={repoHtmlUrl(ref)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-[var(--triad-teal)] hover:underline"
    >
      <Github size={14} />
      {ref.owner}/{ref.repo}
      <ExternalLink size={11} className="opacity-70" />
    </a>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[var(--muted)] leading-relaxed">{children}</p>;
}

// "3 dagar sedan" / "2 tim sedan" — kompakt relativ tid på svenska.
function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "nyss";
  if (min < 60) return `${min} min sedan`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} tim sedan`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} dgr sedan`;
  const mo = Math.round(d / 30);
  return `${mo} mån sedan`;
}

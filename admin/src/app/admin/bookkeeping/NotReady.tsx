export function NotReady() {
  return (
    <div className="glass rounded-xl border border-white/10 p-8 text-center text-sm text-[var(--muted)]">
      Bokföringen är inte aktiverad än. Migration <span className="font-mono">0044_bookkeeping.sql</span> behöver köras.
    </div>
  );
}

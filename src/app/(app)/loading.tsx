export default function Loading() {
  return (
    <div aria-live="polite" aria-busy="true" className="animate-pulse space-y-7">
      <span className="sr-only">Caricamento in corso…</span>
      <div>
        <div className="h-4 w-28 rounded-full bg-neutral-200" />
        <div className="mt-3 h-10 w-72 max-w-full rounded-xl bg-neutral-200" />
        <div className="mt-3 h-5 w-[28rem] max-w-full rounded-lg bg-neutral-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-32 rounded-2xl border border-neutral-200 bg-white" />
        ))}
      </div>
      <div className="h-80 rounded-2xl border border-neutral-200 bg-white" />
    </div>
  );
}

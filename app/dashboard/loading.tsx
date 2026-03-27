export default function DashboardLoading() {
  return (
    <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
      <div className="max-w-[1600px] mx-auto space-y-8">
        <div className="rounded-[2.5rem] border border-white/10 bg-scz-dark p-8 md:p-10">
          <div className="h-4 w-40 rounded bg-white/10" />
          <div className="mt-4 h-10 w-72 rounded bg-white/10" />
          <div className="mt-3 h-4 w-[520px] max-w-full rounded bg-white/10" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/10 bg-scz-dark p-6"
            >
              <div className="h-4 w-40 rounded bg-white/10" />
              <div className="mt-4 h-9 w-28 rounded bg-white/10" />
              <div className="mt-3 h-4 w-56 rounded bg-white/10" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[2rem] border border-white/10 bg-scz-dark p-8"
            >
              <div className="h-10 w-10 rounded-2xl bg-white/10" />
              <div className="mt-6 h-6 w-40 rounded bg-white/10" />
              <div className="mt-3 h-4 w-64 rounded bg-white/10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


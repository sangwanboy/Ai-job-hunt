"use client";

import { Bell, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function TopNav() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/jobs?q=${encodeURIComponent(search.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center border-b border-white/60 bg-white/45 px-4 backdrop-blur md:px-6 lg:px-8">
      <div className="flex w-full items-center justify-between gap-4">
        <form 
          onSubmit={handleSearch}
          className="flex w-full max-w-xl items-center gap-2 rounded-xl border border-white/60 bg-white/75 px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all"
        >
          <Search className="h-4 w-4 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search jobs, recruiters, tags, notes"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </form>

        <div className="relative flex items-center gap-3">
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className={`rounded-lg border border-white/60 p-2 shadow-sm transition-colors ${
              showNotifications ? "bg-cyan-50 text-cyan-600 border-cyan-200" : "bg-white/75 hover:bg-white"
            }`}
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 border-2 border-white" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-white/60 bg-white/95 p-4 shadow-2xl backdrop-blur-xl">
              <h4 className="font-bold">Notifications</h4>
              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-cyan-100 bg-cyan-50/50 p-3 text-xs">
                  <p className="font-semibold text-cyan-800">Job Match Found</p>
                  <p className="mt-1 text-muted">Atlas found 3 new high-priority roles matching your profile.</p>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-xs">
                  <p className="font-semibold text-amber-800">Follow-up Reminder</p>
                  <p className="mt-1 text-muted">You have 2 pending follow-ups due by end of day today.</p>
                </div>
              </div>
              <button 
                className="mt-4 w-full py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted hover:text-text"
                onClick={() => setShowNotifications(false)}
              >
                Mark all as read
              </button>
            </div>
          )}

          <div className="rounded-lg border border-white/60 bg-white/75 px-3 py-2 text-sm font-semibold shadow-sm whitespace-nowrap">
            Founder
          </div>
        </div>
      </div>
    </header>
  );
}

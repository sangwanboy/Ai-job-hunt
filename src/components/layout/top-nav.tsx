"use client";

import { Bell, LogOut, Search, Settings, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Notification = {
  id: string;
  title: string;
  message: string;
  color: "cyan" | "amber";
  read: boolean;
};

const defaultNotifications: Notification[] = [
  {
    id: "n1",
    title: "Job Match Found",
    message: "Atlas found 3 new high-priority roles matching your profile.",
    color: "cyan",
    read: false,
  },
  {
    id: "n2",
    title: "Follow-up Reminder",
    message: "You have 2 pending follow-ups due by end of day today.",
    color: "amber",
    read: false,
  },
];

export function TopNav() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(defaultNotifications);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/jobs?q=${encodeURIComponent(search.trim())}`);
    }
  };

  /* Bug 5: Mark all notifications as read */
  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  /* Bug 6: Click-outside and Escape to dismiss notification panel + profile menu */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowNotifications(false);
        setShowProfileMenu(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const colorMap = {
    cyan: { border: "border-cyan-100", bg: "bg-cyan-50/50", text: "text-cyan-800" },
    amber: { border: "border-amber-100", bg: "bg-amber-50/50", text: "text-amber-800" },
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

        <div className="flex items-center gap-3">
          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className={`rounded-lg border border-white/60 p-2 shadow-sm transition-colors ${
                showNotifications ? "bg-cyan-50 text-cyan-600 border-cyan-200" : "bg-white/75 hover:bg-white"
              }`}
            >
              <Bell className="h-4 w-4" />
              {/* Bug 5: Only show badge when there are unread notifications */}
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 border-2 border-white" />
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-white/60 bg-white/95 p-4 shadow-2xl backdrop-blur-xl">
                <h4 className="font-bold">Notifications</h4>
                <div className="mt-3 space-y-3">
                  {notifications.map((notif) => {
                    const colors = colorMap[notif.color];
                    return (
                      <div
                        key={notif.id}
                        className={`rounded-xl border p-3 text-xs transition-all ${
                          notif.read
                            ? "border-slate-100 bg-slate-50/50 opacity-60"
                            : `${colors.border} ${colors.bg}`
                        }`}
                      >
                        <p className={`font-semibold ${notif.read ? "text-slate-500" : colors.text}`}>
                          {notif.title}
                        </p>
                        <p className="mt-1 text-muted">{notif.message}</p>
                      </div>
                    );
                  })}
                </div>
                <button 
                  className="mt-4 w-full py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted hover:text-text transition-colors"
                  onClick={markAllRead}
                >
                  Mark all as read
                </button>
              </div>
            )}
          </div>

          {/* Bug 15: Founder profile button with dropdown menu */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm whitespace-nowrap transition-colors ${
                showProfileMenu
                  ? "bg-cyan-50 text-cyan-700 border-cyan-200"
                  : "border-white/60 bg-white/75 hover:bg-white"
              }`}
            >
              Founder
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl border border-white/60 bg-white/95 p-2 shadow-2xl backdrop-blur-xl">
                <button
                  onClick={() => { router.push("/settings"); setShowProfileMenu(false); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-slate-50 transition-colors text-left"
                >
                  <User className="h-4 w-4 text-muted" />
                  Profile
                </button>
                <button
                  onClick={() => { router.push("/settings"); setShowProfileMenu(false); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-slate-50 transition-colors text-left"
                >
                  <Settings className="h-4 w-4 text-muted" />
                  Settings
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  onClick={() => setShowProfileMenu(false)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors text-left"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

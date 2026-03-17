import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopNav } from "@/components/layout/top-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell h-screen overflow-hidden lg:grid lg:grid-cols-[260px_1fr]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Skip to main content
      </a>
      <AppSidebar />
      <div className="flex h-full min-w-0 flex-col">
        <TopNav />
        <main id="main-content" className="relative flex-1 min-h-0 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

import type { PerfLabLayoutProps } from '../PerfLabApp';

/**
 * Default sidebar layout for the standalone perf-lab package.
 * Host apps can replace this by passing a custom Layout component
 * to <PerfLabApp />.
 */
export default function DefaultLayout({
  sidebar,
  children,
  sidebarWidth = 200,
}: PerfLabLayoutProps) {
  return (
    <div className="flex h-full">
      <aside
        className="shrink-0 overflow-y-auto border-r border-surface-card-border"
        style={{ width: sidebarWidth }}
      >
        {sidebar}
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}

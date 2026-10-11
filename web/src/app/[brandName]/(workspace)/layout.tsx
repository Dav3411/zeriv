import type { ReactNode } from "react";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto w-full px-6 sm:px-10 pt-10 pb-[calc(2.5rem+56px+env(safe-area-inset-bottom))] lg:pb-10">
      {children}
    </div>
  );
}

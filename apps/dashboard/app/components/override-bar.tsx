"use client";

interface OverrideBarProps {
  paused: boolean;
  heldCount: number;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onDiscard: () => Promise<void>;
}

export function OverrideBar({
  paused,
  heldCount,
  onPause,
  onResume,
  onDiscard,
}: OverrideBarProps) {
  return (
    <div className="sticky top-0 z-10 mb-4 flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
      {paused ? (
        <>
          <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
            Paused
          </span>

          {heldCount > 0 && (
            <span className="rounded-full bg-amber-700 px-2 py-0.5 text-xs font-semibold text-white">
              {heldCount} held
            </span>
          )}

          <div className="ml-auto flex gap-2">
            <button
              onClick={() => void onResume()}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500"
            >
              Resume
            </button>
            <button
              onClick={() => void onDiscard()}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
            >
              Discard All
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="text-sm text-gray-400">System running</span>
          <button
            onClick={() => void onPause()}
            className="ml-auto rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500"
          >
            Pause
          </button>
        </>
      )}
    </div>
  );
}

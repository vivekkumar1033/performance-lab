import { usePerfLabError, usePerfLabActions } from '../store';

export default function ErrorBanner() {
  const error = usePerfLabError();
  const actions = usePerfLabActions();

  if (!error) return null;

  return (
    <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 text-sm rounded-lg mx-6 mt-4">
      <span className="flex-1">{error}</span>
      <button
        onClick={() => actions.setError(null)}
        className="text-red-400/60 hover:text-red-400 text-xs font-medium"
      >
        Dismiss
      </button>
    </div>
  );
}

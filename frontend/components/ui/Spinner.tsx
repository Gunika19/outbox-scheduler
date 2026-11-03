export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900 ${className}`}
      aria-label="Loading"
    />
  );
}

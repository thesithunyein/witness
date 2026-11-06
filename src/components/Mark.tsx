export default function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="currentColor" aria-hidden="true">
      <path d="M11.95 4 19.91 4 23.73 14.69 15.77 37.6 7.82 37.6 4 25.38Z" />
      <path d="M35.5 5.02 43.77 4 47.91 15.2 39.95 37.6 24.36 59.49 15.77 60 12.27 49.31 19.91 48.8Z" />
      <path d="M55.86 15.71 60 26.91 48.23 59.49 39.95 60 36.14 49.31 44.09 48.8Z" />
    </svg>
  );
}

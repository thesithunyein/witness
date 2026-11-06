export default function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <path
        d="M42 21.2A15.5 15.5 0 1 1 22 21.2"
        stroke="currentColor"
        strokeWidth="2.15"
        strokeLinecap="round"
      />
      <path d="M32 16.4V40" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="32" cy="12.2" r="2.6" className="fill-moss" />
    </svg>
  );
}

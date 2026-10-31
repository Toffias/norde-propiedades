/** Ícono del asistente: un globo de chat con una chispa que titila cada tanto (`.chat-spark`). */
export function ChatSparkIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M26 15.5c0 5.2-4.7 9.2-10.5 9.2-1.4 0-2.8-.2-4-.7L6 26l1.5-4.4C6 20 5 17.9 5 15.5 5 10.3 9.7 6.3 15.5 6.3" />
      <path
        className="chat-spark"
        d="M23.5 3.5l1.2 3.1 3.1 1.2-3.1 1.2-1.2 3.1-1.2-3.1-3.1-1.2 3.1-1.2z"
        fill="currentColor"
        strokeWidth={1.2}
      />
    </svg>
  );
}

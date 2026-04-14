type GoogleLogoProps = {
  className?: string;
};

const GoogleLogo = ({ className }: GoogleLogoProps) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={className}
  >
    <path
      fill="#EA4335"
      d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.2 0-5.8-2.6-5.8-5.8s2.6-5.8 5.8-5.8c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.9 14.7 3 12 3 7 3 3 7 3 12s4 9 9 9c5.2 0 8.6-3.7 8.6-8.8 0-.6-.1-1.1-.2-1.6H12z"
    />
    <path
      fill="#34A853"
      d="M3 7.9l3.2 2.3C7 8 9.3 6.4 12 6.4c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.9 14.7 3 12 3 8.5 3 5.4 5 3.9 7.9z"
    />
    <path
      fill="#4A90E2"
      d="M12 21c2.6 0 4.8-.9 6.4-2.5l-3-2.5c-.8.6-1.9 1-3.4 1-3.7 0-5.2-2.5-5.4-3.9l-3.2 2.5C4.8 18.5 8.1 21 12 21z"
    />
    <path
      fill="#FBBC05"
      d="M3.6 8.8A8.8 8.8 0 003 12c0 1.1.2 2.2.6 3.2l3.2-2.5c-.2-.4-.3-.9-.3-1.4s.1-1 .3-1.4L3.6 8.8z"
    />
  </svg>
);

export default GoogleLogo;

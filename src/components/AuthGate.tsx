import { Armchair, Building2, Compass, Database, Loader2 } from 'lucide-react';

interface AuthGateProps {
  authReady: boolean;
  isSigningIn: boolean;
  errorMessage: string | null;
  onSignIn: () => void;
}

function GoogleMark() {
  return (
    <svg
      className="w-4 h-4 shrink-0"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3.01h3.87c2.26-2.08 3.56-5.15 3.56-8.66Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.87-3.01c-1.07.72-2.44 1.15-4.08 1.15-3.14 0-5.8-2.12-6.75-4.97H1.25v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.25 14.26A7.22 7.22 0 0 1 4.88 12c0-.78.14-1.54.37-2.26v-3.1H1.25a12 12 0 0 0 0 10.72l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.25 6.64l4 3.1c.95-2.85 3.61-4.97 6.75-4.97Z"
      />
    </svg>
  );
}

export function AuthGate({
  authReady,
  isSigningIn,
  errorMessage,
  onSignIn,
}: AuthGateProps) {
  return (
    <div
      data-auth-gate={authReady ? 'required' : 'loading'}
      className="relative min-h-screen w-screen bg-[#0d0f13] text-[#eceef2] flex items-center justify-center p-6 overflow-hidden"
    >
      {/* Subtle architectural drafting grid background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {!authReady ? (
        <div
          role="status"
          aria-live="polite"
          className="relative z-10 flex flex-col items-center gap-4 text-center"
        >
          <div className="w-11 h-11 rounded-xl bg-[#d99b4e]/15 border border-[#d99b4e]/40 flex items-center justify-center">
            <Compass className="w-5 h-5 text-[#e2a960]" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2.5 text-sm text-[#a5aebd]">
            <Loader2 className="w-4 h-4 animate-spin text-[#e2a960]" aria-hidden="true" />
            <span>Verifying your Google session...</span>
          </div>
        </div>
      ) : (
        <main className="relative z-10 w-full max-w-[440px] rounded-2xl bg-[#13161c] border border-white/[0.09] shadow-2xl p-7 sm:p-8 space-y-6">
          {/* Studio Brand Header */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#d99b4e]/15 border border-[#d99b4e]/45 flex items-center justify-center shrink-0">
                <Compass className="w-5 h-5 text-[#e2a960]" aria-hidden="true" />
              </div>
              <div>
                <p className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight text-[#f3f4f6]">
                  ArchWalk 3D
                </p>
                <p className="text-xs text-[#8a93a4]">Architectural 3D Walkthrough Studio</p>
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[#f8fafc] leading-tight">
                Sign in to enter the studio
              </h1>
              <p className="text-sm text-[#9ca3af] leading-relaxed">
                Convert floor plans, building exteriors, and single room photos into walkable 3D architecture.
              </p>
            </div>
          </div>

          {/* Studio Highlights */}
          <ul className="space-y-3 border-y border-white/[0.08] py-4">
            <li className="flex items-start gap-3">
              <Building2 className="w-4 h-4 text-[#e2a960] mt-0.5 shrink-0" aria-hidden="true" />
              <span className="text-xs text-[#cbd5e1] leading-relaxed">
                Explore generated single-story models in interactive Dollhouse or First-Person Walk mode.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Armchair className="w-4 h-4 text-[#e2a960] mt-0.5 shrink-0" aria-hidden="true" />
              <span className="text-xs text-[#cbd5e1] leading-relaxed">
                Generate custom multi-part 3D furniture sets from prompts and place them directly in any room.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Database className="w-4 h-4 text-[#e2a960] mt-0.5 shrink-0" aria-hidden="true" />
              <span className="text-xs text-[#cbd5e1] leading-relaxed">
                Your generated buildings and furniture pieces are saved automatically to your private library.
              </span>
            </li>
          </ul>

          {/* Sign-In Action */}
          <div className="space-y-3">
            {errorMessage && (
              <div
                role="alert"
                className="rounded-lg bg-red-950/60 border border-red-500/35 px-3.5 py-2.5 text-xs text-red-200 leading-relaxed"
              >
                {errorMessage}
              </div>
            )}

            <button
              type="button"
              onClick={onSignIn}
              disabled={isSigningIn}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-lg bg-[#f3f4f6] hover:bg-white disabled:opacity-70 disabled:cursor-not-allowed text-[#111318] text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e]"
            >
              {isSigningIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#111318]" aria-hidden="true" />
                  <span>Signing in with Google...</span>
                </>
              ) : (
                <>
                  <GoogleMark />
                  <span>Continue with Google</span>
                </>
              )}
            </button>

            <p className="text-center text-[11px] text-[#7c8494] leading-relaxed">
              Google sign-in is required to access ArchWalk 3D and protect your saved blueprints.
            </p>
          </div>
        </main>
      )}
    </div>
  );
}

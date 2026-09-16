import {
  Accessibility,
  Activity,
  ClipboardList,
  HeartPulse,
  History,
  MessageCircle,
  Moon,
  PhoneCall,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useHealthCheck } from '@workspace/api-client-react';
import { useTheme } from '@/hooks/use-theme';

interface MedicalShellProps {
  children: React.ReactNode;
}

export function MedicalShell({ children }: MedicalShellProps) {
  const [location] = useLocation();
  const [largeText, setLargeText] = useState(false);
  const { theme, toggleTheme, isDark } = useTheme();
  const health = useHealthCheck();
  const serviceReady = health.data?.status === 'ok' || health.data?.status === 'healthy';

  return (
    <div
      className={`min-h-[100dvh] bg-[#eef9fb] text-foreground transition-colors duration-200 dark:bg-[#12181B] dark:text-[#e5edf0] ${largeText ? 'large-text' : ''}`}
      data-text-size={largeText ? 'large' : 'normal'}
    >
      <header className="sticky top-0 z-30 border-b border-[#d9eaee] bg-[#f5fbfc]/90 backdrop-blur-md transition-colors duration-200 dark:border-[#24343d] dark:bg-[#141d22]/90">
        <div className="mx-auto flex h-[72px] max-w-[1320px] items-center justify-between px-3 sm:px-8 lg:px-10">
          <Link href="/" className="focus-ring group flex items-center gap-2.5 sm:gap-3 rounded-lg" data-testid="link-brand">
            <span className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-[13px] bg-[#075e54] text-[#dff7ef] shadow-[0_8px_20px_rgba(7,94,84,.18)] transition-transform duration-200 group-hover:-rotate-3 dark:bg-[#0c6b60] dark:text-[#e6faf4]">
              <HeartPulse size={20} strokeWidth={2.1} />
            </span>
            <span>
              <span className="font-display block text-[15px] sm:text-[17px] font-extrabold tracking-[-.03em] text-[#183f3a] dark:text-[#e5edf0]">
                Medical Assistant
              </span>
              <span className="hidden text-[10px] font-semibold uppercase tracking-[.16em] text-[#76918b] dark:text-[#8ea9a2] sm:block">
                A clearer next step
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-2.5">
            {/* 1. Accessibility / Large Text Toggle */}
            <button
              type="button"
              onClick={() => setLargeText((current) => !current)}
              className={`focus-ring flex flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-1 text-center transition-colors sm:flex-row sm:gap-1.5 sm:rounded-full sm:px-3 sm:py-2 ${
                largeText
                  ? 'border-[#a8d3dc] bg-[#e0f3f7] text-[#176477] dark:border-[#2f6674] dark:bg-[#15343d] dark:text-[#6ec5d8]'
                  : 'border-[#d6e7eb] bg-white/75 text-[#5f7a82] hover:bg-white dark:border-[#273942] dark:bg-[#192328] dark:text-[#9bb2b9] dark:hover:bg-[#202d33] dark:hover:text-[#e2e8f0]'
              }`}
              aria-pressed={largeText}
              data-state={largeText ? 'on' : 'off'}
              aria-label={largeText ? 'Use normal text' : 'Use large text'}
              title="Accessibility: Toggle Large Text"
              data-testid="button-toggle-text-size"
            >
              <Accessibility size={15} className="shrink-0" />
              <span className="text-[9px] font-bold leading-tight sm:text-xs">
                {largeText ? 'Normal' : 'Large Text'}
              </span>
            </button>

            {/* 2. Dark / Light Mode Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="focus-ring flex flex-col items-center justify-center gap-0.5 rounded-xl border border-[#d6e7eb] bg-white/75 px-2 py-1 text-center text-[#5f7a82] transition-colors hover:bg-white dark:border-[#273942] dark:bg-[#192328] dark:text-[#9bb2b9] dark:hover:bg-[#202d33] dark:hover:text-[#e2e8f0] sm:flex-row sm:gap-1.5 sm:rounded-full sm:px-3 sm:py-2"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              data-testid="button-toggle-theme"
            >
              {isDark ? (
                <Sun size={15} className="shrink-0 text-[#f59e0b]" />
              ) : (
                <Moon size={15} className="shrink-0 text-[#5f7a82]" />
              )}
              <span className="text-[9px] font-bold leading-tight sm:text-xs">
                {isDark ? 'Light' : 'Dark'}
              </span>
            </button>

            {/* Service status indicator on wider screens */}
            <div
              className="hidden items-center gap-2 rounded-full border border-[#d6e7eb] bg-white/70 px-3 py-1.5 text-xs font-medium text-[#62808a] dark:border-[#273942] dark:bg-[#192328] dark:text-[#9bb2b9] xl:flex"
              data-testid="status-service"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  health.isLoading
                    ? 'soft-pulse bg-[#d2a748]'
                    : serviceReady
                    ? 'bg-[#2d9e7d]'
                    : 'bg-[#c98c4b]'
                }`}
              />
              {health.isLoading ? 'Checking' : serviceReady ? 'Ready' : 'Check connection'}
            </div>

            {/* 3. History Button */}
            <Link
              href="/history"
              className={`focus-ring flex flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-1 text-center transition-colors sm:flex-row sm:gap-1.5 sm:rounded-full sm:px-3.5 sm:py-2 ${
                location === '/history'
                  ? 'border-[#b3d9df] bg-[#e0f3f7] text-[#176477] dark:border-[#2f6674] dark:bg-[#15343d] dark:text-[#6ec5d8]'
                  : 'border-[#d6e7eb] bg-white/75 text-[#557680] hover:bg-white dark:border-[#273942] dark:bg-[#192328] dark:text-[#9bb2b9] dark:hover:bg-[#202d33] dark:hover:text-[#e2e8f0]'
              }`}
              aria-label="History of recent scans"
              title="Recent Scan History"
              data-testid="link-history-header"
            >
              <History size={15} className="shrink-0" />
              <span className="text-[9px] font-bold leading-tight sm:text-xs">History</span>
            </Link>

            {/* 4. Health Chat Button */}
            <Link
              href="/chat"
              className={`focus-ring flex flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-1 text-center transition-colors sm:flex-row sm:gap-1.5 sm:rounded-full sm:px-3.5 sm:py-2 ${
                location === '/chat'
                  ? 'border-[#b3d9df] bg-[#e0f3f7] text-[#176477] dark:border-[#2f6674] dark:bg-[#15343d] dark:text-[#6ec5d8]'
                  : 'border-[#d6e7eb] bg-white/75 text-[#557680] hover:bg-white dark:border-[#273942] dark:bg-[#192328] dark:text-[#9bb2b9] dark:hover:bg-[#202d33] dark:hover:text-[#e2e8f0]'
              }`}
              aria-label="Health Chat & Symptom Checker"
              title="Health Chat / Symptom Checker"
              data-testid="link-chat-header"
            >
              <MessageCircle size={15} className="shrink-0" />
              <span className="text-[9px] font-bold leading-tight sm:text-xs">Health Chat</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100dvh-72px)] max-w-[1320px] lg:grid-cols-[218px_1fr]">
        <aside className="hidden border-r border-[#d9eaee] px-5 py-8 transition-colors duration-200 dark:border-[#24343d] lg:block">
          <p className="mb-4 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-[#86a19b] dark:text-[#8ea9a2]">
            Workspace
          </p>
          <nav className="space-y-1" aria-label="Main navigation">
            <Link
              href="/"
              className={`focus-ring flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-all ${
                location === '/'
                  ? 'bg-[#e1f3ed] text-[#075e54] shadow-sm dark:bg-[#14362f] dark:text-[#38c8a8]'
                  : 'text-[#607a74] hover:bg-white hover:text-[#075e54] dark:text-[#9cb3ad] dark:hover:bg-[#1c272d] dark:hover:text-[#38c8a8]'
              }`}
              data-testid="link-scan-nav"
            >
              <ScanLine size={18} />
              Scan an image
            </Link>
            <Link
              href="/history"
              className={`focus-ring flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-all ${
                location === '/history'
                  ? 'bg-[#e1f3ed] text-[#075e54] shadow-sm dark:bg-[#14362f] dark:text-[#38c8a8]'
                  : 'text-[#607a74] hover:bg-white hover:text-[#075e54] dark:text-[#9cb3ad] dark:hover:bg-[#1c272d] dark:hover:text-[#38c8a8]'
              }`}
              data-testid="link-history-nav"
            >
              <ClipboardList size={18} />
              Recent scans
            </Link>
            <Link
              href="/chat"
              className={`focus-ring flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-all ${
                location === '/chat'
                  ? 'bg-[#e1f3ed] text-[#075e54] shadow-sm dark:bg-[#14362f] dark:text-[#38c8a8]'
                  : 'text-[#607a74] hover:bg-white hover:text-[#075e54] dark:text-[#9cb3ad] dark:hover:bg-[#1c272d] dark:hover:text-[#38c8a8]'
              }`}
              data-testid="link-chat-nav"
            >
              <MessageCircle size={18} />
              Health chat
            </Link>
          </nav>

          <div className="mt-12 rounded-2xl border border-[#dcece6] bg-[#e9f6f1] p-4 transition-colors duration-200 dark:border-[#23483f] dark:bg-[#152924]">
            <ShieldCheck size={19} className="mb-3 text-[#19836e] dark:text-[#38c8a8]" />
            <p className="font-display text-sm font-bold leading-snug text-[#24564d] dark:text-[#d1f2e8]">
              Your health comes first.
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-[#64847c] dark:text-[#9cb3ad]">
              Use this as a guide, not a diagnosis. A doctor or pharmacist can help you decide what to do next.
            </p>
          </div>

          <div className="mt-5 flex items-center gap-2 px-3 text-[11px] text-[#91aaa4] dark:text-[#7f9993]">
            <Activity size={13} />
            Private in-session scans
          </div>
          <EmergencyCard />
        </aside>

        <main className="min-w-0 px-5 py-7 sm:px-8 lg:px-12 lg:py-10">
          {children}
          <div className="mt-8 lg:hidden">
            <EmergencyCard />
          </div>
        </main>
      </div>
    </div>
  );
}

function EmergencyCard() {
  return (
    <section
      className="mt-8 rounded-2xl border border-[#efd5c9] bg-[#fff7f2] p-4 transition-colors duration-200 dark:border-[#522924] dark:bg-[#251614]"
      data-testid="card-emergency-helpline"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fce3d9] text-[#b65f54] dark:bg-[#401f1a] dark:text-[#f87171]">
          <ShieldAlert size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#a76053] dark:text-[#f87171]">
            Emergency help
          </p>
          <p className="mt-1 font-display text-sm font-extrabold text-[#70463f] dark:text-[#fca5a5]">
            Poison Control: 1800 116 117
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[#8b6d65] dark:text-[#d4a59f]">
            In case of overdose or severe reaction, call now or go to the nearest hospital.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[#8b6d65] dark:text-[#d4a59f]">
            ओवरडोज़ या गंभीर प्रतिक्रिया में तुरंत कॉल करें या नज़दीकी अस्पताल जाएं।
          </p>
          <a
            href="tel:1800116117"
            className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#e5c2b6] bg-white px-2.5 py-1.5 text-xs font-bold text-[#a85549] transition-colors hover:bg-[#fff0e8] dark:border-[#63322c] dark:bg-[#331c19] dark:text-[#fca5a5] dark:hover:bg-[#3d201c]"
            data-testid="link-emergency-call"
          >
            <PhoneCall size={13} /> Call 1800 116 117
          </a>
        </div>
      </div>
    </section>
  );
}
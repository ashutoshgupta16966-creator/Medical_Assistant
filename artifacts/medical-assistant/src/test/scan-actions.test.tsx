import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScanAnalysis } from '@workspace/api-client-react';
import { MedicalShell } from '@/components/medical-shell';
import { ScanUploader, type SelectedImage } from '@/components/scan-uploader';
import { History } from '@/pages/history';
import { Home, type ScanRecord } from '@/pages/home';

const { mutateMock, healthCheckMock } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  healthCheckMock: vi.fn(() => ({ data: { status: 'ok' }, isLoading: false })),
}));

vi.mock('@workspace/api-client-react', () => ({
  useAnalyzeScan: () => ({ mutate: mutateMock, isPending: false }),
  useHealthCheck: healthCheckMock,
}));

vi.mock('wouter', () => ({
  Link: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ['/'],
}));

const image: SelectedImage = {
  dataUrl: 'data:image/png;base64,scan',
  mimeType: 'image/png',
  fileName: 'medicine.png',
};

const analysis = {
  category: 'medicine',
  nameEnglish: 'Paracetamol',
  nameHindi: 'पैरासिटामोल',
  treatsEnglish: 'Fever and pain',
  treatsHindi: 'बुखार और दर्द',
  usage: 'Take after food',
  usageHindi: 'खाने के बाद लें',
  dosage: 'As directed',
  dosageHindi: 'निर्देशानुसार',
  expiryDate: '2027-01-15',
  expiryLabel: '15 Jan 2027',
  expiryLabelHindi: '15 जनवरी 2027',
  expiryStatus: 'safe',
  confidence: 0.94,
  notes: ['Do not exceed the recommended dose'],
  notesHindi: ['अनुशंसित खुराक से अधिक न लें'],
} as ScanAnalysis;

function record(id: string, nameEnglish: string): ScanRecord {
  return {
    id,
    createdAt: '2026-09-05T10:00:00.000Z',
    image: { ...image, fileName: `${id}.png` },
    analysis: { ...analysis, nameEnglish },
  };
}

async function renderAnalyzedHome() {
  const user = userEvent.setup();
  const onAddHistory = vi.fn();
  render(<Home history={[]} onAddHistory={onAddHistory} />);

  const file = new File(['scan'], 'medicine.png', { type: 'image/png' });
  await user.upload(screen.getByTestId('input-upload-image'), file);
  await waitFor(() => expect(screen.getByTestId('img-scan-preview')).toBeInTheDocument());

  mutateMock.mockImplementationOnce((_request: unknown, options: { onSuccess: (result: ScanAnalysis) => void }) => {
    options.onSuccess(analysis);
  });
  await user.click(screen.getByTestId('button-analyze-scan'));
  await waitFor(() => expect(screen.getByTestId('card-analysis-result')).toBeInTheDocument());

  return user;
}

async function tabUntil(user: ReturnType<typeof userEvent.setup>, target: HTMLElement) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await user.tab();
    if (document.activeElement === target) return;
  }
  throw new Error(`Could not reach ${target.dataset.testid || target.tagName} with Tab`);
}

describe('scan actions', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mutateMock.mockReset();
    healthCheckMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens, cancels, and confirms deletion with keyboard controls', async () => {
    const user = userEvent.setup();
    const first = record('first', 'Paracetamol');
    const second = record('second', 'Amoxicillin');

    function HistoryHarness() {
      const [history, setHistory] = useState([first, second]);
      return <History history={history} onDeleteHistory={(id) => setHistory((current) => current.filter((item) => item.id !== id))} />;
    }

    render(<HistoryHarness />);
    expect(screen.getByTestId('card-history-scan-first')).toBeInTheDocument();
    expect(screen.getByTestId('card-history-scan-second')).toBeInTheDocument();

    const deleteButton = screen.getByTestId('button-delete-history-first');
    deleteButton.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();

    expect(document.activeElement).toHaveAccessibleName('Cancel');
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('card-history-scan-first')).toBeInTheDocument();
    expect(screen.getByTestId('card-history-scan-second')).toBeInTheDocument();

    deleteButton.focus();
    await user.keyboard(' ');
    const deleteAction = screen.getByRole('button', { name: 'Delete' });
    deleteAction.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByTestId('card-history-scan-first')).not.toBeInTheDocument());
    expect(screen.getByTestId('card-history-scan-second')).toBeInTheDocument();
  });

  it('uses the selected English and Hindi languages for read-aloud', async () => {
    const speech = {
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      speak: vi.fn(),
    };
    vi.stubGlobal('speechSynthesis', speech);
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: speech });

    class TestUtterance {
      lang = '';
      voice: SpeechSynthesisVoice | undefined;

      constructor(public text: string) {}
    }
    vi.stubGlobal('SpeechSynthesisUtterance', TestUtterance);

    const user = await renderAnalyzedHome();
    const readAloudButton = screen.getByTestId('button-read-aloud');
    expect(readAloudButton).toHaveClass('focus-ring');
    readAloudButton.focus();
    await user.keyboard('{Enter}');
    expect(speech.speak).toHaveBeenLastCalledWith(expect.objectContaining({ lang: 'en-IN' }));
    expect(readAloudButton).toHaveAttribute('aria-pressed', 'true');
    expect(readAloudButton).toHaveAttribute('data-state', 'on');

    const hindiButton = screen.getByTestId('button-language-hindi');
    expect(hindiButton).toHaveAccessibleName('Read aloud in Hindi');
    hindiButton.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('button-language-hindi')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('button-language-hindi')).toHaveAttribute('data-state', 'on');
    readAloudButton.focus();
    await user.keyboard('{Enter}');
    expect(speech.speak).toHaveBeenLastCalledWith(expect.objectContaining({ lang: 'hi-IN' }));
    expect(speech.speak.mock.lastCall?.[0].text).toContain('पैरासिटामोल');
    expect(screen.queryByTestId('button-share-whatsapp')).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-print-result')).not.toBeInTheDocument();
  });

  it('dismisses onboarding and toggles large text state with the keyboard', async () => {
    const user = userEvent.setup();
    render(
      <MedicalShell>
        <div>Scanner content</div>
      </MedicalShell>,
    );

    const shell = screen.getByTestId('button-toggle-text-size').closest('[data-text-size]');
    expect(shell).toHaveAttribute('data-text-size', 'normal');
    expect(screen.getByTestId('button-toggle-text-size')).toHaveAttribute('aria-pressed', 'false');

    const textSizeButton = screen.getByTestId('button-toggle-text-size');
    textSizeButton.focus();
    await user.keyboard('{Enter}');
    expect(shell).toHaveAttribute('data-text-size', 'large');
    expect(screen.getByTestId('button-toggle-text-size')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('button-toggle-text-size')).toHaveAttribute('data-state', 'on');

    render(<Home history={[]} onAddHistory={vi.fn()} />);
    expect(screen.getByTestId('status-onboarding-hint')).toBeInTheDocument();
    const dismissButton = screen.getByTestId('button-dismiss-onboarding');
    expect(dismissButton).toHaveClass('focus-ring');
    dismissButton.focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByTestId('status-onboarding-hint')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('medical-assistant-onboarding-dismissed')).toBe('1');
  });

  it('completes the primary scan journey with keyboard activation', async () => {
    const user = userEvent.setup();
    const onAddHistory = vi.fn();
    render(<Home history={[]} onAddHistory={onAddHistory} />);

    const uploadButton = screen.getByTestId('button-upload-image');
    await tabUntil(user, uploadButton);
    await user.keyboard('{Enter}');

    const file = new File(['scan'], 'medicine.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('input-upload-image'), file);
    await waitFor(() => expect(screen.getByTestId('img-scan-preview')).toBeInTheDocument());

    mutateMock.mockImplementationOnce((_request: unknown, options: { onSuccess: (result: ScanAnalysis) => void }) => {
      options.onSuccess(analysis);
    });
    const analyzeButton = screen.getByTestId('button-analyze-scan');
    await tabUntil(user, analyzeButton);
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.getByTestId('card-analysis-result')).toBeInTheDocument());
    expect(onAddHistory).toHaveBeenCalledWith(expect.objectContaining({ analysis }));
  });

  it('shows a disabled spinning analyze control while loading', () => {
    render(<ScanUploader image={image} onSelect={vi.fn()} onClear={vi.fn()} onAnalyze={vi.fn()} isAnalyzing />);

    const analyzeButton = screen.getByTestId('button-analyze-scan');
    expect(analyzeButton).toBeDisabled();
    expect(analyzeButton).toHaveTextContent('Reading image…');
    expect(analyzeButton.querySelector('.animate-spin')).toBeInTheDocument();
  });
});
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScanAnalysis } from '@workspace/api-client-react';
import { Chat, type ChatMessage } from '@/pages/chat';
import { History } from '@/pages/history';
import { Home, type ScanRecord } from '@/pages/home';
import { MedicalShell } from '@/components/medical-shell';
import { detectReminderFrequency, getNextReminderTimes } from '@/lib/reminders';

const { analyzeMock, chatMock, healthMock } = vi.hoisted(() => ({
  analyzeMock: vi.fn(),
  chatMock: vi.fn(),
  healthMock: vi.fn(() => ({ data: { status: 'ok' }, isLoading: false })),
}));

vi.mock('@workspace/api-client-react', () => ({
  useAnalyzeScan: () => ({ mutate: analyzeMock, isPending: false }),
  useChatHealth: () => ({ mutate: chatMock, isPending: false }),
  useHealthCheck: healthMock,
}));

const image = { dataUrl: 'data:image/png;base64,scan', mimeType: 'image/png' as const, fileName: 'medicine.png' };
const analysis = {
  category: 'medicine',
  nameEnglish: 'Paracetamol',
  nameHindi: 'पैरासिटामोल',
  treatsEnglish: 'Fever and pain',
  treatsHindi: 'बुखार और दर्द',
  usage: 'Take twice daily after food',
  usageHindi: 'खाने के बाद दिन में दो बार लें',
  dosage: 'Take twice daily',
  dosageHindi: 'दिन में दो बार लें',
  expiryDate: '2027-01-15',
  expiryStatus: 'safe',
  expiryLabel: 'Safe to Use',
  expiryLabelHindi: 'उपयोग के लिए सुरक्षित',
  confidence: 0.9,
  notes: ['Do not exceed the recommended dose'],
  notesHindi: ['अनुशंसित खुराक से अधिक न लें'],
} as ScanAnalysis;

function record(id: string, familyMember: string): ScanRecord {
  return { id, createdAt: '2026-09-05T10:00:00.000Z', image, analysis, familyMember };
}

async function renderResult() {
  const user = userEvent.setup();
  render(<Home history={[]} onAddHistory={vi.fn()} />);
  await user.upload(screen.getByTestId('input-upload-image'), new File(['scan'], 'medicine.png', { type: 'image/png' }));
  await waitFor(() => expect(screen.getByTestId('img-scan-preview')).toBeInTheDocument());
  analyzeMock.mockImplementationOnce((_request: unknown, options: { onSuccess: (result: ScanAnalysis) => void }) => options.onSuccess(analysis));
  await user.click(screen.getByTestId('button-analyze-scan'));
  await waitFor(() => expect(screen.getByTestId('card-analysis-result')).toBeInTheDocument());
  return user;
}

describe('new health assistant features', () => {
  beforeEach(() => {
    analyzeMock.mockReset();
    chatMock.mockReset();
    healthMock.mockClear();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects twice-daily medicine frequency and offers a reminder after scanning', async () => {
    expect(detectReminderFrequency(analysis)?.label).toBe('Twice a day');
    expect(getNextReminderTimes({ label: 'Twice a day', times: [9, 21] }, new Date('2026-09-06T08:00:00Z'))).toHaveLength(2);
    await renderResult();
    expect(screen.getByTestId('card-medicine-reminder')).toBeInTheDocument();
    expect(screen.getByTestId('button-set-reminder')).toBeInTheDocument();
  });

  it('filters recent scans by family member', async () => {
    const user = userEvent.setup();
    render(<History history={[record('papa', 'Papa'), record('myself', 'Myself')]} onDeleteHistory={vi.fn()} />);
    expect(screen.getByText('For: Papa')).toBeInTheDocument();
    await user.selectOptions(screen.getByTestId('select-history-family-filter'), 'Papa');
    expect(screen.getByTestId('card-history-scan-papa')).toBeInTheDocument();
    expect(screen.queryByTestId('card-history-scan-myself')).not.toBeInTheDocument();
  });

  it('shows the verified emergency helpline in the shared shell', () => {
    render(<MedicalShell><div>Content</div></MedicalShell>);
    expect(screen.getAllByTestId('card-emergency-helpline')[0]).toHaveTextContent('1800 116 117');
    expect(screen.getAllByTestId('link-emergency-call')[0]).toHaveAttribute('href', 'tel:1800116117');
  });

  it('keeps bilingual chat responses in the session and switches existing replies', async () => {
    const user = userEvent.setup();
    chatMock.mockImplementationOnce((_request: unknown, options: { onSuccess: (result: unknown) => void }) => options.onSuccess({
      answerEnglish: 'Rest and drink water.\n\nIf symptoms are severe, see a doctor immediately.\n\nThis is AI-generated guidance, not a diagnosis. Please confirm with a doctor or pharmacist.',
      answerHindi: 'आराम करें और पानी पिएं।\n\nगंभीर लक्षण हों तो तुरंत डॉक्टर को दिखाएं।\n\nयह AI द्वारा बनाई गई जानकारी है, यह कोई निदान नहीं है। कृपया डॉक्टर या फार्मासिस्ट से पुष्टि करें।',
      disclaimerEnglish: 'This is AI-generated guidance, not a diagnosis. Please confirm with a doctor or pharmacist.',
      disclaimerHindi: 'यह AI द्वारा बनाई गई जानकारी है, यह कोई निदान नहीं है। कृपया डॉक्टर या फार्मासिस्ट से पुष्टि करें।',
    }));
    function ChatHarness() {
      const [messages, setMessages] = useState<ChatMessage[]>([]);
      const [language, setLanguage] = useState<'en' | 'hi'>('en');
      return <Chat messages={messages} onAddMessage={(message) => setMessages((current) => [...current, message])} language={language} onLanguageChange={setLanguage} />;
    }
    render(<ChatHarness />);
    await user.type(screen.getByTestId('input-health-concern'), 'I have a mild fever');
    await user.click(screen.getByTestId('button-send-chat'));
    await waitFor(() => expect(screen.getByText(/Rest and drink water/)).toBeInTheDocument());
    await user.click(screen.getByTestId('button-language-hi'));
    expect(screen.getByText(/आराम करें और पानी पिएं/)).toBeInTheDocument();
  });

  it('reads one assistant message aloud and clears the conversation', async () => {
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

    const user = userEvent.setup();
    chatMock.mockImplementationOnce((_request: unknown, options: { onSuccess: (result: unknown) => void }) => options.onSuccess({
      answerEnglish: 'Rest and drink water.',
      answerHindi: 'आराम करें और पानी पिएं।',
      disclaimerEnglish: 'This is AI-generated guidance, not a diagnosis. Please confirm with a doctor or pharmacist.',
      disclaimerHindi: 'यह AI द्वारा बनाई गई जानकारी है, यह कोई निदान नहीं है। कृपया डॉक्टर या फार्मासिस्ट से पुष्टि करें।',
    }));
    function ChatHarness() {
      const [messages, setMessages] = useState<ChatMessage[]>([]);
      return <Chat messages={messages} onAddMessage={(message) => setMessages((current) => [...current, message])} onClearMessages={() => setMessages([])} language="en" onLanguageChange={vi.fn()} />;
    }
    render(<ChatHarness />);
    await user.type(screen.getByTestId('input-health-concern'), 'I have a mild fever');
    await user.click(screen.getByTestId('button-send-chat'));
    await waitFor(() => expect(screen.getByText('Rest and drink water.')).toBeInTheDocument());

    const messageId = screen.getByText('Rest and drink water.').closest('[data-testid^="message-assistant-"]')?.getAttribute('data-testid')?.replace('message-assistant-', '');
    expect(messageId).toBeTruthy();
    const readButton = screen.getByTestId(`button-read-message-${messageId}`);
    await user.click(readButton);
    expect(speech.speak).toHaveBeenCalledOnce();
    await user.click(readButton);
    expect(speech.cancel).toHaveBeenCalled();

    await user.click(screen.getByTestId('button-clear-chat'));
    expect(screen.getByTestId('empty-chat-state')).toBeInTheDocument();
  });
});
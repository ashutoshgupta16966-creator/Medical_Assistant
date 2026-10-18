import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MedicalShell } from '@/components/medical-shell';
import { Chat, type ChatMessage } from '@/pages/chat';

const { healthMock, chatMock } = vi.hoisted(() => ({
  healthMock: vi.fn(() => ({ data: { status: 'ok' }, isLoading: false })),
  chatMock: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@workspace/api-client-react', () => ({
  useHealthCheck: healthMock,
  useChatHealth: chatMock,
}));


describe('Header icon buttons with labels and Dark mode toggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('renders visible text labels for all header icon buttons', () => {
    render(<MedicalShell><div>Content</div></MedicalShell>);

    // 1. Accessibility / Large Text button
    const accessibilityBtn = screen.getByTestId('button-toggle-text-size');
    expect(accessibilityBtn).toBeInTheDocument();
    expect(accessibilityBtn).toHaveTextContent(/Large Text|Normal/i);
    expect(accessibilityBtn).toHaveAttribute('title', expect.stringMatching(/accessibility|large text/i));

    // 2. Dark mode toggle button
    const themeBtn = screen.getByTestId('button-toggle-theme');
    expect(themeBtn).toBeInTheDocument();
    expect(themeBtn).toHaveTextContent(/Dark|Light/i);
    expect(themeBtn).toHaveAttribute('title', expect.stringMatching(/light mode|dark mode/i));

    // 3. History link
    const historyLink = screen.getByTestId('link-history-header');
    expect(historyLink).toBeInTheDocument();
    expect(historyLink).toHaveTextContent(/History/i);

    // 4. Health Chat link
    const chatLink = screen.getByTestId('link-chat-header');
    expect(chatLink).toBeInTheDocument();
    expect(chatLink).toHaveTextContent(/Health Chat/i);
  });

  it('toggles dark mode on click, updates DOM and persists to localStorage', async () => {
    const user = userEvent.setup();
    render(<MedicalShell><div>Content</div></MedicalShell>);

    const themeBtn = screen.getByTestId('button-toggle-theme');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(themeBtn).toHaveTextContent(/Dark/i);

    // Click to enable dark mode
    await user.click(themeBtn);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('medical-assistant-theme')).toBe('dark');
    expect(themeBtn).toHaveTextContent(/Light/i);

    // Click to switch back to light mode
    await user.click(themeBtn);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('medical-assistant-theme')).toBe('light');
    expect(themeBtn).toHaveTextContent(/Dark/i);
  });

  it('initializes dark mode from localStorage if previously set', () => {
    localStorage.setItem('medical-assistant-theme', 'dark');
    render(<MedicalShell><div>Content</div></MedicalShell>);

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    const themeBtn = screen.getByTestId('button-toggle-theme');
    expect(themeBtn).toHaveTextContent(/Light/i);
  });

  it('positions the read-aloud button below the stethoscope avatar on assistant messages with light & dark styling', async () => {
    const speech = {
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      speak: vi.fn(),
    };
    vi.stubGlobal('speechSynthesis', speech);
    class TestUtterance {
      lang = '';
      voice: SpeechSynthesisVoice | undefined;
      onstart: (() => void) | undefined;
      onend: (() => void) | undefined;
      constructor(public text: string) {}
    }
    vi.stubGlobal('SpeechSynthesisUtterance', TestUtterance);

    const user = userEvent.setup();
    const assistantMessage: ChatMessage = {
      id: 'msg-assist-1',
      role: 'assistant',
      message: 'Drink plenty of fluids and rest. Contact a doctor if fever exceeds 102F.',
      createdAt: new Date().toISOString(),
    };
    const userMessage: ChatMessage = {
      id: 'msg-user-1',
      role: 'user',
      message: 'I have a fever',
      createdAt: new Date().toISOString(),
    };

    const { rerender } = render(
      <Chat
        messages={[userMessage, assistantMessage]}
        onAddMessage={vi.fn()}
        language="en"
        onLanguageChange={vi.fn()}
      />
    );

    // 1. Verify speaker button is NOT rendered on user message
    expect(screen.queryByTestId('button-read-message-msg-user-1')).not.toBeInTheDocument();

    // 2. Verify speaker button is rendered for assistant message
    const speakerBtn = screen.getByTestId('button-read-message-msg-assist-1');
    expect(speakerBtn).toBeInTheDocument();

    // 3. Verify it is inside the avatar column container (same parent as the stethoscope avatar)
    const avatarContainer = speakerBtn.parentElement;
    expect(avatarContainer).toHaveClass('flex-col');
    expect(avatarContainer).toHaveClass('items-center');
    expect(avatarContainer?.querySelector('svg.lucide-stethoscope')).toBeInTheDocument();

    // 4. Default / Idle state: blue play icon styling
    expect(speakerBtn).toHaveAttribute('aria-pressed', 'false');
    expect(speakerBtn.className).toContain('text-blue-600');
    expect(speakerBtn.className).toContain('dark:text-blue-400');
    expect(speakerBtn.querySelector('svg.lucide-volume-2')).toBeInTheDocument();

    // 5. Click to read aloud -> plays speech and switches to red mute icon styling
    await user.click(speakerBtn);
    expect(speech.speak).toHaveBeenCalled();
    expect(speakerBtn).toHaveAttribute('aria-pressed', 'true');
    expect(speakerBtn.className).toContain('text-red-600');
    expect(speakerBtn.className).toContain('dark:text-red-400');
    expect(speakerBtn.querySelector('svg.lucide-volume-x')).toBeInTheDocument();

    // 6. Click again to stop -> stops speech and switches back to blue icon
    await user.click(speakerBtn);
    expect(speech.cancel).toHaveBeenCalled();
    expect(speakerBtn).toHaveAttribute('aria-pressed', 'false');
    expect(speakerBtn.className).toContain('text-blue-600');

    // 7. Verify in Dark Mode
    document.documentElement.classList.add('dark');
    expect(document.documentElement).toHaveClass('dark');
    // Button still has dark mode classes
    expect(speakerBtn.className).toContain('dark:border-blue-900/50');
    expect(speakerBtn.className).toContain('dark:text-blue-400');
  });
});


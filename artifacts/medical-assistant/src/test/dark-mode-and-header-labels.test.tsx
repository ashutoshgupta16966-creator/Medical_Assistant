import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MedicalShell } from '@/components/medical-shell';

const { healthMock } = vi.hoisted(() => ({
  healthMock: vi.fn(() => ({ data: { status: 'ok' }, isLoading: false })),
}));

vi.mock('@workspace/api-client-react', () => ({
  useHealthCheck: healthMock,
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
});

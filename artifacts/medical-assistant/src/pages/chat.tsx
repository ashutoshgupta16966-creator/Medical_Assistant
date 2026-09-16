import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useChatHealth } from '@workspace/api-client-react';
import { AlertCircle, HeartPulse, RotateCcw, Send, ShieldCheck, Stethoscope, Volume2, VolumeX, X } from 'lucide-react';

export type ChatLanguage = 'en' | 'hi';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  message: string;
  messageEnglish?: string;
  messageHindi?: string;
  createdAt: string | Date;
}

export interface ChatProps {
  messages: ChatMessage[];
  onAddMessage: (message: ChatMessage) => void;
  language: ChatLanguage;
  onLanguageChange: (language: ChatLanguage) => void;
  onClearMessages?: () => void;
}

const copy = {
  en: {
    eyebrow: 'General health guidance',
    title: 'Tell me what is bothering you.',
    intro:
      'Share a symptom or health concern in your own words. I will help you think through safe next steps.',
    emptyTitle: 'Your private health conversation starts here',
    emptyBody:
      'You can ask about symptoms, common conditions, or what to discuss with a clinician. Please do not include passwords or other sensitive details.',
    promptOne: 'I have had a headache since this morning',
    promptTwo: 'What can help with a mild sore throat?',
    you: 'You',
    assistant: 'Medical Assistant',
    messageLabel: 'Your health concern',
    placeholder: 'For example: I have felt dizzy when I stand up...',
    send: 'Send concern',
    sending: 'Reviewing your concern',
    languageLabel: 'Response language',
    english: 'English',
    hindi: 'हिन्दी',
    safetyTitle: 'Safety first',
    safetyBody: 'This is general information, not a diagnosis or a substitute for medical care.',
    errorTitle: 'We could not reach the assistant',
    errorBody: 'Please check your connection and try sending your concern again.',
    retry: 'Try again',
    characterCount: (count: number) => `${count}/2000`,
    validation: 'Please enter at least two characters so I can understand your concern.',
    timeFallback: 'Just now',
    urgent:
      'If you have severe or rapidly worsening symptoms, call your local emergency service or seek urgent care now.',
    disclaimerPrefix: 'Safety note:',
  },
  hi: {
    eyebrow: 'सामान्य स्वास्थ्य मार्गदर्शन',
    title: 'आपको क्या परेशान कर रहा है, बताइए।',
    intro:
      'अपने शब्दों में लक्षण या स्वास्थ्य संबंधी चिंता साझा करें। मैं सुरक्षित अगले कदम समझने में आपकी मदद करूंगा।',
    emptyTitle: 'आपकी निजी स्वास्थ्य बातचीत यहां से शुरू होती है',
    emptyBody:
      'आप लक्षणों, सामान्य समस्याओं या डॉक्टर से पूछे जाने वाले सवालों के बारे में पूछ सकते हैं। पासवर्ड या अन्य संवेदनशील जानकारी साझा न करें।',
    promptOne: 'आज सुबह से मेरे सिर में दर्द है',
    promptTwo: 'हल्के गले के दर्द में क्या मदद कर सकता है?',
    you: 'आप',
    assistant: 'मेडिकल असिस्टेंट',
    messageLabel: 'आपकी स्वास्थ्य चिंता',
    placeholder: 'उदाहरण: खड़े होने पर मुझे चक्कर महसूस हो रहा है...',
    send: 'चिंता भेजें',
    sending: 'आपकी चिंता की समीक्षा हो रही है',
    languageLabel: 'उत्तर की भाषा',
    english: 'English',
    hindi: 'हिन्दी',
    safetyTitle: 'सुरक्षा सबसे पहले',
    safetyBody: 'यह सामान्य जानकारी है, निदान नहीं और चिकित्सा देखभाल का विकल्प नहीं है।',
    errorTitle: 'असिस्टेंट से संपर्क नहीं हो सका',
    errorBody: 'कृपया अपना कनेक्शन जांचें और अपनी चिंता फिर से भेजें।',
    retry: 'फिर कोशिश करें',
    characterCount: (count: number) => `${count}/2000`,
    validation: 'कृपया कम से कम दो अक्षर लिखें ताकि मैं आपकी चिंता समझ सकूं।',
    timeFallback: 'अभी',
    urgent:
      'यदि लक्षण गंभीर हैं या तेजी से बिगड़ रहे हैं, तो तुरंत स्थानीय आपातकालीन सेवा को कॉल करें या नजदीकी अस्पताल जाएं।',
    disclaimerPrefix: 'सुरक्षा सूचना:',
  },
} as const;

function createMessageId(role: ChatMessage['role']) {
  return `${role}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(value: string | Date, language: ChatLanguage) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function MessageBubble({
  message,
  language,
  isSpeaking,
  onReadAloud,
}: {
  message: ChatMessage;
  language: ChatLanguage;
  isSpeaking: boolean;
  onReadAloud: () => void;
}) {
  const isUser = message.role === 'user';
  const strings = copy[language];
  const time = formatTime(message.createdAt, language);

  return (
    <article
      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
      data-testid={`message-${message.role}-${message.id}`}
      aria-label={`${isUser ? strings.you : strings.assistant}: ${message.message}`}
    >
      {!isUser && (
        <div
          className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"
          aria-hidden="true"
        >
          <Stethoscope className="size-[18px]" strokeWidth={1.8} />
        </div>
      )}
       <div className={`max-w-[min(680px,86%)] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
         <div className="flex items-end gap-2">
           <div
             className={`rounded-[1.35rem] px-4 py-3.5 text-[0.94rem] leading-7 shadow-[0_6px_20px_rgba(24,80,70,0.045)] ${
               isUser
                 ? 'rounded-br-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                 : 'rounded-bl-md border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]'
             }`}
             data-testid={`text-message-${message.id}`}
           >
              <p className="whitespace-pre-wrap">{isUser ? message.message : (language === 'hi' ? message.messageHindi : message.messageEnglish) || message.message}</p>
           </div>
           {!isUser && (
             <button
               type="button"
               onClick={onReadAloud}
               className="focus-ring mb-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--primary))] transition-colors hover:bg-[hsl(var(--secondary))]"
               aria-label={isSpeaking ? 'Stop reading this response' : 'Read this response aloud'}
               aria-pressed={isSpeaking}
               data-testid={`button-read-message-${message.id}`}
             >
               {isSpeaking ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
             </button>
           )}
         </div>
        <div
          className={`mt-1.5 px-1 text-[0.69rem] font-medium uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))] ${
            isUser ? 'text-right' : 'text-left'
          }`}
          data-testid={`text-message-time-${message.id}`}
        >
          {time || strings.timeFallback}
        </div>
      </div>
    </article>
  );
}

export function Chat({ messages, onAddMessage, language, onLanguageChange, onClearMessages }: ChatProps) {
  const strings = copy[language];
  const [draft, setDraft] = useState('');
  const [validationMessage, setValidationMessage] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [failedQuestion, setFailedQuestion] = useState('');
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const conversationVersionRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chat = useChatHealth();

  const isSending = chat.isPending;
  const errorVisible = Boolean(failedQuestion) && !isSending;
  const messageCountLabel = useMemo(
    () => (messages.length === 0 ? strings.emptyTitle : `${messages.length} ${language === 'hi' ? 'संदेश' : 'messages'}`),
    [language, messages.length, strings.emptyTitle],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, isSending]);

  useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const readMessageAloud = (message: ChatMessage) => {
    if (!('speechSynthesis' in window)) return;
    if (speakingMessageId === message.id) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    const text = (language === 'hi' ? message.messageHindi : message.messageEnglish) || message.message;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const speechLanguage = language === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.lang = speechLanguage;
    const matchingVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith(language));
    if (matchingVoice) utterance.voice = matchingVoice;
    utterance.onstart = () => setSpeakingMessageId(message.id);
    utterance.onend = () => setSpeakingMessageId((current) => current === message.id ? null : current);
    utterance.onerror = () => setSpeakingMessageId((current) => current === message.id ? null : current);
    setSpeakingMessageId(message.id);
    window.speechSynthesis.speak(utterance);
  };

  const clearChat = () => {
    conversationVersionRef.current += 1;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeakingMessageId(null);
    setDraft('');
    setValidationMessage('');
    setPendingQuestion('');
    setFailedQuestion('');
    onClearMessages?.();
  };

  const submitQuestion = (question: string, addToConversation: boolean) => {
    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length < 2) {
      setValidationMessage(strings.validation);
      inputRef.current?.focus();
      return;
    }

    setValidationMessage('');
    setFailedQuestion('');
    setPendingQuestion(trimmedQuestion);
    const conversationVersion = conversationVersionRef.current;
    if (addToConversation) {
      onAddMessage({
        id: createMessageId('user'),
        role: 'user',
        message: trimmedQuestion,
        createdAt: new Date().toISOString(),
      });
      setDraft('');
    }

    chat.mutate(
      { data: { message: trimmedQuestion } },
      {
        onSuccess: (response) => {
          if (conversationVersion !== conversationVersionRef.current) return;
          onAddMessage({
            id: createMessageId('assistant'),
            role: 'assistant',
             message: response.answerEnglish.trim(),
             messageEnglish: response.answerEnglish.trim(),
             messageHindi: response.answerHindi.trim(),
            createdAt: new Date().toISOString(),
          });
          setPendingQuestion('');
          setFailedQuestion('');
        },
        onError: () => {
          if (conversationVersion !== conversationVersionRef.current) return;
          setFailedQuestion(trimmedQuestion);
          setPendingQuestion('');
        },
      },
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSending) return;
    submitQuestion(draft, true);
  };

  const handlePromptClick = (prompt: string) => {
    if (!isSending) {
      setDraft(prompt);
      setValidationMessage('');
      inputRef.current?.focus();
    }
  };

  return (
    <main className="min-h-[calc(100dvh-2rem)] bg-[hsl(var(--background))] px-3 py-4 sm:px-6 sm:py-6 lg:px-8" data-testid="page-chat">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-6xl flex-col overflow-hidden rounded-[1.75rem] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_22px_70px_rgba(25,86,76,0.08)]">
        <header className="relative overflow-hidden border-b border-[hsl(var(--border))] px-5 py-5 sm:px-8 sm:py-6">
          <div className="absolute -right-20 -top-28 size-64 rounded-full bg-[hsl(var(--secondary))] opacity-70" aria-hidden="true" />
          <div className="absolute right-16 top-5 size-16 rounded-full border border-[hsl(var(--primary)/0.12)]" aria-hidden="true" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.18em] text-[hsl(var(--primary))]">
                <span className="flex size-7 items-center justify-center rounded-xl bg-[hsl(var(--secondary))]" aria-hidden="true">
                  <HeartPulse className="size-4" strokeWidth={2.2} />
                </span>
                <span>{strings.eyebrow}</span>
              </div>
              <h1 className="font-display max-w-xl text-[clamp(1.7rem,3.4vw,2.7rem)] font-extrabold leading-[1.1] tracking-[-0.04em] text-[hsl(var(--foreground))]">
                {strings.title}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[hsl(var(--muted-foreground))] sm:text-[0.95rem]">
                {strings.intro}
              </p>
            </div>

             <div className="relative flex shrink-0 flex-col items-start gap-3 sm:items-end" aria-label={strings.languageLabel}>
               <button
                 type="button"
                 onClick={clearChat}
                 className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--secondary-foreground))]"
                 aria-label="Clear chat"
                 data-testid="button-clear-chat"
               >
                 <X className="size-3.5" aria-hidden="true" />
                 Clear chat
               </button>
              <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
                {strings.languageLabel}
              </span>
              <div className="inline-flex rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-1" role="group">
                <button
                  type="button"
                  className={`focus-ring rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                    language === 'en'
                      ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                      : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--secondary-foreground))]'
                  }`}
                  aria-pressed={language === 'en'}
                  aria-label="Use English"
                  data-testid="button-language-en"
                  onClick={() => onLanguageChange('en')}
                >
                  {strings.english}
                </button>
                <button
                  type="button"
                  className={`focus-ring rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                    language === 'hi'
                      ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                      : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--secondary-foreground))]'
                  }`}
                  aria-pressed={language === 'hi'}
                  aria-label="हिन्दी में उत्तर पाएं"
                  data-testid="button-language-hi"
                  onClick={() => onLanguageChange('hi')}
                >
                  {strings.hindi}
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="flex min-h-0 flex-1 flex-col" aria-label={messageCountLabel}>
          <div className="min-h-[270px] flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8" data-testid="chat-message-list" role="log" aria-live="polite">
            {messages.length === 0 ? (
              <div className="mx-auto flex max-w-xl flex-col items-center py-8 text-center sm:py-14" data-testid="empty-chat-state">
                <div className="mb-5 flex size-16 items-center justify-center rounded-[1.4rem] border border-[hsl(var(--primary)/0.16)] bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
                  <ShieldCheck className="size-8" strokeWidth={1.6} aria-hidden="true" />
                </div>
                <h2 className="font-display text-xl font-bold tracking-[-0.025em] text-[hsl(var(--foreground))]">{strings.emptyTitle}</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-[hsl(var(--muted-foreground))]">{strings.emptyBody}</p>
                <div className="mt-7 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    className="focus-ring rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3.5 py-2 text-xs font-semibold text-[hsl(var(--secondary-foreground))] transition-colors hover:border-[hsl(var(--primary)/0.35)] hover:bg-[hsl(var(--secondary))]"
                    onClick={() => handlePromptClick(strings.promptOne)}
                    data-testid="button-prompt-headache"
                  >
                    {strings.promptOne}
                  </button>
                  <button
                    type="button"
                    className="focus-ring rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3.5 py-2 text-xs font-semibold text-[hsl(var(--secondary-foreground))] transition-colors hover:border-[hsl(var(--primary)/0.35)] hover:bg-[hsl(var(--secondary))]"
                    onClick={() => handlePromptClick(strings.promptTwo)}
                    data-testid="button-prompt-throat"
                  >
                    {strings.promptTwo}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mx-auto flex max-w-3xl flex-col gap-5">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    language={language}
                    isSpeaking={speakingMessageId === message.id}
                    onReadAloud={() => readMessageAloud(message)}
                  />
                ))}
              </div>
            )}

            {isSending && (
              <div className="mx-auto mt-5 flex max-w-3xl gap-3" data-testid="status-chat-loading" aria-label={strings.sending}>
                <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]" aria-hidden="true">
                  <Stethoscope className="size-[18px]" strokeWidth={1.8} />
                </div>
                <div className="rounded-[1.35rem] rounded-bl-md border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] px-4 py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5" aria-hidden="true">
                      <span className="soft-pulse size-1.5 rounded-full bg-[hsl(var(--primary))]" />
                      <span className="soft-pulse size-1.5 rounded-full bg-[hsl(var(--primary))]" style={{ animationDelay: '180ms' }} />
                      <span className="soft-pulse size-1.5 rounded-full bg-[hsl(var(--primary))]" style={{ animationDelay: '360ms' }} />
                    </div>
                    <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{strings.sending}</span>
                  </div>
                  <div className="mt-3 space-y-2" aria-hidden="true">
                    <div className="h-2 w-48 rounded-full bg-[hsl(var(--muted))] soft-pulse" />
                    <div className="h-2 w-32 rounded-full bg-[hsl(var(--muted))] soft-pulse" style={{ animationDelay: '140ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--background)/0.52)] px-4 py-4 sm:px-8 sm:py-5">
            {errorVisible && (
              <div className="mx-auto mb-4 flex max-w-3xl items-start gap-3 rounded-2xl border border-[hsl(var(--destructive)/0.22)] bg-[hsl(var(--destructive)/0.06)] px-4 py-3" role="alert" data-testid="status-chat-error">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-[hsl(var(--destructive))]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[hsl(var(--foreground))]">{strings.errorTitle}</p>
                  <p className="mt-0.5 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{strings.errorBody}</p>
                </div>
                <button
                  type="button"
                  className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.1)]"
                  onClick={() => submitQuestion(failedQuestion, false)}
                  data-testid="button-retry-chat"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  {strings.retry}
                </button>
              </div>
            )}

            <form className="mx-auto max-w-3xl" onSubmit={handleSubmit}>
              <label htmlFor="health-concern" className="sr-only">
                {strings.messageLabel}
              </label>
              <div className="relative rounded-[1.25rem] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-[0_8px_24px_rgba(25,86,76,0.05)] transition-colors focus-within:border-[hsl(var(--ring)/0.65)]">
                <textarea
                  id="health-concern"
                  ref={inputRef}
                  value={draft}
                  maxLength={2000}
                  rows={2}
                  placeholder={strings.placeholder}
                  disabled={isSending}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    if (validationMessage) setValidationMessage('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      if (!isSending) event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  className="min-h-[66px] w-full resize-none bg-transparent px-3 pb-9 pt-2.5 text-sm leading-6 text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground)/0.72)] disabled:cursor-not-allowed disabled:opacity-60"
                  aria-describedby={validationMessage ? 'health-concern-validation' : 'health-concern-count'}
                  data-testid="input-health-concern"
                />
                <div className="absolute bottom-3 left-5 text-[0.68rem] font-medium text-[hsl(var(--muted-foreground))]" id="health-concern-count">
                  {strings.characterCount(draft.length)}
                </div>
                <button
                  type="submit"
                  disabled={isSending || draft.trim().length < 2}
                  className="focus-ring absolute bottom-2.5 right-2.5 inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-3.5 py-2.5 text-xs font-bold text-[hsl(var(--primary-foreground))] transition-[transform,opacity,background-color] hover:bg-[hsl(var(--primary)/0.9)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label={isSending ? strings.sending : strings.send}
                  data-testid="button-send-chat"
                >
                  <Send className="size-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">{isSending ? strings.sending : strings.send}</span>
                </button>
              </div>
              {validationMessage && (
                <p className="mt-2 px-2 text-xs font-medium text-[hsl(var(--destructive))]" id="health-concern-validation" role="alert" data-testid="status-chat-validation">
                  {validationMessage}
                </p>
              )}
            </form>

            <div className="mx-auto mt-4 flex max-w-3xl flex-col gap-2 text-[0.7rem] leading-5 text-[hsl(var(--muted-foreground))] sm:flex-row sm:items-start sm:justify-between sm:gap-5">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
                <p>
                  <span className="font-bold text-[hsl(var(--secondary-foreground))]">{strings.safetyTitle}:</span>{' '}
                  {strings.safetyBody}
                </p>
              </div>
              <p className="shrink-0 sm:max-w-[18rem] sm:text-right">{strings.urgent}</p>
            </div>
          </div>
        </section>
      </div>
      <p className="mx-auto mt-3 max-w-6xl px-1 text-center text-[0.68rem] font-medium tracking-wide text-[hsl(var(--muted-foreground))]" data-testid="text-chat-status">
        {pendingQuestion ? strings.sending : messages.length > 0 ? strings.safetyBody : ''}
      </p>
    </main>
  );
}

export default Chat;
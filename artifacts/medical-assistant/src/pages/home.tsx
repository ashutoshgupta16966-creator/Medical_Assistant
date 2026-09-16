import { AlertCircle, BellRing, CalendarDays, CheckCircle2, CircleHelp, Clock3, Info, Mic2, RefreshCcw, ShieldCheck, Sparkles, TriangleAlert, UserRound, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScanAnalysis } from '@workspace/api-client-react';
import { useAnalyzeScan } from '@workspace/api-client-react';
import { ScanUploader, type SelectedImage } from '@/components/scan-uploader';
import { detectReminderFrequency, getNextReminderTimes, type ReminderFrequency } from '@/lib/reminders';

export interface ScanRecord {
  id: string;
  createdAt: string;
  image: SelectedImage;
  analysis: ScanAnalysis;
  familyMember?: string;
}

interface HomeProps {
  history: ScanRecord[];
  onAddHistory: (record: ScanRecord) => void;
  onUpdateHistory?: (id: string, patch: Partial<ScanRecord>) => void;
}

type SpeechLanguage = 'en-IN' | 'hi-IN';
const familyPresets = ['Myself', 'Papa', 'Mummy'];

const disclaimerEnglish = 'This is AI-generated guidance, not a diagnosis. Please confirm with a doctor or pharmacist.';
const disclaimerHindi = 'यह AI द्वारा बनाई गई जानकारी है, यह कोई निदान नहीं है। कृपया डॉक्टर या फार्मासिस्ट से पुष्टि करें।';

function formatDate(date: string | null, language: SpeechLanguage = 'en-IN') {
  if (!date) return language === 'hi-IN' ? 'उपलब्ध नहीं' : 'Not available';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.valueOf())) return date;
  return parsed.toLocaleDateString(language, { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusMeta(status: ScanAnalysis['expiryStatus']) {
  if (status === 'danger') return { label: 'Danger — Replace Now', className: 'border-[#f1c9c3] bg-[#fff0ed] text-[#b74436]', Icon: TriangleAlert };
  if (status === 'soon') return { label: 'Use Soon', className: 'border-[#ecd9ad] bg-[#fff8e8] text-[#997126]', Icon: Clock3 };
  if (status === 'safe') return { label: 'Safe to Use', className: 'border-[#bfe4d6] bg-[#eaf8f2] text-[#1f8067]', Icon: CheckCircle2 };
  return { label: 'Expiry unknown', className: 'border-[#d8e3df] bg-[#f1f6f4] text-[#6a827c]', Icon: CircleHelp };
}

function expiryLabelHindi(status: ScanAnalysis['expiryStatus']) {
  if (status === 'danger') return 'खत्म हो चुकी है — अभी बदलें';
  if (status === 'soon') return 'जल्द उपयोग करें';
  if (status === 'safe') return 'उपयोग के लिए सुरक्षित';
  return 'समाप्ति की जानकारी उपलब्ध नहीं';
}

function ResultValue({ value, testId }: { value: string; testId?: string }) {
  const isUnavailable = /^(not available|not clearly visible|expiry unknown)/i.test(value.trim());
  return (
    <p className="text-sm leading-relaxed text-[#314b49]" data-testid={testId}>
      {isUnavailable ? (
        <span className="inline-flex rounded-full border border-[#d5e2df] bg-[#f2f7f5] px-2.5 py-1 text-xs font-bold text-[#5b716d]">
          {value}
        </span>
      ) : value}
    </p>
  );
}

function drawWrappedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 4) {
  const words = text.split(/\s+/);
  let line = '';
  let lineCount = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(line, x, y + lineCount * lineHeight);
      line = word;
      lineCount += 1;
      if (lineCount >= maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (lineCount < maxLines && line) {
    context.fillText(line, x, y + lineCount * lineHeight);
    lineCount += 1;
  }
  return y + lineCount * lineHeight;
}

async function createShareImage(analysis: ScanAnalysis, image: SelectedImage, language: SpeechLanguage) {
  const isHindi = language === 'hi-IN';
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1120;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('SHARE_IMAGE_UNAVAILABLE');

  context.fillStyle = '#eef9fb';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ffffff';
  context.roundRect(40, 40, 1120, 900, 30);
  context.fill();
  context.fillStyle = '#075e54';
  context.fillRect(40, 40, 1120, 130);
  context.fillStyle = '#ffffff';
  context.font = '800 34px Manrope, Arial, sans-serif';
  context.fillText('Medical Assistant', 80, 100);
  context.font = '500 18px "DM Sans", Arial, sans-serif';
  context.fillText(isHindi ? 'दवा की जानकारी' : 'A clearer next step', 80, 135);

  const preview = new window.Image();
  preview.src = image.dataUrl;
  await new Promise<void>((resolve, reject) => {
    preview.onload = () => resolve();
    preview.onerror = () => reject(new Error('SHARE_IMAGE_UNAVAILABLE'));
  });
  context.drawImage(preview, 80, 210, 170, 170);
  context.fillStyle = '#1c403b';
  context.font = '800 34px Manrope, Arial, sans-serif';
  const name = isHindi ? (analysis.nameHindi || 'नाम स्पष्ट नहीं है') : (analysis.nameEnglish || 'Scan result');
  drawWrappedText(context, name, 290, 255, 790, 44, 2);
  context.fillStyle = '#64867d';
  context.font = '700 18px "DM Sans", Arial, sans-serif';
  context.fillText(isHindi ? (analysis.category === 'lab_report' ? 'लैब रिपोर्ट' : 'दवा') : (analysis.category === 'lab_report' ? 'Lab report' : 'Medicine'), 290, 340);

  const sections = isHindi
    ? [
      ['यह किसमें मदद करता है', analysis.treatsHindi || 'जानकारी स्पष्ट रूप से उपलब्ध नहीं है।', '#57b396'],
      ['कैसे उपयोग करें', analysis.usageHindi || 'उपयोग की पुष्टि डॉक्टर या फार्मासिस्ट से करें।', '#78b7ca'],
      ['खुराक', analysis.dosageHindi || 'खुराक की पुष्टि डॉक्टर या फार्मासिस्ट से करें।', '#d6b34f'],
      ['महत्वपूर्ण बातें', analysis.notesHindi.join(' ') || 'महत्वपूर्ण जानकारी उपलब्ध नहीं है।', '#b8a3c8'],
    ]
    : [
      ['What it helps with', analysis.treatsEnglish || 'Not available', '#57b396'],
      ['How to use', analysis.usage || 'Not available', '#78b7ca'],
      ['Dosage', analysis.dosage || 'Not available — ask a professional', '#d6b34f'],
      ['Important notes', analysis.notes.join(' ') || 'No important notes available.', '#b8a3c8'],
    ];
  let y = 430;
  for (const [label, value, accent] of sections) {
    context.fillStyle = accent;
    context.fillRect(80, y - 25, 8, 92);
    context.fillStyle = '#526a74';
    context.font = '800 17px "DM Sans", Arial, sans-serif';
    context.fillText(label, 110, y);
    context.fillStyle = '#314b49';
    context.font = '500 19px "DM Sans", Arial, sans-serif';
    drawWrappedText(context, value, 110, y + 32, 980, 27, 2);
    y += 112;
  }
  const expiryText = isHindi
    ? (analysis.expiryLabelHindi || expiryLabelHindi(analysis.expiryStatus))
    : analysis.expiryLabel;
  context.fillStyle = '#674b52';
  context.font = '800 17px "DM Sans", Arial, sans-serif';
  context.fillText(isHindi ? 'समाप्ति जांच' : 'Expiry check', 80, 905);
  context.fillStyle = '#fff8e8';
  context.roundRect(80, 925, 1040, 52, 16);
  context.fill();
  context.fillStyle = '#997126';
  context.font = '700 19px "DM Sans", Arial, sans-serif';
  context.fillText(expiryText, 105, 958);
  context.fillStyle = '#6d7f88';
  context.font = '500 16px "DM Sans", Arial, sans-serif';
  context.fillText(isHindi ? disclaimerHindi : disclaimerEnglish, 80, 1050);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('SHARE_IMAGE_UNAVAILABLE')), 'image/png');
  });
}

function ResultCard({
  analysis,
  image,
  speechLanguage,
  isSpeaking,
  onLanguageChange,
  onReadAloud,
  familyMember,
  onFamilyMemberChange,
}: {
  analysis: ScanAnalysis;
  image: SelectedImage;
  speechLanguage: SpeechLanguage;
  isSpeaking: boolean;
  onLanguageChange: (language: SpeechLanguage) => void;
  onReadAloud: () => void;
  familyMember: string;
  onFamilyMemberChange: (value: string) => void;
}) {
  const expiry = statusMeta(analysis.expiryStatus);
  const ExpiryIcon = expiry.Icon;
  const confidence = Math.round(Math.max(0, Math.min(1, analysis.confidence || 0)) * 100);
  const isUnknown = analysis.category === 'unknown';
  const isHindi = speechLanguage === 'hi-IN';
  const content = isHindi
    ? {
      category: analysis.category === 'lab_report' ? 'लैब रिपोर्ट' : analysis.category === 'medicine' ? 'दवा' : 'जांच आवश्यक',
      name: analysis.nameHindi || 'नाम स्पष्ट नहीं है',
      confidence: 'विश्वास',
      treats: analysis.treatsHindi || 'जानकारी स्पष्ट रूप से उपलब्ध नहीं है',
      treatsLabel: 'यह किसमें मदद करता है',
      usageLabel: 'कैसे उपयोग करें',
      usage: analysis.usageHindi || 'उपयोग की पुष्टि डॉक्टर या फार्मासिस्ट से करें।',
      dosageLabel: 'खुराक',
      dosage: analysis.dosageHindi || 'खुराक की पुष्टि डॉक्टर या फार्मासिस्ट से करें।',
      notes: analysis.notesHindi.length ? analysis.notesHindi : ['महत्वपूर्ण जानकारी उपलब्ध नहीं है।'],
      notesLabel: 'महत्वपूर्ण बातें',
      expiryCheck: 'समाप्ति जांच',
      expiryDate: 'समाप्ति तिथि',
      expiryGuidance: 'समाप्ति की जानकारी पैकेजिंग पर दी गई तारीख से जांची जानी चाहिए।',
      disclaimer: disclaimerHindi,
      readAloud: isSpeaking ? 'रोकें' : 'सुनें',
      unknownTitle: 'इस तस्वीर को और करीब से देखना होगा।',
      unknownBody: 'लेबल या रिपोर्ट की जानकारी पूरी तरह दिखाई देने वाली, साफ और करीब से ली गई तस्वीर आजमाएं।',
    }
    : {
      category: analysis.category === 'lab_report' ? 'Lab report' : analysis.category === 'medicine' ? 'Medicine' : 'Needs review',
      name: analysis.nameEnglish || 'We could not identify this yet',
      confidence: 'confidence',
      treats: analysis.treatsEnglish || 'Not available',
      treatsLabel: 'What it helps with',
      usageLabel: 'How to use',
      usage: analysis.usage || 'Not available',
      dosageLabel: 'Dosage',
      dosage: analysis.dosage || 'Not available — ask a professional',
      notes: analysis.notes.length ? analysis.notes : ['No important notes available.'],
      notesLabel: 'Important notes',
      expiryCheck: 'Expiry check',
      expiryDate: 'Expiry date',
      expiryGuidance: 'Expiry guidance is based on the date visible in the image and should be confirmed on the packaging.',
      disclaimer: disclaimerEnglish,
      readAloud: isSpeaking ? 'Stop' : 'Read aloud',
      unknownTitle: 'This image needs a closer look.',
      unknownBody: 'Try a brighter, closer photo with the label or report values fully visible.',
    };
  const DisplayIcon = isSpeaking ? Volume2 : VolumeX;

  return (
    <section className="rise-in surface-shadow overflow-hidden rounded-[24px] border border-[#dcebe6] bg-white dark:border-[#273740] dark:bg-[#1a2429]" data-testid="card-analysis-result" data-print-result>
      <div className="border-b border-[#e5efeb] bg-[#f8fcfa] p-5 dark:border-[#273740] dark:bg-[#151e23] sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-4">
            <div className="h-[76px] w-[76px] shrink-0 overflow-hidden rounded-2xl border border-[#dcebe5] bg-[#edf6f2] p-1.5 dark:border-[#273740] dark:bg-[#142127]">
              <img src={image.dataUrl} alt="Analyzed scan" className="h-full w-full rounded-xl object-cover" data-testid="img-analyzed-scan" />
            </div>
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                 <span className="rounded-full bg-[#dff3eb] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#197a66] dark:bg-[#14322a] dark:text-[#5eead4]">{content.category}</span>
                {confidence > 0 && <span className="text-[11px] font-medium text-[#8aa29c] dark:text-[#9cb2b9]">{confidence}% {content.confidence}</span>}
              </div>
               <h2 className="font-display break-words text-[24px] font-extrabold leading-tight tracking-[-.045em] text-[#1c403b] dark:text-[#e5edf0]" data-testid="text-analysis-name">{content.name}</h2>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2" data-print-hide>
             <button type="button" onClick={onReadAloud} className={`focus-ring flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${isSpeaking ? 'border-[#a7c5ed] bg-[#eff5ff] text-[#2862ac] dark:border-[#254166] dark:bg-[#152438] dark:text-[#60a5fa]' : 'border-[#efc3c0] bg-[#fff5f4] text-[#b44d48] hover:bg-[#ffedeb] dark:border-[#552828] dark:bg-[#291717] dark:text-[#f87171] dark:hover:bg-[#331c1c]'}`} aria-pressed={isSpeaking} aria-label={isSpeaking ? 'Stop read aloud' : 'Read aloud'} data-state={isSpeaking ? 'on' : 'off'} data-testid="button-read-aloud">
              <DisplayIcon size={15} /> {content.readAloud}
            </button>
            <div className="flex items-center rounded-xl border border-[#d6e5e9] bg-[#f4fafc] p-1 dark:border-[#273740] dark:bg-[#142127]" role="group" aria-label="Read aloud language">
               <button type="button" onClick={() => onLanguageChange('en-IN')} className={`focus-ring rounded-lg px-2 py-1.5 text-[10px] font-extrabold ${speechLanguage === 'en-IN' ? 'bg-white text-[#286c7b] shadow-sm dark:bg-[#1c272d] dark:text-[#5bc1dc]' : 'text-[#78919a] dark:text-[#8ea4ad]'}`} aria-pressed={speechLanguage === 'en-IN'} aria-label="Read aloud in English" data-state={speechLanguage === 'en-IN' ? 'on' : 'off'} data-testid="button-language-english">EN</button>
               <button type="button" onClick={() => onLanguageChange('hi-IN')} className={`focus-ring rounded-lg px-2 py-1.5 text-[10px] font-extrabold ${speechLanguage === 'hi-IN' ? 'bg-white text-[#286c7b] shadow-sm dark:bg-[#1c272d] dark:text-[#5bc1dc]' : 'text-[#78919a] dark:text-[#8ea4ad]'}`} aria-pressed={speechLanguage === 'hi-IN'} aria-label="Read aloud in Hindi" data-state={speechLanguage === 'hi-IN' ? 'on' : 'off'} data-testid="button-language-hindi">हिंदी</button>
            </div>
          </div>
        </div>
      </div>

      {isUnknown ? (
        <div className="p-5 sm:p-7">
          <div className="flex gap-3 rounded-2xl border border-[#ecdcb8] bg-[#fffaf0] p-4 text-sm text-[#806b3a] dark:border-[#524424] dark:bg-[#221c10] dark:text-[#e5ca79]">
            <AlertCircle size={19} className="mt-0.5 shrink-0" />
             <div><p className="font-bold">{content.unknownTitle}</p><p className="mt-1 leading-relaxed">{content.unknownBody}</p></div>
          </div>
        </div>
      ) : (
        <div className="grid gap-0 md:grid-cols-[1fr_260px]">
          <div className="space-y-6 p-5 sm:p-7">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-xl border-l-2 border-[#57b396] bg-[#f8fcfa] px-4 py-3 dark:border-[#2e7d69] dark:bg-[#132420]">
                <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#277f6b] dark:text-[#4ed2af]">{content.treatsLabel}</p>
                <p className="font-display text-[16px] font-bold leading-snug text-[#244f47] dark:text-[#d6f6ed]" data-testid="text-analysis-treats">{content.treats}</p>
              </div>
              <div className="rounded-xl border-l-2 border-[#78b7ca] bg-[#f2f9fc] px-4 py-3 dark:border-[#397486] dark:bg-[#12222b]">
                <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#397e91] dark:text-[#5bc1dc]">{content.usageLabel}</p>
                <ResultValue value={content.usage} testId="text-analysis-usage" />
              </div>
            </div>
            <div className="grid gap-5 border-t border-[#edf2ef] pt-5 dark:border-[#273740] sm:grid-cols-2">
              <div className="rounded-xl border-l-2 border-[#d6b34f] bg-[#fffbf2] px-4 py-3 dark:border-[#8c732f] dark:bg-[#241e10]">
                <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#987325] dark:text-[#e2ba58]">{content.dosageLabel}</p>
                <ResultValue value={content.dosage} testId="text-analysis-dosage" />
              </div>
              {content.notes.length > 0 && (
                <div className="rounded-xl border-l-2 border-[#b8a3c8] bg-[#fbf8fd] px-4 py-3 dark:border-[#725985] dark:bg-[#201728]">
                  <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#76618c] dark:text-[#c1a0e0]">{content.notesLabel}</p>
                  <ul className="space-y-1.5 text-sm leading-relaxed text-[#443b4d] dark:text-[#ecdcf9]">{content.notes.slice(0, 3).map((note, index) => <li key={`${note}-${index}`} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#8e76a5] dark:bg-[#9f7fc2]" />{note}</li>)}</ul>
                </div>
              )}
            </div>
          </div>
          <aside className="border-t border-[#e6efeb] bg-[#fbfdfc] p-5 dark:border-[#273740] dark:bg-[#162025] md:border-l md:border-t-0 sm:p-7">
            <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#674b52] dark:text-[#d49ba6]">{content.expiryCheck}</p>
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold ${expiry.className}`} data-testid="status-expiry">
              <ExpiryIcon size={16} /> {isHindi ? (analysis.expiryLabelHindi || expiryLabelHindi(analysis.expiryStatus)) : expiry.label}
            </div>
            <div className="mt-5 flex items-start gap-2 text-sm text-[#55746c] dark:text-[#9cb2b9]">
              <CalendarDays size={16} className="mt-0.5 shrink-0 text-[#8d626c] dark:text-[#bfa1a8]" />
              <div><p className="text-xs font-semibold text-[#80636a] dark:text-[#bfa1a8]">{content.expiryDate}</p><p className="mt-0.5 font-semibold text-[#355c53] dark:text-[#86dfcb]" data-testid="text-expiry-date">{formatDate(analysis.expiryDate, speechLanguage)}</p></div>
            </div>
            <p className="mt-6 text-[11px] leading-relaxed text-[#91a8a2] dark:text-[#8ea4ad]">{content.expiryGuidance}</p>
          </aside>
        </div>
      )}
      <div className="flex flex-col gap-3 border-t border-[#e5efeb] bg-[#f8fcfa] px-5 py-4 dark:border-[#273740] dark:bg-[#151e23] sm:flex-row sm:items-center sm:justify-between sm:px-7" data-print-hide>
        <div className="flex items-center gap-2 text-xs font-bold text-[#55756c] dark:text-[#9cb2b9]"><UserRound size={15} className="text-[#3b917c] dark:text-[#38c8a8]" /> Save this scan for</div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={familyPresets.includes(familyMember) ? familyMember : 'Custom'} onChange={(event) => onFamilyMemberChange(event.target.value === 'Custom' ? '' : event.target.value)} className="focus-ring rounded-lg border border-[#cfe3dc] bg-white px-3 py-2 text-xs font-bold text-[#47756b] dark:border-[#273740] dark:bg-[#1c272d] dark:text-[#e5edf0]" aria-label="Choose family member" data-testid="select-family-member">
            {familyPresets.map((member) => <option key={member} value={member}>{member}</option>)}
            <option value="Custom">Custom name</option>
          </select>
          {!familyPresets.includes(familyMember) && <input value={familyMember} onChange={(event) => onFamilyMemberChange(event.target.value)} placeholder="Family member name" aria-label="Custom family member name" className="focus-ring min-w-[150px] rounded-lg border border-[#cfe3dc] bg-white px-3 py-2 text-xs text-[#355c53] dark:border-[#273740] dark:bg-[#1c272d] dark:text-[#e5edf0]" data-testid="input-custom-family-member" />}
        </div>
      </div>
      <div className="flex items-start gap-2 border-t border-[#d9e1e5] bg-[#f5f8f9] px-5 py-4 text-[11px] leading-relaxed text-[#6d7f88] dark:border-[#273740] dark:bg-[#131b1f] dark:text-[#8ba1a8] sm:px-7">
        <Info size={14} className="mt-0.5 shrink-0 text-[#758d98] dark:text-[#8ea4ad]" />
        <span><strong className="font-semibold text-[#526a74] dark:text-[#c4d6dc]">{content.disclaimer}</strong></span>
      </div>
    </section>
  );
}

function RecentMiniList({ history }: { history: ScanRecord[] }) {
  if (!history.length) return null;
  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between"><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#89a49d]">This session</p><span className="text-xs text-[#92aaa4]">{history.length} {history.length === 1 ? 'scan' : 'scans'}</span></div>
      <div className="grid gap-2 sm:grid-cols-2">
        {history.slice(0, 2).map((record) => {
          const meta = statusMeta(record.analysis.expiryStatus);
          return <div key={record.id} className="flex items-center gap-3 rounded-2xl border border-[#dfece7] bg-white p-3 transition-colors hover:border-[#b9d9cf]" data-testid={`card-recent-scan-${record.id}`}>
            <img src={record.image.dataUrl} alt="" className="h-12 w-12 rounded-xl border border-[#e0ece8] object-cover" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[#3a5d55]">{record.analysis.nameEnglish || 'Unidentified scan'}</p><p className="mt-0.5 text-xs text-[#92aaa4]">{new Date(record.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</p></div>
            <span className={`h-2 w-2 rounded-full ${meta.label.startsWith('Danger') ? 'bg-[#d16354]' : meta.label.startsWith('Use') ? 'bg-[#d3a244]' : 'bg-[#54a78c]'}`} />
          </div>;
        })}
      </div>
    </div>
  );
}

export function Home({ history, onAddHistory, onUpdateHistory }: HomeProps) {
  const [image, setImage] = useState<SelectedImage | null>(null);
  const [analysis, setAnalysis] = useState<ScanAnalysis | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [speechLanguage, setSpeechLanguage] = useState<SpeechLanguage>('en-IN');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [shareError, setShareError] = useState('');
  const [familyMember, setFamilyMember] = useState('Myself');
  const [reminderFrequency, setReminderFrequency] = useState<ReminderFrequency | null>(null);
  const [reminderStatus, setReminderStatus] = useState<'idle' | 'scheduled' | 'denied' | 'unsupported'>('idle');
  const reminderTimeouts = useRef<number[]>([]);
  const [showOnboardingHint, setShowOnboardingHint] = useState(() => window.localStorage.getItem('medical-assistant-onboarding-dismissed') !== '1');
  const analyze = useAnalyzeScan();

  const clearReminderTimeouts = () => {
    reminderTimeouts.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    reminderTimeouts.current = [];
  };

  useEffect(() => () => {
    clearReminderTimeouts();
  }, []);

  const analyzeImage = () => {
    if (!image) return;
    setErrorMessage('');
    analyze.mutate({ data: { imageData: image.dataUrl, mimeType: image.mimeType } }, {
      onSuccess: (result) => {
        clearReminderTimeouts();
        setAnalysis(result);
        setIsSpeaking(false);
        setShareError('');
        setFamilyMember('Myself');
        setReminderFrequency(result.category === 'medicine' ? detectReminderFrequency(result) : null);
        setReminderStatus('idle');
        onAddHistory({ id: `${Date.now()}`, createdAt: new Date().toISOString(), image, analysis: result, familyMember: 'Myself' });
      },
      onError: (error) => {
        const apiError = error as { data?: { error?: string } };
        setErrorMessage(apiError.data?.error || 'We could not read that image. Please try a clearer photo or upload it again.');
      },
    });
  };

  const readAloud = () => {
    if (!analysis || !('speechSynthesis' in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const isHindi = speechLanguage === 'hi-IN';
    const text = isHindi
      ? `${analysis.nameHindi || 'स्कैन का परिणाम'}। ${analysis.treatsHindi || 'जानकारी उपलब्ध नहीं है'}। ${analysis.usageHindi || ''}। ${analysis.dosageHindi || ''}। ${analysis.notesHindi.join(' ')}। ${analysis.expiryLabelHindi || ''}।`
      : `${analysis.nameEnglish || 'Scan result'}. ${analysis.treatsEnglish || ''}. ${analysis.usage || ''}. ${analysis.dosage || ''}. ${analysis.notes.join(' ')}. ${analysis.expiryLabel || ''}.`;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLanguage;
    const matchingVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith(speechLanguage.slice(0, 2).toLowerCase()));
    if (matchingVoice) utterance.voice = matchingVoice;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const changeLanguage = (language: SpeechLanguage) => {
    if (language === speechLanguage) return;
    if (isSpeaking && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
    setSpeechLanguage(language);
  };

  const shareWhatsApp = async () => {
    if (!analysis) return;
    setShareError('');
    try {
      const blob = await createShareImage(analysis, image as SelectedImage, speechLanguage);
      const file = new File([blob], 'medical-assistant-result.png', { type: 'image/png' });
      if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
        setShareError('Image sharing is unavailable in this browser. Try this on a phone with WhatsApp installed.');
        return;
      }
      await navigator.share({
        files: [file],
        title: speechLanguage === 'hi-IN' ? 'दवा की जानकारी' : 'Medical Assistant result',
        text: speechLanguage === 'hi-IN' ? 'डॉक्टर या फार्मासिस्ट से पुष्टि करें।' : 'Please confirm with a doctor or pharmacist.',
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareError('We could not prepare the image for sharing. Please try again.');
    }
  };

  const printResult = () => window.print();

  const changeFamilyMember = (value: string) => {
    const nextValue = value.trim();
    setFamilyMember(nextValue);
    if (analysis && onUpdateHistory) {
      const record = history.find((item) => item.analysis === analysis);
      if (record) onUpdateHistory(record.id, { familyMember: nextValue || 'Myself' });
    }
  };

  const scheduleReminder = async () => {
    if (!reminderFrequency) return;
    if (!('Notification' in window)) {
      setReminderStatus('unsupported');
      return;
    }
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (permission !== 'granted') {
      setReminderStatus('denied');
      return;
    }
    clearReminderTimeouts();
    reminderTimeouts.current = getNextReminderTimes(reminderFrequency).map((time) => window.setTimeout(() => {
      if (analysis) new Notification(`Medicine reminder: ${analysis.nameEnglish || 'Your medicine'}`, { body: 'Please check your medicine instructions.' });
    }, Math.max(1000, time.getTime() - Date.now())));
    setReminderStatus('scheduled');
  };

  const dismissOnboarding = () => {
    window.localStorage.setItem('medical-assistant-onboarding-dismissed', '1');
    setShowOnboardingHint(false);
  };

  const reset = () => {
    if (isSpeaking && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    clearReminderTimeouts();
    setImage(null);
    setAnalysis(null);
    setErrorMessage('');
    setShareError('');
    setIsSpeaking(false);
    setReminderFrequency(null);
    setReminderStatus('idle');
    setFamilyMember('Myself');
  };
  const hasResult = useMemo(() => Boolean(analysis && image), [analysis, image]);

  return (
    <div className="mx-auto max-w-[940px]">
      <div className="rise-in mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] text-[#3b917c]"><Sparkles size={14} /> A little more clarity</p>
          <h1 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-[-.055em] text-[#173d37] sm:text-[44px]">Because Every Family Deserves to<br className="hidden sm:block" /> Understand Their Medicine.</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#718d85]">Scan a medicine or lab report and get a calm, plain-language summary of what matters now.</p>
        </div>
         {hasResult && <button type="button" onClick={reset} className="focus-ring flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-[#cfe3dc] bg-white px-4 py-2.5 text-sm font-bold text-[#47756b] transition-colors hover:bg-[#edf8f3] sm:self-end" data-testid="button-new-scan"><RefreshCcw size={15} /> New scan</button>}
      </div>

      {!image && !analysis && showOnboardingHint && (
        <div className="rise-in mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[#b9dce4] bg-[#e4f6f9] px-4 py-3 text-sm font-semibold text-[#286b79]" role="status" data-testid="status-onboarding-hint">
          <span>📷 Tap here to scan your first medicine</span>
           <button type="button" onClick={dismissOnboarding} className="focus-ring rounded-full p-1.5 text-[#5b8b96] transition-colors hover:bg-white/70 hover:text-[#286b79]" aria-label="Dismiss onboarding hint" data-testid="button-dismiss-onboarding"><X size={16} /></button>
        </div>
      )}
      {!analysis && <ScanUploader image={image} onSelect={(selected) => { setImage(selected); setErrorMessage(''); }} onClear={() => setImage(null)} onAnalyze={analyzeImage} isAnalyzing={analyze.isPending} />}
      {errorMessage && (
        <div className="rise-in mt-4 flex items-start gap-3 rounded-2xl border border-[#edc9c4] bg-[#fff4f1] p-4 text-sm text-[#9d4f45]" role="alert" data-testid="status-scan-error">
          <AlertCircle size={18} className="mt-0.5 shrink-0" /><div className="flex-1"><p className="font-bold">Something went wrong</p><p className="mt-1 leading-relaxed">{errorMessage}</p></div>
           <button type="button" onClick={analyzeImage} className="focus-ring rounded-lg p-1.5 text-[#9d4f45] hover:bg-[#fbe3df]" aria-label="Retry analysis" data-testid="button-retry-analysis"><RefreshCcw size={16} /></button>
        </div>
      )}
       {analysis && image && <ResultCard analysis={analysis} image={image} speechLanguage={speechLanguage} isSpeaking={isSpeaking} onLanguageChange={changeLanguage} onReadAloud={readAloud} familyMember={familyMember} onFamilyMemberChange={changeFamilyMember} />}
      {analysis && image && reminderFrequency && (
        <section className="rise-in mt-4 flex flex-col gap-3 rounded-2xl border border-[#d6e5ef] bg-[#f3f9fd] p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="card-medicine-reminder" data-print-hide>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e0f0fa] text-[#397e91]"><BellRing size={17} /></span>
            <div><p className="text-sm font-bold text-[#2c5967]">Set a reminder for this medicine?</p><p className="mt-0.5 text-xs text-[#6e8a96]">Frequency detected: {reminderFrequency.label}. Reminders stay active for this session.</p></div>
          </div>
          {reminderStatus === 'scheduled' ? <span className="text-xs font-bold text-[#2d8a70]" role="status" data-testid="status-reminder-scheduled">Reminder set for this session</span> : (
            <button type="button" onClick={scheduleReminder} className="focus-ring inline-flex min-h-10 items-center justify-center rounded-xl border border-[#a9cfdf] bg-white px-3.5 py-2 text-xs font-bold text-[#397e91] hover:bg-[#e7f5f8]" data-testid="button-set-reminder">Allow reminders</button>
          )}
          {reminderStatus === 'denied' && <span className="text-xs font-semibold text-[#b44d48]" role="alert">Notifications are blocked in this browser.</span>}
          {reminderStatus === 'unsupported' && <span className="text-xs font-semibold text-[#b44d48]" role="alert">This browser cannot schedule notifications.</span>}
        </section>
      )}
      {!analysis && !image && <RecentMiniList history={history} />}

      <div className="mt-10 flex flex-col gap-4 border-t border-[#dfece7] pt-5 text-xs text-[#89a49d] sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2"><ShieldCheck size={15} className="text-[#4e9986]" /> No diagnosis. No judgement. Just a helpful starting point.</span>
        <span className="flex items-center gap-1.5"><Mic2 size={13} /> Voice read-aloud available after results</span>
      </div>
    </div>
  );
}
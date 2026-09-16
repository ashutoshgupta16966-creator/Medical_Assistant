import { AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock3, FileImage, Filter, History as HistoryIcon, ScanLine, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import type { ScanAnalysis } from '@workspace/api-client-react';
import type { ScanRecord } from '@/pages/home';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface HistoryProps {
  history: ScanRecord[];
  onDeleteHistory: (id: string) => void;
}

function statusMeta(status: ScanAnalysis['expiryStatus']) {
  if (status === 'danger') return { label: 'Danger — Replace Now', className: 'bg-[#fff0ed] text-[#b74436]', Icon: TriangleAlert };
  if (status === 'soon') return { label: 'Use Soon', className: 'bg-[#fff8e8] text-[#997126]', Icon: Clock3 };
  if (status === 'safe') return { label: 'Safe to Use', className: 'bg-[#eaf8f2] text-[#1f8067]', Icon: CheckCircle2 };
  return { label: 'Expiry unknown', className: 'bg-[#f1f6f4] text-[#6a827c]', Icon: FileImage };
}

export function History({ history, onDeleteHistory }: HistoryProps) {
  const [pendingDelete, setPendingDelete] = useState<ScanRecord | null>(null);
  const [familyFilter, setFamilyFilter] = useState('All');
  const familyMembers = useMemo(() => ['All', ...Array.from(new Set(history.map((record) => record.familyMember || 'Myself')))], [history]);
  const filteredHistory = familyFilter === 'All' ? history : history.filter((record) => (record.familyMember || 'Myself') === familyFilter);

  return (
    <div className="mx-auto max-w-[940px]">
      <div className="rise-in mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link href="/" className="focus-ring mb-5 inline-flex items-center gap-2 rounded-xl border border-[#d3e7ed] bg-[#f3fafc] px-3.5 py-2.5 text-xs font-bold text-[#367586] transition-colors hover:border-[#a9d0da] hover:bg-[#e8f6f9]" data-testid="link-back-to-scan"><ArrowLeft size={15} className="arrow-nudge-left" /> Back to scanner</Link>
          <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] text-[#3b917c]"><HistoryIcon size={14} /> Private to this session</p>
          <h1 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-[-.055em] text-[#173d37] sm:text-[44px]">Recent scans.</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#718d85]">A quick look back at what you’ve checked today. Scans disappear when this session ends.</p>
        </div>
        <Link href="/" className="focus-ring flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-[#0a7569] bg-[#075e54] px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(7,94,84,.16)] transition-all hover:-translate-y-0.5 hover:bg-[#064d45] sm:self-end" data-testid="link-start-new-scan"><ScanLine size={16} /> Scan another <ArrowRight size={15} className="arrow-nudge-right" /></Link>
      </div>

      {history.length === 0 ? (
        <div className="surface-shadow rise-in rounded-[24px] border border-[#dcebe6] bg-white px-6 py-16 text-center sm:px-12">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] bg-[#e6f5ef] text-[#18836e]"><ScanLine size={27} strokeWidth={1.7} /></div>
          <h2 className="font-display text-xl font-extrabold tracking-[-.03em] text-[#2b5148]">Nothing here yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#78958d]">Your analyzed images will appear here for this session. Start with a medicine strip or lab report.</p>
          <Link href="/" className="focus-ring mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#c8e1ea] bg-[#f2f9fc] px-4 py-2.5 text-sm font-bold text-[#3f7787] transition-colors hover:bg-[#e7f5f8]" data-testid="link-empty-start-scan">Start a scan <ArrowRight size={15} className="arrow-nudge-right" /></Link>
        </div>
      ) : (
        <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcebe6] bg-white p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#55756c]"><Filter size={14} className="text-[#3b917c]" /> Show scans for</div>
          <select value={familyFilter} onChange={(event) => setFamilyFilter(event.target.value)} className="focus-ring rounded-lg border border-[#cfe3dc] bg-[#f8fcfa] px-3 py-2 text-xs font-bold text-[#47756b]" aria-label="Filter scans by family member" data-testid="select-history-family-filter">
            {familyMembers.map((member) => <option key={member} value={member}>{member}</option>)}
          </select>
        </div>
        {filteredHistory.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#c8dfd7] bg-[#f8fcfa] px-6 py-10 text-center text-sm text-[#78958d]" data-testid="empty-family-filter">No scans saved for {familyFilter} yet.</div>
        ) : <div className="space-y-3">
          {filteredHistory.map((record, index) => {
            const meta = statusMeta(record.analysis.expiryStatus);
            const StatusIcon = meta.Icon;
            return <article key={record.id} className="surface-shadow rise-in grid gap-4 rounded-[22px] border border-[#dcebe6] bg-white p-4 sm:grid-cols-[92px_1fr_auto] sm:items-center sm:p-5" style={{ animationDelay: `${index * 70}ms` }} data-testid={`card-history-scan-${record.id}`}>
              <div className="h-[92px] w-full overflow-hidden rounded-2xl border border-[#e0ece8] bg-[#edf6f2] sm:w-[92px]"><img src={record.image.dataUrl} alt="Scanned image" className="h-full w-full object-cover" data-testid={`img-history-scan-${record.id}`} /></div>
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#e2f4ed] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#227b68]">{record.analysis.category === 'lab_report' ? 'Lab report' : record.analysis.category === 'medicine' ? 'Medicine' : 'Needs review'}</span><span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${meta.className}`}><StatusIcon size={12} />{meta.label}</span></div>
                <h2 className="truncate font-display text-lg font-extrabold tracking-[-.03em] text-[#284e45]" data-testid={`text-history-name-${record.id}`}>{record.analysis.nameEnglish || 'Unidentified scan'}</h2>
                {record.analysis.nameHindi && <p className="mt-0.5 truncate text-sm text-[#688b81]">{record.analysis.nameHindi}</p>}
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#96aaa5]"><span className="flex items-center gap-1.5"><CalendarDays size={13} /> {new Date(record.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} at {new Date(record.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span><span className="font-bold text-[#4e8a7a]">For: {record.familyMember || 'Myself'}</span></p>
              </div>
               <div className="flex flex-wrap items-center justify-end gap-2">
                  <button type="button" onClick={() => setPendingDelete(record)} className="focus-ring flex h-10 w-10 items-center justify-center rounded-xl border border-[#f0d9d5] bg-[#fff8f6] text-[#b7665b] transition-colors hover:border-[#e5b7b0] hover:bg-[#fff0ed]" aria-haspopup="dialog" aria-label={`Delete ${record.analysis.nameEnglish || 'scan'}`} data-testid={`button-delete-history-${record.id}`}><Trash2 size={16} /></button>
                 <Link href="/" className="focus-ring flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#c8e1ea] bg-[#f2f9fc] px-3.5 py-2.5 text-xs font-bold text-[#3f7787] transition-colors hover:border-[#9fc9d5] hover:bg-[#e7f5f8]" data-testid={`link-history-scan-again-${record.id}`}>Scan again <ArrowRight size={14} className="arrow-nudge-right" /></Link>
               </div>
            </article>;
          })}
        </div>}
        </>
      )}
      <div className="mt-8 flex items-center gap-2 border-t border-[#dfece7] pt-5 text-xs leading-relaxed text-[#91a9a2]"><FileImage size={14} className="shrink-0 text-[#5f9b8c]" /> Images and results are only kept for this session.</div>
      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent className="border-[#d7e6ea] bg-white sm:rounded-2xl">
          <AlertDialogHeader>
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#fff0ed] text-[#b7665b] sm:mx-0"><AlertTriangle size={20} /></div>
            <AlertDialogTitle className="font-display text-xl font-extrabold text-[#284e55]">Delete this scan?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#6d7f86]">This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="focus-ring border-[#d7e6ea] text-[#55737d] hover:bg-[#f2f9fb]">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendingDelete) onDeleteHistory(pendingDelete.id); setPendingDelete(null); }} className="focus-ring bg-[#b65f54] text-white hover:bg-[#9f4f46]">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
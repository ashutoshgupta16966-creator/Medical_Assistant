import { Camera, FileImage, ImagePlus, RotateCcw, ScanLine, Upload, X } from 'lucide-react';
import { useRef } from 'react';

export interface SelectedImage {
  dataUrl: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif';
  fileName: string;
}

interface ScanUploaderProps {
  image: SelectedImage | null;
  onSelect: (image: SelectedImage) => void;
  onClear: () => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
}

function supportedMime(type: string): SelectedImage['mimeType'] {
  if (type === 'image/png') return 'image/png';
  if (type === 'image/webp') return 'image/webp';
  if (type === 'image/heic') return 'image/heic';
  if (type === 'image/heif') return 'image/heif';
  return 'image/jpeg';
}

export function ScanUploader({ image, onSelect, onClear, onAnalyze, isAnalyzing }: ScanUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const readFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onSelect({ dataUrl: reader.result, mimeType: supportedMime(file.type), fileName: file.name || 'scan-image' });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <section className="surface-shadow relative overflow-hidden rounded-[24px] border border-[#dcebe6] bg-white" data-testid="card-scan-uploader">
      <div className="absolute right-0 top-0 h-44 w-44 translate-x-1/3 -translate-y-1/3 rounded-full bg-[#dff4ed] opacity-70" />
      <div className="relative p-5 sm:p-7">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#e6f5ef] text-[#0b7665]">
              <ScanLine size={18} />
            </div>
            <h2 className="font-display text-[22px] font-extrabold tracking-[-.04em] text-[#1c403b]">What would you like to understand?</h2>
            <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-[#728b85]">Upload a clear photo of a medicine strip, box, or lab report. We’ll turn the important details into plain language.</p>
          </div>
          {image && (
            <button type="button" onClick={onClear} className="focus-ring rounded-full p-2 text-[#88a19b] transition-colors hover:bg-[#edf7f3] hover:text-[#35665d]" aria-label="Clear selected image" data-testid="button-clear-scan">
              <X size={19} />
            </button>
          )}
        </div>

        {image ? (
          <div className="overflow-hidden rounded-2xl border border-[#dcebe5] bg-[#f3f8f6]">
            <div className="relative flex min-h-[220px] items-center justify-center p-3 sm:min-h-[275px]">
              <img src={image.dataUrl} alt="Selected scan preview" className="max-h-[320px] max-w-full rounded-xl object-contain shadow-sm" data-testid="img-scan-preview" />
              <span className="absolute bottom-5 left-5 flex max-w-[calc(100%-40px)] items-center gap-2 rounded-full border border-[#d7e8e1] bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#55756d] shadow-sm">
                <FileImage size={14} className="shrink-0 text-[#2c9278]" />
                <span className="truncate">{image.fileName}</span>
              </span>
            </div>
            <div className="flex flex-col gap-3 border-t border-[#dfebe7] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => inputRef.current?.click()} className="focus-ring flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[#55756d] transition-colors hover:bg-[#edf7f3] hover:text-[#075e54]" data-testid="button-change-image">
                <RotateCcw size={16} /> Choose another
              </button>
              <button type="button" onClick={onAnalyze} disabled={isAnalyzing} className="focus-ring flex items-center justify-center gap-2 rounded-xl bg-[#075e54] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(7,94,84,.18)] transition-all hover:-translate-y-0.5 hover:bg-[#064d45] disabled:cursor-wait disabled:opacity-70" data-testid="button-analyze-scan">
                {isAnalyzing ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <ScanLine size={17} />}
                {isAnalyzing ? 'Reading image…' : 'Analyze this image'}
              </button>
            </div>
          </div>
        ) : (
          <div className="dotted-grid rounded-2xl border border-dashed border-[#a9d1c5] bg-[#f6fcfa] p-5 sm:p-8">
            <div className="mx-auto flex max-w-md flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[20px] bg-white text-[#16836d] shadow-[0_8px_24px_rgba(31,109,91,.1)]">
                <ImagePlus size={27} strokeWidth={1.7} />
              </div>
              <p className="font-display text-base font-bold text-[#2d534b]">Start with a photo</p>
              <p className="mt-1 text-xs leading-relaxed text-[#78958d]">For best results, use natural light and keep all text in frame.</p>
              <div className="mt-6 flex w-full flex-col gap-2.5 sm:flex-row sm:justify-center">
                <button type="button" onClick={() => inputRef.current?.click()} className="focus-ring flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#075e54] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_18px_rgba(7,94,84,.16)] transition-all hover:-translate-y-0.5 hover:bg-[#064d45]" data-testid="button-upload-image">
                  <Upload size={17} /> Upload image
                </button>
                <button type="button" onClick={() => cameraRef.current?.click()} className="focus-ring flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#c9e2da] bg-white px-5 py-3 text-sm font-bold text-[#27685b] transition-colors hover:border-[#8ac4b3] hover:bg-[#eef9f5]" data-testid="button-open-camera">
                  <Camera size={17} /> Use camera
                </button>
              </div>
              <p className="mt-4 text-[11px] text-[#9ab2ac]">JPG, PNG, WEBP · Your image stays private in this session</p>
            </div>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden" onChange={(event) => readFile(event.target.files?.[0])} data-testid="input-upload-image" />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => readFile(event.target.files?.[0])} data-testid="input-camera-capture" />
      </div>
    </section>
  );
}
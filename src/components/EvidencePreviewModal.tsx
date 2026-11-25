import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Paperclip, X } from 'lucide-react';
import type { ProjectEvidence } from '../types/budget';
import { dataUrlToSafeBlobUrl } from '../utils/fileUpload';
import { fetchProjectEvidence } from '../utils/evidenceService';

interface EvidencePreviewModalProps {
  projectId: string;
  evidenceId: string;
  fileName: string;
  onClose: () => void;
}

export const EvidencePreviewModal: React.FC<EvidencePreviewModalProps> = ({
  projectId,
  evidenceId,
  fileName,
  onClose,
}) => {
  const [evidence, setEvidence] = useState<ProjectEvidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMsg(null);
    fetchProjectEvidence(projectId, evidenceId)
      .then((res) => {
        if (!active) return;
        if (!res) {
          setErrorMsg('ไม่พบไฟล์เอกสารแนบในฐานข้อมูล');
        } else {
          setEvidence(res);
        }
      })
      .catch((err) => {
        if (!active) return;
        setErrorMsg(
          err instanceof Error ? err.message : 'ไม่สามารถโหลดเอกสารแนบได้'
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId, evidenceId]);

  const safeBlobUrl = useMemo(() => {
    if (!evidence) return null;
    return dataUrlToSafeBlobUrl(evidence.dataUrl, evidence.mimeType);
  }, [evidence]);

  useEffect(() => {
    return () => {
      if (safeBlobUrl) {
        URL.revokeObjectURL(safeBlobUrl);
      }
    };
  }, [safeBlobUrl]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`ดูเอกสารแนบ ${fileName}`}
      className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="max-w-3xl w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Paperclip className="w-4 h-4 text-blue-900 shrink-0" />
            <h3 className="text-sm font-semibold text-slate-900 truncate">
              {evidence?.fileName || fileName}
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {safeBlobUrl && (
              <a
                href={safeBlobUrl}
                download={evidence?.fileName || fileName}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                ดาวน์โหลด
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5 bg-slate-100 flex items-center justify-center min-h-[360px]">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>กำลังโหลดเอกสาร...</span>
            </div>
          ) : errorMsg ? (
            <p className="text-sm text-red-600">{errorMsg}</p>
          ) : evidence && safeBlobUrl ? (
            evidence.mimeType === 'application/pdf' ? (
              <iframe
                title={evidence.fileName}
                src={safeBlobUrl}
                className="w-full h-[65vh] bg-white border border-slate-300 rounded-lg"
              />
            ) : (
              <img
                src={safeBlobUrl}
                alt={evidence.fileName}
                referrerPolicy="no-referrer"
                className="max-h-[65vh] max-w-full object-contain rounded-lg border border-slate-300 bg-white"
              />
            )
          ) : (
            <p className="text-sm text-slate-500">ไม่สามารถแสดงตัวอย่างไฟล์ได้</p>
          )}
        </div>
      </div>
    </div>
  );
};

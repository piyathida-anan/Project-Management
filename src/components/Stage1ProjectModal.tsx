import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Loader2,
  Paperclip,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  FIELD_LIMITS,
  PROPOSAL_STATUS_LABELS,
  type BudgetProject,
  type ProposalStatus,
} from '../types/budget';
import {
  formatBudgetWithCaret,
  formatCurrency,
  getCurrentThaiYear,
  getFiscalYearOptions,
  getTodayIsoDate,
  parseBudgetNumber,
} from '../utils/formatters';
import {
  processWithdrawalAttachment,
  type ProcessedAttachment,
} from '../utils/fileUpload';
import { EvidencePreviewModal } from './EvidencePreviewModal';
import { ThaiDatePopupInput } from './ThaiDatePicker';

interface Stage1ProjectModalProps {
  editingProject: BudgetProject | null;
  isSaving: boolean;
  onSave: (values: {
    fiscalYear: number;
    name: string;
    shortName: string;
    funderName: string;
    requestedBudget: number;
    approvedBudget: number;
    submittedDate: string;
    proposalStatus: ProposalStatus;
    newProposalAttachment: ProcessedAttachment | null;
    removeExistingProposalEvidence: boolean;
  }) => Promise<void>;
  onClose: () => void;
}

const PROPOSAL_STATUSES: ProposalStatus[] = [
  'drafting',
  'submitted',
  'approved',
  'rejected',
];

export const Stage1ProjectModal: React.FC<Stage1ProjectModalProps> = ({
  editingProject,
  isSaving,
  onSave,
  onClose,
}) => {
  const [fiscalYear, setFiscalYear] = useState<number>(() =>
    editingProject ? editingProject.fiscalYear : getCurrentThaiYear()
  );
  const [name, setName] = useState<string>(() => editingProject?.name ?? '');
  const [shortName, setShortName] = useState<string>(
    () => editingProject?.shortName ?? ''
  );
  const [funderName, setFunderName] = useState<string>(
    () => editingProject?.funderName ?? ''
  );
  const [requestedBudgetStr, setRequestedBudgetStr] = useState<string>(() =>
    editingProject
      ? formatCurrency(
          editingProject.requestedBudget > 0
            ? editingProject.requestedBudget
            : editingProject.totalBudget
        )
      : ''
  );
  const [submittedDate, setSubmittedDate] = useState<string>(
    () => editingProject?.submittedDate || getTodayIsoDate()
  );
  const [proposalStatus, setProposalStatus] = useState<ProposalStatus>(
    () => editingProject?.proposalStatus ?? 'drafting'
  );
  const [approvedBudgetStr, setApprovedBudgetStr] = useState<string>(() => {
    if (!editingProject) return '';
    const base =
      editingProject.approvedBudget > 0
        ? editingProject.approvedBudget
        : editingProject.totalBudget > 0
          ? editingProject.totalBudget
          : editingProject.requestedBudget;
    return base > 0 ? formatCurrency(base) : '';
  });
  const [newProposalAttachment, setNewProposalAttachment] =
    useState<ProcessedAttachment | null>(null);
  const [removeExistingProposalEvidence, setRemoveExistingProposalEvidence] =
    useState<boolean>(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setFiscalYear(
      editingProject ? editingProject.fiscalYear : getCurrentThaiYear()
    );
    setName(editingProject?.name ?? '');
    setShortName(editingProject?.shortName ?? '');
    setFunderName(editingProject?.funderName ?? '');
    setRequestedBudgetStr(
      editingProject
        ? formatCurrency(
            editingProject.requestedBudget > 0
              ? editingProject.requestedBudget
              : editingProject.totalBudget
          )
        : ''
    );
    setSubmittedDate(editingProject?.submittedDate || getTodayIsoDate());
    setProposalStatus(editingProject?.proposalStatus ?? 'drafting');
    if (editingProject) {
      const baseApproved =
        editingProject.approvedBudget > 0
          ? editingProject.approvedBudget
          : editingProject.totalBudget > 0
            ? editingProject.totalBudget
            : editingProject.requestedBudget;
      setApprovedBudgetStr(baseApproved > 0 ? formatCurrency(baseApproved) : '');
    } else {
      setApprovedBudgetStr('');
    }
    setNewProposalAttachment(null);
    setRemoveExistingProposalEvidence(false);
    setIsProcessingFile(false);
    setShowPreviewModal(false);
    setErrorMsg(null);
  }, [editingProject]);

  const fiscalYearOptions = getFiscalYearOptions();

  const existingEvidenceId =
    !removeExistingProposalEvidence && editingProject?.proposalEvidenceId
      ? editingProject.proposalEvidenceId
      : '';
  const existingEvidenceName =
    !removeExistingProposalEvidence && editingProject?.proposalEvidenceName
      ? editingProject.proposalEvidenceName
      : '';

  const handleSelectFile = async (file: File) => {
    setErrorMsg(null);
    setIsProcessingFile(true);
    try {
      const processed = await processWithdrawalAttachment(file);
      setNewProposalAttachment(processed);
      setRemoveExistingProposalEvidence(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'ไม่สามารถอ่านไฟล์หนังสือยื่นข้อเสนอโครงการได้'
      );
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanName = name.replace(/[\r\n]+/g, ' ').trim();
    if (!cleanName) {
      setErrorMsg('กรุณากรอกชื่อโครงการเต็ม');
      return;
    }

    const budgetNum = parseBudgetNumber(requestedBudgetStr);
    if (!requestedBudgetStr.trim() || budgetNum <= 0) {
      setErrorMsg('กรุณากรอกงบประมาณที่ยื่นขอเป็นตัวเลขที่มากกว่า 0');
      return;
    }
    if (budgetNum > FIELD_LIMITS.MAX_BUDGET) {
      setErrorMsg('งบประมาณเกินขอบเขตที่ระบบกำหนด');
      return;
    }

    let approvedBudgetNum = 0;
    if (proposalStatus === 'approved') {
      approvedBudgetNum = parseBudgetNumber(approvedBudgetStr);
      if (!approvedBudgetStr.trim() || approvedBudgetNum <= 0) {
        setErrorMsg(
          'กรุณากรอกงบประมาณที่ได้รับอนุมัติจริงเป็นตัวเลขที่มากกว่า 0'
        );
        return;
      }
      if (approvedBudgetNum > FIELD_LIMITS.MAX_BUDGET) {
        setErrorMsg('งบประมาณที่ได้รับอนุมัติเกินขอบเขตที่ระบบกำหนด');
        return;
      }
    }

    if (!submittedDate) {
      setErrorMsg('กรุณาเลือกวันที่ยื่นขอจากปฏิทิน');
      return;
    }

    try {
      await onSave({
        fiscalYear,
        name: cleanName,
        shortName: shortName.replace(/[\r\n]+/g, ' ').trim(),
        funderName: funderName
          .replace(/[\r\n]+/g, ' ')
          .trim()
          .slice(0, FIELD_LIMITS.FUNDER_NAME_MAX),
        requestedBudget: budgetNum,
        approvedBudget: approvedBudgetNum,
        submittedDate,
        proposalStatus,
        newProposalAttachment,
        removeExistingProposalEvidence,
      });
    } catch (err) {
      let msg = 'ไม่สามารถบันทึกข้อมูลโครงการได้ กรุณาลองใหม่อีกครั้ง';
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message) as { error?: string };
          if (parsed?.error?.includes('Missing or insufficient permissions')) {
            msg =
              'ไม่มีสิทธิ์หรือข้อมูลไม่ตรงเงื่อนไขในการบันทึก กรุณาตรวจสอบข้อมูลแล้วลองใหม่';
          } else if (parsed?.error) {
            msg = `${msg}: ${parsed.error}`;
          }
        } catch {
          if (err.message) msg = err.message;
        }
      }
      setErrorMsg(msg);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        editingProject
          ? 'แก้ไขข้อมูลและอัปเดตสถานะโครงการ (Stage 1)'
          : 'เพิ่มโครงการใหม่ (Stage 1)'
      }
      className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="max-w-2xl w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden my-auto">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {editingProject
                ? 'แก้ไขข้อมูลและอัปเดตสถานะโครงการ (Stage 1)'
                : 'เพิ่มโครงการใหม่ (Stage 1 · ก่อนได้รับอนุมัติ)'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              เมื่อเปลี่ยนสถานะเป็น &ldquo;แหล่งทุนอนุมัติ&rdquo; ระบบจะเปิดเมนูการบริหารโครงการ Stage 2 ให้อัตโนมัติ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="s1FiscalYear"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                1. ปีงบประมาณ
              </label>
              <select
                id="s1FiscalYear"
                value={fiscalYear}
                onChange={(e) => setFiscalYear(Number(e.target.value))}
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              >
                {fiscalYearOptions.map((y) => (
                  <option key={y} value={y}>
                    พ.ศ. {y}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="s1Status"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                7. สถานะโครงการ
              </label>
              <select
                id="s1Status"
                value={proposalStatus}
                onChange={(e) => {
                  const next = e.target.value as ProposalStatus;
                  setProposalStatus(next);
                  if (
                    next === 'approved' &&
                    (!approvedBudgetStr.trim() ||
                      parseBudgetNumber(approvedBudgetStr) <= 0) &&
                    parseBudgetNumber(requestedBudgetStr) > 0
                  ) {
                    setApprovedBudgetStr(
                      formatCurrency(parseBudgetNumber(requestedBudgetStr))
                    );
                  }
                }}
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              >
                {PROPOSAL_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {PROPOSAL_STATUS_LABELS[st]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="s1Name"
                className="block text-sm font-medium text-slate-700"
              >
                2. ชื่อโครงการเต็ม
              </label>
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                {name.length}/{FIELD_LIMITS.NAME_MAX}
              </span>
            </div>
            <textarea
              id="s1Name"
              rows={2}
              maxLength={FIELD_LIMITS.NAME_MAX}
              value={name}
              onChange={(e) =>
                setName(e.target.value.replace(/[\r\n]+/g, ' '))
              }
              placeholder="ระบุชื่อโครงการฉบับเต็ม..."
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="s1ShortName"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                3. ชื่อโครงการย่อ
              </label>
              <input
                id="s1ShortName"
                type="text"
                maxLength={FIELD_LIMITS.SHORT_NAME_MAX}
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="ระบุชื่อย่อโครงการ (ถ้ามี)"
                className="w-full h-10 px-3.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
            </div>

            <div>
              <label
                htmlFor="s1FunderName"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                4. แหล่งทุน
              </label>
              <input
                id="s1FunderName"
                type="text"
                maxLength={FIELD_LIMITS.FUNDER_NAME_MAX}
                value={funderName}
                onChange={(e) => setFunderName(e.target.value)}
                placeholder="ระบุหน่วยงานแหล่งทุน (เช่น กปว. / บพข. / วช.)"
                className="w-full h-10 px-3.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="s1RequestedBudget"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                5. งบประมาณที่ยื่นขอ (บาท)
              </label>
              <div className="relative">
                <input
                  id="s1RequestedBudget"
                  type="text"
                  inputMode="decimal"
                  value={requestedBudgetStr}
                  onChange={(e) => {
                    const formatted = formatBudgetWithCaret(e.currentTarget);
                    setRequestedBudgetStr(formatted);
                  }}
                  onBlur={() => {
                    if (!requestedBudgetStr.trim()) return;
                    setRequestedBudgetStr(
                      formatCurrency(parseBudgetNumber(requestedBudgetStr))
                    );
                  }}
                  placeholder="เช่น 1,500,000.00"
                  className="w-full h-10 pl-3 pr-14 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
                  บาท
                </span>
              </div>
            </div>

            <ThaiDatePopupInput
              id="s1SubmittedDate"
              label="6. วันที่ยื่นขอ"
              value={submittedDate}
              onChange={setSubmittedDate}
            />
          </div>

          {proposalStatus === 'approved' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <label
                    htmlFor="s1ApprovedBudget"
                    className="block text-sm font-semibold text-emerald-950"
                  >
                    งบประมาณที่ได้รับอนุมัติจริง (บาท)
                  </label>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    ระบบจะอัปเดตงบประมาณโครงการในฐานข้อมูลและหน้าจัดสรรเป็นยอดที่ได้รับอนุมัติจริงนี้
                  </p>
                </div>

                <div className="relative sm:w-64 shrink-0">
                  <input
                    id="s1ApprovedBudget"
                    type="text"
                    inputMode="decimal"
                    value={approvedBudgetStr}
                    onChange={(e) => {
                      const formatted = formatBudgetWithCaret(e.currentTarget);
                      setApprovedBudgetStr(formatted);
                    }}
                    onBlur={() => {
                      if (!approvedBudgetStr.trim()) return;
                      setApprovedBudgetStr(
                        formatCurrency(parseBudgetNumber(approvedBudgetStr))
                      );
                    }}
                    placeholder="เช่น 1,200,000.00"
                    className="w-full h-10 pl-3 pr-14 bg-white border border-emerald-300 rounded-lg text-sm font-mono font-semibold tabular-nums text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/25 focus:border-emerald-700"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
                    บาท
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Proposal Submission Letter Upload (Optional) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-700">
                8. หนังสือการยื่นข้อเสนอโครงการ (ถ้ามี)
              </span>
              <span className="text-[11px] text-slate-500">
                รองรับ PDF, JPG, PNG (ไม่เกิน 5 MB)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-blue-900 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 cursor-pointer">
                {isProcessingFile ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                {newProposalAttachment || existingEvidenceId
                  ? 'เปลี่ยนไฟล์หนังสือยื่นข้อเสนอ'
                  : 'อัพโหลดหนังสือการยื่นข้อเสนอโครงการ'}
                <input
                  type="file"
                  accept=".pdf,application/pdf,image/jpeg,image/png"
                  disabled={isProcessingFile || isSaving}
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleSelectFile(file);
                    e.target.value = '';
                  }}
                />
              </label>

              {newProposalAttachment ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                  <Paperclip className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate max-w-[220px] font-medium">
                    {newProposalAttachment.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setNewProposalAttachment(null)}
                    aria-label="ลบไฟล์ที่เลือก"
                    className="p-0.5 text-emerald-700 hover:text-red-600 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : existingEvidenceId ? (
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowPreviewModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-blue-900 hover:bg-slate-50"
                  >
                    <Paperclip className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span className="truncate max-w-[200px]">
                      {existingEvidenceName || 'ดูไฟล์หนังสือยื่นข้อเสนอ'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveExistingProposalEvidence(true)}
                    title="ลบเอกสารแนบเดิม"
                    className="inline-flex items-center justify-center w-8 h-8 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <span className="text-xs text-slate-400">
                  ยังไม่ได้แนบไฟล์ (สามารถอัพโหลดเพิ่มเติมภายหลังได้)
                </span>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={isSaving || isProcessingFile}
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isSaving || isProcessingFile}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap"
            >
              {editingProject ? (
                <Save className="w-4 h-4" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {isSaving
                ? 'กำลังบันทึก...'
                : editingProject
                  ? 'บันทึกการอัปเดตสถานะ'
                  : 'เพิ่มโครงการ'}
            </button>
          </div>
        </form>
      </div>

      {showPreviewModal && editingProject && existingEvidenceId && (
        <EvidencePreviewModal
          projectId={editingProject.id}
          evidenceId={existingEvidenceId}
          fileName={existingEvidenceName}
          onClose={() => setShowPreviewModal(false)}
        />
      )}
    </div>
  );
};

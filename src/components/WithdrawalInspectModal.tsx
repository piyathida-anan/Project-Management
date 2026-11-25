import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Printer,
  X,
  FileText,
  Loader2,
  CheckCircle2,
  Clock,
  Paperclip,
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { BudgetProject, BudgetWithdrawal } from '../types/budget';
import {
  formatCurrency,
  formatPercent,
  formatThaiDateTime,
} from '../utils/formatters';
import { dataUrlToSafeBlobUrl } from '../utils/fileUpload';
import { fetchProjectEvidence } from '../utils/evidenceService';

interface WithdrawalInspectModalProps {
  project: BudgetProject;
  withdrawal: BudgetWithdrawal;
  isUpdatingStatus: boolean;
  onMarkInspected: (withdrawal: BudgetWithdrawal) => Promise<void>;
  onClose: () => void;
}

export const WithdrawalInspectModal: React.FC<WithdrawalInspectModalProps> = ({
  project,
  withdrawal,
  isUpdatingStatus,
  onMarkInspected,
  onClose,
}) => {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showAttachmentPreview, setShowAttachmentPreview] = useState(false);
  const [resolvedDataUrl, setResolvedDataUrl] = useState<string>(
    () => withdrawal.attachmentDataUrl || ''
  );
  const [loadingAttachment, setLoadingAttachment] = useState(false);

  useEffect(() => {
    if (withdrawal.attachmentDataUrl) {
      setResolvedDataUrl(withdrawal.attachmentDataUrl);
      setLoadingAttachment(false);
      return;
    }
    if (!withdrawal.attachmentEvidenceId) {
      setResolvedDataUrl('');
      setLoadingAttachment(false);
      return;
    }
    let active = true;
    setLoadingAttachment(true);
    fetchProjectEvidence(project.id, withdrawal.attachmentEvidenceId)
      .then((ev) => {
        if (!active) return;
        setResolvedDataUrl(ev?.dataUrl ?? '');
      })
      .catch(() => {
        if (active) setResolvedDataUrl('');
      })
      .finally(() => {
        if (active) setLoadingAttachment(false);
      });
    return () => {
      active = false;
    };
  }, [
    project.id,
    withdrawal.attachmentDataUrl,
    withdrawal.attachmentEvidenceId,
  ]);

  const safeBlobUrl = useMemo(
    () =>
      resolvedDataUrl
        ? dataUrlToSafeBlobUrl(resolvedDataUrl, withdrawal.attachmentMimeType)
        : null,
    [resolvedDataUrl, withdrawal.attachmentMimeType]
  );

  useEffect(() => {
    return () => {
      if (safeBlobUrl) {
        URL.revokeObjectURL(safeBlobUrl);
      }
    };
  }, [safeBlobUrl]);

  const requestDateText = useMemo(
    () => formatThaiDateTime(withdrawal.createdAt ?? new Date()),
    [withdrawal.createdAt]
  );

  const handleDownloadPdf = async () => {
    if (!sheetRef.current) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const dataUrl = await toPng(sheetRef.current, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
      pdf.addImage(
        dataUrl,
        'PNG',
        0,
        0,
        pageWidth,
        pageHeight,
        undefined,
        'FAST'
      );
      const safeAgency = (
        withdrawal.agencyShortName || withdrawal.agencyName
      )
        .slice(0, 30)
        .replace(/[^\u0E00-\u0E7Fa-zA-Z0-9_-]/g, '_');
      pdf.save(`ใบตรวจรับขอเบิก_${safeAgency}.pdf`);
    } catch (err) {
      console.error('Withdrawal PDF export error:', err);
      setExportError(
        'ไม่สามารถสร้างไฟล์ PDF อัตโนมัติได้ กรุณากดปุ่ม "พิมพ์เอกสาร (Print Out)" แล้วเลือกบันทึกเป็น PDF'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const inspectSheetContent = (
    <div className="a4-print-sheet w-[794px] min-h-[1122px] bg-[#ffffff] text-[#0f172a] font-[Sarabun,sans-serif] flex flex-col justify-between p-[26px] box-border relative">
      <div>
        {/* Top Corner Page Margin: Date & Time */}
        <div className="flex items-center justify-between text-[10.5px] text-[#475569] border-b border-[#cbd5e1] pb-1.5 mb-4">
          <span>วันที่ {requestDateText}</span>
          <span>เอกสารประกอบการตรวจรับขอเบิกงบประมาณ · หน้า 1 / 1</span>
        </div>

        {/* Header */}
        <div className="mb-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[19px] font-bold text-[#0f172a]">
              ใบสรุปรายการขอเบิกงบประมาณเพื่อการตรวจรับ
            </h2>
            <span className="text-[13px] font-semibold text-[#1e3a8a] tabular-nums shrink-0">
              ปีงบประมาณ พ.ศ. {project.fiscalYear}
            </span>
          </div>

          <div className="mt-2.5 bg-[#f8fafc] border border-[#cbd5e1] rounded-md px-4 py-3 text-[12px] space-y-1.5">
            <div>
              <span className="font-semibold text-[#334155]">ชื่อโครงการ: </span>
              <span className="text-[#0f172a]">
                {project.shortName ? `[${project.shortName}] ` : ''}
                {project.name}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[#e2e8f0]">
              <div>
                <span className="font-semibold text-[#334155]">
                  หน่วยงานที่ขอเบิก:{' '}
                </span>
                <span className="font-bold text-[#1e3a8a]">
                  {withdrawal.agencyName}
                  {withdrawal.agencyShortName
                    ? ` (${withdrawal.agencyShortName})`
                    : ''}
                </span>
              </div>
              <div>
                <span className="font-semibold text-[#334155]">
                  ผู้ยื่นคำขอเบิก:{' '}
                </span>
                <span className="text-[#0f172a]">{withdrawal.requesterName}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="font-semibold text-[#334155]">
                  หนังสือขอเบิกที่แนบ:{' '}
                </span>
                <span className="text-[#0f172a]">
                  {withdrawal.attachmentName}
                </span>
              </div>
              <div>
                <span className="font-semibold text-[#334155]">
                  รหัสอ้างอิงคำขอ:{' '}
                </span>
                <span className="font-mono text-[11px] text-[#0f172a]">
                  {withdrawal.id}
                </span>
              </div>
            </div>
            {withdrawal.note ? (
              <div>
                <span className="font-semibold text-[#334155]">หมายเหตุ: </span>
                <span className="text-[#0f172a]">{withdrawal.note}</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Requested Items Table */}
        <table className="w-full table-fixed border-collapse border border-[#94a3b8] text-[11.5px]">
          <thead>
            <tr className="bg-[#f1f5f9] text-[#0f172a]">
              <th className="border border-[#94a3b8] py-2 px-2 text-center w-[42px] font-semibold">
                ลำดับ
              </th>
              <th className="border border-[#94a3b8] py-2 px-3 text-left font-semibold">
                รายการกิจกรรมที่ขอเบิก
              </th>
              <th className="border border-[#94a3b8] py-2 px-2 text-center w-[130px] font-semibold">
                งวดที่ขอเบิก
              </th>
              <th className="border border-[#94a3b8] py-2 px-3 text-right w-[135px] font-semibold">
                จำนวนเงินขอเบิก (บาท)
              </th>
            </tr>
          </thead>
          <tbody>
            {withdrawal.items.map((item, idx) => (
              <tr
                key={`${item.activityId}_${item.installmentId}`}
                className={idx % 2 === 1 ? 'bg-[#f8fafc]' : 'bg-[#ffffff]'}
              >
                <td className="border border-[#94a3b8] py-2 px-2 text-center tabular-nums align-top">
                  {idx + 1}
                </td>
                <td className="border border-[#94a3b8] py-2 px-3 text-left break-words align-top">
                  {item.activityName}
                </td>
                <td className="border border-[#94a3b8] py-2 px-2 text-center tabular-nums align-top">
                  งวดที่ {item.installmentOrder} (
                  {formatPercent(item.installmentPercentage)}%)
                </td>
                <td className="border border-[#94a3b8] py-2 px-3 text-right font-semibold tabular-nums align-top">
                  {formatCurrency(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#eff6ff] font-bold text-[#0f172a]">
              <td
                colSpan={3}
                className="border border-[#94a3b8] py-2.5 px-3 text-right"
              >
                รวมยอดขอเบิกงบประมาณทั้งสิ้น ({withdrawal.items.length} รายการ)
              </td>
              <td className="border border-[#94a3b8] py-2.5 px-3 text-right text-[#1e3a8a] tabular-nums">
                {formatCurrency(withdrawal.totalRequested)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Inspection Checklist Note */}
        <div className="mt-4 border border-[#cbd5e1] rounded-md p-3 text-[11.5px] bg-[#ffffff]">
          <p className="font-semibold text-[#334155] mb-1.5">
            บันทึกผลการตรวจรับงบประมาณ:
          </p>
          <div className="flex items-center gap-8 text-[#0f172a]">
            <span>[ &nbsp; ] ถูกต้องครบถ้วน เห็นควรอนุมัติเบิกจ่าย</span>
            <span>[ &nbsp; ] ให้แก้ไข / ส่งเอกสารเพิ่มเติม</span>
          </div>
          <div className="mt-4 border-b border-dotted border-[#94a3b8] w-full" />
        </div>
      </div>

      {/* Bottom Signature Block */}
      <div className="pt-6">
        <div className="grid grid-cols-3 gap-x-4 text-[11px] text-[#0f172a] items-start pb-4">
          <div className="text-center px-1">
            <p className="font-semibold text-[#334155]">ผู้ยื่นขอเบิก</p>
            <div className="h-[58px] flex flex-col justify-end items-center pb-1">
              <span className="text-[10.5px] font-mono text-[#334155] leading-none mb-2">
                #SG01#
              </span>
              <div className="border-b border-dotted border-[#64748b] w-4/5 mx-auto" />
            </div>
            <p className="font-medium mt-0.5">({withdrawal.requesterName})</p>
            <p className="text-[10px] text-[#475569] mt-0.5">
              {withdrawal.agencyShortName || withdrawal.agencyName}
            </p>
          </div>

          <div className="text-center px-1">
            <p className="font-semibold text-[#334155]">ผู้ตรวจรับงบประมาณ</p>
            <div className="h-[58px] flex flex-col justify-end items-center pb-1">
              <span className="text-[10.5px] font-mono text-[#334155] leading-none mb-2">
                #SG02#
              </span>
              <div className="border-b border-dotted border-[#64748b] w-4/5 mx-auto" />
            </div>
            <p className="font-medium mt-0.5">({project.preparer})</p>
            {project.preparerPosition ? (
              <p className="text-[10px] text-[#475569] mt-0.5">
                ตำแหน่ง {project.preparerPosition}
              </p>
            ) : null}
          </div>

          <div className="text-center px-1">
            <p className="font-semibold text-[#334155]">ผู้อนุมัติเบิกจ่าย</p>
            <div className="h-[58px] flex flex-col justify-end items-center pb-1">
              <span className="text-[10.5px] font-mono text-[#334155] leading-none mb-2">
                #SG03#
              </span>
              <div className="border-b border-dotted border-[#64748b] w-4/5 mx-auto" />
            </div>
            <p className="font-medium mt-0.5">({project.approver})</p>
            {project.approverPosition ? (
              <p className="text-[10px] text-[#475569] mt-0.5">
                ตำแหน่ง {project.approverPosition}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-[#475569] border-t border-[#cbd5e1] pt-1.5">
          <span>วันที่ {requestDateText}</span>
          <span>
            {withdrawal.agencyShortName || withdrawal.agencyName} · หน้า 1/1
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ตรวจรับรายการขอเบิกงบประมาณ"
        className="no-print fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex flex-col"
      >
        {/* Top Toolbar */}
        <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-blue-900 shrink-0" />
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-semibold text-slate-900">
                  ตรวจรับรายการขอเบิกงบประมาณ
                </h3>
                {withdrawal.status === 'inspected' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    ตรวจรับแล้ว
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                    <Clock className="w-3.5 h-3.5" />
                    รอตรวจรับ
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {withdrawal.agencyName} · ยอดขอเบิก{' '}
                {formatCurrency(withdrawal.totalRequested)} บาท
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {withdrawal.status !== 'inspected' && (
              <button
                type="button"
                disabled={isUpdatingStatus}
                onClick={() => onMarkInspected(withdrawal)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isUpdatingStatus ? 'กำลังบันทึก...' : 'ยืนยันตรวจรับแล้ว'}
              </button>
            )}

            <button
              type="button"
              disabled={isExporting}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {isExporting ? 'กำลังสร้างไฟล์ PDF...' : 'บันทึกเป็นไฟล์ PDF'}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="w-4 h-4" />
              พิมพ์เพื่อตรวจรับ
            </button>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <X className="w-4 h-4" />
              ปิด
            </button>
          </div>
        </div>

        {/* Attached Official Letter Bar */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <Paperclip className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="font-medium">หนังสือขอเบิกเงินงบประมาณที่แนบ:</span>
            <span className="font-mono text-slate-900">
              {withdrawal.attachmentName}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {loadingAttachment ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                กำลังโหลดไฟล์แนบ...
              </span>
            ) : (
              safeBlobUrl && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowAttachmentPreview((v) => !v)}
                    className="px-3 py-1.5 text-xs font-medium text-blue-900 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
                  >
                    {showAttachmentPreview ? 'ซ่อนไฟล์แนบ' : 'เปิดดูหนังสือขอเบิก'}
                  </button>
                  <a
                    href={safeBlobUrl}
                    download={withdrawal.attachmentName}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    ดาวน์โหลดไฟล์แนบ
                  </a>
                </>
              )
            )}
          </div>
        </div>

        {exportError && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-xs text-amber-800">
            {exportError}
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-6 lg:p-8 bg-slate-200/80 space-y-6">
          {showAttachmentPreview && safeBlobUrl && (
            <div className="max-w-[794px] mx-auto bg-white border border-slate-300 shadow-md p-4 rounded-lg">
              <p className="text-xs font-semibold text-slate-700 mb-3">
                ตัวอย่างไฟล์หนังสือขอเบิกเงินงบประมาณ ({withdrawal.attachmentName})
              </p>
              {withdrawal.attachmentMimeType === 'application/pdf' ? (
                <iframe
                  title={withdrawal.attachmentName}
                  src={safeBlobUrl}
                  className="w-full h-[520px] border border-slate-200 rounded"
                />
              ) : (
                <img
                  src={safeBlobUrl}
                  alt={withdrawal.attachmentName}
                  referrerPolicy="no-referrer"
                  className="max-h-[520px] mx-auto object-contain rounded border border-slate-200"
                />
              )}
            </div>
          )}

          <div className="flex justify-center min-w-max">
            <div
              ref={sheetRef}
              className="shadow-lg border border-slate-300 bg-white"
            >
              {inspectSheetContent}
            </div>
          </div>
        </div>
      </div>

      {/* Print-only output */}
      <div className="print-only-sheets">{inspectSheetContent}</div>
    </>
  );
};

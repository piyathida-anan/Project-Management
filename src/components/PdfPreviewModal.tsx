import React, { useMemo, useRef, useState } from 'react';
import { Download, Printer, X, FileText, Loader2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { AgencyItem, BudgetActivity, BudgetProject } from '../types/budget';
import {
  computeInstallmentAmounts,
  formatCurrency,
  formatPercent,
  formatThaiDateTime,
  round2,
} from '../utils/formatters';

interface PdfPreviewModalProps {
  project: BudgetProject;
  activities: BudgetActivity[];
  onClose: () => void;
}

interface AgencySheetProps {
  project: BudgetProject;
  activities: BudgetActivity[];
  agency: AgencyItem;
  pageNumber: number;
  totalPages: number;
  generatedTimestamp: string;
}

interface SignerBlock {
  roleLabel: string;
  sgTag: string;
  name: string;
  position: string;
}

function buildSigners(project: BudgetProject): SignerBlock[] {
  const signers: SignerBlock[] = [];
  let seq = 1;
  const nextTag = () => `#SG${String(seq++).padStart(2, '0')}#`;

  signers.push({
    roleLabel: 'ผู้จัดทำ',
    sgTag: nextTag(),
    name: project.preparer,
    position: project.preparerPosition ?? '',
  });

  const reviewerList =
    project.reviewerItems && project.reviewerItems.length > 0
      ? project.reviewerItems
      : project.reviewers.map((name) => ({ name, position: '' }));

  reviewerList.forEach((rev, idx) => {
    signers.push({
      roleLabel: reviewerList.length > 1 ? `ผู้เห็นชอบ (ลำดับที่ ${idx + 1})` : 'ผู้เห็นชอบ',
      sgTag: nextTag(),
      name: rev.name,
      position: rev.position ?? '',
    });
  });

  signers.push({
    roleLabel: 'ผู้อนุมัติ',
    sgTag: nextTag(),
    name: project.approver,
    position: project.approverPosition ?? '',
  });

  return signers;
}

interface SummarySheetProps {
  project: BudgetProject;
  activities: BudgetActivity[];
  totalPages: number;
  generatedTimestamp: string;
}

const ProjectSummarySheet: React.FC<SummarySheetProps> = ({
  project,
  activities,
  totalPages,
  generatedTimestamp,
}) => {
  const sortedActivities = useMemo(
    () => [...activities].sort((a, b) => a.order - b.order),
    [activities]
  );

  // Sum each agency's installment totals from the exact activity breakdowns so Page 1 reconciles 100% with Pages 2..N+1
  const agencyRows = useMemo(() => {
    return project.agencies.map((agency) => {
      let agencyTotal = 0;
      const installmentTotals = project.installments.map(() => 0);

      sortedActivities.forEach((act) => {
        const amt = round2(Number(act.amounts?.[agency.id] ?? 0));
        agencyTotal = round2(agencyTotal + amt);
        const splits = computeInstallmentAmounts(amt, project.installments);
        splits.forEach((s, idx) => {
          installmentTotals[idx] = round2((installmentTotals[idx] ?? 0) + s);
        });
      });

      return {
        agency,
        agencyTotal,
        installmentTotals,
      };
    });
  }, [project.agencies, project.installments, sortedActivities]);

  const grandAllocatedTotal = useMemo(
    () => round2(agencyRows.reduce((sum, r) => sum + r.agencyTotal, 0)),
    [agencyRows]
  );

  const installmentGrandTotals = useMemo(() => {
    return project.installments.map((_, idx) =>
      round2(
        agencyRows.reduce((sum, r) => sum + (r.installmentTotals[idx] ?? 0), 0)
      )
    );
  }, [project.installments, agencyRows]);

  const signers = useMemo(() => buildSigners(project), [project]);
  const effectiveBudget =
    project.proposalStatus === 'approved' && project.approvedBudget > 0
      ? project.approvedBudget
      : project.totalBudget;

  const instCount = project.installments.length;
  const tableTextClass =
    instCount <= 3
      ? 'text-[11px]'
      : instCount <= 5
        ? 'text-[10px]'
        : 'text-[9px]';
  const cellPadClass =
    instCount <= 3 ? 'py-1.5 px-2' : instCount <= 5 ? 'py-1.5 px-1.5' : 'py-1 px-1';
  const amountColWidth =
    instCount <= 3 ? 'w-[88px]' : instCount <= 5 ? 'w-[74px]' : 'w-[62px]';
  const instColWidth =
    instCount <= 3 ? 'w-[84px]' : instCount <= 5 ? 'w-[68px]' : 'w-[54px]';

  return (
    <div className="a4-print-sheet w-[794px] min-h-[1122px] bg-[#ffffff] text-[#0f172a] font-[Sarabun,sans-serif] flex flex-col justify-between p-[26px] box-border relative">
      <div>
        {/* Top Corner Page Margin: Date & Time only */}
        <div className="flex items-center justify-between text-[10.5px] text-[#475569] border-b border-[#cbd5e1] pb-1.5 mb-3.5">
          <span>วันที่ {generatedTimestamp}</span>
          <span>หน้า 1 / {totalPages}</span>
        </div>

        {/* Document Title & Project Summary Metadata */}
        <div className="mb-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[18px] font-bold text-[#0f172a]">
              สรุปรวมรายการจัดสรรงบประมาณทั้งโครงการ
            </h2>
            <span className="text-[13px] font-semibold text-[#1e3a8a] tabular-nums shrink-0">
              ปีงบประมาณ พ.ศ. {project.fiscalYear}
            </span>
          </div>

          <div className="mt-2 bg-[#f8fafc] border border-[#cbd5e1] rounded-md px-3.5 py-2.5 text-[12px] space-y-1.5">
            <div>
              <span className="font-semibold text-[#334155]">ชื่อโครงการ: </span>
              <span className="text-[#0f172a]">
                {project.shortName ? `[${project.shortName}] ` : ''}
                {project.name}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 pt-1 border-t border-[#e2e8f0]">
              <div>
                <span className="font-semibold text-[#334155]">
                  ปีงบประมาณ:{' '}
                </span>
                <span className="font-medium text-[#0f172a] tabular-nums">
                  พ.ศ. {project.fiscalYear}
                </span>
              </div>
              <div>
                <span className="font-semibold text-[#334155]">
                  งบประมาณรวมทั้งโครงการ:{' '}
                </span>
                <span className="font-bold text-[#1e3a8a] tabular-nums">
                  {formatCurrency(effectiveBudget)} บาท
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Summary Allocation Table by Agency & Installment */}
        <table
          className={`w-full table-fixed border-collapse border border-[#94a3b8] ${tableTextClass}`}
        >
          <thead>
            <tr className="bg-[#f1f5f9] text-[#0f172a]">
              <th
                className={`border border-[#94a3b8] ${cellPadClass} text-center w-[36px] font-semibold`}
              >
                ลำดับ
              </th>
              <th
                className={`border border-[#94a3b8] ${cellPadClass} text-left font-semibold`}
              >
                หน่วยงานที่ได้รับจัดสรร
              </th>
              <th
                className={`border border-[#94a3b8] ${cellPadClass} text-right ${amountColWidth} font-semibold`}
              >
                งบประมาณรวม
                <span className="block font-normal text-[9.5px] text-[#475569]">
                  (บาท)
                </span>
              </th>
              {project.installments.map((inst, idx) => (
                <th
                  key={inst.id}
                  className={`border border-[#94a3b8] ${cellPadClass} text-right ${instColWidth} font-semibold`}
                >
                  <span className="block leading-tight">งวดที่ {idx + 1}</span>
                  <span className="block font-normal text-[9.5px] text-[#475569]">
                    ({formatPercent(inst.percentage)}%)
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {agencyRows.map((row, idx) => (
              <tr
                key={row.agency.id}
                className={idx % 2 === 1 ? 'bg-[#f8fafc]' : 'bg-[#ffffff]'}
              >
                <td
                  className={`border border-[#94a3b8] ${cellPadClass} text-center tabular-nums align-top`}
                >
                  {idx + 1}
                </td>
                <td
                  className={`border border-[#94a3b8] ${cellPadClass} text-left break-words align-top`}
                >
                  <span className="font-medium text-[#0f172a]">
                    {row.agency.name}
                  </span>
                  {row.agency.shortName ? (
                    <span className="text-[#475569] ml-1">
                      ({row.agency.shortName})
                    </span>
                  ) : null}
                </td>
                <td
                  className={`border border-[#94a3b8] ${cellPadClass} text-right font-semibold tabular-nums align-top`}
                >
                  {formatCurrency(row.agencyTotal)}
                </td>
                {row.installmentTotals.map((amt, instIdx) => (
                  <td
                    key={instIdx}
                    className={`border border-[#94a3b8] ${cellPadClass} text-right tabular-nums align-top`}
                  >
                    {formatCurrency(amt)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="bg-[#eff6ff] font-bold text-[#0f172a]">
              <td
                colSpan={2}
                className={`border border-[#94a3b8] ${cellPadClass} text-right`}
              >
                รวมงบประมาณจัดสรรทั้งหมด
              </td>
              <td
                className={`border border-[#94a3b8] ${cellPadClass} text-right text-[#1e3a8a] tabular-nums`}
              >
                {formatCurrency(grandAllocatedTotal)}
              </td>
              {installmentGrandTotals.map((total, idx) => (
                <td
                  key={idx}
                  className={`border border-[#94a3b8] ${cellPadClass} text-right tabular-nums`}
                >
                  {formatCurrency(total)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>

        {Math.abs(effectiveBudget - grandAllocatedTotal) >= 0.01 && (
          <div className="mt-2.5 flex justify-end text-[11px] text-[#475569] tabular-nums">
            <span>
              งบประมาณโครงการ {formatCurrency(effectiveBudget)} บาท · จัดสรรแล้ว{' '}
              {formatCurrency(grandAllocatedTotal)} บาท · คงเหลือ{' '}
              {formatCurrency(round2(effectiveBudget - grandAllocatedTotal))} บาท
            </span>
          </div>
        )}
      </div>

      {/* Bottom Signatures (~3 lines blank vertical space, sequential #SG01#..#SGNN#, name + position) */}
      <div className="pt-5">
        <div className="grid grid-cols-3 gap-x-4 gap-y-5 text-[11px] text-[#0f172a] items-start pb-4">
          {signers.map((signer) => (
            <div key={signer.sgTag} className="text-center px-1">
              <p
                className={`leading-snug ${
                  signer.roleLabel === 'ผู้อนุมัติ'
                    ? 'text-[13px] font-bold text-[#0f172a]'
                    : 'font-semibold text-[#334155]'
                }`}
              >
                {signer.roleLabel}
              </p>

              <div className="h-[58px] flex flex-col justify-end items-center pb-1">
                <span className="text-[10.5px] font-mono text-[#334155] leading-none mb-2">
                  {signer.sgTag}
                </span>
                <div className="border-b border-dotted border-[#64748b] w-4/5 mx-auto" />
              </div>

              <p className="font-medium leading-snug mt-0.5">({signer.name})</p>
              {signer.position ? (
                <p className="text-[10px] text-[#475569] leading-snug mt-0.5 break-words">
                  ตำแหน่ง {signer.position}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        {/* Bottom Corner Margin: Date & Time only */}
        <div className="flex items-center justify-between text-[10px] text-[#475569] border-t border-[#cbd5e1] pt-1.5">
          <span>วันที่ {generatedTimestamp}</span>
          <span>สรุปรวมทั้งโครงการ · หน้า 1/{totalPages}</span>
        </div>
      </div>
    </div>
  );
};

const AgencySheet: React.FC<AgencySheetProps> = ({
  project,
  activities,
  agency,
  pageNumber,
  totalPages,
  generatedTimestamp,
}) => {
  const sortedActivities = useMemo(
    () => [...activities].sort((a, b) => a.order - b.order),
    [activities]
  );

  const rowsData = useMemo(() => {
    return sortedActivities.map((act) => {
      const agencyTotal = round2(Number(act.amounts?.[agency.id] ?? 0));
      const installmentAmounts = computeInstallmentAmounts(
        agencyTotal,
        project.installments
      );
      return {
        id: act.id,
        order: act.order,
        activityName: act.activityName,
        agencyTotal,
        installmentAmounts,
      };
    });
  }, [sortedActivities, agency.id, project.installments]);

  const grandTotalForAgency = useMemo(
    () => round2(rowsData.reduce((sum, r) => sum + r.agencyTotal, 0)),
    [rowsData]
  );

  const installmentTotals = useMemo(() => {
    return project.installments.map((_, idx) =>
      round2(
        rowsData.reduce((sum, r) => sum + (r.installmentAmounts[idx] ?? 0), 0)
      )
    );
  }, [project.installments, rowsData]);

  const signers = useMemo(() => buildSigners(project), [project]);

  // Adaptive sizing so all installment columns always fit within A4 Portrait width
  const instCount = project.installments.length;
  const tableTextClass =
    instCount <= 3
      ? 'text-[11px]'
      : instCount <= 5
        ? 'text-[10px]'
        : 'text-[9px]';
  const cellPadClass =
    instCount <= 3 ? 'py-1.5 px-2' : instCount <= 5 ? 'py-1.5 px-1.5' : 'py-1 px-1';
  const amountColWidth =
    instCount <= 3 ? 'w-[88px]' : instCount <= 5 ? 'w-[74px]' : 'w-[62px]';
  const instColWidth =
    instCount <= 3 ? 'w-[84px]' : instCount <= 5 ? 'w-[68px]' : 'w-[54px]';

  return (
    <div className="a4-print-sheet w-[794px] min-h-[1122px] bg-[#ffffff] text-[#0f172a] font-[Sarabun,sans-serif] flex flex-col justify-between p-[26px] box-border relative">
      <div>
        {/* Top Corner Page Margin: Date & Time only (No version) */}
        <div className="flex items-center justify-between text-[10.5px] text-[#475569] border-b border-[#cbd5e1] pb-1.5 mb-3.5">
          <span>วันที่ {generatedTimestamp}</span>
          <span>
            หน้า {pageNumber} / {totalPages}
          </span>
        </div>

        {/* Document Title & Project Metadata */}
        <div className="mb-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[18px] font-bold text-[#0f172a]">
              รายละเอียดการจัดสรรงบประมาณรายหน่วยงาน
            </h2>
            <span className="text-[13px] font-semibold text-[#1e3a8a] tabular-nums shrink-0">
              ปีงบประมาณ พ.ศ. {project.fiscalYear}
            </span>
          </div>

          <div className="mt-2 bg-[#f8fafc] border border-[#cbd5e1] rounded-md px-3.5 py-2.5 text-[12px] space-y-1">
            <div>
              <span className="font-semibold text-[#334155]">โครงการ: </span>
              <span className="text-[#0f172a]">
                {project.shortName ? `[${project.shortName}] ` : ''}
                {project.name}
              </span>
            </div>
            <div>
              <span className="font-semibold text-[#334155]">
                หน่วยงานที่ได้รับจัดสรร:{' '}
              </span>
              <span className="font-bold text-[#1e3a8a]">
                {agency.name}
                {agency.shortName ? ` (${agency.shortName})` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Budget Table fitted strictly for A4 Portrait */}
        <table
          className={`w-full table-fixed border-collapse border border-[#94a3b8] ${tableTextClass}`}
        >
          <thead>
            <tr className="bg-[#f1f5f9] text-[#0f172a]">
              <th
                className={`border border-[#94a3b8] ${cellPadClass} text-center w-[36px] font-semibold`}
              >
                ลำดับ
              </th>
              <th
                className={`border border-[#94a3b8] ${cellPadClass} text-left font-semibold`}
              >
                กิจกรรม
              </th>
              <th
                className={`border border-[#94a3b8] ${cellPadClass} text-right ${amountColWidth} font-semibold`}
              >
                งบประมาณรวม
                <span className="block font-normal text-[9.5px] text-[#475569]">
                  (บาท)
                </span>
              </th>
              {project.installments.map((inst, idx) => (
                <th
                  key={inst.id}
                  className={`border border-[#94a3b8] ${cellPadClass} text-right ${instColWidth} font-semibold`}
                >
                  <span className="block leading-tight">งวดที่ {idx + 1}</span>
                  <span className="block font-normal text-[9.5px] text-[#475569]">
                    ({formatPercent(inst.percentage)}%)
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rowsData.length === 0 ? (
              <tr>
                <td
                  colSpan={3 + project.installments.length}
                  className="border border-[#94a3b8] py-6 text-center text-[#64748b]"
                >
                  ยังไม่มีรายการกิจกรรมที่จัดสรร
                </td>
              </tr>
            ) : (
              rowsData.map((row, idx) => (
                <tr
                  key={row.id}
                  className={idx % 2 === 1 ? 'bg-[#f8fafc]' : 'bg-[#ffffff]'}
                >
                  <td
                    className={`border border-[#94a3b8] ${cellPadClass} text-center tabular-nums align-top`}
                  >
                    {idx + 1}
                  </td>
                  <td
                    className={`border border-[#94a3b8] ${cellPadClass} text-left break-words align-top`}
                  >
                    {row.activityName}
                  </td>
                  <td
                    className={`border border-[#94a3b8] ${cellPadClass} text-right font-semibold tabular-nums align-top`}
                  >
                    {formatCurrency(row.agencyTotal)}
                  </td>
                  {row.installmentAmounts.map((amt, instIdx) => (
                    <td
                      key={instIdx}
                      className={`border border-[#94a3b8] ${cellPadClass} text-right tabular-nums align-top`}
                    >
                      {formatCurrency(amt)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>

          <tfoot>
            <tr className="bg-[#eff6ff] font-bold text-[#0f172a]">
              <td
                colSpan={2}
                className={`border border-[#94a3b8] ${cellPadClass} text-right break-words`}
              >
                รวมงบประมาณที่ได้รับจัดสรรทั้งหมด (
                {agency.shortName || agency.name})
              </td>
              <td
                className={`border border-[#94a3b8] ${cellPadClass} text-right text-[#1e3a8a] tabular-nums`}
              >
                {formatCurrency(grandTotalForAgency)}
              </td>
              {installmentTotals.map((total, idx) => (
                <td
                  key={idx}
                  className={`border border-[#94a3b8] ${cellPadClass} text-right tabular-nums`}
                >
                  {formatCurrency(total)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Bottom Signatures (~3 lines blank vertical space, sequential #SG01#..#SGNN#, name + position) */}
      <div className="pt-5">
        <div className="grid grid-cols-3 gap-x-4 gap-y-5 text-[11px] text-[#0f172a] items-start pb-4">
          {signers.map((signer) => (
            <div key={signer.sgTag} className="text-center px-1">
              <p
                className={`leading-snug ${
                  signer.roleLabel === 'ผู้อนุมัติ'
                    ? 'text-[13px] font-bold text-[#0f172a]'
                    : 'font-semibold text-[#334155]'
                }`}
              >
                {signer.roleLabel}
              </p>

              {/* ~3 lines of blank signature space with #SG0X# above the name */}
              <div className="h-[58px] flex flex-col justify-end items-center pb-1">
                <span className="text-[10.5px] font-mono text-[#334155] leading-none mb-2">
                  {signer.sgTag}
                </span>
                <div className="border-b border-dotted border-[#64748b] w-4/5 mx-auto" />
              </div>

              <p className="font-medium leading-snug mt-0.5">({signer.name})</p>
              {signer.position ? (
                <p className="text-[10px] text-[#475569] leading-snug mt-0.5 break-words">
                  ตำแหน่ง {signer.position}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        {/* Bottom Corner Margin: Date & Time only (No version) */}
        <div className="flex items-center justify-between text-[10px] text-[#475569] border-t border-[#cbd5e1] pt-1.5">
          <span>วันที่ {generatedTimestamp}</span>
          <span>
            {agency.shortName || agency.name} · หน้า {pageNumber}/{totalPages}
          </span>
        </div>
      </div>
    </div>
  );
};

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({
  project,
  activities,
  onClose,
}) => {
  const sheetRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const generatedTimestamp = useMemo(
    () => formatThaiDateTime(project.updatedAt ?? new Date()),
    [project.updatedAt]
  );

  const totalPages = 1 + project.agencies.length;

  const handleDownloadPdf = async () => {
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

      for (let i = 0; i < totalPages; i++) {
        const el = sheetRefs.current[i];
        if (!el) continue;

        const dataUrl = await toPng(el, {
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          cacheBust: true,
        });

        if (i > 0) {
          pdf.addPage('a4', 'portrait');
        }
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
      }

      const rawLabel = project.shortName || project.name;
      const safeTitle = rawLabel
        .slice(0, 40)
        .replace(/[^\u0E00-\u0E7Fa-zA-Z0-9_-]/g, '_');
      pdf.save(`จัดสรรงบประมาณ_${safeTitle}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
      setExportError(
        'ไม่สามารถสร้างไฟล์ PDF อัตโนมัติได้ กรุณาลองกดปุ่ม "พิมพ์เอกสาร (Print Out)" แล้วเลือกบันทึกเป็น PDF จากหน้าต่างพิมพ์'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* Modal Overlay (Hidden during print) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ตัวอย่างเอกสาร PDF จัดสรรงบประมาณรายหน่วยงาน"
        className="no-print fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex flex-col"
      >
        {/* Modal Top Toolbar */}
        <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-blue-900 shrink-0" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                เอกสารรายงานการจัดสรรงบประมาณ (PDF แนวตั้ง)
              </h3>
              <p className="text-xs text-slate-500">
                ทั้งหมด {totalPages} หน้า (หน้าสรุปโครงการ 1 หน้า + แยกหน่วยงาน{' '}
                {project.agencies.length} หน้า) · วันที่ {generatedTimestamp}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
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
              พิมพ์เอกสาร (Print Out)
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่าง"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <X className="w-4 h-4" />
              ปิด
            </button>
          </div>
        </div>

        {exportError && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-xs text-amber-800">
            {exportError}
          </div>
        )}

        {/* Scrollable Portrait Sheet Preview Area */}
        <div className="flex-1 overflow-auto p-6 lg:p-8 bg-slate-200/80">
          <div className="flex flex-col items-center gap-8 min-w-max">
            {/* Page 1: Project Summary Sheet */}
            <div
              ref={(el) => {
                sheetRefs.current[0] = el;
              }}
              className="shadow-lg border border-slate-300 bg-white"
            >
              <ProjectSummarySheet
                project={project}
                activities={activities}
                totalPages={totalPages}
                generatedTimestamp={generatedTimestamp}
              />
            </div>

            {/* Pages 2..N+1: Per-Agency Detail Sheets */}
            {project.agencies.map((agency, idx) => (
              <div
                key={agency.id}
                ref={(el) => {
                  sheetRefs.current[idx + 1] = el;
                }}
                className="shadow-lg border border-slate-300 bg-white"
              >
                <AgencySheet
                  project={project}
                  activities={activities}
                  agency={agency}
                  pageNumber={idx + 2}
                  totalPages={totalPages}
                  generatedTimestamp={generatedTimestamp}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dedicated Print-Only Output (Page 1 Summary + 1 agency per A4 portrait sheet) */}
      <div className="print-only-sheets">
        <ProjectSummarySheet
          project={project}
          activities={activities}
          totalPages={totalPages}
          generatedTimestamp={generatedTimestamp}
        />
        {project.agencies.map((agency, idx) => (
          <AgencySheet
            key={`print-${agency.id}`}
            project={project}
            activities={activities}
            agency={agency}
            pageNumber={idx + 2}
            totalPages={totalPages}
            generatedTimestamp={generatedTimestamp}
          />
        ))}
      </div>
    </>
  );
};

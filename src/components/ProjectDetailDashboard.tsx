import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Mail,
  Paperclip,
  Pencil,
  Send,
  X,
} from 'lucide-react';
import {
  DELIVERABLE_STATUS_LABELS,
  PROPOSAL_STATUS_LABELS,
  REMINDER_RECIPIENT_EMAILS,
  SCHEDULE_STATUS_LABELS,
  TOR_RECEIPT_STATUS_LABELS,
  type BudgetProject,
  type ProjectDeliverable,
} from '../types/budget';
import {
  computeTorBudgetStats,
  daysUntilIsoDate,
  formatCurrency,
  formatIsoToThaiDate,
} from '../utils/formatters';
import { EvidencePreviewModal } from './EvidencePreviewModal';

export type Stage2MenuTab =
  | 'tor_receipts'
  | 'allocation_setup'
  | 'deliverables'
  | 'schedule_status';

interface ProjectDetailDashboardProps {
  project: BudgetProject;
  deliverables: ProjectDeliverable[];
  isSendingReminder: boolean;
  onBack: () => void;
  onOpenStage1Edit: () => void;
  onOpenStage2Edit: (initialMenu?: Stage2MenuTab) => void;
  onOpenAllocationTable: () => void;
  onOpenPdf: () => void;
  onOpenWithdraw: () => void;
  onSendReminderEmail: (
    deliverable: ProjectDeliverable,
    project: BudgetProject
  ) => Promise<void>;
}

export const ProjectDetailDashboard: React.FC<ProjectDetailDashboardProps> = ({
  project,
  deliverables,
  isSendingReminder,
  onBack,
  onOpenStage1Edit,
  onOpenStage2Edit,
  onOpenAllocationTable,
  onOpenPdf,
  onOpenWithdraw,
  onSendReminderEmail,
}) => {
  const [previewEvidence, setPreviewEvidence] = useState<{
    evidenceId: string;
    fileName: string;
  } | null>(null);
  const [reminderConfirmItem, setReminderConfirmItem] =
    useState<ProjectDeliverable | null>(null);

  const isApproved = project.proposalStatus === 'approved';
  const torStats = useMemo(() => computeTorBudgetStats(project), [project]);

  const receivedPercent =
    torStats.approvedBudget > 0
      ? Math.min(
          100,
          Math.round((torStats.receivedBudget / torStats.approvedBudget) * 100)
        )
      : 0;

  const sortedDeliverables = useMemo(() => {
    return [...deliverables].sort((a, b) =>
      (a.gpvDueDate || '').localeCompare(b.gpvDueDate || '')
    );
  }, [deliverables]);

  const nextDeadlineDeliverable = useMemo(() => {
    return (
      sortedDeliverables.find((d) => d.status !== 'submitted_gpv') ?? null
    );
  }, [sortedDeliverables]);

  const nextDeadlineDays = useMemo(() => {
    if (!nextDeadlineDeliverable?.gpvDueDate) return null;
    return daysUntilIsoDate(nextDeadlineDeliverable.gpvDueDate);
  }, [nextDeadlineDeliverable]);

  const missingExtensionDoc =
    isApproved &&
    project.scheduleStatus === 'extended' &&
    !project.extensionEvidenceId;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-5 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              className="mt-0.5 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              กลับหน้าหลัก
            </button>

            <div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span className="font-mono tabular-nums font-medium text-slate-700">
                  ปีงบประมาณ พ.ศ. {project.fiscalYear}
                </span>
                <span aria-hidden="true">·</span>
                <span
                  className={`font-semibold ${
                    isApproved
                      ? project.scheduleStatus === 'extended'
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                      : 'text-blue-900'
                  }`}
                >
                  {isApproved
                    ? project.scheduleStatus === 'extended'
                      ? `ขยายเวลา ครั้งที่ ${Math.max(1, project.extensionCount)}`
                      : SCHEDULE_STATUS_LABELS.on_time
                    : PROPOSAL_STATUS_LABELS[project.proposalStatus]}
                </span>
                {project.funderName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>แหล่งทุน: {project.funderName}</span>
                  </>
                )}
                {project.submittedDate && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      ยื่นขอวันที่ {formatIsoToThaiDate(project.submittedDate)}
                    </span>
                  </>
                )}
                {(project.projectStartDate || project.projectEndDate) && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums text-slate-700 font-medium">
                      ระยะเวลาดำเนินงาน:{' '}
                      {formatIsoToThaiDate(project.projectStartDate)} -{' '}
                      {formatIsoToThaiDate(project.projectEndDate)}
                    </span>
                  </>
                )}
                {project.proposalEvidenceId && (
                  <>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewEvidence({
                          evidenceId: project.proposalEvidenceId!,
                          fileName:
                            project.proposalEvidenceName ||
                            'หนังสือการยื่นข้อเสนอโครงการ',
                        })
                      }
                      className="inline-flex items-center gap-1 text-blue-900 hover:underline font-medium"
                    >
                      <Paperclip className="w-3 h-3" />
                      หนังสือการยื่นข้อเสนอโครงการ
                    </button>
                  </>
                )}
              </div>

              <h1 className="text-xl font-bold text-slate-900 mt-1">
                {project.shortName ? (
                  <span className="text-blue-900 mr-2">
                    [{project.shortName}]
                  </span>
                ) : null}
                {project.name}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isApproved ? (
              <>
                <button
                  type="button"
                  onClick={() => onOpenStage2Edit('tor_receipts')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 whitespace-nowrap"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  แก้ไขข้อมูล (4 เมนู)
                </button>
                <button
                  type="button"
                  onClick={onOpenAllocationTable}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                >
                  ตารางจัดสรรงบ
                </button>
                <button
                  type="button"
                  onClick={onOpenPdf}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5" />
                  PDF จัดสรร
                </button>
                <button
                  type="button"
                  onClick={onOpenWithdraw}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 whitespace-nowrap"
                >
                  <Banknote className="w-3.5 h-3.5" />
                  ขอเบิกงบ / ตรวจรับ
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onOpenStage1Edit}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 whitespace-nowrap"
              >
                <Pencil className="w-3.5 h-3.5" />
                แก้ไข / อัปเดตสถานะ (Stage 1)
              </button>
            )}
          </div>
        </div>

        {missingExtensionDoc && (
          <div className="mt-4 flex items-center justify-between gap-3 p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                <strong>แจ้งเตือน:</strong> โครงการอยู่ในสถานะ &ldquo;ขยายเวลา&rdquo; แต่ยังไม่ได้อัพโหลดเอกสารอนุมัติขยายเวลา
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpenStage2Edit('schedule_status')}
              className="px-3 py-1 font-medium text-white bg-red-600 rounded hover:bg-red-700 whitespace-nowrap shrink-0"
            >
              อัพโหลดเอกสาร
            </button>
          </div>
        )}

        {/* Budget Summary KPIs */}
        {isApproved ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-5">
            <div>
              <p className="text-xs font-medium text-slate-500">
                งบประมาณที่ได้รับอนุมัติ
              </p>
              <p className="text-2xl font-bold font-mono tabular-nums text-blue-900 mt-1">
                {formatCurrency(torStats.approvedBudget)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                บาท
                {project.requestedBudget > 0 &&
                  Math.abs(project.requestedBudget - torStats.approvedBudget) >=
                    0.01 && (
                    <span className="ml-1.5 tabular-nums text-slate-400">
                      (ยื่นขอ {formatCurrency(project.requestedBudget)})
                    </span>
                  )}
              </p>
            </div>

            <div className="md:border-l md:border-slate-200 md:pl-6">
              <p className="text-xs font-medium text-slate-500">
                งบประมาณที่ได้รับงบแล้ว
              </p>
              <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                {formatCurrency(torStats.receivedBudget)}
              </p>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                คิดเป็น {receivedPercent}% ของงบอนุมัติ
              </p>
            </div>

            <div className="md:border-l md:border-slate-200 md:pl-6">
              <p className="text-xs font-medium text-slate-500">
                งบประมาณค้างรับ
              </p>
              <p className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
                {formatCurrency(torStats.pendingBudget)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {torStats.isComplete ? 'รับงบครบถ้วนแล้ว' : 'มีค้างรับตาม TOR'}
              </p>
            </div>

            <div className="md:border-l md:border-slate-200 md:pl-6">
              <p className="text-xs font-medium text-slate-500">
                เดดไลน์ส่ง กปว. ถัดไป
              </p>
              {nextDeadlineDeliverable ? (
                <>
                  <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {formatIsoToThaiDate(nextDeadlineDeliverable.gpvDueDate)}
                  </p>
                  <p
                    className={`text-xs mt-1 font-medium tabular-nums ${
                      nextDeadlineDays !== null && nextDeadlineDays <= 20
                        ? 'text-amber-700'
                        : 'text-slate-600'
                    }`}
                  >
                    {nextDeadlineDeliverable.itemTitle}
                    {nextDeadlineDays !== null
                      ? nextDeadlineDays < 0
                        ? ` (เลยกำหนด ${Math.abs(nextDeadlineDays)} วัน)`
                        : nextDeadlineDays === 0
                          ? ' (ครบกำหนดวันนี้)'
                          : ` (อีก ${nextDeadlineDays} วัน)`
                      : ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base font-semibold text-slate-500 mt-1">
                    ไม่มีรายการค้างส่ง
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    ส่ง กปว. ครบทุกรายการแล้ว หรือยังไม่มีรายการ
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="pt-5 flex flex-wrap items-center justify-between gap-4 text-sm">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div>
                <span className="text-slate-500">งบประมาณที่ยื่นขอ: </span>
                <span className="font-mono tabular-nums font-bold text-blue-900">
                  {formatCurrency(project.requestedBudget)} บาท
                </span>
              </div>
              {project.funderName && (
                <div>
                  <span className="text-slate-500">แหล่งทุน: </span>
                  <span className="font-semibold text-slate-900">
                    {project.funderName}
                  </span>
                </div>
              )}
              {project.proposalEvidenceId && (
                <button
                  type="button"
                  onClick={() =>
                    setPreviewEvidence({
                      evidenceId: project.proposalEvidenceId!,
                      fileName:
                        project.proposalEvidenceName ||
                        'หนังสือการยื่นข้อเสนอโครงการ',
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  ดูหนังสือยื่นข้อเสนอโครงการ
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              โครงการนี้อยู่ใน Stage 1 ({PROPOSAL_STATUS_LABELS[project.proposalStatus]}) ·
              เมื่อเปลี่ยนสถานะเป็น &ldquo;แหล่งทุนอนุมัติ&rdquo; จะสามารถบันทึก TOR จัดสรรงบ และส่งมอบงานได้
            </p>
          </div>
        )}
      </section>

      {isApproved && (
        <>
          {/* TOR Receipts Table */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  รายการรับงบประมาณตาม TOR
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  สถานะการรับงบแต่ละงวดจากแหล่งทุนและมหาวิทยาลัย พร้อมหลักฐานประกอบ
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenStage2Edit('tor_receipts')}
                className="px-3.5 py-1.5 text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 whitespace-nowrap"
              >
                จัดการการรับงบ
              </button>
            </div>

            {project.torInstallments.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                ยังไม่มีการบันทึกงวดรับงบประมาณตาม TOR
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4 w-24">งวดที่</th>
                      <th className="py-3 px-4 text-right w-40">ยอดเงิน (บาท)</th>
                      <th className="py-3 px-4 w-48">สถานะ</th>
                      <th className="py-3 px-4">วันที่และหลักฐานจากแหล่งทุน</th>
                      <th className="py-3 px-4">วันที่และหลักฐานจากมหาวิทยาลัย</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {project.torInstallments.map((inst) => (
                      <tr key={inst.id}>
                        <td className="py-3 px-4 font-mono tabular-nums font-medium">
                          งวดที่ {inst.order}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                          {formatCurrency(inst.amount)}
                        </td>
                        <td className="py-3 px-4 text-xs font-medium">
                          <span
                            className={`inline-flex items-center gap-1 ${
                              inst.status === 'received_from_university'
                                ? 'text-emerald-700'
                                : inst.status === 'received_from_funder'
                                  ? 'text-blue-900'
                                  : 'text-amber-700'
                            }`}
                          >
                            {inst.status === 'waiting' ? (
                              <Clock className="w-3.5 h-3.5" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            {TOR_RECEIPT_STATUS_LABELS[inst.status]}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700">
                          {inst.funderReceivedDate || inst.funderEvidenceId ? (
                            <div className="space-y-1">
                              {inst.funderReceivedDate && (
                                <div className="tabular-nums">
                                  วันที่:{' '}
                                  {formatIsoToThaiDate(inst.funderReceivedDate)}
                                </div>
                              )}
                              {inst.funderEvidenceId && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewEvidence({
                                      evidenceId: inst.funderEvidenceId,
                                      fileName: inst.funderEvidenceName,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 text-blue-900 hover:underline"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  {inst.funderEvidenceName || 'ดูหลักฐาน'}
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700">
                          {inst.universityReceivedDate ||
                          inst.universityEvidenceId ? (
                            <div className="space-y-1">
                              {inst.universityReceivedDate && (
                                <div className="tabular-nums">
                                  วันที่:{' '}
                                  {formatIsoToThaiDate(
                                    inst.universityReceivedDate
                                  )}
                                </div>
                              )}
                              {inst.universityEvidenceId && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewEvidence({
                                      evidenceId: inst.universityEvidenceId,
                                      fileName: inst.universityEvidenceName,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 text-blue-900 hover:underline"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  {inst.universityEvidenceName || 'ดูหลักฐาน'}
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Deliverables Table */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  ตารางการส่งมอบงานและกำหนดส่ง กปว.
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {project.projectStartDate && project.projectEndDate ? (
                    <span className="font-medium text-slate-700 tabular-nums mr-2">
                      ระยะเวลาดำเนินงานรวมทั้งโครงการ:{' '}
                      <strong className="text-blue-900">
                        {formatIsoToThaiDate(project.projectStartDate)} -{' '}
                        {formatIsoToThaiDate(project.projectEndDate)}
                      </strong>
                    </span>
                  ) : (
                    <span>ยังไม่ได้กำหนดระยะเวลาดำเนินงานโครงการ · </span>
                  )}
                  แสดงรายการส่งมอบ สิ่งส่งมอบทั้งหมด กำหนดเรียกรายงาน PM และกำหนดส่ง กปว.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenStage2Edit('deliverables')}
                className="px-3.5 py-1.5 text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 whitespace-nowrap"
              >
                จัดการการส่งมอบงาน
              </button>
            </div>

            {sortedDeliverables.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                ยังไม่มีรายการส่งมอบงานในโครงการนี้
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4 w-16 text-center">ลำดับ</th>
                      <th className="py-3 px-4 min-w-[260px]">
                        รายการ / สิ่งส่งมอบและจำนวน
                      </th>
                      <th className="py-3 px-4 w-40">กำหนดเรียกจาก PM</th>
                      <th className="py-3 px-4 w-44">กำหนดส่ง กปว.</th>
                      <th className="py-3 px-4 w-44">สถานะการส่งงาน</th>
                      <th className="py-3 px-4 w-36 text-right">แจ้งเตือน / เอกสาร</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedDeliverables.map((del, delIdx) => {
                      const daysLeft = daysUntilIsoDate(del.gpvDueDate);
                      const isUrgent =
                        del.status !== 'submitted_gpv' &&
                        daysLeft !== null &&
                        daysLeft <= 20;

                      return (
                        <tr
                          key={del.id}
                          className={isUrgent ? 'bg-amber-50/40' : ''}
                        >
                          <td className="py-3.5 px-4 align-top text-center font-mono text-xs text-slate-600 tabular-nums">
                            {delIdx + 1}
                          </td>

                          <td className="py-3.5 px-4 align-top">
                            <p className="font-medium text-slate-900">
                              {del.itemTitle}
                            </p>
                            <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                              {del.artifacts.map((art) => (
                                <li key={art.id}>
                                  · {art.name}{' '}
                                  <span className="font-medium text-slate-800">
                                    ({art.quantity})
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </td>

                          <td className="py-3.5 px-4 align-top text-xs tabular-nums text-slate-700 whitespace-nowrap">
                            {formatIsoToThaiDate(del.pmRequestDate)}
                          </td>

                          <td className="py-3.5 px-4 align-top text-xs tabular-nums whitespace-nowrap">
                            <div className="font-semibold text-slate-900">
                              {formatIsoToThaiDate(del.gpvDueDate)}
                            </div>
                            {del.status !== 'submitted_gpv' &&
                              daysLeft !== null && (
                                <div
                                  className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium ${
                                    daysLeft <= 20
                                      ? 'text-amber-700'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  <CalendarClock className="w-3 h-3" />
                                  {daysLeft < 0
                                    ? `เลยกำหนด ${Math.abs(daysLeft)} วัน`
                                    : daysLeft === 0
                                      ? 'ครบกำหนดวันนี้'
                                      : `อีก ${daysLeft} วัน`}
                                </div>
                              )}
                          </td>

                          <td className="py-3.5 px-4 align-top text-xs">
                            <span
                              className={`font-semibold ${
                                del.status === 'submitted_gpv'
                                  ? 'text-emerald-700'
                                  : isUrgent
                                    ? 'text-amber-700'
                                    : 'text-blue-900'
                              }`}
                            >
                              {DELIVERABLE_STATUS_LABELS[del.status]}
                            </span>
                            {del.status === 'submitted_gpv' &&
                              del.gpvSubmittedDate && (
                                <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                                  ส่งวันที่{' '}
                                  {formatIsoToThaiDate(del.gpvSubmittedDate)}
                                </div>
                              )}
                          </td>

                          <td className="py-3.5 px-4 align-top text-right text-xs whitespace-nowrap space-y-1.5">
                            {del.gpvEvidenceId && (
                              <div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewEvidence({
                                      evidenceId: del.gpvEvidenceId,
                                      fileName: del.gpvEvidenceName,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 text-blue-900 hover:underline"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  เอกสารนำส่ง
                                </button>
                              </div>
                            )}

                            {del.status !== 'submitted_gpv' && (
                              <div>
                                <button
                                  type="button"
                                  disabled={isSendingReminder}
                                  onClick={() => setReminderConfirmItem(del)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-amber-800 bg-amber-100 rounded hover:bg-amber-200 disabled:opacity-50"
                                >
                                  <Mail className="w-3 h-3" />
                                  แจ้งเตือน กปว.
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {previewEvidence && (
        <EvidencePreviewModal
          projectId={project.id}
          evidenceId={previewEvidence.evidenceId}
          fileName={previewEvidence.fileName}
          onClose={() => setPreviewEvidence(null)}
        />
      )}

      {reminderConfirmItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="ยืนยันส่งอีเมลแจ้งเตือนกำหนดส่ง กปว."
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  ยืนยันส่งอีเมลแจ้งเตือนกำหนดส่ง กปว.
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  ระบบจะส่งอีเมลไปยัง {REMINDER_RECIPIENT_EMAILS.join(', ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReminderConfirmItem(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="py-4 text-sm text-slate-700 space-y-1.5">
              <div>
                <span className="font-medium text-slate-900">รายการ: </span>
                {reminderConfirmItem.itemTitle}
              </div>
              <div>
                <span className="font-medium text-slate-900">
                  กำหนดส่ง กปว.:{' '}
                </span>
                {formatIsoToThaiDate(reminderConfirmItem.gpvDueDate)}
              </div>
            </div>
            <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReminderConfirmItem(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSendingReminder}
                onClick={async () => {
                  const target = reminderConfirmItem;
                  await onSendReminderEmail(target, project);
                  setReminderConfirmItem(null);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-amber-700 rounded-lg hover:bg-amber-800 disabled:opacity-60"
              >
                <Send className="w-3.5 h-3.5" />
                {isSendingReminder ? 'กำลังส่ง...' : 'ยืนยันส่งอีเมล'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

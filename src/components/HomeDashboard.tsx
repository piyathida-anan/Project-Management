import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Download,
  FolderOpen,
  Loader2,
  Mail,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  DELIVERABLE_STATUS_LABELS,
  PROPOSAL_STATUS_LABELS,
  REMINDER_RECIPIENT_EMAILS,
  SCHEDULE_STATUS_LABELS,
  type BudgetProject,
  type ProjectDeliverable,
} from '../types/budget';
import {
  computeTorBudgetStats,
  daysUntilIsoDate,
  formatCurrency,
  formatIsoToThaiDate,
  round2,
} from '../utils/formatters';
import { EvidencePreviewModal } from './EvidencePreviewModal';

interface HomeDashboardProps {
  projects: BudgetProject[];
  deliverables: ProjectDeliverable[];
  loading: boolean;
  isSendingReminder: boolean;
  isExportingCsv: boolean;
  onAddProject: () => void;
  onExportCsv: () => Promise<void>;
  onOpenProjectDetail: (project: BudgetProject) => void;
  onEditProject: (project: BudgetProject) => void;
  onDeleteProject: (project: BudgetProject) => Promise<void>;
  onSendReminderEmail: (
    deliverable: ProjectDeliverable,
    project: BudgetProject
  ) => Promise<void>;
}

type StatusFilterValue =
  | 'all'
  | 'drafting'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'on_time'
  | 'extended';

type ReceiptFilterValue = 'all' | 'complete' | 'pending';

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  projects,
  deliverables,
  loading,
  isSendingReminder,
  isExportingCsv,
  onAddProject,
  onExportCsv,
  onOpenProjectDetail,
  onEditProject,
  onDeleteProject,
  onSendReminderEmail,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [receiptFilter, setReceiptFilter] = useState<ReceiptFilterValue>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reminderConfirmTarget, setReminderConfirmTarget] = useState<{
    deliverable: ProjectDeliverable;
    project: BudgetProject;
    daysRemaining: number | null;
  } | null>(null);
  const [previewEvidence, setPreviewEvidence] = useState<{
    projectId: string;
    evidenceId: string;
    fileName: string;
  } | null>(null);

  // Aggregate KPI metrics across all approved projects
  const dashboardStats = useMemo(() => {
    let approvedCount = 0;
    let stage1Count = 0;
    let totalApprovedBudget = 0;
    let totalReceivedBudget = 0;
    let totalPendingBudget = 0;

    projects.forEach((p) => {
      if (p.proposalStatus === 'approved') {
        approvedCount += 1;
        const torStats = computeTorBudgetStats(p);
        totalApprovedBudget = round2(
          totalApprovedBudget + torStats.approvedBudget
        );
        totalReceivedBudget = round2(
          totalReceivedBudget + torStats.receivedBudget
        );
        totalPendingBudget = round2(
          totalPendingBudget + torStats.pendingBudget
        );
      } else {
        stage1Count += 1;
      }
    });

    return {
      totalProjects: projects.length,
      approvedCount,
      stage1Count,
      totalApprovedBudget,
      totalReceivedBudget,
      totalPendingBudget,
    };
  }, [projects]);

  // Identify upcoming GPV deliverables within 20 days (and not yet submitted_gpv)
  const urgentReminders = useMemo(() => {
    const projectMap = new Map(projects.map((p) => [p.id, p]));
    return deliverables
      .filter((d) => d.status !== 'submitted_gpv' && d.gpvDueDate)
      .map((d) => {
        const project = projectMap.get(d.projectId);
        const days = daysUntilIsoDate(d.gpvDueDate);
        return { deliverable: d, project, daysRemaining: days };
      })
      .filter(
        (item): item is {
          deliverable: ProjectDeliverable;
          project: BudgetProject;
          daysRemaining: number;
        } =>
          Boolean(item.project) &&
          item.project!.proposalStatus === 'approved' &&
          item.daysRemaining !== null &&
          item.daysRemaining <= 20
      )
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [deliverables, projects]);

  const availableYears = useMemo(() => {
    return Array.from(new Set(projects.map((p) => p.fiscalYear))).sort(
      (a, b) => b - a
    );
  }, [projects]);

  // Pre-compute each project's live TOR stats and deliverable summary
  const enrichedProjects = useMemo(() => {
    const delByProject = new Map<string, ProjectDeliverable[]>();
    deliverables.forEach((d) => {
      const list = delByProject.get(d.projectId) ?? [];
      list.push(d);
      delByProject.set(d.projectId, list);
    });

    return projects.map((project) => {
      const torStats = computeTorBudgetStats(project);
      const projDeliverables = delByProject.get(project.id) ?? [];

      let deliverableText = '-';
      if (project.proposalStatus === 'approved') {
        if (projDeliverables.length > 0) {
          const sorted = [...projDeliverables].sort((a, b) =>
            (b.gpvDueDate || '').localeCompare(a.gpvDueDate || '')
          );
          const latest = sorted[0];
          const statusLabel =
            DELIVERABLE_STATUS_LABELS[latest.status] ?? latest.status;
          deliverableText = `${latest.itemTitle} (${statusLabel})`;
        } else if (project.deliverableSummary && project.deliverableSummary.count > 0) {
          deliverableText = `${project.deliverableSummary.latestItemTitle} (${project.deliverableSummary.latestStatus})`;
        } else {
          deliverableText = 'ยังไม่มีรายการส่งมอบ';
        }
      }

      const statusText =
        project.proposalStatus === 'approved'
          ? project.scheduleStatus === 'extended'
            ? `ขยายเวลา ครั้งที่ ${Math.max(1, project.extensionCount)}`
            : SCHEDULE_STATUS_LABELS.on_time
          : PROPOSAL_STATUS_LABELS[project.proposalStatus];

      const missingExtensionDoc =
        project.proposalStatus === 'approved' &&
        project.scheduleStatus === 'extended' &&
        !project.extensionEvidenceId;

      return {
        project,
        torStats,
        deliverableText,
        statusText,
        missingExtensionDoc,
      };
    });
  }, [projects, deliverables]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedProjects.filter(
      ({ project, torStats, statusText }) => {
        if (yearFilter !== 'all' && project.fiscalYear !== Number(yearFilter)) {
          return false;
        }

        if (statusFilter !== 'all') {
          if (
            statusFilter === 'drafting' ||
            statusFilter === 'submitted' ||
            statusFilter === 'approved' ||
            statusFilter === 'rejected'
          ) {
            if (project.proposalStatus !== statusFilter) return false;
          } else if (statusFilter === 'on_time' || statusFilter === 'extended') {
            if (
              project.proposalStatus !== 'approved' ||
              project.scheduleStatus !== statusFilter
            ) {
              return false;
            }
          }
        }

        if (receiptFilter !== 'all') {
          if (project.proposalStatus !== 'approved') return false;
          if (receiptFilter === 'complete' && !torStats.isComplete) return false;
          if (receiptFilter === 'pending' && torStats.isComplete) return false;
        }

        if (q) {
          const matchesYear = String(project.fiscalYear).includes(q);
          const matchesName = project.name.toLowerCase().includes(q);
          const matchesShort = (project.shortName ?? '')
            .toLowerCase()
            .includes(q);
          const matchesFunder = (project.funderName ?? '')
            .toLowerCase()
            .includes(q);
          const matchesStatus =
            statusText.toLowerCase().includes(q) ||
            PROPOSAL_STATUS_LABELS[project.proposalStatus]
              .toLowerCase()
              .includes(q);
          if (
            !matchesYear &&
            !matchesName &&
            !matchesShort &&
            !matchesFunder &&
            !matchesStatus
          ) {
            return false;
          }
        }

        return true;
      }
    );
  }, [enrichedProjects, searchQuery, yearFilter, statusFilter, receiptFilter]);

  const handleConfirmDelete = async (project: BudgetProject) => {
    setDeletingId(project.id);
    try {
      await onDeleteProject(project);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Executive Dashboard Header + KPI Strip */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              ภาพรวมระบบบริหารจัดการโครงการและงบประมาณ
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              ติดตามสถานะข้อเสนอ การรับงบประมาณตาม TOR การจัดสรรงบ การส่งมอบงาน กปว. และระยะเวลาดำเนินงาน
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={isExportingCsv || loading}
              onClick={() => void onExportCsv()}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              {isExportingCsv ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {isExportingCsv ? 'กำลัง Export...' : 'Export CSV'}
            </button>

            <button
              type="button"
              onClick={onAddProject}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              เพิ่มโครงการ (Stage 1)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-5">
          <div>
            <p className="text-xs font-medium text-slate-500">
              จำนวนโครงการทั้งหมด
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {dashboardStats.totalProjects} โครงการ
            </p>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              อนุมัติแล้ว {dashboardStats.approvedCount} · Stage 1{' '}
              {dashboardStats.stage1Count}
            </p>
          </div>

          <div className="sm:border-l sm:border-slate-200 sm:pl-6">
            <p className="text-xs font-medium text-slate-500">
              งบประมาณที่ได้รับอนุมัติรวม
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-blue-900 mt-1">
              {formatCurrency(dashboardStats.totalApprovedBudget)}
            </p>
            <p className="text-xs text-slate-500 mt-1">บาท (เฉพาะโครงการอนุมัติแล้ว)</p>
          </div>

          <div className="lg:border-l lg:border-slate-200 lg:pl-6">
            <p className="text-xs font-medium text-slate-500">
              งบประมาณที่ได้รับงบแล้ว
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
              {formatCurrency(dashboardStats.totalReceivedBudget)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              บาท (รับจากแหล่งทุน / มหาวิทยาลัยแล้ว)
            </p>
          </div>

          <div className="sm:border-l sm:border-slate-200 sm:pl-6">
            <p className="text-xs font-medium text-slate-500">งบประมาณค้างรับ</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
              {formatCurrency(dashboardStats.totalPendingBudget)}
            </p>
            <p className="text-xs text-slate-500 mt-1">บาท (คงเหลือรอรับงบตาม TOR)</p>
          </div>
        </div>
      </section>

      {/* 20-Day Advance GPV Deliverable Deadline Alert */}
      {urgentReminders.length > 0 && (
        <section className="bg-amber-50 border border-amber-300 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <BellRing className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-amber-950">
                แจ้งเตือนกำหนดส่งรายงาน กปว. (ภายใน 20 วัน หรือเกินกำหนด ·{' '}
                {urgentReminders.length} รายการ)
              </h2>
              <p className="text-xs text-amber-800 mt-0.5">
                รายการส่งมอบงานที่ใกล้ถึงกำหนดส่ง กปว. สามารถกดส่งอีเมลแจ้งเตือนไปยัง{' '}
                {REMINDER_RECIPIENT_EMAILS.join(', ')} ได้ทันที
              </p>

              <div className="mt-3 space-y-2">
                {urgentReminders.map(
                  ({ deliverable, project, daysRemaining }) => (
                    <div
                      key={deliverable.id}
                      className="bg-white border border-amber-200 rounded-lg px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">
                          {project.shortName ? `[${project.shortName}] ` : ''}
                          {project.name} — {deliverable.itemTitle}
                        </p>
                        <p className="text-slate-600 mt-0.5 tabular-nums">
                          กำหนดส่ง กปว.:{' '}
                          <span className="font-semibold text-amber-800">
                            {formatIsoToThaiDate(deliverable.gpvDueDate)}
                          </span>{' '}
                          ·{' '}
                          {daysRemaining < 0
                            ? `เลยกำหนด ${Math.abs(daysRemaining)} วัน`
                            : daysRemaining === 0
                              ? 'ครบกำหนดวันนี้'
                              : `อีก ${daysRemaining} วัน`}{' '}
                          · สถานะ: {DELIVERABLE_STATUS_LABELS[deliverable.status]}
                          {deliverable.reminderSentAt
                            ? ` · ส่งอีเมลแล้ว (${deliverable.reminderSentAt})`
                            : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onOpenProjectDetail(project)}
                          className="px-3 py-1.5 font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 whitespace-nowrap"
                        >
                          ดูโครงการ
                        </button>
                        <button
                          type="button"
                          disabled={isSendingReminder}
                          onClick={() =>
                            setReminderConfirmTarget({
                              deliverable,
                              project,
                              daysRemaining,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-white bg-amber-700 rounded-md hover:bg-amber-800 disabled:opacity-50 whitespace-nowrap"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          {deliverable.reminderSentAt
                            ? 'ส่งอีเมลซ้ำ'
                            : 'ส่งอีเมลแจ้งเตือน'}
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Search, Filters & Project Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-slate-200 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                ตารางข้อมูลโครงการ ({filteredRows.length} / {projects.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                คลิกที่ชื่อโครงการเพื่อดู Dashboard เฉพาะโครงการ · กด &ldquo;แก้ไข&rdquo; เพื่ออัปเดตสถานะหรือเข้าจัดการ 4 เมนูหลังอนุมัติ
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหา ปีงบ / ชื่อโครงการ / แหล่งทุน / สถานะ..."
                  className="h-10 pl-9 pr-3 w-64 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                />
              </div>

              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                aria-label="กรองตามปีงบประมาณ"
                className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 tabular-nums focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-900/20"
              >
                <option value="all">ทุกปีงบประมาณ</option>
                {availableYears.map((y) => (
                  <option key={y} value={String(y)}>
                    พ.ศ. {y}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilterValue)
                }
                aria-label="กรองตามสถานะโครงการ"
                className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-900/20"
              >
                <option value="all">ทุกสถานะโครงการ</option>
                <option value="drafting">Stage 1: จัดทำข้อเสนอโครงการ</option>
                <option value="submitted">Stage 1: ยื่นต่อแหล่งทุน</option>
                <option value="approved">Stage 2: แหล่งทุนอนุมัติ</option>
                <option value="rejected">Stage 1: แหล่งทุนไม่อนุมัติ</option>
                <option value="on_time">Stage 2: On time</option>
                <option value="extended">Stage 2: ขยายเวลา</option>
              </select>

              <select
                value={receiptFilter}
                onChange={(e) =>
                  setReceiptFilter(e.target.value as ReceiptFilterValue)
                }
                aria-label="กรองตามสถานะการรับงบประมาณ"
                className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-900/20"
              >
                <option value="all">สถานะการรับงบทั้งหมด</option>
                <option value="complete">รับงบครบถ้วน</option>
                <option value="pending">มีค้างรับ</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((r) => (
              <div key={r} className="h-14 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-12 text-center">
            <FolderOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700">
              {projects.length === 0
                ? 'ยังไม่มีโครงการในระบบ'
                : 'ไม่พบโครงการที่ตรงกับเงื่อนไขการค้นหาหรือตัวกรอง'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {projects.length === 0
                ? 'กดปุ่ม "เพิ่มโครงการ (Stage 1)" ด้านบนเพื่อเริ่มต้นบันทึกข้อเสนอโครงการ'
                : 'ลองล้างคำค้นหาหรือเปลี่ยนตัวกรองสถานะ'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3.5 px-4 w-28 whitespace-nowrap">ปีงบประมาณ</th>
                  <th className="py-3.5 px-4 min-w-[260px]">
                    ชื่อโครงการเต็ม / ชื่อย่อ
                  </th>
                  <th className="py-3.5 px-4 text-right w-40 whitespace-nowrap">
                    งบประมาณ (บาท)
                  </th>
                  <th className="py-3.5 px-4 w-44 whitespace-nowrap">
                    สถานะโครงการ
                  </th>
                  <th className="py-3.5 px-4 min-w-[200px] whitespace-nowrap">
                    สถานะการรับงบล่าสุด
                  </th>
                  <th className="py-3.5 px-4 min-w-[200px]">
                    สถานะการส่งมอบงาน
                  </th>
                  <th className="py-3.5 px-4 text-right w-40 whitespace-nowrap">
                    จัดการ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredRows.map(
                  ({
                    project,
                    torStats,
                    deliverableText,
                    statusText,
                    missingExtensionDoc,
                  }) => {
                    const isApproved = project.proposalStatus === 'approved';
                    const displayBudget = isApproved
                      ? torStats.approvedBudget
                      : project.requestedBudget;

                    return (
                      <tr key={project.id} className="hover:bg-slate-50/70">
                        <td className="py-4 px-4 align-top font-mono tabular-nums font-medium text-slate-800 whitespace-nowrap">
                          พ.ศ. {project.fiscalYear}
                        </td>

                        <td className="py-4 px-4 align-top">
                          <button
                            type="button"
                            onClick={() => onOpenProjectDetail(project)}
                            className="text-left font-medium text-slate-900 hover:text-blue-900 hover:underline leading-snug"
                          >
                            {project.shortName ? (
                              <span className="text-blue-900 font-semibold mr-1.5">
                                [{project.shortName}]
                              </span>
                            ) : null}
                            {project.name}
                          </button>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                            <span>
                              {isApproved
                                ? 'Stage 2 · อนุมัติแล้ว'
                                : `Stage 1 · ${PROPOSAL_STATUS_LABELS[project.proposalStatus]}`}
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
                                  ยื่นขอ {formatIsoToThaiDate(project.submittedDate)}
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
                                      projectId: project.id,
                                      evidenceId: project.proposalEvidenceId!,
                                      fileName:
                                        project.proposalEvidenceName ||
                                        'หนังสือยื่นข้อเสนอโครงการ',
                                    })
                                  }
                                  className="inline-flex items-center gap-1 text-blue-900 hover:underline font-medium"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  หนังสือยื่นข้อเสนอ
                                </button>
                              </>
                            )}
                          </div>
                        </td>

                        <td className="py-4 px-4 align-top text-right font-mono tabular-nums whitespace-nowrap">
                          <div className="font-semibold text-slate-900">
                            {formatCurrency(displayBudget)}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {isApproved ? 'งบอนุมัติ' : 'งบยื่นขอ'}
                          </div>
                        </td>

                        <td className="py-4 px-4 align-top">
                          <div
                            className={`text-xs font-semibold ${
                              project.proposalStatus === 'rejected'
                                ? 'text-red-700'
                                : isApproved &&
                                    project.scheduleStatus === 'extended'
                                  ? 'text-amber-700'
                                  : isApproved
                                    ? 'text-emerald-700'
                                    : 'text-blue-900'
                            }`}
                          >
                            {statusText}
                          </div>
                          {missingExtensionDoc && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              ยังไม่แนบเอกสารขยายเวลา
                            </div>
                          )}
                        </td>

                        <td className="py-4 px-4 align-top text-xs">
                          {isApproved ? (
                            <>
                              <div className="text-slate-800 font-medium">
                                {torStats.latestReceiptLabel}
                              </div>
                              <div
                                className={`mt-1 inline-flex items-center gap-1 font-medium ${
                                  torStats.isComplete
                                    ? 'text-emerald-700'
                                    : 'text-amber-700'
                                }`}
                              >
                                {torStats.isComplete ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                ) : null}
                                {torStats.isComplete
                                  ? 'รับงบครบถ้วน'
                                  : `มีค้างรับ (${formatCurrency(torStats.pendingBudget)} บาท)`}
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        <td className="py-4 px-4 align-top text-xs text-slate-700">
                          {deliverableText}
                        </td>

                        <td className="py-4 px-4 align-top text-right whitespace-nowrap">
                          {confirmDeleteId === project.id ? (
                            <div className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1">
                              <button
                                type="button"
                                disabled={deletingId === project.id}
                                onClick={() => handleConfirmDelete(project)}
                                className="px-2 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                              >
                                {deletingId === project.id ? 'ลบ...' : 'ยืนยัน'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100"
                              >
                                ยกเลิก
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onEditProject(project)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                แก้ไข
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(project.id)}
                                aria-label={`ลบโครงการ ${project.name}`}
                                className="inline-flex items-center justify-center w-8 h-8 text-red-600 bg-white border border-slate-300 rounded-lg hover:bg-red-50 hover:border-red-300 transition-colors shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Explicit Confirmation Modal before sending 20-day GPV Gmail Alert */}
      {reminderConfirmTarget && (
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
                  ยืนยันการส่งอีเมลแจ้งเตือนกำหนดส่ง กปว.
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  ระบบจะส่งอีเมลแจ้งเตือนกำหนดส่งรายงาน กปว. ผ่านบัญชี Gmail ของคุณ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReminderConfirmTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-2 text-sm text-slate-700">
              <div>
                <span className="font-medium text-slate-900">โครงการ: </span>
                {reminderConfirmTarget.project.shortName
                  ? `[${reminderConfirmTarget.project.shortName}] `
                  : ''}
                {reminderConfirmTarget.project.name}
              </div>
              <div>
                <span className="font-medium text-slate-900">รายการส่งมอบ: </span>
                {reminderConfirmTarget.deliverable.itemTitle}
              </div>
              <div>
                <span className="font-medium text-slate-900">
                  กำหนดส่ง กปว.:{' '}
                </span>
                <span className="font-semibold text-amber-800">
                  {formatIsoToThaiDate(
                    reminderConfirmTarget.deliverable.gpvDueDate
                  )}
                </span>
              </div>
              <div>
                <span className="font-medium text-slate-900">
                  ผู้รับอีเมลแจ้งเตือน:{' '}
                </span>
                <span className="font-mono text-xs text-slate-900">
                  {REMINDER_RECIPIENT_EMAILS.join(', ')}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isSendingReminder}
                onClick={() => setReminderConfirmTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSendingReminder}
                onClick={async () => {
                  const target = reminderConfirmTarget;
                  await onSendReminderEmail(target.deliverable, target.project);
                  setReminderConfirmTarget(null);
                }}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-amber-700 rounded-lg hover:bg-amber-800 disabled:opacity-60"
              >
                <Send className="w-4 h-4" />
                {isSendingReminder ? 'กำลังส่งอีเมล...' : 'ยืนยันส่งอีเมลแจ้งเตือน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewEvidence && (
        <EvidencePreviewModal
          projectId={previewEvidence.projectId}
          evidenceId={previewEvidence.evidenceId}
          fileName={previewEvidence.fileName}
          onClose={() => setPreviewEvidence(null)}
        />
      )}
    </div>
  );
};

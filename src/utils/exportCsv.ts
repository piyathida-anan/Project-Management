import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  DELIVERABLE_STATUS_LABELS,
  PROPOSAL_STATUS_LABELS,
  SCHEDULE_STATUS_LABELS,
  TOR_RECEIPT_STATUS_LABELS,
  type BudgetActivity,
  type BudgetProject,
  type BudgetWithdrawal,
  type DeliverableArtifact,
  type DeliverableStatus,
  type ProjectDeliverable,
  type ProposalStatus,
  type TorInstallmentItem,
} from '../types/budget';
import {
  computeTorBudgetStats,
  formatCurrency,
  formatIsoToThaiDate,
  formatThaiDateTime,
  getTodayIsoDate,
  round2,
  toDateObject,
} from './formatters';

function parseProposalStatus(raw: unknown): ProposalStatus {
  if (
    raw === 'drafting' ||
    raw === 'submitted' ||
    raw === 'approved' ||
    raw === 'rejected'
  ) {
    return raw;
  }
  return 'approved';
}

function escapeCsvCell(value: string | number): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toFixed(2) : '0.00';
  }
  const str = String(value ?? '');
  // Neutralize spreadsheet formula prefixes while keeping Thai text untouched
  const safeStr = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\r\n]/.test(safeStr)) {
    return `"${safeStr.replace(/"/g, '""')}"`;
  }
  return safeStr;
}

export async function exportAllProjectsToCsv(): Promise<number> {
  // 1. Fetch all projects and deliverables directly from Firestore
  let projectsSnap;
  try {
    projectsSnap = await getDocs(query(collection(db, 'projects')));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'projects');
  }

  let deliverablesSnap;
  try {
    deliverablesSnap = await getDocs(query(collection(db, 'deliverables')));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'deliverables');
  }

  const projects: BudgetProject[] = projectsSnap.docs.map((docSnap) => {
    const data = docSnap.data();
    const proposalStatus = parseProposalStatus(data.proposalStatus);
    const totalBudget = Number(data.totalBudget ?? 0);
    return {
      id: docSnap.id,
      ownerId: String(data.ownerId ?? ''),
      fiscalYear: Number(data.fiscalYear ?? 2569),
      name: String(data.name ?? ''),
      shortName: data.shortName ? String(data.shortName) : '',
      funderName: data.funderName ? String(data.funderName) : '',
      proposalStatus,
      requestedBudget: Number(data.requestedBudget ?? totalBudget),
      submittedDate: data.submittedDate ? String(data.submittedDate) : '',
      proposalEvidenceId: data.proposalEvidenceId
        ? String(data.proposalEvidenceId)
        : '',
      proposalEvidenceName: data.proposalEvidenceName
        ? String(data.proposalEvidenceName)
        : '',
      approvedBudget: Number(data.approvedBudget ?? totalBudget),
      torInstallments: Array.isArray(data.torInstallments)
        ? (data.torInstallments as TorInstallmentItem[])
        : [],
      scheduleStatus:
        data.scheduleStatus === 'extended' ? 'extended' : 'on_time',
      extensionCount: Number(data.extensionCount ?? 0),
      extensionEvidenceId: data.extensionEvidenceId
        ? String(data.extensionEvidenceId)
        : '',
      extensionEvidenceName: data.extensionEvidenceName
        ? String(data.extensionEvidenceName)
        : '',
      projectStartDate: data.projectStartDate
        ? String(data.projectStartDate)
        : '',
      projectEndDate: data.projectEndDate
        ? String(data.projectEndDate)
        : '',
      totalBudget,
      agencies: Array.isArray(data.agencies) ? data.agencies : [],
      installments: Array.isArray(data.installments) ? data.installments : [],
      preparer: String(data.preparer ?? ''),
      preparerPosition: data.preparerPosition
        ? String(data.preparerPosition)
        : '',
      reviewers: Array.isArray(data.reviewers) ? data.reviewers : [],
      reviewerItems: Array.isArray(data.reviewerItems)
        ? data.reviewerItems
        : undefined,
      approver: String(data.approver ?? ''),
      approverPosition: data.approverPosition
        ? String(data.approverPosition)
        : '',
      version: Number(data.version ?? 1),
      createdAt: data.createdAt ?? null,
      updatedAt: data.updatedAt ?? null,
    };
  });

  projects.sort(
    (a, b) =>
      toDateObject(b.updatedAt).getTime() - toDateObject(a.updatedAt).getTime()
  );

  const deliverablesByProject = new Map<string, ProjectDeliverable[]>();
  deliverablesSnap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const projectId = String(data.projectId ?? '');
    const item: ProjectDeliverable = {
      id: docSnap.id,
      projectId,
      ownerId: String(data.ownerId ?? ''),
      startDate: String(data.startDate ?? ''),
      endDate: String(data.endDate ?? ''),
      itemTitle: String(data.itemTitle ?? ''),
      artifacts: Array.isArray(data.artifacts)
        ? (data.artifacts as DeliverableArtifact[])
        : [],
      gpvDueDate: String(data.gpvDueDate ?? ''),
      pmRequestDate: String(data.pmRequestDate ?? ''),
      status: (data.status as DeliverableStatus) || 'notify_pm',
      gpvSubmittedDate: String(data.gpvSubmittedDate ?? ''),
      gpvEvidenceId: String(data.gpvEvidenceId ?? ''),
      gpvEvidenceName: String(data.gpvEvidenceName ?? ''),
      reminderSentAt: String(data.reminderSentAt ?? ''),
    };
    const arr = deliverablesByProject.get(projectId) ?? [];
    arr.push(item);
    deliverablesByProject.set(projectId, arr);
  });

  // 2. Fetch activities and withdrawals for each project cleanly
  const subDetails = await Promise.all(
    projects.map(async (project) => {
      let activities: BudgetActivity[] = [];
      let withdrawals: BudgetWithdrawal[] = [];

      try {
        const [actSnap, wdSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, 'projects', project.id, 'activities'),
              where('projectId', '==', project.id)
            )
          ),
          getDocs(
            query(
              collection(db, 'projects', project.id, 'withdrawals'),
              where('projectId', '==', project.id)
            )
          ),
        ]);

        activities = actSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            projectId: String(data.projectId ?? project.id),
            ownerId: String(data.ownerId ?? ''),
            order: Number(data.order ?? 1),
            activityName: String(data.activityName ?? ''),
            amounts:
              data.amounts && typeof data.amounts === 'object'
                ? (data.amounts as Record<string, number>)
                : {},
          };
        });

        withdrawals = wdSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            projectId: String(data.projectId ?? project.id),
            ownerId: String(data.ownerId ?? ''),
            agencyId: String(data.agencyId ?? ''),
            agencyName: String(data.agencyName ?? ''),
            agencyShortName: String(data.agencyShortName ?? ''),
            requesterName: String(data.requesterName ?? ''),
            recipientEmail: String(data.recipientEmail ?? ''),
            note: String(data.note ?? ''),
            attachmentName: String(data.attachmentName ?? ''),
            attachmentMimeType: 'application/pdf',
            attachmentDataUrl: '',
            items: Array.isArray(data.items) ? data.items : [],
            totalRequested: Number(data.totalRequested ?? 0),
            status: data.status === 'inspected' ? 'inspected' : 'pending',
            emailSent: Boolean(data.emailSent),
          };
        });
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.LIST,
          `projects/${project.id}/activities`
        );
      }

      return { projectId: project.id, activities, withdrawals };
    })
  );

  const subMap = new Map(subDetails.map((s) => [s.projectId, s]));

  // 3. Build CSV headers & rows
  const headers = [
    'รหัสโครงการ',
    'ปีงบประมาณ (พ.ศ.)',
    'ชื่อโครงการเต็ม',
    'ชื่อโครงการย่อ',
    'แหล่งทุน',
    'สถานะข้อเสนอ (Stage 1)',
    'วันที่ยื่นขอ',
    'หนังสือการยื่นข้อเสนอโครงการ',
    'งบประมาณที่ยื่นขอ (บาท)',
    'งบประมาณที่ได้รับอนุมัติ (บาท)',
    'งบประมาณที่ได้รับงบแล้ว (บาท)',
    'งบประมาณค้างรับ (บาท)',
    'สถานะการรับงบล่าสุด',
    'รายละเอียดงวดรับงบตาม TOR',
    'สถานะโครงการ (Stage 2)',
    'จำนวนครั้งขยายเวลา',
    'เอกสารอนุมัติขยายเวลา',
    'หน่วยงานที่ได้รับจัดสรรงบประมาณ',
    'งวดการจัดสรรงบประมาณ',
    'จำนวนรายการกิจกรรม',
    'ยอดรวมจัดสรรทุกกิจกรรม (บาท)',
    'จำนวนครั้งที่ขอเบิกงบประมาณ',
    'ยอดรวมขอเบิกงบประมาณ (บาท)',
    'ยอดขอเบิกที่ตรวจรับแล้ว (บาท)',
    'ระยะเวลาดำเนินงานโครงการ',
    'จำนวนรายการส่งมอบงาน กปว.',
    'สถานะการส่งมอบงานล่าสุด',
    'กำหนดส่ง กปว. ถัดไป',
    'รายละเอียดรายการส่งมอบงาน กปว.',
    'ผู้จัดทำ / ตำแหน่ง',
    'ผู้เห็นชอบ / ตำแหน่ง',
    'ผู้อนุมัติ / ตำแหน่ง',
    'อัปเดตล่าสุด',
  ];

  const rows: string[] = [headers.map(escapeCsvCell).join(',')];

  projects.forEach((project) => {
    const isApproved = project.proposalStatus === 'approved';
    const torStats = computeTorBudgetStats(project);
    const subs = subMap.get(project.id);
    const activities = subs?.activities ?? [];
    const withdrawals = subs?.withdrawals ?? [];
    const projDeliverables = (deliverablesByProject.get(project.id) ?? []).sort(
      (a, b) => (a.gpvDueDate || '').localeCompare(b.gpvDueDate || '')
    );

    const torSummary =
      project.torInstallments.length > 0
        ? project.torInstallments
            .map((t) => {
              const funderDate = t.funderReceivedDate
                ? ` รับแหล่งทุน ${formatIsoToThaiDate(t.funderReceivedDate)}`
                : '';
              const uniDate = t.universityReceivedDate
                ? ` รับม. ${formatIsoToThaiDate(t.universityReceivedDate)}`
                : '';
              return `งวดที่ ${t.order}: ${formatCurrency(t.amount)} บาท [${TOR_RECEIPT_STATUS_LABELS[t.status]}${funderDate}${uniDate}]`;
            })
            .join(' | ')
        : '-';

    const scheduleText = isApproved
      ? project.scheduleStatus === 'extended'
        ? `ขยายเวลา (ครั้งที่ ${Math.max(1, project.extensionCount)})`
        : SCHEDULE_STATUS_LABELS.on_time
      : '-';

    const agenciesText =
      project.agencies.length > 0
        ? project.agencies
            .map((ag) =>
              ag.shortName ? `${ag.name} (${ag.shortName})` : ag.name
            )
            .join(' | ')
        : '-';

    const installmentsText =
      project.installments.length > 0
        ? project.installments
            .map((inst) => `งวด ${inst.order} (${inst.percentage}%)`)
            .join(' | ')
        : '-';

    const totalAllocated = round2(
      activities.reduce(
        (sum, act) =>
          sum +
          Object.values(act.amounts ?? {}).reduce(
            (s, v) => s + (Number(v) || 0),
            0
          ),
        0
      )
    );

    const totalWithdrawn = round2(
      withdrawals.reduce((sum, w) => sum + (Number(w.totalRequested) || 0), 0)
    );
    const totalInspected = round2(
      withdrawals
        .filter((w) => w.status === 'inspected')
        .reduce((sum, w) => sum + (Number(w.totalRequested) || 0), 0)
    );

    const latestDeliverable =
      projDeliverables.length > 0
        ? projDeliverables[projDeliverables.length - 1]
        : null;
    const nextPendingDeliverable =
      projDeliverables.find((d) => d.status !== 'submitted_gpv') ?? null;

    const effectiveProjStart =
      project.projectStartDate ||
      projDeliverables.find((d) => d.startDate)?.startDate ||
      '';
    const effectiveProjEnd =
      project.projectEndDate ||
      projDeliverables.find((d) => d.endDate)?.endDate ||
      '';
    const projectPeriodText =
      effectiveProjStart && effectiveProjEnd
        ? `${formatIsoToThaiDate(effectiveProjStart)} - ${formatIsoToThaiDate(effectiveProjEnd)}`
        : '-';

    const deliverablesDetailText =
      projDeliverables.length > 0
        ? projDeliverables
            .map((d) => {
              const arts = d.artifacts
                .map((a) => `${a.name} (${a.quantity})`)
                .join(', ');
              return `${d.itemTitle} [เรียกจาก PM ${formatIsoToThaiDate(d.pmRequestDate)} | ส่ง กปว. ${formatIsoToThaiDate(d.gpvDueDate)} | ${DELIVERABLE_STATUS_LABELS[d.status]} | สิ่งส่งมอบ: ${arts}]`;
            })
            .join(' || ')
        : '-';

    const reviewersText =
      project.reviewerItems && project.reviewerItems.length > 0
        ? project.reviewerItems
            .map((r) => (r.position ? `${r.name} (${r.position})` : r.name))
            .join(' | ')
        : project.reviewers.join(' | ');

    const preparerText = project.preparerPosition
      ? `${project.preparer} (${project.preparerPosition})`
      : project.preparer;
    const approverText = project.approverPosition
      ? `${project.approver} (${project.approverPosition})`
      : project.approver;

    const rowValues: Array<string | number> = [
      project.id,
      String(project.fiscalYear),
      project.name,
      project.shortName || '-',
      project.funderName || '-',
      PROPOSAL_STATUS_LABELS[project.proposalStatus],
      project.submittedDate ? formatIsoToThaiDate(project.submittedDate) : '-',
      project.proposalEvidenceName || '-',
      project.requestedBudget,
      isApproved ? torStats.approvedBudget : 0,
      isApproved ? torStats.receivedBudget : 0,
      isApproved ? torStats.pendingBudget : 0,
      isApproved ? torStats.latestReceiptLabel : '-',
      isApproved ? torSummary : '-',
      scheduleText,
      isApproved && project.scheduleStatus === 'extended'
        ? String(Math.max(1, project.extensionCount))
        : '0',
      project.extensionEvidenceName || '-',
      agenciesText,
      installmentsText,
      String(activities.length),
      totalAllocated,
      String(withdrawals.length),
      totalWithdrawn,
      totalInspected,
      projectPeriodText,
      String(projDeliverables.length),
      latestDeliverable
        ? `${latestDeliverable.itemTitle} (${DELIVERABLE_STATUS_LABELS[latestDeliverable.status]})`
        : '-',
      nextPendingDeliverable
        ? formatIsoToThaiDate(nextPendingDeliverable.gpvDueDate)
        : '-',
      deliverablesDetailText,
      preparerText || '-',
      reviewersText || '-',
      approverText || '-',
      formatThaiDateTime(project.updatedAt),
    ];

    rows.push(rowValues.map(escapeCsvCell).join(','));
  });

  // 4. Encode as UTF-8 with BOM (\uFEFF) and trigger download
  const csvContent = '\uFEFF' + rows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `projects_export_${getTodayIsoDate()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  return projects.length;
}

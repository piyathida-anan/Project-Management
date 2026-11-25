import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CalendarClock,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  DEFAULT_ALLOCATION_PERSONNEL,
  DELIVERABLE_STATUS_LABELS,
  FIELD_LIMITS,
  PRESET_AGENCIES,
  REMINDER_RECIPIENT_EMAILS,
  SCHEDULE_STATUS_LABELS,
  TOR_RECEIPT_STATUS_LABELS,
  type AgencyItem,
  type BudgetProject,
  type DeliverableArtifact,
  type DeliverableStatus,
  type ProjectDeliverable,
  type ProjectScheduleStatus,
  type ReviewerItem,
  type TorInstallmentItem,
  type TorReceiptStatus,
} from '../types/budget';
import {
  daysUntilIsoDate,
  formatBudgetWithCaret,
  formatCurrency,
  formatIsoToThaiDate,
  generateSafeId,
  getTodayIsoDate,
  parseBudgetNumber,
  round2,
} from '../utils/formatters';
import { uploadProjectEvidence } from '../utils/evidenceService';
import { EvidencePreviewModal } from './EvidencePreviewModal';
import {
  ThaiDatePopupInput,
  ThaiDateRangePopupInput,
} from './ThaiDatePicker';
import type { Stage2MenuTab } from './ProjectDetailDashboard';

interface Stage2EditWorkspaceProps {
  project: BudgetProject;
  deliverables: ProjectDeliverable[];
  initialTab: Stage2MenuTab;
  currentUserId: string;
  isSavingProject: boolean;
  isSavingDeliverable: boolean;
  isSendingReminder: boolean;
  onBackHome: () => void;
  onOpenDetail: () => void;
  onSaveTorReceipts: (payload: {
    approvedBudget: number;
    torInstallments: TorInstallmentItem[];
  }) => Promise<void>;
  onSaveAllocationSetup: (payload: {
    totalBudget: number;
    agencies: AgencyItem[];
    installments: Array<{ id: string; order: number; percentage: number }>;
    preparer: string;
    preparerPosition: string;
    reviewers: string[];
    reviewerItems: ReviewerItem[];
    approver: string;
    approverPosition: string;
  }) => Promise<void>;
  onSaveProjectPeriod: (payload: {
    projectStartDate: string;
    projectEndDate: string;
  }) => Promise<void>;
  onSaveDeliverablesBatch: (payload: {
    projectStartDate: string;
    projectEndDate: string;
    items: Array<{
      id?: string;
      itemTitle: string;
      artifacts: DeliverableArtifact[];
      gpvDueDate: string;
      pmRequestDate: string;
      status: DeliverableStatus;
      gpvSubmittedDate: string;
      gpvEvidenceId: string;
      gpvEvidenceName: string;
    }>;
  }) => Promise<void>;
  onDeleteDeliverable: (deliverable: ProjectDeliverable) => Promise<void>;
  onSaveScheduleStatus: (payload: {
    scheduleStatus: ProjectScheduleStatus;
    extensionCount: number;
    extensionEvidenceId: string;
    extensionEvidenceName: string;
  }) => Promise<void>;
  onOpenPdfOnly: () => void;
  onOpenWithdraw: () => void;
  onOpenStage1MetaEdit: () => void;
  onSendReminderEmail: (
    deliverable: ProjectDeliverable,
    project: BudgetProject
  ) => Promise<void>;
}

interface DraftDeliverableItem {
  localKey: string;
  id?: string;
  itemTitle: string;
  artifacts: DeliverableArtifact[];
  gpvDueDate: string;
  pmRequestDate: string;
  status: DeliverableStatus;
  gpvSubmittedDate: string;
  gpvEvidenceId: string;
  gpvEvidenceName: string;
}

function createEmptyDraftDeliverable(): DraftDeliverableItem {
  return {
    localKey: generateSafeId('draftdel'),
    itemTitle: '',
    artifacts: [{ id: generateSafeId('art'), name: '', quantity: '1' }],
    gpvDueDate: '',
    pmRequestDate: '',
    status: 'notify_pm',
    gpvSubmittedDate: '',
    gpvEvidenceId: '',
    gpvEvidenceName: '',
  };
}

const DELIVERABLE_STATUS_LIST: DeliverableStatus[] = [
  'notify_pm',
  'following_pm',
  'preparing_report',
  'submitted_gpv',
];

const TOR_STATUS_LIST: TorReceiptStatus[] = [
  'waiting',
  'received_from_funder',
  'received_from_university',
];

function detectPresetCode(agency: AgencyItem): string {
  const byName = PRESET_AGENCIES.find((p) => p.name === agency.name);
  if (byName) return byName.code;
  const byCode = PRESET_AGENCIES.find((p) => p.code === agency.shortName);
  if (byCode) return byCode.code;
  return 'OTHER';
}

function extractReadableSaveError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const msg = err.message || fallback;
  try {
    const parsed = JSON.parse(msg) as { error?: string };
    if (parsed && typeof parsed.error === 'string') {
      if (parsed.error.includes('Missing or insufficient permissions')) {
        return 'ไม่มีสิทธิ์หรือข้อมูลไม่ตรงเงื่อนไขความปลอดภัยในการบันทึก กรุณาตรวจสอบค่าที่กรอกแล้วลองใหม่อีกครั้ง';
      }
      if (parsed.error.includes('Quota exceeded')) {
        return 'โควตาการใช้งานฐานข้อมูลรายวันเต็มแล้ว กรุณาลองใหม่ในวันถัดไป';
      }
      return `${fallback}: ${parsed.error}`;
    }
  } catch {
    // Plain error message
  }
  return msg || fallback;
}

export const Stage2EditWorkspace: React.FC<Stage2EditWorkspaceProps> = ({
  project,
  deliverables,
  initialTab,
  currentUserId,
  isSavingProject,
  isSavingDeliverable,
  isSendingReminder,
  onBackHome,
  onOpenDetail,
  onSaveTorReceipts,
  onSaveAllocationSetup,
  onSaveProjectPeriod,
  onSaveDeliverablesBatch,
  onDeleteDeliverable,
  onSaveScheduleStatus,
  onOpenPdfOnly,
  onOpenWithdraw,
  onOpenStage1MetaEdit,
  onSendReminderEmail,
}) => {
  const [activeTab, setActiveTab] = useState<Stage2MenuTab>(initialTab);
  const [previewEvidence, setPreviewEvidence] = useState<{
    evidenceId: string;
    fileName: string;
  } | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // =========================================================================
  // MENU 1: การรับงบประมาณ (TOR Budget Receipts)
  // =========================================================================
  const [approvedBudgetStr, setApprovedBudgetStr] = useState<string>(() =>
    formatCurrency(
      project.approvedBudget > 0 ? project.approvedBudget : project.totalBudget
    )
  );
  const [torRows, setTorRows] = useState<
    Array<TorInstallmentItem & { amountStr: string }>
  >(() =>
    (project.torInstallments ?? []).map((item, idx) => ({
      ...item,
      order: idx + 1,
      amountStr: formatCurrency(item.amount),
    }))
  );
  const [torError, setTorError] = useState<string | null>(null);
  const [torSavedMessage, setTorSavedMessage] = useState<string | null>(null);

  const torSnapshotKey = useMemo(
    () =>
      JSON.stringify({
        id: project.id,
        approvedBudget: project.approvedBudget,
        totalBudget: project.totalBudget,
        torInstallments: project.torInstallments ?? [],
      }),
    [
      project.id,
      project.approvedBudget,
      project.totalBudget,
      project.torInstallments,
    ]
  );

  useEffect(() => {
    const parsed = JSON.parse(torSnapshotKey) as {
      approvedBudget: number;
      totalBudget: number;
      torInstallments: TorInstallmentItem[];
    };
    const base =
      parsed.approvedBudget > 0 ? parsed.approvedBudget : parsed.totalBudget;
    setApprovedBudgetStr(formatCurrency(base));
    setTorRows(
      (parsed.torInstallments ?? []).map((item, idx) => ({
        ...item,
        order: idx + 1,
        amountStr: formatCurrency(item.amount),
      }))
    );
    setTorError(null);
    setTorSavedMessage(null);
  }, [torSnapshotKey]);

  const approvedBudgetNum = parseBudgetNumber(approvedBudgetStr);
  const torSum = round2(
    torRows.reduce((sum, r) => sum + parseBudgetNumber(r.amountStr), 0)
  );
  const torRemaining = round2(approvedBudgetNum - torSum);
  const isTorOverApproved = torRemaining < -0.005;

  const handleAddTorRow = () => {
    if (torRows.length >= FIELD_LIMITS.MAX_TOR_INSTALLMENTS) return;
    setTorSavedMessage(null);
    setTorRows((prev) => [
      ...prev,
      {
        id: generateSafeId('tor'),
        order: prev.length + 1,
        amount: 0,
        amountStr: '',
        status: 'waiting',
        funderReceivedDate: '',
        funderEvidenceId: '',
        funderEvidenceName: '',
        universityReceivedDate: '',
        universityEvidenceId: '',
        universityEvidenceName: '',
      },
    ]);
  };

  const handleRemoveTorRow = (idx: number) => {
    setTorSavedMessage(null);
    setTorRows((prev) =>
      prev
        .filter((_, i) => i !== idx)
        .map((item, i) => ({ ...item, order: i + 1 }))
    );
  };

  const handleUploadTorEvidence = async (
    rowIndex: number,
    type: 'funder' | 'university',
    file: File
  ) => {
    setTorError(null);
    setTorSavedMessage(null);
    const key = `tor_${rowIndex}_${type}`;
    setUploadingKey(key);
    try {
      const uploaded = await uploadProjectEvidence({
        projectId: project.id,
        ownerId: currentUserId,
        category: type === 'funder' ? 'tor_funder' : 'tor_university',
        file,
      });
      setTorRows((prev) =>
        prev.map((r, i) => {
          if (i !== rowIndex) return r;
          if (type === 'funder') {
            return {
              ...r,
              funderEvidenceId: uploaded.evidenceId,
              funderEvidenceName: uploaded.fileName,
            };
          }
          return {
            ...r,
            universityEvidenceId: uploaded.evidenceId,
            universityEvidenceName: uploaded.fileName,
          };
        })
      );
    } catch (err) {
      setTorError(
        err instanceof Error ? err.message : 'ไม่สามารถอัพโหลดหลักฐานได้'
      );
    } finally {
      setUploadingKey(null);
    }
  };

  const handleSubmitTor = async (e: React.FormEvent) => {
    e.preventDefault();
    setTorError(null);
    setTorSavedMessage(null);
    if (approvedBudgetNum <= 0) {
      setTorError('กรุณากรอกงบประมาณที่ได้รับอนุมัติให้มากกว่า 0');
      return;
    }
    if (approvedBudgetNum > FIELD_LIMITS.MAX_BUDGET) {
      setTorError('งบประมาณที่ได้รับอนุมัติเกินขอบเขตที่ระบบกำหนด');
      return;
    }
    if (isTorOverApproved) {
      setTorError(
        `ยอดรวมทุกงวด (${formatCurrency(torSum)} บาท) เกินงบประมาณที่ได้รับอนุมัติ (${formatCurrency(approvedBudgetNum)} บาท)`
      );
      return;
    }

    const cleanedInstallments: TorInstallmentItem[] = torRows.map((r, idx) => ({
      id: r.id,
      order: idx + 1,
      amount: parseBudgetNumber(r.amountStr),
      status: r.status,
      funderReceivedDate: r.funderReceivedDate ?? '',
      funderEvidenceId: r.funderEvidenceId ?? '',
      funderEvidenceName: r.funderEvidenceName ?? '',
      universityReceivedDate: r.universityReceivedDate ?? '',
      universityEvidenceId: r.universityEvidenceId ?? '',
      universityEvidenceName: r.universityEvidenceName ?? '',
    }));

    if (cleanedInstallments.some((r) => r.amount <= 0)) {
      setTorError('กรุณากรอกยอดเงินของแต่ละงวดให้มากกว่า 0');
      return;
    }

    try {
      await onSaveTorReceipts({
        approvedBudget: approvedBudgetNum,
        torInstallments: cleanedInstallments,
      });
      setApprovedBudgetStr(formatCurrency(approvedBudgetNum));
      setTorSavedMessage(
        `บันทึกงบประมาณที่ได้รับอนุมัติ ${formatCurrency(approvedBudgetNum)} บาท และงวดรับงบประมาณ ${cleanedInstallments.length} งวด เรียบร้อยแล้ว`
      );
    } catch (err) {
      setTorError(
        extractReadableSaveError(err, 'ไม่สามารถบันทึกข้อมูลการรับงบประมาณได้')
      );
    }
  };

  // =========================================================================
  // MENU 2: การจัดสรรงบประมาณ (Allocation Setup -> AllocationEditor)
  // =========================================================================
  const [allocAgencies, setAllocAgencies] = useState<
    Array<{ id: string; presetCode: string; name: string; shortName: string }>
  >(() =>
    (project.agencies.length > 0
      ? project.agencies
      : [
          {
            id: generateSafeId('ag'),
            name: PRESET_AGENCIES[0].name,
            shortName: PRESET_AGENCIES[0].code,
          },
        ]
    ).map((ag) => ({
      id: ag.id,
      presetCode: detectPresetCode(ag),
      name: ag.name,
      shortName: ag.shortName ?? '',
    }))
  );
  const [allocInstallments, setAllocInstallments] = useState<
    Array<{ id: string; order: number; percentage: string }>
  >(() =>
    (project.installments.length > 0
      ? project.installments
      : [{ id: generateSafeId('inst'), order: 1, percentage: 100 }]
    ).map((inst, idx) => ({
      id: inst.id,
      order: idx + 1,
      percentage: String(inst.percentage),
    }))
  );
  const [preparer, setPreparer] = useState<string>(
    () => project.preparer || DEFAULT_ALLOCATION_PERSONNEL.preparer
  );
  const [preparerPosition, setPreparerPosition] = useState<string>(
    () =>
      project.preparerPosition || DEFAULT_ALLOCATION_PERSONNEL.preparerPosition
  );
  const [reviewerItems, setReviewerItems] = useState<ReviewerItem[]>(() =>
    project.reviewerItems && project.reviewerItems.length > 0
      ? project.reviewerItems.map((r) => ({
          name: r.name,
          position: r.position ?? '',
        }))
      : project.reviewers && project.reviewers.length > 0
        ? project.reviewers.map((name) => ({ name, position: '' }))
        : DEFAULT_ALLOCATION_PERSONNEL.reviewerItems.map((r) => ({ ...r }))
  );
  const [approver, setApprover] = useState<string>(
    () => project.approver || DEFAULT_ALLOCATION_PERSONNEL.approver
  );
  const [approverPosition, setApproverPosition] = useState<string>(
    () =>
      project.approverPosition || DEFAULT_ALLOCATION_PERSONNEL.approverPosition
  );
  const [allocError, setAllocError] = useState<string | null>(null);

  const allocSnapshotKey = useMemo(
    () =>
      JSON.stringify({
        id: project.id,
        agencies: project.agencies,
        installments: project.installments,
        preparer: project.preparer,
        preparerPosition: project.preparerPosition ?? '',
        reviewerItems: project.reviewerItems ?? null,
        reviewers: project.reviewers,
        approver: project.approver,
        approverPosition: project.approverPosition ?? '',
      }),
    [
      project.id,
      project.agencies,
      project.installments,
      project.preparer,
      project.preparerPosition,
      project.reviewerItems,
      project.reviewers,
      project.approver,
      project.approverPosition,
    ]
  );

  useEffect(() => {
    setAllocAgencies(
      (project.agencies.length > 0
        ? project.agencies
        : [
            {
              id: generateSafeId('ag'),
              name: PRESET_AGENCIES[0].name,
              shortName: PRESET_AGENCIES[0].code,
            },
          ]
      ).map((ag) => ({
        id: ag.id,
        presetCode: detectPresetCode(ag),
        name: ag.name,
        shortName: ag.shortName ?? '',
      }))
    );
    setAllocInstallments(
      (project.installments.length > 0
        ? project.installments
        : [{ id: generateSafeId('inst'), order: 1, percentage: 100 }]
      ).map((inst, idx) => ({
        id: inst.id,
        order: idx + 1,
        percentage: String(inst.percentage),
      }))
    );
    setPreparer(project.preparer || DEFAULT_ALLOCATION_PERSONNEL.preparer);
    setPreparerPosition(
      project.preparerPosition || DEFAULT_ALLOCATION_PERSONNEL.preparerPosition
    );
    setReviewerItems(
      project.reviewerItems && project.reviewerItems.length > 0
        ? project.reviewerItems.map((r) => ({
            name: r.name,
            position: r.position ?? '',
          }))
        : DEFAULT_ALLOCATION_PERSONNEL.reviewerItems.map((r) => ({ ...r }))
    );
    setApprover(project.approver || DEFAULT_ALLOCATION_PERSONNEL.approver);
    setApproverPosition(
      project.approverPosition || DEFAULT_ALLOCATION_PERSONNEL.approverPosition
    );
    setAllocError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocSnapshotKey]);

  const allocPctSum = round2(
    allocInstallments.reduce((sum, item) => {
      const n = Number(item.percentage);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0)
  );

  const handleAgencyPresetChange = (index: number, code: string) => {
    setAllocAgencies((prev) =>
      prev.map((ag, i) => {
        if (i !== index) return ag;
        if (code === 'OTHER') {
          return {
            ...ag,
            presetCode: 'OTHER',
            name: PRESET_AGENCIES.some((p) => p.name === ag.name) ? '' : ag.name,
            shortName: PRESET_AGENCIES.some((p) => p.code === ag.shortName)
              ? ''
              : ag.shortName,
          };
        }
        const preset = PRESET_AGENCIES.find((p) => p.code === code);
        return {
          ...ag,
          presetCode: code,
          name: preset ? preset.name : ag.name,
          shortName: preset ? preset.code : ag.shortName,
        };
      })
    );
  };

  const handleSubmitAllocationSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAllocError(null);

    const cleanedAgencies: AgencyItem[] = allocAgencies.map((ag) => ({
      id: ag.id,
      name: ag.name.trim(),
      shortName: ag.shortName.trim(),
    }));
    if (cleanedAgencies.some((ag) => !ag.name)) {
      setAllocError('กรุณาเลือกหรือกรอกชื่อหน่วยงานที่ได้รับจัดสรรให้ครบทุกแถว');
      return;
    }

    const cleanedInst = allocInstallments.map((inst, idx) => ({
      id: inst.id,
      order: idx + 1,
      percentage: round2(Number(inst.percentage)),
    }));
    if (
      cleanedInst.some(
        (inst) =>
          !Number.isFinite(inst.percentage) ||
          inst.percentage <= 0 ||
          inst.percentage > 100
      )
    ) {
      setAllocError('กรุณากรอกเปอร์เซ็นต์งวดจัดสรรให้ถูกต้อง (มากกว่า 0 และไม่เกิน 100)');
      return;
    }
    if (Math.abs(allocPctSum - 100) > 0.01) {
      setAllocError(
        `ผลรวมเปอร์เซ็นต์งวดจัดสรรต้องเท่ากับ 100% (ปัจจุบันรวมได้ ${allocPctSum}%)`
      );
      return;
    }

    if (!preparer.trim()) {
      setAllocError('กรุณากรอกชื่อ-สกุล ผู้จัดทำ');
      return;
    }
    const cleanReviewers = reviewerItems.map((r) => ({
      name: r.name.trim(),
      position: r.position.trim(),
    }));
    if (cleanReviewers.length === 0 || cleanReviewers.some((r) => !r.name)) {
      setAllocError('กรุณากรอกชื่อผู้เห็นชอบให้ครบทุกแถว');
      return;
    }
    if (!approver.trim()) {
      setAllocError('กรุณากรอกชื่อ-สกุล ผู้อนุมัติ');
      return;
    }

    const effectiveBudget =
      project.approvedBudget > 0 ? project.approvedBudget : project.totalBudget;

    try {
      await onSaveAllocationSetup({
        totalBudget: effectiveBudget,
        agencies: cleanedAgencies,
        installments: cleanedInst,
        preparer: preparer.trim(),
        preparerPosition: preparerPosition.trim(),
        reviewers: cleanReviewers.map((r) => r.name),
        reviewerItems: cleanReviewers,
        approver: approver.trim(),
        approverPosition: approverPosition.trim(),
      });
    } catch (err) {
      setAllocError(
        extractReadableSaveError(err, 'ไม่สามารถบันทึกข้อมูลการจัดสรรได้')
      );
    }
  };

  // =========================================================================
  // MENU 3: การส่งมอบงาน (Deliverables + ระยะเวลาดำเนินงานรวมทั้งโครงการ)
  // =========================================================================
  const fallbackStart =
    project.projectStartDate ||
    deliverables.find((d) => d.startDate)?.startDate ||
    '';
  const fallbackEnd =
    project.projectEndDate ||
    deliverables.find((d) => d.endDate)?.endDate ||
    '';

  const [projStartDate, setProjStartDate] = useState<string>(fallbackStart);
  const [projEndDate, setProjEndDate] = useState<string>(fallbackEnd);
  const [periodError, setPeriodError] = useState<string | null>(null);

  useEffect(() => {
    setProjStartDate(
      project.projectStartDate ||
        deliverables.find((d) => d.startDate)?.startDate ||
        ''
    );
    setProjEndDate(
      project.projectEndDate ||
        deliverables.find((d) => d.endDate)?.endDate ||
        ''
    );
    setPeriodError(null);
  }, [project.id, project.projectStartDate, project.projectEndDate, deliverables]);

  const [editingDeliverableId, setEditingDeliverableId] = useState<
    string | null
  >(null);
  const [draftDeliverables, setDraftDeliverables] = useState<
    DraftDeliverableItem[]
  >(() => [createEmptyDraftDeliverable()]);
  const [delError, setDelError] = useState<string | null>(null);
  const [confirmDeleteDelId, setConfirmDeleteDelId] = useState<string | null>(
    null
  );
  const [reminderConfirmTarget, setReminderConfirmTarget] =
    useState<ProjectDeliverable | null>(null);

  const resetDeliverableForm = () => {
    setEditingDeliverableId(null);
    setDraftDeliverables([createEmptyDraftDeliverable()]);
    setDelError(null);
  };

  const handleEditDeliverable = (d: ProjectDeliverable) => {
    setEditingDeliverableId(d.id);
    setDraftDeliverables([
      {
        localKey: d.id,
        id: d.id,
        itemTitle: d.itemTitle,
        artifacts:
          d.artifacts.length > 0
            ? d.artifacts.map((a) => ({ ...a }))
            : [{ id: generateSafeId('art'), name: '', quantity: '1' }],
        gpvDueDate: d.gpvDueDate,
        pmRequestDate: d.pmRequestDate,
        status: d.status,
        gpvSubmittedDate: d.gpvSubmittedDate || '',
        gpvEvidenceId: d.gpvEvidenceId || '',
        gpvEvidenceName: d.gpvEvidenceName || '',
      },
    ]);
    setDelError(null);
  };

  const updateDraftItem = (
    localKey: string,
    updater: (item: DraftDeliverableItem) => DraftDeliverableItem
  ) => {
    setDraftDeliverables((prev) =>
      prev.map((item) => (item.localKey === localKey ? updater(item) : item))
    );
  };

  const handleUploadGpvEvidence = async (localKey: string, file: File) => {
    setDelError(null);
    const key = `gpv_submit_${localKey}`;
    setUploadingKey(key);
    try {
      const uploaded = await uploadProjectEvidence({
        projectId: project.id,
        ownerId: currentUserId,
        category: 'gpv_submit',
        file,
      });
      updateDraftItem(localKey, (item) => ({
        ...item,
        gpvEvidenceId: uploaded.evidenceId,
        gpvEvidenceName: uploaded.fileName,
      }));
    } catch (err) {
      setDelError(
        err instanceof Error ? err.message : 'ไม่สามารถอัพโหลดเอกสารนำส่งได้'
      );
    } finally {
      setUploadingKey(null);
    }
  };

  const handleSavePeriodSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPeriodError(null);
    if (!projStartDate || !projEndDate) {
      setPeriodError(
        'กรุณาเลือกระยะเวลาการดำเนินงานรวมของทั้งโครงการ (วันเริ่มต้น - วันสิ้นสุด)'
      );
      return;
    }
    try {
      await onSaveProjectPeriod({
        projectStartDate: projStartDate,
        projectEndDate: projEndDate,
      });
    } catch (err) {
      setPeriodError(
        extractReadableSaveError(err, 'ไม่สามารถบันทึกระยะเวลาโครงการได้')
      );
    }
  };

  const handleSubmitDeliverables = async (e: React.FormEvent) => {
    e.preventDefault();
    setDelError(null);

    if (!projStartDate || !projEndDate) {
      setDelError(
        'กรุณาเลือกระยะเวลาการดำเนินงานรวมของทั้งโครงการ (วันเริ่มต้น - วันสิ้นสุด) ในกล่องด้านบน'
      );
      return;
    }

    const cleanedItems: Array<{
      id?: string;
      itemTitle: string;
      artifacts: DeliverableArtifact[];
      gpvDueDate: string;
      pmRequestDate: string;
      status: DeliverableStatus;
      gpvSubmittedDate: string;
      gpvEvidenceId: string;
      gpvEvidenceName: string;
    }> = [];

    for (let i = 0; i < draftDeliverables.length; i += 1) {
      const item = draftDeliverables[i];
      const numLabel = editingDeliverableId ? '' : `รายการที่ ${i + 1}: `;
      if (!item.itemTitle.trim()) {
        setDelError(`${numLabel}กรุณากรอกชื่อรายการส่งมอบ`);
        return;
      }
      const cleanArtifacts = item.artifacts.map((a) => ({
        id: a.id,
        name: a.name.trim(),
        quantity: a.quantity.trim() || '1',
      }));
      if (cleanArtifacts.some((a) => !a.name)) {
        setDelError(`${numLabel}กรุณากรอกรายละเอียดสิ่งส่งมอบให้ครบทุกแถว`);
        return;
      }
      if (!item.gpvDueDate) {
        setDelError(`${numLabel}กรุณาเลือกกำหนดส่ง กปว. จากปฏิทิน`);
        return;
      }
      if (!item.pmRequestDate) {
        setDelError(`${numLabel}กรุณาเลือกกำหนดเรียกรายงานจาก PM จากปฏิทิน`);
        return;
      }
      if (item.status === 'submitted_gpv' && !item.gpvSubmittedDate) {
        setDelError(`${numLabel}กรุณาระบุวันที่นำส่ง กปว.`);
        return;
      }

      cleanedItems.push({
        id: item.id,
        itemTitle: item.itemTitle
          .trim()
          .slice(0, FIELD_LIMITS.DELIVERABLE_TITLE_MAX),
        artifacts: cleanArtifacts,
        gpvDueDate: item.gpvDueDate,
        pmRequestDate: item.pmRequestDate,
        status: item.status,
        gpvSubmittedDate:
          item.status === 'submitted_gpv' ? item.gpvSubmittedDate : '',
        gpvEvidenceId:
          item.status === 'submitted_gpv' ? item.gpvEvidenceId : '',
        gpvEvidenceName:
          item.status === 'submitted_gpv' ? item.gpvEvidenceName : '',
      });
    }

    try {
      await onSaveDeliverablesBatch({
        projectStartDate: projStartDate,
        projectEndDate: projEndDate,
        items: cleanedItems,
      });

      resetDeliverableForm();
    } catch (err) {
      setDelError(
        extractReadableSaveError(err, 'ไม่สามารถบันทึกรายการส่งมอบงานได้')
      );
    }
  };

  const sortedDeliverables = useMemo(() => {
    return [...deliverables].sort((a, b) =>
      (a.gpvDueDate || '').localeCompare(b.gpvDueDate || '')
    );
  }, [deliverables]);

  // =========================================================================
  // MENU 4: สถานะโครงการ (On time / ขยายเวลา)
  // =========================================================================
  const [scheduleStatus, setScheduleStatus] = useState<ProjectScheduleStatus>(
    () => project.scheduleStatus ?? 'on_time'
  );
  const [extensionCountStr, setExtensionCountStr] = useState<string>(() =>
    String(project.extensionCount > 0 ? project.extensionCount : 1)
  );
  const [extensionEvidenceId, setExtensionEvidenceId] = useState<string>(
    () => project.extensionEvidenceId ?? ''
  );
  const [extensionEvidenceName, setExtensionEvidenceName] = useState<string>(
    () => project.extensionEvidenceName ?? ''
  );
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const scheduleSnapshotKey = useMemo(
    () =>
      JSON.stringify({
        id: project.id,
        scheduleStatus: project.scheduleStatus ?? 'on_time',
        extensionCount: project.extensionCount ?? 0,
        extensionEvidenceId: project.extensionEvidenceId ?? '',
        extensionEvidenceName: project.extensionEvidenceName ?? '',
      }),
    [
      project.id,
      project.scheduleStatus,
      project.extensionCount,
      project.extensionEvidenceId,
      project.extensionEvidenceName,
    ]
  );

  useEffect(() => {
    setScheduleStatus(project.scheduleStatus ?? 'on_time');
    setExtensionCountStr(
      String(project.extensionCount > 0 ? project.extensionCount : 1)
    );
    setExtensionEvidenceId(project.extensionEvidenceId ?? '');
    setExtensionEvidenceName(project.extensionEvidenceName ?? '');
    setScheduleError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleSnapshotKey]);

  const handleUploadExtensionDoc = async (file: File) => {
    setScheduleError(null);
    setUploadingKey('extension_doc');
    try {
      const uploaded = await uploadProjectEvidence({
        projectId: project.id,
        ownerId: currentUserId,
        category: 'extension',
        file,
      });
      setExtensionEvidenceId(uploaded.evidenceId);
      setExtensionEvidenceName(uploaded.fileName);
    } catch (err) {
      setScheduleError(
        err instanceof Error ? err.message : 'ไม่สามารถอัพโหลดเอกสารได้'
      );
    } finally {
      setUploadingKey(null);
    }
  };

  const handleSubmitScheduleStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setScheduleError(null);

    const extCount =
      scheduleStatus === 'extended'
        ? Math.max(1, Math.floor(Number(extensionCountStr) || 1))
        : 0;

    try {
      await onSaveScheduleStatus({
        scheduleStatus,
        extensionCount: extCount,
        extensionEvidenceId:
          scheduleStatus === 'extended' ? extensionEvidenceId : '',
        extensionEvidenceName:
          scheduleStatus === 'extended' ? extensionEvidenceName : '',
      });
    } catch (err) {
      setScheduleError(
        extractReadableSaveError(err, 'ไม่สามารถบันทึกสถานะระยะเวลาโครงการได้')
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Workspace Header + 4-Menu Navigation */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={onBackHome}
              className="mt-0.5 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              กลับหน้าหลัก
            </button>

            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                จัดการโครงการ (Stage 2 · โครงการอนุมัติแล้ว)
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                {project.shortName ? (
                  <span className="font-semibold text-blue-900 mr-1.5">
                    [{project.shortName}]
                  </span>
                ) : null}
                {project.name} · ปีงบประมาณ พ.ศ. {project.fiscalYear}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenDetail}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              ดู Dashboard โครงการ
            </button>
            <button
              type="button"
              onClick={onOpenStage1MetaEdit}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              แก้ไขข้อมูลหลัก / งบอนุมัติ
            </button>
            <button
              type="button"
              onClick={onOpenWithdraw}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 whitespace-nowrap"
            >
              <Banknote className="w-3.5 h-3.5" />
              ขอเบิกงบ / ตรวจรับ
            </button>
          </div>
        </div>

        {/* 4 Menus Segmented Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-5">
          {[
            { id: 'tor_receipts', label: '1. การรับงบประมาณ (TOR)' },
            { id: 'allocation_setup', label: '2. การจัดสรรงบประมาณ' },
            {
              id: 'deliverables',
              label: `3. การส่งมอบงาน (${deliverables.length})`,
            },
            { id: 'schedule_status', label: '4. สถานะโครงการ' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as Stage2MenuTab)}
                className={`px-4 py-2.5 text-sm font-medium rounded-lg border text-center transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-900 text-white border-blue-900'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* ===================================================================== */}
      {/* TAB 1: การรับงบประมาณ (TOR)                                            */}
      {/* ===================================================================== */}
      {activeTab === 'tor_receipts' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8">
          <div className="pb-4 mb-6 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">
              1. บันทึกการรับงบประมาณจากแหล่งทุน ตาม TOR
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              ระบุงบประมาณที่ได้รับอนุมัติ เพิ่มงวดรับเงิน และอัปเดตสถานะการรับงบจากแหล่งทุนและมหาวิทยาลัยพร้อมแนบหลักฐาน
            </p>
          </div>

          {torError && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{torError}</span>
            </div>
          )}

          <form onSubmit={handleSubmitTor} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div>
                <label
                  htmlFor="approvedBudgetInput"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  งบประมาณที่ได้รับอนุมัติ (บาท)
                </label>
                <div className="relative">
                  <input
                    id="approvedBudgetInput"
                    type="text"
                    inputMode="decimal"
                    value={approvedBudgetStr}
                    onChange={(e) => {
                      const formatted = formatBudgetWithCaret(e.currentTarget);
                      setApprovedBudgetStr(formatted);
                      setTorSavedMessage(null);
                    }}
                    onBlur={() => {
                      if (!approvedBudgetStr.trim()) return;
                      setApprovedBudgetStr(
                        formatCurrency(parseBudgetNumber(approvedBudgetStr))
                      );
                    }}
                    className="w-full h-10 pl-3 pr-14 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
                    บาท
                  </span>
                </div>
                {project.requestedBudget > 0 && (
                  <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                    งบที่ยื่นขอ (Stage 1):{' '}
                    {formatCurrency(project.requestedBudget)} บาท
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs text-slate-500">ยอดรวมงวด TOR ที่กำหนด</p>
                <p
                  className={`text-lg font-bold font-mono tabular-nums mt-1 ${
                    isTorOverApproved ? 'text-red-600' : 'text-blue-900'
                  }`}
                >
                  {formatCurrency(torSum)} บาท
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">
                  {isTorOverApproved
                    ? 'เกินงบประมาณอนุมัติ'
                    : 'คงเหลือจากงบประมาณอนุมัติ'}
                </p>
                <p
                  className={`text-lg font-bold font-mono tabular-nums mt-1 ${
                    isTorOverApproved
                      ? 'text-red-600'
                      : Math.abs(torRemaining) < 0.01
                        ? 'text-emerald-700'
                        : 'text-slate-800'
                  }`}
                >
                  {formatCurrency(torRemaining)} บาท
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900">
                รายการงวดรับงบประมาณ ({torRows.length} งวด)
              </h4>
              <button
                type="button"
                onClick={handleAddTorRow}
                disabled={torRows.length >= FIELD_LIMITS.MAX_TOR_INSTALLMENTS}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-40 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                เพิ่มงวดรับงบ
              </button>
            </div>

            {torRows.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-300 rounded-xl bg-slate-50 text-sm text-slate-600">
                ยังไม่มีงวดรับงบประมาณ กด &ldquo;เพิ่มงวดรับงบ&rdquo; เพื่อบันทึกงวดที่ 1, 2... ตาม TOR
              </div>
            ) : (
              <div className="space-y-4">
                {torRows.map((row, idx) => (
                  <div
                    key={row.id}
                    className="border border-slate-200 rounded-xl p-5 bg-white space-y-4"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                      <div className="md:col-span-2">
                        <span className="block text-xs font-medium text-slate-500 mb-1">
                          ลำดับงวด
                        </span>
                        <div className="h-10 px-3 flex items-center bg-slate-100 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 tabular-nums">
                          งวดที่ {idx + 1}
                        </div>
                      </div>

                      <div className="md:col-span-4">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          ยอดเงินของงวดที่ {idx + 1} (บาท)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.amountStr}
                          onChange={(e) => {
                            const formatted = formatBudgetWithCaret(
                              e.currentTarget
                            );
                            setTorSavedMessage(null);
                            setTorRows((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, amountStr: formatted } : r
                              )
                            );
                          }}
                          onBlur={() => {
                            setTorRows((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? {
                                      ...r,
                                      amountStr: formatCurrency(
                                        parseBudgetNumber(r.amountStr)
                                      ),
                                    }
                                  : r
                              )
                            );
                          }}
                          placeholder="0.00"
                          className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20"
                        />
                      </div>

                      <div className="md:col-span-5">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          สถานะการรับงบงวดที่ {idx + 1}
                        </label>
                        <select
                          value={row.status}
                          onChange={(e) => {
                            setTorSavedMessage(null);
                            setTorRows((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? {
                                      ...r,
                                      status: e.target
                                        .value as TorReceiptStatus,
                                    }
                                  : r
                              )
                            );
                          }}
                          className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20"
                        >
                          {TOR_STATUS_LIST.map((st) => (
                            <option key={st} value={st}>
                              {TOR_RECEIPT_STATUS_LABELS[st]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="md:col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleRemoveTorRow(idx)}
                          title="ลบงวดนี้"
                          className="w-10 h-10 flex items-center justify-center text-red-600 bg-white border border-slate-200 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Funder receipt evidence & date */}
                    {(row.status === 'received_from_funder' ||
                      row.status === 'received_from_university') && (
                      <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50/40 p-3.5 rounded-lg">
                        <ThaiDatePopupInput
                          label="วันที่รับเงินจากแหล่งทุน"
                          value={row.funderReceivedDate}
                          onChange={(iso) =>
                            setTorRows((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? { ...r, funderReceivedDate: iso }
                                  : r
                              )
                            )
                          }
                        />

                        <div>
                          <span className="block text-sm font-medium text-slate-700 mb-1.5">
                            หลักฐานการรับเงินจากแหล่งทุน (PDF, JPG, PNG · ไม่เกิน 5 MB)
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-blue-900 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 cursor-pointer">
                              {uploadingKey === `tor_${idx}_funder` ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Upload className="w-3.5 h-3.5" />
                              )}
                              {row.funderEvidenceId
                                ? 'เปลี่ยนไฟล์หลักฐาน'
                                : 'อัพโหลดหลักฐาน'}
                              <input
                                type="file"
                                accept=".pdf,application/pdf,image/jpeg,image/png"
                                className="sr-only"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    void handleUploadTorEvidence(
                                      idx,
                                      'funder',
                                      file
                                    );
                                  }
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            {row.funderEvidenceId && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewEvidence({
                                    evidenceId: row.funderEvidenceId,
                                    fileName: row.funderEvidenceName,
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                              >
                                <Paperclip className="w-3.5 h-3.5 text-emerald-700" />
                                <span className="truncate max-w-[160px]">
                                  {row.funderEvidenceName}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* University receipt evidence & date */}
                    {row.status === 'received_from_university' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-emerald-50/50 p-3.5 rounded-lg">
                        <ThaiDatePopupInput
                          label="วันที่รับเงินจากมหาวิทยาลัย"
                          value={row.universityReceivedDate}
                          onChange={(iso) =>
                            setTorRows((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? { ...r, universityReceivedDate: iso }
                                  : r
                              )
                            )
                          }
                        />

                        <div>
                          <span className="block text-sm font-medium text-slate-700 mb-1.5">
                            หลักฐานการรับเงินจากมหาวิทยาลัย (PDF, JPG, PNG · ไม่เกิน 5 MB)
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-800 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-50 cursor-pointer">
                              {uploadingKey === `tor_${idx}_university` ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Upload className="w-3.5 h-3.5" />
                              )}
                              {row.universityEvidenceId
                                ? 'เปลี่ยนไฟล์หลักฐาน'
                                : 'อัพโหลดหลักฐาน'}
                              <input
                                type="file"
                                accept=".pdf,application/pdf,image/jpeg,image/png"
                                className="sr-only"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    void handleUploadTorEvidence(
                                      idx,
                                      'university',
                                      file
                                    );
                                  }
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            {row.universityEvidenceId && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewEvidence({
                                    evidenceId: row.universityEvidenceId,
                                    fileName: row.universityEvidenceName,
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                              >
                                <Paperclip className="w-3.5 h-3.5 text-emerald-700" />
                                <span className="truncate max-w-[160px]">
                                  {row.universityEvidenceName}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {torError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{torError}</span>
              </div>
            )}

            {torSavedMessage && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
                  <span>{torSavedMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={onOpenDetail}
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 whitespace-nowrap"
                >
                  ไปที่หน้าข้อมูลโครงการ
                </button>
              </div>
            )}

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="submit"
                disabled={isSavingProject}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSavingProject ? 'กำลังบันทึก...' : 'บันทึกข้อมูลการรับงบประมาณ'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: การจัดสรรงบประมาณ                                              */}
      {/* ===================================================================== */}
      {activeTab === 'allocation_setup' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-6 border-b border-slate-200">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                2. ตั้งค่าหน่วยงาน งวดจัดสรร และผู้ลงนาม
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                งบประมาณโครงการที่ใช้จัดสรร:{' '}
                <span className="font-mono font-semibold text-blue-900">
                  {formatCurrency(
                    project.approvedBudget > 0
                      ? project.approvedBudget
                      : project.totalBudget
                  )}{' '}
                  บาท
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={onOpenPdfOnly}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              <FileText className="w-4 h-4" />
              ดู PDF จัดสรรล่าสุด
            </button>
          </div>

          {allocError && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{allocError}</span>
            </div>
          )}

          <form onSubmit={handleSubmitAllocationSetup} className="space-y-6">
            {/* Agencies Dropdown List + Installments */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">
                      หน่วยงานที่ได้รับจัดสรร (Dropdown List)
                    </h4>
                    <p className="text-xs text-slate-500">
                      เลือกหน่วยงานเครือข่าย หรือเลือก &ldquo;อื่นๆ โปรดระบุ&rdquo; เพื่อกรอกชื่อหน่วยงานเอง
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setAllocAgencies((prev) => [
                        ...prev,
                        {
                          id: generateSafeId('ag'),
                          presetCode: PRESET_AGENCIES[1].code,
                          name: PRESET_AGENCIES[1].name,
                          shortName: PRESET_AGENCIES[1].code,
                        },
                      ])
                    }
                    disabled={allocAgencies.length >= FIELD_LIMITS.MAX_AGENCIES}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    เพิ่มหน่วยงาน
                  </button>
                </div>

                <div className="space-y-3">
                  {allocAgencies.map((ag, idx) => (
                    <div
                      key={ag.id}
                      className="p-3 border border-slate-200 rounded-lg bg-slate-50/60 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-10 flex items-center justify-center text-xs font-mono font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg shrink-0">
                          {idx + 1}
                        </span>
                        <select
                          value={ag.presetCode}
                          onChange={(e) =>
                            handleAgencyPresetChange(idx, e.target.value)
                          }
                          aria-label={`เลือกหน่วยงานที่ ${idx + 1}`}
                          className="flex-1 min-w-0 h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20"
                        >
                          {PRESET_AGENCIES.map((preset) => (
                            <option key={preset.code} value={preset.code}>
                              {preset.code} — {preset.name}
                            </option>
                          ))}
                          <option value="OTHER">อื่นๆ โปรดระบุ</option>
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setAllocAgencies((prev) =>
                              prev.length > 1
                                ? prev.filter((_, i) => i !== idx)
                                : prev
                            )
                          }
                          disabled={allocAgencies.length <= 1}
                          className="w-9 h-10 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {ag.presetCode === 'OTHER' ? (
                        <div className="pl-10 grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <input
                            type="text"
                            maxLength={FIELD_LIMITS.AGENCY_NAME_MAX}
                            value={ag.name}
                            onChange={(e) =>
                              setAllocAgencies((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? { ...item, name: e.target.value }
                                    : item
                                )
                              )
                            }
                            placeholder="โปรดระบุชื่อหน่วยงาน..."
                            className="sm:col-span-8 h-9 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-900"
                          />
                          <input
                            type="text"
                            maxLength={FIELD_LIMITS.AGENCY_SHORT_NAME_MAX}
                            value={ag.shortName}
                            onChange={(e) =>
                              setAllocAgencies((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? { ...item, shortName: e.target.value }
                                    : item
                                )
                              )
                            }
                            placeholder="ชื่อย่อ (ถ้ามี)"
                            className="sm:col-span-4 h-9 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-900"
                          />
                        </div>
                      ) : (
                        <p className="pl-10 text-xs text-slate-600">
                          ชื่อที่จะแสดงในเอกสาร:{' '}
                          <span className="font-medium text-slate-900">
                            {ag.name}
                          </span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Installments % */}
              <div className="lg:col-span-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">
                      งวดเงินการจัดสรร (%)
                    </h4>
                    <p className="text-xs text-slate-500">
                      ผลรวม:{' '}
                      <span
                        className={`font-mono font-semibold ${
                          Math.abs(allocPctSum - 100) < 0.01
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {allocPctSum}%
                      </span>{' '}
                      / 100%
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setAllocInstallments((prev) => [
                        ...prev,
                        {
                          id: generateSafeId('inst'),
                          order: prev.length + 1,
                          percentage: '',
                        },
                      ])
                    }
                    disabled={
                      allocInstallments.length >= FIELD_LIMITS.MAX_INSTALLMENTS
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    เพิ่มงวด
                  </button>
                </div>

                <div className="space-y-2">
                  {allocInstallments.map((inst, idx) => (
                    <div key={inst.id} className="flex items-center gap-2">
                      <span className="px-3 h-10 flex items-center text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg whitespace-nowrap shrink-0 tabular-nums">
                        งวดที่ {idx + 1}
                      </span>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={inst.percentage}
                          onChange={(e) =>
                            setAllocInstallments((prev) =>
                              prev.map((item, i) =>
                                i === idx
                                  ? { ...item, percentage: e.target.value }
                                  : item
                              )
                            )
                          }
                          className="w-full h-10 pl-3 pr-8 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-right"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                          %
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setAllocInstallments((prev) =>
                            prev.length > 1
                              ? prev
                                  .filter((_, i) => i !== idx)
                                  .map((item, o) => ({ ...item, order: o + 1 }))
                              : prev
                          )
                        }
                        disabled={allocInstallments.length <= 1}
                        className="w-9 h-10 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Personnel Defaults (Preparer, 4 Reviewers, Prominent Approver) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-5 border-t border-slate-200">
              {/* ผู้จัดทำ */}
              <div className="lg:col-span-3 space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  ผู้จัดทำ (1 คน)
                </label>
                <input
                  type="text"
                  maxLength={FIELD_LIMITS.PERSON_NAME_MAX}
                  value={preparer}
                  onChange={(e) => setPreparer(e.target.value)}
                  placeholder="ชื่อ-สกุล ผู้จัดทำ"
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm"
                />
                <input
                  type="text"
                  maxLength={FIELD_LIMITS.POSITION_MAX}
                  value={preparerPosition}
                  onChange={(e) => setPreparerPosition(e.target.value)}
                  placeholder="ตำแหน่ง"
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm"
                />
              </div>

              {/* ผู้เห็นชอบ */}
              <div className="lg:col-span-6 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">
                    ผู้เห็นชอบ ({reviewerItems.length} คน)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setReviewerItems((prev) => [
                        ...prev,
                        { name: '', position: '' },
                      ])
                    }
                    disabled={reviewerItems.length >= FIELD_LIMITS.MAX_REVIEWERS}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-900 hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    เพิ่มผู้เห็นชอบ
                  </button>
                </div>
                <div className="space-y-2">
                  {reviewerItems.map((rev, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-7 h-10 flex items-center justify-center text-xs font-mono text-slate-600 bg-slate-100 border border-slate-200 rounded-lg shrink-0">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        maxLength={FIELD_LIMITS.PERSON_NAME_MAX}
                        value={rev.name}
                        onChange={(e) =>
                          setReviewerItems((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, name: e.target.value } : r
                            )
                          )
                        }
                        placeholder="ชื่อ-สกุล"
                        className="flex-1 min-w-0 h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm"
                      />
                      <input
                        type="text"
                        maxLength={FIELD_LIMITS.POSITION_MAX}
                        value={rev.position}
                        onChange={(e) =>
                          setReviewerItems((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, position: e.target.value } : r
                            )
                          )
                        }
                        placeholder="ตำแหน่ง"
                        className="w-44 h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm shrink-0"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setReviewerItems((prev) =>
                            prev.length > 1
                              ? prev.filter((_, i) => i !== idx)
                              : prev
                          )
                        }
                        disabled={reviewerItems.length <= 1}
                        className="w-9 h-10 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* ผู้อนุมัติ (ขนาดใหญ่ขึ้นชัดเจนตามความต้องการ) */}
              <div className="lg:col-span-3 space-y-2">
                <label className="block text-lg font-bold text-slate-900">
                  ผู้อนุมัติ (1 คน)
                </label>
                <input
                  type="text"
                  maxLength={FIELD_LIMITS.PERSON_NAME_MAX}
                  value={approver}
                  onChange={(e) => setApprover(e.target.value)}
                  placeholder="ชื่อ-สกุล ผู้อนุมัติ"
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm font-medium"
                />
                <input
                  type="text"
                  maxLength={FIELD_LIMITS.POSITION_MAX}
                  value={approverPosition}
                  onChange={(e) => setApproverPosition(e.target.value)}
                  placeholder="ตำแหน่งผู้อนุมัติ"
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                เมื่อบันทึกแล้ว ระบบจะพาไปยังหน้าตารางจัดสรรงบประมาณรายกิจกรรม (พร้อมสูตร 10% / 50%) และออก PDF / Print Out
              </p>

              <button
                type="submit"
                disabled={isSavingProject}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap"
              >
                <Save className="w-4 h-4" />
                {isSavingProject
                  ? 'กำลังบันทึก...'
                  : 'บันทึกและไปหน้าจัดสรรงบประมาณ'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: การส่งมอบงาน (Deliverables + ระยะเวลาดำเนินงานรวมทั้งโครงการ)    */}
      {/* ===================================================================== */}
      {activeTab === 'deliverables' && (
        <div className="space-y-6">
          {/* Card 1: ระยะเวลาการดำเนินงานรวมของทั้งโครงการ */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8">
            <div className="pb-4 mb-5 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">
                3. ระยะเวลาการดำเนินงาน (รวมของทั้งโครงการ)
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                ระบุช่วงเวลาดำเนินงานรวมของทั้งโครงการ (ใช้ร่วมกันสำหรับทุกรายการส่งมอบงาน)
              </p>
            </div>

            {periodError && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{periodError}</span>
              </div>
            )}

            <form
              onSubmit={handleSavePeriodSubmit}
              className="flex flex-col md:flex-row md:items-end gap-4"
            >
              <div className="flex-1 max-w-xl">
                <ThaiDateRangePopupInput
                  label="ระยะเวลาดำเนินงานโครงการ (วันเริ่มต้น - วันสิ้นสุด)"
                  startDate={projStartDate}
                  endDate={projEndDate}
                  onChange={({ startDate, endDate }) => {
                    setProjStartDate(startDate);
                    setProjEndDate(endDate);
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={isSavingProject}
                className="inline-flex items-center justify-center gap-2 px-5 h-10 text-sm font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <Save className="w-4 h-4" />
                {isSavingProject ? 'กำลังบันทึก...' : 'บันทึกระยะเวลาโครงการ'}
              </button>
            </form>
          </section>

          {/* Card 2: เพิ่ม/แก้ไข รายการส่งมอบงาน (เพิ่มได้หลายรายการ และหลายสิ่งส่งมอบต่อรายการ) */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-6 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {editingDeliverableId
                    ? 'แก้ไขรายการส่งมอบงาน'
                    : `รายการส่งมอบงาน (${draftDeliverables.length} รายการ)`}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  สามารถเพิ่มจำนวนรายการส่งมอบงานได้หลายรายการ และแต่ละรายการสามารถเพิ่มสิ่งส่งมอบและจำนวนได้มากกว่า 1 อย่าง · ระบบแจ้งเตือน กปว. ล่วงหน้า 20 วัน ไปยัง{' '}
                  {REMINDER_RECIPIENT_EMAILS.join(', ')}
                </p>
              </div>
              {editingDeliverableId ? (
                <button
                  type="button"
                  onClick={resetDeliverableForm}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                  ยกเลิกการแก้ไขรายการนี้
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setDraftDeliverables((prev) => [
                      ...prev,
                      createEmptyDraftDeliverable(),
                    ])
                  }
                  disabled={draftDeliverables.length >= 20}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-40 whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  เพิ่มรายการส่งมอบงาน
                </button>
              )}
            </div>

            {delError && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{delError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitDeliverables} className="space-y-6">
              {draftDeliverables.map((draft, itemIdx) => (
                <div
                  key={draft.localKey}
                  className="border border-slate-200 rounded-xl p-5 bg-slate-50/40 space-y-5"
                >
                  <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
                    <span className="text-sm font-semibold text-blue-900">
                      {editingDeliverableId
                        ? 'รายละเอียดรายการส่งมอบงาน'
                        : `รายการส่งมอบงานที่ ${itemIdx + 1}`}
                    </span>
                    {!editingDeliverableId && draftDeliverables.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraftDeliverables((prev) =>
                            prev.filter((d) => d.localKey !== draft.localKey)
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        ลบรายการนี้
                      </button>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor={`delItemTitle_${draft.localKey}`}
                      className="block text-sm font-medium text-slate-700 mb-1.5"
                    >
                      ชื่อรายการส่งมอบ
                    </label>
                    <input
                      id={`delItemTitle_${draft.localKey}`}
                      type="text"
                      maxLength={FIELD_LIMITS.DELIVERABLE_TITLE_MAX}
                      value={draft.itemTitle}
                      onChange={(e) =>
                        updateDraftItem(draft.localKey, (curr) => ({
                          ...curr,
                          itemTitle: e.target.value,
                        }))
                      }
                      placeholder="เช่น รายงานความก้าวหน้าครั้งที่ 1 / รายงานฉบับสมบูรณ์"
                      className="w-full h-10 px-3.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20"
                    />
                  </div>

                  {/* Artifacts (Text + Quantity + Add more > 1 per item) */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">
                        สิ่งส่งมอบ และจำนวน ({draft.artifacts.length} อย่าง)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateDraftItem(draft.localKey, (curr) => ({
                            ...curr,
                            artifacts:
                              curr.artifacts.length < FIELD_LIMITS.MAX_ARTIFACTS
                                ? [
                                    ...curr.artifacts,
                                    {
                                      id: generateSafeId('art'),
                                      name: '',
                                      quantity: '1',
                                    },
                                  ]
                                : curr.artifacts,
                          }))
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-900 bg-white border border-blue-200 rounded-lg hover:bg-blue-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        เพิ่มสิ่งส่งมอบ
                      </button>
                    </div>

                    {draft.artifacts.map((art, artIdx) => (
                      <div key={art.id} className="flex items-center gap-2">
                        <span className="w-8 h-10 flex items-center justify-center text-xs font-mono text-slate-600 bg-white border border-slate-200 rounded-lg shrink-0">
                          {artIdx + 1}
                        </span>
                        <input
                          type="text"
                          maxLength={FIELD_LIMITS.ARTIFACT_NAME_MAX}
                          value={art.name}
                          onChange={(e) =>
                            updateDraftItem(draft.localKey, (curr) => ({
                              ...curr,
                              artifacts: curr.artifacts.map((a, idx) =>
                                idx === artIdx
                                  ? { ...a, name: e.target.value }
                                  : a
                              ),
                            }))
                          }
                          placeholder={`ระบุสิ่งส่งมอบที่ ${artIdx + 1}`}
                          className="flex-1 min-w-0 h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm"
                        />
                        <input
                          type="text"
                          maxLength={FIELD_LIMITS.ARTIFACT_QTY_MAX}
                          value={art.quantity}
                          onChange={(e) =>
                            updateDraftItem(draft.localKey, (curr) => ({
                              ...curr,
                              artifacts: curr.artifacts.map((a, idx) =>
                                idx === artIdx
                                  ? { ...a, quantity: e.target.value }
                                  : a
                              ),
                            }))
                          }
                          placeholder="จำนวน (เช่น 1 เล่ม)"
                          className="w-36 sm:w-44 h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm shrink-0"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateDraftItem(draft.localKey, (curr) => ({
                              ...curr,
                              artifacts:
                                curr.artifacts.length > 1
                                  ? curr.artifacts.filter(
                                      (_, idx) => idx !== artIdx
                                    )
                                  : curr.artifacts,
                            }))
                          }
                          disabled={draft.artifacts.length <= 1}
                          className="w-9 h-10 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ThaiDatePopupInput
                      label="กำหนดส่ง กปว."
                      value={draft.gpvDueDate}
                      onChange={(iso) =>
                        updateDraftItem(draft.localKey, (curr) => ({
                          ...curr,
                          gpvDueDate: iso,
                        }))
                      }
                    />
                    <ThaiDatePopupInput
                      label="กำหนดเรียกรายงานจาก PM"
                      value={draft.pmRequestDate}
                      onChange={(iso) =>
                        updateDraftItem(draft.localKey, (curr) => ({
                          ...curr,
                          pmRequestDate: iso,
                        }))
                      }
                    />
                    <div>
                      <label
                        htmlFor={`delStatusSelect_${draft.localKey}`}
                        className="block text-sm font-medium text-slate-700 mb-1.5"
                      >
                        สถานะการส่งงาน
                      </label>
                      <select
                        id={`delStatusSelect_${draft.localKey}`}
                        value={draft.status}
                        onChange={(e) => {
                          const next = e.target.value as DeliverableStatus;
                          updateDraftItem(draft.localKey, (curr) => ({
                            ...curr,
                            status: next,
                            gpvSubmittedDate:
                              next === 'submitted_gpv' &&
                              !curr.gpvSubmittedDate
                                ? getTodayIsoDate()
                                : curr.gpvSubmittedDate,
                          }));
                        }}
                        className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20"
                      >
                        {DELIVERABLE_STATUS_LIST.map((st) => (
                          <option key={st} value={st}>
                            {DELIVERABLE_STATUS_LABELS[st]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {draft.status === 'submitted_gpv' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-emerald-50/60 border border-emerald-200 rounded-xl p-4">
                      <ThaiDatePopupInput
                        label="วันที่นำส่ง กปว."
                        value={draft.gpvSubmittedDate}
                        onChange={(iso) =>
                          updateDraftItem(draft.localKey, (curr) => ({
                            ...curr,
                            gpvSubmittedDate: iso,
                          }))
                        }
                      />

                      <div>
                        <span className="block text-sm font-medium text-slate-700 mb-1.5">
                          เอกสารนำส่ง กปว. (PDF, JPG, PNG · ไม่เกิน 5 MB)
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-800 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-50 cursor-pointer">
                            {uploadingKey === `gpv_submit_${draft.localKey}` ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Upload className="w-3.5 h-3.5" />
                            )}
                            {draft.gpvEvidenceId
                              ? 'เปลี่ยนเอกสารนำส่ง'
                              : 'อัพโหลดเอกสารนำส่ง'}
                            <input
                              type="file"
                              accept=".pdf,application/pdf,image/jpeg,image/png"
                              className="sr-only"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  void handleUploadGpvEvidence(
                                    draft.localKey,
                                    file
                                  );
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>
                          {draft.gpvEvidenceId && (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewEvidence({
                                  evidenceId: draft.gpvEvidenceId,
                                  fileName: draft.gpvEvidenceName,
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                            >
                              <Paperclip className="w-3.5 h-3.5 text-emerald-700" />
                              <span className="truncate max-w-[160px]">
                                {draft.gpvEvidenceName}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                {!editingDeliverableId ? (
                  <button
                    type="button"
                    onClick={() =>
                      setDraftDeliverables((prev) => [
                        ...prev,
                        createEmptyDraftDeliverable(),
                      ])
                    }
                    disabled={draftDeliverables.length >= 20}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-40"
                  >
                    <Plus className="w-4 h-4" />
                    เพิ่มรายการส่งมอบงานอีก ({draftDeliverables.length})
                  </button>
                ) : (
                  <span />
                )}

                <button
                  type="submit"
                  disabled={isSavingDeliverable}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  {isSavingDeliverable
                    ? 'กำลังบันทึก...'
                    : editingDeliverableId
                      ? 'บันทึกการแก้ไขส่งมอบงาน'
                      : `บันทึกรายการส่งมอบงาน (${draftDeliverables.length} รายการ)`}
                </button>
              </div>
            </form>
          </section>

          {/* Saved Deliverables List */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-base font-semibold text-slate-900">
                รายการส่งมอบงานที่บันทึกไว้ ({sortedDeliverables.length})
              </h4>
              {projStartDate && projEndDate && (
                <span className="text-xs font-medium text-slate-600 tabular-nums">
                  ระยะเวลาดำเนินงานโครงการ:{' '}
                  <strong className="text-slate-900">
                    {formatIsoToThaiDate(projStartDate)} -{' '}
                    {formatIsoToThaiDate(projEndDate)}
                  </strong>
                </span>
              )}
            </div>

            {sortedDeliverables.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                ยังไม่มีรายการส่งมอบงานในโครงการนี้
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {sortedDeliverables.map((del) => {
                  const daysLeft = daysUntilIsoDate(del.gpvDueDate);
                  const isWithin20 =
                    del.status !== 'submitted_gpv' &&
                    daysLeft !== null &&
                    daysLeft <= 20;

                  return (
                    <div
                      key={del.id}
                      className={`p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                        isWithin20 ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {del.itemTitle}
                          </span>
                          <span
                            className={`text-xs font-semibold ${
                              del.status === 'submitted_gpv'
                                ? 'text-emerald-700'
                                : isWithin20
                                  ? 'text-amber-700'
                                  : 'text-blue-900'
                            }`}
                          >
                            · {DELIVERABLE_STATUS_LABELS[del.status]}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 tabular-nums">
                          เรียกจาก PM: {formatIsoToThaiDate(del.pmRequestDate)}{' '}
                          · กำหนดส่ง กปว.:{' '}
                          <strong className="text-slate-900">
                            {formatIsoToThaiDate(del.gpvDueDate)}
                          </strong>
                          {del.status !== 'submitted_gpv' &&
                            daysLeft !== null && (
                              <span
                                className={`ml-1.5 font-semibold ${
                                  daysLeft <= 20
                                    ? 'text-amber-700'
                                    : 'text-slate-500'
                                }`}
                              >
                                (
                                {daysLeft < 0
                                  ? `เลยกำหนด ${Math.abs(daysLeft)} วัน`
                                  : daysLeft === 0
                                    ? 'ครบกำหนดวันนี้'
                                    : `อีก ${daysLeft} วัน`}
                                )
                              </span>
                            )}
                        </p>
                        <ul className="text-xs text-slate-600 space-y-0.5 pl-1">
                          {del.artifacts.map((a) => (
                            <li key={a.id}>
                              · {a.name}{' '}
                              <span className="font-medium text-slate-800">
                                ({a.quantity})
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {del.gpvEvidenceId && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewEvidence({
                                evidenceId: del.gpvEvidenceId,
                                fileName: del.gpvEvidenceName,
                              })
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            เอกสารนำส่ง
                          </button>
                        )}

                        {del.status !== 'submitted_gpv' && (
                          <button
                            type="button"
                            disabled={isSendingReminder}
                            onClick={() => setReminderConfirmTarget(del)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-800 bg-amber-100 rounded-lg hover:bg-amber-200"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            แจ้งเตือน กปว.
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleEditDeliverable(del)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          แก้ไข
                        </button>

                        {confirmDeleteDelId === del.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeleteDeliverable(del);
                                setConfirmDeleteDelId(null);
                              }}
                              className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                            >
                              ยืนยันลบ
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteDelId(null)}
                              className="px-2 py-1.5 text-xs text-slate-700 bg-slate-100 rounded-lg"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteDelId(del.id)}
                            className="w-8 h-8 flex items-center justify-center text-red-600 bg-white border border-slate-200 rounded-lg hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: สถานะโครงการ (On time / ขยายเวลา)                              */}
      {/* ===================================================================== */}
      {activeTab === 'schedule_status' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8">
          <div className="pb-4 mb-6 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">
              4. สถานะระยะเวลาดำเนินโครงการ
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              ค่าตั้งต้นเป็น &ldquo;On time&rdquo; · หากมีการขยายเวลา สามารถระบุครั้งที่และอัพโหลดเอกสารอนุมัติขยายเวลาภายหลังได้
            </p>
          </div>

          {scheduleError && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{scheduleError}</span>
            </div>
          )}

          <form onSubmit={handleSubmitScheduleStatus} className="space-y-5 max-w-2xl">
            <div>
              <label
                htmlFor="scheduleStatusSelect"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                สถานะโครงการ
              </label>
              <select
                id="scheduleStatusSelect"
                value={scheduleStatus}
                onChange={(e) =>
                  setScheduleStatus(e.target.value as ProjectScheduleStatus)
                }
                className="w-full h-11 px-3.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20"
              >
                <option value="on_time">{SCHEDULE_STATUS_LABELS.on_time}</option>
                <option value="extended">
                  {SCHEDULE_STATUS_LABELS.extended}
                </option>
              </select>
            </div>

            {scheduleStatus === 'extended' && (
              <div className="space-y-4 bg-slate-50 border border-slate-200 rounded-xl p-5">
                {!extensionEvidenceId && (
                  <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>
                      <strong>แจ้งเตือนสำคัญ:</strong> ยังไม่ได้อัพโหลดเอกสารอนุมัติขยายเวลา
                      (คุณสามารถกดบันทึกสถานะไว้ก่อนแล้วกลับมาอัพโหลดเอกสารเพิ่มเติมภายหลังได้ค่ะ)
                    </span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="extensionCountInput"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    ขยายเวลาครั้งที่
                  </label>
                  <input
                    id="extensionCountInput"
                    type="number"
                    min={1}
                    max={100}
                    value={extensionCountStr}
                    onChange={(e) => setExtensionCountStr(e.target.value)}
                    className="w-44 h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-slate-900"
                  />
                </div>

                <div>
                  <span className="block text-sm font-medium text-slate-700 mb-1.5">
                    เอกสารอนุมัติขยายเวลา (PDF, JPG, PNG · ไม่เกิน 5 MB)
                  </span>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <label className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-blue-900 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 cursor-pointer">
                      {uploadingKey === 'extension_doc' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      {extensionEvidenceId
                        ? 'เปลี่ยนเอกสารอนุมัติขยายเวลา'
                        : 'อัพโหลดเอกสารอนุมัติขยายเวลา'}
                      <input
                        type="file"
                        accept=".pdf,application/pdf,image/jpeg,image/png"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleUploadExtensionDoc(file);
                          e.target.value = '';
                        }}
                      />
                    </label>

                    {extensionEvidenceId && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewEvidence({
                            evidenceId: extensionEvidenceId,
                            fileName: extensionEvidenceName,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{extensionEvidenceName}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="submit"
                disabled={isSavingProject}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {isSavingProject ? 'กำลังบันทึก...' : 'บันทึกสถานะโครงการ'}
              </button>
            </div>
          </form>
        </section>
      )}

      {previewEvidence && (
        <EvidencePreviewModal
          projectId={project.id}
          evidenceId={previewEvidence.evidenceId}
          fileName={previewEvidence.fileName}
          onClose={() => setPreviewEvidence(null)}
        />
      )}

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
                  ยืนยันส่งอีเมลแจ้งเตือนกำหนดส่ง กปว.
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  ระบบจะส่งอีเมลแจ้งเตือนไปยัง {REMINDER_RECIPIENT_EMAILS.join(', ')}
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
            <div className="py-4 text-sm text-slate-700 space-y-1.5">
              <div>
                <span className="font-medium text-slate-900">รายการ: </span>
                {reminderConfirmTarget.itemTitle}
              </div>
              <div>
                <span className="font-medium text-slate-900">
                  กำหนดส่ง กปว.:{' '}
                </span>
                {formatIsoToThaiDate(reminderConfirmTarget.gpvDueDate)}
                {(() => {
                  const d = daysUntilIsoDate(reminderConfirmTarget.gpvDueDate);
                  return d !== null ? ` (อีก ${d} วัน)` : '';
                })()}
              </div>
            </div>
            <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReminderConfirmTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSendingReminder}
                onClick={async () => {
                  const target = reminderConfirmTarget;
                  await onSendReminderEmail(target, project);
                  setReminderConfirmTarget(null);
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

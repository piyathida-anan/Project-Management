import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  LogOut,
  ShieldAlert,
} from 'lucide-react';
import {
  auth,
  clearCachedGmailToken,
  db,
  getCachedGmailToken,
  handleFirestoreError,
  OperationType,
  requestFreshGmailToken,
  signInWithGoogle,
} from './firebase';
import {
  AUTHORIZED_EDITOR_EMAILS,
  DEFAULT_ALLOCATION_PERSONNEL,
  DELIVERABLE_STATUS_LABELS,
  FIELD_LIMITS,
  PRESET_AGENCIES,
  REMINDER_RECIPIENT_EMAILS,
  type AgencyItem,
  type BudgetActivity,
  type BudgetProject,
  type BudgetWithdrawal,
  type DeliverableArtifact,
  type DeliverableStatus,
  type DeliverableSummary,
  type ProjectDeliverable,
  type ProjectScheduleStatus,
  type ProposalStatus,
  type ReviewerItem,
  type TorInstallmentItem,
  type WithdrawalItem,
} from './types/budget';
import {
  daysUntilIsoDate,
  generateSafeId,
  getTodayIsoDate,
  toDateObject,
} from './utils/formatters';
import type { ProcessedAttachment } from './utils/fileUpload';
import { saveProcessedProjectEvidence } from './utils/evidenceService';
import { exportAllProjectsToCsv } from './utils/exportCsv';
import {
  sendDeliverableReminderEmail,
  sendWithdrawalNotificationEmail,
} from './utils/gmail';
import { HomeDashboard } from './components/HomeDashboard';
import { Stage1ProjectModal } from './components/Stage1ProjectModal';
import {
  ProjectDetailDashboard,
  type Stage2MenuTab,
} from './components/ProjectDetailDashboard';
import { Stage2EditWorkspace } from './components/Stage2EditWorkspace';
import { AllocationEditor } from './components/AllocationEditor';
import { PdfPreviewModal } from './components/PdfPreviewModal';
import { WithdrawalWorkspace } from './components/WithdrawalWorkspace';
import { WithdrawalInspectModal } from './components/WithdrawalInspectModal';

type ViewMode = 'home' | 'detail' | 'stage2_edit' | 'allocate' | 'withdraw';

const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

interface PendingDeepLink {
  type: 'inspect' | 'project';
  projectId: string;
  withdrawalId?: string;
}

function parseInitialDeepLink(): PendingDeepLink | null {
  const params = new URLSearchParams(window.location.search);
  const inspectProject = params.get('inspectProject')?.trim() ?? '';
  const withdrawalId = params.get('withdrawalId')?.trim() ?? '';
  if (SAFE_ID_REGEX.test(inspectProject) && SAFE_ID_REGEX.test(withdrawalId)) {
    return { type: 'inspect', projectId: inspectProject, withdrawalId };
  }
  const projectOnly = params.get('project')?.trim() ?? '';
  if (SAFE_ID_REGEX.test(projectOnly)) {
    return { type: 'project', projectId: projectOnly };
  }
  return null;
}

function parseProposalStatus(raw: unknown): ProposalStatus {
  if (
    raw === 'drafting' ||
    raw === 'submitted' ||
    raw === 'approved' ||
    raw === 'rejected'
  ) {
    return raw;
  }
  // Legacy projects created before Stage 1/2 rollout default to approved
  return 'approved';
}

function buildDeliverableSummary(
  list: ProjectDeliverable[]
): DeliverableSummary {
  if (list.length === 0) {
    return {
      count: 0,
      latestItemTitle: '',
      latestStatus: '',
      nextGpvDueDate: '',
      nextPmRequestDate: '',
    };
  }

  const sortedDesc = [...list].sort((a, b) =>
    (b.gpvDueDate || '').localeCompare(a.gpvDueDate || '')
  );
  const latest = sortedDesc[0];

  const pendingAsc = list
    .filter((d) => d.status !== 'submitted_gpv')
    .sort((a, b) => (a.gpvDueDate || '').localeCompare(b.gpvDueDate || ''));
  const nextPending = pendingAsc[0];

  return {
    count: list.length,
    latestItemTitle: (latest.itemTitle || '').slice(0, 400),
    latestStatus: (
      DELIVERABLE_STATUS_LABELS[latest.status] ?? latest.status
    ).slice(0, 40),
    nextGpvDueDate: (nextPending?.gpvDueDate ?? '').slice(0, 20),
    nextPmRequestDate: (nextPending?.pmRequestDate ?? '').slice(0, 20),
  };
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const [projects, setProjects] = useState<BudgetProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const [deliverables, setDeliverables] = useState<ProjectDeliverable[]>([]);
  const [loadingDeliverables, setLoadingDeliverables] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [stage2InitialTab, setStage2InitialTab] =
    useState<Stage2MenuTab>('tor_receipts');

  const [isStage1ModalOpen, setIsStage1ModalOpen] = useState(false);
  const [editingStage1Project, setEditingStage1Project] =
    useState<BudgetProject | null>(null);

  const [activities, setActivities] = useState<BudgetActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  const [withdrawals, setWithdrawals] = useState<BudgetWithdrawal[]>([]);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(false);
  const [inspectingWithdrawalId, setInspectingWithdrawalId] = useState<
    string | null
  >(null);
  const [pendingDeepLink, setPendingDeepLink] =
    useState<PendingDeepLink | null>(() => parseInitialDeepLink());

  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isSavingDeliverable, setIsSavingDeliverable] = useState(false);
  const [isSavingAllocations, setIsSavingAllocations] = useState(false);
  const [isSubmittingWithdrawal, setIsSubmittingWithdrawal] = useState(false);
  const [isUpdatingWithdrawalStatus, setIsUpdatingWithdrawalStatus] =
    useState(false);
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);

  const [toast, setToast] = useState<{
    type: 'success' | 'warning';
    text: string;
  } | null>(null);

  const [fatalError, setFatalError] = useState<Error | null>(null);
  if (fatalError) {
    throw fatalError;
  }

  const normalizedEmail = (user?.email ?? '').trim().toLowerCase();
  const isAuthorizedEditor = Boolean(
    user &&
      user.emailVerified &&
      AUTHORIZED_EDITOR_EMAILS.some((allowed) => allowed === normalizedEmail)
  );

  const showToast = (
    text: string,
    type: 'success' | 'warning' = 'success'
  ) => {
    setToast({ type, text });
    window.setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 5500);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (!currentUser) {
        setProjects([]);
        setDeliverables([]);
        setSelectedProjectId(null);
        setActivities([]);
        setWithdrawals([]);
        setInspectingWithdrawalId(null);
        setIsStage1ModalOpen(false);
        setEditingStage1Project(null);
        setViewMode('home');
        setIsPdfModalOpen(false);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to all shared projects (authorized editors share access)
  useEffect(() => {
    if (!authReady || !user || !isAuthorizedEditor) {
      setLoadingProjects(false);
      return;
    }

    setLoadingProjects(true);
    const projectsQuery = query(collection(db, 'projects'));

    const unsub = onSnapshot(
      projectsQuery,
      (snapshot) => {
        const list: BudgetProject[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const proposalStatus = parseProposalStatus(data.proposalStatus);
          const totalBudget = Number(data.totalBudget ?? 0);
          const approvedBudget =
            data.approvedBudget !== undefined && data.approvedBudget !== null
              ? Number(data.approvedBudget)
              : totalBudget;
          const requestedBudget =
            data.requestedBudget !== undefined && data.requestedBudget !== null
              ? Number(data.requestedBudget)
              : totalBudget;

          return {
            id: docSnap.id,
            ownerId: String(data.ownerId ?? ''),
            fiscalYear: Number(data.fiscalYear ?? 2569),
            name: String(data.name ?? ''),
            shortName: data.shortName ? String(data.shortName) : '',
            funderName: data.funderName ? String(data.funderName) : '',
            proposalStatus,
            requestedBudget,
            submittedDate: data.submittedDate ? String(data.submittedDate) : '',
            proposalEvidenceId: data.proposalEvidenceId
              ? String(data.proposalEvidenceId)
              : '',
            proposalEvidenceName: data.proposalEvidenceName
              ? String(data.proposalEvidenceName)
              : '',
            approvedBudget,
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
            deliverableSummary:
              data.deliverableSummary &&
              typeof data.deliverableSummary === 'object'
                ? (data.deliverableSummary as DeliverableSummary)
                : undefined,
            projectStartDate: data.projectStartDate
              ? String(data.projectStartDate)
              : '',
            projectEndDate: data.projectEndDate
              ? String(data.projectEndDate)
              : '',
            totalBudget,
            agencies: Array.isArray(data.agencies) ? data.agencies : [],
            installments: Array.isArray(data.installments)
              ? data.installments
              : [],
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

        list.sort(
          (a, b) =>
            toDateObject(b.updatedAt).getTime() -
            toDateObject(a.updatedAt).getTime()
        );
        setProjects(list);
        setLoadingProjects(false);
      },
      (error) => {
        setLoadingProjects(false);
        try {
          handleFirestoreError(error, OperationType.LIST, 'projects');
        } catch (wrapped) {
          setFatalError(wrapped as Error);
        }
      }
    );

    return () => unsub();
  }, [authReady, user, isAuthorizedEditor]);

  // Subscribe to all deliverables (used for Home 20-day GPV reminder & project table)
  useEffect(() => {
    if (!authReady || !user || !isAuthorizedEditor) {
      setLoadingDeliverables(false);
      return;
    }

    setLoadingDeliverables(true);
    const deliverablesQuery = query(collection(db, 'deliverables'));

    const unsub = onSnapshot(
      deliverablesQuery,
      (snapshot) => {
        const list: ProjectDeliverable[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            projectId: String(data.projectId ?? ''),
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
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        });
        setDeliverables(list);
        setLoadingDeliverables(false);
      },
      (error) => {
        setLoadingDeliverables(false);
        try {
          handleFirestoreError(error, OperationType.LIST, 'deliverables');
        } catch (wrapped) {
          setFatalError(wrapped as Error);
        }
      }
    );

    return () => unsub();
  }, [authReady, user, isAuthorizedEditor]);

  // Subscribe to activities of the currently selected project
  useEffect(() => {
    if (!authReady || !user || !isAuthorizedEditor || !selectedProjectId) {
      setActivities([]);
      setLoadingActivities(false);
      return;
    }

    setLoadingActivities(true);
    const actPath = `projects/${selectedProjectId}/activities`;
    const activitiesQuery = query(
      collection(db, 'projects', selectedProjectId, 'activities'),
      where('projectId', '==', selectedProjectId)
    );

    const unsub = onSnapshot(
      activitiesQuery,
      (snapshot) => {
        const list: BudgetActivity[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            projectId: String(data.projectId ?? selectedProjectId),
            ownerId: String(data.ownerId ?? ''),
            order: Number(data.order ?? 1),
            activityName: String(data.activityName ?? ''),
            amounts:
              data.amounts && typeof data.amounts === 'object'
                ? (data.amounts as Record<string, number>)
                : {},
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        });
        list.sort((a, b) => a.order - b.order);
        setActivities(list);
        setLoadingActivities(false);
      },
      (error) => {
        setLoadingActivities(false);
        try {
          handleFirestoreError(error, OperationType.LIST, actPath);
        } catch (wrapped) {
          setFatalError(wrapped as Error);
        }
      }
    );

    return () => unsub();
  }, [authReady, user, isAuthorizedEditor, selectedProjectId]);

  // Subscribe to withdrawals of the currently selected project
  useEffect(() => {
    if (!authReady || !user || !isAuthorizedEditor || !selectedProjectId) {
      setWithdrawals([]);
      setLoadingWithdrawals(false);
      return;
    }

    setLoadingWithdrawals(true);
    const wdPath = `projects/${selectedProjectId}/withdrawals`;
    const withdrawalsQuery = query(
      collection(db, 'projects', selectedProjectId, 'withdrawals'),
      where('projectId', '==', selectedProjectId)
    );

    const unsub = onSnapshot(
      withdrawalsQuery,
      (snapshot) => {
        const list: BudgetWithdrawal[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            projectId: String(data.projectId ?? selectedProjectId),
            ownerId: String(data.ownerId ?? ''),
            agencyId: String(data.agencyId ?? ''),
            agencyName: String(data.agencyName ?? ''),
            agencyShortName: String(data.agencyShortName ?? ''),
            requesterName: String(data.requesterName ?? ''),
            recipientEmail: String(data.recipientEmail ?? ''),
            note: String(data.note ?? ''),
            attachmentName: String(data.attachmentName ?? ''),
            attachmentMimeType:
              data.attachmentMimeType === 'image/jpeg' ||
              data.attachmentMimeType === 'image/png'
                ? data.attachmentMimeType
                : 'application/pdf',
            attachmentDataUrl: String(data.attachmentDataUrl ?? ''),
            attachmentEvidenceId: data.attachmentEvidenceId
              ? String(data.attachmentEvidenceId)
              : '',
            items: Array.isArray(data.items)
              ? (data.items as WithdrawalItem[])
              : [],
            totalRequested: Number(data.totalRequested ?? 0),
            status: data.status === 'inspected' ? 'inspected' : 'pending',
            emailSent: Boolean(data.emailSent),
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        });
        list.sort(
          (a, b) =>
            toDateObject(b.createdAt).getTime() -
            toDateObject(a.createdAt).getTime()
        );
        setWithdrawals(list);
        setLoadingWithdrawals(false);
      },
      (error) => {
        setLoadingWithdrawals(false);
        try {
          handleFirestoreError(error, OperationType.LIST, wdPath);
        } catch (wrapped) {
          setFatalError(wrapped as Error);
        }
      }
    );

    return () => unsub();
  }, [authReady, user, isAuthorizedEditor, selectedProjectId]);

  // Handle deep-link from Gmail buttons (?inspectProject=...&withdrawalId=... or ?project=...)
  useEffect(() => {
    if (
      !authReady ||
      !user ||
      !isAuthorizedEditor ||
      !pendingDeepLink ||
      loadingProjects
    ) {
      return;
    }

    const targetProject = projects.find(
      (p) => p.id === pendingDeepLink.projectId
    );
    if (!targetProject) {
      setPendingDeepLink(null);
      window.history.replaceState({}, '', window.location.pathname);
      showToast('ไม่พบข้อมูลโครงการตามลิงก์ที่ระบุ', 'warning');
      return;
    }

    if (pendingDeepLink.type === 'project') {
      setSelectedProjectId(targetProject.id);
      setViewMode('detail');
      setPendingDeepLink(null);
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (selectedProjectId !== targetProject.id) {
      setSelectedProjectId(targetProject.id);
      setViewMode('withdraw');
      return;
    }

    if (viewMode !== 'withdraw') {
      setViewMode('withdraw');
    }

    if (loadingWithdrawals) return;

    const targetWithdrawal = withdrawals.find(
      (w) => w.id === pendingDeepLink.withdrawalId
    );
    setPendingDeepLink(null);
    if (targetWithdrawal) {
      setInspectingWithdrawalId(targetWithdrawal.id);
    } else {
      window.history.replaceState({}, '', window.location.pathname);
      showToast('ไม่พบรายการขอเบิกงบประมาณที่ระบุ (อาจถูกลบแล้ว)', 'warning');
    }
  }, [
    authReady,
    user,
    isAuthorizedEditor,
    pendingDeepLink,
    loadingProjects,
    projects,
    selectedProjectId,
    viewMode,
    loadingWithdrawals,
    withdrawals,
  ]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const selectedProjectDeliverables = useMemo(() => {
    if (!selectedProjectId) return [];
    return deliverables.filter((d) => d.projectId === selectedProjectId);
  }, [deliverables, selectedProjectId]);

  const inspectingWithdrawal = useMemo(
    () => withdrawals.find((w) => w.id === inspectingWithdrawalId) ?? null,
    [withdrawals, inspectingWithdrawalId]
  );

  const sendWithGmailToken = async (
    sendFn: (token: string) => Promise<void>
  ) => {
    let token = getCachedGmailToken();
    if (!token) {
      token = await requestFreshGmailToken();
    }
    try {
      await sendFn(token);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 401) {
        clearCachedGmailToken();
        const refreshedToken = await requestFreshGmailToken();
        await sendFn(refreshedToken);
      } else {
        throw err;
      }
    }
  };

  const handleSignIn = async () => {
    setAuthError(null);
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'ไม่สามารถเข้าสู่ระบบได้';
      setAuthError(
        msg.includes('popup-closed-by-user')
          ? 'คุณได้ปิดหน้าต่างเข้าสู่ระบบก่อนดำเนินการเสร็จสิ้น'
          : 'เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google กรุณาลองใหม่อีกครั้ง'
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    clearCachedGmailToken();
    await signOut(auth);
  };

  // Stage 1: Create or update project proposal & status
  const handleSaveStage1 = async (values: {
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
  }) => {
    if (!user || !isAuthorizedEditor) return;
    setIsSavingProject(true);
    try {
      if (editingStage1Project) {
        const projPath = `projects/${editingStage1Project.id}`;
        const wasApproved = editingStage1Project.proposalStatus === 'approved';
        const isNowApproved = values.proposalStatus === 'approved';

        const nextApprovedBudget = isNowApproved
          ? values.approvedBudget > 0
            ? values.approvedBudget
            : values.requestedBudget
          : editingStage1Project.approvedBudget;

        const nextTotalBudget = isNowApproved
          ? nextApprovedBudget
          : values.requestedBudget;

        let nextEvidenceId = values.removeExistingProposalEvidence
          ? ''
          : (editingStage1Project.proposalEvidenceId ?? '');
        let nextEvidenceName = values.removeExistingProposalEvidence
          ? ''
          : (editingStage1Project.proposalEvidenceName ?? '');

        if (values.newProposalAttachment) {
          const uploaded = await saveProcessedProjectEvidence({
            projectId: editingStage1Project.id,
            ownerId: user.uid,
            category: 'proposal_doc',
            attachment: values.newProposalAttachment,
          });
          nextEvidenceId = uploaded.evidenceId;
          nextEvidenceName = uploaded.fileName;
        }

        try {
          const nextVersion =
            Math.max(1, Math.floor(editingStage1Project.version || 1)) + 1;
          await updateDoc(doc(db, 'projects', editingStage1Project.id), {
            fiscalYear: values.fiscalYear,
            name: values.name,
            shortName: values.shortName,
            funderName: values.funderName,
            requestedBudget: values.requestedBudget,
            submittedDate: values.submittedDate,
            proposalStatus: values.proposalStatus,
            proposalEvidenceId: nextEvidenceId,
            proposalEvidenceName: nextEvidenceName,
            approvedBudget: nextApprovedBudget,
            totalBudget: nextTotalBudget,
            version: nextVersion,
            updatedAt: serverTimestamp(),
          });

          const editedId = editingStage1Project.id;
          setProjects((prev) =>
            prev.map((p) =>
              p.id === editedId
                ? {
                    ...p,
                    fiscalYear: values.fiscalYear,
                    name: values.name,
                    shortName: values.shortName,
                    funderName: values.funderName,
                    requestedBudget: values.requestedBudget,
                    submittedDate: values.submittedDate,
                    proposalStatus: values.proposalStatus,
                    proposalEvidenceId: nextEvidenceId,
                    proposalEvidenceName: nextEvidenceName,
                    approvedBudget: nextApprovedBudget,
                    totalBudget: nextTotalBudget,
                    version: nextVersion,
                  }
                : p
            )
          );
          setIsStage1ModalOpen(false);
          setEditingStage1Project(null);

          if (!wasApproved && isNowApproved) {
            setSelectedProjectId(editedId);
            setStage2InitialTab('tor_receipts');
            setViewMode('stage2_edit');
            showToast(
              'อนุมัติโครงการแล้ว! เปิดเมนูบริหารโครงการ Stage 2 ให้เรียบร้อย'
            );
          } else {
            showToast('อัปเดตข้อมูลและสถานะโครงการเรียบร้อยแล้ว');
          }
        } catch (err) {
          showToast(
            'ไม่สามารถบันทึกข้อมูลโครงการได้ กรุณาตรวจสอบสิทธิ์หรือลองใหม่อีกครั้ง',
            'warning'
          );
          handleFirestoreError(err, OperationType.UPDATE, projPath);
        }
      } else {
        const projectId = generateSafeId('proj');
        const projPath = `projects/${projectId}`;
        const isApproved = values.proposalStatus === 'approved';
        const initialApproved = isApproved
          ? values.approvedBudget > 0
            ? values.approvedBudget
            : values.requestedBudget
          : 0;
        try {
          await setDoc(doc(db, 'projects', projectId), {
            ownerId: user.uid,
            fiscalYear: values.fiscalYear,
            name: values.name,
            shortName: values.shortName,
            funderName: values.funderName,
            proposalStatus: values.proposalStatus,
            requestedBudget: values.requestedBudget,
            submittedDate: values.submittedDate,
            proposalEvidenceId: '',
            proposalEvidenceName: '',
            approvedBudget: initialApproved,
            totalBudget: isApproved ? initialApproved : values.requestedBudget,
            torInstallments: [],
            scheduleStatus: 'on_time',
            extensionCount: 0,
            extensionEvidenceId: '',
            extensionEvidenceName: '',
            projectStartDate: '',
            projectEndDate: '',
            agencies: [
              {
                id: generateSafeId('ag'),
                name: PRESET_AGENCIES[0].name,
                shortName: PRESET_AGENCIES[0].code,
              },
            ],
            installments: [
              { id: generateSafeId('inst'), order: 1, percentage: 100 },
            ],
            preparer: DEFAULT_ALLOCATION_PERSONNEL.preparer,
            preparerPosition: DEFAULT_ALLOCATION_PERSONNEL.preparerPosition,
            reviewers: DEFAULT_ALLOCATION_PERSONNEL.reviewerItems.map(
              (r) => r.name
            ),
            reviewerItems: DEFAULT_ALLOCATION_PERSONNEL.reviewerItems.map(
              (r) => ({ ...r })
            ),
            approver: DEFAULT_ALLOCATION_PERSONNEL.approver,
            approverPosition: DEFAULT_ALLOCATION_PERSONNEL.approverPosition,
            version: 1,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          if (values.newProposalAttachment) {
            const uploaded = await saveProcessedProjectEvidence({
              projectId,
              ownerId: user.uid,
              category: 'proposal_doc',
              attachment: values.newProposalAttachment,
            });
            await updateDoc(doc(db, 'projects', projectId), {
              proposalEvidenceId: uploaded.evidenceId,
              proposalEvidenceName: uploaded.fileName,
              version: 1,
              updatedAt: serverTimestamp(),
            });
          }

          setIsStage1ModalOpen(false);
          setEditingStage1Project(null);
          if (isApproved) {
            setSelectedProjectId(projectId);
            setStage2InitialTab('tor_receipts');
            setViewMode('stage2_edit');
            showToast('เพิ่มโครงการและเปิดเมนู Stage 2 เรียบร้อยแล้ว');
          } else {
            showToast('เพิ่มโครงการใหม่ (Stage 1) ลงฐานข้อมูลเรียบร้อยแล้ว');
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, projPath);
        }
      }
    } finally {
      setIsSavingProject(false);
    }
  };

  // Stage 2 Menu 1: Save TOR approved budget & installments
  const handleSaveTorReceipts = async (payload: {
    approvedBudget: number;
    torInstallments: TorInstallmentItem[];
  }) => {
    if (!user || !isAuthorizedEditor || !selectedProject) return;
    setIsSavingProject(true);
    const targetProjectId = selectedProject.id;
    const projPath = `projects/${targetProjectId}`;
    const nextVersion = Math.max(1, Math.floor(selectedProject.version || 1)) + 1;
    try {
      await updateDoc(doc(db, 'projects', targetProjectId), {
        approvedBudget: payload.approvedBudget,
        totalBudget: payload.approvedBudget,
        torInstallments: payload.torInstallments,
        version: nextVersion,
        updatedAt: serverTimestamp(),
      });
      setProjects((prev) =>
        prev.map((p) =>
          p.id === targetProjectId
            ? {
                ...p,
                approvedBudget: payload.approvedBudget,
                totalBudget: payload.approvedBudget,
                torInstallments: payload.torInstallments,
                version: nextVersion,
              }
            : p
        )
      );
      showToast('บันทึกข้อมูลการรับงบประมาณตาม TOR เรียบร้อยแล้ว');
    } catch (err) {
      showToast(
        'ไม่สามารถบันทึกข้อมูลการรับงบประมาณได้ กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง',
        'warning'
      );
      handleFirestoreError(err, OperationType.UPDATE, projPath);
    } finally {
      setIsSavingProject(false);
    }
  };

  // Stage 2 Menu 2: Save Allocation Setup (Agencies, Installments, Signatories) & proceed to AllocationEditor
  const handleSaveAllocationSetup = async (payload: {
    totalBudget: number;
    agencies: AgencyItem[];
    installments: Array<{ id: string; order: number; percentage: number }>;
    preparer: string;
    preparerPosition: string;
    reviewers: string[];
    reviewerItems: ReviewerItem[];
    approver: string;
    approverPosition: string;
  }) => {
    if (!user || !isAuthorizedEditor || !selectedProject) return;
    setIsSavingProject(true);
    const projPath = `projects/${selectedProject.id}`;
    try {
      const nextApprovedBudget =
        selectedProject.approvedBudget > 0
          ? selectedProject.approvedBudget
          : payload.totalBudget;

      await updateDoc(doc(db, 'projects', selectedProject.id), {
        totalBudget: payload.totalBudget,
        approvedBudget: nextApprovedBudget,
        agencies: payload.agencies.map((a) => ({
          id: a.id,
          name: a.name,
          shortName: a.shortName ?? '',
        })),
        installments: payload.installments,
        preparer: payload.preparer,
        preparerPosition: payload.preparerPosition,
        reviewers: payload.reviewers,
        reviewerItems: payload.reviewerItems,
        approver: payload.approver,
        approverPosition: payload.approverPosition,
        version: selectedProject.version + 1,
        updatedAt: serverTimestamp(),
      });
      setViewMode('allocate');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      showToast('บันทึกข้อมูลหน่วยงานและผู้ลงนามเรียบร้อยแล้ว');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, projPath);
    } finally {
      setIsSavingProject(false);
    }
  };

  // Stage 2 Menu 3: Save overall project period (projectStartDate - projectEndDate)
  const handleSaveProjectPeriod = async (payload: {
    projectStartDate: string;
    projectEndDate: string;
  }) => {
    if (!user || !isAuthorizedEditor || !selectedProject) return;
    setIsSavingProject(true);
    const targetProjectId = selectedProject.id;
    const projPath = `projects/${targetProjectId}`;
    try {
      await updateDoc(doc(db, 'projects', targetProjectId), {
        projectStartDate: payload.projectStartDate,
        projectEndDate: payload.projectEndDate,
        updatedAt: serverTimestamp(),
      });
      setProjects((prev) =>
        prev.map((p) =>
          p.id === targetProjectId
            ? {
                ...p,
                projectStartDate: payload.projectStartDate,
                projectEndDate: payload.projectEndDate,
              }
            : p
        )
      );
      showToast('บันทึกระยะเวลาการดำเนินงานโครงการเรียบร้อยแล้ว');
    } catch (err) {
      showToast(
        'ไม่สามารถบันทึกระยะเวลาโครงการได้ กรุณาลองใหม่อีกครั้ง',
        'warning'
      );
      handleFirestoreError(err, OperationType.UPDATE, projPath);
    } finally {
      setIsSavingProject(false);
    }
  };

  // Stage 2 Menu 3: Batch Create / Update Deliverables + sync project period & summary
  const handleSaveDeliverablesBatch = async (payload: {
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
  }) => {
    if (!user || !isAuthorizedEditor || !selectedProject) return;
    setIsSavingDeliverable(true);
    try {
      let nextList = [...selectedProjectDeliverables];

      for (const item of payload.items) {
        const targetId = item.id || generateSafeId('del');
        const delPath = `deliverables/${targetId}`;
        const existingDel = item.id
          ? deliverables.find((d) => d.id === item.id)
          : undefined;

        if (existingDel) {
          try {
            await updateDoc(doc(db, 'deliverables', targetId), {
              startDate: payload.projectStartDate,
              endDate: payload.projectEndDate,
              itemTitle: item.itemTitle,
              artifacts: item.artifacts,
              gpvDueDate: item.gpvDueDate,
              pmRequestDate: item.pmRequestDate,
              status: item.status,
              gpvSubmittedDate: item.gpvSubmittedDate,
              gpvEvidenceId: item.gpvEvidenceId,
              gpvEvidenceName: item.gpvEvidenceName,
              reminderSentAt: existingDel.reminderSentAt ?? '',
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.UPDATE, delPath);
          }
        } else {
          try {
            await setDoc(doc(db, 'deliverables', targetId), {
              projectId: selectedProject.id,
              ownerId: user.uid,
              startDate: payload.projectStartDate,
              endDate: payload.projectEndDate,
              itemTitle: item.itemTitle,
              artifacts: item.artifacts,
              gpvDueDate: item.gpvDueDate,
              pmRequestDate: item.pmRequestDate,
              status: item.status,
              gpvSubmittedDate: item.gpvSubmittedDate,
              gpvEvidenceId: item.gpvEvidenceId,
              gpvEvidenceName: item.gpvEvidenceName,
              reminderSentAt: '',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, delPath);
          }
        }

        const updatedRecord: ProjectDeliverable = {
          id: targetId,
          projectId: selectedProject.id,
          ownerId: existingDel?.ownerId ?? user.uid,
          startDate: payload.projectStartDate,
          endDate: payload.projectEndDate,
          itemTitle: item.itemTitle,
          artifacts: item.artifacts,
          gpvDueDate: item.gpvDueDate,
          pmRequestDate: item.pmRequestDate,
          status: item.status,
          gpvSubmittedDate: item.gpvSubmittedDate,
          gpvEvidenceId: item.gpvEvidenceId,
          gpvEvidenceName: item.gpvEvidenceName,
          reminderSentAt: existingDel?.reminderSentAt ?? '',
        };

        nextList = existingDel
          ? nextList.map((d) => (d.id === targetId ? updatedRecord : d))
          : [...nextList, updatedRecord];
      }

      await updateDoc(doc(db, 'projects', selectedProject.id), {
        deliverableSummary: buildDeliverableSummary(nextList),
        projectStartDate: payload.projectStartDate,
        projectEndDate: payload.projectEndDate,
        updatedAt: serverTimestamp(),
      });

      const isSingleEdit = payload.items.length === 1 && Boolean(payload.items[0].id);
      showToast(
        isSingleEdit
          ? 'อัปเดตรายการส่งมอบงานเรียบร้อยแล้ว'
          : `บันทึกรายการส่งมอบงาน (${payload.items.length} รายการ) เรียบร้อยแล้ว`
      );
    } finally {
      setIsSavingDeliverable(false);
    }
  };

  const handleDeleteDeliverable = async (deliverable: ProjectDeliverable) => {
    if (!user || !isAuthorizedEditor) return;
    const delPath = `deliverables/${deliverable.id}`;
    try {
      await deleteDoc(doc(db, 'deliverables', deliverable.id));
      const remaining = deliverables.filter(
        (d) => d.projectId === deliverable.projectId && d.id !== deliverable.id
      );
      await updateDoc(doc(db, 'projects', deliverable.projectId), {
        deliverableSummary: buildDeliverableSummary(remaining),
        updatedAt: serverTimestamp(),
      });
      showToast('ลบรายการส่งมอบงานออกจากระบบแล้ว');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, delPath);
    }
  };

  // Stage 2 Menu 4: Save schedule status (On time / Extended)
  const handleSaveScheduleStatus = async (payload: {
    scheduleStatus: ProjectScheduleStatus;
    extensionCount: number;
    extensionEvidenceId: string;
    extensionEvidenceName: string;
  }) => {
    if (!user || !isAuthorizedEditor || !selectedProject) return;
    setIsSavingProject(true);
    const targetProjectId = selectedProject.id;
    const projPath = `projects/${targetProjectId}`;
    const nextVersion = Math.max(1, Math.floor(selectedProject.version || 1)) + 1;
    try {
      await updateDoc(doc(db, 'projects', targetProjectId), {
        scheduleStatus: payload.scheduleStatus,
        extensionCount: payload.extensionCount,
        extensionEvidenceId: payload.extensionEvidenceId,
        extensionEvidenceName: payload.extensionEvidenceName,
        version: nextVersion,
        updatedAt: serverTimestamp(),
      });
      setProjects((prev) =>
        prev.map((p) =>
          p.id === targetProjectId
            ? {
                ...p,
                scheduleStatus: payload.scheduleStatus,
                extensionCount: payload.extensionCount,
                extensionEvidenceId: payload.extensionEvidenceId,
                extensionEvidenceName: payload.extensionEvidenceName,
                version: nextVersion,
              }
            : p
        )
      );
      if (
        payload.scheduleStatus === 'extended' &&
        !payload.extensionEvidenceId
      ) {
        showToast(
          'บันทึกสถานะขยายเวลาแล้ว (อย่าลืมกลับมาอัพโหลดเอกสารอนุมัติขยายเวลา)',
          'warning'
        );
      } else {
        showToast('บันทึกสถานะระยะเวลาดำเนินโครงการเรียบร้อยแล้ว');
      }
    } catch (err) {
      showToast(
        'ไม่สามารถบันทึกสถานะระยะเวลาดำเนินโครงการได้ กรุณาลองใหม่อีกครั้ง',
        'warning'
      );
      handleFirestoreError(err, OperationType.UPDATE, projPath);
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleDeleteProject = async (project: BudgetProject) => {
    if (!user || !isAuthorizedEditor) return;
    const projPath = `projects/${project.id}`;
    try {
      const [actSnap, wdSnap, evSnap, delSnap] = await Promise.all([
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
        getDocs(
          query(
            collection(db, 'projects', project.id, 'evidences'),
            where('projectId', '==', project.id)
          )
        ),
        getDocs(
          query(
            collection(db, 'deliverables'),
            where('projectId', '==', project.id)
          )
        ),
      ]);

      const evidenceChunkSnaps = await Promise.all(
        evSnap.docs.map((evDoc) =>
          getDocs(
            query(
              collection(
                db,
                'projects',
                project.id,
                'evidences',
                evDoc.id,
                'chunks'
              ),
              where('projectId', '==', project.id),
              where('evidenceId', '==', evDoc.id)
            )
          )
        )
      );

      const refsToDelete = [
        ...evidenceChunkSnaps.flatMap((snap) => snap.docs.map((d) => d.ref)),
        ...actSnap.docs.map((d) => d.ref),
        ...wdSnap.docs.map((d) => d.ref),
        ...evSnap.docs.map((d) => d.ref),
        ...delSnap.docs.map((d) => d.ref),
        doc(db, 'projects', project.id),
      ];

      for (let i = 0; i < refsToDelete.length; i += 450) {
        const chunk = refsToDelete.slice(i, i + 450);
        const batch = writeBatch(db);
        chunk.forEach((ref) => batch.delete(ref));
        await batch.commit();
      }

      if (editingStage1Project?.id === project.id) {
        setEditingStage1Project(null);
        setIsStage1ModalOpen(false);
      }
      if (selectedProjectId === project.id) {
        setSelectedProjectId(null);
        setViewMode('home');
      }
      showToast('ลบข้อมูลโครงการออกจากฐานข้อมูลแล้ว');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, projPath);
    }
  };

  // Clicking "แก้ไข" on Home table: Stage 1 opens Stage1Modal, Stage 2 opens 4-menu Workspace
  const handleEditFromTable = (project: BudgetProject) => {
    if (project.proposalStatus === 'approved') {
      setSelectedProjectId(project.id);
      setStage2InitialTab('tor_receipts');
      setViewMode('stage2_edit');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setEditingStage1Project(project);
      setIsStage1ModalOpen(true);
    }
  };

  const handleOpenProjectDetail = (project: BudgetProject) => {
    setSelectedProjectId(project.id);
    setViewMode('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveAllocations = async (
    rows: Array<{
      id: string;
      isNew?: boolean;
      order: number;
      activityName: string;
      amounts: Record<string, number>;
    }>
  ) => {
    if (!user || !isAuthorizedEditor || !selectedProject) return;
    setIsSavingAllocations(true);
    const projPath = `projects/${selectedProject.id}`;

    try {
      const batch = writeBatch(db);
      const incomingIds = new Set(rows.map((r) => r.id));

      activities.forEach((existingAct) => {
        if (!incomingIds.has(existingAct.id)) {
          batch.delete(
            doc(
              db,
              'projects',
              selectedProject.id,
              'activities',
              existingAct.id
            )
          );
        }
      });

      rows.forEach((row) => {
        const actRef = doc(
          db,
          'projects',
          selectedProject.id,
          'activities',
          row.id
        );
        const existingExists = activities.some((a) => a.id === row.id);
        if (!existingExists || row.isNew) {
          batch.set(actRef, {
            projectId: selectedProject.id,
            ownerId: user.uid,
            order: row.order,
            activityName: row.activityName,
            amounts: row.amounts,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.update(actRef, {
            order: row.order,
            activityName: row.activityName,
            amounts: row.amounts,
            updatedAt: serverTimestamp(),
          });
        }
      });

      batch.update(doc(db, 'projects', selectedProject.id), {
        version: selectedProject.version + 1,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      setIsPdfModalOpen(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, projPath);
    } finally {
      setIsSavingAllocations(false);
    }
  };

  const handleSubmitWithdrawal = async (payload: {
    agencyId: string;
    agencyName: string;
    agencyShortName: string;
    requesterName: string;
    recipientEmail: string;
    note: string;
    attachment: ProcessedAttachment;
    items: WithdrawalItem[];
    totalRequested: number;
  }) => {
    if (!user || !isAuthorizedEditor || !selectedProject) return;
    setIsSubmittingWithdrawal(true);
    const withdrawalId = generateSafeId('wd');
    const wdPath = `projects/${selectedProject.id}/withdrawals/${withdrawalId}`;
    const wdRef = doc(
      db,
      'projects',
      selectedProject.id,
      'withdrawals',
      withdrawalId
    );

    try {
      let inlineDataUrl = payload.attachment.dataUrl;
      let attachmentEvidenceId = '';

      if (inlineDataUrl.length > FIELD_LIMITS.INLINE_DATA_URL_MAX) {
        const uploaded = await saveProcessedProjectEvidence({
          projectId: selectedProject.id,
          ownerId: user.uid,
          category: 'withdrawal_doc',
          attachment: payload.attachment,
        });
        inlineDataUrl = '';
        attachmentEvidenceId = uploaded.evidenceId;
      }

      try {
        await setDoc(wdRef, {
          projectId: selectedProject.id,
          ownerId: user.uid,
          agencyId: payload.agencyId,
          agencyName: payload.agencyName,
          agencyShortName: payload.agencyShortName,
          requesterName: payload.requesterName,
          recipientEmail: payload.recipientEmail,
          note: payload.note,
          attachmentName: payload.attachment.name,
          attachmentMimeType: payload.attachment.mimeType,
          attachmentDataUrl: inlineDataUrl,
          attachmentEvidenceId,
          items: payload.items,
          totalRequested: payload.totalRequested,
          status: 'pending',
          emailSent: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, wdPath);
      }

      const inspectionUrl = `${window.location.origin}/?inspectProject=${encodeURIComponent(
        selectedProject.id
      )}&withdrawalId=${encodeURIComponent(withdrawalId)}`;

      const emailPayload = {
        toEmail: payload.recipientEmail,
        project: selectedProject,
        withdrawalId,
        agencyName: payload.agencyName,
        agencyShortName: payload.agencyShortName,
        requesterName: payload.requesterName,
        attachmentName: payload.attachment.name,
        note: payload.note,
        items: payload.items,
        totalRequested: payload.totalRequested,
        inspectionUrl,
      };

      try {
        await sendWithGmailToken((token) =>
          sendWithdrawalNotificationEmail(token, emailPayload)
        );
        try {
          await updateDoc(wdRef, {
            emailSent: true,
            updatedAt: serverTimestamp(),
          });
        } catch (updateErr) {
          handleFirestoreError(updateErr, OperationType.UPDATE, wdPath);
        }
        showToast(
          `บันทึกคำขอเบิกงบประมาณและส่งอีเมลแจ้งเตือนไปยัง ${payload.recipientEmail} เรียบร้อยแล้ว`,
          'success'
        );
      } catch (emailErr) {
        console.error('Gmail send failed after saving withdrawal:', emailErr);
        showToast(
          'บันทึกคำขอเบิกงบประมาณลงฐานข้อมูลแล้ว แต่ยังส่งอีเมลไม่สำเร็จ กรุณาตรวจสอบการอนุญาตเชื่อมต่อ Gmail',
          'warning'
        );
      }
    } finally {
      setIsSubmittingWithdrawal(false);
    }
  };

  const handleMarkInspected = async (withdrawal: BudgetWithdrawal) => {
    if (!user || !isAuthorizedEditor) return;
    setIsUpdatingWithdrawalStatus(true);
    const wdPath = `projects/${withdrawal.projectId}/withdrawals/${withdrawal.id}`;
    try {
      await updateDoc(
        doc(db, 'projects', withdrawal.projectId, 'withdrawals', withdrawal.id),
        {
          status: 'inspected',
          updatedAt: serverTimestamp(),
        }
      );
      showToast('ยืนยันสถานะ "ตรวจรับแล้ว" เรียบร้อย');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, wdPath);
    } finally {
      setIsUpdatingWithdrawalStatus(false);
    }
  };

  const handleDeleteWithdrawal = async (withdrawal: BudgetWithdrawal) => {
    if (!user || !isAuthorizedEditor) return;
    const wdPath = `projects/${withdrawal.projectId}/withdrawals/${withdrawal.id}`;
    try {
      await deleteDoc(
        doc(db, 'projects', withdrawal.projectId, 'withdrawals', withdrawal.id)
      );
      if (inspectingWithdrawalId === withdrawal.id) {
        setInspectingWithdrawalId(null);
      }
      showToast('ลบรายการขอเบิกงบประมาณออกจากฐานข้อมูลแล้ว');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, wdPath);
    }
  };

  const handleSendReminderEmail = async (
    deliverable: ProjectDeliverable,
    project: BudgetProject
  ) => {
    if (!user || !isAuthorizedEditor) return;
    setIsSendingReminder(true);
    try {
      const projectUrl = `${window.location.origin}/?project=${encodeURIComponent(
        project.id
      )}`;
      const daysRemaining = daysUntilIsoDate(deliverable.gpvDueDate);
      const statusLabel =
        DELIVERABLE_STATUS_LABELS[deliverable.status] ?? deliverable.status;

      await sendWithGmailToken((token) =>
        sendDeliverableReminderEmail(token, {
          toEmails: [...REMINDER_RECIPIENT_EMAILS],
          project,
          itemTitle: deliverable.itemTitle,
          startDate: deliverable.startDate || project.projectStartDate || '',
          endDate: deliverable.endDate || project.projectEndDate || '',
          gpvDueDate: deliverable.gpvDueDate,
          pmRequestDate: deliverable.pmRequestDate,
          daysRemaining,
          artifacts: deliverable.artifacts,
          statusLabel,
          projectUrl,
        })
      );

      const todayIso = getTodayIsoDate();
      await updateDoc(doc(db, 'deliverables', deliverable.id), {
        reminderSentAt: todayIso,
        updatedAt: serverTimestamp(),
      });

      showToast(
        `ส่งอีเมลแจ้งเตือนกำหนดส่ง กปว. ไปยัง ${REMINDER_RECIPIENT_EMAILS.join(', ')} เรียบร้อยแล้ว`
      );
    } catch (err) {
      console.error('Failed to send deliverable reminder email:', err);
      showToast(
        'ไม่สามารถส่งอีเมลแจ้งเตือน กปว. ได้ กรุณาตรวจสอบสิทธิ์การส่ง Gmail แล้วลองใหม่อีกครั้ง',
        'warning'
      );
    } finally {
      setIsSendingReminder(false);
    }
  };

  const handleExportCsv = async () => {
    if (!user || !isAuthorizedEditor) return;
    setIsExportingCsv(true);
    try {
      const exportedCount = await exportAllProjectsToCsv();
      showToast(
        `ดาวน์โหลดไฟล์ CSV ข้อมูลทั้งหมด (${exportedCount} โครงการ) เรียบร้อยแล้ว`
      );
    } catch (err) {
      console.error('Export CSV failed:', err);
      showToast(
        'ไม่สามารถดึงข้อมูลเพื่อ Export CSV ได้ กรุณาลองใหม่อีกครั้ง',
        'warning'
      );
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleCloseInspectModal = () => {
    setInspectingWithdrawalId(null);
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-600">
          กำลังตรวจสอบสถานะการเข้าสู่ระบบ...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8">
          <h1 className="text-2xl font-bold text-slate-900">
            ระบบบริหารจัดการโครงการและงบประมาณ
          </h1>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            ติดตามข้อเสนอโครงการ (Stage 1) การรับงบประมาณตาม TOR การจัดสรรและขอเบิกงบประมาณ
            การส่งมอบงาน กปว. พร้อมระบบแจ้งเตือนทางอีเมลและส่งออกเอกสาร PDF
          </p>

          {authError && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <button
            type="button"
            disabled={isSigningIn}
            onClick={handleSignIn}
            className="mt-6 w-full inline-flex items-center justify-center gap-3 px-5 py-3 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors whitespace-nowrap shadow-xs"
          >
            <svg
              className="w-5 h-5 shrink-0"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            {isSigningIn ? 'กำลังเข้าสู่ระบบ...' : 'Sign in with Google'}
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthorizedEditor) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8 text-center">
          <ShieldAlert className="w-12 h-12 text-amber-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900">
            บัญชีนี้ยังไม่มีสิทธิ์เข้าถึงระบบ
          </h1>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            ในระยะแรก ระบบเปิดให้เฉพาะบัญชีผู้รับผิดชอบโครงการที่ได้รับอนุญาตเท่านั้นที่สามารถเข้าดูและแก้ไขข้อมูลได้
          </p>
          <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-mono">
            บัญชีปัจจุบัน: {user.email || 'ไม่ระบุอีเมล'}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            ผู้ได้รับอนุญาต: {AUTHORIZED_EDITOR_EMAILS.join(', ')}
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800"
          >
            <LogOut className="w-4 h-4" />
            ออกจากระบบและเปลี่ยนบัญชี Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar Contract (3 zones, hidden when printing) */}
      <header className="no-print bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <button
            type="button"
            onClick={() => setViewMode('home')}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 hover:text-blue-900 transition-colors"
          >
            ระบบบริหารจัดการโครงการ
          </button>

          <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setViewMode('home')}
              className={`whitespace-nowrap shrink-0 transition-colors ${
                viewMode === 'home'
                  ? 'text-blue-900 font-semibold'
                  : 'hover:text-slate-900'
              }`}
            >
              หน้าแรก (Dashboard)
            </button>

            {selectedProject && (
              <>
                <button
                  type="button"
                  onClick={() => setViewMode('detail')}
                  className={`whitespace-nowrap shrink-0 transition-colors ${
                    viewMode === 'detail'
                      ? 'text-blue-900 font-semibold'
                      : 'hover:text-slate-900'
                  }`}
                >
                  ข้อมูลโครงการ
                </button>
                {selectedProject.proposalStatus === 'approved' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setStage2InitialTab('tor_receipts');
                        setViewMode('stage2_edit');
                      }}
                      className={`whitespace-nowrap shrink-0 transition-colors ${
                        viewMode === 'stage2_edit'
                          ? 'text-blue-900 font-semibold'
                          : 'hover:text-slate-900'
                      }`}
                    >
                      จัดการ Stage 2
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('allocate')}
                      className={`whitespace-nowrap shrink-0 transition-colors ${
                        viewMode === 'allocate'
                          ? 'text-blue-900 font-semibold'
                          : 'hover:text-slate-900'
                      }`}
                    >
                      ตารางจัดสรรงบ
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('withdraw')}
                      className={`whitespace-nowrap shrink-0 transition-colors ${
                        viewMode === 'withdraw'
                          ? 'text-blue-900 font-semibold'
                          : 'hover:text-slate-900'
                      }`}
                    >
                      ขอเบิก &amp; ตรวจรับ ({withdrawals.length})
                    </button>
                  </>
                )}
              </>
            )}
          </nav>

          <div className="flex items-center gap-4 shrink-0">
            <span className="hidden sm:inline text-xs text-slate-500 truncate max-w-[200px]">
              {user.email || user.displayName}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport (hidden during print) */}
      <main className="no-print max-w-[1280px] mx-auto px-6 py-8 space-y-6">
        {toast && (
          <div
            className={`flex items-center gap-2 px-4 py-3 border rounded-xl text-sm ${
              toast.type === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {toast.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{toast.text}</span>
          </div>
        )}

        {viewMode === 'home' ? (
          <HomeDashboard
            projects={projects}
            deliverables={deliverables}
            loading={loadingProjects || loadingDeliverables}
            isSendingReminder={isSendingReminder}
            isExportingCsv={isExportingCsv}
            onAddProject={() => {
              setEditingStage1Project(null);
              setIsStage1ModalOpen(true);
            }}
            onExportCsv={handleExportCsv}
            onOpenProjectDetail={handleOpenProjectDetail}
            onEditProject={handleEditFromTable}
            onDeleteProject={handleDeleteProject}
            onSendReminderEmail={handleSendReminderEmail}
          />
        ) : viewMode === 'detail' && selectedProject ? (
          <ProjectDetailDashboard
            project={selectedProject}
            deliverables={selectedProjectDeliverables}
            isSendingReminder={isSendingReminder}
            onBack={() => setViewMode('home')}
            onOpenStage1Edit={() => {
              setEditingStage1Project(selectedProject);
              setIsStage1ModalOpen(true);
            }}
            onOpenStage2Edit={(tab) => {
              setStage2InitialTab(tab ?? 'tor_receipts');
              setViewMode('stage2_edit');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenAllocationTable={() => {
              setViewMode('allocate');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenPdf={() => setIsPdfModalOpen(true)}
            onOpenWithdraw={() => {
              setViewMode('withdraw');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSendReminderEmail={handleSendReminderEmail}
          />
        ) : viewMode === 'stage2_edit' &&
          selectedProject &&
          selectedProject.proposalStatus === 'approved' ? (
          <Stage2EditWorkspace
            project={selectedProject}
            deliverables={selectedProjectDeliverables}
            initialTab={stage2InitialTab}
            currentUserId={user.uid}
            isSavingProject={isSavingProject}
            isSavingDeliverable={isSavingDeliverable}
            isSendingReminder={isSendingReminder}
            onBackHome={() => setViewMode('home')}
            onOpenDetail={() => setViewMode('detail')}
            onSaveTorReceipts={handleSaveTorReceipts}
            onSaveAllocationSetup={handleSaveAllocationSetup}
            onSaveProjectPeriod={handleSaveProjectPeriod}
            onSaveDeliverablesBatch={handleSaveDeliverablesBatch}
            onDeleteDeliverable={handleDeleteDeliverable}
            onSaveScheduleStatus={handleSaveScheduleStatus}
            onOpenPdfOnly={() => setIsPdfModalOpen(true)}
            onOpenWithdraw={() => {
              setViewMode('withdraw');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenStage1MetaEdit={() => {
              setEditingStage1Project(selectedProject);
              setIsStage1ModalOpen(true);
            }}
            onSendReminderEmail={handleSendReminderEmail}
          />
        ) : viewMode === 'allocate' && selectedProject ? (
          <AllocationEditor
            project={selectedProject}
            activities={activities}
            loadingActivities={loadingActivities}
            isSaving={isSavingAllocations}
            onBack={() => {
              setStage2InitialTab('allocation_setup');
              setViewMode('stage2_edit');
            }}
            onSaveAllocations={handleSaveAllocations}
            onOpenPdfOnly={() => setIsPdfModalOpen(true)}
          />
        ) : viewMode === 'withdraw' && selectedProject ? (
          <WithdrawalWorkspace
            project={selectedProject}
            activities={activities}
            withdrawals={withdrawals}
            loadingActivities={loadingActivities}
            loadingWithdrawals={loadingWithdrawals}
            defaultRequesterName={user.displayName || user.email || ''}
            isSubmitting={isSubmittingWithdrawal}
            onBack={() => setViewMode('detail')}
            onSubmitWithdrawal={handleSubmitWithdrawal}
            onOpenInspect={(w) => setInspectingWithdrawalId(w.id)}
            onDeleteWithdrawal={handleDeleteWithdrawal}
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
            <p className="text-sm text-slate-600">
              ไม่พบข้อมูลโครงการที่เลือก กรุณากลับไปยังหน้าแรก
            </p>
            <button
              type="button"
              onClick={() => setViewMode('home')}
              className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800"
            >
              กลับหน้าแรก
            </button>
          </div>
        )}
      </main>

      {/* Stage 1 Add / Update Status Modal */}
      {isStage1ModalOpen && (
        <Stage1ProjectModal
          editingProject={editingStage1Project}
          isSaving={isSavingProject}
          onSave={handleSaveStage1}
          onClose={() => {
            setIsStage1ModalOpen(false);
            setEditingStage1Project(null);
          }}
        />
      )}

      {/* PDF Popup Preview + Print Output (Allocation) */}
      {isPdfModalOpen && selectedProject && (
        <PdfPreviewModal
          project={selectedProject}
          activities={activities}
          onClose={() => setIsPdfModalOpen(false)}
        />
      )}

      {/* Withdrawal Inspection Modal + Print Output */}
      {inspectingWithdrawal && selectedProject && (
        <WithdrawalInspectModal
          project={selectedProject}
          withdrawal={inspectingWithdrawal}
          isUpdatingStatus={isUpdatingWithdrawalStatus}
          onMarkInspected={handleMarkInspected}
          onClose={handleCloseInspectModal}
        />
      )}
    </div>
  );
}

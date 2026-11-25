import type { Timestamp } from 'firebase/firestore';

export const AUTHORIZED_EDITOR_EMAILS = [
  'piyathida.suriya@gmail.com',
  'charinyapak9205@gmail.com',
] as const;

export const REMINDER_RECIPIENT_EMAILS = [
  'piyathida.suriya@gmail.com',
  'charinyapak9205@gmail.com',
] as const;

export const DEFAULT_INSPECTOR_EMAIL = 'piyathida.suriya@gmail.com';

export interface AgencyItem {
  id: string;
  name: string;
  shortName?: string;
}

export interface PresetAgencyOption {
  code: string;
  name: string;
}

export const PRESET_AGENCIES: PresetAgencyOption[] = [
  { code: 'RSP South', name: 'อุทยานวิทยาศาสตร์ภูมิภาค ภาคใต้' },
  {
    code: 'PSUSP',
    name: 'อุทยานวิทยาศาสตร์ มหาวิทยาลัยสงขลานครินทร์',
  },
  {
    code: 'WU',
    name: 'อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยวลัยลักษณ์',
  },
  {
    code: 'TSU',
    name: 'อุทยานวิทยาศาสตร์และนวัตกรรมสังคม มหาวิทยาลัยทักษิณ',
  },
  { code: 'RUTS', name: 'มหาวิทยาลัยเทคโนโลยีราชมงคลศรีวิชัย' },
  { code: 'PNU', name: 'มหาวิทยาลัยนราธิวาสราชนครินทร์' },
  { code: 'SKRU', name: 'มหาวิทยาลัยราชภัฏสงขลา' },
  { code: 'PKRU', name: 'มหาวิทยาลัยราชภัฏภูเก็ต' },
  { code: 'YRU', name: 'มหาวิทยาลัยราชภัฏยะลา' },
  { code: 'SRU', name: 'มหาวิทยาลัยราชภัฏสุราษฎร์ธานี' },
  { code: 'NSTRU', name: 'มหาวิทยาลัยราชภัฏนครศรีธรรมราช' },
];

export interface InstallmentItem {
  id: string;
  order: number;
  percentage: number;
}

export interface ReviewerItem {
  name: string;
  position: string;
}

export const DEFAULT_ALLOCATION_PERSONNEL = {
  preparer: 'นางปิยธิดา เยี่ยมยกกุล',
  preparerPosition: 'เจ้าหน้าที่ประสานงานโครงการ',
  reviewerItems: [
    { name: 'นางสาวศุภพิชญ์ มากแก้ว', position: 'หัวหน้าสำนักงานกลาง' },
    { name: 'นางนิภาพร จอนเจือ', position: 'หัวหน้าสำนักงาน (การเงิน/บัญชี)' },
    { name: 'ผศ.ดร.วิชัยรัตน์ แก้วเจือ', position: 'ผู้ช่วยผู้อำนวยการ อว.ม.อ' },
    { name: 'ผศ.ดร.รัญชนา สินธวาลัย', position: 'รองผู้อำนวยการ อว.ม.อ' },
  ] as ReviewerItem[],
  approver: 'ผู้ช่วยศาสตราจารย์คำรณ พิทักษ์',
  approverPosition: 'ผู้อำนวยการอุทยานวิทยาศาสตร์ภูมิภาค ภาคใต้',
};

export type ProposalStatus = 'drafting' | 'submitted' | 'approved' | 'rejected';

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  drafting: 'จัดทำข้อเสนอโครงการ',
  submitted: 'ยื่นต่อแหล่งทุน',
  approved: 'แหล่งทุนอนุมัติ',
  rejected: 'แหล่งทุนไม่อนุมัติ',
};

export type TorReceiptStatus =
  | 'waiting'
  | 'received_from_funder'
  | 'received_from_university';

export const TOR_RECEIPT_STATUS_LABELS: Record<TorReceiptStatus, string> = {
  waiting: 'รอรับงบ',
  received_from_funder: 'รับงบจากแหล่งทุนแล้ว',
  received_from_university: 'รับงบจากมหาวิทยาลัยแล้ว',
};

export interface TorInstallmentItem {
  id: string;
  order: number;
  amount: number;
  status: TorReceiptStatus;
  funderReceivedDate: string;
  funderEvidenceId: string;
  funderEvidenceName: string;
  universityReceivedDate: string;
  universityEvidenceId: string;
  universityEvidenceName: string;
}

export type ProjectScheduleStatus = 'on_time' | 'extended';

export const SCHEDULE_STATUS_LABELS: Record<ProjectScheduleStatus, string> = {
  on_time: 'On time',
  extended: 'ขยายเวลา',
};

export type DeliverableStatus =
  | 'notify_pm'
  | 'following_pm'
  | 'preparing_report'
  | 'submitted_gpv';

export const DELIVERABLE_STATUS_LABELS: Record<DeliverableStatus, string> = {
  notify_pm: 'แจ้ง PM',
  following_pm: 'อยู่ระหว่างติดตามรายงานจาก PM',
  preparing_report: 'จัดรายงาน',
  submitted_gpv: 'ส่งกปว.เรียบร้อย',
};

export interface DeliverableArtifact {
  id: string;
  name: string;
  quantity: string;
}

export interface ProjectDeliverable {
  id: string;
  projectId: string;
  ownerId: string;
  startDate: string;
  endDate: string;
  itemTitle: string;
  artifacts: DeliverableArtifact[];
  gpvDueDate: string;
  pmRequestDate: string;
  status: DeliverableStatus;
  gpvSubmittedDate: string;
  gpvEvidenceId: string;
  gpvEvidenceName: string;
  reminderSentAt: string;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
}

export interface DeliverableSummary {
  count: number;
  latestItemTitle: string;
  latestStatus: string;
  nextGpvDueDate: string;
  nextPmRequestDate: string;
}

export type EvidenceCategory =
  | 'tor_funder'
  | 'tor_university'
  | 'gpv_submit'
  | 'extension'
  | 'proposal_doc'
  | 'withdrawal_doc';

export interface ProjectEvidence {
  id: string;
  projectId: string;
  ownerId: string;
  category: EvidenceCategory;
  fileName: string;
  mimeType: AllowedAttachmentMime;
  dataUrl: string;
  chunkCount?: number;
  createdAt?: Timestamp | Date | null;
}

export interface BudgetProject {
  id: string;
  ownerId: string;
  fiscalYear: number;
  name: string;
  shortName?: string;
  funderName?: string;
  proposalStatus: ProposalStatus;
  requestedBudget: number;
  submittedDate: string;
  proposalEvidenceId?: string;
  proposalEvidenceName?: string;
  approvedBudget: number;
  torInstallments: TorInstallmentItem[];
  scheduleStatus: ProjectScheduleStatus;
  extensionCount: number;
  extensionEvidenceId: string;
  extensionEvidenceName: string;
  deliverableSummary?: DeliverableSummary;
  projectStartDate?: string;
  projectEndDate?: string;
  totalBudget: number;
  agencies: AgencyItem[];
  installments: InstallmentItem[];
  preparer: string;
  preparerPosition?: string;
  reviewers: string[];
  reviewerItems?: ReviewerItem[];
  approver: string;
  approverPosition?: string;
  version: number;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
}

export interface BudgetActivity {
  id: string;
  projectId: string;
  ownerId: string;
  order: number;
  activityName: string;
  amounts: Record<string, number>;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
}

export interface EditableActivityRow {
  id: string;
  isNew?: boolean;
  order: number;
  activityName: string;
  amounts: Record<string, string>;
}

export interface ProjectFormValues {
  fiscalYear: number;
  name: string;
  shortName: string;
  totalBudget: string;
  agencies: Array<{ id: string; name: string; shortName: string }>;
  installments: Array<{ id: string; order: number; percentage: string }>;
  preparer: string;
  preparerPosition: string;
  reviewerItems: ReviewerItem[];
  approver: string;
  approverPosition: string;
}

export interface WithdrawalItem {
  activityId: string;
  activityName: string;
  installmentId: string;
  installmentOrder: number;
  installmentPercentage: number;
  amount: number;
}

export type WithdrawalStatus = 'pending' | 'inspected';
export type AllowedAttachmentMime =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png';

export interface BudgetWithdrawal {
  id: string;
  projectId: string;
  ownerId: string;
  agencyId: string;
  agencyName: string;
  agencyShortName: string;
  requesterName: string;
  recipientEmail: string;
  note: string;
  attachmentName: string;
  attachmentMimeType: AllowedAttachmentMime;
  attachmentDataUrl: string;
  attachmentEvidenceId?: string;
  items: WithdrawalItem[];
  totalRequested: number;
  status: WithdrawalStatus;
  emailSent: boolean;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
}

export const FIELD_LIMITS = {
  NAME_MAX: 500,
  SHORT_NAME_MAX: 150,
  FUNDER_NAME_MAX: 300,
  AGENCY_NAME_MAX: 200,
  AGENCY_SHORT_NAME_MAX: 100,
  MAX_AGENCIES: 30,
  MAX_INSTALLMENTS: 24,
  MAX_TOR_INSTALLMENTS: 24,
  PERSON_NAME_MAX: 150,
  POSITION_MAX: 150,
  MAX_REVIEWERS: 20,
  ACTIVITY_NAME_MAX: 400,
  MAX_ACTIVITIES: 500,
  MAX_BUDGET: 100_000_000_000,
  NOTE_MAX: 500,
  ATTACHMENT_NAME_MAX: 255,
  MAX_FILE_BYTES: 5 * 1024 * 1024,
  INLINE_DATA_URL_MAX: 700_000,
  CHUNK_SIZE_CHARS: 700_000,
  ATTACHMENT_DATA_MAX: 7_200_000,
  MAX_WITHDRAWAL_ITEMS: 100,
  DELIVERABLE_TITLE_MAX: 400,
  ARTIFACT_NAME_MAX: 300,
  ARTIFACT_QTY_MAX: 60,
  MAX_ARTIFACTS: 30,
} as const;

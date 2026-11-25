import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Upload,
  Send,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Mail,
  Trash2,
  X,
  Paperclip,
} from 'lucide-react';
import {
  DEFAULT_INSPECTOR_EMAIL,
  FIELD_LIMITS,
  type BudgetActivity,
  type BudgetProject,
  type BudgetWithdrawal,
  type WithdrawalItem,
} from '../types/budget';
import {
  computeInstallmentAmounts,
  formatCurrency,
  formatPercent,
  formatThaiDateTime,
  round2,
} from '../utils/formatters';
import {
  processWithdrawalAttachment,
  type ProcessedAttachment,
} from '../utils/fileUpload';
import { isValidEmail } from '../utils/gmail';

interface WithdrawalWorkspaceProps {
  project: BudgetProject;
  activities: BudgetActivity[];
  withdrawals: BudgetWithdrawal[];
  loadingActivities: boolean;
  loadingWithdrawals: boolean;
  defaultRequesterName: string;
  isSubmitting: boolean;
  onBack: () => void;
  onSubmitWithdrawal: (payload: {
    agencyId: string;
    agencyName: string;
    agencyShortName: string;
    requesterName: string;
    recipientEmail: string;
    note: string;
    attachment: ProcessedAttachment;
    items: WithdrawalItem[];
    totalRequested: number;
  }) => Promise<void>;
  onOpenInspect: (withdrawal: BudgetWithdrawal) => void;
  onDeleteWithdrawal: (withdrawal: BudgetWithdrawal) => Promise<void>;
}

function selectionKey(activityId: string, installmentId: string): string {
  return `${activityId}__${installmentId}`;
}

export const WithdrawalWorkspace: React.FC<WithdrawalWorkspaceProps> = ({
  project,
  activities,
  withdrawals,
  loadingActivities,
  loadingWithdrawals,
  defaultRequesterName,
  isSubmitting,
  onBack,
  onSubmitWithdrawal,
  onOpenInspect,
  onDeleteWithdrawal,
}) => {
  const [activeTab, setActiveTab] = useState<'request' | 'history'>('request');
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>(
    () => project.agencies[0]?.id ?? ''
  );

  const [attachment, setAttachment] = useState<ProcessedAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const [requesterName, setRequesterName] = useState<string>(
    defaultRequesterName || ''
  );
  const [recipientEmail, setRecipientEmail] = useState<string>(
    DEFAULT_INSPECTOR_EMAIL
  );
  const [note, setNote] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (
      project.agencies.length > 0 &&
      !project.agencies.some((a) => a.id === selectedAgencyId)
    ) {
      setSelectedAgencyId(project.agencies[0].id);
    }
  }, [project.agencies, selectedAgencyId]);

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [selectedAgencyId]);

  const selectedAgency = useMemo(
    () => project.agencies.find((a) => a.id === selectedAgencyId) ?? null,
    [project.agencies, selectedAgencyId]
  );

  // Track which (activityId, installmentId) pairs were already requested for this agency
  const alreadyRequestedKeys = useMemo(() => {
    const claimed = new Set<string>();
    withdrawals
      .filter((w) => w.agencyId === selectedAgencyId)
      .forEach((w) => {
        w.items.forEach((item) => {
          claimed.add(selectionKey(item.activityId, item.installmentId));
        });
      });
    return claimed;
  }, [withdrawals, selectedAgencyId]);

  const sortedActivities = useMemo(
    () => [...activities].sort((a, b) => a.order - b.order),
    [activities]
  );

  // Build activity matrix with installment splits for the selected agency
  const activityMatrix = useMemo(() => {
    return sortedActivities
      .map((act) => {
        const agencyTotal = round2(Number(act.amounts?.[selectedAgencyId] ?? 0));
        const installmentSplits = computeInstallmentAmounts(
          agencyTotal,
          project.installments
        );
        return {
          activity: act,
          agencyTotal,
          installmentSplits,
        };
      })
      .filter((row) => row.agencyTotal > 0);
  }, [sortedActivities, selectedAgencyId, project.installments]);

  const selectedItems: WithdrawalItem[] = useMemo(() => {
    const list: WithdrawalItem[] = [];
    activityMatrix.forEach((row) => {
      project.installments.forEach((inst, instIdx) => {
        const key = selectionKey(row.activity.id, inst.id);
        if (selectedKeys.has(key) && !alreadyRequestedKeys.has(key)) {
          const amount = row.installmentSplits[instIdx] ?? 0;
          if (amount > 0) {
            list.push({
              activityId: row.activity.id,
              activityName: row.activity.activityName,
              installmentId: inst.id,
              installmentOrder: inst.order,
              installmentPercentage: inst.percentage,
              amount,
            });
          }
        }
      });
    });
    return list;
  }, [activityMatrix, project.installments, selectedKeys, alreadyRequestedKeys]);

  const totalRequested = useMemo(
    () => round2(selectedItems.reduce((sum, item) => sum + item.amount, 0)),
    [selectedItems]
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setAttachmentError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const processed = await processWithdrawalAttachment(file);
      setAttachment(processed);
    } catch (err) {
      setAttachmentError(
        err instanceof Error ? err.message : 'ไม่สามารถอัพโหลดไฟล์ได้'
      );
      setAttachment(null);
    } finally {
      e.target.value = '';
    }
  };

  const toggleCell = (activityId: string, installmentId: string) => {
    const key = selectionKey(activityId, installmentId);
    if (alreadyRequestedKeys.has(key)) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleWholeInstallment = (installmentId: string) => {
    const eligibleKeys = activityMatrix
      .map((row) => selectionKey(row.activity.id, installmentId))
      .filter((key) => !alreadyRequestedKeys.has(key));

    if (eligibleKeys.length === 0) return;
    const allSelected = eligibleKeys.every((k) => selectedKeys.has(k));

    setSelectedKeys((prev) => {
      const next = new Set(prev);
      eligibleKeys.forEach((k) => {
        if (allSelected) {
          next.delete(k);
        } else {
          next.add(k);
        }
      });
      return next;
    });
  };

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedAgency) {
      setFormError('กรุณาเลือกหน่วยงานที่ขอเบิกงบประมาณ');
      return;
    }
    if (!attachment) {
      setFormError('กรุณาอัพโหลดหนังสือขอเบิกเงินงบประมาณ (PDF, JPG หรือ PNG)');
      return;
    }
    if (selectedItems.length === 0) {
      setFormError('กรุณาเลือกรายการกิจกรรมและงวดที่ต้องการขอเบิกอย่างน้อย 1 รายการ');
      return;
    }
    if (selectedItems.length > FIELD_LIMITS.MAX_WITHDRAWAL_ITEMS) {
      setFormError(
        `เลือกได้สูงสุด ${FIELD_LIMITS.MAX_WITHDRAWAL_ITEMS} รายการต่อคำขอเบิก`
      );
      return;
    }
    if (!requesterName.trim()) {
      setFormError('กรุณากรอกชื่อผู้ยื่นคำขอเบิก');
      return;
    }
    if (!isValidEmail(recipientEmail)) {
      setFormError('กรุณากรอกอีเมลผู้รับแจ้งเตือนให้ถูกต้อง');
      return;
    }

    setConfirmModalOpen(true);
  };

  const handleConfirmedSubmit = async () => {
    if (!selectedAgency || !attachment) return;
    await onSubmitWithdrawal({
      agencyId: selectedAgency.id,
      agencyName: selectedAgency.name,
      agencyShortName: selectedAgency.shortName ?? '',
      requesterName: requesterName.trim().slice(0, FIELD_LIMITS.PERSON_NAME_MAX),
      recipientEmail: recipientEmail.trim(),
      note: note.trim().slice(0, FIELD_LIMITS.NOTE_MAX),
      attachment,
      items: selectedItems,
      totalRequested,
    });

    setConfirmModalOpen(false);
    setAttachment(null);
    setSelectedKeys(new Set());
    setNote('');
    setActiveTab('history');
  };

  const handleConfirmDelete = async (w: BudgetWithdrawal) => {
    setDeletingId(w.id);
    try {
      await onDeleteWithdrawal(w);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200">
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
              <h2 className="text-xl font-semibold text-slate-900">
                ระบบขอเบิกงบประมาณและตรวจรับ
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                โครงการ:{' '}
                <span className="font-medium text-slate-900">
                  {project.shortName ? `[${project.shortName}] ` : ''}
                  {project.name}
                </span>{' '}
                · ปีงบประมาณ พ.ศ. {project.fiscalYear}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start lg:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab('request')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'request'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ยื่นคำขอเบิกงบประมาณ
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                activeTab === 'history'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              รายการขอเบิก &amp; ตรวจรับ ({withdrawals.length})
            </button>
          </div>
        </div>

        {activeTab === 'request' ? (
          <form onSubmit={handlePreSubmit} className="pt-6 space-y-6">
            {formError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {/* Step 1: Select Agency + Upload Official Letter */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 space-y-4">
                <div>
                  <label
                    htmlFor="withdrawAgency"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    1. หน่วยงานที่ได้รับจัดสรร (ผู้ขอเบิก)
                  </label>
                  <select
                    id="withdrawAgency"
                    value={selectedAgencyId}
                    onChange={(e) => setSelectedAgencyId(e.target.value)}
                    className="w-full h-11 px-3.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                  >
                    {project.agencies.map((ag, idx) => (
                      <option key={ag.id} value={ag.id}>
                        {idx + 1}. {ag.name}
                        {ag.shortName ? ` (${ag.shortName})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="requesterName"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    ผู้ยื่นคำขอเบิก
                  </label>
                  <input
                    id="requesterName"
                    type="text"
                    maxLength={FIELD_LIMITS.PERSON_NAME_MAX}
                    value={requesterName}
                    onChange={(e) => setRequesterName(e.target.value)}
                    placeholder="ระบุชื่อ-สกุล ผู้ขอเบิก"
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="recipientEmail"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    อีเมลผู้รับแจ้งเตือนเพื่อตรวจรับ
                  </label>
                  <input
                    id="recipientEmail"
                    type="email"
                    maxLength={200}
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                  />
                </div>
              </div>

              {/* Upload Official Letter */}
              <div className="lg:col-span-7 flex flex-col">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  2. อัพโหลดหนังสือขอเบิกเงินงบประมาณ (PDF, JPG, PNG · ไม่เกิน 5 MB)
                </label>

                {attachment ? (
                  <div className="flex-1 flex flex-col justify-between border border-emerald-300 bg-emerald-50/50 rounded-xl p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <Paperclip className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-slate-900 break-all">
                            {attachment.name}
                          </p>
                          <p className="text-xs text-emerald-700 mt-0.5">
                            แนบไฟล์หนังสือขอเบิกเรียบร้อยแล้ว
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAttachment(null)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 whitespace-nowrap shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        เปลี่ยนไฟล์
                      </button>
                    </div>
                  </div>
                ) : (
                  <label
                    htmlFor="withdrawalFileInput"
                    className="flex-1 min-h-[170px] border-2 border-dashed border-slate-300 hover:border-blue-900 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer bg-slate-50/70 hover:bg-blue-50/30 transition-colors"
                  >
                    <Upload className="w-8 h-8 text-slate-400 mb-2" />
                    <span className="text-sm font-medium text-slate-700">
                      คลิกเพื่อเลือกไฟล์หนังสือขอเบิกเงินงบประมาณ
                    </span>
                    <span className="text-xs text-slate-500 mt-1">
                      รองรับไฟล์ PDF, JPG หรือ PNG (ระบบจะย่อขนาดรูปภาพให้อัตโนมัติ)
                    </span>
                    <input
                      id="withdrawalFileInput"
                      type="file"
                      accept=".pdf,application/pdf,image/jpeg,image/png"
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                  </label>
                )}

                {attachmentError && (
                  <p className="text-xs text-red-600 mt-2">{attachmentError}</p>
                )}
              </div>
            </div>

            {/* Step 2: Activity x Installment Multi-Select Matrix */}
            <div className="pt-4 border-t border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    3. เลือกรายการกิจกรรมและงวดที่จะขอเบิกในรอบนี้ (เลือกได้หลายกิจกรรมพร้อมกัน)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    แสดงเฉพาะกิจกรรมที่ได้รับการจัดสรรงบประมาณของ{' '}
                    {selectedAgency?.name || 'หน่วยงานนี้'}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-xs text-slate-500 mr-2">
                    เลือกแล้ว {selectedItems.length} รายการ:
                  </span>
                  <span className="text-base font-bold font-mono tabular-nums text-blue-900">
                    {formatCurrency(totalRequested)} บาท
                  </span>
                </div>
              </div>

              {loadingActivities ? (
                <div className="h-32 bg-slate-100 rounded-lg animate-pulse" />
              ) : activityMatrix.length === 0 ? (
                <div className="p-8 text-center border border-slate-200 rounded-xl bg-slate-50">
                  <p className="text-sm font-medium text-slate-700">
                    ยังไม่มีงบประมาณจัดสรรสำหรับหน่วยงานนี้
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    กรุณาไปที่หน้า &ldquo;จัดสรรงบประมาณ&rdquo; เพื่อบันทึกยอดจัดสรรของหน่วยงานนี้ก่อนขอเบิกค่ะ
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                        <th className="py-3 px-3 w-12 text-center border-r border-slate-200">
                          ที่
                        </th>
                        <th className="py-3 px-4 min-w-[240px] border-r border-slate-200">
                          รายการกิจกรรม
                        </th>
                        <th className="py-3 px-4 text-right w-40 border-r border-slate-200">
                          งบจัดสรรรวม (บาท)
                        </th>
                        {project.installments.map((inst, idx) => (
                          <th
                            key={inst.id}
                            className="py-2.5 px-3 text-center min-w-[140px] border-r last:border-r-0 border-slate-200"
                          >
                            <div className="font-semibold">
                              งวดที่ {idx + 1} ({formatPercent(inst.percentage)}%)
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleWholeInstallment(inst.id)}
                              className="mt-1 text-[11px] font-medium text-blue-900 hover:underline"
                            >
                              เลือก/ยกเลิกทั้งงวด
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200 text-sm">
                      {activityMatrix.map((row, idx) => (
                        <tr key={row.activity.id} className="hover:bg-slate-50/50">
                          <td className="py-3 px-3 text-center font-mono tabular-nums text-xs text-slate-500 border-r border-slate-200">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900 border-r border-slate-200">
                            {row.activity.activityName}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-800 border-r border-slate-200">
                            {formatCurrency(row.agencyTotal)}
                          </td>
                          {project.installments.map((inst, instIdx) => {
                            const amt = row.installmentSplits[instIdx] ?? 0;
                            const key = selectionKey(row.activity.id, inst.id);
                            const isClaimed = alreadyRequestedKeys.has(key);
                            const isChecked = selectedKeys.has(key);

                            return (
                              <td
                                key={inst.id}
                                className={`py-2.5 px-3 text-center border-r last:border-r-0 border-slate-200 ${
                                  isClaimed
                                    ? 'bg-slate-100/80'
                                    : isChecked
                                      ? 'bg-blue-50/70'
                                      : ''
                                }`}
                              >
                                {amt <= 0 ? (
                                  <span className="text-xs text-slate-400">-</span>
                                ) : isClaimed ? (
                                  <div className="text-xs text-slate-500">
                                    <span className="block font-mono tabular-nums line-through">
                                      {formatCurrency(amt)}
                                    </span>
                                    <span className="text-[11px] text-emerald-700 font-medium">
                                      ขอเบิกแล้ว
                                    </span>
                                  </div>
                                ) : (
                                  <label className="inline-flex items-center justify-center gap-2 cursor-pointer select-none px-2 py-1 rounded hover:bg-slate-100/70">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() =>
                                        toggleCell(row.activity.id, inst.id)
                                      }
                                      className="w-4 h-4 accent-blue-900 rounded cursor-pointer"
                                    />
                                    <span className="font-mono tabular-nums text-xs font-medium text-slate-900">
                                      {formatCurrency(amt)}
                                    </span>
                                  </label>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Optional Note + Submit */}
            <div>
              <label
                htmlFor="withdrawalNote"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                หมายเหตุเพิ่มเติม (ถ้ามี)
              </label>
              <input
                id="withdrawalNote"
                type="text"
                maxLength={FIELD_LIMITS.NOTE_MAX}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น ขอเบิกงวดที่ 1 ตามแผนการดำเนินงานไตรมาส 1"
                className="w-full h-10 px-3.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
            </div>

            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div className="text-xs text-slate-500">
                เมื่อกดขอเบิก ระบบจะบันทึกคำขอลงฐานข้อมูลและส่งอีเมลแจ้งเตือนพร้อมปุ่ม{' '}
                <strong className="text-slate-700">ตรวจรับ</strong> ไปยัง{' '}
                <span className="font-mono text-slate-700">{recipientEmail}</span>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || activityMatrix.length === 0}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                <Send className="w-4 h-4" />
                ขอเบิกงบประมาณและส่งอีเมลแจ้งตรวจรับ
              </button>
            </div>
          </form>
        ) : (
          /* History & Inspection List Tab */
          <div className="pt-6">
            {loadingWithdrawals ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-14 bg-slate-100 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : withdrawals.length === 0 ? (
              <div className="p-10 text-center border border-slate-200 rounded-xl bg-slate-50">
                <Mail className="w-9 h-9 text-slate-300 mx-auto mb-2.5" />
                <p className="text-sm font-medium text-slate-700">
                  ยังไม่มีรายการขอเบิกงบประมาณในโครงการนี้
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  เลือกแท็บ &ldquo;ยื่นคำขอเบิกงบประมาณ&rdquo; เพื่อเริ่มส่งคำขอเบิกครั้งแรก
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4 whitespace-nowrap">วันที่ขอเบิก</th>
                      <th className="py-3 px-4">หน่วยงาน / ผู้ขอเบิก</th>
                      <th className="py-3 px-4 text-center whitespace-nowrap">
                        รายการที่ขอเบิก
                      </th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">
                        ยอดขอเบิก (บาท)
                      </th>
                      <th className="py-3 px-4 whitespace-nowrap">สถานะ</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">
                        ดำเนินการ
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {withdrawals.map((w) => (
                      <tr key={w.id} className="hover:bg-slate-50/70">
                        <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                          {formatThaiDateTime(w.createdAt)}
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-medium text-slate-900">
                            {w.agencyName}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            ผู้ขอเบิก: {w.requesterName} · แนบ:{' '}
                            {w.attachmentName}
                            {w.emailSent ? ' · ส่งอีเมลแล้ว' : ''}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono tabular-nums text-slate-700">
                          {w.items.length} รายการ
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                          {formatCurrency(w.totalRequested)}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {w.status === 'inspected' ? (
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
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {confirmDeleteId === w.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={deletingId === w.id}
                                onClick={() => handleConfirmDelete(w)}
                                className="px-2.5 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700"
                              >
                                ยืนยันลบ
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded hover:bg-slate-200"
                              >
                                ยกเลิก
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onOpenInspect(w)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                ตรวจรับ / พิมพ์
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(w.id)}
                                title="ลบคำขอเบิกนี้"
                                className="w-8 h-8 inline-flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Explicit Confirmation Modal Before Sending Gmail Email */}
      {confirmModalOpen && selectedAgency && attachment && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="ยืนยันการขอเบิกงบประมาณและส่งอีเมล"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  ยืนยันการส่งคำขอเบิกและแจ้งเตือนทางอีเมล
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  ระบบจะบันทึกคำขอเบิกและส่งอีเมลพร้อมปุ่มตรวจรับผ่านบัญชี Gmail ของคุณ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-2.5 text-sm text-slate-700">
              <div>
                <span className="font-medium text-slate-900">หน่วยงาน: </span>
                {selectedAgency.name}
              </div>
              <div>
                <span className="font-medium text-slate-900">เอกสารแนบ: </span>
                {attachment.name}
              </div>
              <div>
                <span className="font-medium text-slate-900">
                  รายการที่ขอเบิก:{' '}
                </span>
                {selectedItems.length} รายการ (รวม{' '}
                <span className="font-mono font-semibold text-blue-900">
                  {formatCurrency(totalRequested)} บาท
                </span>
                )
              </div>
              <div>
                <span className="font-medium text-slate-900">
                  ส่งอีเมลแจ้งตรวจรับไปยัง:{' '}
                </span>
                <span className="font-mono text-slate-900">
                  {recipientEmail}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmedSubmit}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap"
              >
                <Send className="w-4 h-4" />
                {isSubmitting
                  ? 'กำลังบันทึกและส่งอีเมล...'
                  : 'ยืนยันบันทึกและส่งอีเมล'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

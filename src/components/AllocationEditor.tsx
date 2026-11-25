import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  FileText,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import {
  FIELD_LIMITS,
  type AgencyItem,
  type BudgetActivity,
  type BudgetProject,
  type EditableActivityRow,
} from '../types/budget';
import {
  formatBudgetWithCaret,
  formatCurrency,
  generateSafeId,
  parseBudgetNumber,
  round2,
} from '../utils/formatters';

interface AllocationEditorProps {
  project: BudgetProject;
  activities: BudgetActivity[];
  loadingActivities: boolean;
  isSaving: boolean;
  onBack: () => void;
  onSaveAllocations: (
    rows: Array<{
      id: string;
      isNew?: boolean;
      order: number;
      activityName: string;
      amounts: Record<string, number>;
    }>
  ) => Promise<void>;
  onOpenPdfOnly: () => void;
}

function findSouthernScienceParkAgencyId(
  agencies: AgencyItem[]
): string | null {
  const exact = agencies.find((ag) =>
    ag.name.includes('อุทยานวิทยาศาสตร์ภูมิภาค ภาคใต้')
  );
  if (exact) return exact.id;

  const partial = agencies.find(
    (ag) =>
      ag.name.includes('อุทยานวิทยาศาสตร์') ||
      (ag.shortName ?? '').includes('อวท')
  );
  return partial ? partial.id : null;
}

function getEffectiveProjectBudget(project: BudgetProject): number {
  return project.proposalStatus === 'approved' && project.approvedBudget > 0
    ? project.approvedBudget
    : project.totalBudget;
}

function buildDefaultFirstTwoRows(
  project: BudgetProject
): EditableActivityRow[] {
  const targetAgencyId = findSouthernScienceParkAgencyId(project.agencies);
  const projectBudget = getEffectiveProjectBudget(project);
  const adminFee10 = round2(projectBudget * 0.1);
  const remaining90 = round2(projectBudget - adminFee10);
  const centralFee50 = round2(remaining90 * 0.5);

  const row1Amounts: Record<string, string> = {};
  const row2Amounts: Record<string, string> = {};

  project.agencies.forEach((ag) => {
    row1Amounts[ag.id] =
      targetAgencyId && ag.id === targetAgencyId
        ? formatCurrency(adminFee10)
        : '0.00';
    row2Amounts[ag.id] =
      targetAgencyId && ag.id === targetAgencyId
        ? formatCurrency(centralFee50)
        : '0.00';
  });

  return [
    {
      id: generateSafeId('act'),
      isNew: true,
      order: 1,
      activityName: 'งบบริหารจัดการ 10%',
      amounts: row1Amounts,
    },
    {
      id: generateSafeId('act'),
      isNew: true,
      order: 2,
      activityName: 'งบจัดเก็บเข้าส่วนกลาง 50%',
      amounts: row2Amounts,
    },
  ];
}

function buildEditableRows(
  activities: BudgetActivity[],
  project: BudgetProject
): EditableActivityRow[] {
  if (activities.length === 0) {
    return buildDefaultFirstTwoRows(project);
  }

  return [...activities]
    .sort((a, b) => a.order - b.order)
    .map((act, index) => {
      const amounts: Record<string, string> = {};
      project.agencies.forEach((ag) => {
        const val = Number(act.amounts?.[ag.id] ?? 0);
        amounts[ag.id] = Number.isFinite(val) ? formatCurrency(val) : '0.00';
      });
      return {
        id: act.id,
        isNew: false,
        order: index + 1,
        activityName: act.activityName,
        amounts,
      };
    });
}

export const AllocationEditor: React.FC<AllocationEditorProps> = ({
  project,
  activities,
  loadingActivities,
  isSaving,
  onBack,
  onSaveAllocations,
  onOpenPdfOnly,
}) => {
  const [rows, setRows] = useState<EditableActivityRow[]>(() =>
    buildEditableRows(activities, project)
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!loadingActivities) {
      setRows(buildEditableRows(activities, project));
    }
  }, [activities, loadingActivities, project]);

  const southernParkAgencyId = useMemo(
    () => findSouthernScienceParkAgencyId(project.agencies),
    [project.agencies]
  );

  const rowTotals = useMemo(() => {
    return rows.map((row) =>
      round2(
        project.agencies.reduce(
          (sum, ag) => sum + parseBudgetNumber(row.amounts[ag.id] ?? '0'),
          0
        )
      )
    );
  }, [rows, project.agencies]);

  const columnTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    project.agencies.forEach((ag) => {
      totals[ag.id] = round2(
        rows.reduce(
          (sum, row) => sum + parseBudgetNumber(row.amounts[ag.id] ?? '0'),
          0
        )
      );
    });
    return totals;
  }, [rows, project.agencies]);

  const grandTotal = useMemo(() => {
    return round2(
      Object.values(columnTotals).reduce((sum, val) => sum + val, 0)
    );
  }, [columnTotals]);

  const effectiveProjectBudget = getEffectiveProjectBudget(project);
  const remainingBudget = round2(effectiveProjectBudget - grandTotal);
  const isOverBudget = remainingBudget < -0.005;
  const isExactMatch = Math.abs(remainingBudget) < 0.005;

  const handleAddRow = () => {
    if (rows.length >= FIELD_LIMITS.MAX_ACTIVITIES) return;
    const amounts: Record<string, string> = {};
    project.agencies.forEach((ag) => {
      amounts[ag.id] = '0.00';
    });
    setRows((prev) => [
      ...prev,
      {
        id: generateSafeId('act'),
        isNew: true,
        order: prev.length + 1,
        activityName: '',
        amounts,
      },
    ]);
  };

  const handleRestoreDefaults = () => {
    const defaults = buildDefaultFirstTwoRows(project);
    setRows((prev) => {
      const others = prev.filter(
        (r) =>
          r.activityName.trim() !== 'งบบริหารจัดการ 10%' &&
          r.activityName.trim() !== 'งบจัดเก็บเข้าส่วนกลาง 50%'
      );
      return [...defaults, ...others].map((r, idx) => ({
        ...r,
        order: idx + 1,
      }));
    });
  };

  const handleDeleteRow = (index: number) => {
    setRows((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((row, idx) => ({ ...row, order: idx + 1 }))
    );
  };

  const handleActivityNameChange = (index: number, value: string) => {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index
          ? { ...row, activityName: value.slice(0, FIELD_LIMITS.ACTIVITY_NAME_MAX) }
          : row
      )
    );
  };

  const handleAmountChange = (
    rowIndex: number,
    agencyId: string,
    inputEl: HTMLInputElement
  ) => {
    const formatted = formatBudgetWithCaret(inputEl);
    setRows((prev) =>
      prev.map((row, i) =>
        i === rowIndex
          ? { ...row, amounts: { ...row.amounts, [agencyId]: formatted } }
          : row
      )
    );
  };

  const handleAmountBlur = (rowIndex: number, agencyId: string) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== rowIndex) return row;
        const parsed = parseBudgetNumber(row.amounts[agencyId] ?? '0');
        return {
          ...row,
          amounts: { ...row.amounts, [agencyId]: formatCurrency(parsed) },
        };
      })
    );
  };

  const handleSave = async () => {
    setErrorMsg(null);
    if (rows.length === 0) {
      setErrorMsg('กรุณาเพิ่มรายการกิจกรรมอย่างน้อย 1 รายการก่อนบันทึก');
      return;
    }

    const cleanedRows = rows.map((row, index) => {
      const amountsNumeric: Record<string, number> = {};
      project.agencies.forEach((ag) => {
        amountsNumeric[ag.id] = parseBudgetNumber(row.amounts[ag.id] ?? '0');
      });
      return {
        id: row.id,
        isNew: row.isNew,
        order: index + 1,
        activityName: row.activityName.trim(),
        amounts: amountsNumeric,
      };
    });

    if (cleanedRows.some((r) => !r.activityName)) {
      setErrorMsg('กรุณากรอกชื่อรายการกิจกรรมให้ครบทุกแถว');
      return;
    }

    await onSaveAllocations(cleanedRows);
  };

  return (
    <div className="space-y-6">
      {/* Top Action & Context Header */}
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
                ตารางจัดสรรงบประมาณรายกิจกรรมและเครือข่าย
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

          <button
            type="button"
            onClick={onOpenPdfOnly}
            disabled={activities.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 self-start lg:self-auto"
          >
            <FileText className="w-4 h-4" />
            ดูเอกสาร PDF ล่าสุด
          </button>
        </div>

        {/* Budget Summary Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-5">
          <div>
            <p className="text-xs font-medium text-slate-500">
              งบประมาณโครงการทั้งหมด
            </p>
            <p className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
              {formatCurrency(effectiveProjectBudget)} บาท
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">
              ยอดจัดสรรรวมปัจจุบัน
            </p>
            <p className="text-xl font-semibold font-mono tabular-nums text-blue-900 mt-1">
              {formatCurrency(grandTotal)} บาท
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">
              สถานะงบประมาณคงเหลือ
            </p>
            <div className="flex items-center gap-2 mt-1">
              {isOverBudget ? (
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              ) : isExactMatch ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : null}
              <p
                className={`text-xl font-semibold font-mono tabular-nums ${
                  isOverBudget
                    ? 'text-red-600'
                    : isExactMatch
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                }`}
              >
                {formatCurrency(remainingBudget)} บาท
              </p>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isOverBudget
                ? 'คำเตือน: ยอดจัดสรรเกินงบประมาณโครงการ'
                : isExactMatch
                  ? 'จัดสรรงบประมาณครบถ้วนพอดี 100%'
                  : 'คงเหลืองบประมาณที่ยังไม่ได้จัดสรร'}
            </p>
          </div>
        </div>
      </div>

      {!southernParkAgencyId && (
        <div className="flex items-start gap-2.5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            ไม่พบหน่วยงานชื่อ &ldquo;อุทยานวิทยาศาสตร์ภูมิภาค ภาคใต้&rdquo; ในรายชื่อหน่วยงานของโครงการนี้
            หากต้องการให้คำนวณงบบริหารจัดการ 10% และงบจัดเก็บเข้าส่วนกลาง 50% ลงคอลัมน์อัตโนมัติ
            กรุณาเพิ่มหน่วยงานดังกล่าวในหน้าแก้ไขข้อมูลหลัก หรือกรอกตัวเลขในช่องที่ต้องการได้เลยค่ะ
          </span>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Allocation Spreadsheet Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              รายการกิจกรรมและเครือข่ายที่ได้รับการจัดสรร ({project.agencies.length} หน่วยงาน)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              ค่าเริ่มต้น 2 รายการแรกคำนวณอัตโนมัติให้อุทยานวิทยาศาสตร์ภูมิภาค ภาคใต้ · สามารถแก้ไขหรือลบได้
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRestoreDefaults}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              เติม 2 รายการเริ่มต้น
            </button>

            <button
              type="button"
              onClick={handleAddRow}
              disabled={rows.length >= FIELD_LIMITS.MAX_ACTIVITIES}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              เพิ่มรายการกิจกรรม
            </button>
          </div>
        </div>

        {loadingActivities ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="h-11 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                  <th className="py-3 px-3 w-12 text-center border-r border-slate-200">
                    ที่
                  </th>
                  <th className="py-3 px-4 min-w-[260px] border-r border-slate-200">
                    รายการ (กิจกรรม)
                  </th>
                  {project.agencies.map((agency, idx) => (
                    <th
                      key={agency.id}
                      className="py-3 px-3 min-w-[165px] text-right border-r border-slate-200"
                    >
                      <span className="block text-[11px] font-normal text-slate-500">
                        เครือข่ายที่ {idx + 1}
                        {agency.shortName ? ` (${agency.shortName})` : ''}
                      </span>
                      <span
                        className="block truncate max-w-[190px] ml-auto"
                        title={agency.name}
                      >
                        {agency.name}
                      </span>
                    </th>
                  ))}
                  <th className="py-3 px-4 min-w-[160px] text-right bg-slate-100/80 border-r border-slate-200">
                    งบประมาณรวม (บาท)
                  </th>
                  <th className="py-3 px-3 w-14 text-center">ลบ</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 text-sm">
                {rows.map((row, rowIndex) => (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-3 text-center font-mono tabular-nums text-xs text-slate-500 border-r border-slate-200">
                      {rowIndex + 1}
                    </td>

                    <td className="py-2 px-3 border-r border-slate-200">
                      <input
                        type="text"
                        maxLength={FIELD_LIMITS.ACTIVITY_NAME_MAX}
                        value={row.activityName}
                        onChange={(e) =>
                          handleActivityNameChange(rowIndex, e.target.value)
                        }
                        placeholder={`ระบุชื่อกิจกรรมที่ ${rowIndex + 1}`}
                        aria-label={`กิจกรรมที่ ${rowIndex + 1}`}
                        className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                      />
                    </td>

                    {project.agencies.map((agency) => (
                      <td
                        key={agency.id}
                        className="py-2 px-3 border-r border-slate-200"
                      >
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.amounts[agency.id] ?? '0.00'}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) =>
                            handleAmountChange(
                              rowIndex,
                              agency.id,
                              e.currentTarget
                            )
                          }
                          onBlur={() => handleAmountBlur(rowIndex, agency.id)}
                          aria-label={`งบประมาณ ${agency.name} กิจกรรมที่ ${rowIndex + 1}`}
                          className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-md text-sm font-mono tabular-nums text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                        />
                      </td>
                    ))}

                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 bg-slate-50/80 border-r border-slate-200 whitespace-nowrap">
                      {formatCurrency(rowTotals[rowIndex] ?? 0)}
                    </td>

                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(rowIndex)}
                        disabled={rows.length <= 1}
                        title="ลบแถวนี้"
                        aria-label={`ลบกิจกรรมที่ ${rowIndex + 1}`}
                        className="w-8 h-8 inline-flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300 text-sm font-semibold text-slate-900">
                  <td
                    colSpan={2}
                    className="py-3.5 px-4 text-right border-r border-slate-200"
                  >
                    งบประมาณรวมจากแต่ละคอลัมน์ (บาท)
                  </td>
                  {project.agencies.map((agency) => (
                    <td
                      key={agency.id}
                      className="py-3.5 px-3 text-right font-mono tabular-nums border-r border-slate-200 whitespace-nowrap"
                    >
                      {formatCurrency(columnTotals[agency.id] ?? 0)}
                    </td>
                  ))}
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-blue-900 bg-blue-50/80 border-r border-slate-200 whitespace-nowrap">
                    {formatCurrency(grandTotal)}
                  </td>
                  <td className="py-3.5 px-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Bottom Save Button */}
        <div className="px-6 py-5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            เมื่อกดปุ่มบันทึก ระบบจะอัปเดตฐานข้อมูลและเปิดหน้าต่างตัวอย่าง PDF แนวตั้งแยกตามหน่วยงานให้อัตโนมัติ
          </p>

          <button
            type="button"
            disabled={isSaving || loadingActivities}
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'กำลังบันทึกและสร้างเอกสาร PDF...' : 'บันทึกและแสดงผล PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

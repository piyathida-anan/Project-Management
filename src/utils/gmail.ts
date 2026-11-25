import type {
  BudgetProject,
  DeliverableArtifact,
  WithdrawalItem,
} from '../types/budget';
import {
  formatCurrency,
  formatIsoToThaiDate,
  formatPercent,
} from './formatters';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function encodeBase64UrlUtf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return uint8ToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function encodeMimeSubjectUtf8(subject: string): string {
  const bytes = new TextEncoder().encode(subject);
  return `=?UTF-8?B?${uint8ToBase64(bytes)}?=`;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export interface WithdrawalEmailPayload {
  toEmail: string;
  project: BudgetProject;
  withdrawalId: string;
  agencyName: string;
  agencyShortName: string;
  requesterName: string;
  attachmentName: string;
  note: string;
  items: WithdrawalItem[];
  totalRequested: number;
  inspectionUrl: string;
}

export async function sendWithdrawalNotificationEmail(
  accessToken: string,
  payload: WithdrawalEmailPayload
): Promise<void> {
  const cleanEmail = payload.toEmail.trim();
  if (!isValidEmail(cleanEmail)) {
    throw new Error('รูปแบบอีเมลผู้รับไม่ถูกต้อง');
  }

  const projectTitle = payload.project.shortName
    ? `[${payload.project.shortName}] ${payload.project.name}`
    : payload.project.name;

  const agencyLabel = payload.agencyShortName
    ? `${payload.agencyName} (${payload.agencyShortName})`
    : payload.agencyName;

  const subject = `แจ้งขอเบิกงบประมาณ: ${
    payload.project.shortName || payload.project.name.slice(0, 40)
  } - ${payload.agencyShortName || payload.agencyName}`;

  const itemRowsHtml = payload.items
    .map(
      (item, idx) => `
      <tr>
        <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;">${idx + 1}</td>
        <td style="padding:8px 10px;border:1px solid #cbd5e1;">${escapeHtml(item.activityName)}</td>
        <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;">งวดที่ ${item.installmentOrder} (${formatPercent(item.installmentPercentage)}%)</td>
        <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;">${formatCurrency(item.amount)}</td>
      </tr>`
    )
    .join('');

  const safeInspectUrl = escapeHtml(payload.inspectionUrl);

  const htmlBody = `
<!DOCTYPE html>
<html lang="th">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:24px;background-color:#f8fafc;font-family:'Sarabun',Arial,sans-serif;color:#0f172a;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:28px;">
    <h2 style="margin:0 0 8px 0;font-size:20px;color:#1e3a8a;">แจ้งเตือนคำขอเบิกงบประมาณโครงการ</h2>
    <p style="margin:0 0 18px 0;font-size:14px;color:#475569;">
      มีคำขอเบิกงบประมาณใหม่จากหน่วยงานในระบบบริหารจัดการโครงการ กรุณาตรวจสอบและกดปุ่มตรวจรับด้านล่าง
    </p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-bottom:18px;font-size:14px;line-height:1.6;">
      <div><strong>โครงการ:</strong> ${escapeHtml(projectTitle)}</div>
      <div><strong>ปีงบประมาณ:</strong> พ.ศ. ${payload.project.fiscalYear}</div>
      <div><strong>หน่วยงานที่ขอเบิก:</strong> ${escapeHtml(agencyLabel)}</div>
      <div><strong>ผู้ยื่นคำขอ:</strong> ${escapeHtml(payload.requesterName)}</div>
      <div><strong>เอกสารแนบ:</strong> ${escapeHtml(payload.attachmentName)}</div>
      ${
        payload.note
          ? `<div><strong>หมายเหตุ:</strong> ${escapeHtml(payload.note)}</div>`
          : ''
      }
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:8px 10px;border:1px solid #cbd5e1;width:44px;">ลำดับ</th>
          <th style="padding:8px 10px;border:1px solid #cbd5e1;text-align:left;">รายการกิจกรรม</th>
          <th style="padding:8px 10px;border:1px solid #cbd5e1;">งวดที่ขอเบิก</th>
          <th style="padding:8px 10px;border:1px solid #cbd5e1;text-align:right;">จำนวนเงิน (บาท)</th>
        </tr>
      </thead>
      <tbody>
        ${itemRowsHtml}
      </tbody>
      <tfoot>
        <tr style="background:#eff6ff;font-weight:bold;">
          <td colspan="3" style="padding:9px 10px;border:1px solid #cbd5e1;text-align:right;">ยอดรวมขอเบิกในรอบนี้</td>
          <td style="padding:9px 10px;border:1px solid #cbd5e1;text-align:right;color:#1e3a8a;font-family:monospace;">${formatCurrency(payload.totalRequested)} บาท</td>
        </tr>
      </tfoot>
    </table>

    <div style="text-align:center;margin:28px 0 16px 0;">
      <a href="${safeInspectUrl}"
         style="display:inline-block;padding:12px 32px;background-color:#1e3a8a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;">
        ตรวจรับ
      </a>
    </div>

    <p style="margin:12px 0 0 0;font-size:12px;color:#64748b;text-align:center;word-break:break-all;">
      หากไม่สามารถกดปุ่มด้านบนได้ สามารถเปิดลิงก์นี้โดยตรง:<br/>
      <a href="${safeInspectUrl}" style="color:#1e3a8a;">${safeInspectUrl}</a>
    </p>
  </div>
</body>
</html>`.trim();

  const rawEmail = [
    `To: ${cleanEmail}`,
    `Subject: ${encodeMimeSubjectUtf8(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    uint8ToBase64(new TextEncoder().encode(htmlBody)),
  ].join('\r\n');

  const res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: encodeBase64UrlUtf8(rawEmail),
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error(
      `ไม่สามารถส่งอีเมลผ่าน Gmail ได้ (${res.status}): ${errText}`
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
}

export interface DeliverableReminderEmailPayload {
  toEmails: string[];
  project: BudgetProject;
  itemTitle: string;
  startDate: string;
  endDate: string;
  gpvDueDate: string;
  pmRequestDate: string;
  daysRemaining: number | null;
  artifacts: DeliverableArtifact[];
  statusLabel: string;
  projectUrl: string;
}

export async function sendDeliverableReminderEmail(
  accessToken: string,
  payload: DeliverableReminderEmailPayload
): Promise<void> {
  const validEmails = payload.toEmails.map((e) => e.trim()).filter(isValidEmail);
  if (validEmails.length === 0) {
    throw new Error('ไม่มีอีเมลผู้รับที่ถูกต้อง');
  }

  const projectTitle = payload.project.shortName
    ? `[${payload.project.shortName}] ${payload.project.name}`
    : payload.project.name;

  const urgencyText =
    payload.daysRemaining === null
      ? 'ใกล้ถึงกำหนดส่ง กปว.'
      : payload.daysRemaining < 0
        ? `เลยกำหนดส่ง กปว. แล้ว ${Math.abs(payload.daysRemaining)} วัน`
        : payload.daysRemaining === 0
          ? 'ครบกำหนดส่ง กปว. วันนี้'
          : `เหลือเวลาอีก ${payload.daysRemaining} วัน จะครบกำหนดส่ง กปว.`;

  const subject = `แจ้งเตือนกำหนดส่ง กปว. (${urgencyText}): ${
    payload.project.shortName || payload.project.name.slice(0, 35)
  }`;

  const artifactRows = payload.artifacts
    .map(
      (a, idx) => `
      <tr>
        <td style="padding:7px 10px;border:1px solid #cbd5e1;text-align:center;">${idx + 1}</td>
        <td style="padding:7px 10px;border:1px solid #cbd5e1;">${escapeHtml(a.name)}</td>
        <td style="padding:7px 10px;border:1px solid #cbd5e1;text-align:center;">${escapeHtml(a.quantity)}</td>
      </tr>`
    )
    .join('');

  const safeProjectUrl = escapeHtml(payload.projectUrl);

  const htmlBody = `
<!DOCTYPE html>
<html lang="th">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:24px;background-color:#f8fafc;font-family:'Sarabun',Arial,sans-serif;color:#0f172a;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:28px;">
    <h2 style="margin:0 0 8px 0;font-size:20px;color:#b45309;">แจ้งเตือนกำหนดส่งรายงาน กปว. ล่วงหน้า</h2>
    <p style="margin:0 0 18px 0;font-size:14px;color:#475569;">
      <strong>สถานะกำหนดส่ง:</strong> ${escapeHtml(urgencyText)}
    </p>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-bottom:18px;font-size:14px;line-height:1.7;">
      <div><strong>โครงการ:</strong> ${escapeHtml(projectTitle)}</div>
      <div><strong>ปีงบประมาณ:</strong> พ.ศ. ${payload.project.fiscalYear}</div>
      <div><strong>รายการส่งมอบ:</strong> ${escapeHtml(payload.itemTitle)}</div>
      <div><strong>ระยะเวลาดำเนินงาน:</strong> ${
        payload.startDate && payload.endDate
          ? `${escapeHtml(formatIsoToThaiDate(payload.startDate))} - ${escapeHtml(formatIsoToThaiDate(payload.endDate))}`
          : '-'
      }</div>
      <div><strong>กำหนดเรียกรายงานจาก PM:</strong> ${escapeHtml(formatIsoToThaiDate(payload.pmRequestDate))}</div>
      <div><strong>กำหนดส่ง กปว.:</strong> <span style="color:#b45309;font-weight:bold;">${escapeHtml(formatIsoToThaiDate(payload.gpvDueDate))}</span></div>
      <div><strong>สถานะปัจจุบัน:</strong> ${escapeHtml(payload.statusLabel)}</div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:7px 10px;border:1px solid #cbd5e1;width:48px;">ลำดับ</th>
          <th style="padding:7px 10px;border:1px solid #cbd5e1;text-align:left;">สิ่งส่งมอบ</th>
          <th style="padding:7px 10px;border:1px solid #cbd5e1;width:120px;">จำนวน</th>
        </tr>
      </thead>
      <tbody>
        ${artifactRows}
      </tbody>
    </table>

    <div style="text-align:center;margin:24px 0 12px 0;">
      <a href="${safeProjectUrl}"
         style="display:inline-block;padding:11px 28px;background-color:#1e3a8a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">
        เปิดดูรายละเอียดในระบบ
      </a>
    </div>
  </div>
</body>
</html>`.trim();

  const rawEmail = [
    `To: ${validEmails.join(', ')}`,
    `Subject: ${encodeMimeSubjectUtf8(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    uint8ToBase64(new TextEncoder().encode(htmlBody)),
  ].join('\r\n');

  const res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: encodeBase64UrlUtf8(rawEmail),
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error(
      `ไม่สามารถส่งอีเมลแจ้งเตือนผ่าน Gmail ได้ (${res.status}): ${errText}`
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
}

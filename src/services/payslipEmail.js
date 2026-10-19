'use strict';

/**
 * Emails a frozen PayrollRunLine's payslip as a PDF attachment, and records
 * the outcome on that line (payslipEmailedAt / payslipEmailError) so the
 * run's "Employees" table can show delivery status per person and a resend
 * is a simple, cheap, idempotent action — see routes/payroll.js's
 * POST .../send-payslips.
 */

const { buildPayslipPdf } = require('./payslipPdf');
const mailer = require('./mailer');

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The employee's own email on record for payslip delivery — office first, personal as a fallback. */
function recipientFor(employee) {
  return (employee.officeEmail || employee.personalEmail || '').trim() || null;
}

/**
 * @param {object} opts
 * @param {object} opts.organization
 * @param {object} opts.employee - the live Employee row (for officeEmail/personalEmail)
 * @param {object} opts.run - the PayrollRun (year, month, organizationId)
 * @param {object} opts.line - the PayrollRunLine (empCode, employeeName, postName, payslipJson)
 * @returns {Promise<{sent: boolean, error: string|null, skipped: boolean}>}
 */
async function sendPayslipForLine({ organization, employee, run, line }) {
  const to = recipientFor(employee);
  if (!to) {
    const error = 'No office or personal email on record for this employee.';
    line.payslipEmailError = error;
    line.payslipEmailedAt = null;
    await line.save();
    return { sent: false, error, skipped: true };
  }
  const payslip = JSON.parse(line.payslipJson);
  const periodLabel = MONTH_NAMES[run.month] + ' ' + run.year;
  let pdf;
  try {
    pdf = await buildPayslipPdf({
      organization,
      employee: { empCode: line.empCode, name: line.employeeName, postName: line.postName },
      payslip,
      year: run.year,
    });
  } catch (err) {
    line.payslipEmailError = 'Could not generate the PDF: ' + err.message;
    await line.save();
    return { sent: false, error: line.payslipEmailError, skipped: false };
  }

  const result = await mailer.sendMail({
    organizationId: organization.id,
    to,
    subject: 'Payslip for ' + periodLabel,
    text: `Dear ${line.employeeName},\n\nPlease find attached your payslip for ${periodLabel}.\n\nNet pay: ₹${Number(payslip.netPay).toLocaleString('en-IN')}\n\nThis is a system-generated message; please do not reply.`,
    html: `<p>Dear ${line.employeeName},</p><p>Please find attached your payslip for <strong>${periodLabel}</strong>.</p>` +
      `<p>Net pay: <strong>₹${Number(payslip.netPay).toLocaleString('en-IN')}</strong></p>` +
      `<p style="color:#777;font-size:12px">This is a system-generated message; please do not reply.</p>`,
    attachments: [{ filename: `payslip-${line.empCode}-${run.year}-${String(run.month).padStart(2, '0')}.pdf`, content: pdf, contentType: 'application/pdf' }],
  });

  if (result.sent) {
    line.payslipEmailedAt = new Date();
    line.payslipEmailError = null;
  } else {
    line.payslipEmailError = result.error || 'Send failed.';
  }
  await line.save();
  return { sent: result.sent, error: result.sent ? null : line.payslipEmailError, skipped: false };
}

module.exports = { sendPayslipForLine, recipientFor };

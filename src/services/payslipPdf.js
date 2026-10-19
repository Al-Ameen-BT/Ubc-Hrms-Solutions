'use strict';

/**
 * Renders a computePayslip() result (services/payslip.js) — live or a
 * frozen PayrollRunLine's payslipJson, they're the same shape — as a
 * one-page PDF payslip, for the portal download and the emailed
 * attachment (services/payslipEmail.js).
 */

const PDFDocument = require('pdfkit');
const documentHeader = require('./documentHeader');

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// PDFKit's built-in Helvetica is the standard 14 PDF base font (WinAnsi
// encoding) — it has no glyph for the ₹ Rupee sign (U+20B9), so pdfkit
// silently substitutes an unrelated glyph from the font's notdef range,
// which renders as a stray superscript "1" in front of every amount. "Rs."
// is plain ASCII and renders correctly with no embedded font needed.
function money(v) {
  const n = Number(v) || 0;
  return 'Rs. ' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/**
 * @param {object} opts
 * @param {object} opts.organization - { name, shortName }
 * @param {object} opts.employee - { empCode, name, postName }
 * @param {object} opts.payslip - a computePayslip() result
 * @param {number} opts.year
 * @returns {Promise<Buffer>}
 */
async function buildPayslipPdf({ organization, employee, payslip, year }) {
  // Bank name/registration/logo header + Head Office address footer (task
  // 76) are shared across every downloadable document — see
  // services/documentHeader.js.
  const headerData = await documentHeader.loadHeaderData(organization && organization.id);

  return new Promise((resolve, reject) => {
    // bufferPages lets finalizeFooters() go back and stamp the footer onto
    // every page after all content is written, instead of wherever doc's
    // "current page" happens to be at that point (see documentHeader.js).
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    // Redraws the header on any page a long payslip overflows onto — this
    // event fires for every page EXCEPT the first, which is drawn manually
    // just below.
    doc.on('pageAdded', () => documentHeader.drawHeader(doc, headerData));

    const e = payslip.earnings; const d = payslip.deductions;
    const periodLabel = MONTH_NAMES[payslip.forMonth] + (year ? ' ' + year : '');

    documentHeader.drawHeader(doc, headerData);
    doc.fontSize(11).fillColor('#555').text('Payslip for ' + periodLabel, { align: 'center' });
    doc.moveDown(1);
    doc.fillColor('#000');

    doc.fontSize(10);
    const infoY = doc.y;
    doc.text('Employee: ' + (employee.name || ''), 40, infoY);
    doc.text('Emp. code: ' + (employee.empCode || ''), 320, infoY);
    doc.text('Post: ' + (employee.postName || '-'), 40, infoY + 15);
    if (payslip.grade) doc.text('Grade: ' + (payslip.grade.name || '-'), 320, infoY + 15);
    doc.moveDown(3);

    if (payslip.attendance && Number(payslip.attendance.lopDays) > 0) {
      doc.fontSize(9).fillColor('#8a5300').text(
        'Pro-rated for ' + payslip.attendance.lopDays + ' Loss of Pay day(s) out of ' + payslip.attendance.payableDays + ' payable days (' + payslip.attendance.paidDays + ' days paid).',
        { width: 515 }
      );
      doc.fillColor('#000').moveDown(0.5);
    }

    function twoCol(title, rows) {
      doc.fontSize(11).text(title, { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10);
      rows.forEach(([label, value, bold]) => {
        if (!value && value !== 0) return;
        const y = doc.y;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(label, 40, y, { width: 300 });
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(money(value), 340, y, { width: 140, align: 'right' });
        doc.moveDown(0.4);
      });
      doc.font('Helvetica');
      doc.moveDown(0.6);
    }

    const earningsRows = [
      e.actualBasic != null && Number(e.actualBasic) !== Number(e.basic) ? ['Actual Basic', e.actualBasic] : null,
      [e.actualBasic != null && Number(e.actualBasic) !== Number(e.basic) ? 'Basic (after LOP)' : 'Basic', e.basic],
      ['DA', e.da],
      ['HRA', e.hra],
      e.riskAllowance ? ['Risk Allowance', e.riskAllowance] : null,
      e.otherAllowance ? ['Other Allowance', e.otherAllowance] : null,
      e.cca ? ['City Compensatory Allowance', e.cca] : null,
      e.conveyance ? ['Conveyance Allowance', e.conveyance] : null,
      e.medicalAllowance ? ['Medical Allowance', e.medicalAllowance] : null,
      e.bonus ? ['Bonus', e.bonus] : null,
      ...((e.customAllowances || []).map((a) => [a.name, a.amount])),
      ['Gross Earnings', e.grossEarnings, true],
    ].filter(Boolean);
    twoCol('Earnings', earningsRows);

    const deductionRows = [
      ['Provident Fund (employee)', d.pfEmployee],
      d.vpf ? ['Voluntary PF', d.vpf] : null,
      d.welfareFund ? ['Welfare Fund', d.welfareFund] : null,
      d.gsli ? ['GSLI', d.gsli] : null,
      ['Professional Tax', d.professionalTax],
      d.festivalAdvance ? ['Festival Advance', d.festivalAdvance] : null,
      d.recurringDeposit ? ['Recurring Deposit', d.recurringDeposit] : null,
      d.lic ? ['LIC', d.lic] : null,
      d.housingLoan ? ['Housing Loan', d.housingLoan] : null,
      d.vehicleLoan ? ['Vehicle Loan', d.vehicleLoan] : null,
      ['Income Tax (TDS)', d.incomeTax],
      ['Total Deductions', d.totalDeductions, true],
    ].filter(Boolean);
    twoCol('Deductions', deductionRows);

    doc.moveDown(0.3);
    doc.fontSize(12).font('Helvetica-Bold').text('Net Pay: ' + money(payslip.netPay), 40, doc.y);
    doc.font('Helvetica');

    doc.moveDown(1.5);
    doc.fontSize(8).fillColor('#777').text(payslip.note || '', 40, doc.y, { width: 515 });
    doc.moveDown(1);
    doc.fontSize(8).fillColor('#999').text('This is a system-generated payslip and does not require a signature.', 40, doc.y, { width: 515 });

    documentHeader.finalizeFooters(doc, headerData);

    doc.end();
  });
}

module.exports = { buildPayslipPdf };

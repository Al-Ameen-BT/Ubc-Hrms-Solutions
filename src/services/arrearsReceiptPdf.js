'use strict';

/**
 * Renders a one-page PDF receipt for a single PAID DA Arrears installment
 * (services/arrears.js#payInstallment / #receiptData). Arrears are paid
 * separately from salary, so this is a standalone receipt — not a payslip
 * line — the employee's proof that this specific amount, for this specific
 * month, was paid under this specific DA Revision order.
 */

const PDFDocument = require('pdfkit');
const documentHeader = require('./documentHeader');

// See payslipPdf.js's identical comment: pdfkit's built-in Helvetica has no
// glyph for the Rupee sign, so "Rs." is used instead of an unsupported ₹.
function money(v) {
  const n = Number(v) || 0;
  return 'Rs. ' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/**
 * @param {object} opts
 * @param {object} opts.organization - { id, name, shortName }
 * @param {object} opts.employee - { empCode, name, postName }
 * @param {object} opts.installment - an ArrearsInstallment row
 * @param {object} opts.arrearsCase - the owning ArrearsCase row
 * @param {object} opts.daRevision - the owning DaRevision row
 * @param {string} opts.monthLabel - e.g. "June 2025"
 * @param {string} opts.receiptNumber
 * @returns {Promise<Buffer>}
 */
async function buildArrearsReceiptPdf({ organization, employee, installment, arrearsCase, daRevision, monthLabel, receiptNumber }) {
  const headerData = await documentHeader.loadHeaderData(organization && organization.id);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.on('pageAdded', () => documentHeader.drawHeader(doc, headerData));

    documentHeader.drawHeader(doc, headerData);
    doc.fontSize(13).fillColor('#555').text('DA Arrears Payment Receipt', { align: 'center' });
    doc.moveDown(1.2);
    doc.fillColor('#000');

    doc.fontSize(10);
    const infoY = doc.y;
    doc.text('Receipt No: ' + receiptNumber, 40, infoY);
    doc.text('Date Paid: ' + (installment.paidAt ? new Date(installment.paidAt).toISOString().slice(0, 10) : '-'), 320, infoY);
    doc.text('Employee: ' + (employee.name || ''), 40, infoY + 15);
    doc.text('Emp. Code: ' + (employee.empCode || ''), 320, infoY + 15);
    doc.text('Post: ' + (employee.postName || '-'), 40, infoY + 30);
    doc.moveDown(3.5);

    function twoCol(title, rows) {
      doc.fontSize(11).text(title, { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10);
      rows.forEach(([label, value, bold]) => {
        if (value === null || value === undefined || value === '') return;
        const y = doc.y;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(label, 40, y, { width: 300 });
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(String(value), 340, y, { width: 200, align: 'right' });
        doc.moveDown(0.4);
      });
      doc.font('Helvetica');
      doc.moveDown(0.6);
    }

    twoCol('DA Revision', [
      ['Order Number', daRevision ? daRevision.orderNumber : '-'],
      ['Order Date', daRevision ? String(daRevision.orderDate) : '-'],
      ['Effective From', daRevision ? String(daRevision.effectiveFrom) : '-'],
      ['Previous DA %', daRevision ? daRevision.previousDaPercent + '%' : '-'],
      ['Increase %', daRevision ? daRevision.increasePercent + '%' : '-'],
      ['Revised DA %', daRevision ? daRevision.revisedDaPercent + '%' : '-'],
    ]);

    twoCol('Payment', [
      ['Month covered', monthLabel],
      ['Case total (calculated)', money(arrearsCase.totalCalculatedAmount)],
      arrearsCase.totalAdjustedAmount != null ? ['Case total (adjusted)', money(arrearsCase.totalAdjustedAmount)] : null,
      ['This installment', money(installment.amount), true],
    ].filter(Boolean));

    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica-Bold').text('Amount Paid: ' + money(installment.amount), 40, doc.y);
    doc.font('Helvetica');

    doc.moveDown(1.5);
    doc.fontSize(8).fillColor('#777').text(
      'This DA Arrears payment was made separately from regular salary and has been recorded in the employee\'s Service Book.',
      40, doc.y, { width: 515 },
    );
    doc.moveDown(1);
    doc.fontSize(8).fillColor('#999').text('This is a system-generated receipt and does not require a signature.', 40, doc.y, { width: 515 });

    documentHeader.finalizeFooters(doc, headerData);
    doc.end();
  });
}

module.exports = { buildArrearsReceiptPdf };

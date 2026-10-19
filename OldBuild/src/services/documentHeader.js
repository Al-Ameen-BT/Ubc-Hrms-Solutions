'use strict';

/**
 * Shared header/footer for every downloadable PDF document — task 76:
 * "All download document header should have Bank name, registration
 * number, logo; footer should have Head office address." Currently
 * consumed by services/payslipPdf.js; any future PDF export should call
 * this too rather than drawing its own header.
 *
 * Layout (per user feedback after the first pass): logo stays top-left,
 * sized generously (60x60) so it reads clearly rather than as a thumbnail;
 * the bank name is centred across the FULL page width (a letterhead title,
 * not squeezed next to the logo); the registration number is a smaller
 * centred line underneath. The footer (Head Office address) is centred at
 * the true bottom of the page.
 */

const { Organization } = require('../models');
const brand = require('./brandAssets');

/** Loads everything a document header/footer needs, in one call. */
async function loadHeaderData(organizationId) {
  if (!organizationId) return null;
  const [org, logoRow] = await Promise.all([
    Organization.findByPk(organizationId, { attributes: ['id', 'name', 'shortName', 'address', 'registrationNumber'] }),
    brand.find(organizationId, 'LOGO'),
  ]);
  if (!org) return null;
  return {
    name: org.name,
    shortName: org.shortName,
    address: org.address,
    registrationNumber: org.registrationNumber,
    logoBuffer: logoRow ? Buffer.from(logoRow.data) : null,
  };
}

const LOGO_BOX = 60; // px, up from the original 40 — "logo needs to be bigger"

/**
 * Draws the header at the top of the CURRENT page — logo top-left (if any),
 * bank name centred across the full page width, registration number
 * centred underneath in smaller grey text — and leaves doc.x/doc.y
 * positioned where the document's own content should begin. Safe to call
 * with data === null (e.g. logo/registration not set up yet): falls back
 * to just the bank name, and to nothing at all pre-migration.
 *
 * Register this once via `doc.on('pageAdded', () => drawHeader(doc, data))`
 * so it also reappears on any page a long document overflows onto, and
 * call it once more directly for the document's first page (pdfkit's
 * 'pageAdded' event does not fire for that first, already-created page).
 */
function drawHeader(doc, data) {
  const left = doc.page.margins.left;
  const right = doc.page.margins.right;
  const top = doc.page.margins.top;
  const fullWidth = doc.page.width - left - right;
  if (!data) { doc.x = left; doc.y = top; return top; }

  if (data.logoBuffer) {
    try {
      doc.image(data.logoBuffer, left, top, { fit: [LOGO_BOX, LOGO_BOX] });
    } catch (e) { /* corrupt/unsupported stored bytes — skip the logo, keep the text header */ }
  }

  doc.fontSize(17).font('Helvetica-Bold').fillColor('#000')
    .text(data.name || '', left, top + 4, { width: fullWidth, align: 'center' });
  if (data.registrationNumber) {
    doc.fontSize(8).font('Helvetica').fillColor('#555')
      .text('Registration No: ' + data.registrationNumber, left, doc.y + 2, { width: fullWidth, align: 'center' });
  }
  doc.fillColor('#000').font('Helvetica');

  const contentTop = Math.max(doc.y + 8, top + LOGO_BOX + 8);
  doc.x = left;
  doc.y = contentTop;
  return contentTop;
}

/**
 * Draws the footer (Head Office address, centred) at the true bottom of
 * the CURRENT page. Deliberately draws INSIDE the page's bottom margin —
 * pdfkit treats any text placed beyond `page.height - margins.bottom` as
 * overflow and silently starts a NEW page for it (which is what put the
 * footer at the top of a mostly-blank second page before this fix), so
 * margins.bottom is zeroed out for the duration of this one call to
 * suppress that, then restored.
 */
function drawFooter(doc, data) {
  if (!data || !data.address) return;
  const left = doc.page.margins.left;
  const right = doc.page.margins.right;
  const width = doc.page.width - left - right;
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  try {
    const y = doc.page.height - savedBottom + 14;
    doc.fontSize(7).fillColor('#777')
      .text('Head Office: ' + String(data.address).replace(/\s*\n\s*/g, ', '), left, y, { width, align: 'center' });
    doc.fillColor('#000');
  } finally {
    doc.page.margins.bottom = savedBottom;
  }
}

/**
 * Call once, right before doc.end(), on a PDFDocument created with
 * `{ bufferPages: true }`. Stamps the footer onto every page the document
 * ended up with (normally just one, but a long payslip or a document with
 * many rows can genuinely spill onto a second page) rather than only
 * wherever doc's "current page" happened to be when content writing
 * finished.
 */
function finalizeFooters(doc, data) {
  if (!data || !data.address) return;
  const range = doc.bufferedPageRange(); // { start, count }
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    drawFooter(doc, data);
  }
}

module.exports = { loadHeaderData, drawHeader, drawFooter, finalizeFooters, LOGO_BOX };

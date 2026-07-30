const { ipcRenderer } = window.require('electron');

export function buildPurchaseReturnHTML(header, items) {
  const returnNo = header.returnNo || header.invoiceNo || header.return_no || header.id || '';
  let rawDate = header.returnDate || header.return_date || new Date();
  let dateObj = new Date(rawDate);
  if (isNaN(dateObj.getTime()) && typeof rawDate === 'string' && rawDate.match(/^\d{2}-\d{2}-\d{4}$/)) {
    const [d, m, y] = rawDate.split('-');
    dateObj = new Date(`${y}-${m}-${d}`);
  }
  if (isNaN(dateObj.getTime())) dateObj = new Date();

  const d = String(dateObj.getDate()).padStart(2, '0');
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const y = dateObj.getFullYear();
  const dateFormatted = `${d}/${m}/${y}`;
  const timeFormatted = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dateTimeStr = `${dateFormatted} ${timeFormatted}`;
  const supplier = header.supplierName || header.supplier_name || '';
  const biltyNo = header.bltNumber || header.blt_number || '';
  const freightAcc = header.freightAccountName || header.freight_account_name || '';
  const ctnQty = header.ctnQty || header.ctn_qty || 0;
  const remarks = header.notes || '';
  const discount = parseFloat(header.discount || 0);
  const misc = parseFloat(header.miscCharges || header.misc_charges || 0);

  let grossSub = 0;
  let totalItemDisc = 0;
  let netSub = 0;

    const rowsHtml = items.map((item, idx) => {
    const q = parseInt(item.packets || item.qty) || 0;
    const base = parseFloat(item.preDiscPrice || item.pre_disc_price || item.rate) || 0;
    const flat = parseFloat(item.flatDiscount || item.flat_discount) || 0;
    const pPrice = Math.max(0, base - flat);
    const dPct = parseFloat(item.discPct || item.disc_pct) || 0;
    const rDisc = pPrice * (dPct / 100);
    const netRate = parseFloat(item.netRate || item.net_rate || (pPrice - rDisc)) || 0;
    const amt = parseFloat(item.amount || (netRate * q)) || 0;

    grossSub += base * q;
    totalItemDisc += (flat + rDisc) * q;
    netSub += amt;

    const code = item.itemCode || item.item_code || '';
    const desc = item.itemDescription || item.item_description || item.description || '';
    const fullDesc = code ? `${code} ${desc}`.trim() : desc;

    return `
      <tr>
        <td style="text-align: center; border: 1px solid #000; padding: 5px 6px; font-weight: bold;">${idx + 1}</td>
        <td style="border: 1px solid #000; padding: 5px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;">${fullDesc}</td>
        <td style="text-align: center; border: 1px solid #000; padding: 5px 6px; font-weight: bold;">${q}</td>
        <td style="text-align: right; border: 1px solid #000; padding: 5px 6px; font-weight: bold;">${netRate > 0 ? Math.round(netRate).toLocaleString() : ''}</td>
      </tr>
    `;
  }).join('');

  const grandTotal = netSub + misc - discount;

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Purchase Return #${returnNo}</title>
    <style>
      @media print {
        @page { size: 6.5in 8.5in; margin: 5mm; }
        body { font-family: 'Arial', sans-serif; color: #000; background: #fff; margin: 0; padding: 0; font-size: 12px; font-weight: bold; -webkit-print-color-adjust: exact; }
        .no-print { display: none !important; }
        td, th { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      }
      body { font-family: 'Arial', sans-serif; color: #000; background: #fff; margin: 0; padding: 10px; font-size: 12px; font-weight: bold; }
      
      .no-print-bar {
        position: sticky;
        top: 0;
        background: #1e293b;
        color: #fff;
        padding: 10px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: -15px -15px 15px -15px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        z-index: 9999;
      }
      .print-btn {
        background: #2563eb;
        color: #fff;
        border: none;
        padding: 8px 18px;
        font-size: 14px;
        font-weight: bold;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
      }
      .print-btn:hover { background: #1d4ed8; }

      .header-box { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
      .company-name { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; letter-spacing: 1px; color: #000; }
      .company-sub { font-size: 11px; color: #000; margin: 3px 0; font-weight: 600; }
      .doc-title { display: inline-block; border: 2px solid #000; background: #fff; color: #000; padding: 4px 18px; font-size: 13px; font-weight: 900; margin-top: 6px; letter-spacing: 1.5px; text-transform: uppercase; }
      
      .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
      .meta-table td { padding: 5px 8px; border: 1px solid #000; color: #000; }
      .meta-label { font-weight: bold; background: #f0f0f0; width: 14%; color: #000; }
      .meta-val { width: 36%; font-weight: 600; }
      
      .items-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; table-layout: fixed; }
      .items-table th { border: 1.5px solid #000; background: #f0f0f0; color: #000; padding: 6px 4px; font-weight: bold; text-align: center; text-transform: uppercase; }
      .items-table td { border: 1px solid #000; padding: 5px 4px; color: #000; }
      
      /* Bottom Summary Box */
      .summary-box { width: 100%; border: 2px solid #000; font-size: 12px; border-collapse: collapse; margin-top: 15px; }
      .summary-box td { padding: 6px 12px; border: 1px solid #000; color: #000; }
      .grand-row { background: #f0f0f0; font-weight: 900; font-size: 15px; color: #000; }
    </style>
  </head>
  <body>
    <!-- Top Action Bar for Print Preview -->
    <div class="no-print-bar no-print">
      <span style="font-weight: bold; font-size: 14px;">Print Preview - Purchase Return #${returnNo}</span>
      <button class="print-btn" onclick="window.print()">🖨️ Click Here to Print (Select Printer)</button>
    </div>

    <div class="header-box">
      <h1 class="company-name">AL - TOUHEED GARMENTS</h1>
      <div class="company-sub">Shop 2 & 3, Ground Floor Al Mumtaz Centre, Chowk Rang Mahal, Lahore</div>
      <div class="doc-title">PURCHASE RETURN</div>
    </div>

    <table class="meta-table">
      <tr>
        <td class="meta-label">Return Inv #:</td>
        <td class="meta-val" style="font-weight: bold; font-size: 13px; color: #000;">${returnNo.toString().replace(/^PR-/, '')}</td>
        <td class="meta-label">Date & Time:</td>
        <td class="meta-val">${dateTimeStr}</td>
      </tr>
      <tr>
        <td class="meta-label">Supplier Name:</td>
        <td class="meta-val" style="font-weight: bold;">${supplier}</td>
        <td class="meta-label">Bilty No:</td>
        <td class="meta-val">${biltyNo || '-'}</td>
      </tr>
      <tr>
        <td class="meta-label">Freight Acc:</td>
        <td class="meta-val">${freightAcc || '-'}</td>
        <td class="meta-label">CTN Qty:</td>
        <td class="meta-val">${ctnQty || '-'}</td>
      </tr>
      ${remarks ? `<tr><td class="meta-label">Remarks:</td><td class="meta-val" colSpan="3">${remarks}</td></tr>` : ''}
    </table>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 35px;">#</th>
          <th>Description</th>
          <th style="width: 60px;">Qty</th>
          <th style="width: 100px;">Net Rate</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <!-- Full-Width Bottom Summary Box -->
    <table class="summary-box">
      <tr>
        <td style="font-weight: bold; width: 25%;">Gross Amount:</td>
        <td style="font-weight: bold; width: 25%; text-align: right;">${grossSub.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td style="font-weight: bold; width: 25%;">Total Discount:</td>
        <td style="text-align: right; font-weight: bold; width: 25%;">-${(totalItemDisc + discount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr class="grand-row">
        <td colSpan="2" style="font-size: 15px; font-weight: 900;">Grand Total:</td>
        <td colSpan="2" style="font-size: 16px; font-weight: 900; text-align: right;">PKR ${Math.round(grandTotal).toLocaleString()}</td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

export async function printPurchaseReturn(header, items) {
  const html = buildPurchaseReturnHTML(header, items);
  try {
    return await ipcRenderer.invoke('print-purchase-return-html', { html });
  } catch (err) {
    console.error('Print failed:', err);
    return { success: false, error: err.message };
  }
}

export async function savePurchaseReturnPDF(header, items) {
  const html = buildPurchaseReturnHTML(header, items);
  const returnNo = header.returnNo || header.invoiceNo || header.return_no || header.id || '1';
  const filename = `Purchase_Return_${returnNo}.pdf`;
  try {
    return await ipcRenderer.invoke('save-purchase-return-pdf', { html, filename });
  } catch (err) {
    console.error('Save PDF failed:', err);
    return { success: false, error: err.message };
  }
}

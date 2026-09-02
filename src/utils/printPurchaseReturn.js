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

  let totalQty = 0;
  let totalPackets = 0;
  let grossSub = 0;
  let totalItemDisc = 0;
  let netSub = 0;

  const rowsHtml = items.map((item, idx) => {
    const q = parseInt(item.packets || item.qty || item.stock_packets) || 0;
    const packing = parseInt(item.packingQty || item.packing_qty) || 1;
    const pckts = Math.floor(q / packing);
    const base = parseFloat(item.preDiscPrice || item.pre_disc_price || item.rate) || 0;
    const flat = parseFloat(item.flatDiscount || item.flat_discount) || 0;
    const dPct = parseFloat(item.discPct || item.disc_pct) || 0;
    const rDisc = base * (dPct / 100);
    const netRate = Math.max(0, base - rDisc - flat);
    const amt = netRate * q;

    totalQty += q;
    totalPackets += pckts;
    grossSub += base * q;
    totalItemDisc += (flat + rDisc) * q;
    netSub += amt;

    const code = item.itemCode || item.item_code || '';
    const desc = item.itemDescription || item.item_description || item.description || '';

    return `
      <tr>
        <td style="text-align: center; border: 1px solid #000; padding: 5px 6px; font-weight: bold;">${idx + 1}</td>
        <td style="border: 1px solid #000; padding: 5px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;">${desc}</td>
        <td style="text-align: center; border: 1px solid #000; padding: 5px 6px; font-weight: 800; font-size: 13px; color: #b45309;">${pckts}</td>
        <td style="text-align: center; border: 1px solid #000; padding: 5px 6px; font-weight: 800; font-size: 13px; color: #000;">${code}</td>
        <td style="text-align: center; border: 1px solid #000; padding: 5px 6px; font-weight: 800; font-size: 13px; color: #000;">${q}</td>
        <td style="text-align: right; border: 1px solid #000; padding: 5px 6px; font-weight: 800; font-size: 13px; color: #000;">${base > 0 ? Math.round(base).toLocaleString() : ''}</td>
      </tr>
    `;
  }).join('');

  const overallDiscount = totalItemDisc + discount;

  // Build exact discount expression matching the rules set in purchase return (e.g. 10% + 10)
  const exprSet = new Set();
  items.forEach(item => {
    const q = parseInt(item.packets || item.qty || item.stock_packets) || 0;
    if (q <= 0) return;
    const dPct = parseFloat(item.discPct || item.disc_pct) || 0;
    const flat = parseFloat(item.flatDiscount || item.flat_discount) || 0;
    if (dPct > 0 && flat > 0) {
      exprSet.add(`${dPct}% + ${flat}`);
    } else if (dPct > 0) {
      exprSet.add(`${dPct}%`);
    } else if (flat > 0) {
      exprSet.add(`${flat}`);
    }
  });

  const exprList = Array.from(exprSet);
  if (discount > 0) {
    exprList.push(`${discount}`);
  }

  const discLabel = exprList.length > 0 ? `Total Discount (${exprList.join(', ')}):` : 'Total Discount:';

  const rawHeaderTotal = header.total_amount ?? header.totalAmount ?? header.total_price ?? header.totalPrice ?? header.grandTotal ?? header.grand_total ?? header.total;
  const headerTotal = (rawHeaderTotal !== undefined && rawHeaderTotal !== null && rawHeaderTotal !== '') ? parseFloat(rawHeaderTotal) : null;
  const miscCharges = parseFloat(header.miscCharges || header.misc_charges || 0);

  const grandTotal = (headerTotal !== null && !isNaN(headerTotal))
    ? headerTotal
    : Math.max(0, netSub - discount + miscCharges);

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
        <td class="meta-label">CTN Qty:</td>
        <td class="meta-val">${ctnQty || '-'}</td>
      </tr>
      <tr>
        <td class="meta-label">Freight Acc:</td>
        <td class="meta-val">${freightAcc || '-'}</td>
        <td class="meta-label">Bilty No:</td>
        <td class="meta-val">${biltyNo || '-'}</td>
      </tr>
      ${remarks ? `<tr><td class="meta-label">Remarks:</td><td class="meta-val" colSpan="3">${remarks}</td></tr>` : ''}
    </table>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 28px;">#</th>
          <th>Description</th>
          <th style="width: 45px;">Pckts</th>
          <th style="width: 85px;">Item Code</th>
          <th style="width: 50px;">Qty</th>
          <th style="width: 110px;">Purchase Rate</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
      <tfoot>
        <tr style="border-top: 1.5px solid #000; font-weight: bold; background: #fff;">
          <td style="border: 1px solid #000; padding: 5px 6px; text-align: center;"></td>
          <td style="border: 1px solid #000; padding: 5px 8px; font-weight: 900; text-align: center ; font-size: 13px;">Total Packets: ${totalPackets}</td>
          <td style="border: 1px solid #000; padding: 5px 6px; text-align: center; font-weight: 900; font-size: 14px; color: #b45309;">${totalPackets}</td>
          <td style="border: 1px solid #000; padding: 5px 8px; font-weight: 900; text-align: right; font-size: 13px;">Total Qty / Subtotal:</td>
          <td style="border: 1px solid #000; padding: 5px 6px; text-align: center; font-weight: 900; font-size: 14px;">${totalQty}</td>
          <td style="border: 1px solid #000; padding: 5px 6px; text-align: right; font-weight: 900; font-size: 14px;">${grossSub.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>
        ${overallDiscount > 0 ? `
        <tr style="font-weight: bold; background: #fff;">
          <td colSpan="5" style="border: 1px solid #000; padding: 5px 8px; text-align: right; font-size: 14px;">${discLabel}</td>
          <td style="border: 1px solid #000; padding: 5px 8px; text-align: right; font-size: 14px; font-weight: 900; color: #000;">-${overallDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>
        ` : ''}
        <tr style="background: #f0f0f0; font-weight: 900;">
          <td colSpan="5" style="border: 1.5px solid #000; padding: 6px 8px; font-size: 15px; text-align: right;">Grand Total:</td>
          <td style="border: 1.5px solid #000; padding: 6px 8px; font-size: 17px; text-align: right; font-weight: 900;">${Math.round(grandTotal).toLocaleString()}</td>
        </tr>
      </tfoot>
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

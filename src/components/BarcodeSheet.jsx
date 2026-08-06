import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { generateTSPL } from '../utils/TSPLGenerator';
import './BarcodeSheet.css';

const { ipcRenderer } = window.require('electron');

function BarcodeSheet({ items, onClose }) {
  const barcodeRefs = useRef({});
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);
  const [printResult, setPrintResult] = useState(null); // { type: 'success'|'error', msg }

  useEffect(() => {
    // Generate all barcodes after component mounts
    items.forEach((item, itemIdx) => {
      for (let i = 0; i < item.quantity; i++) {
        const key = `${itemIdx}-${item.item_code}-${i}`;
        const canvas = barcodeRefs.current[key];
        if (canvas) {
          try {
            JsBarcode(canvas, item.item_code, {
              format: 'CODE128',
              width: 1,
              height: 15,
              displayValue: false,
              fontSize: 12,
              margin: 0
            });
          } catch (err) {
            console.error('Barcode generation failed:', err);
          }
        }
      }
    });
  }, [items]);

  useEffect(() => {
    // Load printers and auto-select TSC
    const loadPrinters = async () => {
      try {
        const list = await ipcRenderer.invoke('get-printers');
        setPrinters(list || []);
        // Attempt to auto-select a TSC printer, fall back to default or first
        const defaultPrinter = list.find(p => p.isDefault) || list[0];
        if (defaultPrinter) setSelectedPrinter(defaultPrinter.name);

        const tsc = list.find(p => p.name.toUpperCase().includes('TSC'));
        if (tsc) setSelectedPrinter(tsc.name);
      } catch (err) {
        console.error('Failed to load printers:', err);
      }
    };
    loadPrinters();
  }, []);

  const handlePrint = async () => {
    if (!selectedPrinter) {
      setPrintResult({ type: 'error', msg: 'Please select a printer first.' });
      return;
    }

    setIsPrinting(true);
    setPrintResult(null);
    try {
      const tsplData = generateTSPL(items);
      const result = await ipcRenderer.invoke('print-raw', {
        printerName: selectedPrinter,
        data: tsplData
      });

      if (result.success) {
        setPrintResult({ type: 'success', msg: 'Labels sent to printer successfully!' });
      } else {
        setPrintResult({ type: 'error', msg: result.error || 'Print failed.' });
      }
    } catch (err) {
      console.error('Direct Print Error:', err);
      setPrintResult({ type: 'error', msg: err.message });
    } finally {
      setIsPrinting(false);
    }
  };

  // Generate labels array (repeat based on quantity)
  const generateLabels = () => {
    const labels = [];
    items.forEach((item, itemIdx) => {
      for (let i = 0; i < item.quantity; i++) {
        labels.push({
          ...item,
          isLastOfItem: (i === item.quantity - 1),
          uniqueKey: `${itemIdx}-${item.item_code}-${i}`
        });
      }
    });
    return labels;
  };

  const labels = generateLabels();
  const totalLabels = labels.length;

  // Auto-dismiss success message after 4s
  useEffect(() => {
    if (printResult?.type === 'success') {
      const t = setTimeout(() => setPrintResult(null), 4000);
      return () => clearTimeout(t);
    }
  }, [printResult]);

  return (
    <div className="barcode-sheet-container">
      {/* ---- Row 1: Back + Title ---- */}
      <div className="sale-topbar bcs-topbar">
        <div className="topbar-left">
          <button className="topbar-btn topbar-btn-tertiary" onClick={onClose}>
            ← Back
          </button>
        </div>

        <span className="topbar-title blue">
          Label Preview — {totalLabels} Labels
        </span>

        <div className="topbar-right" />
      </div>

      {/* ---- Row 2: Printer select + Print button (stacked) ---- */}
      <div className="bcs-action-row">
        <div className="bcs-printer-group">
          <div className="bcs-printer-row">
            <div className="bcs-printer-icon">🖨️</div>
            <select
              className="bcs-printer-dropdown"
              value={selectedPrinter}
              onChange={(e) => setSelectedPrinter(e.target.value)}
            >
              <option value="">Select Printer…</option>
              {printers.map(p => (
                <option key={p.name} value={p.name}>
                  {p.name}{p.name.toUpperCase().includes('TSC') ? ' ✓' : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            className="topbar-btn topbar-btn-primary bcs-print-btn"
            onClick={handlePrint}
            disabled={isPrinting || !selectedPrinter}
          >
            {isPrinting ? (
              <>
                <span className="bcs-spinner"></span>
                Sending…
              </>
            ) : (
              <>🖨️ Print {totalLabels} Labels</>
            )}
          </button>
        </div>
      </div>

      {/* ---- Status message ---- */}
      {printResult && (
        <div className={`bcs-status-bar ${printResult.type}`}>
          <span className="bcs-status-icon">
            {printResult.type === 'success' ? '✅' : '⚠️'}
          </span>
          <span>{printResult.msg}</span>
        </div>
      )}

      {/* ---- Label grid ---- */}
      <div className="barcode-sheet">
        {labels.map((label) => (
          <div key={label.uniqueKey} className="barcode-label">
            <div className="label-header">
              <div className="label-item-code">{label.item_code}</div>
              <div className="label-brand">ATG</div>
            </div>
            <img ref={el => barcodeRefs.current[label.uniqueKey] = el} className="barcode-canvas" alt="" />

            <p className="label-item-name">
              {label.item_name || 'NO_NAME'}
            </p>
            <div className="label-footer">
              <div className="label-packing">{label.packing}</div>
              {label.isLastOfItem && (
                <div style={{ fontSize: '11pt', letterSpacing: '0.5px', textAlign: 'center', color: '#000', fontWeight: '900', margin: '0 4px', alignSelf: 'flex-end', lineHeight: 1 }}>
                  ---------
                </div>
              )}
              <div className="label-price">{label.sale_rate}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default BarcodeSheet;

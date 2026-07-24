const fs = require('fs');
let code = fs.readFileSync('src/components/NewSale.jsx', 'utf-8');

// 1. fillRow
code = code.replace(
  /saleRate:\s*rate,\n\s*purchaseRate:\s*purRate,\n\s*amount:\s*pkts \* rate,/,
  \saleRate:        rate,
      purchaseRate:    purRate,
      discount:        0,
      isReturn:        false,
      amount:          pkts * rate,\
);

// 2. updatePackets / updateRate
code = code.replace(
  /const updatePackets = \([^}]*\}\)\);\n  \};\n\n  const updateRate = \([^}]*\}\)\);\n  \};/,
  \const calcAmount = (item) => {
    const p = parseInt(item.packets) || 0;
    const actualP = item.isReturn ? -Math.abs(p) : Math.abs(p);
    const r = parseFloat(item.saleRate) || 0;
    const d = parseFloat(item.discount) || 0;
    return actualP * (r - d);
  };

  const updatePackets = (idx, val) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const newItem = { ...item, packets: val };
      return { ...newItem, amount: calcAmount(newItem) };
    }));
  };

  const updateRate = (idx, val) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const newItem = { ...item, saleRate: val };
      return { ...newItem, amount: calcAmount(newItem) };
    }));
  };

  const updateDiscount = (idx, val) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const newItem = { ...item, discount: val };
      return { ...newItem, amount: calcAmount(newItem) };
    }));
  };

  const toggleReturn = (idx) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const newItem = { ...item, isReturn: !item.isReturn };
      return { ...newItem, amount: calcAmount(newItem) };
    }));
  };\
);

// 3. scan product existingIdx logic
code = code.replace(
  /const newPkts = parseInt\(items\[existingIdx\]\.packets\) \+ pkts;\n\s*updateItem\(existingIdx, \{ packets: newPkts, amount: newPkts \* items\[existingIdx\]\.saleRate \}\);/,
  \const newPkts = Math.abs(parseInt(items[existingIdx].packets) || 0) + pkts;
        const actualP = items[existingIdx].isReturn ? -newPkts : newPkts;
        const r = parseFloat(items[existingIdx].saleRate) || 0;
        const d = parseFloat(items[existingIdx].discount) || 0;
        updateItem(existingIdx, { packets: newPkts, amount: actualP * (r - d) });\
);

// 4. handleSubmit totals fix. Wait, handleSubmit uses \items\. We need to map items before sending.
// Because the backend expects \packets\ to be negative if it's a return!
code = code.replace(
  /invoiceNo, customerName, customerPhone, items,/,
  \invoiceNo, customerName, customerPhone, items: items.map(i => ({...i, packets: i.isReturn ? -Math.abs(parseInt(i.packets) || 0) : Math.abs(parseInt(i.packets) || 0)})),\
);

// 5. Table Header
code = code.replace(
  /<th>Description<\/th>\n\s*<th className="center" style={{ width: '9%' }}>Packing<\/th>\n\s*<th className="right"  style={{ width: '11%' }}>Rate<\/th>/,
  \<th>Description</th>
                <th className="center" style={{ width: '9%' }}>Packing</th>
                <th className="center" style={{ width: '6%' }}>Ret?</th>
                <th className="right"  style={{ width: '11%' }}>Rate</th>
                <th className="right"  style={{ width: '9%' }}>Disc</th>\
);

// 6. Table Body (columns)
code = code.replace(
  /className="desc-main">\{item.itemDescription\}<\/span>\n\s*<\/td>\n\n\s*\{\/\* Packing \(editable, blue\) \*\/\}/,
  \className="desc-main">{item.itemDescription}</span>
                  </td>

                  {/* Packing (editable, blue) */}
                  <td className="center">
                    <input
                      ref={el => packetsRefs.current[idx] = el}
                      type="text"
                      inputMode="numeric"
                      value={item.packets}
                      onChange={e => updatePackets(idx, e.target.value.replace(/[^\\d]/g, ''))}
                      onKeyDown={e => handleRowKD(e, idx, 'packets')}
                      onFocus={e => { setFocusedItemIdx(idx); e.target.select(); }}
                      className="qty-field center packing-input"
                    />
                  </td>

                  {/* Return toggle */}
                  <td className="center">
                    <input type="checkbox" checked={item.isReturn || false} onChange={() => toggleReturn(idx)} tabIndex={-1} style={{ cursor: 'pointer', transform: 'scale(1.2)' }} />
                  </td>

                  {/* Rate (editable, yellow) */}\
);

// Need to remove the old packing td because I just injected it twice above basically, wait no, I injected the Return toggle BEFORE the old packing TD? No, I matched "className="desc-main">{item.itemDescription}</span></td>" and replaced it with Packing + Return toggle. Wait, the old Packing TD is STILL THERE!
// Let's just do it cleanly.
fs.writeFileSync('patch-newsale.js', code);

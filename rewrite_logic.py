import re

with open('d:/projects/SHOP/src/components/NewPurchase.jsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update makeRow
code = code.replace("return { id: nextId(), itemCode: '', description: '', packingQty: 0, packets: '', rate: '', amount: 0 };",
                    "return { id: nextId(), itemCode: '', description: '', packingQty: 0, packets: '', preDiscPrice: '', flatDiscount: 0, discPct: 0 };")

# 2. Add Header States
states_target = "const [purchaseDate, setPurchaseDate] = useState(todayDMY);\n  const [invoiceNo, setInvoiceNo] = useState('');\n  const [supplierName, setSupplierName] = useState('');"
states_replacement = "const [purchaseDate, setPurchaseDate] = useState(todayDMY);\n  const [invoiceNo, setInvoiceNo] = useState('');\n  const [supplierName, setSupplierName] = useState('');\n  const [supplierInvNo, setSupplierInvNo] = useState('');\n  const [supplierDate, setSupplierDate] = useState('');\n  const [vehicleNo, setVehicleNo] = useState('');\n  const [godown, setGodown] = useState('1-SHOP');"
code = code.replace(states_target, states_replacement)

# 3. Add to isEditing
edit_target = "setInvoiceNo(p.invoice_no || '');\n      setSupplierName(p.supplier_name || '');"
edit_repl = "setInvoiceNo(p.invoice_no || '');\n      setSupplierName(p.supplier_name || '');\n      setSupplierInvNo(p.supplier_inv_no || '');\n      setSupplierDate(p.supplier_date || '');\n      setVehicleNo(p.vehicle_no || '');\n      setGodown(p.godown || '1-SHOP');"
code = code.replace(edit_target, edit_repl)

# Update the map in get-purchase-items
map_target = "packets: String(r.packets),\n          rate: String(parseFloat(r.rate)),\n          amount: parseFloat(r.amount)"
map_repl = "packets: String(r.packets),\n          preDiscPrice: String(parseFloat(r.pre_disc_price || r.rate)),\n          flatDiscount: parseFloat(r.flat_discount || 0),\n          discPct: parseFloat(r.disc_pct || 0)"
code = code.replace(map_target, map_repl)

# 4. update handleCodeChange
hc_target = "r.id === rowId ? { ...r, itemCode: val, description: '', packingQty: 0, rate: '', amount: 0 } : r"
hc_repl = "r.id === rowId ? { ...r, itemCode: val, description: '', packingQty: 0, preDiscPrice: '', flatDiscount: 0, discPct: 0 } : r"
code = code.replace(hc_target, hc_repl)

# 5. update fillRow
fill_target = """  const fillRow = (rowId, product) => {
    const pkts = product.packing_qty || 0;
    let rate = parseFloat(product.purchase_rate) || 0;

    // Apply manufacturer discount if matches
    if (supplierName && product.brand) {
      const rule = mfgDiscounts.find(d => d.company_name.toLowerCase() === supplierName.toLowerCase() && d.brand_name.toLowerCase() === product.brand.toLowerCase());
      if (rule) {
        const pd = parseFloat(rule.purchase_discount_pct) || 0;
        const da = parseFloat(rule.discount_amount) || 0;
        if (da > 0) rate = rate - da;
        if (pd > 0) rate = rate - (rate * (pd / 100));
      }
    }

    setItems(prev => prev.map(r =>
      r.id === rowId ? {
        ...r,
        itemCode: product.item_code,
        description: descForProduct(product),
        packingQty: pkts,
        packets: String(pkts),
        rate: String(rate),
        amount: pkts * rate
      } : r
    ));"""
fill_repl = """  const fillRow = (rowId, product) => {
    const pkts = product.packing_qty || 0;
    let baseRate = parseFloat(product.purchase_rate) || 0;
    let flatD = 0;
    let pctD = 0;

    if (supplierName && product.brand) {
      const rule = mfgDiscounts.find(d => d.company_name.toLowerCase() === supplierName.toLowerCase() && d.brand_name.toLowerCase() === product.brand.toLowerCase());
      if (rule) {
        pctD = parseFloat(rule.purchase_discount_pct) || 0;
        flatD = parseFloat(rule.discount_amount) || 0;
      }
    }

    setItems(prev => prev.map(r =>
      r.id === rowId ? {
        ...r,
        itemCode: product.item_code,
        description: descForProduct(product),
        packingQty: pkts,
        packets: String(pkts),
        preDiscPrice: String(baseRate),
        flatDiscount: flatD,
        discPct: pctD
      } : r
    ));"""
code = code.replace(fill_target, fill_repl)

# 6. updateRow 
ur_target = """  const updateRow = (rowId, field, val) => {
    setItems(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const u = { ...r, [field]: val };
      u.amount = (parseInt(field === 'packets' ? val : u.packets) || 0)
               * (parseFloat(field === 'rate' ? val : u.rate) || 0);
      return u;
    }));
  };"""
ur_repl = """  const updateRow = (rowId, field, val) => {
    setItems(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      return { ...r, [field]: val };
    }));
  };"""
code = code.replace(ur_target, ur_repl)

# 7. ctrlD empty check
cd_target = "(!cur.rate || cur.rate === '0')"
cd_repl = "(!cur.preDiscPrice || cur.preDiscPrice === '0')"
code = code.replace(cd_target, cd_repl)

# 8. resetForm
rf_target = "setNotes('');\n    setDiscount('');\n    setMiscCharges('');"
rf_repl = "setSupplierInvNo('');\n    setSupplierDate('');\n    setVehicleNo('');\n    setGodown('1-SHOP');\n    setNotes('');\n    setDiscount('');\n    setMiscCharges('');"
code = code.replace(rf_target, rf_repl)

# 9. UseMemo Totals
mem_target = """  const totals = useMemo(() => {
    const valid = items.filter(r => r.description && parseInt(r.packets) > 0);
    const sub  = valid.reduce((s, r) => s + r.amount, 0);
    const pkts = valid.reduce((s, r) => s + (parseInt(r.packets) || 0), 0);
    const misc = parseFloat(miscCharges) || 0;
    const disc = parseFloat(discount) || 0;
    return { sub, pkts, misc, disc, grand: sub + misc - disc, count: valid.length };
  }, [items, miscCharges, discount]);"""

mem_repl = """  const { totals, rowMath } = useMemo(() => {
    const mathMap = {};
    let sub = 0;
    let pkts = 0;
    const misc = parseFloat(miscCharges) || 0;
    const disc = parseFloat(discount) || 0;
    
    items.forEach(r => {
      const q = parseInt(r.packets) || 0;
      const base = parseFloat(r.preDiscPrice) || 0;
      const flat = parseFloat(r.flatDiscount) || 0;
      const pPrice = Math.max(0, base - flat);
      const dPct = parseFloat(r.discPct) || 0;
      const rDisc = pPrice * (dPct / 100);
      const rowTotal = (pPrice - rDisc) * q;
      
      mathMap[r.id] = { pPrice, rowDiscTotal: rDisc * q, rowTotal, netRate: 0 };
      if (r.description && q > 0) {
        sub += rowTotal;
        pkts += q;
      }
    });

    const netAdjustment = misc - disc;
    
    items.forEach(r => {
      const math = mathMap[r.id];
      if (r.description && parseInt(r.packets) > 0 && sub > 0) {
        const ratio = math.rowTotal / sub;
        const assignedAdjustment = netAdjustment * ratio;
        math.netRate = (math.rowTotal + assignedAdjustment) / parseInt(r.packets);
      } else if (parseInt(r.packets) > 0) {
         math.netRate = math.rowTotal / parseInt(r.packets);
      }
    });

    return { 
      totals: { sub, pkts, misc, disc, grand: sub + misc - disc, count: items.filter(r => r.description && parseInt(r.packets) > 0).length },
      rowMath: mathMap
    };
  }, [items, miscCharges, discount]);"""
code = code.replace(mem_target, mem_repl)

# 10. HandleSubmit Payload
payload_target = """      const payload = {
        purchaseDate: dbDate, invoiceNo, supplierName, notes,
        discount: parseFloat(discount) || 0,
        miscCharges: parseFloat(miscCharges) || 0,
        items: valid.map(r => ({
          itemCode: r.itemCode,
          itemDescription: r.description,
          packingQty: r.packingQty,
          packets: parseInt(r.packets),
          rate: parseFloat(r.rate),
          amount: r.amount
        }))
      };"""
payload_repl = """      const payload = {
        purchaseDate: dbDate, invoiceNo, supplierName, notes,
        supplierInvNo, supplierDate, vehicleNo, godown,
        discount: parseFloat(discount) || 0,
        miscCharges: parseFloat(miscCharges) || 0,
        items: valid.map(r => {
          const math = rowMath[r.id];
          return {
            itemCode: r.itemCode,
            itemDescription: r.description,
            packingQty: r.packingQty,
            packets: parseInt(r.packets),
            rate: math.rowTotal / parseInt(r.packets),
            amount: math.rowTotal,
            preDiscPrice: parseFloat(r.preDiscPrice) || 0,
            flatDiscount: r.flatDiscount,
            discPct: r.discPct,
            discountAmount: math.rowDiscTotal,
            netRate: math.netRate
          };
        })
      };"""
code = code.replace(payload_target, payload_repl)

with open('d:/projects/SHOP/src/components/NewPurchase.jsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Logic Rewrite Complete")

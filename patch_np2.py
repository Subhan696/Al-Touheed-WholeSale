import sys
file_path = 'd:/projects/SHOP/src/components/NewPurchase.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add state variable
state_find = """  const [purchaseExpenses, setPurchaseExpenses] = useState([]);
  const [showExpensesModal, setShowExpensesModal] = useState(false);"""
state_replace = """  const [purchaseExpenses, setPurchaseExpenses] = useState([]);
  const [purchaseExpenseTotal, setPurchaseExpenseTotal] = useState('');
  const [showExpensesModal, setShowExpensesModal] = useState(false);"""
content = content.replace(state_find, state_replace)

# 2. Update fetching to set purchaseExpenseTotal
fetch_find = """          setPurchaseExpenses(mapped);
        });"""
fetch_replace = """          setPurchaseExpenses(mapped);
          const total = mapped.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
          setPurchaseExpenseTotal(total > 0 ? String(total) : '');
        });"""
content = content.replace(fetch_find, fetch_replace)

# 3. Update payload
payload_find = """        discount: parseFloat(discount) || 0,
        miscCharges: parseFloat(miscCharges) || 0,"""
payload_replace = """        discount: parseFloat(discount) || 0,
        miscCharges: parseFloat(miscCharges) || 0,
        purchaseExpenseTotal: parseFloat(purchaseExpenseTotal) || 0,"""
content = content.replace(payload_find, payload_replace)

# 4. Update totals calculation
totals_find = """    let pkts = 0;
    const misc = parseFloat(miscCharges) || 0;
    const disc = parseFloat(discount) || 0;

    let grossSub = 0;"""
totals_replace = """    let pkts = 0;
    const misc = parseFloat(miscCharges) || 0;
    const expTotal = parseFloat(purchaseExpenseTotal) || 0;
    const disc = parseFloat(discount) || 0;

    let grossSub = 0;"""
content = content.replace(totals_find, totals_replace)

totals_grand_find = """    let grand = sub - disc + misc;
    if (grand < 0) grand = 0;

    return { totals: { sub, pkts, grand }, rowMath: mathMap };
  }, [items, miscCharges, discount, mfgDiscounts]);"""
totals_grand_replace = """    let grand = sub - disc + misc + expTotal;
    if (grand < 0) grand = 0;

    return { totals: { sub, pkts, grand }, rowMath: mathMap };
  }, [items, miscCharges, purchaseExpenseTotal, discount, mfgDiscounts]);"""
content = content.replace(totals_grand_find, totals_grand_replace)

# 5. Update Bottom Summary Bar
bottom_find = """              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: '0.95rem', fontWeight: 600 }}>Pur. Exp.(+):</label>
                <input
                  type="number"
                  value={miscCharges}
                  readOnly
                  className="form-input right-text"
                  style={{ width: 80, height: 32, padding: '4px 8px', fontSize: '0.95rem', background: '#e2e8f0' }}
                />
                <button type="button" onClick={() => setShowExpensesModal(true)} style={{ padding: '4px 8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                  Add Expenses
                </button>
              </div>"""
bottom_replace = """              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: '0.95rem', fontWeight: 600 }}>Misc(+):</label>
                <input
                  type="number"
                  value={miscCharges}
                  onChange={e => setMiscCharges(e.target.value)}
                  className="form-input right-text"
                  style={{ width: 80, height: 32, padding: '4px 8px', fontSize: '0.95rem' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: '0.95rem', fontWeight: 600 }}>Pur. Exp.(+):</label>
                <input
                  type="number"
                  value={purchaseExpenseTotal}
                  readOnly
                  className="form-input right-text"
                  style={{ width: 80, height: 32, padding: '4px 8px', fontSize: '0.95rem', background: '#e2e8f0' }}
                />
                <button type="button" onClick={() => setShowExpensesModal(true)} style={{ padding: '4px 8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                  Add Expenses
                </button>
              </div>"""
content = content.replace(bottom_find, bottom_replace)

# 6. Update Apply button
apply_find = """                  const total = purchaseExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
                  setMiscCharges(String(total));
                  
                  const remarksArr ="""
apply_replace = """                  const total = purchaseExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
                  setPurchaseExpenseTotal(String(total));
                  
                  const remarksArr ="""
content = content.replace(apply_find, apply_replace)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated NewPurchase.jsx for separate Misc and Purchase Expense fields')

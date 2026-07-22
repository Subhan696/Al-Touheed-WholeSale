import sys
file_path = 'd:/projects/SHOP/src/components/NewPurchase.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add state variables
state_find = """const [isSubmitting, setIsSubmitting] = useState(false);"""
state_replace = """const [isSubmitting, setIsSubmitting] = useState(false);
  const [expenseAccounts, setExpenseAccounts] = useState([]);
  const [purchaseExpenses, setPurchaseExpenses] = useState([]);
  const [showExpensesModal, setShowExpensesModal] = useState(false);"""
content = content.replace(state_find, state_replace)

# 2. Add data loading in first useEffect
mount_find = """ipcRenderer.invoke('get-raw-manufacturer-brands').then(res => setMfgDiscounts(res || [])).catch(() => { });
  }, []);"""
mount_replace = """ipcRenderer.invoke('get-raw-manufacturer-brands').then(res => setMfgDiscounts(res || [])).catch(() => { });
    ipcRenderer.invoke('get-expense-accounts').then(res => {
      setExpenseAccounts(res || []);
      if (!isEditing) {
        setPurchaseExpenses(res.map(a => ({ ...a, expense_account_id: a.id, cartons: '', amount: '' })));
      }
    }).catch(() => {});
  }, []);"""
content = content.replace(mount_find, mount_replace)

# 3. Add data loading in edit useEffect
edit_find = """          flatDiscount: parseFloat(r.flat_discount || 0),
          discPct: parseFloat(r.disc_pct || 0)
        }));
        mapped.push(makeRow());
        setItems(mapped);
      });"""
edit_replace = """          flatDiscount: parseFloat(r.flat_discount || 0),
          discPct: parseFloat(r.disc_pct || 0)
        }));
        mapped.push(makeRow());
        setItems(mapped);
      });
      ipcRenderer.invoke('get-purchase-expenses', p.id).then(rows => {
        ipcRenderer.invoke('get-expense-accounts').then(accounts => {
          const mapped = accounts.map(a => {
            const existing = rows.find(r => r.expense_account_id === a.id);
            if (existing) {
              return { ...a, expense_account_id: a.id, cartons: existing.cartons || '', amount: existing.amount || '' };
            }
            return { ...a, expense_account_id: a.id, cartons: '', amount: '' };
          });
          setPurchaseExpenses(mapped);
        });
      }).catch(() => {});"""
content = content.replace(edit_find, edit_replace)

# 4. Modify payload in handleSubmit
payload_find = """      const payload = {
        purchaseDate: dbDate, invoiceNo, supplierName, notes,
        supplierInvNo, supplierDate, vehicleNo, godown,
        discount: parseFloat(discount) || 0,
        miscCharges: parseFloat(miscCharges) || 0,
        items: valid.map(r => {"""
payload_replace = """      const payload = {
        purchaseDate: dbDate, invoiceNo, supplierName, notes,
        supplierInvNo, supplierDate, vehicleNo, godown,
        discount: parseFloat(discount) || 0,
        miscCharges: parseFloat(miscCharges) || 0,
        expenses: purchaseExpenses.map(e => ({
          expense_account_id: e.expense_account_id,
          account_name: e.account_name,
          cartons: parseInt(e.cartons) || 0,
          rate: parseFloat(e.default_rate) || 0,
          amount: parseFloat(e.amount) || 0
        })).filter(e => e.amount > 0),
        items: valid.map(r => {"""
content = content.replace(payload_find, payload_replace)

# 5. Add UI logic for the expenses button and modal
ui_find = """              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: '0.95rem', fontWeight: 600 }}>Pur. Exp.(+):</label>
                <input
                  type="number"
                  value={miscCharges}
                  onChange={e => setMiscCharges(e.target.value)}
                  className="form-input right-text"
                  style={{ width: 80, height: 32, padding: '4px 8px', fontSize: '0.95rem' }}
                />
              </div>"""
ui_replace = """              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
content = content.replace(ui_find, ui_replace)

# 6. Append modal at the bottom
modal_string = """
      {/* Purchase Expenses Modal */}
      {showExpensesModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 8, width: 500, padding: 24, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: '1.25rem', color: '#1e293b' }}>Purchase Expenses</h3>
            
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '8px 4px' }}>Expense Account</th>
                  <th style={{ textAlign: 'center', padding: '8px 4px', width: 80 }}>Cartons</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px', width: 80 }}>Rate</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px', width: 100 }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {purchaseExpenses.map((exp, idx) => (
                  <tr key={exp.expense_account_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 4px', fontWeight: 500, color: '#334155' }}>{exp.account_name}</td>
                    <td style={{ padding: '8px 4px' }}>
                      <input 
                        type="number" 
                        value={exp.cartons}
                        onChange={e => {
                          const val = e.target.value;
                          const newExp = [...purchaseExpenses];
                          newExp[idx].cartons = val;
                          if (val && !isNaN(val)) {
                            newExp[idx].amount = (parseFloat(val) * parseFloat(newExp[idx].default_rate)).toFixed(2);
                          } else {
                            newExp[idx].amount = '';
                          }
                          setPurchaseExpenses(newExp);
                        }}
                        className="form-input center-text"
                        style={{ width: '100%', padding: '4px', height: 28 }}
                      />
                    </td>
                    <td style={{ padding: '8px 4px', textAlign: 'right', color: '#64748b' }}>
                      {parseFloat(exp.default_rate).toFixed(2)}
                    </td>
                    <td style={{ padding: '8px 4px' }}>
                      <input 
                        type="number" 
                        value={exp.amount}
                        onChange={e => {
                          const newExp = [...purchaseExpenses];
                          newExp[idx].amount = e.target.value;
                          setPurchaseExpenses(newExp);
                        }}
                        className="form-input right-text"
                        style={{ width: '100%', padding: '4px', height: 28 }}
                      />
                    </td>
                  </tr>
                ))}
                {purchaseExpenses.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: 16, color: '#94a3b8' }}>No expense accounts setup.</td>
                  </tr>
                )}
              </tbody>
            </table>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button 
                type="button" 
                onClick={() => setShowExpensesModal(false)}
                style={{ padding: '8px 16px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={() => {
                  const total = purchaseExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
                  setMiscCharges(String(total));
                  setShowExpensesModal(false);
                }}
                style={{ padding: '8px 16px', background: '#22c55e', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
              >
                Apply Total
              </button>
            </div>
          </div>
        </div>
      )}"""
content = content.replace("    </div>\n  );\n}\n\nexport default NewPurchase;", modal_string + "\n    </div>\n  );\n}\n\nexport default NewPurchase;")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated NewPurchase.jsx')

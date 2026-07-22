import sys
file_path = 'd:/projects/SHOP/src/components/NewPurchase.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

reset_find = """    setNotes('');
    setDiscount('');
    setMiscCharges('');
    setItems([makeRow()]);"""

reset_replace = """    setNotes('');
    setDiscount('');
    setMiscCharges('');
    setPurchaseExpenseTotal('');
    setPurchaseExpenses(prev => prev.map(exp => ({ ...exp, cartons: '', amount: '' })));
    setItems([makeRow()]);"""

apply_find = """                  const total = purchaseExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
                  setPurchaseExpenseTotal(String(total));
                  
                  const remarksArr = purchaseExpenses.filter(e => parseFloat(e.amount) > 0).map(e => `[${e.cartons} x ${e.account_name} @ ${e.default_rate}]`);
                  if (remarksArr.length > 0) {
                    const newNotes = (notes + ' ' + remarksArr.join(' ')).trim();
                    setNotes(newNotes);
                  }
                  
                  setShowExpensesModal(false);"""

apply_replace = """                  const total = purchaseExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
                  setPurchaseExpenseTotal(String(total));
                  setShowExpensesModal(false);"""

content = content.replace(reset_find, reset_replace)
content = content.replace(apply_find, apply_replace)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed reset logic and removed remarks logic')

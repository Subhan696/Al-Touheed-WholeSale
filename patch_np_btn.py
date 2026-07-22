import sys
file_path = 'd:/projects/SHOP/src/components/NewPurchase.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

apply_find = """                onClick={() => {
                  const total = purchaseExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
                  setMiscCharges(String(total));
                  setShowExpensesModal(false);
                }}"""
apply_replace = """                onClick={() => {
                  const total = purchaseExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
                  setMiscCharges(String(total));
                  
                  const remarksArr = purchaseExpenses.filter(e => parseFloat(e.amount) > 0).map(e => `[${e.cartons} x ${e.account_name} @ ${e.default_rate}]`);
                  if (remarksArr.length > 0) {
                    const newNotes = (notes + ' ' + remarksArr.join(' ')).trim();
                    setNotes(newNotes);
                  }
                  
                  setShowExpensesModal(false);
                }}"""
content = content.replace(apply_find, apply_replace)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated Apply button')

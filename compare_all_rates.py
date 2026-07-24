import fitz
import psycopg2

pdf_path = r'D:\pdfs\ALL OVER  A TO Z.pdf'
doc = fitz.open(pdf_path)

pdf_rates = {}

for page_num in range(len(doc)):
    page = doc.load_page(page_num)
    words = page.get_text('words')
    
    # Sort words top-to-bottom, then left-to-right
    words.sort(key=lambda w: (w[1], w[0]))
    
    current_alias = None
    
    for w in words:
        x0, y0, x1, y1, text, block_no, line_no, word_no = w
        
        # Check if word is in Alias column
        if 35 <= x0 <= 80:
            if text.isdigit() or len(text) >= 2:
                current_alias = text
                
        # Check if word is in Pur. Price column
        elif 415 <= x0 <= 465 and current_alias:
            # Clean text
            clean_text = text.replace(',', '')
            try:
                price = float(clean_text)
                if current_alias not in pdf_rates:
                    pdf_rates[current_alias] = price
            except ValueError:
                pass

# Now fetch DB rates
conn = psycopg2.connect('postgresql://atg_user:atg_pass123@localhost:5432/atg_wholesale')
cur = conn.cursor()
cur.execute('SELECT item_code, purchase_rate FROM products')
db_rates = {str(r[0]): float(r[1] or 0) for r in cur.fetchall()}

# Check latest opening purchase quantities
cur.execute('''
    SELECT pi.item_code, pi.packets 
    FROM purchase_items pi
    JOIN purchases p ON pi.purchase_id = p.id
    WHERE p.supplier_name = 'Opening Stock'
    ORDER BY p.id DESC
''')
# Assuming the latest opening purchase has the highest ID
# Actually let's just get the absolute latest purchase ID that is Opening Stock
cur.execute("SELECT id FROM purchases WHERE supplier_name='Opening Stock' ORDER BY id DESC LIMIT 1")
latest_id_row = cur.fetchone()
qty_map = {}
if latest_id_row:
    cur.execute('SELECT item_code, packets FROM purchase_items WHERE purchase_id = %s', (latest_id_row[0],))
    for row in cur.fetchall():
        code = str(row[0])
        qty = int(row[1])
        if code in qty_map:
            qty_map[code] += qty
        else:
            qty_map[code] = qty

conn.close()

mismatches = []
for code, pdf_price in pdf_rates.items():
    db_price = db_rates.get(code)
    qty = qty_map.get(code, 0)
    
    if db_price is not None and db_price != pdf_price and qty > 0:
        diff = (pdf_price - db_price) * qty
        if diff != 0:
            mismatches.append({
                'code': code,
                'qty': qty,
                'pdf_rate': pdf_price,
                'db_rate': db_price,
                'diff': diff
            })

print(f"Total extracted from PDF: {len(pdf_rates)}")
print(f"Found mismatches with QTY > 0: {len(mismatches)}")

total_diff = sum(m['diff'] for m in mismatches)
print(f"Total difference in value: {total_diff:.2f}")

# Print first 50
print("\n--- Top Mismatches ---")
for m in sorted(mismatches, key=lambda x: abs(x['diff']), reverse=True)[:50]:
    print(f"Code: {m['code']:<6} | Qty: {m['qty']:<4} | PDF Rate: {m['pdf_rate']:<8} | DB Rate: {m['db_rate']:<8} | Diff: {m['diff']:.2f}")

import fitz
import json
import re

pdf_path = r'C:\Users\ST\.gemini\antigravity-ide\brain\8b0efe22-55d5-41d2-a34b-f45ae2ea5d5b\media__1784819121301.pdf'
doc = fitz.open(pdf_path)

items = []
current_brand = "UNKNOWN"

for page_num in range(len(doc)):
    page = doc.load_page(page_num)
    
    # get_text("words") returns list of tuples: (x0, y0, x1, y1, word, block_no, line_no, word_no)
    words = page.get_text("words")
    
    # Group words by line (using approximate y0)
    lines = {}
    for w in words:
        x0, y0, x1, y1, text, b, l, w_no = w
        
        # Round y0 to group things on the same line. 5 pixels tolerance is usually good.
        y_group = round(y0 / 5) * 5
        
        if y_group not in lines:
            lines[y_group] = []
        lines[y_group].append((x0, text))
        
    # Sort lines from top to bottom
    sorted_y = sorted(lines.keys())
    
    for y in sorted_y:
        # Sort words in this line from left to right
        line_words = sorted(lines[y], key=lambda item: item[0])
        full_line = " ".join([item[1] for item in line_words])
        full_line = full_line.strip()
        
        if not full_line:
            continue
            
        # Ignore headers and footers
        if full_line.startswith('Stock In Hand') or full_line.startswith('AL - TOUHEED') or full_line.startswith('SHOP 2 AND 3') or full_line.startswith('Sr. No.'):
            continue
        if full_line.startswith('Class Total:') or full_line.startswith('Category Total:') or full_line.startswith('Manf. Total:') or full_line.startswith('Grand Total:'):
            continue
        if full_line in ['F/S', 'WTR', 'H/S', 'SHIRT F/S', 'SHIRT H/S', 'TERRY F/S', 'Z-MISS PLACE', '* *CUT.PEICE', '*CUT PEICE*']:
            continue
        if full_line.startswith('OLD *2025*') or full_line.startswith('Z-EXACT') or full_line.startswith('**MISS PLACE**') or full_line.startswith('*2024*') or full_line == '2026' or full_line == '14 AUG H/S':
            continue
        if 'Date:' in full_line and 'CHOWK RANG MAHAL' in full_line:
            continue
        if 'Page' in full_line and 'of' in full_line:
            continue
            
        # Brand detection
        if 'Date:' in full_line and not full_line.startswith('SHOP'):
            brand_match = re.match(r'^(.*?)\s+Date:', full_line)
            if brand_match:
                current_brand = brand_match.group(1).strip()
            continue

        # Match row using the exact sequence that is rendered left to right
        # Sr. No. | Alias Name | Item Name | Qty | Pur. Price | Sale Price | P/Unit
        match = re.match(r'^(\d+)\s+([A-Za-z0-9\-\*]+)\s+(.+?)\s+([\d,]+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+(\d+)$', full_line)
        if match:
            sr_no, alias, name, qty, pur_price, sale_price, p_unit = match.groups()
            
            qty = int(qty.replace(',', ''))
            pur_price = float(pur_price.replace(',', ''))
            sale_price = float(sale_price.replace(',', ''))
            p_unit = int(p_unit)
            
            items.append({
                "sr_no": int(sr_no),
                "alias_name": alias,
                "item_name": name.strip(),
                "qty": qty,
                "purchase_price": pur_price,
                "sale_price": sale_price,
                "p_unit": p_unit,
                "brand": current_brand
            })

with open(r'd:\projects\SHOP\opening_purchase.json', 'w', encoding='utf-8') as f:
    json.dump(items, f, indent=2)

print(f"Extracted {len(items)} items to opening_purchase.json")

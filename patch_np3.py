import sys
file_path = 'd:/projects/SHOP/src/components/NewPurchase.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

find_text = """    const netAdjustment = misc - disc;

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
      totals: { sub: grossSub, pkts, misc, disc: disc + totalItemDisc, grand: sub + misc - disc, count: items.filter(r => r.description && parseInt(r.packets) > 0).length },
      rowMath: mathMap
    };
  }, [items, miscCharges, discount]);"""

replace_text = """    const netAdjustment = misc + expTotal - disc;

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
      totals: { 
        sub: grossSub, 
        pkts, 
        misc, 
        disc: disc + totalItemDisc, 
        grand: sub + misc + expTotal - disc, 
        count: items.filter(r => r.description && parseInt(r.packets) > 0).length 
      },
      rowMath: mathMap
    };
  }, [items, miscCharges, discount, purchaseExpenseTotal]);"""

content = content.replace(find_text, replace_text)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated totals and net adjustment math')

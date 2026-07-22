import sys
file_path = 'd:/projects/SHOP/src/components/ExpenseAccounts.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add nameRef
ref_find = """  const [msg, setMsg] = useState({ text: '', type: '' });
  const rateRef = useRef(null);"""
ref_replace = """  const [msg, setMsg] = useState({ text: '', type: '' });
  const rateRef = useRef(null);
  const nameRef = useRef(null);"""
content = content.replace(ref_find, ref_replace)

# 2. Add focus on mount
mount_find = """  useEffect(() => {
    loadData();
    const refresh = () => loadData();"""
mount_replace = """  useEffect(() => {
    loadData();
    setTimeout(() => nameRef.current?.focus(), 100);
    const refresh = () => loadData();"""
content = content.replace(mount_find, mount_replace)

# 3. Refocus on save
save_find = """      setAccountName('');
      setDefaultRate('');
      setEditId(null);
    } catch (err) {"""
save_replace = """      setAccountName('');
      setDefaultRate('');
      setEditId(null);
      setTimeout(() => nameRef.current?.focus(), 50);
    } catch (err) {"""
content = content.replace(save_find, save_replace)

# 4. Refocus on edit cancel
cancel_find = """  const handleCancel = () => {
    setEditId(null);
    setAccountName('');
    setDefaultRate('');
  };"""
cancel_replace = """  const handleCancel = () => {
    setEditId(null);
    setAccountName('');
    setDefaultRate('');
    setTimeout(() => nameRef.current?.focus(), 50);
  };"""
content = content.replace(cancel_find, cancel_replace)

# 5. Fix handleDelete to use confirm-dialog
del_find = """  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense account?')) return;
    try {
      const res = await ipcRenderer.invoke('delete-expense-account', id);
      if (!res.success) {
          showMsg(res.error || 'Cannot delete account. It might be in use.', 'error');
      } else {
          showMsg('Deleted successfully');
          loadData();
      }
    } catch(err) {
      showMsg('Cannot delete account. It is already in use by past purchases.', 'error');
    }
  };"""
del_replace = """  const handleDelete = async (id) => {
    const confirmed = await ipcRenderer.invoke('confirm-dialog', 'Delete this expense account?');
    if (!confirmed) return;
    try {
      const res = await ipcRenderer.invoke('delete-expense-account', id);
      if (!res.success) {
          showMsg(res.error || 'Cannot delete account. It might be in use.', 'error');
      } else {
          showMsg('Deleted successfully');
          loadData();
      }
    } catch(err) {
      showMsg('Cannot delete account. It is already in use by past purchases.', 'error');
    }
    setTimeout(() => nameRef.current?.focus(), 50);
  };"""
content = content.replace(del_find, del_replace)

# 6. Add ref to the input
input_find = """            <input 
              type="text" 
              value={accountName}"""
input_replace = """            <input 
              ref={nameRef}
              type="text" 
              value={accountName}"""
content = content.replace(input_find, input_replace)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated ExpenseAccounts.jsx for focus management and native confirm-dialog')

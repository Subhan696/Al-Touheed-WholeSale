import React, { useState, useEffect } from 'react';

const { ipcRenderer } = window.require('electron');

function ReceiptSettings() {
  const [settings, setSettings] = useState({
    shopName: 'AL - TOUHEED GARMENTS',
    shopSub: 'SHOP NO E-2028 KUCHA CHAH TAILIAN RANG MAHAL LAHORE',
    shopAddress: 'SHOP 2 AND 3, GROUND FLOOR AL MUMTAZ CENTRE\nCHOWK RANG MAHAL, LAHORE\nPhone #: (+92 42) 37639907',
    invoiceTitle: 'Cash Sale Invoice',
    footerNotes: 'THANKS FOR YOUR VISIT ****!!!!\nDON\'T EXCHANGE DAMAGED ITEMS AND LOOSE PIECE NOTE: NO ANY RETURN\nBRANCH # 2 ..... SHOP NO # E-2028 KUCHA CHAH TAILIAN RANG MAHAL'
  });
  
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    ipcRenderer.invoke('get-receipt-settings').then(res => {
      if (res && Object.keys(res).length > 0) {
        const formatted = { ...res };
        if (formatted.shopAddress) formatted.shopAddress = formatted.shopAddress.replace(/<br\s*\/?>/gi, '\n');
        if (formatted.footerNotes) formatted.footerNotes = formatted.footerNotes.replace(/<br\s*\/?>/gi, '\n');
        setSettings(prev => ({ ...prev, ...formatted }));
      }
    }).catch(err => {
      console.error('Failed to load receipt settings:', err);
    });
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage('');
    try {
      const res = await ipcRenderer.invoke('save-receipt-settings', settings);
      if (res.success) {
        setMessage('Receipt settings saved successfully!');
      } else {
        setMessage(res.error || 'Failed to save settings.');
      }
    } catch (err) {
      setMessage('Error saving settings: ' + err.message);
    }
    setIsSaving(false);
    setTimeout(() => setMessage(''), 3000);
  };

  return (
    <div style={{ padding: '30px', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif', minHeight: '100vh', paddingBottom: '100px', overflowY: 'auto', boxSizing: 'border-box' }}>
      <h2 style={{ marginBottom: '20px', color: '#1e1e2d', fontWeight: '800' }}>Print / Receipt Settings</h2>
      <p style={{ color: '#7e8299', marginBottom: '25px', fontSize: '14px' }}>
        New lines typed in the address or footer fields will appear directly on the receipt.
      </p>

      {message && (
        <div style={{ padding: '12px', marginBottom: '20px', borderRadius: '6px', background: message.includes('success') ? '#dcfce7' : '#fee2e2', color: message.includes('success') ? '#166534' : '#991b1b', fontWeight: 'bold' }}>
          {message}
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>Shop Name (Header)</label>
          <input 
            type="text" 
            name="shopName" 
            value={settings.shopName} 
            onChange={handleChange} 
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '15px' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>Shop Subtitle (Below Name)</label>
          <input 
            type="text" 
            name="shopSub" 
            value={settings.shopSub} 
            onChange={handleChange} 
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '15px' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>Invoice Title</label>
          <input 
            type="text" 
            name="invoiceTitle" 
            value={settings.invoiceTitle} 
            onChange={handleChange} 
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '15px' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>Shop Address / Contact Info</label>
          <textarea 
            name="shopAddress" 
            value={settings.shopAddress} 
            onChange={handleChange} 
            rows={4}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '15px', fontFamily: 'monospace' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>Footer Notes / Return Policy</label>
          <textarea 
            name="footerNotes" 
            value={settings.footerNotes} 
            onChange={handleChange} 
            rows={4}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '15px', fontFamily: 'monospace' }}
          />
        </div>

        <div style={{ marginTop: '10px' }}>
          <button 
            type="submit" 
            disabled={isSaving}
            style={{ 
              padding: '12px 24px', 
              background: '#3699ff', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '6px', 
              fontWeight: 'bold', 
              fontSize: '16px', 
              cursor: isSaving ? 'not-allowed' : 'pointer' 
            }}>
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ReceiptSettings;

import React, { useState, memo, useEffect } from 'react';
import { DataProvider } from './context/DataContext';
import LoginPage from './components/LoginPage';
import NewItemForm from './components/NewItemForm';
import ProductList from './components/ProductList';
import StockList from './components/StockList';
import NewPurchase from './components/NewPurchase';
import FastPurchase from './components/FastPurchase';
import OpenPurchase from './components/OpenPurchase';
import PurchaseList from './components/PurchaseList';
import PurchaseReturn from './components/PurchaseReturn';
import PurchaseReturnList from './components/PurchaseReturnList';
import NewSale from './components/NewSale';
import SalesList from './components/SalesList';
import SalesReturn from './components/SalesReturn';
import SalesReturnList from './components/SalesReturnList';
import Reports from './components/Reports';
import UserManagement from './components/UserManagement';
import NetworkSettings from './components/NetworkSettings';
import BackupSettings from './components/BackupSettings';
import ManufacturerDiscounts from './components/ManufacturerDiscounts';
import ExpenseAccounts from './components/ExpenseAccounts';
import BarcodePrint from './components/BarcodePrint';
import Ledgers from './components/Ledgers';
import ManufacturerStockReport from './components/ManufacturerStockReport';
import Customers from './components/Customers';
import ReceiptSettings from './components/ReceiptSettings';
import GLAccounts from './components/GLAccounts';
import GLVouchers from './components/GLVouchers';
import GLLedgerReport from './components/GLLedgerReport';
import GLCashActivityReport from './components/GLCashActivityReport';
import CustomerBalanceList from './components/CustomerBalanceList';
import SupplierBalanceList from './components/SupplierBalanceList';
import ItemAudit from './components/ItemAudit';
import './App.css';

const WindowContent = memo(({ win, isActive, currentUser, closeTopWindow, openWindow, hasPermission, handleEditProduct, handleEditPurchase, handleEditReturn, handleEditSale, handleEditSalesReturn, setShowLayoutTabs }) => {
  const tabKey = win.rootKey || win.key;

  if (tabKey === 'new-item') return <NewItemForm editItemData={win.editItemData} onClearEdit={closeTopWindow} isActive={isActive} currentUser={currentUser} openWindow={openWindow} />;
  if (tabKey === 'products') return <ProductList onEditProduct={hasPermission('manage_products') ? handleEditProduct : undefined} currentUser={currentUser} isActive={isActive} onOpenAudit={(itemCode) => openWindow('item-audit', { initialItemCode: itemCode })} />;
  if (tabKey === 'stock') return <StockList isActive={isActive} currentUser={currentUser} onOpenAudit={(itemCode) => openWindow('item-audit', { initialItemCode: itemCode })} />;
  if (tabKey === 'item-audit') return <ItemAudit initialItemCode={win.initialItemCode} onExit={closeTopWindow} isActive={isActive} />;

  if (tabKey === 'new-purchase') return (
    <NewPurchase currentUser={currentUser} purchaseToEdit={win.purchaseToEdit}
      onSaveSuccess={() => { closeTopWindow(); openWindow('purchases'); }}
      onCancelEdit={closeTopWindow} isActive={isActive} />
  );
  if (tabKey === 'fast-purchase') return <FastPurchase currentUser={currentUser} openWindow={openWindow} isActive={isActive} onClose={closeTopWindow} />;
  if (tabKey === 'purchases') return <PurchaseList currentUser={currentUser} onEditPurchase={hasPermission('manage_purchases') ? handleEditPurchase : undefined} isActive={isActive} />;
  if (tabKey === 'open-purchase') return (
    <OpenPurchase currentUser={currentUser} purchaseToEdit={win.purchaseToEdit}
      onSaveSuccess={() => { closeTopWindow(); openWindow('purchases'); }}
      onCancelEdit={closeTopWindow} isActive={isActive} />
  );
  if (tabKey === 'purchase-return') return (
    <PurchaseReturn currentUser={currentUser} returnToEdit={win.returnToEdit}
      onSaveSuccess={() => { closeTopWindow(); openWindow('purchase-return-list'); }}
      onCancelEdit={closeTopWindow} isActive={isActive} />
  );
  if (tabKey === 'purchase-return-list') return <PurchaseReturnList currentUser={currentUser} onEditReturn={handleEditReturn} isActive={isActive} />;

  if (tabKey === 'sale') return (
    <NewSale currentUser={currentUser} saleToEdit={win.saleToEdit}
      onSaveSuccess={() => { closeTopWindow(); openWindow('sale', { forceNewInstance: true }); }}
      onExit={closeTopWindow} isActive={isActive}
      onViewSalesList={() => openWindow('sales-list')}
      onNewSale={() => { openWindow('sale', { forceNewInstance: true }); }} />
  );
  if (tabKey === 'sales-list') return <SalesList onEditSale={handleEditSale} onNewSale={() => openWindow('sale', { forceNewInstance: true })} onExit={closeTopWindow} currentUser={currentUser} isActive={isActive} />;
  if (tabKey === 'sales-return') return (
    <SalesReturn currentUser={currentUser} returnToEdit={win.returnToEdit}
      onSaveSuccess={() => { closeTopWindow(); openWindow('sales-return-list'); }}
      onExit={closeTopWindow} isActive={isActive}
      onViewReturnsList={() => openWindow('sales-return-list')}
      onNewReturn={() => openWindow('sales-return', { forceNewInstance: true })} />
  );
  if (tabKey === 'sales-return-list') return (
    <SalesReturnList onEditReturn={handleEditSalesReturn} 
      onNewReturn={() => openWindow('sales-return', { forceNewInstance: true })}
      onExit={closeTopWindow}
      currentUser={currentUser} isActive={isActive} />
  );

  if (tabKey === 'barcode-print') return <BarcodePrint isActive={isActive} />;

  if (tabKey === 'reports') return <Reports currentUser={currentUser} isActive={isActive} />;
  if (tabKey === 'users') return <UserManagement currentUser={currentUser} />;
  if (tabKey === 'customers') return <Customers currentUser={currentUser} onSelectCustomerLedger={(c) => openWindow('ledgers', { initialTab: 'customer', initialCustomer: c })} />;
  if (tabKey === 'ledgers') return <Ledgers currentUser={currentUser} initialTab={win.initialTab || 'customer'} initialCustomer={win.initialCustomer} isActive={isActive} hasPermission={hasPermission} />;
  if (tabKey === 'customer-ledger') return <Ledgers currentUser={currentUser} initialTab="customer" initialCustomer={win.initialCustomer} isActive={isActive} hasPermission={hasPermission} />;
  if (tabKey === 'customer-balance-list') return <CustomerBalanceList currentUser={currentUser} isActive={isActive} />;
  if (tabKey === 'supplier-balance-list') return <SupplierBalanceList currentUser={currentUser} isActive={isActive} />;
  if (tabKey === 'cash-ledger') return <Ledgers currentUser={currentUser} initialTab="cash" isActive={isActive} hasPermission={hasPermission} />;
  if (tabKey === 'bank-ledger') return <Ledgers currentUser={currentUser} initialTab="bank" isActive={isActive} hasPermission={hasPermission} />;
  if (tabKey === 'supplier-ledger') return <Ledgers currentUser={currentUser} initialTab="supplier" isActive={isActive} hasPermission={hasPermission} />;
  if (tabKey === 'freight-report') return <Ledgers currentUser={currentUser} initialTab="freight" isActive={isActive} hasPermission={hasPermission} />;
  if (tabKey === 'expense-ledger') return <GLLedgerReport currentUser={currentUser} initialTab="expense" />;
  if (tabKey === 'equity-ledger') return <GLLedgerReport currentUser={currentUser} initialTab="equity" />;
  if (tabKey === 'network-settings') return <NetworkSettings />;
  if (tabKey === 'receipt-settings') return <ReceiptSettings />;
  if (tabKey === 'backup') return <BackupSettings />;
  if (tabKey === 'manufacturer-discounts') return <ManufacturerDiscounts />;
  if (tabKey === 'expense-accounts') return <ExpenseAccounts />;
  if (tabKey === 'manufacturer-stock') return <ManufacturerStockReport />;

  if (tabKey === 'gl-accounts') return <GLAccounts currentUser={currentUser} />;
  if (tabKey === 'gl-vouchers') return <GLVouchers currentUser={currentUser} />;
  if (tabKey === 'gl-ledger') return <GLLedgerReport currentUser={currentUser} initialTab="all" />;
  if (tabKey === 'gl-cash-activity') return <GLCashActivityReport currentUser={currentUser} />;

  return <div style={{ padding: 20 }}>Unknown view</div>;
}, (prev, next) => prev.isActive === next.isActive && prev.win === next.win && prev.currentUser === next.currentUser);

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [networkMode, setNetworkMode] = useState('server');
  const [windowStack, setWindowStack] = useState([]);
  const [openMenu, setOpenMenu] = useState('sales');
  const [showNetworkSetup, setShowNetworkSetup] = useState(false);

  useEffect(() => {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.invoke('get-network-settings').then(s => {
      if (s && s.networkMode) setNetworkMode(s.networkMode);
    }).catch(() => { });
  }, []);

  const hasPermission = (perm) => {
    if (!currentUser) return false;
    if (currentUser.role === 'superadmin' || currentUser.role === 'admin') return true;
    const perms = currentUser.permissions || [];
    if (perms.includes(perm)) return true;
    if ((perm === 'manage_sales_returns' || perm === 'manage_purchase_returns') && perms.includes('manage_returns')) return true;
    return false;
  };

  const salesMenuOptions = [
    { label: 'New Sale', tab: 'sale', icon: '🧾', perm: 'create_sale', forceNewInstance: true },
    { label: 'Sales List', tab: 'sales-list', icon: '📈', perm: 'view_sales' },
    { label: 'Sales Return', tab: 'sales-return', icon: '↩️', perm: 'manage_sales_returns', forceNewInstance: true },
    { label: 'Returns List', tab: 'sales-return-list', icon: '📋', perm: 'manage_sales_returns' },
  ].filter(opt => hasPermission(opt.perm));

  const purchaseMenuOptions = [
    { label: 'New Purchase', tab: 'new-purchase', icon: '🛒', perm: 'manage_purchases' },
    { label: 'Purchase List', tab: 'purchases', icon: '📋', perm: 'view_purchases' },
    { label: 'Purchase Return', tab: 'purchase-return', icon: '🔙', perm: 'manage_purchase_returns' },
    { label: 'Returns List', tab: 'purchase-return-list', icon: '📋', perm: 'manage_purchase_returns' },
    { label: 'Barcode Print', tab: 'barcode-print', icon: '🏷️', perm: 'view_purchases' },
    { label: 'Open Purchase', tab: 'open-purchase', icon: '📦', perm: 'manage_purchases' },
  ].filter(opt => hasPermission(opt.perm));

  const productMenuOptions = [
    { label: 'New Item', tab: 'new-item', icon: '📝', perm: 'manage_products' },
    { label: 'Item List', tab: 'products', icon: '📦', perm: 'view_products' },
    { label: 'Stock Inventory', tab: 'stock', icon: '📊', perm: 'view_stock' },
  ].filter(opt => hasPermission(opt.perm));

  const stockReportMenuOptions = [
    { label: 'Supp/Brand Stock', tab: 'manufacturer-stock', icon: '🏭', perm: 'view_reports' },
    { label: 'Item History', tab: 'item-audit', icon: '🔍', perm: 'view_products' },
  ].filter(opt => hasPermission(opt.perm));

  const accountsMenuOptions = [
    { label: 'Chart of Accounts', tab: 'gl-accounts', icon: '🏛️', perm: 'view_reports' },
    { label: 'Transaction Entry', tab: 'gl-vouchers', icon: '🧾', perm: 'view_reports' },
    { label: 'Account Ledger', tab: 'gl-ledger', icon: '📖', perm: 'view_reports' },
    { label: 'Cash Activity', tab: 'gl-cash-activity', icon: '💸', perm: 'view_reports' },
    { label: 'Customer Balance List', tab: 'customer-balance-list', icon: '📋', perm: 'view_reports' },
    { label: 'Supplier Balance List', tab: 'supplier-balance-list', icon: '📒', perm: 'view_reports' },
    { label: 'Ledgers', tab: 'ledgers', icon: '📒', always: true },
    { label: 'Customers', tab: 'customers', icon: '🧑‍🤝‍🧑', always: true },
    { label: 'Mfg Discounts', tab: 'manufacturer-discounts', icon: '🏭', admin: true },
    { label: 'Freight Expense', tab: 'expense-accounts', icon: '💰', admin: true },
  ].filter(opt => opt.always || (opt.admin ? (currentUser?.role === 'admin' || currentUser?.role === 'superadmin') : hasPermission(opt.perm)));

  const settingsMenuOptions = [
    { label: 'User Management', tab: 'users', icon: '👥', adminOrSuper: true },
    { label: 'Backup', tab: 'backup', icon: '💾', admin: true },
    { label: 'Print Settings', tab: 'receipt-settings', icon: '🖨️', admin: true },
    { label: 'Network', tab: 'network-settings', icon: '🌐', admin: true },
  ].filter(opt => opt.adminOrSuper ? (currentUser?.role === 'admin' || currentUser?.role === 'superadmin') : (opt.admin ? (currentUser?.role === 'admin' || currentUser?.role === 'superadmin') : hasPermission(opt.perm)));

  const handleLoginSuccess = (userId, username, password, role, permissions) => {
    setIsAuthenticated(true);
    setCurrentUser({ id: userId, username, password, role, permissions });
    const hasPerm = (p) => role === 'admin' || (Array.isArray(permissions) && permissions.includes(p));
    let defaultTab = 'sale';
    if (!hasPerm('create_sale')) {
      if (hasPerm('manage_products')) defaultTab = 'new-item';
      else if (hasPerm('view_products')) defaultTab = 'products';
      else if (hasPerm('view_stock')) defaultTab = 'stock';
      else defaultTab = 'reports';
    }
    setWindowStack([{ id: `w-${Date.now()}`, key: defaultTab }]);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setWindowStack([{ id: `w-${Date.now()}`, key: 'sale' }]);
  };

  const activeTab = windowStack[windowStack.length - 1]?.key || '';

  useEffect(() => {
    if (salesMenuOptions.some(o => o.tab === activeTab || (activeTab.startsWith('sale') && o.tab === 'sale'))) setOpenMenu('sales');
    else if (purchaseMenuOptions.some(o => o.tab === activeTab)) setOpenMenu('purchases');
    else if (productMenuOptions.some(o => o.tab === activeTab)) setOpenMenu('products');
    else if (accountsMenuOptions.some(o => o.tab === activeTab || ['customer-ledger', 'cash-ledger', 'bank-ledger', 'supplier-ledger', 'freight-report', 'expense-ledger', 'equity-ledger'].includes(activeTab))) setOpenMenu('accounts');
    else if (settingsMenuOptions.some(o => o.tab === activeTab)) setOpenMenu('settings');
  }, [activeTab]);

  const openWindow = (key, props = {}) => {
    let finalKey = key;
    if (props.forceNewInstance) {
      finalKey = `${key}-${Date.now()}`;
      delete props.forceNewInstance;
    }
    if (activeTab === finalKey && Object.keys(props).length === 0) return;
    const winId = `w-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    setWindowStack(prev => [...prev, { id: winId, key: finalKey, rootKey: key, ...props }]);
  };

  const closeTopWindow = () => setWindowStack(prev => {
    if (prev.length > 1) return prev.slice(0, -1);
    // Last window — go to empty homepage
    return [];
  });

  const swapTopWindow = (newKey, props = {}) => {
    setWindowStack(prev => {
      if (prev.length === 0) return [{ id: `w-${Date.now()}`, key: newKey, rootKey: newKey, ...props }];
      const next = prev.slice(0, -1);
      const winId = `w-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      return [...next, { id: winId, key: newKey, rootKey: newKey, ...props }];
    });
  };

  const getWindowInfo = (win) => {
    const baseKey = win.rootKey || win.key || '';
    let title = 'Window';
    let icon = '📄';

    if (baseKey === 'new-item') { title = 'New Item'; icon = '📝'; }
    else if (baseKey === 'products') { title = 'Product List'; icon = '📦'; }
    else if (baseKey === 'stock') { title = 'Stock Inventory'; icon = '📊'; }
    else if (baseKey === 'new-purchase') { title = 'New Purchase'; icon = '🛒'; }
    else if (baseKey === 'fast-purchase') { title = 'Fast Purchase'; icon = '⚡'; }
    else if (baseKey === 'purchases') { title = 'Purchase List'; icon = '📋'; }
    else if (baseKey === 'open-purchase') { title = 'Open Purchase'; icon = '📦'; }
    else if (baseKey === 'purchase-return') { title = 'Purchase Return'; icon = '🔙'; }
    else if (baseKey === 'purchase-return-list') { title = 'Return List'; icon = '📋'; }
    else if (baseKey === 'sale' || baseKey.startsWith('sale-')) { title = 'New Sale'; icon = '🧾'; }
    else if (baseKey === 'sales-list') { title = 'Sales List'; icon = '📈'; }
    else if (baseKey === 'sales-return') { title = 'Sales Return'; icon = '↩️'; }
    else if (baseKey === 'sales-return-list') { title = 'Sales Return List'; icon = '📋'; }
    else if (baseKey === 'barcode-print') { title = 'Barcode Print'; icon = '🏷️'; }
    else if (baseKey === 'reports') { title = 'Reports'; icon = '📊'; }
    else if (baseKey === 'users') { title = 'User Mgmt'; icon = '👥'; }
    else if (baseKey === 'customers') { title = 'Customers'; icon = '🧑‍🤝‍🧑'; }
    else if (baseKey === 'ledgers') { title = 'Ledgers'; icon = '📒'; }
    else if (baseKey === 'gl-accounts') { title = 'Chart of Accounts'; icon = '🏛️'; }
    else if (baseKey === 'gl-vouchers') { title = 'GL Vouchers'; icon = '🧾'; }
    else if (baseKey === 'gl-ledger') { title = 'GL Ledger'; icon = '📖'; }
    else if (baseKey === 'gl-cash-activity') { title = 'Cash Activity'; icon = '💸'; }
    else if (baseKey === 'backup') { title = 'Backup'; icon = '💾'; }
    else if (baseKey === 'network-settings') { title = 'Network'; icon = '🌐'; }
    else if (baseKey === 'receipt-settings') { title = 'Receipt Settings'; icon = '🖨️'; }
    else { title = baseKey.replace(/-/g, ' '); }

    const timestampMatch = typeof win.key === 'string' && win.key.match(/-(\d+)$/);
    if (timestampMatch) {
      const timeStr = new Date(parseInt(timestampMatch[1])).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      title += ` (${timeStr})`;
    }

    return { title, icon };
  };

  const bringWindowToFront = (idToMove) => {
    setWindowStack(prev => {
      const idx = prev.findIndex(w => w.id === idToMove);
      if (idx === -1 || idx === prev.length - 1) return prev;
      const next = [...prev];
      const [win] = next.splice(idx, 1);
      next.push(win);
      return next;
    });
  };

  const closeSpecificWindow = (idToClose, e) => {
    if (e) e.stopPropagation();
    setWindowStack(prev => {
      if (prev.length > 1) {
        return prev.filter(w => w.id !== idToClose);
      }
      return prev;
    });
  };

  // Handle IPC switch-to-window event from Electron native menu bar
  useEffect(() => {
    const { ipcRenderer } = window.require('electron');
    const handleSwitch = (event, winId) => {
      bringWindowToFront(winId);
    };
    ipcRenderer.on('switch-to-window', handleSwitch);
    return () => {
      ipcRenderer.removeListener('switch-to-window', handleSwitch);
    };
  }, []);

  // Sync window stack with Electron native menu bar
  useEffect(() => {
    const { ipcRenderer } = window.require('electron');
    const titles = windowStack.map(win => {
      const info = getWindowInfo(win);
      return { id: win.id, title: `${info.icon} ${info.title}` };
    });
    ipcRenderer.send('update-window-menu', titles);
  }, [windowStack]);

  React.useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = (e.target?.tagName || '').toUpperCase();
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;
      const hasModal = !!document.querySelector('.modal-overlay');

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        const hasSelection = isInput && e.target.selectionStart !== e.target.selectionEnd;
        if (!hasSelection && !hasModal) {
          e.preventDefault();
          const topWin = windowStack[windowStack.length - 1];
          if (topWin && (topWin.key === 'new-item' || topWin.rootKey === 'new-item' || (typeof topWin.key === 'string' && topWin.key.startsWith('new-item')))) {
            swapTopWindow('fast-purchase');
          } else {
            closeTopWindow();
          }
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        if (hasPermission('create_sale')) { e.preventDefault(); openWindow('sale', { forceNewInstance: true }); }
      }

      // Single keypress shortcuts (s, e, r) when focus is outside input fields and modals
      if (!isInput && !hasModal && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const k = (e.key || '').toLowerCase();
        const code = e.code || '';
        if (k === 's' || code === 'KeyS') {
          if (hasPermission('create_sale')) {
            e.preventDefault();
            openWindow('sale', { forceNewInstance: true });
          }
        } else if (k === 'e' || code === 'KeyE') {
          if (hasPermission('manage_products')) {
            e.preventDefault();
            openWindow('new-item');
          }
        } else if (k === 'r' || code === 'KeyR') {
          if (hasPermission('view_reports')) {
            e.preventDefault();
            openWindow('reports');
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [windowStack, activeTab, currentUser]);

  if (!isAuthenticated) {
    if (showNetworkSetup) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f3f6f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', background: '#1e1e2d', color: 'white' }}>
            <button onClick={() => setShowNetworkSetup(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', fontSize: '0.9rem' }}>← Back to Login</button>
            <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Network Setup</span>
            <span style={{ fontSize: '0.85rem', opacity: 0.7, marginLeft: 'auto' }}>Restart app after saving settings</span>
          </div>
          <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
            <NetworkSettings />
          </div>
        </div>
      );
    }
    return <LoginPage onLoginSuccess={handleLoginSuccess} onOpenNetworkSettings={() => setShowNetworkSetup(true)} />;
  }

  const handleEditProduct = (product) => openWindow('new-item', { editItemData: product });
  const handleEditPurchase = (purchase) => {
    openWindow('new-purchase', { purchaseToEdit: purchase });
  };
  const handleEditReturn = (ret) => openWindow('purchase-return', { returnToEdit: ret });
  const handleEditSale = (sale) => openWindow('sale', { saleToEdit: sale });
  const handleEditSalesReturn = (ret) => openWindow('sales-return', { returnToEdit: ret });

  const activeBaseKey = windowStack[windowStack.length - 1]?.rootKey || activeTab;
  const isFullScreenMode = ['sale', 'sales-return'].includes(activeBaseKey);
  const isMiniSidebar = activeBaseKey === 'new-purchase' || activeBaseKey === 'open-purchase' || activeBaseKey === 'purchase-return';

  return (
    <div className="app-container">
      <aside className={`app-sidebar ${isFullScreenMode ? 'hidden-sidebar' : ''} ${isMiniSidebar ? 'mini-sidebar' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-text">
            <span className="brand-main">ATG</span>
            <span className="brand-sub">Al-Touheed</span>
            <span className="brand-tag">WHOLESALE</span>
          </div>
          <div className="user-info">
            <div className="user-details">
              <span className="username">{currentUser?.username}</span>
              <span className="user-role">{currentUser?.role}</span>
            </div>
          </div>
          <div className="quick-action-circles">
            {hasPermission('create_sale') && (
              <button
                type="button"
                className={`circle-btn circle-btn-sale ${activeTab === 'sale' || activeTab.startsWith('sale') ? 'active' : ''}`}
                onClick={() => openWindow('sale', { forceNewInstance: true })}
                title="New Sale (S)"
              >
                S
              </button>
            )}
            {hasPermission('manage_products') && (
              <button
                type="button"
                className={`circle-btn circle-btn-entry ${activeTab === 'new-item' || activeTab.startsWith('new-item') ? 'active' : ''}`}
                onClick={() => openWindow('new-item')}
                title="New Item Entry (E)"
              >
                E
              </button>
            )}
            {hasPermission('view_reports') && (
              <button
                type="button"
                className={`circle-btn circle-btn-reports ${activeTab === 'reports' ? 'active' : ''}`}
                onClick={() => openWindow('reports')}
                title="Reports (R)"
              >
                R
              </button>
            )}
          </div>
        </div>

        <nav className="sidebar-nav">
          {/* 1. SALES DROPDOWN (ON TOP) */}
          {salesMenuOptions.length > 0 && (
            <div className="nav-item-with-dropdown">
              <button
                className={`nav-item ${salesMenuOptions.some(o => o.tab === activeTab || (activeTab.startsWith('sale') && o.tab === 'sale')) ? 'active' : ''}`}
                onClick={() => setOpenMenu(openMenu === 'sales' ? null : 'sales')}
              >
                <span className="icon">🧾</span> Sales {openMenu === 'sales' ? '▲' : '▼'}
              </button>
              {openMenu === 'sales' && (
                <div className="dropdown-menu">
                  {salesMenuOptions.map(opt => (
                    <button key={opt.tab} className={`dropdown-item ${activeTab === opt.tab || (activeTab.startsWith(opt.tab) && opt.tab === 'sale') ? 'current' : ''}`}
                      onClick={() => openWindow(opt.tab, opt.forceNewInstance ? { forceNewInstance: true } : {})}>
                      <span className="icon">{opt.icon}</span> {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="nav-divider" />

          {/* 2. PRODUCTS & STOCK DROPDOWN */}
          {productMenuOptions.length > 0 && (
            <div className="nav-item-with-dropdown">
              <button
                className={`nav-item ${productMenuOptions.some(o => o.tab === activeTab) ? 'active' : ''}`}
                onClick={() => setOpenMenu(openMenu === 'products' ? null : 'products')}
              >
                <span className="icon">📦</span> Items & Stock {openMenu === 'products' ? '▲' : '▼'}
              </button>
              {openMenu === 'products' && (
                <div className="dropdown-menu">
                  {productMenuOptions.map(opt => (
                    <button key={opt.tab} className={`dropdown-item ${activeTab === opt.tab ? 'current' : ''}`}
                      onClick={() => openWindow(opt.tab, opt.tab === 'new-item' ? { editItemData: null } : {})}>
                      <span className="icon">{opt.icon}</span> {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="nav-divider" />

          {/* 3. PURCHASES DROPDOWN */}
          {purchaseMenuOptions.length > 0 && (
            <div className="nav-item-with-dropdown">
              <button
                className={`nav-item ${purchaseMenuOptions.some(o => o.tab === activeTab) ? 'active' : ''}`}
                onClick={() => setOpenMenu(openMenu === 'purchases' ? null : 'purchases')}
              >
                <span className="icon">🛒</span> Purchase {openMenu === 'purchases' ? '▲' : '▼'}
              </button>
              {openMenu === 'purchases' && (
                <div className="dropdown-menu">
                  {purchaseMenuOptions.map(opt => (
                    <button key={opt.tab} className={`dropdown-item ${activeTab === opt.tab ? 'current' : ''}`}
                      onClick={() => openWindow(opt.tab, { purchaseToEdit: null, returnToEdit: null })}>
                      <span className="icon">{opt.icon}</span> {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="nav-divider" />

          {/* 3.5 STOCK REPORT DROPDOWN */}
          {stockReportMenuOptions.length > 0 && (
            <div className="nav-item-with-dropdown">
              <button
                className={`nav-item ${stockReportMenuOptions.some(o => o.tab === activeTab) ? 'active' : ''}`}
                onClick={() => setOpenMenu(openMenu === 'stock-report' ? null : 'stock-report')}
              >
                <span className="icon">📊</span> Stock Report {openMenu === 'stock-report' ? '▲' : '▼'}
              </button>
              {openMenu === 'stock-report' && (
                <div className="dropdown-menu">
                  {stockReportMenuOptions.map(opt => (
                    <button key={opt.tab} className={`dropdown-item ${activeTab === opt.tab ? 'current' : ''}`}
                      onClick={() => openWindow(opt.tab)}>
                      <span className="icon">{opt.icon}</span> {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="nav-divider" />

          {/* 4. ACCOUNTS & LEDGERS DROPDOWN */}
          {accountsMenuOptions.length > 0 && (
            <div className="nav-item-with-dropdown">
              <button
                className={`nav-item ${accountsMenuOptions.some(o => o.tab === activeTab || ['customer-ledger', 'cash-ledger', 'bank-ledger', 'supplier-ledger', 'freight-report', 'expense-ledger', 'equity-ledger'].includes(activeTab)) ? 'active' : ''}`}
                onClick={() => setOpenMenu(openMenu === 'accounts' ? null : 'accounts')}
              >
                <span className="icon">🏛️</span> Accounts & Ledgers {openMenu === 'accounts' ? '▲' : '▼'}
              </button>
              {openMenu === 'accounts' && (
                <div className="dropdown-menu">
                  {accountsMenuOptions.map(opt => (
                    <button key={opt.tab} className={`dropdown-item ${activeTab === opt.tab || (opt.tab === 'ledgers' && ['customer-ledger', 'cash-ledger', 'bank-ledger', 'supplier-ledger', 'freight-report', 'expense-ledger', 'equity-ledger'].includes(activeTab)) ? 'current' : ''}`}
                      onClick={() => openWindow(opt.tab)}>
                      <span className="icon">{opt.icon}</span> {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="nav-divider" />

          {/* 5. SETTINGS & SYSTEM DROPDOWN (ON BOTTOM) */}
          {settingsMenuOptions.length > 0 && (
            <div className="nav-item-with-dropdown" style={{ marginTop: 'auto' }}>
              <button
                className={`nav-item ${settingsMenuOptions.some(o => o.tab === activeTab) ? 'active' : ''}`}
                onClick={() => setOpenMenu(openMenu === 'settings' ? null : 'settings')}
              >
                <span className="icon">⚙️</span> Settings & System {openMenu === 'settings' ? '▲' : '▼'}
              </button>
              {openMenu === 'settings' && (
                <div className="dropdown-menu">
                  {settingsMenuOptions.map(opt => (
                    <button key={opt.tab} className={`dropdown-item ${activeTab === opt.tab ? 'current' : ''}`}
                      onClick={() => openWindow(opt.tab)}>
                      <span className="icon">{opt.icon}</span> {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <button onClick={handleLogout} className="btn-logout">🚪 Logout</button>
          <small>v1.0.0 · Wholesale</small>
        </div>
      </aside>

      <main className="app-main-content">
        <div className="window-content-area">
          {windowStack.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.6 }}>
              <h2 style={{ fontSize: '2.5rem', color: '#374151', fontWeight: '800' }}>Al-Touheed Wholesale</h2>
              <p style={{ fontSize: '1.2rem', color: '#6b7280' }}>Select an option from the sidebar.</p>
            </div>
          )}
          {windowStack.map((win, index) => {
            const isTop = index === windowStack.length - 1;
            const baseKey = win.rootKey || win.key;
            const isFullScreen = ['sale', 'sales-return'].includes(baseKey);
            return (
              <div key={win.id} className={`window-layer ${isFullScreen ? 'fullscreen-mode' : ''} ${isTop ? 'active-window' : ''}`} style={{ zIndex: index + 10, display: isTop ? 'block' : 'none' }}>
                <div className="window-content-wrapper">
                  <WindowContent
                    win={win} isActive={isTop} currentUser={currentUser}
                    closeTopWindow={closeTopWindow} openWindow={openWindow}
                    hasPermission={hasPermission}
                    handleEditProduct={handleEditProduct}
                    handleEditPurchase={handleEditPurchase}
                    handleEditReturn={handleEditReturn}
                    handleEditSale={handleEditSale}
                    handleEditSalesReturn={handleEditSalesReturn}
                    setShowLayoutTabs={() => { }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export default function AppWithData() {
  return <DataProvider><App /></DataProvider>;
}

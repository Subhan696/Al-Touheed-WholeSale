import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDataVersion } from '../context/DataContext';
import './ProductList.css';

const { ipcRenderer } = window.require('electron');

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0 });

const ProductRow = React.memo(({ p, idx, isSelected, selectedRef, canManage, onSelect, onEdit, onDelete, onOpenAudit }) => {
  const purchase = parseFloat(p.purchase_rate) || 0;
  const sale = parseFloat(p.sale_rate) || 0;
  const disc = parseFloat(p.discount) || 0;

  return (
    <tr 
      className={isSelected ? 'selected-row' : ''}
      ref={isSelected ? selectedRef : null}
      onClick={() => onSelect(idx)}
      onMouseEnter={(e) => {
        if (e.movementX !== 0 || e.movementY !== 0) {
          onSelect(idx);
        }
      }}
      onDoubleClick={() => canManage && onEdit?.(p)}
    >
      <td><span className="badge badge-code">{p.item_code}</span></td>
      <td style={{ fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>{p.brand || '—'}</td>
      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.description}>{p.description || '—'}</td>
      <td>{p.gender ? <span className="badge badge-cat">{p.gender}</span> : '—'}</td>
      <td>{p.category ? <span className="badge badge-cat">{p.category}</span> : '—'}</td>
      <td style={{ fontWeight: 700, color: '#374151', fontSize: '0.9rem' }}>{p.size_range || '—'}</td>

      <td className="text-right">
        <span style={{
          display: 'inline-block', background: '#fff1f2', color: '#be123c',
          fontWeight: 800, fontSize: '1rem', padding: '5px 12px', borderRadius: 6,
          border: '1px solid #fecdd3',
        }}>{fmt(purchase)}</span>
      </td>

      <td className="text-right">
        <span style={{
          display: 'inline-block', background: '#f0fdf4', color: '#15803d',
          fontWeight: 800, fontSize: '1rem', padding: '5px 12px', borderRadius: 6,
          border: '1px solid #bbf7d0',
        }}>{fmt(sale)}</span>
      </td>

      <td className="text-right">
        {disc > 0 ? (
          <span style={{
            display: 'inline-block', background: '#fff7ed', color: '#ea580c',
            fontWeight: 800, fontSize: '1rem', padding: '5px 12px', borderRadius: 6,
            border: '1px solid #fed7aa',
          }}>-{fmt(disc)}</span>
        ) : (
          <span style={{ color: '#d1d5db', fontSize: '0.9rem' }}>—</span>
        )}
      </td>

      <td className="text-center" style={{ color: '#6b7280', fontSize: '0.85rem' }}>{p.packing_qty} pcs</td>

      {canManage && (
        <td className="text-center">
          <button className="btn-edit" onClick={(e) => { e.stopPropagation(); onEdit?.(p); }}>Edit</button>
          <button className="btn-del" onClick={(e) => { e.stopPropagation(); onDelete(p); }}>Del</button>
        </td>
      )}
    </tr>
  );
});

function ProductList({ onEditProduct, currentUser, isActive, onOpenAudit }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', brand: '', category: '', size: '' });
  const [debouncedFilters, setDebouncedFilters] = useState({ search: '', brand: '', category: '', size: '' });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const version = useDataVersion('products');
  const tableContainerRef = React.useRef(null);
  const selectedRowRef = React.useRef(null);

  useEffect(() => { if (isActive) loadProducts(); }, [version, isActive]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedFilters(filters);
    }, 300);
    return () => clearTimeout(handler);
  }, [filters]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ipcRenderer.invoke('get-products-chunked', { limit: 100, offset: 0 });
      if (res && res.products) {
        setProducts(res.products);
        setLoading(false);
        if (res.total > 100) {
          const remaining = await ipcRenderer.invoke('get-products');
          setProducts(remaining || []);
        }
      }
    } catch {
      setLoading(false);
    }
  }, []);

  const handleDelete = useCallback(async (p) => {
    if (currentUser?.role !== 'superadmin') {
      await ipcRenderer.invoke('alert-dialog', '🔒 Permission Denied: Only Super Admin can delete items.');
      return;
    }
    const confirmed = await ipcRenderer.invoke('confirm-dialog', `Delete "${p.item_code} - ${p.description}"?`);
    if (!confirmed) return;
    await ipcRenderer.invoke('delete-product', p.id);
    loadProducts();
  }, [currentUser, loadProducts]);

  const filtered = useMemo(() => {
    const s = debouncedFilters.search.toLowerCase();
    const b = debouncedFilters.brand.toLowerCase();
    const c = debouncedFilters.category.toLowerCase();
    const sz = debouncedFilters.size.toLowerCase();

    let res = products.filter(p => {
      if (s && !p.item_code.toLowerCase().includes(s) && !(p.description || '').toLowerCase().includes(s) && !(p.brand || '').toLowerCase().includes(s) && !(p.gender || '').toLowerCase().includes(s) && !(p.category || '').toLowerCase().includes(s)) return false;
      if (b && !(p.brand || '').toLowerCase().includes(b)) return false;
      if (c && !(p.category || '').toLowerCase().includes(c)) return false;
      if (sz && !(p.size_range || '').toLowerCase().includes(sz)) return false;
      return true;
    });

    if (s) {
      res.sort((a, b) => {
        const aCode = a.item_code.toLowerCase();
        const bCode = b.item_code.toLowerCase();
        if (aCode === s && bCode !== s) return -1;
        if (bCode === s && aCode !== s) return 1;
        const aStarts = aCode.startsWith(s);
        const bStarts = bCode.startsWith(s);
        if (aStarts && !bStarts) return -1;
        if (bStarts && !aStarts) return 1;
        return 0;
      });
    }

    return res;
  }, [products, debouncedFilters]);

  const canManage = !currentUser || currentUser?.role === 'superadmin' || currentUser?.role === 'admin' || (currentUser?.permissions || []).includes('manage_products');

  useEffect(() => { setSelectedIndex(0); }, [debouncedFilters]);
  useEffect(() => { setSelectedIndex(prev => Math.min(prev, Math.max(0, Math.min(filtered.length, 100) - 1))); }, [filtered.length]);

  const handleKeyDown = (e) => {
    if (filtered.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, Math.min(filtered.length, 100) - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex] && canManage) {
        onEditProduct?.(filtered[selectedIndex]);
      }
    }
  };

  useEffect(() => {
    if (selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const fmt = (n) => parseFloat(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0 });

  return (
    <div className="product-list-container">
      <div className="list-header">
        <h2>Product List <span style={{ fontSize: '0.85rem', color: '#aaa', fontWeight: 400 }}>({filtered.length})</span></h2>
        <div className="search-filters-group">
          <input 
            className="search-bar" 
            placeholder="Search item code or desc..." 
            value={filters.search} 
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} 
            onKeyDown={handleKeyDown}
            autoFocus 
          />
          <input
            className="filter-bar"
            placeholder="Brand..."
            value={filters.brand}
            onChange={e => setFilters(f => ({ ...f, brand: e.target.value }))}
            onKeyDown={handleKeyDown}
          />
          <input
            className="filter-bar"
            placeholder="Category..."
            value={filters.category}
            onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}
            onKeyDown={handleKeyDown}
          />
          <input
            className="filter-bar"
            placeholder="Size..."
            value={filters.size}
            onChange={e => setFilters(f => ({ ...f, size: e.target.value }))}
            onKeyDown={handleKeyDown}
          />
        </div>
        <span style={{ fontSize: '0.85rem', color: '#aaa', fontWeight: 600 }}>{filtered.length > 100 ? `Showing top 100 of ${filtered.length} items` : `${filtered.length} items`}</span>
      </div>
      <div className="table-wrapper" ref={tableContainerRef}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Brand</th>
              <th>Description</th>
              <th>Gender</th>
              <th>Category</th>
              <th>Size</th>
              <th className="text-right">Purchase</th>
              <th className="text-right">Sale</th>
              <th className="text-right">Discount</th>
              <th className="text-center">Packing</th>
              {canManage && <th className="text-center">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canManage ? 11 : 10} className="empty-state" style={{ padding: '40px 0' }}>Loading products...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={canManage ? 11 : 10} className="empty-state">No products found</td></tr>
            ) : filtered.slice(0, 100).map((p, idx) => (
              <ProductRow 
                key={p.id}
                p={p}
                idx={idx}
                isSelected={idx === selectedIndex}
                selectedRef={selectedRowRef}
                canManage={canManage}
                onSelect={setSelectedIndex}
                onEdit={onEditProduct}
                onDelete={handleDelete}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default React.memo(ProductList);

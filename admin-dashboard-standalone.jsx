import React, { useState, useEffect, useCallback } from 'react';
import { Package, Activity, ClipboardList, AlertTriangle, Search, X, Check, ScanLine } from 'lucide-react';

const REASONS = ['Damaged', 'Recount', 'Gifted', 'Sale', 'Return'];
const STORAGE_KEY = 'inventory-data';

// Standalone storage shim — replaces Claude's window.storage API with
// localStorage so this runs in CodeSandbox, Vite, or any normal React setup.
const storage = {
  get: async (key) => {
    const val = localStorage.getItem(key);
    if (val === null) throw new Error('not found');
    return { key, value: val };
  },
  set: async (key, value) => {
    localStorage.setItem(key, value);
    return { key, value };
  },
};

const SEED = {
  products: [
    { id: 1, sku: 'SKU-101', barcode: '011101', name: 'Canvas Tote — Natural', category: 'Bags', price: 34.0, cost: 12.5, lowStockTrigger: 8, onHand: 42, committed: 3 },
    { id: 2, sku: 'SKU-102', barcode: '011102', name: 'Ceramic Mug — Charcoal', category: 'Home', price: 18.0, cost: 6.0, lowStockTrigger: 15, onHand: 12, committed: 5 },
    { id: 3, sku: 'SKU-103', barcode: '011103', name: 'Wool Beanie — Rust', category: 'Apparel', price: 26.0, cost: 9.0, lowStockTrigger: 10, onHand: 6, committed: 6 },
    { id: 4, sku: 'SKU-104', barcode: '011104', name: 'Enamel Pin Set', category: 'Accessories', price: 14.0, cost: 4.5, lowStockTrigger: 20, onHand: 0, committed: 0 },
    { id: 5, sku: 'SKU-105', barcode: '011105', name: 'Linen Apron — Olive', category: 'Home', price: 42.0, cost: 15.0, lowStockTrigger: 5, onHand: 22, committed: 1 },
  ],
  auditLog: [
    { id: 1, ts: Date.now() - 3600_000 * 5, admin: 'Admin 1', sku: 'SKU-102', oldStock: 15, newStock: 12, reason: 'Damaged', notes: '' },
  ],
  activityFeed: [
    { id: 1, ts: Date.now() - 3600_000 * 5, admin: 'Admin 1', text: 'adjusted stock for SKU-102: 15 → 12', tag: 'Damaged' },
  ],
};

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState('Admin 1');
  const [tab, setTab] = useState('dashboard');
  const [query, setQuery] = useState('');
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await storage.get(STORAGE_KEY);
      setData(JSON.parse(res.value));
    } catch (e) {
      await storage.set(STORAGE_KEY, JSON.stringify(SEED));
      setData(SEED);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // light polling so the "other admin's" changes show up without a manual refresh
  useEffect(() => {
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);

  const persist = async (next) => {
    setData(next);
    try {
      await storage.set(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      setToast('Save failed — check connection');
      setTimeout(() => setToast(null), 3000);
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const submitAdjustment = async ({ product, newStock, reason, notes }) => {
    const oldStock = product.onHand;
    const nextProducts = data.products.map((p) =>
      p.id === product.id ? { ...p, onHand: newStock } : p
    );
    const auditEntry = {
      id: Date.now(),
      ts: Date.now(),
      admin,
      sku: product.sku,
      oldStock,
      newStock,
      reason,
      notes,
    };
    const feedEntry = {
      id: Date.now() + 1,
      ts: Date.now(),
      admin,
      text: `adjusted stock for ${product.sku}: ${oldStock} → ${newStock}`,
      tag: reason,
    };
    const next = {
      products: nextProducts,
      auditLog: [auditEntry, ...data.auditLog],
      activityFeed: [feedEntry, ...data.activityFeed],
    };
    await persist(next);
    setAdjustTarget(null);
    showToast(`${product.sku} updated: ${oldStock} → ${newStock}`);
  };

  if (loading || !data) {
    return (
      <div style={styles.loadingScreen}>
        <ScanLine size={28} color="#E8A33D" style={{ animation: 'spin 1.4s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`}</style>
      </div>
    );
  }

  const lowStock = data.products.filter((p) => {
    const avail = p.onHand - p.committed;
    return avail <= p.lowStockTrigger && avail > 0;
  });
  const outOfStock = data.products.filter((p) => p.onHand - p.committed <= 0);

  const filteredProducts = data.products.filter((p) => {
    const q = query.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.includes(q);
  });

  return (
    <div style={styles.app}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        ::selection { background: #E8A33D55; }
        button { font-family: inherit; cursor: pointer; }
        input, select { font-family: inherit; }
      `}</style>

      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.brandRow}>
          <div style={styles.brandMark}>⌘</div>
          <div>
            <div style={styles.brandTitle}>STOCKROOM</div>
            <div style={styles.brandSub}>two-admin ops</div>
          </div>
        </div>

        <nav style={{ marginTop: 28 }}>
          <NavItem icon={<Activity size={16} />} label="Dashboard" active={tab === 'dashboard'} onClick={() => setTab('dashboard')} />
          <NavItem icon={<Package size={16} />} label="Products" active={tab === 'products'} onClick={() => setTab('products')} badge={lowStock.length + outOfStock.length} />
          <NavItem icon={<ClipboardList size={16} />} label="Audit Log" active={tab === 'audit'} onClick={() => setTab('audit')} />
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.footerLabel}>Signed in as</div>
          <div style={styles.adminSwitch}>
            {['Admin 1', 'Admin 2'].map((a) => (
              <button
                key={a}
                onClick={() => setAdmin(a)}
                style={{ ...styles.adminBtn, ...(admin === a ? styles.adminBtnActive : {}) }}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={styles.main}>
        {tab === 'dashboard' && (
          <DashboardView data={data} lowStock={lowStock} outOfStock={outOfStock} onAdjust={setAdjustTarget} />
        )}
        {tab === 'products' && (
          <ProductsView
            products={filteredProducts}
            query={query}
            setQuery={setQuery}
            onAdjust={setAdjustTarget}
          />
        )}
        {tab === 'audit' && <AuditView log={data.auditLog} />}
      </div>

      {adjustTarget && (
        <AdjustModal
          product={adjustTarget}
          onClose={() => setAdjustTarget(null)}
          onSubmit={submitAdjustment}
        />
      )}

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

function NavItem({ icon, label, active, onClick, badge }) {
  return (
    <button onClick={onClick} style={{ ...styles.navItem, ...(active ? styles.navItemActive : {}) }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {icon}
        {label}
      </span>
      {badge > 0 && <span style={styles.navBadge}>{badge}</span>}
    </button>
  );
}

function DashboardView({ data, lowStock, outOfStock, onAdjust }) {
  return (
    <div style={styles.viewPad}>
      <h1 style={styles.h1}>Dashboard</h1>
      <p style={styles.subtext}>Live status across both admins.</p>

      <div style={styles.statRow}>
        <StatCard label="On-hand SKUs" value={data.products.length} />
        <StatCard label="Low stock" value={lowStock.length} accent="#E8A33D" />
        <StatCard label="Out of stock" value={outOfStock.length} accent="#D1503F" />
      </div>

      {(lowStock.length > 0 || outOfStock.length > 0) && (
        <div style={{ marginTop: 32 }}>
          <div style={styles.sectionLabel}>NEEDS ATTENTION</div>
          <div style={styles.alertList}>
            {[...outOfStock, ...lowStock].map((p) => (
              <div key={p.id} style={styles.alertRow}>
                <AlertTriangle size={14} color={p.onHand - p.committed <= 0 ? '#D1503F' : '#E8A33D'} />
                <span style={styles.mono}>{p.sku}</span>
                <span style={{ flex: 1, color: '#B8B4AC' }}>{p.name}</span>
                <span style={{ ...styles.mono, color: p.onHand - p.committed <= 0 ? '#D1503F' : '#E8A33D' }}>
                  {p.onHand - p.committed} available
                </span>
                <button style={styles.smallBtn} onClick={() => onAdjust(p)}>Adjust</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <div style={styles.sectionLabel}>LIVE ACTIVITY FEED</div>
        <div style={styles.ledger}>
          {data.activityFeed.length === 0 && <div style={styles.emptyLedger}>No activity yet.</div>}
          {data.activityFeed.map((f) => (
            <div key={f.id} style={styles.ledgerRow}>
              <span style={styles.ledgerTime}>{timeAgo(f.ts)}</span>
              <span style={styles.ledgerAdmin}>{f.admin}</span>
              <span style={styles.ledgerText}>{f.text}</span>
              <span style={styles.ledgerTag}>{f.tag}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div style={styles.statCard}>
      <div style={{ ...styles.statValue, color: accent || '#E8E6E1' }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function ProductsView({ products, query, setQuery, onAdjust }) {
  return (
    <div style={styles.viewPad}>
      <h1 style={styles.h1}>Products</h1>
      <p style={styles.subtext}>Tap a row to adjust stock — scan a barcode or search by name.</p>

      <div style={styles.searchBar}>
        <Search size={15} color="#7A756B" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search SKU, barcode, or name…"
          style={styles.searchInput}
        />
      </div>

      <div style={styles.tableWrap}>
        <div style={{ ...styles.tRow, ...styles.tHead }}>
          <span style={{ flex: 1.4 }}>SKU</span>
          <span style={{ flex: 2 }}>Name</span>
          <span style={{ flex: 1 }}>On-hand</span>
          <span style={{ flex: 1 }}>Committed</span>
          <span style={{ flex: 1 }}>Available</span>
          <span style={{ flex: 0.8 }}></span>
        </div>
        {products.map((p) => {
          const avail = p.onHand - p.committed;
          const low = avail <= p.lowStockTrigger && avail > 0;
          const out = avail <= 0;
          return (
            <div
              key={p.id}
              style={{
                ...styles.tRow,
                background: out ? '#D1503F15' : low ? '#E8A33D12' : 'transparent',
                cursor: 'pointer',
              }}
              onClick={() => onAdjust(p)}
            >
              <span style={{ ...styles.mono, flex: 1.4 }}>{p.sku}</span>
              <span style={{ flex: 2 }}>{p.name}</span>
              <span style={{ ...styles.mono, flex: 1 }}>{p.onHand}</span>
              <span style={{ ...styles.mono, flex: 1, color: '#B8B4AC' }}>{p.committed}</span>
              <span style={{ ...styles.mono, flex: 1, color: out ? '#D1503F' : low ? '#E8A33D' : '#5C9E6F', fontWeight: 600 }}>
                {avail}
              </span>
              <span style={{ flex: 0.8, textAlign: 'right' }}>
                <button style={styles.smallBtn} onClick={(e) => { e.stopPropagation(); onAdjust(p); }}>Adjust</button>
              </span>
            </div>
          );
        })}
        {products.length === 0 && <div style={styles.emptyLedger}>No products match "{query}".</div>}
      </div>
    </div>
  );
}

function AuditView({ log }) {
  return (
    <div style={styles.viewPad}>
      <h1 style={styles.h1}>Audit Log</h1>
      <p style={styles.subtext}>Every manual stock adjustment, permanent record.</p>

      <div style={styles.tableWrap}>
        <div style={{ ...styles.tRow, ...styles.tHead }}>
          <span style={{ flex: 1.2 }}>Time</span>
          <span style={{ flex: 1 }}>Admin</span>
          <span style={{ flex: 1 }}>SKU</span>
          <span style={{ flex: 1.4 }}>Change</span>
          <span style={{ flex: 1 }}>Reason</span>
        </div>
        {log.map((e) => (
          <div key={e.id} style={styles.tRow}>
            <span style={{ flex: 1.2, color: '#B8B4AC', fontSize: 13 }}>{new Date(e.ts).toLocaleString()}</span>
            <span style={{ flex: 1 }}>{e.admin}</span>
            <span style={{ ...styles.mono, flex: 1 }}>{e.sku}</span>
            <span style={{ ...styles.mono, flex: 1.4 }}>{e.oldStock} → {e.newStock}</span>
            <span style={{ flex: 1 }}>
              <span style={styles.reasonPill}>{e.reason}</span>
            </span>
          </div>
        ))}
        {log.length === 0 && <div style={styles.emptyLedger}>No adjustments logged yet.</div>}
      </div>
    </div>
  );
}

function AdjustModal({ product, onClose, onSubmit }) {
  const [newStock, setNewStock] = useState(product.onHand);
  const [reason, setReason] = useState(REASONS[0]);
  const [notes, setNotes] = useState('');

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <div>
            <div style={styles.mono}>{product.sku}</div>
            <div style={{ fontSize: 15, marginTop: 2 }}>{product.name}</div>
          </div>
          <button style={styles.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={styles.modalBody}>
          <label style={styles.fieldLabel}>Current on-hand: {product.onHand}</label>
          <div style={styles.stepperRow}>
            <button style={styles.stepBtn} onClick={() => setNewStock((n) => Math.max(0, n - 1))}>–</button>
            <input
              type="number"
              value={newStock}
              onChange={(e) => setNewStock(Math.max(0, parseInt(e.target.value) || 0))}
              style={styles.stepperInput}
            />
            <button style={styles.stepBtn} onClick={() => setNewStock((n) => n + 1)}>+</button>
          </div>

          <label style={styles.fieldLabel}>Reason</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)} style={styles.select}>
            {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>

          <label style={styles.fieldLabel}>Notes (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} style={styles.textInput} placeholder="Add context…" />
        </div>

        <div style={styles.modalFoot}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={styles.confirmBtn}
            onClick={() => onSubmit({ product, newStock, reason, notes })}
          >
            <Check size={15} /> Confirm adjustment
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  app: {
    display: 'flex',
    minHeight: '100vh',
    background: '#14181C',
    color: '#E8E6E1',
    fontFamily: 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  loadingScreen: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100vh', width: '100%', background: '#14181C',
  },
  sidebar: {
    width: 220, background: '#191E23', borderRight: '1px solid #262C33',
    display: 'flex', flexDirection: 'column', padding: '20px 14px', flexShrink: 0,
  },
  brandRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px' },
  brandMark: {
    width: 30, height: 30, borderRadius: 7, background: '#E8A33D', color: '#14181C',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15,
  },
  brandTitle: { fontSize: 13, fontWeight: 700, letterSpacing: '0.06em' },
  brandSub: { fontSize: 11, color: '#7A756B' },
  navItem: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
    background: 'transparent', border: 'none', color: '#B8B4AC', padding: '10px 10px',
    borderRadius: 8, fontSize: 14, marginBottom: 2, textAlign: 'left',
  },
  navItemActive: { background: '#22282F', color: '#E8E6E1' },
  navBadge: {
    background: '#D1503F', color: '#fff', fontSize: 10, fontWeight: 700,
    borderRadius: 999, padding: '2px 6px', minWidth: 16, textAlign: 'center',
  },
  sidebarFooter: { marginTop: 'auto', paddingTop: 20, borderTop: '1px solid #262C33' },
  footerLabel: { fontSize: 10, color: '#7A756B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, padding: '0 6px' },
  adminSwitch: { display: 'flex', gap: 6, padding: '0 6px' },
  adminBtn: {
    flex: 1, background: '#1D2329', border: '1px solid #262C33', color: '#7A756B',
    fontSize: 12, padding: '7px 4px', borderRadius: 6,
  },
  adminBtnActive: { background: '#E8A33D22', borderColor: '#E8A33D', color: '#E8A33D' },
  main: { flex: 1, overflowY: 'auto' },
  viewPad: { padding: '32px 40px', maxWidth: 920 },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  subtext: { color: '#7A756B', fontSize: 13, marginTop: 4 },
  statRow: { display: 'flex', gap: 12, marginTop: 24 },
  statCard: { background: '#191E23', border: '1px solid #262C33', borderRadius: 10, padding: '16px 18px', flex: 1 },
  statValue: { fontSize: 26, fontWeight: 700, fontFamily: 'ui-monospace, "SF Mono", monospace' },
  statLabel: { fontSize: 12, color: '#7A756B', marginTop: 4 },
  sectionLabel: { fontSize: 11, color: '#7A756B', letterSpacing: '0.08em', marginBottom: 10 },
  alertList: { display: 'flex', flexDirection: 'column', gap: 6 },
  alertRow: {
    display: 'flex', alignItems: 'center', gap: 10, background: '#191E23',
    border: '1px solid #262C33', borderRadius: 8, padding: '10px 14px', fontSize: 13,
  },
  ledger: {
    background: '#191E23', border: '1px solid #262C33', borderRadius: 10,
    fontFamily: 'ui-monospace, "SF Mono", monospace', fontSize: 12.5,
  },
  ledgerRow: {
    display: 'flex', gap: 14, padding: '10px 16px', borderBottom: '1px dashed #262C33', alignItems: 'baseline',
  },
  ledgerTime: { color: '#7A756B', width: 60, flexShrink: 0 },
  ledgerAdmin: { color: '#E8A33D', width: 62, flexShrink: 0 },
  ledgerText: { color: '#D9D5CC', flex: 1 },
  ledgerTag: { color: '#5C9E6F' },
  emptyLedger: { padding: '20px 16px', color: '#7A756B', fontSize: 13 },
  searchBar: {
    display: 'flex', alignItems: 'center', gap: 8, background: '#191E23',
    border: '1px solid #262C33', borderRadius: 8, padding: '9px 12px', marginTop: 18, marginBottom: 16,
  },
  searchInput: { background: 'transparent', border: 'none', outline: 'none', color: '#E8E6E1', fontSize: 13, flex: 1 },
  tableWrap: { background: '#191E23', border: '1px solid #262C33', borderRadius: 10, overflow: 'hidden' },
  tRow: { display: 'flex', alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid #21262C', fontSize: 13.5 },
  tHead: { color: '#7A756B', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', background: '#1D2329' },
  mono: { fontFamily: 'ui-monospace, "SF Mono", monospace' },
  smallBtn: {
    background: '#22282F', border: '1px solid #303740', color: '#E8E6E1',
    fontSize: 12, padding: '5px 10px', borderRadius: 6,
  },
  reasonPill: {
    background: '#22282F', color: '#B8B4AC', fontSize: 11, padding: '3px 8px', borderRadius: 999,
  },
  overlay: {
    position: 'fixed', inset: 0, background: '#0A0C0Ecc', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20,
  },
  modal: { background: '#191E23', border: '1px solid #303740', borderRadius: 14, width: 380, maxWidth: '100%' },
  modalHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '18px 20px', borderBottom: '1px solid #262C33',
  },
  iconBtn: { background: 'transparent', border: 'none', color: '#7A756B' },
  modalBody: { padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6 },
  fieldLabel: { fontSize: 11.5, color: '#7A756B', marginTop: 10, marginBottom: 2 },
  stepperRow: { display: 'flex', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 34, height: 34, borderRadius: 8, background: '#22282F', border: '1px solid #303740',
    color: '#E8E6E1', fontSize: 16,
  },
  stepperInput: {
    flex: 1, background: '#14181C', border: '1px solid #303740', borderRadius: 8,
    color: '#E8E6E1', fontFamily: 'ui-monospace, monospace', fontSize: 18, textAlign: 'center', padding: '8px 0',
  },
  select: {
    background: '#14181C', border: '1px solid #303740', borderRadius: 8, color: '#E8E6E1',
    padding: '9px 10px', fontSize: 13.5,
  },
  textInput: {
    background: '#14181C', border: '1px solid #303740', borderRadius: 8, color: '#E8E6E1',
    padding: '9px 10px', fontSize: 13.5, outline: 'none',
  },
  modalFoot: { display: 'flex', gap: 8, padding: '16px 20px', borderTop: '1px solid #262C33' },
  cancelBtn: {
    flex: 1, background: 'transparent', border: '1px solid #303740', color: '#B8B4AC',
    borderRadius: 8, padding: '10px 0', fontSize: 13.5,
  },
  confirmBtn: {
    flex: 2, background: '#E8A33D', border: 'none', color: '#14181C', fontWeight: 600,
    borderRadius: 8, padding: '10px 0', fontSize: 13.5, display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: 6,
  },
  toast: {
    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
    background: '#22282F', border: '1px solid #303740', color: '#E8E6E1',
    padding: '10px 18px', borderRadius: 999, fontSize: 13, zIndex: 60,
  },
};

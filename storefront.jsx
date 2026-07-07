import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ShoppingBag, X, User, Package, Check, Minus, Plus, ChevronLeft, LogOut } from 'lucide-react';

const INVENTORY_KEY = 'inventory-data';
const CUSTOMERS_KEY = 'customers-data';
const ORDERS_KEY = 'orders-data';

function money(n) { return `$${n.toFixed(2)}`; }

export default function Storefront() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [session, setSession] = useState(null); // logged-in customer object
  const [cart, setCart] = useState({}); // productId -> qty
  const [view, setView] = useState('catalog'); // catalog | cart | checkout | login | account | confirmed
  const [authMode, setAuthMode] = useState('login');
  const [toast, setToast] = useState(null);
  const [lastOrder, setLastOrder] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const loadAll = useCallback(async () => {
    try {
      const inv = await window.storage.get(INVENTORY_KEY, true);
      setProducts(JSON.parse(inv.value).products || []);
    } catch (e) { /* admin dashboard seeds this; if absent, leave empty */ }
    try {
      const c = await window.storage.get(CUSTOMERS_KEY, true);
      setCustomers(JSON.parse(c.value));
    } catch (e) { setCustomers([]); }
    try {
      const o = await window.storage.get(ORDERS_KEY, true);
      setOrders(JSON.parse(o.value));
    } catch (e) { setOrders([]); }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { const id = setInterval(loadAll, 5000); return () => clearInterval(id); }, [loadAll]);

  const saveCustomers = async (next) => {
    setCustomers(next);
    await window.storage.set(CUSTOMERS_KEY, JSON.stringify(next), true);
  };
  const saveOrders = async (next) => {
    setOrders(next);
    await window.storage.set(ORDERS_KEY, JSON.stringify(next), true);
  };
  const saveInventory = async (nextProducts) => {
    const raw = await window.storage.get(INVENTORY_KEY, true).catch(() => null);
    const current = raw ? JSON.parse(raw.value) : { products: nextProducts, auditLog: [], activityFeed: [] };
    const next = { ...current, products: nextProducts };
    setProducts(nextProducts);
    await window.storage.set(INVENTORY_KEY, JSON.stringify(next), true);
    return current;
  };

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ product: products.find((p) => p.id === Number(id)), qty }))
      .filter((c) => c.product);
  }, [cart, products]);

  const cartCount = cartItems.reduce((s, c) => s + c.qty, 0);
  const cartTotal = cartItems.reduce((s, c) => s + c.qty * c.product.price, 0);

  const availableFor = (p) => p.onHand - p.committed;

  const addToCart = (product, qty = 1) => {
    const avail = availableFor(product);
    const current = cart[product.id] || 0;
    if (current + qty > avail) { showToast(`Only ${avail} left of ${product.name}`); return; }
    setCart({ ...cart, [product.id]: current + qty });
    showToast(`Added ${product.name} to cart`);
  };

  const setQty = (productId, qty) => {
    if (qty <= 0) { const c = { ...cart }; delete c[productId]; setCart(c); return; }
    setCart({ ...cart, [productId]: qty });
  };

  const signup = async ({ email, password }) => {
    if (customers.some((c) => c.email === email)) { showToast('An account with that email already exists'); return; }
    const newCustomer = { id: Date.now(), email, password, address: '', phone: '', createdAt: Date.now() };
    await saveCustomers([...customers, newCustomer]);
    setSession(newCustomer);
    setView('catalog');
    showToast('Account created — welcome!');
  };

  const login = async ({ email, password }) => {
    const found = customers.find((c) => c.email === email && c.password === password);
    if (!found) { showToast('No account matches that email and password'); return; }
    setSession(found);
    setView('catalog');
    showToast(`Welcome back, ${email}`);
  };

  const logout = () => { setSession(null); setView('catalog'); };

  const saveAddress = async (fields) => {
    const next = customers.map((c) => (c.id === session.id ? { ...c, ...fields } : c));
    await saveCustomers(next);
    setSession({ ...session, ...fields });
    showToast('Delivery details saved');
  };

  const placeOrder = async () => {
    if (!session) { setView('login'); showToast('Log in to check out'); return; }
    if (!session.address) { showToast('Add a delivery address before checkout'); return; }

    // Instant stock allocation: move each item from Available to Committed
    const nextProducts = products.map((p) => {
      const inCart = cart[p.id];
      if (!inCart) return p;
      return { ...p, committed: p.committed + inCart };
    });
    const currentInv = await saveInventory(nextProducts);

    const order = {
      id: Date.now(),
      customerId: session.id,
      customerEmail: session.email,
      items: cartItems.map((c) => ({ productId: c.product.id, sku: c.product.sku, name: c.product.name, qty: c.qty, price: c.product.price })),
      status: 'Processing',
      addressSnapshot: session.address,
      subtotal: cartTotal,
      shipping: cartTotal > 75 ? 0 : 6.5,
      total: cartTotal + (cartTotal > 75 ? 0 : 6.5),
      paymentMethod: 'manual',
      paymentStatus: 'Paid',
      trackingNumber: null,
      createdAt: Date.now(),
    };
    await saveOrders([order, ...orders]);

    // let the admin activity feed know a sale happened
    const feedEntry = {
      id: Date.now() + 1,
      ts: Date.now(),
      admin: 'Storefront',
      text: `New order #${String(order.id).slice(-5)} placed — ${cartItems.length} item(s)`,
      tag: 'Sale',
    };
    const nextInv = { ...currentInv, products: nextProducts, activityFeed: [feedEntry, ...(currentInv.activityFeed || [])] };
    await window.storage.set(INVENTORY_KEY, JSON.stringify(nextInv), true);

    setLastOrder(order);
    setCart({});
    setView('confirmed');
  };

  const myOrders = session ? orders.filter((o) => o.customerId === session.id) : [];

  if (loading) {
    return <div style={s.loadingScreen}>Loading storefront…</div>;
  }

  return (
    <div style={s.app}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        button { font-family: inherit; cursor: pointer; }
        input { font-family: inherit; }
      `}</style>

      <Header
        session={session}
        cartCount={cartCount}
        onCart={() => setView('cart')}
        onAccount={() => setView(session ? 'account' : 'login')}
        onHome={() => setView('catalog')}
      />

      <main style={s.main}>
        {view === 'catalog' && <Catalog products={products} onAdd={addToCart} availableFor={availableFor} />}
        {view === 'cart' && (
          <CartView
            items={cartItems}
            total={cartTotal}
            onQty={setQty}
            onBack={() => setView('catalog')}
            onCheckout={() => setView(session ? 'checkout' : 'login')}
          />
        )}
        {view === 'checkout' && (
          <CheckoutView
            session={session}
            items={cartItems}
            total={cartTotal}
            onSaveAddress={saveAddress}
            onPlaceOrder={placeOrder}
            onBack={() => setView('cart')}
          />
        )}
        {view === 'login' && (
          <AuthView mode={authMode} setMode={setAuthMode} onLogin={login} onSignup={signup} onBack={() => setView('catalog')} />
        )}
        {view === 'account' && session && (
          <AccountView session={session} orders={myOrders} onSaveAddress={saveAddress} onLogout={logout} onBack={() => setView('catalog')} />
        )}
        {view === 'confirmed' && lastOrder && (
          <ConfirmedView order={lastOrder} onContinue={() => setView('catalog')} />
        )}
      </main>

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );
}

function Header({ session, cartCount, onCart, onAccount, onHome }) {
  return (
    <header style={s.header}>
      <button style={s.logo} onClick={onHome}>
        <span style={s.logoMark}>&#9679;</span> FIELDGOODS
      </button>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button style={s.iconBtn} onClick={onAccount}>
          <User size={18} />
          {session && <span style={s.headerEmail}>{session.email.split('@')[0]}</span>}
        </button>
        <button style={s.cartBtn} onClick={onCart}>
          <ShoppingBag size={18} />
          {cartCount > 0 && <span style={s.cartBadge}>{cartCount}</span>}
        </button>
      </div>
    </header>
  );
}

function StockTag({ product, availableFor }) {
  const avail = availableFor(product);
  if (avail <= 0) return <span style={{ ...s.tag, ...s.tagOut }}>Out of stock</span>;
  if (avail <= product.lowStockTrigger) return <span style={{ ...s.tag, ...s.tagLow }}>Low stock — {avail} left</span>;
  return <span style={{ ...s.tag, ...s.tagIn }}>In stock</span>;
}

function Catalog({ products, onAdd, availableFor }) {
  return (
    <div style={s.viewPad}>
      <div style={s.heroBlock}>
        <h1 style={s.heroTitle}>Goods for the everyday.</h1>
        <p style={s.heroSub}>Small-batch home & apparel, made to last. Stock updates live — what you see is what's on the shelf.</p>
      </div>

      <div style={s.grid}>
        {products.map((p) => {
          const avail = availableFor(p);
          return (
            <div key={p.id} style={s.card}>
              <div style={s.cardImg}>{p.name.charAt(0)}</div>
              <div style={s.cardBody}>
                <div style={s.cardCategory}>{p.category}</div>
                <div style={s.cardName}>{p.name}</div>
                <StockTag product={p} availableFor={availableFor} />
                <div style={s.cardFoot}>
                  <span style={s.cardPrice}>{money(p.price)}</span>
                  <button
                    style={{ ...s.addBtn, ...(avail <= 0 ? s.addBtnDisabled : {}) }}
                    disabled={avail <= 0}
                    onClick={() => onAdd(p, 1)}
                  >
                    {avail <= 0 ? 'Sold out' : 'Add to cart'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {products.length === 0 && <div style={s.empty}>No products yet — add some from the admin dashboard.</div>}
      </div>
    </div>
  );
}

function CartView({ items, total, onQty, onBack, onCheckout }) {
  return (
    <div style={s.viewPadNarrow}>
      <BackRow onBack={onBack} label="Continue shopping" />
      <h1 style={s.h1}>Your cart</h1>
      {items.length === 0 && <div style={s.empty}>Your cart is empty.</div>}
      {items.map(({ product, qty }) => (
        <div key={product.id} style={s.cartRow}>
          <div style={s.cartRowImg}>{product.name.charAt(0)}</div>
          <div style={{ flex: 1 }}>
            <div style={s.cardName}>{product.name}</div>
            <div style={s.cardCategory}>{money(product.price)} each</div>
          </div>
          <div style={s.qtyStepper}>
            <button style={s.stepBtn} onClick={() => onQty(product.id, qty - 1)}><Minus size={13} /></button>
            <span style={s.mono}>{qty}</span>
            <button style={s.stepBtn} onClick={() => onQty(product.id, qty + 1)}><Plus size={13} /></button>
          </div>
          <div style={{ ...s.mono, width: 60, textAlign: 'right' }}>{money(product.price * qty)}</div>
        </div>
      ))}
      {items.length > 0 && (
        <>
          <div style={s.totalRow}>
            <span>Subtotal</span>
            <span style={s.mono}>{money(total)}</span>
          </div>
          <button style={s.primaryBtn} onClick={onCheckout}>Checkout</button>
        </>
      )}
    </div>
  );
}

function CheckoutView({ session, items, total, onSaveAddress, onPlaceOrder, onBack }) {
  const [address, setAddress] = useState(session?.address || '');
  const [phone, setPhone] = useState(session?.phone || '');
  const shipping = total > 75 ? 0 : 6.5;

  const handlePlace = async () => {
    if (address && address !== session.address) await onSaveAddress({ address, phone });
    else if (phone !== session.phone) await onSaveAddress({ address, phone });
    onPlaceOrder();
  };

  return (
    <div style={s.viewPadNarrow}>
      <BackRow onBack={onBack} label="Back to cart" />
      <h1 style={s.h1}>Checkout</h1>

      <div style={s.sectionLabel}>DELIVERY DETAILS</div>
      <label style={s.fieldLabel}>Address</label>
      <textarea value={address} onChange={(e) => setAddress(e.target.value)} style={s.textarea} placeholder="Street, city, postal code" />
      <label style={s.fieldLabel}>Phone</label>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} style={s.textInput} placeholder="For courier contact" />

      <div style={{ ...s.sectionLabel, marginTop: 24 }}>ORDER SUMMARY</div>
      {items.map(({ product, qty }) => (
        <div key={product.id} style={s.summaryRow}>
          <span>{qty} × {product.name}</span>
          <span style={s.mono}>{money(product.price * qty)}</span>
        </div>
      ))}
      <div style={s.summaryRow}><span>Shipping</span><span style={s.mono}>{shipping === 0 ? 'Free' : money(shipping)}</span></div>
      <div style={s.totalRow}><span>Total</span><span style={s.mono}>{money(total + shipping)}</span></div>

      <button style={s.primaryBtn} disabled={!address} onClick={handlePlace}>
        Place order · {money(total + shipping)}
      </button>
      {!address && <div style={s.hint}>Add a delivery address to continue.</div>}
    </div>
  );
}

function AuthView({ mode, setMode, onLogin, onSignup, onBack }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = () => {
    if (!email || !password) return;
    mode === 'login' ? onLogin({ email, password }) : onSignup({ email, password });
  };

  return (
    <div style={s.viewPadNarrow}>
      <BackRow onBack={onBack} label="Continue shopping" />
      <h1 style={s.h1}>{mode === 'login' ? 'Log in' : 'Create account'}</h1>
      <label style={s.fieldLabel}>Email</label>
      <input value={email} onChange={(e) => setEmail(e.target.value)} style={s.textInput} placeholder="you@example.com" />
      <label style={s.fieldLabel}>Password</label>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={s.textInput} placeholder="••••••••" />
      <button style={s.primaryBtn} onClick={submit}>{mode === 'login' ? 'Log in' : 'Create account'}</button>
      <div style={s.switchAuth}>
        {mode === 'login' ? (
          <>New here? <button style={s.linkBtn} onClick={() => setMode('signup')}>Create an account</button></>
        ) : (
          <>Have an account? <button style={s.linkBtn} onClick={() => setMode('login')}>Log in</button></>
        )}
      </div>
    </div>
  );
}

function AccountView({ session, orders, onSaveAddress, onLogout, onBack }) {
  const [address, setAddress] = useState(session.address || '');
  const [phone, setPhone] = useState(session.phone || '');
  const [saved, setSaved] = useState(false);

  return (
    <div style={s.viewPadNarrow}>
      <BackRow onBack={onBack} label="Continue shopping" />
      <div style={s.accountHead}>
        <h1 style={s.h1}>Your account</h1>
        <button style={s.linkBtn} onClick={onLogout}><LogOut size={13} style={{ marginRight: 4 }} />Log out</button>
      </div>
      <div style={s.mutedSmall}>{session.email}</div>

      <div style={{ ...s.sectionLabel, marginTop: 24 }}>DELIVERY DETAILS</div>
      <label style={s.fieldLabel}>Address</label>
      <textarea value={address} onChange={(e) => setAddress(e.target.value)} style={s.textarea} />
      <label style={s.fieldLabel}>Phone</label>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} style={s.textInput} />
      <button style={s.secondaryBtn} onClick={() => { onSaveAddress({ address, phone }); setSaved(true); setTimeout(() => setSaved(false), 2000); }}>
        {saved ? 'Saved ✓' : 'Save details'}
      </button>

      <div style={{ ...s.sectionLabel, marginTop: 28 }}>ORDER HISTORY</div>
      {orders.length === 0 && <div style={s.empty}>No orders yet.</div>}
      {orders.map((o) => (
        <div key={o.id} style={s.orderCard}>
          <div style={s.orderCardHead}>
            <span style={s.mono}>#{String(o.id).slice(-6)}</span>
            <StatusPill status={o.status} />
          </div>
          <div style={s.mutedSmall}>{new Date(o.createdAt).toLocaleDateString()} · {money(o.total)}</div>
          {o.items.map((it) => (
            <div key={it.productId} style={s.orderItemRow}>{it.qty} × {it.name}</div>
          ))}
          {o.trackingNumber && <div style={s.mutedSmall}>Tracking: {o.trackingNumber}</div>}
        </div>
      ))}
    </div>
  );
}

function StatusPill({ status }) {
  const colorMap = { Processing: '#C6862B', Packed: '#5F7CA8', Shipped: '#3D7A54', Cancelled: '#B5453A' };
  return <span style={{ ...s.statusPill, color: colorMap[status] || '#6B7263', borderColor: (colorMap[status] || '#6B7263') + '55' }}>{status}</span>;
}

function ConfirmedView({ order, onContinue }) {
  return (
    <div style={s.viewPadNarrow}>
      <div style={s.confirmIcon}><Check size={22} color="#fff" /></div>
      <h1 style={s.h1}>Order placed</h1>
      <p style={s.mutedSmall}>Order #{String(order.id).slice(-6)} · {money(order.total)}</p>
      <p style={{ marginTop: 16 }}>We've reserved your items and moved them to packing. You'll get a shipping confirmation with tracking once it's on its way.</p>
      <button style={s.primaryBtn} onClick={onContinue}>Continue shopping</button>
    </div>
  );
}

function BackRow({ onBack, label }) {
  return <button style={s.backRow} onClick={onBack}><ChevronLeft size={15} /> {label}</button>;
}

const s = {
  app: { minHeight: '100vh', background: '#EEF1E9', color: '#1F231D', fontFamily: 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif' },
  loadingScreen: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#6B7263' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 22px', background: '#FFFFFF', borderBottom: '1px solid #E1E5D8', position: 'sticky', top: 0, zIndex: 10,
  },
  logo: {
    display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none',
    fontFamily: 'Georgia, "Iowan Old Style", serif', fontSize: 17, fontWeight: 700, letterSpacing: '0.02em', color: '#1F231D',
  },
  logoMark: { color: '#2F4A3C', fontSize: 10 },
  iconBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: '#1F231D', padding: 6, fontSize: 13 },
  headerEmail: { fontSize: 12.5, color: '#6B7263' },
  cartBtn: { position: 'relative', background: '#2F4A3C', border: 'none', color: '#fff', padding: 9, borderRadius: 8, display: 'flex' },
  cartBadge: {
    position: 'absolute', top: -5, right: -5, background: '#C6862B', color: '#fff', fontSize: 10, fontWeight: 700,
    borderRadius: 999, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  main: { maxWidth: 1040, margin: '0 auto' },
  viewPad: { padding: '32px 24px' },
  viewPadNarrow: { padding: '28px 24px', maxWidth: 480, margin: '0 auto' },
  heroBlock: { padding: '28px 4px 8px' },
  heroTitle: { fontFamily: 'Georgia, "Iowan Old Style", serif', fontSize: 32, margin: 0, lineHeight: 1.15 },
  heroSub: { color: '#6B7263', fontSize: 14, marginTop: 10, maxWidth: 460, lineHeight: 1.5 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18, marginTop: 22 },
  card: { background: '#FFFFFF', border: '1px solid #E1E5D8', borderRadius: 14, overflow: 'hidden' },
  cardImg: {
    height: 130, background: '#E1E5D8', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Georgia, serif', fontSize: 40, color: '#9CA492',
  },
  cardBody: { padding: '14px 16px 16px' },
  cardCategory: { fontSize: 11, color: '#9CA492', textTransform: 'uppercase', letterSpacing: '0.05em' },
  cardName: { fontFamily: 'Georgia, "Iowan Old Style", serif', fontSize: 16, marginTop: 3 },
  tag: { display: 'inline-block', fontSize: 11, padding: '3px 8px', borderRadius: 999, marginTop: 8, fontWeight: 600 },
  tagIn: { background: '#E4EEE3', color: '#3D7A54' },
  tagLow: { background: '#F7EAD2', color: '#A56A15' },
  tagOut: { background: '#F5DFDB', color: '#B5453A' },
  cardFoot: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  cardPrice: { fontFamily: 'ui-monospace, monospace', fontSize: 15, fontWeight: 600 },
  addBtn: { background: '#2F4A3C', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 600 },
  addBtnDisabled: { background: '#D8DCCF', color: '#9CA492' },
  empty: { color: '#9CA492', fontSize: 14, padding: '20px 0' },
  h1: { fontFamily: 'Georgia, "Iowan Old Style", serif', fontSize: 24, margin: '4px 0 4px' },
  backRow: { display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: '#6B7263', fontSize: 13, padding: 0, marginBottom: 10 },
  cartRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #E1E5D8' },
  cartRowImg: { width: 44, height: 44, borderRadius: 8, background: '#E1E5D8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia,serif', color: '#9CA492', flexShrink: 0 },
  qtyStepper: { display: 'flex', alignItems: 'center', gap: 8 },
  stepBtn: { width: 26, height: 26, borderRadius: 6, border: '1px solid #D8DCCF', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  mono: { fontFamily: 'ui-monospace, "SF Mono", monospace' },
  totalRow: { display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid #1F231D22', fontWeight: 700, fontSize: 15, marginTop: 6 },
  summaryRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '5px 0', color: '#4A4F42' },
  primaryBtn: { width: '100%', background: '#2F4A3C', color: '#fff', border: 'none', borderRadius: 9, padding: '13px 0', fontSize: 14.5, fontWeight: 600, marginTop: 14 },
  secondaryBtn: { background: '#fff', border: '1px solid #2F4A3C', color: '#2F4A3C', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, marginTop: 12 },
  sectionLabel: { fontSize: 11, color: '#9CA492', letterSpacing: '0.07em', marginTop: 18, marginBottom: 8 },
  fieldLabel: { display: 'block', fontSize: 12, color: '#6B7263', marginTop: 10, marginBottom: 4 },
  textInput: { width: '100%', border: '1px solid #D8DCCF', borderRadius: 8, padding: '10px 12px', fontSize: 13.5, background: '#fff', outline: 'none' },
  textarea: { width: '100%', border: '1px solid #D8DCCF', borderRadius: 8, padding: '10px 12px', fontSize: 13.5, background: '#fff', minHeight: 64, resize: 'vertical', outline: 'none', fontFamily: 'inherit' },
  hint: { fontSize: 12, color: '#B5453A', marginTop: 6 },
  switchAuth: { fontSize: 13, color: '#6B7263', marginTop: 16, textAlign: 'center' },
  linkBtn: { background: 'transparent', border: 'none', color: '#2F4A3C', fontWeight: 600, fontSize: 13, padding: 0, display: 'inline-flex', alignItems: 'center' },
  accountHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  mutedSmall: { fontSize: 12.5, color: '#6B7263' },
  orderCard: { background: '#fff', border: '1px solid #E1E5D8', borderRadius: 10, padding: '12px 14px', marginTop: 10 },
  orderCardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  orderItemRow: { fontSize: 13, marginTop: 6, color: '#4A4F42' },
  statusPill: { fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, border: '1px solid' },
  confirmIcon: { width: 44, height: 44, borderRadius: '50%', background: '#3D7A54', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  toast: {
    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
    background: '#1F231D', color: '#fff', padding: '10px 18px', borderRadius: 999, fontSize: 13, zIndex: 60,
  },
};

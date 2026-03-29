import React, { useEffect, useState, useRef, useCallback } from 'react';
import { socket, connectSocket } from './lib/socket';
import { Trophy, Play, Video, Edit2, Clock, TrendingUp, Users, Lock, User, Mail, ArrowRight, MessageSquare, ChevronLeft, Plus, X, Star, Heart, ShoppingCart, Zap, Volume2, VolumeX, Copy, Check, Search, BarChart2, Bell, Trash2, Timer, Tag, Package, ImageIcon, IndianRupee, ListChecks, CreditCard, Mic, MicOff, RefreshCw, Camera, ShieldCheck, ShieldAlert, Download, Truck, RotateCcw, ExternalLink, FileText } from 'lucide-react';
import clsx from 'clsx';

// ── Types ──────────────────────────────────────────────────────────
interface AuctionCard { id: string; itemTitle: string; itemImage: string; itemImages?: string[]; startingPrice: number; currentBid: number; highestBidderId: string; status: string; startTime?: number; endTime: number; bidCount: number; category: string; buyNowPrice: number | null; createdBy?: string; description?: string; createdAt?: number; moderationStatus?: 'Approved' | 'Pending' | 'Flagged'; moderationNotes?: string | null; sellerTrustScore?: number; sellerTrustLabel?: string; sellerVerified?: boolean; }
interface ChatMsg { id: string; userId: string; message: string; timestamp: number; }
interface Toast { id: string; type: 'outbid' | 'win' | 'error' | 'info'; message: string; }
interface Notif { id: string; type: 'outbid' | 'win' | 'info'; message: string; read: boolean; timestamp: number; }
interface AuthUser { id?: string; username: string; email?: string; }
interface OrderAddress { fullName: string; phone: string; line1: string; line2?: string; city: string; state: string; postalCode: string; country: string; }
interface OrderSupportRequest { type: 'cancel' | 'return'; status: 'requested' | 'approved' | 'rejected'; reason: string; sellerNotes?: string | null; requestedAt: number; resolvedAt?: number | null; }
interface FulfillmentOrder { id: string; auctionId: string; paymentId: string; buyerId: string; sellerId: string; itemTitle: string; amount: number; status: 'paid-awaiting-address' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returned'; invoiceNumber?: string; estimatedDelivery?: number | null; shippingAddress?: OrderAddress | null; trackingId?: string | null; carrier?: string | null; courierLink?: string | null; shippingLabelUrl?: string | null; notes?: string | null; request?: OrderSupportRequest | null; createdAt: number; updatedAt: number; }
interface SavedSearch { id: string; userId: string; label: string; query: string; category?: string | null; filter?: 'all' | 'active' | 'upcoming' | 'ending_soon' | 'ended' | 'buy_now' | 'watchlist' | 'mine'; sortBy?: 'newest' | 'bids' | 'ending' | 'price_low' | 'price_high'; notificationsEnabled?: boolean; createdAt: number; }
interface RecommendationAuction extends AuctionCard { recommendationScore: number; recommendationReason: string; recommendationReasons?: string[]; }
interface FloatingReaction { id: string; emoji: string; x: number; }
const REACTION_KEYS = ['FIRE','CLAP','MONEY','WOW','ROCKET'];
const REACTION_EMOJI: Record<string,string> = { FIRE:'🔥', CLAP:'👏', MONEY:'💰', WOW:'😮', ROCKET:'🚀' };
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function launchConfetti() {
  const isMobile = window.innerWidth < 640;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const colors = ['#3b82f6','#6366f1','#f59e0b','#10b981','#ef4444','#fff'];
  const count = isMobile ? 50 : 150;
  const pieces = Array.from({ length: count }, () => ({
    x: Math.random()*canvas.width, y: -20, w: Math.random()*10+5, h: Math.random()*5+3,
    color: colors[Math.floor(Math.random()*colors.length)],
    vx: (Math.random()-0.5)*4, vy: Math.random()*4+2,
    rot: Math.random()*Math.PI*2, rotV: (Math.random()-0.5)*0.2, opacity: 1,
  }));
  let frame = 0;
  const go = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of pieces) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.rot += p.rotV;
      if (frame > 120) p.opacity -= 0.012;
      if (p.opacity > 0) alive = true;
      ctx.save(); ctx.globalAlpha = Math.max(0,p.opacity); ctx.fillStyle = p.color;
      ctx.translate(p.x,p.y); ctx.rotate(p.rot); ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h); ctx.restore();
    }
    frame++;
    if (alive && frame < 300) requestAnimationFrame(go); else document.body.removeChild(canvas);
  };
  requestAnimationFrame(go);
}
function playBeep(f1: number, f2: number, vol = 0.2) {
  try {
    const ac = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    const osc = ac.createOscillator(); const g = ac.createGain();
    osc.connect(g); g.connect(ac.destination); osc.type = 'sine';
    osc.frequency.setValueAtTime(f1, ac.currentTime); osc.frequency.setValueAtTime(f2, ac.currentTime+0.1);
    g.gain.setValueAtTime(vol, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime+0.3);
    osc.start(); osc.stop(ac.currentTime+0.3);
  } catch {}
}

function userColor(name: string) {
  const palette = ['#3b82f6','#8b5cf6','#ec4899','#ef4444','#f59e0b','#10b981','#06b6d4','#f97316','#84cc16','#a855f7'];
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}
function formatDateTimeLocal(timestamp: number) {
  const date = new Date(timestamp - new Date().getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
}
function moderationPill(status?: AuctionCard['moderationStatus']) {
  if (status === 'Flagged') return { label: 'Flagged Listing', className: 'bg-red-500/15 text-red-300 border border-red-500/30', icon: ShieldAlert };
  if (status === 'Pending') return { label: 'Needs Review', className: 'bg-amber-500/15 text-amber-300 border border-amber-500/30', icon: ShieldAlert };
  return { label: 'Trusted Listing', className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30', icon: ShieldCheck };
}
function trustPill(label?: string, verified?: boolean) {
  if (verified) return { label: label || 'Verified Seller', className: 'bg-sky-500/15 text-sky-300 border border-sky-500/30', icon: ShieldCheck };
  return { label: label || 'New Seller', className: 'bg-white/5 text-slate-300 border border-white/10', icon: ShieldAlert };
}
function formatDateLocal(timestamp: number) {
  return formatDateTimeLocal(timestamp).slice(0, 10);
}
function formatTimeLocal(timestamp: number) {
  return formatDateTimeLocal(timestamp).slice(11, 16);
}
function combineLocalDateTime(date: string, time: string) {
  return date && time ? `${date}T${time}` : '';
}
function to12HourParts(time24: string) {
  if (!time24) return { hour: '12', minute: '00', period: 'AM' as 'AM' | 'PM' };
  const [rawHours, rawMinutes] = time24.split(':').map(Number);
  const period: 'AM' | 'PM' = rawHours >= 12 ? 'PM' : 'AM';
  const hour12 = ((rawHours + 11) % 12) + 1;
  return { hour: String(hour12).padStart(2, '0'), minute: String(rawMinutes).padStart(2, '0'), period };
}
function to24HourTime(hour12: string, minute: string, period: 'AM' | 'PM') {
  const normalizedHour = Math.max(1, Math.min(12, Number(hour12) || 12)) % 12;
  const hours24 = period === 'PM' ? normalizedHour + 12 : normalizedHour;
  return `${String(hours24).padStart(2, '0')}:${minute}`;
}
function formatReadableLocalDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
function parseLocalDateTime(value: string) {
  const [datePart, timePart] = value.split('T');
  if (!datePart || !timePart) return NaN;
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  if ([year, month, day, hours, minutes].some(part => Number.isNaN(part))) return NaN;
  return new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
}
const DEFAULT_ORDER_ADDRESS: OrderAddress = { fullName: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'India' };
function createSellerFulfillmentDraft(order?: Partial<FulfillmentOrder>) {
  return {
    trackingId: order?.trackingId || '',
    carrier: order?.carrier || '',
    notes: order?.notes || '',
    courierLink: order?.courierLink || '',
    shippingLabelUrl: order?.shippingLabelUrl || '',
    estimatedDelivery: order?.estimatedDelivery ? formatDateTimeLocal(order.estimatedDelivery) : '',
  };
}
function formatOrderStatusLabel(status: FulfillmentOrder['status']) {
  return status.replace(/-/g, ' ');
}
function formatEta(timestamp?: number | null) {
  if (!timestamp) return 'ETA pending';
  return new Date(timestamp).toLocaleString([], { month: 'short', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true });
}
function matchesSavedSearchClient(auction: AuctionCard, search: SavedSearch, watchlist: string[], username?: string) {
  const normalizedQuery = (search.query || '').trim().toLowerCase();
  const haystack = `${auction.itemTitle || ''} ${auction.description || ''} ${auction.category || ''}`.toLowerCase();
  const matchQuery = !normalizedQuery || haystack.includes(normalizedQuery);
  const matchCategory = !search.category || search.category === 'All' || auction.category === search.category;
  let matchFilter = true;
  if (search.filter === 'active') matchFilter = auction.status === 'Active';
  else if (search.filter === 'upcoming') matchFilter = auction.status === 'Upcoming';
  else if (search.filter === 'ending_soon') matchFilter = auction.status === 'Active' && auction.endTime > Date.now() && auction.endTime - Date.now() < 60_000;
  else if (search.filter === 'ended') matchFilter = auction.status === 'Closed';
  else if (search.filter === 'buy_now') matchFilter = !!auction.buyNowPrice && auction.status === 'Active';
  else if (search.filter === 'watchlist') matchFilter = watchlist.includes(auction.id);
  else if (search.filter === 'mine') matchFilter = auction.createdBy === username;
  return matchQuery && matchCategory && matchFilter;
}
const CAT_COLORS: Record<string, string> = {
  General:'#3b82f6', Electronics:'#06b6d4', Antiques:'#f59e0b',
  Art:'#ec4899', Jewelry:'#a855f7', Vehicles:'#ef4444', Collectibles:'#10b981',
};
const CAT_EMOJIS: Record<string, string> = {
  All:'🔀', General:'🏷️', Electronics:'💻', Antiques:'🏺',
  Art:'🎨', Jewelry:'💎', Vehicles:'🚗', Collectibles:'🃏',
};
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '646832990645-7opdki9o8ta3t0ge5h0clrdakrf81ncf.apps.googleusercontent.com';
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const RAZORPAY_KEY = import.meta.env.VITE_RAZORPAY_KEY || 'rzp_test_SWeGAlGO6zs19o';

function getFetchErrorMessage(error: unknown) {
  if (error instanceof TypeError) {
    return `Cannot reach the backend at ${BACKEND_URL}. Check VITE_BACKEND_URL, backend deployment, and CORS/network access.`;
  }
  if (error instanceof Error) return error.message;
  return 'Request failed.';
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return <div className="h-10 flex items-center justify-center text-[10px] text-slate-600 font-bold">No chart data yet</div>;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const W = 200, H = 52;
  const pts = data.map((v, i) => `${(i/(data.length-1))*W},${H-((v-min)/range)*H*0.82-4}`).join(' ');
  const last = pts.split(' ').pop()!.split(',').map(Number);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id="spkG" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#60a5fa"/>
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke="url(#spkG)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={last[0]} cy={last[1]} r="4" fill="#60a5fa" stroke="#1e293b" strokeWidth="2"/>
    </svg>
  );
}
const peerConnections: Record<string, RTCPeerConnection> = {};
const config = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }]
};

async function optimizeVideoSender(peerConnection: RTCPeerConnection) {
  const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
  if (!sender) return;
  try {
    const params = sender.getParameters();
    params.encodings = [{
      ...(params.encodings?.[0] || {}),
      maxBitrate: 2_500_000,
      maxFramerate: 30,
      scaleResolutionDownBy: 1,
    }];
    params.degradationPreference = 'maintain-resolution';
    await sender.setParameters(params);
  } catch {}
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authData, setAuthData] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  
  const [auctionState, setAuctionState] = useState({
    currentBid: 0,
    startingPrice: 1000,
    highestBidderId: 'None',
    status: 'Loading...',
    startTime: Date.now(),
    endTime: Date.now() + 60000,
    history: [] as { userId: string, amount: number }[],
    itemTitle: 'Antique Gold Watch',
    itemImage: 'https://images.unsplash.com/photo-1587836374828-cb4387dfee7d?auto=format&fit=crop&q=80&w=400&h=400',
    itemImages: [] as string[],
    auctionId: '',
    buyNowPrice: null as number | null,
    reservePrice: null as number | null,
    description: '',
    moderationStatus: 'Approved' as 'Approved' | 'Pending' | 'Flagged',
    moderationNotes: null as string | null,
    sellerTrustScore: 0,
    sellerTrustLabel: 'New Seller',
    sellerVerified: false,
  });
  
  const [bidAmount, setBidAmount] = useState('');
  const [myUser, setMyUser] = useState<AuthUser | null>(JSON.parse(localStorage.getItem('user') || 'null'));
  const [timeRemaining, setTimeRemaining] = useState(0);
  const timeDriftRef = useRef(0);
  const auctionTotalDurationRef = useRef(120);
  const [isBroadcaster, setIsBroadcaster] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [isEditingItem, setIsEditingItem] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editImage, setEditImage] = useState('');
  const [lastBidder, setLastBidder] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(1);
  // ── New state ──
  const [view, setView] = useState<'lobby' | 'auction'>('lobby');
  const [lobbyAuctions, setLobbyAuctions] = useState<AuctionCard[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>(() => JSON.parse(localStorage.getItem('watchlist') || '[]'));
  const [lobbyTab, setLobbyTab] = useState<'all' | 'watchlist'>('all');
  const [lobbyFilter, setLobbyFilter] = useState<'all' | 'active' | 'upcoming' | 'ending_soon' | 'ended' | 'buy_now' | 'watchlist' | 'mine'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'bids' | 'ending' | 'price_low' | 'price_high'>('newest');
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [rightTab, setRightTab] = useState<'bids' | 'chat' | 'history'>('bids');
  const [chats, setChats] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const imageUploadInputRef = useRef<HTMLInputElement>(null);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showProfile, setShowProfile] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [showCreateAuction, setShowCreateAuction] = useState(false);
  const [createForm, setCreateForm] = useState({ itemTitle: '', itemImages: [''], startingPrice: '1000', durationMinutes: '2', reservePrice: '', buyNowPrice: '', category: 'General', description: '', startMode: 'now', startAt: '' });

  // ── Extra features state ──
  const [soundMuted, setSoundMuted] = useState(false);
  const soundMutedRef = useRef(false);
  const toggleMute = () => { setSoundMuted(prev => { soundMutedRef.current = !prev; return !prev; }); };
  const [mobileAuctionTab, setMobileAuctionTab] = useState<'video' | 'details' | 'chat'>('video');
  const [winnerOverlay, setWinnerOverlay] = useState<{ winner: string; amount: number; auctionId: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationAuction[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [buyNowModal, setBuyNowModal] = useState(false);
  const [bidFlashKey, setBidFlashKey] = useState(0);
  const [fullBidHistory, setFullBidHistory] = useState<{ id: string; userId: string; amount: number; timestamp: number }[]>([]);
  const [lobbyNow, setLobbyNow] = useState(Date.now());
  const [myMaxBids, setMyMaxBids] = useState<Record<string, number | null>>({});
  const [maxBidInput, setMaxBidInput] = useState('');
  const [paidAuctions, setPaidAuctions] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem('paidAuctions') || '[]')));
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [selectedGalleryImage, setSelectedGalleryImage] = useState('');
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const [streamQualityLabel, setStreamQualityLabel] = useState('HD 1080p');
  const [selectedStreamQuality, setSelectedStreamQuality] = useState<'auto' | '720p' | '1080p'>('1080p');
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('user');
  const auctionReminderRef = useRef<Record<string, { soon: boolean; live: boolean; lastStatus?: string }>>({});
  const savedSearchAlertRef = useRef<Set<string>>(new Set(JSON.parse(localStorage.getItem('savedSearchAlertKeys') || '[]')));
  const savedSearchAlertPrimedRef = useRef(false);
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [addressAuctionId, setAddressAuctionId] = useState('');
  const [addressForm, setAddressForm] = useState<OrderAddress>(DEFAULT_ORDER_ADDRESS);
  const [addressSaving, setAddressSaving] = useState(false);
  const [sellerFulfillmentDrafts, setSellerFulfillmentDrafts] = useState<Record<string, { trackingId: string; carrier: string; notes: string; courierLink: string; shippingLabelUrl: string; estimatedDelivery: string }>>({});
  const [orderRequestDrafts, setOrderRequestDrafts] = useState<Record<string, string>>({});
  const [sellerRequestNotes, setSellerRequestNotes] = useState<Record<string, string>>({});
  const [browserAlertsEnabled, setBrowserAlertsEnabled] = useState(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    return Notification.permission === 'granted' && localStorage.getItem('browserAlertsEnabled') !== 'false';
  });

  const markAuctionPaid = (auctionId: string) => {
    setPaidAuctions(prev => {
      const next = new Set(prev); next.add(auctionId);
      localStorage.setItem('paidAuctions', JSON.stringify([...next]));
      return next;
    });
  };

  const loadOrders = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/orders`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      setOrders(data || []);
      const awaitingAddress = (data || []).find((order: FulfillmentOrder) => order.buyerId === myUser?.username && order.status === 'paid-awaiting-address');
      if (awaitingAddress) {
        setAddressAuctionId(awaitingAddress.auctionId);
        setAddressForm(awaitingAddress.shippingAddress || DEFAULT_ORDER_ADDRESS);
        setShowAddressModal(true);
      }
    } catch {}
  }, [myUser?.username]);

  const loadSavedSearches = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/saved-searches`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      setSavedSearches(data || []);
    } catch {}
  }, []);

  const loadRecommendations = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const watchlistParam = encodeURIComponent(watchlist.join(','));
      const res = await fetch(`${BACKEND_URL}/api/recommendations?watchlist=${watchlistParam}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      setRecommendations(data || []);
    } catch {}
  }, [watchlist]);

  const applySavedSearch = (search: SavedSearch) => {
    setSearchQuery(search.query || '');
    setCategoryFilter(search.category || 'All');
    setLobbyFilter(search.filter || 'all');
    setSortBy(search.sortBy || 'newest');
    setLobbyTab(search.filter === 'watchlist' ? 'watchlist' : 'all');
    addToast('info', `Applied saved search: ${search.label}`);
  };

  const saveCurrentSearch = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    if (!searchQuery.trim() && categoryFilter === 'All' && lobbyFilter === 'all') {
      addToast('error', 'Set a keyword, category, or filter before saving a search.');
      return;
    }
    const labelParts = [searchQuery.trim(), categoryFilter !== 'All' ? categoryFilter : '', lobbyFilter !== 'all' ? lobbyFilter.replace(/_/g, ' ') : ''].filter(Boolean);
    const label = labelParts.join(' · ') || `Search ${savedSearches.length + 1}`;
    try {
      const res = await fetch(`${BACKEND_URL}/api/saved-searches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label, query: searchQuery.trim(), category: categoryFilter === 'All' ? null : categoryFilter, filter: lobbyFilter, sortBy, notificationsEnabled: browserAlertsEnabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save search.');
      setSavedSearches(prev => [data, ...prev]);
      const nextAlertKeys = new Set(savedSearchAlertRef.current);
      lobbyAuctions.forEach(auction => {
        if (matchesSavedSearchClient(auction, data, watchlist, myUser?.username)) nextAlertKeys.add(`${data.id}:${auction.id}`);
      });
      savedSearchAlertRef.current = nextAlertKeys;
      localStorage.setItem('savedSearchAlertKeys', JSON.stringify([...nextAlertKeys].slice(-200)));
      addToast('info', `Saved search: ${data.label}`);
      void loadRecommendations();
    } catch (err: any) {
      addToast('error', err.message || 'Could not save search.');
    }
  };

  const deleteSavedSearch = async (searchId: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/saved-searches/${searchId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not remove saved search.');
      setSavedSearches(prev => prev.filter(search => search.id !== searchId));
      const nextAlertKeys = [...savedSearchAlertRef.current].filter(key => !key.startsWith(`${searchId}:`));
      savedSearchAlertRef.current = new Set(nextAlertKeys);
      localStorage.setItem('savedSearchAlertKeys', JSON.stringify(nextAlertKeys.slice(-200)));
      addToast('info', 'Saved search removed.');
      void loadRecommendations();
    } catch (err: any) {
      addToast('error', err.message || 'Could not remove saved search.');
    }
  };

  const submitShippingAddress = async (auctionId: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setAddressSaving(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/orders/${auctionId}/address`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(addressForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save address.');
      setOrders(prev => [data, ...prev.filter(order => order.id !== data.id)]);
      setShowAddressModal(false);
      addToast('info', 'Delivery address submitted successfully.');
    } catch (err: any) {
      addToast('error', err.message || 'Could not save address.');
    } finally {
      setAddressSaving(false);
    }
  };

  const updateOrderStatus = async (orderId: string, status?: FulfillmentOrder['status']) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const existingOrder = orders.find(order => order.id === orderId);
    const draft = sellerFulfillmentDrafts[orderId] || createSellerFulfillmentDraft(existingOrder);
    const estimatedDelivery = draft.estimatedDelivery ? parseLocalDateTime(draft.estimatedDelivery) : null;
    if (draft.estimatedDelivery && Number.isNaN(estimatedDelivery)) {
      addToast('error', 'Please enter a valid estimated delivery date and time.');
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/api/orders/${orderId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, trackingId: draft.trackingId, carrier: draft.carrier, notes: draft.notes, courierLink: draft.courierLink, shippingLabelUrl: draft.shippingLabelUrl, estimatedDelivery }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update order.');
      setOrders(prev => [data, ...prev.filter(order => order.id !== data.id)]);
      addToast('info', status ? `Order marked as ${status}.` : 'Shipping details saved.');
    } catch (err: any) {
      addToast('error', err.message || 'Could not update order.');
    }
  };

  const downloadInvoice = async (orderId: string, itemTitle: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/orders/${orderId}/invoice`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not download invoice.');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${itemTitle.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'invoice'}.html`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('info', 'Invoice downloaded.');
    } catch (err: any) {
      addToast('error', err.message || 'Could not download invoice.');
    }
  };

  const submitOrderRequest = async (orderId: string, type: OrderSupportRequest['type']) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const reason = (orderRequestDrafts[orderId] || '').trim();
    if (!reason) {
      addToast('error', `Please provide a reason for the ${type} request.`);
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/api/orders/${orderId}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not submit request.');
      setOrders(prev => [data, ...prev.filter(order => order.id !== data.id)]);
      setOrderRequestDrafts(prev => ({ ...prev, [orderId]: '' }));
      addToast('info', `${type === 'cancel' ? 'Cancellation' : 'Return'} request submitted.`);
    } catch (err: any) {
      addToast('error', err.message || 'Could not submit request.');
    }
  };

  const resolveOrderRequest = async (orderId: string, action: 'approve' | 'reject') => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/orders/${orderId}/request/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, sellerNotes: sellerRequestNotes[orderId] || '' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update request.');
      setOrders(prev => [data, ...prev.filter(order => order.id !== data.id)]);
      setSellerRequestNotes(prev => ({ ...prev, [orderId]: '' }));
      addToast('info', `Request ${action}d successfully.`);
    } catch (err: any) {
      addToast('error', err.message || 'Could not update request.');
    }
  };

  const handleRazorpayPayment = async (auctionId: string) => {
    if (!(window as any).Razorpay) {
      addToast('error', 'Razorpay checkout script not loaded. Please refresh the page and try again.');
      return;
    }
    if (!isAuthenticated || !myUser) {
      addToast('error', 'Please sign in before making a payment.');
      return;
    }

    // Get amount from winner overlay or auction state
    const amount = winnerOverlay?.amount || auctionState.currentBid;
    const itemTitle = auctionState.itemTitle || 'Auction Item';
    if (!amount || amount <= 0) {
      addToast('error', 'Invalid payment amount.');
      return;
    }

    const totalPaise = amount * 100; // Razorpay needs amount in paise

    setPaymentProcessing(true);
    try {
      const options = {
        key: RAZORPAY_KEY,
        amount: totalPaise,
        currency: 'INR',
        name: 'UltraBid Live',
        description: `Payment for: ${itemTitle}`,
        prefill: {
          name: myUser?.username || 'Bidder',
          email: myUser?.email || '',
          contact: '',
        },
        notes: { auctionId, itemTitle, winner: myUser?.username },
        theme: { color: '#3b82f6', backdrop_color: '#0f172a' },
        modal: {
          ondismiss: () => setPaymentProcessing(false),
          escape: true,
          backdropclose: false,
        },
        handler: async (response: any) => {
          // Payment successful — record it on backend
          try {
            const token = localStorage.getItem('token');
            const rRes = await fetch(`${BACKEND_URL}/api/payment/client-confirm`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({
                auctionId,
                razorpay_payment_id: response.razorpay_payment_id,
                amount,
              }),
            });
            const rData = await rRes.json();
            if (rData.success) {
              markAuctionPaid(auctionId);
              setWinnerOverlay(null);
              addToast('win', `✅ Payment successful! ID: ${response.razorpay_payment_id}`);
              pushNotification('win', `💳 Payment confirmed — ₹${amount.toLocaleString()}`);
            } else {
              // Payment went through on Razorpay but backend recording failed — still mark locally
              markAuctionPaid(auctionId);
              setWinnerOverlay(null);
              addToast('win', `✅ Payment received! ID: ${response.razorpay_payment_id}`);
            }
          } catch {
            // Backend unreachable but payment is done on Razorpay — mark locally
            markAuctionPaid(auctionId);
            setWinnerOverlay(null);
            addToast('win', `✅ Payment successful! ID: ${response.razorpay_payment_id}`);
          }
          setPaymentProcessing(false);
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (resp: any) => {
        addToast('error', `Payment failed: ${resp.error?.description || 'Unknown error'}`);
        setPaymentProcessing(false);
      });
      rzp.open();
    } catch (err) {
      addToast('error', 'Payment initiation failed. Please try again.');
      setPaymentProcessing(false);
    }
  };

  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = uid();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const requestBrowserAlerts = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      addToast('error', 'Browser alerts are not supported on this device.');
      return false;
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    const enabled = permission === 'granted';
    setBrowserAlertsEnabled(enabled);
    localStorage.setItem('browserAlertsEnabled', enabled ? 'true' : 'false');
    addToast(enabled ? 'info' : 'error', enabled ? 'Browser alerts enabled.' : 'Browser alerts permission denied.');
    return enabled;
  }, [addToast]);

  const sendBrowserAlert = useCallback((type: Notif['type'], message: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (!browserAlertsEnabled || Notification.permission !== 'granted') return;
    const title = type === 'outbid' ? 'UltraBid • Outbid Alert' : type === 'win' ? 'UltraBid • Winning Alert' : 'UltraBid • Auction Update';
    const notification = new Notification(title, {
      body: message,
      tag: `${type}-${message}`,
      icon: '/vite.svg',
      badge: '/vite.svg',
    });
    notification.onclick = () => {
      window.focus();
      setShowNotifications(true);
      notification.close();
    };
    window.setTimeout(() => notification.close(), 8000);
  }, [browserAlertsEnabled]);

  const pushNotification = useCallback((type: Notif['type'], message: string) => {
    setNotifications(prev => [{ id: uid(), type, message, read: false, timestamp: Date.now() }, ...prev.slice(0, 49)]);
    sendBrowserAlert(type, message);
  }, [sendBrowserAlert]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (isAuthenticated && view === 'lobby') {
      const fetchAuctions = async () => { try { const r = await fetch(`${BACKEND_URL}/api/auctions`); setLobbyAuctions(await r.json()); } catch {} };
      const loadDiscovery = async () => {
        await Promise.all([loadSavedSearches(), loadRecommendations()]);
      };
      fetchAuctions();
      loadOrders();
      loadDiscovery();
      const iv = setInterval(() => { void fetchAuctions(); void loadRecommendations(); }, 10000);
      // Tick lobby timers every second
      const tick = setInterval(() => setLobbyNow(Date.now()), 1000);
      return () => { clearInterval(iv); clearInterval(tick); };
    }
  }, [isAuthenticated, view, loadOrders, loadRecommendations, loadSavedSearches]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats]);

  useEffect(() => {
    if (!isAuthenticated || !myUser) return;

    const relevantIds = new Set<string>();

    for (const auction of lobbyAuctions) {
      if (!auction.startTime) continue;
      const isRelevant = auction.createdBy === myUser.username || watchlist.includes(auction.id);
      if (!isRelevant) continue;

      relevantIds.add(auction.id);
      const reminderState = auctionReminderRef.current[auction.id] || { soon: false, live: false, lastStatus: auction.status };
      const startsIn = auction.startTime - lobbyNow;

      if (auction.status === 'Upcoming' && startsIn > 0 && startsIn <= 5 * 60 * 1000 && !reminderState.soon) {
        const mins = Math.max(1, Math.ceil(startsIn / 60000));
        const message = `⏰ "${auction.itemTitle}" ${mins === 1 ? 'starts in less than 1 minute' : `starts in ${mins} minutes`}`;
        addToast('info', message);
        pushNotification('info', message);
        reminderState.soon = true;
      }

      if (reminderState.lastStatus === 'Upcoming' && auction.status === 'Active' && !reminderState.live) {
        const message = `🚀 "${auction.itemTitle}" is now live — join the auction now!`;
        addToast('info', message);
        pushNotification('info', message);
        reminderState.live = true;
      }

      reminderState.lastStatus = auction.status;
      auctionReminderRef.current[auction.id] = reminderState;
    }

    Object.keys(auctionReminderRef.current).forEach(auctionId => {
      if (!relevantIds.has(auctionId)) delete auctionReminderRef.current[auctionId];
    });
  }, [isAuthenticated, myUser, watchlist, lobbyAuctions, lobbyNow, addToast, pushNotification]);

  useEffect(() => {
    if (!isAuthenticated || !myUser || savedSearches.length === 0 || lobbyAuctions.length === 0) return;

    if (!savedSearchAlertPrimedRef.current) {
      const nextKeys = new Set(savedSearchAlertRef.current);
      for (const auction of lobbyAuctions) {
        for (const search of savedSearches) {
          if (!search.notificationsEnabled) continue;
          if (matchesSavedSearchClient(auction, search, watchlist, myUser.username)) {
            nextKeys.add(`${search.id}:${auction.id}`);
          }
        }
      }
      savedSearchAlertRef.current = nextKeys;
      localStorage.setItem('savedSearchAlertKeys', JSON.stringify([...nextKeys].slice(-200)));
      savedSearchAlertPrimedRef.current = true;
      return;
    }

    const nextKeys = new Set(savedSearchAlertRef.current);
    for (const auction of lobbyAuctions) {
      if (auction.createdBy === myUser.username) continue;
      for (const search of savedSearches) {
        if (!search.notificationsEnabled) continue;
        const alertKey = `${search.id}:${auction.id}`;
        if (nextKeys.has(alertKey)) continue;
        if (!matchesSavedSearchClient(auction, search, watchlist, myUser.username)) continue;
        const message = `🔎 New match for saved search "${search.label}": ${auction.itemTitle}`;
        addToast('info', message);
        pushNotification('info', message);
        nextKeys.add(alertKey);
      }
    }

    savedSearchAlertRef.current = nextKeys;
    localStorage.setItem('savedSearchAlertKeys', JSON.stringify([...nextKeys].slice(-200)));
  }, [isAuthenticated, myUser, savedSearches, lobbyAuctions, watchlist, addToast, pushNotification]);

  useEffect(() => {
    const nextImage = auctionState.itemImages?.find(Boolean) || auctionState.itemImage;
    if (nextImage && nextImage !== selectedGalleryImage) setSelectedGalleryImage(nextImage);
  }, [auctionState.auctionId, auctionState.itemImage, auctionState.itemImages, selectedGalleryImage]);

  useEffect(() => {
    if (isAuthenticated) {
      const token = localStorage.getItem('token');
      if (token) connectSocket(token);
    }

    socket.on('auction_state', (state) => {
      if (state.serverTimestamp) timeDriftRef.current = state.serverTimestamp - Date.now();
      if (state.recentChats) setChats(state.recentChats);
      const totalSecs = Math.max(30, Math.round((state.endTime - (state.serverTimestamp || Date.now())) / 1000));
      auctionTotalDurationRef.current = totalSecs;
      setAuctionState(state);
    });
    socket.on('viewer_count', setViewerCount);
    socket.on('auction_updated', (state) => {
      if (state.serverTimestamp) timeDriftRef.current = state.serverTimestamp - Date.now();
      setAuctionState(prev => {
        if (prev.status === 'Active' && state.status === 'Closed') {
          const winner = state.highestBidderId;
          const amount = state.currentBid;
          setWinnerOverlay({ winner, amount, auctionId: state.auctionId });
          // Auto-dismiss only if user did NOT win (winner needs to pay)
          if (winner !== myUser?.username) setTimeout(() => setWinnerOverlay(null), 8000);
          if (winner === myUser?.username) { setTimeout(launchConfetti, 300); addToast('win', `🏆 You won! Rs.${amount?.toLocaleString()} — Pay now to confirm!`); pushNotification('win', `🏆 You won "${state.itemTitle}" — Rs.${amount?.toLocaleString()}! Pay now to confirm.`); }
          else { addToast('info', `Auction ended. Winner: ${winner}`); pushNotification('info', `"${state.itemTitle}" ended. Winner: ${winner}`); }
        }
        return { ...prev, ...state };
      });
      if (state.currentBid) {
        if (!soundMutedRef.current) playBeep(660, 880);
        setBidAmount('');
        setBidFlashKey(k => k + 1);
        setLastBidder(state.highestBidderId);
        setTimeout(() => setLastBidder(null), 2000);
        // Append to full history
        setFullBidHistory(prev => [{ id: uid(), userId: state.highestBidderId, amount: state.currentBid, timestamp: Date.now() }, ...prev]);
      }
    });
    socket.on('payment_confirmed', ({ auctionId, amount }: { auctionId: string; amount: number }) => {
      markAuctionPaid(auctionId);
      addToast('win', `✅ Payment of ₹${amount?.toLocaleString()} confirmed!`);
      loadOrders();
    });
    socket.on('seller_payment_received', ({ itemTitle, buyer, amount }: { auctionId: string; itemTitle: string; buyer: string; amount: number }) => {
      addToast('info', `💸 Payment received from ${buyer} for "${itemTitle}" — ₹${amount?.toLocaleString()}`);
      pushNotification('info', `💸 Payment ₹${amount?.toLocaleString()} received from ${buyer} for "${itemTitle}"`);
    });
    socket.on('outbid', ({ auctionTitle, newBid }) => {
      if (!soundMutedRef.current) playBeep(880, 440, 0.3);
      addToast('outbid', `You were outbid on "${auctionTitle}"! New: Rs.${newBid?.toLocaleString()}`);
      pushNotification('outbid', `Outbid on "${auctionTitle}" — Rs.${newBid?.toLocaleString()}`);
    });
    socket.on('bid_error', (msg: string) => addToast('error', msg));
    socket.on('chat_message', (msg: ChatMsg) => setChats(prev => [...prev.slice(-99), msg]));
    socket.on('reaction', ({ emoji }: { userId: string; emoji: string }) => {
      const id = uid(); const x = 5 + Math.random() * 80;
      setReactions(prev => [...prev, { id, emoji, x }]);
      setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 3000);
    });
    socket.on('auction_created', (a: AuctionCard) => {
      setLobbyAuctions(prev => [a, ...prev]);
      void loadRecommendations();
    });
    socket.on('order_updated', (order: FulfillmentOrder) => {
      setOrders(prev => [order, ...prev.filter(existing => existing.id !== order.id)]);
      if (order.buyerId === myUser?.username && order.status === 'paid-awaiting-address') {
        setAddressAuctionId(order.auctionId);
        setAddressForm(order.shippingAddress || DEFAULT_ORDER_ADDRESS);
        setShowAddressModal(true);
      }
      if (order.buyerId === myUser?.username && order.status !== 'paid-awaiting-address') addToast('info', `Order update: ${order.itemTitle} is now ${order.status}.`);
      if (order.sellerId === myUser?.username && order.status === 'processing') addToast('info', `Buyer address received for ${order.itemTitle}.`);
      if (order.request?.status === 'requested' && order.sellerId === myUser?.username) addToast('info', `${order.request.type === 'cancel' ? 'Cancellation' : 'Return'} request received for ${order.itemTitle}.`);
    });
    socket.on('auction_created_confirm', ({ auctionId, status, startTime, moderationStatus, moderationNotes }: { auctionId: string; status: string; startTime?: number; moderationStatus?: AuctionCard['moderationStatus']; moderationNotes?: string | null }) => {
      if (moderationStatus === 'Flagged') addToast('error', moderationNotes || 'Listing was flagged by the trust layer. Update the title/image to improve trust.');
      else if (moderationStatus === 'Pending') addToast('info', moderationNotes || 'Listing is pending trust review. Buyers will see a caution badge.');
      if (status === 'Upcoming') {
        setView('lobby');
        addToast('info', `Auction scheduled for ${new Date(startTime || Date.now()).toLocaleString()}`);
        return;
      }
      joinAuction(auctionId);
    });
    socket.on('auction_not_found', () => { setView('lobby'); addToast('error', 'Auction not found.'); });
    socket.on('auction_deleted', ({ auctionId }: { auctionId: string }) => {
      setLobbyAuctions(prev => prev.filter(a => a.id !== auctionId));
      addToast('info', 'An auction was deleted.');
      setView('lobby');
    });
    socket.on('lobby_auction_update', (update: { id: string; currentBid: number; highestBidderId: string; status: string; bidCount: number }) => {
      setLobbyAuctions(prev => prev.map(a => a.id === update.id ? { ...a, ...update } : a));
    });
    socket.on('auto_bid_placed', ({ auctionTitle, amount }: { auctionId: string; auctionTitle: string; amount: number }) => {
      if (!soundMutedRef.current) playBeep(880, 1100);
      addToast('info', `⚡ Auto-bid placed on "${auctionTitle}" — Rs.${amount?.toLocaleString()}`);
      pushNotification('info', `⚡ Auto-bid Rs.${amount?.toLocaleString()} placed on "${auctionTitle}"`);
    });
    socket.on('max_bid_confirmed', ({ auctionId, maxAmount }: { auctionId: string; maxAmount: number | null }) => {
      setMyMaxBids(prev => ({ ...prev, [auctionId]: maxAmount }));
      if (maxAmount) addToast('info', `✅ Auto-bid set to Rs.${maxAmount.toLocaleString()}`);
      else addToast('info', 'Auto-bid cancelled.');
    });

    socket.on('connect_error', (err) => {
       if (err.message === 'Authentication error') {
          handleLogout();
       }
    });

    return () => {
      socket.off('auction_state');
      socket.off('auction_updated');
      socket.off('connect_error');
      socket.off('viewer_count');
      socket.off('outbid');
      socket.off('bid_error');
      socket.off('chat_message');
      socket.off('reaction');
      socket.off('auction_created');
      socket.off('order_updated');
      socket.off('auction_created_confirm');
      socket.off('auction_not_found');
      socket.off('auction_deleted');
      socket.off('lobby_auction_update');
      socket.off('auto_bid_placed');
      socket.off('max_bid_confirmed');
      socket.off('payment_confirmed');
      socket.off('seller_payment_received');
    };
  }, [isAuthenticated, myUser?.username, addToast, pushNotification, loadOrders, loadRecommendations]);

  useEffect(() => {
    const timer = setInterval(() => {
      // Use server-corrected time to avoid clock drift
      const serverNow = Date.now() + timeDriftRef.current;
      const remaining = Math.max(0, Math.floor((auctionState.endTime - serverNow) / 1000));
      setTimeRemaining(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [auctionState.endTime]);

  useEffect(() => {
    if (!isAuthenticated) return;

    socket.on("offer", (id, description) => {
      const peerConnection = new RTCPeerConnection(config);
      peerConnections[id] = peerConnection;
      peerConnection.setRemoteDescription(description)
        .then(() => peerConnection.createAnswer())
        .then(sdp => peerConnection.setLocalDescription(sdp))
        .then(() => socket.emit("answer", id, peerConnection.localDescription));

      peerConnection.ontrack = event => {
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0];
          setIsLive(true);
        }
      };
      peerConnection.onicecandidate = event => {
        if (event.candidate) socket.emit("candidate", id, event.candidate);
      };
    });

    socket.on("answer", (id, description) => { if(peerConnections[id]) peerConnections[id].setRemoteDescription(description); });
    socket.on("candidate", (id, candidate) => { if(peerConnections[id]) peerConnections[id].addIceCandidate(new RTCIceCandidate(candidate)); });

    socket.on("watcher", id => {
      const peerConnection = new RTCPeerConnection(config);
      peerConnections[id] = peerConnection;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => { peerConnection.addTrack(track, streamRef.current!); });
        void optimizeVideoSender(peerConnection);
      }
      peerConnection.onicecandidate = event => { if (event.candidate) socket.emit("candidate", id, event.candidate); };
      peerConnection.createOffer()
        .then(sdp => peerConnection.setLocalDescription(sdp))
        .then(() => socket.emit("offer", id, peerConnection.localDescription));
    });

    socket.on("broadcaster", () => { if (!isBroadcaster) socket.emit("watcher"); });
    socket.on("disconnectPeer", id => { if (peerConnections[id]) { peerConnections[id].close(); delete peerConnections[id]; }});
    socket.on("broadcaster_disconnect", () => {
      setIsLive(false);
      if (!isBroadcaster && videoRef.current) videoRef.current.srcObject = null;
    });

    if (!isBroadcaster) socket.emit("watcher"); 

    return () => {
      socket.off("offer"); socket.off("answer"); socket.off("candidate");
      socket.off("watcher"); socket.off("broadcaster"); socket.off("disconnectPeer"); socket.off("broadcaster_disconnect");
    };
  }, [isBroadcaster, isAuthenticated]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
    try {
      const res = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authData)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setMyUser(data.user);
      setIsAuthenticated(true);
    } catch (err: unknown) {
      setError(getFetchErrorMessage(err));
    }
  };

  const handleGoogleLogin = useCallback(async (credential: string) => {
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setMyUser(data.user);
      setIsAuthenticated(true);
    } catch (err: unknown) { setError(getFetchErrorMessage(err)); }
  }, []);

  useEffect(() => {
    // Only init GSI when the login form is visible
    if (isAuthenticated) return;

    const initGoogle = () => {
      const gsi = (window as any).google?.accounts?.id;
      if (!gsi) return;

      gsi.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp: any) => handleGoogleLogin(resp.credential),
        ux_mode: 'popup',
        use_fedcm_for_prompt: false,
        itp_support: true,
      });

      // Use rAF to ensure the DOM element is painted before renderButton
      requestAnimationFrame(() => {
        const btnContainer = document.getElementById('google-signin-btn');
        const fallbackBtn = document.getElementById('google-signin-fallback');
        if (btnContainer) {
          btnContainer.innerHTML = ''; // clear previous render
          try {
            gsi.renderButton(btnContainer, {
              theme: 'filled_black',
              size: 'large',
              shape: 'pill',
              width: btnContainer.offsetWidth || 300,
              text: 'continue_with',
            });
            if (fallbackBtn) fallbackBtn.style.display = 'none';
          } catch {
            // renderButton failed — show fallback
            if (fallbackBtn) fallbackBtn.style.display = '';
          }
        } else if (fallbackBtn) {
          fallbackBtn.style.display = '';
        }
      });
    };

    // If GSI script already loaded
    if ((window as any).google?.accounts?.id) initGoogle();
    else {
      // Wait for script to load
      const onLoad = () => initGoogle();
      window.addEventListener('load', onLoad, { once: true });
      // Also poll briefly in case 'load' already fired
      const timer = setInterval(() => {
        if ((window as any).google?.accounts?.id) { clearInterval(timer); initGoogle(); }
      }, 200);
      return () => { window.removeEventListener('load', onLoad); clearInterval(timer); };
    }
  }, [handleGoogleLogin, isAuthenticated]);

  const handleLogout = () => {
    // Tell GSI to stop auto-select on next page load
    try { (window as any).google?.accounts?.id?.disableAutoSelect(); } catch { /* ignore */ }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      socket.emit('stop_broadcast');
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setMyUser(null);
    localStorage.removeItem('savedSearchAlertKeys');
    savedSearchAlertRef.current = new Set();
    savedSearchAlertPrimedRef.current = false;
    setSavedSearches([]);
    setRecommendations([]);
    setView('lobby');
    socket.disconnect();
  };

  const joinAuction = (auctionId: string) => {
    socket.emit('join_auction', auctionId);
    setChats([]); setFullBidHistory([]);
    fetch(`${BACKEND_URL}/api/auctions/${auctionId}/bids`)
      .then(r => r.json()).then(setFullBidHistory).catch(() => {});
    socket.once('auction_state', () => setView('auction'));
  };

  const handleBuyNow = () => { if (auctionState.buyNowPrice) setBuyNowModal(true); };
  const confirmBuyNow = () => { socket.emit('buy_now', { auctionId: auctionState.auctionId }); setBuyNowModal(false); };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('send_chat', { auctionId: auctionState.auctionId, message: chatInput });
    setChatInput('');
  };

  const handleReaction = (key: string) => socket.emit('send_reaction', { auctionId: auctionState.auctionId, emoji: key });

  const toggleWatchlist = (id: string) => {
    setWatchlist(prev => { const n = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]; localStorage.setItem('watchlist', JSON.stringify(n)); return n; });
  };

  const buildSellerAnalyticsFallback = useCallback((username: string) => {
    const listings = lobbyAuctions.filter(a => a.createdBy === username);
    const soldListings = listings.filter(a => a.status === 'Closed' && a.highestBidderId && a.highestBidderId !== 'None');
    const topAuction = listings
      .map(a => ({
        id: a.id,
        itemTitle: a.itemTitle,
        amount: a.currentBid,
        bidCount: a.bidCount,
        status: a.status,
      }))
      .sort((a, b) => (b.amount - a.amount) || (b.bidCount - a.bidCount))[0] || null;

    return {
      totalListings: listings.length,
      activeListings: listings.filter(a => a.status === 'Active').length,
      upcomingListings: listings.filter(a => a.status === 'Upcoming').length,
      soldListings: soldListings.length,
      totalRevenue: soldListings.reduce((sum, a) => sum + a.currentBid, 0),
      potentialRevenue: soldListings.reduce((sum, a) => sum + a.currentBid, 0),
      totalBidsReceived: listings.reduce((sum, a) => sum + (a.bidCount || 0), 0),
      uniqueBidders: 0,
      conversionRate: listings.length ? Math.round((soldListings.length / listings.length) * 100) : 0,
      topAuction,
      revenueSeries: listings
        .slice()
        .sort((a, b) => (a.startTime ?? a.createdAt ?? a.endTime) - (b.startTime ?? b.createdAt ?? b.endTime))
        .slice(-8)
        .map(a => a.status === 'Closed' && a.highestBidderId !== 'None' ? a.currentBid : 0),
      recentSales: soldListings
        .slice()
        .sort((a, b) => b.endTime - a.endTime)
        .slice(0, 5)
        .map(a => ({
          auctionId: a.id,
          itemTitle: a.itemTitle,
          amount: a.currentBid,
          winner: a.highestBidderId,
          paid: false,
          timestamp: a.endTime,
        })),
    };
  }, [lobbyAuctions]);

  const loadProfile = async () => {
    if (!myUser) return;
    loadOrders();
    try {
      const r = await fetch(`${BACKEND_URL}/api/profile/${myUser.username}`);
      const data = await r.json();
      const nextUser = data?.email && data.email !== myUser.email ? { ...myUser, email: data.email } : myUser;
      const fallbackSellerAnalytics = buildSellerAnalyticsFallback(myUser.username);
      if (nextUser !== myUser) {
        setMyUser(nextUser);
        localStorage.setItem('user', JSON.stringify(nextUser));
      }
      setProfileData({
        ...data,
        email: data?.email || nextUser?.email || myUser.email || '',
        sellerAnalytics: {
          ...fallbackSellerAnalytics,
          ...(data?.sellerAnalytics || {}),
        },
      });
      setShowProfile(true);
    } catch {
      setProfileData({ username: myUser.username, email: myUser.email || '', totalBids: 0, wins: 0, bidHistory: [], sellerAnalytics: buildSellerAnalyticsFallback(myUser.username) });
      setShowProfile(true);
    }
  };

  const handleCreateAuction = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedImages = createForm.itemImages.map(img => img.trim()).filter(Boolean).slice(0, 6);
    const scheduledAt = createForm.startMode === 'scheduled' ? parseLocalDateTime(createForm.startAt) : undefined;
    if (cleanedImages.length === 0) {
      addToast('error', 'Add at least one product image URL.');
      return;
    }
    if (createForm.startMode === 'scheduled' && (!scheduledAt || Number.isNaN(scheduledAt) || scheduledAt < Date.now() + 60_000)) {
      addToast('error', 'Scheduled auctions must start at least 1 minute later.');
      return;
    }
    socket.emit('create_auction', {
      ...createForm,
      itemImage: cleanedImages[0],
      itemImages: cleanedImages,
      startAt: createForm.startMode === 'scheduled' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
    });
    setShowCreateAuction(false);
    setCreateForm({ itemTitle: '', itemImages: [''], startingPrice: '1000', durationMinutes: '2', reservePrice: '', buyNowPrice: '', category: 'General', description: '', startMode: 'now', startAt: '' });
  };

  const handleLocalImageUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    const pickedFiles = Array.from(files).slice(0, 6);
    const availableSlots = Math.max(0, 6 - createForm.itemImages.filter(Boolean).length);
    if (availableSlots === 0) {
      addToast('error', 'Maximum 6 images allowed.');
      return;
    }

    try {
      const uploadedImages = (await Promise.all(
        pickedFiles.slice(0, availableSlots).map(file => new Promise<string>((resolve, reject) => {
          if (!file.type.startsWith('image/')) return reject(new Error(`${file.name} is not an image.`));
          if (file.size > 3 * 1024 * 1024) return reject(new Error(`${file.name} is larger than 3MB.`));
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
          reader.readAsDataURL(file);
        }))
      )).filter(Boolean);

      setCreateForm(prev => {
        const existing = prev.itemImages.filter(Boolean);
        return { ...prev, itemImages: [...existing, ...uploadedImages].slice(0, 6) };
      });
      addToast('info', `${uploadedImages.length} image${uploadedImages.length !== 1 ? 's' : ''} uploaded.`);
    } catch (err: any) {
      addToast('error', err.message || 'Image upload failed');
    } finally {
      if (imageUploadInputRef.current) imageUploadInputRef.current.value = '';
    }
  };

  const handleImageDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingImages(false);
    await handleLocalImageUpload(e.dataTransfer.files);
  };

  const isUploadedImageValue = (value: string) => value.startsWith('data:image/');
  const openImagePicker = () => imageUploadInputRef.current?.click();

  const getVideoConstraints = useCallback((quality: 'auto' | '720p' | '1080p', facingMode: 'user' | 'environment') => {
    if (quality === '720p') {
      return {
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: 30, max: 30 },
        facingMode,
      } satisfies MediaTrackConstraints;
    }
    if (quality === '1080p') {
      return {
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
        facingMode,
      } satisfies MediaTrackConstraints;
    }
    return {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
      facingMode,
    } satisfies MediaTrackConstraints;
  }, []);

  const startBroadcast = async (overrides?: { quality?: 'auto' | '720p' | '1080p'; mic?: boolean; facingMode?: 'user' | 'environment' }) => {
    try {
       const quality = overrides?.quality ?? selectedStreamQuality;
       const facingMode = overrides?.facingMode ?? cameraFacingMode;
       const withMic = overrides?.mic ?? micEnabled;
       if (streamRef.current) {
         streamRef.current.getTracks().forEach(track => track.stop());
       }
       Object.keys(peerConnections).forEach(id => {
         peerConnections[id]?.close();
         delete peerConnections[id];
       });
       const stream = await navigator.mediaDevices.getUserMedia({
         video: getVideoConstraints(quality, facingMode),
         audio: withMic ? {
           echoCancellation: true,
           noiseSuppression: true,
           autoGainControl: true,
         } : false,
       });
       const [videoTrack] = stream.getVideoTracks();
       if (videoTrack) {
         videoTrack.contentHint = 'detail';
         const settings = videoTrack.getSettings();
         const width = settings.width || 1280;
         const height = settings.height || 720;
         setStreamQualityLabel(`${quality === 'auto' ? 'Auto' : quality === '1080p' ? 'HD 1080p' : 'HD 720p'} • ${width}x${height}`);
       }
       if (videoRef.current) videoRef.current.srcObject = stream;
       streamRef.current = stream;
       setSelectedStreamQuality(quality);
       setCameraFacingMode(facingMode);
       setMicEnabled(withMic);
       setIsBroadcaster(true);
       setIsLive(true);
       socket.emit("broadcaster");
    } catch (e) {
       console.error(e);
       alert("Camera access denied or unvailable! Please grant permissions.");
    }
  };

  const stopBroadcast = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    Object.keys(peerConnections).forEach(id => {
      peerConnections[id]?.close();
      delete peerConnections[id];
    });
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsLive(false);
    setIsBroadcaster(false);
    socket.emit('stop_broadcast');
    addToast('info', 'Broadcast stopped.');
  };

  const handleSwitchCamera = async () => {
    const nextFacingMode = cameraFacingMode === 'user' ? 'environment' : 'user';
    setCameraFacingMode(nextFacingMode);
    if (isBroadcaster) await startBroadcast({ facingMode: nextFacingMode });
  };

  const handleToggleMic = async () => {
    const nextMicEnabled = !micEnabled;
    setMicEnabled(nextMicEnabled);
    if (isBroadcaster) await startBroadcast({ mic: nextMicEnabled });
  };

  const handleQualityChange = async (quality: 'auto' | '720p' | '1080p') => {
    setSelectedStreamQuality(quality);
    if (isBroadcaster) await startBroadcast({ quality });
  };

  const handlePlaceBid = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submit clicked, current status:", auctionState.status);
    if (moderationLocked) {
      addToast('error', 'Bidding is temporarily locked while this listing is under trust review.');
      return;
    }
    const amount = parseFloat(bidAmount);
    const minBid = auctionState.currentBid + 100;
    if (amount < minBid) {
      addToast('error', `Minimum bid is Rs.${minBid.toLocaleString()}`);
      return;
    }
    socket.emit('place_bid', { auctionId: auctionState.auctionId, amount });
  };

  const handleSaveItemEdit = () => {
     if (!editTitle && !editImage) return setIsEditingItem(false);
     socket.emit('update_item', {
        auctionId: auctionState.auctionId,
        itemTitle: editTitle || auctionState.itemTitle,
        itemImage: editImage || auctionState.itemImage
     });
     setIsEditingItem(false);
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const galleryImages = (auctionState.itemImages?.filter(Boolean)?.length ? auctionState.itemImages : [auctionState.itemImage]).filter(Boolean);
  const isUpcoming = auctionState.status === 'Upcoming';
  const startCountdown = Math.max(0, Math.floor(((auctionState.startTime || Date.now()) - (Date.now() + timeDriftRef.current)) / 1000));

  const isUrgent = timeRemaining <= 10 && timeRemaining > 0 && auctionState.status === 'Active';
  const auctionOwner = lobbyAuctions.find(a => a.id === auctionState.auctionId)?.createdBy;
  const isOwnerViewing = auctionOwner === myUser?.username;
  const moderationLocked = !isOwnerViewing && auctionState.moderationStatus !== 'Approved';
  const roomModerationMeta = moderationPill(auctionState.moderationStatus);
  const roomTrustMeta = trustPill(auctionState.sellerTrustLabel, auctionState.sellerVerified);
  const RoomModerationIcon = roomModerationMeta.icon;
  const RoomTrustIcon = roomTrustMeta.icon;
  const currentOrder = orders.find(order => order.auctionId === auctionState.auctionId);

  if (!isAuthenticated) {
     return (
        <div className="min-h-screen bg-[#09090f] flex font-sans overflow-hidden">
           {/* Left — brand panel (hidden on mobile) */}
           <div className="hidden lg:flex lg:w-[52%] flex-col justify-between p-14 relative overflow-hidden"
             style={{background:'linear-gradient(135deg, #0d0720 0%, #130930 50%, #0a1628 100%)'}}>
              {/* Orbs */}
              <div className="absolute top-[-20%] left-[-15%] w-[60%] h-[60%] bg-violet-600/25 rounded-full blur-[120px] pointer-events-none" />
              <div className="absolute bottom-[-20%] right-[-10%] w-[55%] h-[55%] bg-fuchsia-600/15 rounded-full blur-[120px] pointer-events-none" />
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMiI+PHBhdGggZD0iTTM2IDM0djZoNnYtNmgtNnpNMCAyNHY2aDZ2LTZIMHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-40 pointer-events-none" />

              {/* Logo */}
              <div className="flex items-center gap-3 relative z-10">
                 <div className="w-11 h-11 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/40">
                    <TrendingUp className="w-6 h-6 text-white" />
                 </div>
                 <span className="text-xl font-bold tracking-tight text-white" style={{fontFamily:"'Space Grotesk', sans-serif"}}>UltraBid Live</span>
              </div>

              {/* Hero copy */}
              <div className="relative z-10 space-y-6">
                 <div>
                    <h2 className="text-5xl font-bold text-white leading-tight tracking-tight" style={{fontFamily:"'Space Grotesk', sans-serif"}}>
                       Bid. Win.<br />
                       <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-violet-300 bg-clip-text text-transparent">Own it.</span>
                    </h2>
                    <p className="text-slate-400 mt-4 text-base leading-relaxed max-w-xs">
                       The fastest live auction platform. Real-time bidding, instant payments, zero friction.
                    </p>
                 </div>

                 {/* Feature bullets */}
                 <div className="space-y-3">
                    {[
                       { icon: <Zap className="w-4 h-4 text-violet-400" />, text: 'Real-time bidding with live video' },
                       { icon: <ShoppingCart className="w-4 h-4 text-emerald-400" />, text: 'Instant Buy Now for quick deals' },
                       { icon: <CreditCard className="w-4 h-4 text-fuchsia-400" />, text: 'Secure Razorpay payment gateway' },
                    ].map((f, i) => (
                       <div key={i} className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center flex-shrink-0 border border-white/10">{f.icon}</div>
                          <span className="text-sm text-slate-300 font-medium">{f.text}</span>
                       </div>
                    ))}
                 </div>

                 {/* Stats */}
                 <div className="flex gap-6 pt-2">
                    {[['Live', 'Auctions'], ['Real-time', 'Bidding'], ['Secure', 'Payments']].map(([top, bot], i) => (
                       <div key={i}>
                          <p className="text-lg font-bold text-white" style={{fontFamily:"'Space Grotesk', sans-serif"}}>{top}</p>
                          <p className="text-xs text-slate-500">{bot}</p>
                       </div>
                    ))}
                 </div>
              </div>

              {/* Bottom attribution */}
              <p className="text-xs text-slate-600 relative z-10">© 2026 UltraBid Live. All rights reserved.</p>
           </div>

           {/* Right — form panel */}
           <div className="flex-1 flex items-center justify-center p-5 sm:p-8 lg:p-14 relative">
              <div className="fixed inset-0 lg:hidden pointer-events-none">
                 <div className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] bg-violet-700/20 rounded-full blur-[130px] animate-pulse"></div>
                 <div className="absolute bottom-[-15%] right-[-10%] w-[45%] h-[45%] bg-fuchsia-700/15 rounded-full blur-[130px] animate-pulse delay-700"></div>
              </div>

              <div className="w-full max-w-sm relative z-10">
                 {/* Mobile logo */}
                 <div className="flex items-center gap-3 mb-10 lg:hidden">
                    <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30">
                       <TrendingUp className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-lg font-bold tracking-tight text-white" style={{fontFamily:"'Space Grotesk', sans-serif"}}>UltraBid Live</span>
                 </div>

                 <div className="mb-8">
                    <h1 className="text-2xl font-bold text-white tracking-tight" style={{fontFamily:"'Space Grotesk', sans-serif"}}>
                       {authMode === 'login' ? 'Welcome back' : 'Create your account'}
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                       {authMode === 'login' ? 'Sign in to continue to your dashboard' : 'Join thousands of live auction participants'}
                    </p>
                 </div>

                 <form onSubmit={handleAuth} className="space-y-4">
                    {authMode === 'register' && (
                       <div className="space-y-1.5">
                          <label className="text-xs font-medium text-slate-400 ml-0.5">Username</label>
                          <div className="relative">
                             <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                             <input required type="text" placeholder="your_username" value={authData.username} onChange={(e)=>setAuthData({...authData, username: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm placeholder:text-slate-600 focus:border-violet-500/80 focus:bg-violet-500/5 outline-none transition-all" />
                          </div>
                       </div>
                    )}
                    <div className="space-y-1.5">
                       <label className="text-xs font-medium text-slate-400 ml-0.5">Email address</label>
                       <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input required type="email" placeholder="you@example.com" value={authData.email} onChange={(e)=>setAuthData({...authData, email: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm placeholder:text-slate-600 focus:border-violet-500/80 focus:bg-violet-500/5 outline-none transition-all" />
                       </div>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-xs font-medium text-slate-400 ml-0.5">Password</label>
                       <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input required type="password" placeholder="Min. 6 characters" value={authData.password} onChange={(e)=>setAuthData({...authData, password: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm placeholder:text-slate-600 focus:border-violet-500/80 focus:bg-violet-500/5 outline-none transition-all" />
                       </div>
                    </div>

                    {error && <p className="text-red-400 text-sm">{error}</p>}

                    <button type="submit" className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold py-3 rounded-xl shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all flex items-center justify-center gap-2 mt-2 group text-sm">
                       {authMode === 'login' ? 'Sign in' : 'Create account'}
                       <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </button>

                    <div className="relative flex items-center gap-3">
                       <div className="flex-1 h-px bg-white/8" />
                       <span className="text-xs text-slate-600">or continue with</span>
                       <div className="flex-1 h-px bg-white/8" />
                    </div>

                    {/* Google's official rendered button */}
                    <div id="google-signin-btn" className="w-full flex items-center justify-center" />
                    {/* Fallback custom button if GSI renderButton didn't work */}
                    <button type="button" onClick={() => { (window as any).google?.accounts?.id?.prompt(); }}
                       id="google-signin-fallback"
                       className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 text-slate-300 text-sm font-medium py-3 rounded-xl hover:bg-white/8 hover:border-white/15 transition-all"
                       style={{ display: 'none' }}>
                       <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                       </svg>
                       Google
                    </button>
                 </form>

                 <p className="mt-6 text-center text-sm text-slate-500">
                    {authMode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
                    <button onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
                       {authMode === 'login' ? 'Sign up' : 'Sign in'}
                    </button>
                 </p>
              </div>
           </div>
        </div>
     );
  }

  // Toast helper component inline
  const Toasts = () => (
    <div className="fixed top-3 right-3 sm:top-6 sm:right-6 z-[100] space-y-2 pointer-events-none max-w-[calc(100vw-1.5rem)] sm:max-w-sm">
      {toasts.map(t => (
        <div key={t.id} className={clsx('px-5 py-3 rounded-xl font-medium text-sm shadow-xl border animate-in slide-in-from-right-4 duration-300', {
          'bg-red-600/90 border-red-500 text-white': t.type === 'outbid' || t.type === 'error',
          'bg-yellow-500/90 border-yellow-400 text-slate-950': t.type === 'win',
          'bg-slate-800/90 border-slate-700 text-white': t.type === 'info',
        })}>{t.message}</div>
      ))}
    </div>
  );
  const ProfileModal = () => !showProfile || !profileData ? null : (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl p-5 sm:p-8 w-full max-w-4xl shadow-2xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-white" style={{fontFamily:"'Space Grotesk',sans-serif"}}>My Profile</h2><button onClick={() => setShowProfile(false)} className="p-2 hover:bg-slate-800 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button></div>
        <div className="flex items-center gap-4 mb-6 p-4 bg-white/[0.03] border border-white/8 rounded-2xl"><div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-md" style={{ background: userColor(profileData.username) }}>{profileData.username?.[0]?.toUpperCase()}</div><div><p className="font-semibold text-white text-lg">{profileData.username}</p>{(profileData.email || myUser?.email) && <p className="text-slate-400 text-xs mt-0.5 break-all">{profileData.email || myUser?.email}</p>}<p className="text-slate-500 text-xs mt-1">{profileData.totalBids} bids · {profileData.wins} wins</p></div></div>
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-violet-400">{profileData.totalBids}</p><p className="text-xs text-slate-500 font-medium mt-1">Total Bids</p></div>
          <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-yellow-400">{profileData.wins}</p><p className="text-xs text-slate-500 font-medium mt-1">Auctions Won</p></div>
        </div>
        {orders.filter(order => order.buyerId === myUser?.username).length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-slate-400 mb-3">My Orders</h3>
            <div className="space-y-2">
              {orders.filter(order => order.buyerId === myUser?.username).slice(0, 4).map(order => {
                const canCancel = ['paid-awaiting-address', 'processing'].includes(order.status) && order.request?.status !== 'requested';
                const canReturn = ['shipped', 'delivered'].includes(order.status) && order.request?.status !== 'requested';
                return (
                  <div key={order.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{order.itemTitle}</p>
                        <p className="text-[11px] text-slate-500 mt-1">₹{order.amount.toLocaleString()} · {formatOrderStatusLabel(order.status)}</p>
                        {order.invoiceNumber && <p className="text-[11px] text-slate-500 mt-1">Invoice: {order.invoiceNumber}</p>}
                        {order.trackingId && <p className="text-[11px] text-sky-300 mt-1">Tracking: {order.trackingId}{order.carrier ? ` · ${order.carrier}` : ''}</p>}
                        <p className="text-[11px] text-slate-400 mt-1">Estimated delivery: {formatEta(order.estimatedDelivery)}</p>
                      </div>
                      {order.status === 'paid-awaiting-address' ? <button onClick={() => { setAddressAuctionId(order.auctionId); setAddressForm(order.shippingAddress || DEFAULT_ORDER_ADDRESS); setShowAddressModal(true); }} className="px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-medium hover:bg-violet-500">Add address</button> : <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">{formatOrderStatusLabel(order.status)}</span>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => downloadInvoice(order.id, order.itemTitle)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs hover:bg-white/10"><Download className="w-3.5 h-3.5" />Invoice</button>
                      {order.courierLink && <a href={order.courierLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs hover:bg-sky-500/20"><Truck className="w-3.5 h-3.5" />Track shipment<ExternalLink className="w-3 h-3" /></a>}
                    </div>
                    {order.request && (
                      <div className={clsx('rounded-xl border p-3', order.request.status === 'requested' ? 'border-amber-500/20 bg-amber-500/10' : order.request.status === 'approved' ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-red-500/20 bg-red-500/10')}>
                        <p className="text-[11px] font-semibold text-white uppercase tracking-wide">{order.request.type} request · {order.request.status}</p>
                        <p className="text-[11px] text-slate-300 mt-1">{order.request.reason}</p>
                        {order.request.sellerNotes && <p className="text-[11px] text-slate-400 mt-1">Seller note: {order.request.sellerNotes}</p>}
                      </div>
                    )}
                    {(canCancel || canReturn) && (
                      <div className="rounded-xl bg-slate-950/60 border border-white/5 p-3 space-y-2">
                        <textarea value={orderRequestDrafts[order.id] || ''} onChange={e => setOrderRequestDrafts(prev => ({ ...prev, [order.id]: e.target.value }))} placeholder={canCancel ? 'Why do you want to cancel this order?' : 'Why do you want to return this order?'} className="w-full min-h-[82px] bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none resize-none" />
                        <div className="flex flex-wrap gap-2">
                          {canCancel && <button onClick={() => submitOrderRequest(order.id, 'cancel')} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/20 text-amber-300 text-xs hover:bg-amber-500/25"><RotateCcw className="w-3.5 h-3.5" />Request cancellation</button>}
                          {canReturn && <button onClick={() => submitOrderRequest(order.id, 'return')} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/20 text-fuchsia-300 text-xs hover:bg-fuchsia-500/25"><Package className="w-3.5 h-3.5" />Request return</button>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {orders.filter(order => order.sellerId === myUser?.username).length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-slate-400 mb-3">Seller Fulfillment</h3>
            <div className="space-y-3">
              {orders.filter(order => order.sellerId === myUser?.username).slice(0, 4).map(order => {
                const draft = sellerFulfillmentDrafts[order.id] || createSellerFulfillmentDraft(order);
                return (
                  <div key={order.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{order.itemTitle}</p>
                        <p className="text-[11px] text-slate-500 mt-1">Buyer: {order.buyerId} · ₹{order.amount.toLocaleString()}</p>
                        <p className="text-[11px] text-slate-400 mt-1">Status: {formatOrderStatusLabel(order.status)}</p>
                        {order.invoiceNumber && <p className="text-[11px] text-slate-500 mt-1">Invoice: {order.invoiceNumber}</p>}
                        <p className="text-[11px] text-slate-400 mt-1">Estimated delivery: {formatEta(order.estimatedDelivery)}</p>
                      </div>
                      <span className="text-[10px] px-2 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">{formatOrderStatusLabel(order.status)}</span>
                    </div>
                    {order.shippingAddress ? (
                      <div className="rounded-xl bg-slate-950/60 border border-white/5 p-3">
                        <p className="text-[11px] text-slate-300 font-medium">Ship to: {order.shippingAddress.fullName}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{order.shippingAddress.line1}{order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}, {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}, {order.shippingAddress.country}</p>
                        <p className="text-[11px] text-slate-500 mt-1">Phone: {order.shippingAddress.phone}</p>
                      </div>
                    ) : <p className="text-[11px] text-amber-300">Waiting for buyer shipping address.</p>}
                    {order.request && (
                      <div className={clsx('rounded-xl border p-3', order.request.status === 'requested' ? 'border-amber-500/20 bg-amber-500/10' : order.request.status === 'approved' ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-red-500/20 bg-red-500/10')}>
                        <p className="text-[11px] font-semibold text-white uppercase tracking-wide">{order.request.type} request · {order.request.status}</p>
                        <p className="text-[11px] text-slate-300 mt-1">{order.request.reason}</p>
                        {order.request.sellerNotes && <p className="text-[11px] text-slate-400 mt-1">Seller note: {order.request.sellerNotes}</p>}
                        {order.request.status === 'requested' && (
                          <div className="mt-3 space-y-2">
                            <textarea value={sellerRequestNotes[order.id] || ''} onChange={e => setSellerRequestNotes(prev => ({ ...prev, [order.id]: e.target.value }))} placeholder="Optional note for the buyer" className="w-full min-h-[72px] bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none resize-none" />
                            <div className="flex flex-wrap gap-2">
                              <button onClick={() => resolveOrderRequest(order.id, 'approve')} className="px-3 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/20 text-emerald-300 text-xs">Approve request</button>
                              <button onClick={() => resolveOrderRequest(order.id, 'reject')} className="px-3 py-2 rounded-xl bg-red-600/20 border border-red-500/20 text-red-300 text-xs">Reject request</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input placeholder="Tracking ID" value={draft.trackingId} onChange={e => setSellerFulfillmentDrafts(prev => ({ ...prev, [order.id]: { ...draft, trackingId: e.target.value } }))} className="bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                      <input placeholder="Carrier" value={draft.carrier} onChange={e => setSellerFulfillmentDrafts(prev => ({ ...prev, [order.id]: { ...draft, carrier: e.target.value } }))} className="bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                      <input placeholder="Courier tracking link" value={draft.courierLink} onChange={e => setSellerFulfillmentDrafts(prev => ({ ...prev, [order.id]: { ...draft, courierLink: e.target.value } }))} className="bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                      <input placeholder="Shipping label link" value={draft.shippingLabelUrl} onChange={e => setSellerFulfillmentDrafts(prev => ({ ...prev, [order.id]: { ...draft, shippingLabelUrl: e.target.value } }))} className="bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                      <input type="datetime-local" value={draft.estimatedDelivery} onChange={e => setSellerFulfillmentDrafts(prev => ({ ...prev, [order.id]: { ...draft, estimatedDelivery: e.target.value } }))} className="bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                      <input placeholder="Notes" value={draft.notes} onChange={e => setSellerFulfillmentDrafts(prev => ({ ...prev, [order.id]: { ...draft, notes: e.target.value } }))} className="bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none sm:col-span-2" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => updateOrderStatus(order.id)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs hover:bg-white/10"><FileText className="w-3.5 h-3.5" />Save shipping details</button>
                      <button onClick={() => downloadInvoice(order.id, order.itemTitle)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs hover:bg-white/10"><Download className="w-3.5 h-3.5" />Invoice</button>
                      {(draft.shippingLabelUrl || order.shippingLabelUrl) && <a href={draft.shippingLabelUrl || order.shippingLabelUrl || '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-500/15 border border-violet-500/20 text-violet-300 text-xs hover:bg-violet-500/25"><Package className="w-3.5 h-3.5" />Open label<ExternalLink className="w-3 h-3" /></a>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => updateOrderStatus(order.id, 'processing')} disabled={!order.shippingAddress} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs disabled:opacity-40">Mark Processing</button>
                      <button onClick={() => updateOrderStatus(order.id, 'shipped')} disabled={!order.shippingAddress} className="px-3 py-2 rounded-xl bg-sky-600/20 border border-sky-500/20 text-sky-300 text-xs disabled:opacity-40">Mark Shipped</button>
                      <button onClick={() => updateOrderStatus(order.id, 'delivered')} disabled={!order.shippingAddress} className="px-3 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/20 text-emerald-300 text-xs disabled:opacity-40">Mark Delivered</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-[0.18em]">Seller Analytics</h3>
              <span className="text-[10px] text-slate-500">Dashboard</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-4"><p className="text-[10px] text-slate-500 uppercase tracking-wider">Revenue</p><p className="text-xl font-bold text-emerald-400 mt-1">₹{(profileData.sellerAnalytics.totalRevenue || profileData.sellerAnalytics.potentialRevenue || 0).toLocaleString()}</p><p className="text-[11px] text-slate-500 mt-1">{profileData.sellerAnalytics.soldListings} sold</p></div>
              <div className="bg-violet-500/8 border border-violet-500/20 rounded-xl p-4"><p className="text-[10px] text-slate-500 uppercase tracking-wider">Listings</p><p className="text-xl font-bold text-violet-400 mt-1">{profileData.sellerAnalytics.totalListings}</p><p className="text-[11px] text-slate-500 mt-1">{profileData.sellerAnalytics.activeListings} live · {profileData.sellerAnalytics.upcomingListings} upcoming</p></div>
              <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl p-4"><p className="text-[10px] text-slate-500 uppercase tracking-wider">Bid Demand</p><p className="text-xl font-bold text-blue-400 mt-1">{profileData.sellerAnalytics.totalBidsReceived}</p><p className="text-[11px] text-slate-500 mt-1">{profileData.sellerAnalytics.uniqueBidders} unique bidders</p></div>
              <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-xl p-4"><p className="text-[10px] text-slate-500 uppercase tracking-wider">Conversion</p><p className="text-xl font-bold text-yellow-400 mt-1">{profileData.sellerAnalytics.conversionRate}%</p><p className="text-[11px] text-slate-500 mt-1">Listings converted to sales</p></div>
            </div>
            {profileData.sellerAnalytics.totalListings > 0 ? (
              <>
            <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-white">Revenue trend</p>
                <span className="text-[10px] text-slate-500">Last {Math.max(1, profileData.sellerAnalytics.revenueSeries?.length || 0)} listings</span>
              </div>
              <Sparkline data={profileData.sellerAnalytics.revenueSeries || []} />
            </div>
            {profileData.sellerAnalytics.topAuction && (
              <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-4">
                <p className="text-xs font-semibold text-white mb-2">Top performing listing</p>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{profileData.sellerAnalytics.topAuction.itemTitle}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{profileData.sellerAnalytics.topAuction.bidCount} bids · {profileData.sellerAnalytics.topAuction.status}</p>
                  </div>
                  <p className="text-sm font-bold text-emerald-400">₹{profileData.sellerAnalytics.topAuction.amount?.toLocaleString()}</p>
                </div>
              </div>
            )}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 mb-3">Recent Sales</h3>
              <div className="space-y-2">
                {profileData.sellerAnalytics.recentSales?.length ? profileData.sellerAnalytics.recentSales.map((sale: any, i: number) => (
                  <div key={sale.auctionId || i} className="flex justify-between items-center p-3 rounded-xl bg-white/[0.03] border border-white/8">
                    <div className="min-w-0 pr-3">
                      <p className="text-sm font-medium text-white truncate">{sale.itemTitle}</p>
                      <p className="text-[11px] text-slate-500 mt-1">Won by {sale.winner} · {new Date(sale.timestamp).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-emerald-400">₹{sale.amount?.toLocaleString()}</p>
                      <p className={clsx('text-[10px] mt-1', sale.paid ? 'text-emerald-400' : 'text-yellow-400')}>{sale.paid ? 'PAID' : 'PENDING'}</p>
                    </div>
                  </div>
                )) : <p className="text-center text-slate-600 text-sm py-4">No completed sales yet</p>}
              </div>
            </div>
              </>
            ) : (
              <div className="bg-white/[0.03] border border-dashed border-white/10 rounded-2xl p-6 text-center">
                <p className="text-sm font-semibold text-white">No seller data yet</p>
                <p className="text-xs text-slate-500 mt-2">Create your first auction to unlock seller analytics and sales insights.</p>
                <button onClick={() => { setShowProfile(false); setShowCreateAuction(true); }} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-all"><Tag className="w-4 h-4" />Create Listing</button>
              </div>
            )}
          </div>
        <h3 className="text-xs font-semibold text-slate-400 mb-3">Recent Activity</h3>
        <div className="space-y-2">
          {profileData.bidHistory?.slice(0,10).map((b: any, i: number) => (
            <div key={i} className={clsx('flex justify-between items-center p-3 rounded-xl', b.won ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-white/[0.03] border border-white/8')}><div><p className="text-sm font-medium text-white">{b.auctionTitle}</p><p className="text-xs text-slate-500">{new Date(b.timestamp).toLocaleDateString()}</p></div><div className="text-right"><p className="font-semibold text-violet-400">₹{b.amount?.toLocaleString()}</p>{b.won && <p className="text-xs text-yellow-400">WON</p>}</div></div>
          ))}
          {(!profileData.bidHistory || profileData.bidHistory.length === 0) && <p className="text-center text-slate-600 text-sm py-4">No bids yet</p>}
        </div>
      </div>
    </div>
  );
  const AddressModal = () => !showAddressModal ? null : (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-white" style={{fontFamily:"'Space Grotesk',sans-serif"}}>Delivery Address</h2>
            <p className="text-xs text-slate-500 mt-1">Add shipping details to start order fulfillment.</p>
          </div>
          <button onClick={() => setShowAddressModal(false)} className="p-2 hover:bg-slate-800 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            ['fullName', 'Full name'], ['phone', 'Phone'], ['line1', 'Address line 1'], ['line2', 'Address line 2'], ['city', 'City'], ['state', 'State'], ['postalCode', 'Postal code'], ['country', 'Country'],
          ].map(([key, label]) => (
            <div key={key} className={clsx('space-y-1.5', key === 'line1' ? 'sm:col-span-2' : key === 'line2' ? 'sm:col-span-2' : '')}>
              <label className="text-xs font-medium text-slate-400">{label}</label>
              <input value={(addressForm as any)[key] || ''} onChange={e => setAddressForm(prev => ({ ...prev, [key]: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-violet-500/60 outline-none" />
            </div>
          ))}
        </div>
        <button onClick={() => submitShippingAddress(addressAuctionId)} disabled={addressSaving} className="w-full mt-5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all">{addressSaving ? 'Saving address...' : 'Save address & start fulfillment'}</button>
      </div>
    </div>
  );
  const CreateAuctionModal = () => !showCreateAuction ? null : (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-t-3xl sm:rounded-3xl w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[95vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-7 pt-5 sm:pt-7 pb-4 sm:pb-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/25"><Tag className="w-5 h-5 text-white" /></div>
            <div><h2 className="text-xl font-bold text-white" style={{fontFamily:"'Space Grotesk',sans-serif"}}>Sell Your Product</h2><p className="text-xs text-slate-500 mt-0.5">List it as a live auction</p></div>
          </div>
          <button onClick={() => setShowCreateAuction(false)} className="p-2 hover:bg-slate-800 rounded-xl transition-all"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <form onSubmit={handleCreateAuction} className="p-4 sm:p-7 space-y-5 sm:space-y-6">
          {(() => {
            const minimumScheduleDate = formatDateLocal(Date.now() + 60_000);
            const minimumScheduleTime = formatTimeLocal(Date.now() + 60_000);
            const selectedScheduleDate = createForm.startAt ? createForm.startAt.slice(0, 10) : '';
            const selectedScheduleTime = createForm.startAt ? createForm.startAt.slice(11, 16) : '';
            const selectedTime12 = to12HourParts(selectedScheduleTime || minimumScheduleTime);
            const minimumTime12 = to12HourParts(minimumScheduleTime);
            const updateScheduleTime = (parts: Partial<{ hour: string; minute: string; period: 'AM' | 'PM' }>) => {
              setCreateForm(p => {
                const existingDate = p.startAt ? p.startAt.slice(0, 10) : minimumScheduleDate;
                const existingTimeParts = to12HourParts(p.startAt ? p.startAt.slice(11, 16) : minimumScheduleTime);
                const nextHour = parts.hour ?? existingTimeParts.hour;
                const nextMinute = parts.minute ?? existingTimeParts.minute;
                const nextPeriod: 'AM' | 'PM' = parts.period ?? existingTimeParts.period;
                return {
                  ...p,
                  startAt: combineLocalDateTime(existingDate, to24HourTime(nextHour, nextMinute, nextPeriod)),
                };
              });
            };

            return (
          <>
          {/* Product Info section */}
          <div>
            <p className="text-xs font-semibold text-emerald-400 mb-4 flex items-center gap-2"><Package className="w-3 h-3" />Product Info</p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Product Name *</label>
                <input type="text" required placeholder="e.g. iPhone 14 Pro, Vintage Watch, Handmade Rug..." value={createForm.itemTitle} onChange={ev => setCreateForm(p => ({...p, itemTitle: ev.target.value}))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-emerald-500/60 outline-none placeholder:text-slate-600 transition-colors" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5"><ImageIcon className="w-3 h-3" />Product Images *</label>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={openImagePicker} className="text-[11px] font-medium text-violet-400 hover:text-violet-300 disabled:opacity-40">Choose from gallery</button>
                    <button type="button" onClick={() => setCreateForm(p => ({ ...p, itemImages: [...p.itemImages, ''].slice(0, 6) }))} className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 disabled:opacity-40" disabled={createForm.itemImages.length >= 6}>+ Add URL</button>
                  </div>
                </div>
                <input id="auction-image-upload" ref={imageUploadInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={e => handleLocalImageUpload(e.target.files)} />
                <p className="text-[10px] text-slate-600">Paste image URLs or choose images from gallery/files up to 3MB each.</p>
                <div
                  onDragEnter={e => { e.preventDefault(); setIsDraggingImages(true); }}
                  onDragOver={e => { e.preventDefault(); if (!isDraggingImages) setIsDraggingImages(true); }}
                  onDragLeave={e => {
                    e.preventDefault();
                    const nextTarget = e.relatedTarget as Node | null;
                    if (!nextTarget || !e.currentTarget.contains(nextTarget)) setIsDraggingImages(false);
                  }}
                  onDrop={handleImageDrop}
                  onClick={openImagePicker}
                  className={clsx(
                    'rounded-2xl border border-dashed px-4 py-5 transition-all cursor-pointer text-center select-none',
                    isDraggingImages
                      ? 'border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/10'
                      : 'border-white/10 bg-white/[0.03] hover:border-violet-500/40 hover:bg-violet-500/[0.04]'
                  )}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className={clsx('w-11 h-11 rounded-2xl flex items-center justify-center', isDraggingImages ? 'bg-violet-500/20 text-violet-300' : 'bg-white/5 text-slate-500')}>
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Drag & drop images here</p>
                      <p className="text-[11px] text-slate-500 mt-1">or tap to open gallery / files</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  {createForm.itemImages.map((img, index) => (
                    isUploadedImageValue(img) ? (
                      <div key={index} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                        <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-950 border border-white/10 flex-shrink-0">
                          <img src={img} alt={`uploaded-${index}`} className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white">Uploaded image {index + 1}</p>
                          <p className="text-[11px] text-slate-500 truncate">Selected from your gallery/files</p>
                        </div>
                        <button type="button" onClick={openImagePicker} className="px-3 py-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium hover:bg-violet-500/20 transition-colors">Add more</button>
                        {createForm.itemImages.length > 1 && (
                          <button type="button" onClick={() => setCreateForm(p => { const nextImages = p.itemImages.filter((_, i) => i !== index); return { ...p, itemImages: nextImages.length ? nextImages : [''] }; })} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-red-400 hover:border-red-500/30 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div key={index} className="flex gap-2">
                        <input type="text" placeholder={`Image URL ${index + 1}`} value={img} onChange={ev => setCreateForm(p => ({ ...p, itemImages: p.itemImages.map((current, i) => i === index ? ev.target.value : current) }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-emerald-500/60 outline-none placeholder:text-slate-600 transition-colors" />
                        {createForm.itemImages.length > 1 && (
                          <button type="button" onClick={() => setCreateForm(p => { const nextImages = p.itemImages.filter((_, i) => i !== index); return { ...p, itemImages: nextImages.length ? nextImages : [''] }; })} className="px-3 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-red-400 hover:border-red-500/30 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )
                  ))}
                </div>
                {createForm.itemImages.some(Boolean) ? (
                  <div className="mt-2 space-y-3">
                    <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-700 aspect-video flex items-center justify-center">
                      <img src={createForm.itemImages.find(Boolean)} alt="preview" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
                      <span className="absolute bottom-2 left-3 text-[10px] text-white/50">Primary cover</span>
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {createForm.itemImages.filter(Boolean).map((img, index) => (
                        <div key={img + index} className="aspect-square rounded-xl overflow-hidden border border-white/10 bg-slate-950">
                          <img src={img} alt={`thumb-${index}`} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 rounded-2xl border border-dashed border-slate-700 aspect-video flex flex-col items-center justify-center gap-2 bg-slate-950/50">
                    <ImageIcon className="w-8 h-8 text-slate-700" />
                    <p className="text-xs text-slate-600">Add 1–6 images via URL or local upload</p>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Description <span className="text-slate-600">(optional)</span></label>
                <textarea value={createForm.description} onChange={ev => setCreateForm(p => ({...p, description: ev.target.value}))} placeholder="Describe your product — condition, age, brand, any defects..." rows={3} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-emerald-500/60 outline-none resize-none placeholder:text-slate-600 transition-colors" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Category</label>
                <select value={createForm.category} onChange={ev => setCreateForm(p => ({...p, category: ev.target.value}))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-emerald-500/60 outline-none cursor-pointer">
                  {['General','Electronics','Antiques','Art','Jewelry','Vehicles','Collectibles'].map(c => <option key={c} value={c}>{CAT_EMOJIS[c]} {c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Pricing section */}
          <div className="border-t border-slate-800 pt-6">
            <p className="text-xs font-semibold text-emerald-400 mb-4 flex items-center gap-2"><IndianRupee className="w-3 h-3" />Pricing</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Starting Price *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">₹</span>
                  <input type="number" min="1" required placeholder="1000" value={createForm.startingPrice} onChange={ev => setCreateForm(p => ({...p, startingPrice: ev.target.value}))} className="w-full bg-white/5 border border-white/10 rounded-xl pl-7 pr-4 py-3 text-white text-sm focus:border-emerald-500/60 outline-none transition-colors" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Reserve Price <span className="text-slate-600">(optional)</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">₹</span>
                  <input type="number" min="1" placeholder="Min. acceptable" value={createForm.reservePrice} onChange={ev => setCreateForm(p => ({...p, reservePrice: ev.target.value}))} className="w-full bg-white/5 border border-white/10 rounded-xl pl-7 pr-4 py-3 text-white text-sm focus:border-emerald-500/60 outline-none transition-colors" />
                </div>
                <p className="text-xs text-slate-600">Auction won't close below this</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Buy Now Price <span className="text-slate-600">(optional)</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">₹</span>
                  <input type="number" min="1" placeholder="Instant sale price" value={createForm.buyNowPrice} onChange={ev => setCreateForm(p => ({...p, buyNowPrice: ev.target.value}))} className="w-full bg-white/5 border border-white/10 rounded-xl pl-7 pr-4 py-3 text-white text-sm focus:border-emerald-500/60 outline-none transition-colors" />
                </div>
                <p className="text-xs text-slate-600">Buyer pays this to win instantly</p>
              </div>
            </div>
          </div>

          {/* Duration section */}
          <div className="border-t border-slate-800 pt-6">
            <p className="text-xs font-semibold text-emerald-400 mb-4 flex items-center gap-2"><Timer className="w-3 h-3" />Auction Duration</p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
              {[['1','1 min'],['2','2 min'],['5','5 min'],['10','10 min'],['30','30 min'],['60','1 hr']].map(([val,lbl]) => (
                <button key={val} type="button" onClick={() => setCreateForm(p => ({...p, durationMinutes: val}))} className={clsx('py-2 rounded-lg text-sm font-medium transition-all border', createForm.durationMinutes === val ? 'bg-emerald-600 border-emerald-500 text-white shadow-md' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20')}>{lbl}</button>
              ))}
            </div>
            <input type="number" min="1" value={createForm.durationMinutes} onChange={ev => setCreateForm(p => ({...p, durationMinutes: ev.target.value}))} placeholder="Or enter custom minutes..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500/60 outline-none placeholder:text-slate-600" />
          </div>

          <div className="border-t border-slate-800 pt-6">
            <p className="text-xs font-semibold text-emerald-400 mb-4 flex items-center gap-2"><Clock className="w-3 h-3" />Launch Timing</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button type="button" onClick={() => setCreateForm(p => ({ ...p, startMode: 'now', startAt: '' }))} className={clsx('py-2.5 rounded-xl text-sm font-medium border transition-all', createForm.startMode === 'now' ? 'bg-emerald-600 border-emerald-500 text-white shadow-md' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white')}>
                Go live now
              </button>
              <button type="button" onClick={() => setCreateForm(p => ({ ...p, startMode: 'scheduled', startAt: p.startAt || formatDateTimeLocal(Date.now() + 10 * 60_000) }))} className={clsx('py-2.5 rounded-xl text-sm font-medium border transition-all', createForm.startMode === 'scheduled' ? 'bg-violet-600 border-violet-500 text-white shadow-md' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white')}>
                Schedule auction
              </button>
            </div>
            {createForm.startMode === 'scheduled' && (
              <div className="space-y-3">
                <label className="text-xs font-medium text-slate-400">Start date & time</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="date"
                    value={selectedScheduleDate}
                    min={minimumScheduleDate}
                    onChange={ev => {
                      const nextDate = ev.target.value;
                      setCreateForm(p => ({
                        ...p,
                        startAt: nextDate
                          ? combineLocalDateTime(nextDate, p.startAt ? p.startAt.slice(11, 16) : minimumScheduleTime)
                          : '',
                      }));
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-violet-500/60 outline-none"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={selectedTime12.hour}
                      onChange={ev => updateScheduleTime({ hour: ev.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:border-violet-500/60 outline-none cursor-pointer"
                    >
                      {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(hour => (
                        <option key={hour} value={hour}>{hour}</option>
                      ))}
                    </select>
                    <select
                      value={selectedTime12.minute}
                      onChange={ev => updateScheduleTime({ minute: ev.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:border-violet-500/60 outline-none cursor-pointer"
                    >
                      {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(minute => (
                        <option key={minute} value={minute}>{minute}</option>
                      ))}
                    </select>
                    <select
                      value={selectedTime12.period}
                      onChange={ev => updateScheduleTime({ period: ev.target.value as 'AM' | 'PM' })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:border-violet-500/60 outline-none cursor-pointer"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">Earliest start: {formatReadableLocalDateTime(Date.now() + 60_000)}{selectedScheduleDate === minimumScheduleDate ? ` · Minimum time today: ${minimumTime12.hour}:${minimumTime12.minute} ${minimumTime12.period}` : ''}</p>
                <p className="text-xs text-slate-600">Your auction will stay in Upcoming mode until this time.</p>
              </div>
            )}
          </div>

          {/* Seller tip */}
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl px-4 py-3 flex items-start gap-3">
            <Star className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-300/60 leading-relaxed">Your listing goes <span className="text-emerald-400 font-medium">live instantly</span>. Buyers from across the platform will see it and place bids in real time. You get notified when your auction closes.</p>
          </div>

          <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3.5 rounded-xl transition-all mt-2 shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 text-sm active:scale-[0.98]">
            <Tag className="w-4 h-4" />List Product — Go Live
          </button>
          </>
            );
          })()}
        </form>
      </div>
    </div>
  );

  if (view === 'lobby') {
    return (
      <div className="min-h-screen bg-[#09090f] text-slate-100 font-sans relative overflow-hidden">
        {/* Ambient background */}
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-[-20%] left-[-10%] w-[55%] h-[55%] bg-violet-700/8 rounded-full blur-[160px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-fuchsia-700/6 rounded-full blur-[160px]" />
          <div className="absolute top-[40%] right-[20%] w-[35%] h-[35%] bg-indigo-700/5 rounded-full blur-[120px]" />
        </div>
        <Toasts /><ProfileModal /><AddressModal />{CreateAuctionModal()}
        <header className="border-b border-white/[0.06] bg-[#09090f]/95 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <h1 className="text-sm sm:text-[17px] font-bold tracking-tight text-white" style={{fontFamily:"'Space Grotesk', sans-serif"}}>UltraBid Live</h1>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-3">
              <div className="relative">
                <button onClick={() => setShowNotifications(v => !v)} className="relative p-2 bg-white/5 border border-white/10 rounded-lg hover:border-white/20 transition-all">
                  <Bell className="w-4 h-4 text-slate-400" />
                  {notifications.filter(n => !n.read).length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-fuchsia-500 rounded-full text-[9px] font-black text-white flex items-center justify-center">{Math.min(9, notifications.filter(n => !n.read).length)}</span>
                  )}
                </button>
                {showNotifications && (
                  <div className="absolute right-0 top-11 w-[calc(100vw-1.5rem)] sm:w-80 max-w-80 bg-[#12101f] border border-white/10 rounded-xl shadow-2xl z-[200] overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/8 flex justify-between items-center">
                      <div>
                        <p className="text-sm font-semibold text-white">Notifications</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{browserAlertsEnabled ? 'Browser alerts enabled' : 'Enable browser alerts for desktop popups'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!browserAlertsEnabled && <button onClick={requestBrowserAlerts} className="text-[10px] px-2 py-1 rounded-lg bg-violet-500/15 border border-violet-500/20 text-violet-300 hover:bg-violet-500/25">Enable alerts</button>}
                        <button onClick={() => setNotifications(prev => prev.map(n => ({...n, read: true})))} className="text-xs text-violet-400 hover:text-violet-300 font-medium">Mark all read</button>
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="text-center text-slate-500 text-sm py-8">No notifications yet</p>
                      ) : notifications.map(n => (
                        <div key={n.id} onClick={() => setNotifications(prev => prev.map(x => x.id === n.id ? {...x, read: true} : x))} className={clsx('p-3 border-b border-slate-800/50 cursor-pointer hover:bg-slate-800/50 transition-all', !n.read && 'bg-violet-600/5')}>
                          <p className={clsx('text-xs font-medium leading-snug', n.type === 'outbid' ? 'text-red-400' : n.type === 'win' ? 'text-yellow-400' : 'text-slate-300')}>{n.message}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-[9px] text-slate-500">{new Date(n.timestamp).toLocaleTimeString()}</p>
                            {!n.read && <span className="w-1.5 h-1.5 bg-violet-500 rounded-full"></span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button onClick={() => setShowCreateAuction(true)} className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg font-medium text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 transition-all shadow-md shadow-emerald-500/20"><Tag className="w-3.5 h-3.5" /><span className="hidden xs:inline">Sell</span></button>
              <button onClick={loadProfile} className="flex items-center gap-2 rounded-full px-2 sm:px-3 py-1.5 bg-white/5 border border-white/10 hover:border-white/20 transition-all">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white font-semibold flex-shrink-0" style={{ background: myUser?.username ? userColor(myUser.username) : '#7c3aed' }}>{myUser?.username?.[0]?.toUpperCase()}</div>
                <div className="hidden sm:block text-left leading-tight">
                  <p className="text-sm font-medium text-slate-300">{myUser?.username}</p>
                  {myUser?.email && <p className="text-[11px] text-slate-500">{myUser.email}</p>}
                </div>
              </button>
              <button onClick={handleLogout} className="text-slate-500 hover:text-slate-300 text-xs sm:text-sm font-medium transition-colors px-1 sm:px-2 hidden sm:block">Sign out</button>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6 gap-2">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight" style={{fontFamily:"'Space Grotesk', sans-serif"}}>Live Auctions</h2>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">{lobbyAuctions.length} auction{lobbyAuctions.length !== 1 ? 's' : ''} available</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none flex-shrink-0">
              <button onClick={() => { setLobbyTab('all'); setLobbyFilter('all'); }} className={clsx('px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-medium text-xs sm:text-sm transition-all border whitespace-nowrap', lobbyTab === 'all' && lobbyFilter === 'all' ? 'bg-violet-600 border-violet-500 text-white shadow-md' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20')}>All</button>
              <button onClick={() => { setLobbyTab('watchlist'); setLobbyFilter('watchlist'); }} className={clsx('px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-medium text-xs sm:text-sm transition-all border flex items-center gap-1.5 whitespace-nowrap', lobbyTab === 'watchlist' ? 'bg-yellow-500 border-yellow-400 text-slate-950 shadow-md' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white')}><Star className="w-3.5 h-3.5" /> Watchlist {watchlist.length > 0 && <span className={clsx('rounded-full px-1.5 text-xs font-semibold', lobbyTab === 'watchlist' ? 'bg-yellow-900/40 text-yellow-950' : 'bg-yellow-500/15 text-yellow-400')}>{watchlist.length}</span>}</button>
              <button onClick={() => { setLobbyTab('all'); setLobbyFilter('mine'); }} className={clsx('px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-medium text-xs sm:text-sm transition-all border flex items-center gap-1.5 whitespace-nowrap', lobbyFilter === 'mine' ? 'bg-emerald-600 border-emerald-500 text-white shadow-md' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white')}><ListChecks className="w-3.5 h-3.5" /> My Listings {lobbyAuctions.filter(a=>a.createdBy===myUser?.username).length > 0 && <span className={clsx('rounded-full px-1.5 text-xs font-semibold', lobbyFilter === 'mine' ? 'bg-white/20 text-white' : 'bg-emerald-500/15 text-emerald-400')}>{lobbyAuctions.filter(a=>a.createdBy===myUser?.username).length}</span>}</button>
            </div>
          </div>

          {/* Search + Category Filter */}
          <div className="flex flex-col gap-3 mb-5">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search auctions..." className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-slate-600 focus:border-violet-500/60 focus:bg-violet-500/5 outline-none transition-all" />
                {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-700 rounded-lg transition-all text-slate-400 hover:text-white"><X className="w-3.5 h-3.5" /></button>}
              </div>
              <div className="flex gap-2">
                <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-violet-500/60 outline-none cursor-pointer flex-1 sm:flex-initial font-medium">
                  <option value="newest">Sort: Newest</option>
                  <option value="bids">Sort: Most Bids</option>
                  <option value="ending">Sort: Ending Soon</option>
                  <option value="price_low">Sort: Price ↑</option>
                  <option value="price_high">Sort: Price ↓</option>
                </select>
                <button onClick={saveCurrentSearch} className="inline-flex items-center justify-center gap-2 rounded-lg border border-violet-500/25 bg-violet-500/10 px-3 py-2.5 text-sm font-medium text-violet-300 hover:bg-violet-500/20 flex-shrink-0 whitespace-nowrap">
                  <Star className="w-4 h-4" /><span className="hidden xs:inline">Save search</span>
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
              {['All','General','Electronics','Antiques','Art','Jewelry','Vehicles','Collectibles'].map(cat => (
                <button key={cat} onClick={() => setCategoryFilter(cat)} className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1', categoryFilter === cat ? 'bg-violet-600/90 text-white shadow-md' : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:border-white/20')}>
                  <span>{CAT_EMOJIS[cat]}</span>{cat}
                </button>
              ))}
            </div>
          </div>

          {(savedSearches.length > 0 || recommendations.length > 0) && (
            <div className="mb-6 space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-[1.15fr,1.85fr] gap-4">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Saved searches</p>
                      <p className="text-[11px] text-slate-500 mt-1">Reuse filters in one click.</p>
                    </div>
                    <span className="text-[11px] text-slate-500">{savedSearches.length}/12</span>
                  </div>
                  {savedSearches.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {savedSearches.slice(0, 8).map(search => (
                        <div key={search.id} className="group flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2">
                          <button onClick={() => applySavedSearch(search)} className="text-left">
                            <p className="text-xs font-medium text-white">{search.label}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{[search.query || 'Any keyword', search.category && search.category !== 'All' ? search.category : '', search.filter && search.filter !== 'all' ? search.filter.replace(/_/g, ' ') : ''].filter(Boolean).join(' · ')}</p>
                          </button>
                          <div className="flex items-center gap-1 ml-1">
                            {search.notificationsEnabled && <Bell className="w-3 h-3 text-amber-300" />}
                            <button onClick={() => deleteSavedSearch(search.id)} className="rounded-lg p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-5 text-center">
                      <p className="text-sm font-medium text-white">No saved searches yet</p>
                      <p className="text-[11px] text-slate-500 mt-1">Set a keyword or category and save it for instant reuse.</p>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-blue-500/10 via-violet-500/10 to-transparent p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Smart recommendations</p>
                      <p className="text-[11px] text-slate-500 mt-1">Based on bids, purchases, and saved searches.</p>
                    </div>
                    <button onClick={() => void loadRecommendations()} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-medium text-slate-300 hover:bg-white/10"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
                  </div>
                  {recommendations.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {recommendations.slice(0, 3).map(auction => (
                        <button key={auction.id} onClick={() => joinAuction(auction.id)} className="text-left rounded-2xl border border-white/10 bg-slate-950/50 p-3 hover:bg-slate-900/70 transition-all">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{auction.itemTitle}</p>
                              <p className="text-[11px] text-slate-500 mt-1">{auction.category} · {auction.status}</p>
                            </div>
                            <span className="rounded-full bg-sky-500/15 px-2 py-1 text-[10px] font-semibold text-sky-300">{auction.recommendationScore} pts</span>
                          </div>
                          <p className="text-[11px] text-sky-300 mt-3">{auction.recommendationReason}</p>
                          {auction.recommendationReasons && auction.recommendationReasons.length > 1 && <p className="text-[10px] text-slate-500 mt-1">{auction.recommendationReasons.slice(1).join(' · ')}</p>}
                          <div className="mt-4 flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-white">₹{auction.currentBid.toLocaleString()}</span>
                            <span className="text-slate-400">{auction.bidCount} bids</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/30 px-4 py-6 text-center">
                      <p className="text-sm font-medium text-white">Recommendations will appear here</p>
                      <p className="text-[11px] text-slate-500 mt-1">Bid on items or save searches to train your discovery feed.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Sell Your Product Hero Banner */}
          <div className="mb-6 rounded-2xl overflow-hidden" style={{background:'linear-gradient(135deg, rgba(6,45,30,0.8) 0%, rgba(5,30,25,0.7) 100%)', border:'1px solid rgba(16,185,129,0.15)'}}>
            <div className="p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md shadow-emerald-500/20"><Tag className="w-5 h-5 text-white" /></div>
                <div>
                  <h3 className="font-semibold text-white text-sm">Have something to sell?</h3>
                  <p className="text-emerald-400/60 text-xs mt-0.5">List it as a live auction — buyers bid in real time</p>
                </div>
              </div>
              <button onClick={() => setShowCreateAuction(true)} className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5 py-2 rounded-lg text-sm transition-all flex items-center gap-2 shadow-md shadow-emerald-500/15 w-full sm:w-auto justify-center"><Plus className="w-4 h-4" /> Start Auction</button>
            </div>
          </div>

          {/* Stats dashboard */}
          <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3 mb-6">
            {[
              { icon: <TrendingUp className="w-4 h-4" />, col: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/40', val: lobbyAuctions.filter(a=>a.status==='Active').length, label: 'Live Now', key: 'active' },
              { icon: <Timer className="w-4 h-4" />, col: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/40', val: lobbyAuctions.filter(a=>a.status==='Upcoming').length, label: 'Upcoming', key: 'upcoming' },
              { icon: <BarChart2 className="w-4 h-4" />, col: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/40', val: lobbyAuctions.reduce((s,a)=>s+a.bidCount,0), label: 'Total Bids', key: 'all' },
              { icon: <Clock className="w-4 h-4" />, col: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/40', val: lobbyAuctions.filter(a=>a.status==='Active'&&(a.endTime-lobbyNow)<60000).length, label: 'Ending Soon', key: 'ending_soon' },
              { icon: <Trophy className="w-4 h-4" />, col: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/40', val: lobbyAuctions.filter(a=>a.status==='Closed').length, label: 'Ended', key: 'ended' },
              { icon: <ShoppingCart className="w-4 h-4" />, col: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', val: lobbyAuctions.filter(a=>a.buyNowPrice&&a.status==='Active').length, label: 'Buy Now', key: 'buy_now' },
              { icon: <Star className="w-4 h-4" />, col: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/40', val: watchlist.length, label: 'Watchlist', key: 'watchlist' },
            ].map((s, i) => {
              const isActive = lobbyFilter === s.key;
              return (
              <button key={i} onClick={() => { setLobbyFilter(s.key as typeof lobbyFilter); if (s.key === 'watchlist') setLobbyTab('watchlist'); else setLobbyTab('all'); }} className={clsx('bg-white/[0.04] border rounded-xl p-2 sm:p-3 flex items-center gap-1.5 sm:gap-2.5 transition-all cursor-pointer w-full text-left hover:bg-white/[0.07]', isActive ? [s.border, 'ring-1'] : 'border-white/[0.07] hover:border-white/15')}>
                <div className={clsx('w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center flex-shrink-0', s.col, s.bg)}>{s.icon}</div>
                <div><p className={clsx('text-base sm:text-xl font-bold tabular-nums leading-tight', s.col)}>{s.val}</p><p className="text-[9px] sm:text-[10px] text-slate-500 font-medium mt-0.5 truncate">{s.label}</p></div>
              </button>
            );})}
          </div>
          {(() => {
            const filteredAuctions = lobbyAuctions.filter(a => {
              const matchSearch = !searchQuery.trim() || a.itemTitle.toLowerCase().includes(searchQuery.toLowerCase());
              const matchCat = categoryFilter === 'All' || a.category === categoryFilter;
              const matchWatchlist = lobbyTab === 'all' || watchlist.includes(a.id);
              let matchFilter = true;
              if (lobbyFilter === 'active') matchFilter = a.status === 'Active';
              else if (lobbyFilter === 'upcoming') matchFilter = a.status === 'Upcoming';
              else if (lobbyFilter === 'ending_soon') matchFilter = a.status === 'Active' && (a.endTime - lobbyNow) > 0 && (a.endTime - lobbyNow) < 60000;
              else if (lobbyFilter === 'ended') matchFilter = a.status === 'Closed';
              else if (lobbyFilter === 'buy_now') matchFilter = !!a.buyNowPrice && a.status === 'Active';
              else if (lobbyFilter === 'watchlist') matchFilter = watchlist.includes(a.id);
              else if (lobbyFilter === 'mine') matchFilter = a.createdBy === myUser?.username;
              return matchSearch && matchCat && matchWatchlist && matchFilter;
            }).sort((a, b) => {
              if (sortBy === 'bids') return b.bidCount - a.bidCount;
              if (sortBy === 'ending') return (a.endTime - b.endTime);
              if (sortBy === 'price_low') return a.currentBid - b.currentBid;
              if (sortBy === 'price_high') return b.currentBid - a.currentBid;
              return b.endTime - a.endTime; // newest = latest endTime
            });
            // Featured auction: hottest active auction (most bids)
            const featuredAuction = !searchQuery && categoryFilter === 'All' && lobbyFilter === 'all' && lobbyTab === 'all'
              ? filteredAuctions.find(a => a.status === 'Active' && a.moderationStatus === 'Approved' && a.bidCount >= 1) || filteredAuctions.find(a => a.status === 'Active' && a.moderationStatus === 'Approved') || null
              : null;
            const gridAuctions = featuredAuction ? filteredAuctions.filter(a => a.id !== featuredAuction.id) : filteredAuctions;
            return filteredAuctions.length > 0 ? (
            <div className="space-y-8">

              {/* ── FEATURED HERO CARD (The Curator style) ─────────────────── */}
              {featuredAuction && (() => {
                const fa = featuredAuction;
                const faEndsIn = fa.endTime - lobbyNow;
                const faStartsIn = (fa.startTime || lobbyNow) - lobbyNow;
                const faMins = Math.max(0, Math.floor(faEndsIn / 60000));
                const faSecs = Math.max(0, Math.floor((faEndsIn % 60000) / 1000));
                const faEndingSoon = fa.status === 'Active' && faEndsIn > 0 && faEndsIn < 60000;
                const moderationMeta = moderationPill(fa.moderationStatus);
                const sellerTrustMeta = trustPill(fa.sellerTrustLabel, fa.sellerVerified);
                const ModerationIcon = moderationMeta.icon;
                const TrustIcon = sellerTrustMeta.icon;
                return (
                  <div className="rounded-3xl overflow-hidden border border-white/[0.07] bg-[#0f0f1a] shadow-2xl shadow-black/40">
                    {/* Hero image */}
                    <div className="relative h-40 xs:h-44 sm:h-56 md:h-72 overflow-hidden">
                      {fa.itemImage ? (
                        <img src={fa.itemImage} className="w-full h-full object-cover" alt={fa.itemTitle} />
                      ) : (
                        <div className="w-full h-full bg-slate-900 flex items-center justify-center"><TrendingUp className="w-16 h-16 text-slate-800" /></div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f1a] via-[#0f0f1a]/30 to-transparent" />
                      {/* Live badge */}
                      <div className="absolute top-4 left-4 flex gap-2">
                        <span className={clsx('flex items-center gap-1.5 backdrop-blur-sm text-white text-[10px] font-semibold px-3 py-1.5 rounded-full shadow-md', fa.status === 'Upcoming' ? 'bg-violet-500/90' : 'bg-green-500/90')}>
                          <span className={clsx('w-1.5 h-1.5 rounded-full', fa.status === 'Upcoming' ? 'bg-white' : 'bg-white animate-pulse')} />{fa.status === 'Upcoming' ? 'UPCOMING AUCTION' : 'LIVE AUCTION'}
                        </span>
                        {fa.status === 'Active' && fa.bidCount >= 3 && <span className="bg-orange-500/90 backdrop-blur-sm text-white text-[10px] font-semibold px-3 py-1.5 rounded-full">🔥 HOT</span>}
                        <span className={clsx('flex items-center gap-1.5 text-[10px] font-semibold px-3 py-1.5 rounded-full backdrop-blur-sm', moderationMeta.className)}><ModerationIcon className="w-3 h-3" />{moderationMeta.label}</span>
                      </div>
                      {/* Watchlist */}
                      <button onClick={e => { e.stopPropagation(); toggleWatchlist(fa.id); }} className="absolute top-4 right-4 w-9 h-9 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-black/60 transition-all">
                        <Heart className={clsx('w-4 h-4 transition-all', watchlist.includes(fa.id) ? 'fill-red-400 text-red-400' : 'text-white/70')} />
                      </button>
                    </div>
                    {/* Details */}
                    <div className="p-4 sm:p-6">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="text-xs text-slate-500">{fa.category}{fa.createdBy ? ` · by ${fa.createdBy}` : ''}</p>
                        <span className={clsx('inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full', sellerTrustMeta.className)}><TrustIcon className="w-3 h-3" />{sellerTrustMeta.label}</span>
                      </div>
                      <h3 className="text-xl sm:text-2xl font-bold text-white leading-tight mb-3 sm:mb-5" style={{fontFamily:"'Space Grotesk',sans-serif"}}>{fa.itemTitle}</h3>
                      {fa.description && <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-3 sm:mb-5 line-clamp-2">{fa.description}</p>}
                      <div className="flex flex-wrap items-end gap-3 sm:gap-8 mb-5">
                        <div>
                          <p className="text-[10px] text-slate-500 font-medium tracking-widest uppercase mb-0.5">Current Bid</p>
                          <p className="text-2xl sm:text-3xl font-bold text-white tabular-nums" style={{fontFamily:"'Space Grotesk',sans-serif"}}>₹{fa.currentBid.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 font-medium tracking-widest uppercase mb-0.5">{fa.status === 'Upcoming' ? 'Starts In' : 'Ends In'}</p>
                          <p className={clsx('text-xl sm:text-2xl font-bold tabular-nums', fa.status === 'Upcoming' ? 'text-violet-400' : faEndingSoon ? 'text-red-400 animate-pulse' : 'text-emerald-400')} style={{fontFamily:"'Space Grotesk',sans-serif"}}>
                            {fa.status === 'Upcoming'
                              ? `${String(Math.floor(Math.max(0, faStartsIn) / 3600000)).padStart(2,'0')}h ${String(Math.floor((Math.max(0, faStartsIn) % 3600000) / 60000)).padStart(2,'0')}m`
                              : faEndsIn > 0 ? `${String(Math.floor(faMins/60)).padStart(2,'0')}h ${String(faMins%60).padStart(2,'0')}m ${String(faSecs).padStart(2,'0')}s` : 'Ended'}
                          </p>
                        </div>
                        <div className="ml-auto text-right">
                          <p className="text-[10px] text-slate-500 mb-0.5">Bids</p>
                          <p className="text-xl font-bold text-violet-400">{fa.bidCount}</p>
                        </div>
                      </div>
                      {/* Progress bar */}
                      {fa.startingPrice > 0 && fa.currentBid > fa.startingPrice && (
                        <div className="mb-5">
                          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all duration-500"
                              style={{width:`${Math.min(100, Math.round(((fa.currentBid - fa.startingPrice)/fa.startingPrice)*100))}%`}} />
                          </div>
                          <p className="text-[10px] text-emerald-400 mt-1">↑ {Math.round(((fa.currentBid - fa.startingPrice)/fa.startingPrice)*100)}% above starting price</p>
                        </div>
                      )}
                      {fa.highestBidderId === myUser?.username && (
                        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-2 mb-4">
                          <Trophy className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                          <p className="text-sm font-medium text-yellow-400">You're currently winning this auction!</p>
                        </div>
                      )}
                      <button onClick={() => joinAuction(fa.id)} className={clsx('w-full text-white font-semibold py-3.5 rounded-xl text-sm transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2', fa.moderationStatus === 'Approved' ? 'bg-violet-600 hover:bg-violet-500 shadow-violet-500/20' : 'bg-slate-700 hover:bg-slate-600 shadow-black/20')}>
                        <Zap className="w-4 h-4" /> {fa.moderationStatus === 'Approved' ? (fa.status === 'Upcoming' ? 'Preview Auction' : 'Place a Bid') : 'View Trust Details'}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* ── SECTION LABEL ──────────────────────────────────────────── */}
              {gridAuctions.length > 0 && (
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-400">{featuredAuction ? 'More Auctions' : 'All Auctions'}</h3>
                  <span className="text-xs text-slate-600">{gridAuctions.length} item{gridAuctions.length !== 1 ? 's' : ''}</span>
                </div>
              )}

              {/* ── AUCTION CARDS GRID ─────────────────────────────────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {gridAuctions.map(auction => {
                  const catColor = CAT_COLORS[auction.category] || '#3b82f6';
                  const isEndingSoon = auction.status === 'Active' && (auction.endTime - lobbyNow) > 0 && (auction.endTime - lobbyNow) < 60000;
                  const isUpcomingCard = auction.status === 'Upcoming';
                  const isHot = auction.bidCount >= 3 && auction.status === 'Active';
                  const isNew = !!auction.createdAt && (lobbyNow - auction.createdAt) < 4 * 60 * 1000 && auction.status === 'Active';
                  const timeLeft = auction.endTime - lobbyNow;
                  const startsIn = (auction.startTime || lobbyNow) - lobbyNow;
                  const tMins = Math.max(0, Math.floor(timeLeft / 60000));
                  const tSecs = Math.max(0, Math.floor((timeLeft % 60000) / 1000));
                  const priceRise = auction.startingPrice > 0 ? Math.round(((auction.currentBid - auction.startingPrice) / auction.startingPrice) * 100) : 0;
                  const isWinning = auction.highestBidderId === myUser?.username && auction.status === 'Active';
                  const moderationMeta = moderationPill(auction.moderationStatus);
                  const sellerTrustMeta = trustPill(auction.sellerTrustLabel, auction.sellerVerified);
                  const ModerationIcon = moderationMeta.icon;
                  const TrustIcon = sellerTrustMeta.icon;
                  return (
                    <div key={auction.id} className={clsx(
                      'bg-[#0f0f1a] border rounded-2xl overflow-hidden transition-all duration-200 group cursor-pointer',
                      isEndingSoon ? 'border-red-500/40 shadow-red-500/10 shadow-lg' : isWinning ? 'border-yellow-500/30' : 'border-white/[0.06] hover:border-white/15'
                    )}>
                      {/* Card image */}
                      <div className="relative aspect-[16/10] bg-slate-950 overflow-hidden">
                        {(auction.itemImages?.[0] || auction.itemImage) ? (
                          <img loading="lazy" src={auction.itemImages?.[0] || auction.itemImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={auction.itemTitle} />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{background: catColor + '15'}}><TrendingUp className="w-6 h-6" style={{color: catColor}} /></div>
                            <p className="text-[10px] text-slate-700">{auction.category}</p>
                          </div>
                        )}
                        {/* Top-left: time badge */}
                        <div className="absolute top-3 left-3 flex gap-1.5">
                          {isUpcomingCard ? (
                            <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-md bg-violet-500/90 text-white">
                              <span className="w-1.5 h-1.5 rounded-full bg-white" />STARTS IN {Math.max(0, Math.floor(startsIn / 60000))}M
                            </span>
                          ) : auction.status === 'Active' && timeLeft > 0 ? (
                            <span className={clsx('flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-md', isEndingSoon ? 'bg-red-500/90 text-white animate-pulse' : 'bg-black/60 text-white/90')}>
                              <span className={clsx('w-1.5 h-1.5 rounded-full', isEndingSoon ? 'bg-white animate-ping' : 'bg-green-400')} />
                              {tMins}M {String(tSecs).padStart(2,'0')}S LEFT
                            </span>
                          ) : auction.status !== 'Active' ? (
                            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-slate-800/80 text-slate-400 backdrop-blur-md">ENDED</span>
                          ) : null}
                          {isNew && <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-violet-500/90 text-white backdrop-blur-md">NEW</span>}
                          <span className={clsx('flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-md', moderationMeta.className)}><ModerationIcon className="w-3 h-3" />{auction.moderationStatus === 'Approved' ? 'TRUSTED' : auction.moderationStatus?.toUpperCase()}</span>
                        </div>
                        {/* Top-right: heart */}
                        <button onClick={e => { e.stopPropagation(); toggleWatchlist(auction.id); }} className="absolute top-3 right-3 w-8 h-8 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-black/70 transition-all group/heart">
                          <Heart className={clsx('w-3.5 h-3.5 transition-all group-hover/heart:scale-110', watchlist.includes(auction.id) ? 'fill-red-400 text-red-400' : 'text-white/60')} />
                        </button>
                        {/* Hot badge inside image bottom */}
                        {isHot && (
                          <div className="absolute bottom-3 left-3">
                            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-orange-500/90 text-white backdrop-blur-md">🔥 HOT</span>
                          </div>
                        )}
                        {auction.itemImages && auction.itemImages.length > 1 && (
                          <div className="absolute bottom-3 right-3">
                            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-black/60 text-white/90 backdrop-blur-md">{auction.itemImages.length} photos</span>
                          </div>
                        )}
                      </div>

                      {/* Card body */}
                      <div className="p-4">
                        {/* Seller / category row */}
                        <div className="flex items-center gap-2 mb-2">
                          {auction.createdBy && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0" style={{background: userColor(auction.createdBy)}}>{auction.createdBy[0]?.toUpperCase()}</div>
                              <span className="text-[11px] text-slate-500 truncate max-w-[100px]">{auction.createdBy}</span>
                            </div>
                          )}
                          <span className={clsx('text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1', sellerTrustMeta.className)}><TrustIcon className="w-3 h-3" />{sellerTrustMeta.label}</span>
                          <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full" style={{background: catColor + '15', color: catColor}}>{auction.category}</span>
                        </div>

                        {/* Title */}
                        <h3 className="font-semibold text-white text-sm leading-snug line-clamp-2 mb-3" style={{fontFamily:"'Space Grotesk',sans-serif"}}>{auction.itemTitle}</h3>

                        {/* Price progress bar */}
                        {priceRise > 0 && (
                          <div className="mb-3">
                            <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700" style={{width:`${Math.min(100,priceRise)}%`, background: catColor}} />
                            </div>
                          </div>
                        )}

                        {/* Winning strip */}
                        {isWinning && (
                          <div className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-1.5 mb-3">
                            <Trophy className="w-3 h-3 text-yellow-400" /><p className="text-[11px] font-medium text-yellow-400">You're winning!</p>
                          </div>
                        )}

                        {/* Bid row + button */}
                        <div className="flex items-end justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[9px] text-slate-500 font-medium tracking-widest uppercase">{isUpcomingCard ? 'Starting Bid' : 'Current Bid'}</p>
                            <p className="text-lg font-bold text-white tabular-nums leading-tight" style={{fontFamily:"'Space Grotesk',sans-serif"}}>₹{auction.currentBid?.toLocaleString()}</p>
                            {priceRise > 0 && <p className="text-[10px] text-emerald-400">↑ {priceRise}%</p>}
                            {auction.buyNowPrice && auction.status === 'Active' && (
                              <p className="text-[10px] text-sky-400 mt-0.5 flex items-center gap-1"><ShoppingCart className="w-3 h-3" />₹{auction.buyNowPrice.toLocaleString()}</p>
                            )}
                          </div>
                          <button
                            onClick={() => joinAuction(auction.id)}
                            className={clsx('flex-shrink-0 font-semibold px-4 py-2 rounded-lg text-xs transition-all active:scale-95',
                              auction.status === 'Active' || auction.status === 'Upcoming' ? 'text-white hover:brightness-110 shadow-md' : 'bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300'
                            )}
                            style={auction.status === 'Active' || auction.status === 'Upcoming' ? {background: auction.moderationStatus === 'Approved' ? catColor : '#475569', boxShadow: auction.moderationStatus === 'Approved' ? `0 4px 12px ${catColor}30` : undefined} : undefined}
                          >
                            {auction.moderationStatus === 'Approved' ? (auction.status === 'Upcoming' ? 'Preview' : auction.status === 'Active' ? 'Bid Now' : 'Results') : 'View'}
                          </button>
                        </div>
                        {auction.moderationStatus !== 'Approved' && auction.moderationNotes && <p className="mt-2 text-[10px] text-amber-300/80">{auction.moderationNotes}</p>}

                        {/* Ended: show winner */}
                        {auction.status !== 'Active' && auction.highestBidderId && auction.highestBidderId !== 'None' && (
                          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-white/[0.05]">
                            <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0" style={{background: userColor(auction.highestBidderId)}}>{auction.highestBidderId[0]?.toUpperCase()}</div>
                            <span className="text-[10px] text-slate-500">Won by </span>
                            <span className="text-[10px] text-yellow-400 font-medium truncate">{auction.highestBidderId}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            ) : <div className="text-center py-20">
              <div className="w-20 h-20 rounded-3xl bg-violet-600/10 border border-violet-600/20 flex items-center justify-center mx-auto mb-5"><TrendingUp className="w-10 h-10 text-violet-500" /></div>
              <h3 className="text-xl font-bold text-white mb-2" style={{fontFamily:"'Space Grotesk', sans-serif"}}>No Auctions Live</h3>
              <p className="text-slate-500 text-sm mb-6">{searchQuery || categoryFilter !== 'All' ? 'No auctions match your filters.' : 'Be the first to start a live auction.'}</p>
              {(!searchQuery && categoryFilter === 'All') && <button onClick={() => setShowCreateAuction(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-all active:scale-95 flex items-center gap-2 mx-auto shadow-md shadow-emerald-500/20"><Tag className="w-4 h-4" /> Start Auction</button>}
            </div>;
          })()}
        </main>
      </div>
    );
  }

  // ─── AUCTION ROOM ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#09090f] text-slate-100 font-sans selection:bg-violet-500/30 overflow-x-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-violet-700/7 rounded-full blur-[160px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-fuchsia-700/5 rounded-full blur-[160px]" />
        <div className="absolute top-[40%] right-[20%] w-[30%] h-[30%] bg-indigo-700/4 rounded-full blur-[120px]" />
      </div>
      <Toasts />
      <ProfileModal />
      <AddressModal />
      {CreateAuctionModal()}

      {/* Winner Overlay */}
      {winnerOverlay && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-500">
          <div className="bg-gradient-to-br from-yellow-500 to-amber-600 text-slate-950 rounded-3xl p-6 sm:p-10 shadow-2xl max-w-sm w-full text-center relative">
            <button onClick={() => setWinnerOverlay(null)} className="absolute top-4 right-4 p-2 bg-black/20 rounded-xl"><X className="w-4 h-4" /></button>
            <Trophy className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4" />
            <p className="text-xs font-semibold opacity-70 mb-2 uppercase tracking-wide">Auction Closed — Winner</p>
            <p className="text-2xl sm:text-3xl font-bold" style={{fontFamily:"'Space Grotesk',sans-serif"}}>{winnerOverlay.winner}</p>
            <p className="text-3xl sm:text-5xl font-bold tabular-nums mt-3" style={{fontFamily:"'Space Grotesk',sans-serif"}}>₹{winnerOverlay.amount?.toLocaleString()}</p>
            {winnerOverlay.winner === myUser?.username && (
              paidAuctions.has(winnerOverlay.auctionId) ? (
                <div className="mt-5 space-y-3">
                  <div className="bg-green-600/90 rounded-2xl py-3 px-5 flex items-center justify-center gap-2">
                    <Check className="w-5 h-5" />
                    <span className="text-sm font-semibold">Payment Complete!</span>
                  </div>
                  {orders.find(order => order.auctionId === winnerOverlay.auctionId)?.status === 'paid-awaiting-address' && (
                    <button onClick={() => { const order = orders.find(current => current.auctionId === winnerOverlay.auctionId); setAddressAuctionId(winnerOverlay.auctionId); setAddressForm(order?.shippingAddress || DEFAULT_ORDER_ADDRESS); setShowAddressModal(true); }} className="w-full bg-slate-950 hover:bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm">
                      Add delivery address
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  <p className="text-xs opacity-70 mb-3">🎉 That's you! Complete your payment to confirm the win.</p>
                  <button
                    onClick={() => handleRazorpayPayment(winnerOverlay.auctionId)}
                    disabled={paymentProcessing}
                    className="w-full bg-slate-950 hover:bg-slate-900 text-white font-semibold py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                  >
                    {paymentProcessing ? (
                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing...</>
                    ) : (
                      <><CreditCard className="w-5 h-5" />Pay ₹{winnerOverlay.amount?.toLocaleString()} Now</>
                    )}
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      )}
      {/* Buy Now Confirmation Modal */}
      {buyNowModal && auctionState.buyNowPrice && (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5 sm:p-8 max-w-sm w-full shadow-2xl text-center">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <ShoppingCart className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2" style={{fontFamily:"'Space Grotesk',sans-serif"}}>Buy Now</h3>
            <p className="text-slate-400 text-sm mb-1">{auctionState.itemTitle}</p>
            <p className="text-4xl font-bold text-emerald-400 tabular-nums mb-6" style={{fontFamily:"'Space Grotesk',sans-serif"}}>₹{auctionState.buyNowPrice.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mb-6">This will instantly close the auction and you will be declared the winner.</p>
            <div className="flex gap-3">
              <button onClick={() => setBuyNowModal(false)} className="flex-1 bg-white/5 hover:bg-white/10 text-white font-medium py-3 rounded-xl text-sm transition-all border border-white/10">Cancel</button>
              <button onClick={confirmBuyNow} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-md shadow-emerald-500/20">Confirm Buy</button>
            </div>
          </div>
        </div>
      )}
      {/* Floating emoji reactions */}
      {reactions.map(r => (
        <div key={r.id} className="fixed bottom-40 z-50 text-3xl pointer-events-none" style={{ left: `${r.x}%`, animation: 'floatUp 3s ease-out forwards' }}>
          {REACTION_EMOJI[r.emoji] || r.emoji}
        </div>
      ))}

      <header className="relative w-full border-b border-white/[0.06] bg-[#09090f]/90 backdrop-blur-xl z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button onClick={() => { if (isBroadcaster) stopBroadcast(); socket.emit('leave_auction', auctionState.auctionId); setView('lobby'); }} className="p-1.5 sm:p-2 hover:bg-white/8 rounded-lg transition-all text-slate-400 hover:text-white flex-shrink-0"><ChevronLeft className="w-5 h-5" /></button>
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-lg flex items-center justify-center shadow-md shadow-violet-500/20 flex-shrink-0">
               <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-[17px] font-bold tracking-tight text-white" style={{fontFamily:"'Space Grotesk', sans-serif"}}>UltraBid Live</h1>
              <p className="text-[10px] text-slate-500 -mt-0.5 truncate max-w-[120px] sm:max-w-[180px]">{auctionState.itemTitle}</p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-semibold tracking-wide text-slate-300">
             {/* Seller badge */}
             {auctionState.status !== 'Loading...' && (() => {
               const isOwner = lobbyAuctions.find(a => a.id === auctionState.auctionId)?.createdBy === myUser?.username ||
                 auctionState.auctionId !== '' && auctionState.highestBidderId === 'None' && isBroadcaster;
               return isOwner ? (
                 <span className="bg-violet-600/20 border border-violet-600/40 text-violet-400 text-xs font-medium px-3 py-1 rounded-full">Your Auction</span>
               ) : null;
             })()}
             <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
                <span className="text-sm">{viewerCount} Watching</span>
             </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
             <div className="relative">
               <button onClick={() => setShowNotifications(v => !v)} className="relative p-2 sm:p-2.5 bg-violet-950/50 rounded-xl border border-violet-900/50 hover:border-violet-500/60 transition-all text-violet-400 hover:text-white">
                 <Bell className="w-4 h-4" />
                 {notifications.filter(n => !n.read).length > 0 && (
                   <span className="absolute -top-1 -right-1 w-4 h-4 bg-fuchsia-500 rounded-full text-[9px] font-black text-white flex items-center justify-center">{Math.min(9, notifications.filter(n => !n.read).length)}</span>
                 )}
               </button>
               {showNotifications && (
                 <div className="absolute right-0 top-12 w-[calc(100vw-1.5rem)] sm:w-80 max-w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-[200] overflow-hidden">
                   <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                     <div>
                       <p className="text-xs font-semibold text-white uppercase tracking-wide">Notifications</p>
                       <p className="text-[10px] text-violet-300/50 mt-0.5">{browserAlertsEnabled ? 'Browser alerts enabled' : 'Enable browser alerts for desktop popups'}</p>
                     </div>
                     <div className="flex items-center gap-2">
                       {!browserAlertsEnabled && <button onClick={requestBrowserAlerts} className="text-[10px] px-2 py-1 rounded-lg bg-violet-500/15 border border-violet-500/20 text-violet-300 font-bold hover:bg-violet-500/25">Enable alerts</button>}
                       <button onClick={() => setNotifications(prev => prev.map(n => ({...n, read: true})))} className="text-[10px] text-violet-400 font-bold hover:text-violet-300">Mark all read</button>
                     </div>
                   </div>
                   <div className="max-h-72 overflow-y-auto custom-scrollbar">
                     {notifications.length === 0 ? (
                       <p className="text-center text-slate-500 text-xs py-8 font-bold">No notifications yet</p>
                     ) : notifications.map(n => (
                       <div key={n.id} onClick={() => setNotifications(prev => prev.map(x => x.id === n.id ? {...x, read: true} : x))} className={clsx('p-3 border-b border-slate-800/50 cursor-pointer hover:bg-slate-800/50 transition-all', !n.read && 'bg-violet-600/5')}>
                         <p className={clsx('text-xs font-bold leading-snug', n.type === 'outbid' ? 'text-red-400' : n.type === 'win' ? 'text-yellow-400' : 'text-slate-300')}>{n.message}</p>
                         <div className="flex items-center gap-2 mt-1">
                           <p className="text-[9px] text-slate-500">{new Date(n.timestamp).toLocaleTimeString()}</p>
                           {!n.read && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>}
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               )}
             </div>
             <button onClick={toggleMute} title={soundMuted ? 'Unmute sounds' : 'Mute sounds'} className="p-2 sm:p-2.5 bg-violet-950/50 rounded-xl border border-violet-900/50 hover:border-violet-500/60 transition-all text-violet-400 hover:text-white">{soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}</button>
             <button onClick={() => { const url = `${window.location.origin}?auction=${auctionState.auctionId}`; navigator.clipboard.writeText(url).then(() => { setCopiedLink(true); addToast('info', 'Auction link copied!'); setTimeout(() => setCopiedLink(false), 2000); }); }} title="Share auction" className="p-2 sm:p-2.5 bg-violet-950/50 rounded-xl border border-violet-900/50 hover:border-violet-500/60 transition-all text-violet-400 hover:text-white">{copiedLink ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}</button>
             <button onClick={loadProfile} className="flex md:hidden items-center justify-center w-8 h-8 rounded-full flex-shrink-0" style={{ background: myUser?.username ? userColor(myUser.username) : '#7c3aed' }}>
                <span className="text-[10px] text-white font-black">{myUser?.username?.[0]?.toUpperCase() || 'U'}</span>
             </button>
             <button onClick={loadProfile} className="hidden md:flex bg-violet-950/60 border border-violet-900/50 rounded-full py-1.5 px-4 items-center gap-3 hover:border-violet-500/60 transition-all">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-black border border-violet-800/50 flex-shrink-0" style={{ background: myUser?.username ? userColor(myUser.username) : '#7c3aed' }}>
                  {myUser?.username?.[0] || 'U'}
                </div>
                <div className="text-left leading-tight">
                  <p className="text-xs font-bold text-violet-200 tracking-wide">{myUser?.username}</p>
                  {myUser?.email && <p className="text-[10px] text-violet-300/70">{myUser.email}</p>}
                </div>
             </button>
             <button onClick={handleLogout} className="hidden sm:block bg-white/5 text-slate-400 px-4 py-1.5 rounded-lg font-medium text-sm hover:text-red-400 hover:bg-red-900/20 border border-white/10 transition-all">
                Sign out
             </button>
          </div>
        </div>
      </header>

      {/* Timer progress bar */}
      {auctionState.status === 'Active' && (
        <div className="w-full h-1 bg-slate-900">
          <div className={clsx('h-full transition-all duration-1000', isUrgent ? 'bg-red-500' : 'bg-violet-600')} style={{ width: `${Math.min(100, (timeRemaining / Math.max(1, auctionTotalDurationRef.current)) * 100)}%` }} />
        </div>
      )}

      {isUpcoming && (
        <div className="w-full bg-violet-600/15 border-b border-violet-500/20">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-3 text-xs">
            <span className="text-violet-300 font-medium">Upcoming auction • starts in {formatTime(startCountdown)}</span>
            <span className="text-violet-400/70">Bidding unlocks automatically at launch time</span>
          </div>
        </div>
      )}

      <main className="relative max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 grid grid-cols-12 gap-3 sm:gap-6 z-10 pb-20 lg:pb-8">
        <div className={clsx("col-span-12 lg:col-span-3 space-y-6", mobileAuctionTab !== 'details' && 'hidden lg:block')}>
           <div className="bg-slate-900/50 backdrop-blur-md border border-violet-900/25 rounded-3xl overflow-hidden shadow-2xl relative group">
              <div className="p-4 sm:p-6 border-b border-slate-800/50 flex justify-between items-start">
                 <div>
                    <h2 className="text-base sm:text-xl font-bold text-white leading-tight" style={{fontFamily:"'Space Grotesk', sans-serif"}}>
                       {auctionState.itemTitle}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Lot #29481-B</p>
                    {auctionState.description && (
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed font-medium">{auctionState.description}</p>
                    )}
                 </div>
                 {isBroadcaster && (
                   <button onClick={() => { setIsEditingItem(true); setEditTitle(auctionState.itemTitle); setEditImage(auctionState.itemImage); }} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
                      <Edit2 className="w-4 h-4" />
                   </button>
                 )}
              </div>

              {isBroadcaster && isEditingItem && (
                <div className="absolute inset-0 bg-slate-950/95 z-50 p-6 flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
                   <h3 className="text-lg font-bold text-white" style={{fontFamily:"'Space Grotesk',sans-serif"}}>Modify Lot</h3>
                   <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-xs text-slate-500 font-medium">Item Name</label>
                        <input type="text" value={editTitle} onChange={(e)=>setEditTitle(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-violet-500/60 outline-none transition-all" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-slate-500 font-medium">Image URL</label>
                        <input type="text" value={editImage} onChange={(e)=>setEditImage(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-violet-500/60 outline-none transition-all font-mono text-xs" />
                      </div>
                   </div>
                   <div className="flex gap-2 mt-auto">
                      <button onClick={handleSaveItemEdit} className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 rounded-xl shadow-md shadow-violet-500/20 transition-all">Save Changes</button>
                      <button onClick={()=>setIsEditingItem(false)} className="px-6 bg-white/5 hover:bg-white/10 text-white font-medium rounded-xl text-sm border border-white/10">Cancel</button>
                   </div>
                </div>
              )}

              <div className="aspect-square bg-slate-950 p-4 border-b border-slate-800/50">
                 <div className="w-full h-full rounded-2xl overflow-hidden relative shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] flex items-center justify-center bg-slate-900">
                    {selectedGalleryImage ? (
                       <img src={selectedGalleryImage} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" alt="Lot" />
                    ) : (
                       <div className="text-slate-700 font-black tracking-widest italic opacity-50">IMAGE PENDING</div>
                    )}
                 </div>
              </div>

              {galleryImages.length > 1 && (
                <div className="px-4 pb-4 border-b border-slate-800/50">
                  <div className="grid grid-cols-5 gap-2">
                    {galleryImages.slice(0, 5).map((img, index) => (
                      <button key={img + index} onClick={() => setSelectedGalleryImage(img)} className={clsx('aspect-square rounded-xl overflow-hidden border transition-all', selectedGalleryImage === img ? 'border-violet-500 ring-1 ring-violet-500/50' : 'border-white/10 hover:border-white/20')}>
                        <img src={img} alt={`gallery-${index}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <p className="text-[10px] text-slate-500 font-medium">Highest Bid</p>
                       <p key={bidFlashKey} className={clsx('text-2xl font-bold tabular-nums', bidFlashKey > 0 ? 'bid-flash' : 'text-violet-400')}>₹{auctionState.currentBid.toLocaleString()}</p>
                    </div>
                    <div className="space-y-1 text-right">
                       <p className="text-[10px] text-slate-500 font-medium">Starting At</p>
                       <p className="text-lg font-semibold text-slate-300">₹{auctionState.startingPrice.toLocaleString()}</p>
                    </div>
                 </div>

                 {/* Reserve price indicator */}
                 {auctionState.reservePrice != null && (
                   <div className={clsx('text-xs font-medium px-3 py-2 rounded-xl flex items-center gap-2', auctionState.currentBid >= auctionState.reservePrice ? 'bg-green-600/20 text-green-400 border border-green-600/30' : 'bg-amber-600/20 text-amber-400 border border-amber-600/30')}>
                     {auctionState.currentBid >= auctionState.reservePrice ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                     {auctionState.currentBid >= auctionState.reservePrice ? 'Reserve Met' : `Reserve Not Met — ₹${auctionState.reservePrice.toLocaleString()}`}
                   </div>
                 )}

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                   <div className={clsx('rounded-xl px-3 py-2.5 flex items-start gap-2', roomModerationMeta.className)}>
                     <RoomModerationIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                     <div>
                       <p className="text-xs font-semibold">{roomModerationMeta.label}</p>
                       {auctionState.moderationNotes && <p className="text-[10px] opacity-80 mt-1">{auctionState.moderationNotes}</p>}
                     </div>
                   </div>
                   <div className={clsx('rounded-xl px-3 py-2.5 flex items-start gap-2', roomTrustMeta.className)}>
                     <RoomTrustIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                     <div>
                       <p className="text-xs font-semibold">{auctionState.sellerTrustLabel}</p>
                       <p className="text-[10px] opacity-80 mt-1">Trust score {auctionState.sellerTrustScore || 0}/100</p>
                     </div>
                   </div>
                 </div>

                 {moderationLocked && (
                   <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                     <p className="text-sm font-semibold text-amber-300">Bidding is locked while this listing is under trust review.</p>
                     <p className="text-[11px] text-amber-200/70 mt-1">You can still inspect the auction details, but bid and Buy Now stay disabled until the seller updates the listing.</p>
                   </div>
                 )}

                 <div className={clsx("bg-slate-950 rounded-2xl p-4 border flex flex-col gap-2 transition-all duration-300", isUrgent ? "border-red-500/80 shadow-[0_0_20px_rgba(239,68,68,0.3)]" : "border-slate-800/50")}>
                    <div className="flex justify-between items-center">
                       <p className={clsx("text-xs font-medium flex items-center gap-1.5", isUrgent ? "text-red-400" : "text-slate-400")}>
                         <Clock className="w-3 h-3" /> Time Remaining
                       </p>
                    </div>
                    <div className={clsx("text-2xl sm:text-3xl font-black font-mono tracking-tighter tabular-nums drop-shadow-md", isUrgent ? "text-red-400 animate-pulse" : "text-white", auctionState.status === 'Closed' ? 'opacity-40' : '')}>
                       {auctionState.status === 'Closed' ? 'ENDED' : formatTime(timeRemaining)}
                    </div>
                    {isUrgent && <p className="text-xs text-red-400 font-medium animate-pulse">Final seconds!</p>}
                 </div>

                 {/* Emoji reactions */}
                 <div className="flex gap-1.5 sm:gap-2 justify-center flex-wrap">
                   {REACTION_KEYS.map(k => (
                     <button key={k} onClick={() => handleReaction(k)} className="text-xl hover:scale-125 transition-transform active:scale-100 bg-slate-800/50 rounded-xl p-2 hover:bg-slate-700/50">{REACTION_EMOJI[k]}</button>
                   ))}
                 </div>

                 {/* Buy Now */}
                 {auctionState.buyNowPrice != null && auctionState.status === 'Active' && (
                   <button onClick={handleBuyNow} disabled={moderationLocked} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900/40 disabled:text-slate-400 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-500/20 disabled:shadow-none">
                     <ShoppingCart className="w-4 h-4" /> Buy Now ₹{auctionState.buyNowPrice.toLocaleString()}
                   </button>
                 )}

                 {isUpcoming && (
                   <div className="w-full bg-violet-500/10 border border-violet-500/20 rounded-2xl p-4 text-center">
                     <p className="text-xs text-violet-300 font-medium">This auction is scheduled.</p>
                     <p className="text-2xl font-bold text-white mt-1 tabular-nums" style={{fontFamily:"'Space Grotesk',sans-serif"}}>{formatTime(startCountdown)}</p>
                     <p className="text-[10px] text-slate-500 mt-1">Bidding and Buy Now will unlock when it goes live.</p>
                   </div>
                 )}

                 {/* Bid increment presets */}
                 <div className="grid grid-cols-4 gap-2">
                   {[100, 500, 1000, 5000].map(inc => (
                     <button key={inc} onClick={() => { const next = (auctionState.currentBid || auctionState.startingPrice) + inc; socket.emit('place_bid', { auctionId: auctionState.auctionId, amount: next }); }} disabled={auctionState.status !== 'Active' || moderationLocked} className="bg-white/5 hover:bg-violet-600 border border-white/10 hover:border-violet-500 text-white font-medium py-2 rounded-lg text-sm transition-all disabled:opacity-30 active:scale-95">
                       +{inc >= 1000 ? `${inc/1000}k` : inc}
                     </button>
                   ))}
                 </div>
                 <p className="text-[10px] text-slate-600 text-center">Quick increment · Min bid: ₹100</p>

                 {/* Auto-Bid Panel */}
                 {auctionState.status === 'Active' && !moderationLocked && (
                   <div className="bg-slate-950 rounded-2xl p-4 border border-yellow-500/20">
                     <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold text-yellow-400/80 flex items-center gap-1.5"><Zap className="w-3 h-3 text-yellow-400" /> Auto-Bid</p>
                       {myMaxBids[auctionState.auctionId] != null && (
                         <button onClick={() => socket.emit('cancel_max_bid', { auctionId: auctionState.auctionId })} className="text-xs text-red-400 font-medium hover:text-red-300 transition-colors">Cancel</button>
                       )}
                     </div>
                     {myMaxBids[auctionState.auctionId] != null ? (
                       <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2.5">
                         <Zap className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                         <div>
                           <p className="text-[11px] font-black text-yellow-400">Active Max: ₹{(myMaxBids[auctionState.auctionId] as number).toLocaleString()}</p>
                           <p className="text-[9px] text-slate-500 font-bold">Bidding automatically on your behalf</p>
                         </div>
                       </div>
                     ) : (
                       <div className="space-y-2">
                         <div className="flex gap-2">
                           <div className="relative flex-1">
                             <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 font-black text-sm">₹</span>
                             <input type="number" value={maxBidInput} onChange={e => setMaxBidInput(e.target.value)} placeholder={`e.g. ${(auctionState.currentBid + 500).toLocaleString()}`} className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-7 pr-3 py-2.5 text-sm text-white font-black focus:border-yellow-500 outline-none placeholder:text-slate-700 tabular-nums" />
                           </div>
                           <button onClick={() => { const v = parseFloat(maxBidInput); if (!isNaN(v)) { socket.emit('set_max_bid', { auctionId: auctionState.auctionId, maxAmount: v }); setMaxBidInput(''); } }} className="bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-semibold px-4 py-2.5 rounded-xl text-sm transition-all active:scale-95 flex items-center gap-1.5 flex-shrink-0"><Zap className="w-3 h-3" />Set</button>
                         </div>
                         <p className="text-[10px] text-slate-600">System auto-bids up to your max when outbid.</p>
                       </div>
                     )}
                   </div>
                 )}

                 {isBroadcaster && auctionState.status === 'Active' && (
                   <div className="flex gap-2">
                     <button onClick={() => socket.emit('extend_time', { auctionId: auctionState.auctionId, minutes: 2 })} className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-2 rounded-lg text-sm transition-all flex items-center justify-center gap-1.5">
                       <Timer className="w-3 h-3" /> +2 min
                     </button>
                     <button onClick={() => socket.emit('extend_time', { auctionId: auctionState.auctionId, minutes: 5 })} className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-2 rounded-lg text-sm transition-all">+5 min</button>
                   </div>
                 )}
                 {isBroadcaster && auctionState.status === 'Closed' && (
                   <button onClick={() => socket.emit('restart_auction', { auctionId: auctionState.auctionId, durationMinutes: 2 })} className="w-full bg-orange-600 hover:bg-orange-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-all">
                     Restart Auction (2 min)
                   </button>
                 )}
                 {/* Pay Now — shown to winner when auction is closed */}
                 {auctionState.status === 'Closed' && auctionState.highestBidderId === myUser?.username && (
                   paidAuctions.has(auctionState.auctionId) ? (
                     <div className="space-y-3">
                       <div className="flex items-center justify-center gap-2 bg-green-600/15 border border-green-600/30 rounded-2xl py-3 px-4">
                         <Check className="w-4 h-4 text-green-400" />
                         <span className="text-xs font-medium text-green-400">Payment Complete</span>
                       </div>
                       {currentOrder?.status === 'paid-awaiting-address' && (
                         <button onClick={() => { setAddressAuctionId(auctionState.auctionId); setAddressForm(currentOrder.shippingAddress || DEFAULT_ORDER_ADDRESS); setShowAddressModal(true); }} className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-xl text-sm transition-all">
                           Add delivery address
                         </button>
                       )}
                       {currentOrder && currentOrder.status !== 'paid-awaiting-address' && (
                         <div className="space-y-1 text-center text-[11px] text-slate-400">
                           <div>Order status: {formatOrderStatusLabel(currentOrder.status)}{currentOrder.trackingId ? ` · Tracking ${currentOrder.trackingId}` : ''}</div>
                           <div>Estimated delivery: {formatEta(currentOrder.estimatedDelivery)}</div>
                         </div>
                       )}
                     </div>
                   ) : (
                     <button
                       onClick={() => handleRazorpayPayment(auctionState.auctionId)}
                       disabled={paymentProcessing}
                       className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-violet-500/20 disabled:opacity-50 active:scale-[0.98]"
                     >
                       {paymentProcessing
                         ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing...</>
                         : <><CreditCard className="w-4 h-4" />Pay ₹{auctionState.currentBid.toLocaleString()} Now</>
                       }
                     </button>
                   )
                 )}
                 {isBroadcaster && fullBidHistory.length === 0 && (
                   !showDeleteConfirm ? (
                     <button onClick={() => setShowDeleteConfirm(true)} className="w-full bg-red-600/10 hover:bg-red-600/20 border border-red-600/25 text-red-400 font-medium py-2 rounded-lg text-sm transition-all flex items-center justify-center gap-2">
                       <Trash2 className="w-3 h-3" /> Delete Auction
                     </button>
                   ) : (
                     <div className="bg-red-600/10 border border-red-600/30 rounded-2xl p-4 space-y-3">
                       <p className="text-xs text-red-400 text-center">Delete this auction permanently?</p>
                       <div className="flex gap-2">
                         <button onClick={() => { socket.emit('delete_auction', { auctionId: auctionState.auctionId }); setShowDeleteConfirm(false); }} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-medium py-2 rounded-lg text-sm transition-all">Yes, Delete</button>
                         <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 bg-white/5 hover:bg-white/10 text-white font-medium py-2 rounded-lg text-sm transition-all border border-white/10">Cancel</button>
                       </div>
                     </div>
                   )
                 )}
              </div>
           </div>
        </div>

        <div className={clsx("col-span-12 lg:col-span-6 space-y-6", mobileAuctionTab !== 'video' && 'hidden lg:block')}>
           <div className="bg-slate-900/50 backdrop-blur-md border border-violet-900/25 rounded-3xl p-2 sm:p-3 shadow-2xl relative overflow-hidden h-[320px] xs:h-[380px] sm:h-[480px] lg:h-[540px] flex flex-col">
              <div className="absolute top-3 left-3 sm:top-6 sm:left-6 z-20 flex flex-wrap gap-1.5 sm:gap-2 max-w-[60%] sm:max-w-none">
                 {isLive && (
                    <div className="bg-red-600 text-white text-[9px] sm:text-[10px] font-black px-2 sm:px-3 py-1 rounded-full flex items-center gap-1.5 sm:gap-2 shadow-lg shadow-red-500/20 border border-red-500 animate-pulse">
                       <div className="w-1.5 h-1.5 bg-white rounded-full"></div> LIVE
                    </div>
                 )}
                  {isBroadcaster && (
                    <div className="hidden sm:flex bg-slate-950/80 backdrop-blur-md text-white text-[10px] font-black px-3 py-1 rounded-full items-center gap-2 border border-slate-800">
                      <Video className="w-3 h-3 text-emerald-400" /> {streamQualityLabel}
                    </div>
                  )}
                    {isBroadcaster && (
                      <div className={clsx('hidden sm:flex backdrop-blur-md text-white text-[10px] font-black px-3 py-1 rounded-full items-center gap-2 border', micEnabled ? 'bg-emerald-950/80 border-emerald-700/40' : 'bg-slate-950/80 border-slate-800')}>
                        {micEnabled ? <Mic className="w-3 h-3 text-emerald-400" /> : <MicOff className="w-3 h-3 text-slate-400" />} {micEnabled ? 'MIC ON' : 'MIC OFF'}
                      </div>
                    )}
                 <div className="bg-slate-950/80 backdrop-blur-md text-white text-[9px] sm:text-[10px] font-black px-2 sm:px-3 py-1 rounded-full flex items-center gap-1.5 sm:gap-2 border border-slate-800">
                    <Users className="w-3 h-3 text-violet-400" /> {viewerCount}
                 </div>
              </div>

                {isBroadcaster && (
                 <div className="absolute top-6 right-3 sm:right-6 z-20 flex flex-wrap justify-end gap-1.5 sm:gap-2 max-w-[200px] sm:max-w-[430px]">
                   <select value={selectedStreamQuality} onChange={e => handleQualityChange(e.target.value as 'auto' | '720p' | '1080p')} className="bg-slate-950/90 border border-slate-700 text-white text-[10px] sm:text-xs font-medium px-2 sm:px-3 py-1 sm:py-1.5 rounded-full outline-none cursor-pointer">
                     <option value="auto">Auto quality</option>
                     <option value="720p">720p</option>
                     <option value="1080p">1080p</option>
                   </select>
                   <button onClick={handleToggleMic} className={clsx('text-white text-[10px] sm:text-xs font-medium px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all flex items-center gap-1 sm:gap-1.5', micEnabled ? 'bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-500/20' : 'bg-slate-700 hover:bg-slate-600')}>
                     {micEnabled ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />} <span className="hidden sm:inline">{micEnabled ? 'Mic On' : 'Mic Off'}</span>
                   </button>
                   <button onClick={handleSwitchCamera} className="bg-sky-600 hover:bg-sky-500 text-white text-[10px] sm:text-xs font-medium px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full shadow-md shadow-sky-500/20 transition-all flex items-center gap-1 sm:gap-1.5">
                     <Camera className="w-3 h-3" /> <span className="hidden sm:inline">Switch Cam</span>
                   </button>
                   <button onClick={() => startBroadcast()} className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] sm:text-xs font-medium px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full shadow-md shadow-emerald-500/20 transition-all flex items-center gap-1 sm:gap-1.5">
                     <RefreshCw className="w-3 h-3" /> <span className="hidden sm:inline">Refresh</span>
                   </button>
                   <button onClick={stopBroadcast} className="bg-red-600 hover:bg-red-500 text-white text-[10px] sm:text-xs font-medium px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full shadow-md shadow-red-500/20 transition-all flex items-center gap-1 sm:gap-1.5">
                     <X className="w-3 h-3" /> <span className="hidden sm:inline">Stop</span>
                   </button>
                 </div>
                )}

              <div className="flex-1 bg-slate-950 rounded-2xl relative overflow-hidden border border-slate-800 flex items-center justify-center">
                 <video ref={videoRef} autoPlay playsInline muted={isBroadcaster} className={clsx("w-full h-full object-cover transition-opacity duration-1000", isLive ? "opacity-100" : "opacity-0")} />
                 
                  {!isLive && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center p-8">
                      <div className="flex flex-col items-center justify-center text-center max-w-sm">
                        <div className="w-20 h-20 rounded-full bg-slate-900 border-2 border-slate-800 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(15,23,42,0.45)]">
                          <Play className="w-8 h-8 text-slate-700 ml-1" />
                        </div>
                        <h3 className="text-xl font-black text-slate-300 tracking-tight">Stream Standby</h3>
                        <p className="text-xs text-slate-500 font-medium tracking-wide mt-2 max-w-xs">Waiting for the auctioneer to initialize broadcast</p>
                        {!isBroadcaster && (
                         <button onClick={() => startBroadcast()} className="mt-6 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-md shadow-violet-500/20 transition-all flex items-center gap-2">
                          <Video className="w-4 h-4" /> Start Broadcast
                         </button>
                        )}
                      </div>
                    </div>
                  )}

                 {lastBidder && (
                   <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none animate-in fade-in zoom-in slide-in-from-bottom-20 duration-500">
                      <div className="bg-white text-slate-950 px-10 py-5 rounded-3xl shadow-2xl shadow-violet-500/50 border-[5px] border-violet-500 flex flex-col items-center ring-[10px] ring-white/10 ring-inset">
                         <Trophy className="w-12 h-12 text-yellow-500 mb-2 drop-shadow-md" />
                         <p className="text-xs font-semibold text-slate-500 tracking-wide">NEW TOP BIDDER</p>
                         <p className="text-2xl font-bold" style={{fontFamily:"'Space Grotesk',sans-serif"}}>{lastBidder}</p>
                      </div>
                   </div>
                 )}
              </div>

              <div className="p-2 sm:p-4 mt-auto">
                 <form onSubmit={handlePlaceBid} className="flex gap-2 sm:gap-3">
                    <div className="flex-1 relative">
                       <span className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-lg sm:text-xl text-slate-600">₹</span>
                       <input 
                         type="number" 
                         value={bidAmount} 
                         onChange={(e)=>setBidAmount(e.target.value)} 
                         onFocus={() => { if (!bidAmount) setBidAmount(String(auctionState.currentBid + 100)); }}
                         disabled={moderationLocked}
                         placeholder={`Min ₹${(auctionState.currentBid + 100).toLocaleString()}`}
                         className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 sm:py-4 px-8 sm:px-10 text-lg sm:text-2xl font-bold text-white focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/10 transition-all placeholder:text-slate-700 tabular-nums disabled:opacity-40" 
                       />
                    </div>
                    <button 
                      type="submit"
                      disabled={auctionState.status !== 'Active' || moderationLocked}
                      className="px-5 sm:px-8 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl shadow-lg shadow-violet-500/20 hover:scale-[1.02] active:scale-95 transition-all text-base sm:text-lg disabled:opacity-30"
                    >
                       Bid
                    </button>
                 </form>
              </div>
           </div>

           <div className={clsx("bg-gradient-to-r from-violet-700 to-fuchsia-700 rounded-2xl sm:rounded-3xl p-3 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-0 shadow-2xl shadow-violet-900/40 transition-all duration-700", auctionState.highestBidderId === myUser?.username ? "border-yellow-400 border-[3px] scale-[1.02]" : "border-violet-900/40 border")}>
              <div className="bg-white/10 p-3 sm:p-4 rounded-2xl sm:mr-6 flex-shrink-0">
                <Trophy className={clsx("w-6 h-6 sm:w-8 sm:h-8", auctionState.highestBidderId === myUser?.username ? "text-yellow-400 animate-bounce" : "text-white/50")} />
              </div>
              <div className="flex-1 min-w-0">
                 <p className="text-[10px] sm:text-xs text-white/60 font-medium tracking-wide">Current Top Bidder</p>
                 <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
                    <span className="text-base sm:text-xl font-bold text-white truncate">
                       {auctionState.highestBidderId === 'None' ? 'Waiting for first bid...' : auctionState.highestBidderId}
                    </span>
                    <span className="text-sm sm:text-xl font-semibold text-white/40 italic">₹{auctionState.currentBid.toLocaleString()}</span>
                 </div>
              </div>
              {auctionState.highestBidderId === myUser?.username && (
                <div className="text-white font-medium text-xs bg-white/20 px-4 py-2 rounded-full border border-white/20">
                   You're winning
                </div>
              )}
           </div>

           {/* Leaderboard */}
           {auctionState.history.length > 0 && (() => {
             const seen = new Set<string>();
             const top3 = auctionState.history.filter(b => { if (seen.has(b.userId)) return false; seen.add(b.userId); return true; }).slice(0,3);
             return (
               <div className="bg-slate-900/50 border border-violet-900/25 rounded-3xl p-5 shadow-2xl">
                 <div className="flex items-center gap-2 mb-4"><BarChart2 className="w-4 h-4 text-violet-400" /><p className="text-xs font-semibold text-slate-400">Top Bidders</p></div>
                 <div className="space-y-2">
                   {top3.map((b, i) => (
                     <div key={b.userId} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/50">
                       <div className="relative flex-shrink-0">
                         <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black text-white" style={{ background: userColor(b.userId) }}>{b.userId[0]?.toUpperCase()}</div>
                         <span className={clsx('absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black border border-slate-900', i === 0 ? 'bg-yellow-500 text-slate-950' : i === 1 ? 'bg-slate-400 text-slate-950' : 'bg-amber-700 text-white')}>{i+1}</span>
                       </div>
                       <span className="flex-1 text-xs font-medium text-white">{b.userId}{b.userId === myUser?.username && <span className="ml-1.5 text-yellow-400 text-[10px]">(you)</span>}</span>
                       <span className="text-xs font-semibold text-violet-400">₹{b.amount.toLocaleString()}</span>
                     </div>
                   ))}
                 </div>
               </div>
             );
           })()}
        </div>

           <div className={clsx("col-span-12 lg:col-span-3", mobileAuctionTab !== 'chat' && 'hidden lg:block')}>
           <div className="bg-slate-900/50 backdrop-blur-md border border-violet-900/25 rounded-3xl flex flex-col h-[500px] sm:h-[600px] lg:h-[744px] shadow-2xl">
              {/* Tabs */}
              <div className="p-4 border-b border-slate-800/50 flex gap-2">
                <button onClick={() => setRightTab('bids')} className={clsx('flex-1 py-2 rounded-lg font-medium text-xs transition-all flex items-center justify-center gap-1.5', rightTab === 'bids' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500 hover:text-white bg-white/[0.03] hover:bg-white/8')}>
                  <TrendingUp className="w-3 h-3" /> Live
                </button>
                <button onClick={() => setRightTab('history')} className={clsx('flex-1 py-2 rounded-lg font-medium text-xs transition-all flex items-center justify-center gap-1.5', rightTab === 'history' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500 hover:text-white bg-white/[0.03] hover:bg-white/8')}>
                  <Clock className="w-3 h-3" /> History
                </button>
                <button onClick={() => setRightTab('chat')} className={clsx('flex-1 py-2 rounded-lg font-medium text-xs transition-all flex items-center justify-center gap-1.5', rightTab === 'chat' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500 hover:text-white bg-white/[0.03] hover:bg-white/8')}>
                  <MessageSquare className="w-3 h-3" /> Chat
                </button>
              </div>

              {rightTab === 'bids' ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                 {/* Viewer count badge */}
                 <div className="flex items-center gap-2 px-1 mb-2">
                   <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                   <span className="text-[10px] text-slate-500">{viewerCount} watching live</span>
                 </div>
                 {auctionState.history.map((bid, i) => (                    <div 
                      key={i} 
                      className={clsx(
                        "p-4 rounded-2xl flex items-center justify-between transition-all duration-300 animate-in slide-in-from-right-4",
                        i === 0 ? "bg-white border-none shadow-lg shadow-white/5 scale-[1.02]" : "bg-slate-950/50 border border-slate-800/50"
                      )}
                    >
                       <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-[10px] text-white flex-shrink-0"
                             style={{ background: i === 0 ? '#0f172a' : userColor(bid.userId), border: i === 0 ? `2px solid ${userColor(bid.userId)}` : undefined }}>
                             {bid.userId[0]}
                          </div>
                          <div>
                             <p className={clsx("text-xs font-medium flex items-center gap-1.5", i === 0 ? "text-slate-950" : "text-slate-300")}>{bid.userId}{bid.userId === myUser?.username && <span className={clsx("text-[10px] font-medium px-1.5 py-0.5 rounded-full", i === 0 ? "bg-slate-800 text-violet-400" : "bg-violet-600/20 text-violet-300")}>(you)</span>}</p>
                             <p className={clsx("text-[10px] opacity-50", i === 0 ? "text-slate-500" : "text-slate-500")}>Real-time</p>
                          </div>
                       </div>
                       <div className="text-right">
                             <p className={clsx("font-semibold", i === 0 ? "text-slate-900 text-lg" : "text-violet-400")}>
                             ₹{bid.amount.toLocaleString()}
                          </p>
                       </div>
                    </div>
                 ))}
                 {auctionState.history.length === 0 && (
                   <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-30 grayscale pt-20">
                      <TrendingUp className="w-12 h-12 mb-4 text-slate-600" />
                      <p className="text-xs text-slate-500">Waiting for first bid</p>
                   </div>
                 )}
                </div>
              ) : rightTab === 'history' ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                  <div className="flex items-center justify-between px-1 mb-3">
                    <p className="text-xs text-slate-500">{fullBidHistory.length} total bids</p>
                    {fullBidHistory.length > 0 && <p className="text-xs text-violet-400 font-medium">Peak ₹{Math.max(...fullBidHistory.map(b=>b.amount)).toLocaleString()}</p>}
                  </div>
                  {fullBidHistory.length >= 2 && (
                    <div className="bg-slate-950/80 border border-slate-800/50 rounded-2xl p-4 mb-3">
                      <p className="text-xs text-slate-500 mb-2">Bid Trajectory</p>
                      <Sparkline data={[...fullBidHistory].reverse().map(b => b.amount)} />
                    </div>
                  )}
                  {fullBidHistory.map((bid, i) => (
                    <div key={bid.id + i} className={clsx('p-3 rounded-xl flex items-center justify-between', bid.userId === myUser?.username ? 'bg-violet-600/15 border border-violet-600/30' : 'bg-slate-950/50 border border-slate-800/30')}>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0" style={{ background: userColor(bid.userId) }}>{bid.userId[0]?.toUpperCase()}</div>
                        <div>
                          <p className="text-xs font-medium text-white">{bid.userId}{bid.userId === myUser?.username && <span className="ml-1 text-violet-400">(you)</span>}</p>
                          <p className="text-[10px] text-slate-500">{new Date(bid.timestamp).toLocaleTimeString()}</p>
                        </div>
                      </div>
                      <p className="font-semibold text-violet-400 text-sm">₹{bid.amount.toLocaleString()}</p>
                    </div>
                  ))}
                  {fullBidHistory.length === 0 && <div className="flex flex-col items-center justify-center pt-16 opacity-30"><TrendingUp className="w-10 h-10 mb-3 text-slate-600" /><p className="text-xs text-slate-500">No bids placed yet</p></div>}
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {chats.map((msg) => (
                      <div key={msg.id} className={clsx('flex gap-2', msg.userId === myUser?.username ? 'flex-row-reverse' : '')}>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black text-white flex-shrink-0" style={{ background: userColor(msg.userId) }}>{msg.userId[0]?.toUpperCase()}</div>
                        <div className={clsx('max-w-[75%] flex flex-col gap-0.5', msg.userId === myUser?.username ? 'items-end' : 'items-start')}>
                          <span className="text-[10px] text-slate-500 px-1">{msg.userId}</span>
                          <div className={clsx('px-3 py-2 rounded-2xl text-xs font-medium', msg.userId === myUser?.username ? 'bg-violet-600 text-white rounded-tr-sm' : 'bg-white/5 text-slate-200 rounded-tl-sm')}>{msg.message}</div>
                        </div>
                      </div>
                    ))}
                    {chats.length === 0 && <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-30 pt-20"><MessageSquare className="w-12 h-12 mb-4 text-slate-600" /><p className="text-xs text-slate-500">No messages yet</p></div>}
                    <div ref={chatEndRef} />
                  </div>
                  <form onSubmit={handleSendChat} className="p-3 border-t border-slate-800/50 flex gap-2">
                    <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} maxLength={200} placeholder="Say something..." className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-violet-500/60 outline-none" />
                    <button type="submit" className="bg-violet-600 hover:bg-violet-500 text-white px-3 py-2 rounded-lg font-medium text-xs transition-all">Send</button>
                  </form>
                </>
              )}

              <div className="p-4 mt-auto border-t border-slate-800/50">
                 <div className="bg-slate-950/80 rounded-2xl border border-slate-800/50 p-4">
                    <p className="text-xs text-slate-500 mb-3">Session Stats</p>
                    <div className="space-y-2">
                      {[
                        { label: 'Total Bids', val: fullBidHistory.length, col: 'text-blue-400' },
                        { label: 'My Bids', val: fullBidHistory.filter(b => b.userId === myUser?.username).length, col: 'text-violet-400' },
                        { label: 'Peak Bid', val: fullBidHistory.length > 0 ? `₹${Math.max(...fullBidHistory.map(b=>b.amount)).toLocaleString()}` : '—', col: 'text-yellow-400' },
                        { label: 'Watching', val: viewerCount, col: 'text-green-400' },
                      ].map((s, i) => (
                        <div key={i} className="flex items-center justify-between py-1 border-b border-slate-800/40 last:border-0">
                          <span className="text-[10px] text-slate-500 font-medium">{s.label}</span>
                          <span className={clsx('text-sm font-semibold tabular-nums', s.col)}>{s.val}</span>
                        </div>
                      ))}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </main>

      {/* Mobile bottom navigation for auction room */}
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-[#0c0c16]/95 backdrop-blur-xl border-t border-white/[0.08] safe-bottom">
        <div className="flex items-center justify-around h-14 max-w-md mx-auto px-2">
          <button onClick={() => setMobileAuctionTab('details')} className={clsx('flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all', mobileAuctionTab === 'details' ? 'text-violet-400 bg-violet-500/10' : 'text-slate-500')}>
            <Package className="w-5 h-5" />
            <span className="text-[10px] font-medium">Details</span>
          </button>
          <button onClick={() => setMobileAuctionTab('video')} className={clsx('flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all', mobileAuctionTab === 'video' ? 'text-violet-400 bg-violet-500/10' : 'text-slate-500')}>
            <Video className="w-5 h-5" />
            <span className="text-[10px] font-medium">Live</span>
          </button>
          <button onClick={() => setMobileAuctionTab('chat')} className={clsx('flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all', mobileAuctionTab === 'chat' ? 'text-violet-400 bg-violet-500/10' : 'text-slate-500')}>
            <MessageSquare className="w-5 h-5" />
            <span className="text-[10px] font-medium">Chat</span>
          </button>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3b1f6b; border-radius: 10px; }
        @keyframes floatUp { 0% { transform: translateY(0) scale(1); opacity: 1; } 100% { transform: translateY(-200px) scale(1.5); opacity: 0; } }
        @keyframes bidFlash { 0% { color: #4ade80; transform: scale(1.1); text-shadow: 0 0 24px rgba(74,222,128,0.7); } 60% { color: #c084fc; transform: scale(1.02); } 100% { color: #c084fc; transform: scale(1); text-shadow: none; } }
        .bid-flash { animation: bidFlash 1.4s ease-out forwards; }
        @media (max-width: 639px) {
          @keyframes floatUp { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(-120px); opacity: 0; } }
          @keyframes bidFlash { 0% { color: #4ade80; } 100% { color: #c084fc; } }
          .bid-flash { animation: bidFlash 0.6s ease-out forwards; }
        }
      `}} />
    </div>
  );
}

export default App;

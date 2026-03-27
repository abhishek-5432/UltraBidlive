import React, { useEffect, useState, useRef, useCallback } from 'react';
import { socket, connectSocket } from './lib/socket';
import { Trophy, Play, Video, Edit2, Clock, TrendingUp, Users, Lock, User, Mail, ArrowRight, MessageSquare, ChevronLeft, Plus, X, Star, Heart, ShoppingCart, Zap, Volume2, VolumeX, Copy, Check, Award, Search, Filter, BarChart2, Bell, Trash2, Timer, Tag, Package, ImageIcon, IndianRupee, ListChecks, CreditCard, MapPin } from 'lucide-react';
import clsx from 'clsx';

// ── Types ──────────────────────────────────────────────────────────
interface AuctionCard { id: string; itemTitle: string; itemImage: string; startingPrice: number; currentBid: number; highestBidderId: string; status: string; endTime: number; bidCount: number; category: string; buyNowPrice: number | null; createdBy?: string; description?: string; createdAt?: number; }
interface ChatMsg { id: string; userId: string; message: string; timestamp: number; }
interface Toast { id: string; type: 'outbid' | 'win' | 'error' | 'info'; message: string; }
interface Notif { id: string; type: 'outbid' | 'win' | 'info'; message: string; read: boolean; timestamp: number; }
interface FloatingReaction { id: string; emoji: string; x: number; }
const REACTION_KEYS = ['FIRE','CLAP','MONEY','WOW','ROCKET'];
const REACTION_EMOJI: Record<string,string> = { FIRE:'🔥', CLAP:'👏', MONEY:'💰', WOW:'😮', ROCKET:'🚀' };
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function launchConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const colors = ['#3b82f6','#6366f1','#f59e0b','#10b981','#ef4444','#fff'];
  const pieces = Array.from({ length: 150 }, () => ({
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
const CAT_COLORS: Record<string, string> = {
  General:'#3b82f6', Electronics:'#06b6d4', Antiques:'#f59e0b',
  Art:'#ec4899', Jewelry:'#a855f7', Vehicles:'#ef4444', Collectibles:'#10b981',
};
const CAT_EMOJIS: Record<string, string> = {
  All:'🔀', General:'🏷️', Electronics:'💻', Antiques:'🏺',
  Art:'🎨', Jewelry:'💎', Vehicles:'🚗', Collectibles:'🃏',
};
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';;
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
    endTime: Date.now() + 60000,
    history: [] as { userId: string, amount: number }[],
    itemTitle: 'Antique Gold Watch',
    itemImage: 'https://images.unsplash.com/photo-1587836374828-cb4387dfee7d?auto=format&fit=crop&q=80&w=400&h=400',
    auctionId: '',
    buyNowPrice: null as number | null,
    reservePrice: null as number | null,
    description: '',
  });
  
  const [bidAmount, setBidAmount] = useState('');
  const [myUser, setMyUser] = useState<{username: string} | null>(JSON.parse(localStorage.getItem('user') || 'null'));
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
  const [lobbyFilter, setLobbyFilter] = useState<'all' | 'active' | 'ending_soon' | 'ended' | 'buy_now' | 'watchlist'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'bids' | 'ending' | 'price_low' | 'price_high'>('newest');
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [rightTab, setRightTab] = useState<'bids' | 'chat' | 'history'>('bids');
  const [chats, setChats] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showProfile, setShowProfile] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [showCreateAuction, setShowCreateAuction] = useState(false);
  const [createForm, setCreateForm] = useState({ itemTitle: '', itemImage: '', startingPrice: '1000', durationMinutes: '2', reservePrice: '', buyNowPrice: '', category: 'General', description: '' });

  // ── Extra features state ──
  const [soundMuted, setSoundMuted] = useState(false);
  const soundMutedRef = useRef(false);
  const toggleMute = () => { setSoundMuted(prev => { soundMutedRef.current = !prev; return !prev; }); };
  const [winnerOverlay, setWinnerOverlay] = useState<{ winner: string; amount: number; auctionId: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [copiedLink, setCopiedLink] = useState(false);
  const [buyNowModal, setBuyNowModal] = useState(false);
  const [bidFlashKey, setBidFlashKey] = useState(0);
  const [fullBidHistory, setFullBidHistory] = useState<{ id: string; userId: string; amount: number; timestamp: number }[]>([]);
  const [lobbyNow, setLobbyNow] = useState(Date.now());
  const [myMaxBids, setMyMaxBids] = useState<Record<string, number | null>>({});
  const [maxBidInput, setMaxBidInput] = useState('');
  const [paidAuctions, setPaidAuctions] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem('paidAuctions') || '[]')));
  const [paymentProcessing, setPaymentProcessing] = useState(false);

  const markAuctionPaid = (auctionId: string) => {
    setPaidAuctions(prev => {
      const next = new Set(prev); next.add(auctionId);
      localStorage.setItem('paidAuctions', JSON.stringify([...next]));
      return next;
    });
  };

  const handleRazorpayPayment = async (auctionId: string) => {
    setPaymentProcessing(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:3001/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ auctionId }),
      });
      const data = await res.json();
      if (!res.ok) { addToast('error', data.error || 'Payment failed'); setPaymentProcessing(false); return; }

      const options = {
        key: data.key,
        amount: data.amount,
        currency: data.currency,
        name: 'UltraBid Live',
        description: data.itemTitle,
        order_id: data.orderId,
        handler: async (response: any) => {
          try {
            const vRes = await fetch('http://localhost:3001/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ ...response, auctionId }),
            });
            const vData = await vRes.json();
            if (vData.success) {
              markAuctionPaid(auctionId);
              setWinnerOverlay(null);
              addToast('win', `✅ Payment successful! ID: ${response.razorpay_payment_id}`);
              setNotifications(prev => [{ id: uid(), type: 'win', message: `💳 Payment confirmed for auction — ₹${(data.amount/100).toLocaleString()}`, read: false, timestamp: Date.now() }, ...prev.slice(0, 49)]);
            } else { addToast('error', vData.error || 'Payment verification failed'); }
          } catch { addToast('error', 'Payment verification error'); }
          setPaymentProcessing(false);
        },
        prefill: { name: myUser?.username || '', email: '' },
        theme: { color: '#3b82f6', backdrop_color: '#0f172a' },
        modal: { ondismiss: () => setPaymentProcessing(false) },
      };
      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (resp: any) => {
        addToast('error', `Payment failed: ${resp.error.description}`);
        setPaymentProcessing(false);
      });
      rzp.open();
    } catch (err) {
      addToast('error', 'Could not initiate payment');
      setPaymentProcessing(false);
    }
  };

  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = uid();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (isAuthenticated && view === 'lobby') {
      const fetchAuctions = async () => { try { const r = await fetch('http://localhost:3001/api/auctions'); setLobbyAuctions(await r.json()); } catch {} };
      fetchAuctions();
      const iv = setInterval(fetchAuctions, 10000);
      // Tick lobby timers every second
      const tick = setInterval(() => setLobbyNow(Date.now()), 1000);
      return () => { clearInterval(iv); clearInterval(tick); };
    }
  }, [isAuthenticated, view]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats]);

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
          if (winner === myUser?.username) { setTimeout(launchConfetti, 300); addToast('win', `🏆 You won! Rs.${amount?.toLocaleString()} — Pay now to confirm!`); setNotifications(prev => [{ id: uid(), type: 'win', message: `🏆 You won "${state.itemTitle}" — Rs.${amount?.toLocaleString()}! Pay now to confirm.`, read: false, timestamp: Date.now() }, ...prev.slice(0, 49)]); }
          else { addToast('info', `Auction ended. Winner: ${winner}`); setNotifications(prev => [{ id: uid(), type: 'info', message: `"${state.itemTitle}" ended. Winner: ${winner}`, read: false, timestamp: Date.now() }, ...prev.slice(0, 49)]); }
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
    });
    socket.on('seller_payment_received', ({ itemTitle, buyer, amount }: { auctionId: string; itemTitle: string; buyer: string; amount: number }) => {
      addToast('info', `💸 Payment received from ${buyer} for "${itemTitle}" — ₹${amount?.toLocaleString()}`);
      setNotifications(prev => [{ id: uid(), type: 'info', message: `💸 Payment ₹${amount?.toLocaleString()} received from ${buyer} for "${itemTitle}"`, read: false, timestamp: Date.now() }, ...prev.slice(0, 49)]);
    });
    socket.on('outbid', ({ auctionTitle, newBid }) => {
      if (!soundMutedRef.current) playBeep(880, 440, 0.3);
      addToast('outbid', `You were outbid on "${auctionTitle}"! New: Rs.${newBid?.toLocaleString()}`);
      setNotifications(prev => [{ id: uid(), type: 'outbid', message: `Outbid on "${auctionTitle}" — Rs.${newBid?.toLocaleString()}`, read: false, timestamp: Date.now() }, ...prev.slice(0, 49)]);
    });
    socket.on('bid_error', (msg: string) => addToast('error', msg));
    socket.on('chat_message', (msg: ChatMsg) => setChats(prev => [...prev.slice(-99), msg]));
    socket.on('reaction', ({ emoji }: { userId: string; emoji: string }) => {
      const id = uid(); const x = 5 + Math.random() * 80;
      setReactions(prev => [...prev, { id, emoji, x }]);
      setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 3000);
    });
    socket.on('auction_created', (a: AuctionCard) => setLobbyAuctions(prev => [a, ...prev]));
    socket.on('auction_created_confirm', (auctionId: string) => joinAuction(auctionId));
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
      setNotifications(prev => [{ id: uid(), type: 'info', message: `⚡ Auto-bid Rs.${amount?.toLocaleString()} placed on "${auctionTitle}"`, read: false, timestamp: Date.now() }, ...prev.slice(0, 49)]);
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
      socket.off('auction_created_confirm');
      socket.off('auction_not_found');
      socket.off('auction_deleted');
      socket.off('lobby_auction_update');
      socket.off('auto_bid_placed');
      socket.off('max_bid_confirmed');
      socket.off('payment_confirmed');
      socket.off('seller_payment_received');
    };
  }, [isAuthenticated, myUser?.username, addToast]);

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
      if (streamRef.current) streamRef.current.getTracks().forEach(track => { peerConnection.addTrack(track, streamRef.current!); });
      peerConnection.onicecandidate = event => { if (event.candidate) socket.emit("candidate", id, event.candidate); };
      peerConnection.createOffer()
        .then(sdp => peerConnection.setLocalDescription(sdp))
        .then(() => socket.emit("offer", id, peerConnection.localDescription));
    });

    socket.on("broadcaster", () => { if (!isBroadcaster) socket.emit("watcher"); });
    socket.on("disconnectPeer", id => { if (peerConnections[id]) { peerConnections[id].close(); delete peerConnections[id]; }});
    socket.on("broadcaster_disconnect", () => { setIsLive(false); if (videoRef.current) videoRef.current.srcObject = null; });

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
      const res = await fetch(`http://localhost:3001${endpoint}`, {
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
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGoogleLogin = useCallback(async (credential: string) => {
    setError('');
    try {
      const res = await fetch('http://localhost:3001/api/auth/google', {
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
    } catch (err: any) { setError(err.message); }
  }, []);

  useEffect(() => {
    const initGoogle = () => {
      if ((window as any).google?.accounts?.id) {
        (window as any).google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (resp: any) => handleGoogleLogin(resp.credential),
        });
      }
    };
    // If GSI script already loaded
    if ((window as any).google?.accounts?.id) initGoogle();
    else window.addEventListener('load', initGoogle, { once: true });
    return () => window.removeEventListener('load', initGoogle);
  }, [handleGoogleLogin]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setMyUser(null);
    setView('lobby');
    socket.disconnect();
  };

  const joinAuction = (auctionId: string) => {
    socket.emit('join_auction', auctionId);
    setChats([]); setFullBidHistory([]);
    fetch(`http://localhost:3001/api/auctions/${auctionId}/bids`)
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

  const loadProfile = async () => {
    if (!myUser) return;
    try { const r = await fetch(`http://localhost:3001/api/profile/${myUser.username}`); setProfileData(await r.json()); setShowProfile(true); } catch {}
  };

  const handleCreateAuction = (e: React.FormEvent) => {
    e.preventDefault();
    socket.emit('create_auction', { ...createForm });
    setShowCreateAuction(false);
    setCreateForm({ itemTitle: '', itemImage: '', startingPrice: '1000', durationMinutes: '2', reservePrice: '', buyNowPrice: '', category: 'General', description: '' });
  };

  const startBroadcast = async () => {
    try {
       const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
       if (videoRef.current) videoRef.current.srcObject = stream;
       streamRef.current = stream;
       setIsBroadcaster(true);
       setIsLive(true);
       socket.emit("broadcaster");
    } catch (e) {
       console.error(e);
       alert("Camera access denied or unvailable! Please grant permissions.");
    }
  };

  const handlePlaceBid = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submit clicked, current status:", auctionState.status);
    const amount = parseFloat(bidAmount);
    const minBid = auctionState.currentBid + 100;
    if (amount < minBid) {
      addToast('error', `Minimum bid is Rs.${minBid.toLocaleString()}`);
      return;
    }
    socket.emit('place_bid', { auctionId: auctionState.auctionId, amount });
  };

  const handleQuickBid = () => {
     const nextBid = (auctionState.currentBid || auctionState.startingPrice) + 500;
     socket.emit('place_bid', { auctionId: auctionState.auctionId, amount: nextBid });
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

  const isUrgent = timeRemaining <= 10 && timeRemaining > 0 && auctionState.status === 'Active';

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
           <div className="flex-1 flex items-center justify-center p-8 lg:p-14 relative">
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

                    <button type="button" onClick={() => (window as any).google?.accounts.id.prompt()}
                       className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 text-slate-300 text-sm font-medium py-3 rounded-xl hover:bg-white/8 hover:border-white/15 transition-all">
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
    <div className="fixed top-6 right-6 z-[100] space-y-2 pointer-events-none max-w-sm">
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 w-full max-w-md shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-white" style={{fontFamily:"'Space Grotesk',sans-serif"}}>My Profile</h2><button onClick={() => setShowProfile(false)} className="p-2 hover:bg-slate-800 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button></div>
        <div className="flex items-center gap-4 mb-6 p-4 bg-white/[0.03] border border-white/8 rounded-2xl"><div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-md" style={{ background: userColor(profileData.username) }}>{profileData.username?.[0]?.toUpperCase()}</div><div><p className="font-semibold text-white text-lg">{profileData.username}</p><p className="text-slate-500 text-xs mt-0.5">{profileData.totalBids} bids · {profileData.wins} wins</p></div></div>
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-violet-400">{profileData.totalBids}</p><p className="text-xs text-slate-500 font-medium mt-1">Total Bids</p></div>
          <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-yellow-400">{profileData.wins}</p><p className="text-xs text-slate-500 font-medium mt-1">Auctions Won</p></div>
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
  const CreateAuctionModal = () => !showCreateAuction ? null : (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[95vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/25"><Tag className="w-5 h-5 text-white" /></div>
            <div><h2 className="text-xl font-bold text-white" style={{fontFamily:"'Space Grotesk',sans-serif"}}>Sell Your Product</h2><p className="text-xs text-slate-500 mt-0.5">List it as a live auction</p></div>
          </div>
          <button onClick={() => setShowCreateAuction(false)} className="p-2 hover:bg-slate-800 rounded-xl transition-all"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <form onSubmit={handleCreateAuction} className="p-7 space-y-6">
          {/* Product Info section */}
          <div>
            <p className="text-xs font-semibold text-emerald-400 mb-4 flex items-center gap-2"><Package className="w-3 h-3" />Product Info</p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Product Name *</label>
                <input type="text" required placeholder="e.g. iPhone 14 Pro, Vintage Watch, Handmade Rug..." value={createForm.itemTitle} onChange={ev => setCreateForm(p => ({...p, itemTitle: ev.target.value}))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-emerald-500/60 outline-none placeholder:text-slate-600 transition-colors" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5"><ImageIcon className="w-3 h-3" />Product Image URL <span className="text-slate-600">(optional)</span></label>
                <input type="text" placeholder="https://example.com/image.jpg" value={createForm.itemImage} onChange={ev => setCreateForm(p => ({...p, itemImage: ev.target.value}))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-emerald-500/60 outline-none placeholder:text-slate-600 transition-colors" />
                {createForm.itemImage && (
                  <div className="mt-2 relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-700 aspect-video flex items-center justify-center">
                    <img src={createForm.itemImage} alt="preview" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
                    <span className="absolute bottom-2 left-3 text-[10px] text-white/50">Preview</span>
                  </div>
                )}
                {!createForm.itemImage && (
                  <div className="mt-2 rounded-2xl border border-dashed border-slate-700 aspect-video flex flex-col items-center justify-center gap-2 bg-slate-950/50">
                    <ImageIcon className="w-8 h-8 text-slate-700" />
                    <p className="text-xs text-slate-600">Image preview will appear here</p>
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

          {/* Seller tip */}
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl px-4 py-3 flex items-start gap-3">
            <Star className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-300/60 leading-relaxed">Your listing goes <span className="text-emerald-400 font-medium">live instantly</span>. Buyers from across the platform will see it and place bids in real time. You get notified when your auction closes.</p>
          </div>

          <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3.5 rounded-xl transition-all mt-2 shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 text-sm active:scale-[0.98]">
            <Tag className="w-4 h-4" />List Product — Go Live
          </button>
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
        <Toasts /><ProfileModal />{CreateAuctionModal()}
        <header className="border-b border-white/[0.06] bg-[#09090f]/95 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-[17px] font-bold tracking-tight text-white" style={{fontFamily:"'Space Grotesk', sans-serif"}}>UltraBid Live</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <button onClick={() => setShowNotifications(v => !v)} className="relative p-2 bg-white/5 border border-white/10 rounded-lg hover:border-white/20 transition-all">
                  <Bell className="w-4 h-4 text-slate-400" />
                  {notifications.filter(n => !n.read).length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-fuchsia-500 rounded-full text-[9px] font-black text-white flex items-center justify-center">{Math.min(9, notifications.filter(n => !n.read).length)}</span>
                  )}
                </button>
                {showNotifications && (
                  <div className="absolute right-0 top-11 w-80 bg-[#12101f] border border-white/10 rounded-xl shadow-2xl z-[200] overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/8 flex justify-between items-center">
                      <p className="text-sm font-semibold text-white">Notifications</p>
                      <button onClick={() => setNotifications(prev => prev.map(n => ({...n, read: true})))} className="text-xs text-violet-400 hover:text-violet-300 font-medium">Mark all read</button>
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
              <button onClick={() => setShowCreateAuction(true)} className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all shadow-md shadow-emerald-500/20"><Tag className="w-3.5 h-3.5" /> Sell</button>
              <button onClick={loadProfile} className="flex items-center gap-2 rounded-full px-3 py-1.5 bg-white/5 border border-white/10 hover:border-white/20 transition-all">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white font-semibold flex-shrink-0" style={{ background: myUser?.username ? userColor(myUser.username) : '#7c3aed' }}>{myUser?.username?.[0]?.toUpperCase()}</div>
                <span className="text-sm font-medium text-slate-300 hidden sm:block">{myUser?.username}</span>
              </button>
              <button onClick={handleLogout} className="text-slate-500 hover:text-slate-300 text-sm font-medium transition-colors px-2">Sign out</button>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-8 relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight" style={{fontFamily:"'Space Grotesk', sans-serif"}}>Live Auctions</h2>
              <p className="text-slate-500 text-sm mt-0.5">{lobbyAuctions.length} auction{lobbyAuctions.length !== 1 ? 's' : ''} available</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => { setLobbyTab('all'); setLobbyFilter('all'); }} className={clsx('px-4 py-2 rounded-lg font-medium text-sm transition-all border', lobbyTab === 'all' && lobbyFilter === 'all' ? 'bg-violet-600 border-violet-500 text-white shadow-md' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20')}>All</button>
              <button onClick={() => { setLobbyTab('watchlist'); setLobbyFilter('watchlist'); }} className={clsx('px-4 py-2 rounded-lg font-medium text-sm transition-all border flex items-center gap-1.5', lobbyTab === 'watchlist' ? 'bg-yellow-500 border-yellow-400 text-slate-950 shadow-md' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white')}><Star className="w-3.5 h-3.5" /> Watchlist {watchlist.length > 0 && <span className={clsx('rounded-full px-1.5 text-xs font-semibold', lobbyTab === 'watchlist' ? 'bg-yellow-900/40 text-yellow-950' : 'bg-yellow-500/15 text-yellow-400')}>{watchlist.length}</span>}</button>
              <button onClick={() => { setLobbyTab('all'); setLobbyFilter('mine' as any); }} className={clsx('px-4 py-2 rounded-lg font-medium text-sm transition-all border flex items-center gap-1.5', lobbyFilter === 'mine' ? 'bg-emerald-600 border-emerald-500 text-white shadow-md' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white')}><ListChecks className="w-3.5 h-3.5" /> My Listings {lobbyAuctions.filter(a=>a.createdBy===myUser?.username).length > 0 && <span className={clsx('rounded-full px-1.5 text-xs font-semibold', lobbyFilter === 'mine' ? 'bg-white/20 text-white' : 'bg-emerald-500/15 text-emerald-400')}>{lobbyAuctions.filter(a=>a.createdBy===myUser?.username).length}</span>}</button>
            </div>
          </div>

          {/* Search + Category Filter */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search auctions..." className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-slate-600 focus:border-violet-500/60 focus:bg-violet-500/5 outline-none transition-all" />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-700 rounded-lg transition-all text-slate-400 hover:text-white"><X className="w-3.5 h-3.5" /></button>}
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-violet-500/60 outline-none cursor-pointer flex-shrink-0 font-medium">
              <option value="newest">Sort: Newest</option>
              <option value="bids">Sort: Most Bids</option>
              <option value="ending">Sort: Ending Soon</option>
              <option value="price_low">Sort: Price ↑</option>
              <option value="price_high">Sort: Price ↓</option>
            </select>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-shrink-0">
              {['All','General','Electronics','Antiques','Art','Jewelry','Vehicles','Collectibles'].map(cat => (
                <button key={cat} onClick={() => setCategoryFilter(cat)} className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1', categoryFilter === cat ? 'bg-violet-600/90 text-white shadow-md' : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:border-white/20')}>
                  <span>{CAT_EMOJIS[cat]}</span>{cat}
                </button>
              ))}
            </div>
          </div>

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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {[
              { icon: <TrendingUp className="w-4 h-4" />, col: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/40', val: lobbyAuctions.filter(a=>a.status==='Active').length, label: 'Live Now', key: 'active' },
              { icon: <BarChart2 className="w-4 h-4" />, col: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/40', val: lobbyAuctions.reduce((s,a)=>s+a.bidCount,0), label: 'Total Bids', key: 'all' },
              { icon: <Clock className="w-4 h-4" />, col: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/40', val: lobbyAuctions.filter(a=>a.status==='Active'&&(a.endTime-lobbyNow)<60000).length, label: 'Ending Soon', key: 'ending_soon' },
              { icon: <Trophy className="w-4 h-4" />, col: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/40', val: lobbyAuctions.filter(a=>a.status==='Closed').length, label: 'Ended', key: 'ended' },
              { icon: <ShoppingCart className="w-4 h-4" />, col: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', val: lobbyAuctions.filter(a=>a.buyNowPrice&&a.status==='Active').length, label: 'Buy Now', key: 'buy_now' },
              { icon: <Star className="w-4 h-4" />, col: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/40', val: watchlist.length, label: 'Watchlist', key: 'watchlist' },
            ].map((s, i) => {
              const isActive = lobbyFilter === s.key;
              return (
              <button key={i} onClick={() => { setLobbyFilter(s.key as typeof lobbyFilter); if (s.key === 'watchlist') setLobbyTab('watchlist'); else setLobbyTab('all'); }} className={clsx('bg-white/[0.04] border rounded-xl p-3 flex items-center gap-2.5 transition-all cursor-pointer w-full text-left hover:bg-white/[0.07]', isActive ? [s.border, 'ring-1'] : 'border-white/[0.07] hover:border-white/15')}>
                <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', s.col, s.bg)}>{s.icon}</div>
                <div><p className={clsx('text-xl font-bold tabular-nums leading-tight', s.col)}>{s.val}</p><p className="text-[10px] text-slate-500 font-medium mt-0.5">{s.label}</p></div>
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
              else if (lobbyFilter === 'ending_soon') matchFilter = a.status === 'Active' && (a.endTime - lobbyNow) > 0 && (a.endTime - lobbyNow) < 60000;
              else if (lobbyFilter === 'ended') matchFilter = a.status === 'Closed';
              else if (lobbyFilter === 'buy_now') matchFilter = !!a.buyNowPrice && a.status === 'Active';
              else if (lobbyFilter === 'watchlist') matchFilter = watchlist.includes(a.id);
              else if (lobbyFilter === ('mine' as any)) matchFilter = a.createdBy === myUser?.username;
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
              ? filteredAuctions.find(a => a.status === 'Active' && a.bidCount >= 1) || filteredAuctions.find(a => a.status === 'Active') || null
              : null;
            const gridAuctions = featuredAuction ? filteredAuctions.filter(a => a.id !== featuredAuction.id) : filteredAuctions;
            return filteredAuctions.length > 0 ? (
            <div className="space-y-8">

              {/* ── FEATURED HERO CARD (The Curator style) ─────────────────── */}
              {featuredAuction && (() => {
                const fa = featuredAuction;
                const faEndsIn = fa.endTime - lobbyNow;
                const faMins = Math.max(0, Math.floor(faEndsIn / 60000));
                const faSecs = Math.max(0, Math.floor((faEndsIn % 60000) / 1000));
                const faEndingSoon = fa.status === 'Active' && faEndsIn > 0 && faEndsIn < 60000;
                return (
                  <div className="rounded-3xl overflow-hidden border border-white/[0.07] bg-[#0f0f1a] shadow-2xl shadow-black/40">
                    {/* Hero image */}
                    <div className="relative h-56 sm:h-72 overflow-hidden">
                      {fa.itemImage ? (
                        <img src={fa.itemImage} className="w-full h-full object-cover" alt={fa.itemTitle} />
                      ) : (
                        <div className="w-full h-full bg-slate-900 flex items-center justify-center"><TrendingUp className="w-16 h-16 text-slate-800" /></div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f1a] via-[#0f0f1a]/30 to-transparent" />
                      {/* Live badge */}
                      <div className="absolute top-4 left-4 flex gap-2">
                        <span className="flex items-center gap-1.5 bg-green-500/90 backdrop-blur-sm text-white text-[10px] font-semibold px-3 py-1.5 rounded-full shadow-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE AUCTION
                        </span>
                        {fa.bidCount >= 3 && <span className="bg-orange-500/90 backdrop-blur-sm text-white text-[10px] font-semibold px-3 py-1.5 rounded-full">🔥 HOT</span>}
                      </div>
                      {/* Watchlist */}
                      <button onClick={e => { e.stopPropagation(); toggleWatchlist(fa.id); }} className="absolute top-4 right-4 w-9 h-9 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-black/60 transition-all">
                        <Heart className={clsx('w-4 h-4 transition-all', watchlist.includes(fa.id) ? 'fill-red-400 text-red-400' : 'text-white/70')} />
                      </button>
                    </div>
                    {/* Details */}
                    <div className="p-6">
                      <p className="text-xs text-slate-500 mb-1">{fa.category}{fa.createdBy ? ` · by ${fa.createdBy}` : ''}</p>
                      <h3 className="text-2xl font-bold text-white leading-tight mb-5" style={{fontFamily:"'Space Grotesk',sans-serif"}}>{fa.itemTitle}</h3>
                      {fa.description && <p className="text-sm text-slate-400 leading-relaxed mb-5 line-clamp-2">{fa.description}</p>}
                      <div className="flex items-end gap-8 mb-5">
                        <div>
                          <p className="text-[10px] text-slate-500 font-medium tracking-widest uppercase mb-0.5">Current Bid</p>
                          <p className="text-3xl font-bold text-white tabular-nums" style={{fontFamily:"'Space Grotesk',sans-serif"}}>₹{fa.currentBid.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 font-medium tracking-widest uppercase mb-0.5">Ends In</p>
                          <p className={clsx('text-2xl font-bold tabular-nums', faEndingSoon ? 'text-red-400 animate-pulse' : 'text-emerald-400')} style={{fontFamily:"'Space Grotesk',sans-serif"}}>
                            {faEndsIn > 0 ? `${String(Math.floor(faMins/60)).padStart(2,'0')}h ${String(faMins%60).padStart(2,'0')}m ${String(faSecs).padStart(2,'0')}s` : 'Ended'}
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
                      <button onClick={() => joinAuction(fa.id)} className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3.5 rounded-xl text-sm transition-all active:scale-[0.98] shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2">
                        <Zap className="w-4 h-4" /> Place a Bid
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
                  const isHot = auction.bidCount >= 3 && auction.status === 'Active';
                  const isNew = !!auction.createdAt && (lobbyNow - auction.createdAt) < 4 * 60 * 1000 && auction.status === 'Active';
                  const timeLeft = auction.endTime - lobbyNow;
                  const tMins = Math.max(0, Math.floor(timeLeft / 60000));
                  const tSecs = Math.max(0, Math.floor((timeLeft % 60000) / 1000));
                  const priceRise = auction.startingPrice > 0 ? Math.round(((auction.currentBid - auction.startingPrice) / auction.startingPrice) * 100) : 0;
                  const isWinning = auction.highestBidderId === myUser?.username && auction.status === 'Active';
                  return (
                    <div key={auction.id} className={clsx(
                      'bg-[#0f0f1a] border rounded-2xl overflow-hidden transition-all duration-300 group cursor-pointer hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/50',
                      isEndingSoon ? 'border-red-500/40 shadow-red-500/10 shadow-lg' : isWinning ? 'border-yellow-500/30' : 'border-white/[0.06] hover:border-white/15'
                    )}>
                      {/* Card image */}
                      <div className="relative aspect-[16/10] bg-slate-950 overflow-hidden">
                        {auction.itemImage ? (
                          <img src={auction.itemImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={auction.itemTitle} />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{background: catColor + '15'}}><TrendingUp className="w-6 h-6" style={{color: catColor}} /></div>
                            <p className="text-[10px] text-slate-700">{auction.category}</p>
                          </div>
                        )}
                        {/* Top-left: time badge */}
                        <div className="absolute top-3 left-3 flex gap-1.5">
                          {auction.status === 'Active' && timeLeft > 0 ? (
                            <span className={clsx('flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-md', isEndingSoon ? 'bg-red-500/90 text-white animate-pulse' : 'bg-black/60 text-white/90')}>
                              <span className={clsx('w-1.5 h-1.5 rounded-full', isEndingSoon ? 'bg-white animate-ping' : 'bg-green-400')} />
                              {tMins}M {String(tSecs).padStart(2,'0')}S LEFT
                            </span>
                          ) : auction.status !== 'Active' ? (
                            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-slate-800/80 text-slate-400 backdrop-blur-md">ENDED</span>
                          ) : null}
                          {isNew && <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-violet-500/90 text-white backdrop-blur-md">NEW</span>}
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
                            <p className="text-[9px] text-slate-500 font-medium tracking-widest uppercase">Current Bid</p>
                            <p className="text-lg font-bold text-white tabular-nums leading-tight" style={{fontFamily:"'Space Grotesk',sans-serif"}}>₹{auction.currentBid?.toLocaleString()}</p>
                            {priceRise > 0 && <p className="text-[10px] text-emerald-400">↑ {priceRise}%</p>}
                            {auction.buyNowPrice && auction.status === 'Active' && (
                              <p className="text-[10px] text-sky-400 mt-0.5 flex items-center gap-1"><ShoppingCart className="w-3 h-3" />₹{auction.buyNowPrice.toLocaleString()}</p>
                            )}
                          </div>
                          <button
                            onClick={() => joinAuction(auction.id)}
                            className={clsx('flex-shrink-0 font-semibold px-4 py-2 rounded-lg text-xs transition-all active:scale-95',
                              auction.status === 'Active' ? 'text-white hover:brightness-110 shadow-md' : 'bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300'
                            )}
                            style={auction.status === 'Active' ? {background: catColor, boxShadow: `0 4px 12px ${catColor}30`} : undefined}
                          >
                            {auction.status === 'Active' ? 'Bid Now' : 'Results'}
                          </button>
                        </div>

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
      {CreateAuctionModal()}

      {/* Winner Overlay */}
      {winnerOverlay && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-500">
          <div className="bg-gradient-to-br from-yellow-500 to-amber-600 text-slate-950 rounded-3xl p-10 shadow-2xl max-w-sm w-full text-center relative">
            <button onClick={() => setWinnerOverlay(null)} className="absolute top-4 right-4 p-2 bg-black/20 rounded-xl"><X className="w-4 h-4" /></button>
            <Trophy className="w-16 h-16 mx-auto mb-4" />
            <p className="text-xs font-semibold opacity-70 mb-2 uppercase tracking-wide">Auction Closed — Winner</p>
            <p className="text-3xl font-bold" style={{fontFamily:"'Space Grotesk',sans-serif"}}>{winnerOverlay.winner}</p>
            <p className="text-5xl font-bold tabular-nums mt-3" style={{fontFamily:"'Space Grotesk',sans-serif"}}>₹{winnerOverlay.amount?.toLocaleString()}</p>
            {winnerOverlay.winner === myUser?.username && (
              paidAuctions.has(winnerOverlay.auctionId) ? (
                <div className="mt-5 bg-green-600/90 rounded-2xl py-3 px-5 flex items-center justify-center gap-2">
                  <Check className="w-5 h-5" />
                  <span className="text-sm font-semibold">Payment Complete!</span>
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
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center">
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
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => { socket.emit('leave_auction', auctionState.auctionId); setView('lobby'); }} className="p-2 hover:bg-white/8 rounded-lg transition-all text-slate-400 hover:text-white"><ChevronLeft className="w-5 h-5" /></button>
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-lg flex items-center justify-center shadow-md shadow-violet-500/20">
               <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-[17px] font-bold tracking-tight text-white" style={{fontFamily:"'Space Grotesk', sans-serif"}}>UltraBid Live</h1>
              <p className="text-[10px] text-slate-500 -mt-0.5 truncate max-w-[180px]">{auctionState.itemTitle}</p>
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

          <div className="flex items-center gap-4">
             <div className="relative">
               <button onClick={() => setShowNotifications(v => !v)} className="relative p-2.5 bg-violet-950/50 rounded-xl border border-violet-900/50 hover:border-violet-500/60 transition-all text-violet-400 hover:text-white">
                 <Bell className="w-4 h-4" />
                 {notifications.filter(n => !n.read).length > 0 && (
                   <span className="absolute -top-1 -right-1 w-4 h-4 bg-fuchsia-500 rounded-full text-[9px] font-black text-white flex items-center justify-center">{Math.min(9, notifications.filter(n => !n.read).length)}</span>
                 )}
               </button>
               {showNotifications && (
                 <div className="absolute right-0 top-12 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-[200] overflow-hidden">
                   <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                     <p className="text-xs font-semibold text-white uppercase tracking-wide">Notifications</p>
                     <button onClick={() => setNotifications(prev => prev.map(n => ({...n, read: true})))} className="text-[10px] text-violet-400 font-bold hover:text-violet-300">Mark all read</button>
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
             <button onClick={toggleMute} title={soundMuted ? 'Unmute sounds' : 'Mute sounds'} className="p-2.5 bg-violet-950/50 rounded-xl border border-violet-900/50 hover:border-violet-500/60 transition-all text-violet-400 hover:text-white">{soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}</button>
             <button onClick={() => { const url = `${window.location.origin}?auction=${auctionState.auctionId}`; navigator.clipboard.writeText(url).then(() => { setCopiedLink(true); addToast('info', 'Auction link copied!'); setTimeout(() => setCopiedLink(false), 2000); }); }} title="Share auction" className="p-2.5 bg-violet-950/50 rounded-xl border border-violet-900/50 hover:border-violet-500/60 transition-all text-violet-400 hover:text-white">{copiedLink ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}</button>
             <button onClick={loadProfile} className="bg-violet-950/60 border border-violet-900/50 rounded-full py-1.5 px-4 flex items-center gap-3 hover:border-violet-500/60 transition-all">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-black border border-violet-800/50 flex-shrink-0" style={{ background: myUser?.username ? userColor(myUser.username) : '#7c3aed' }}>
                  {myUser?.username?.[0] || 'U'}
                </div>
                <span className="text-xs font-bold text-violet-200 tracking-wide">{myUser?.username}</span>
             </button>
             <button onClick={handleLogout} className="bg-white/5 text-slate-400 px-4 py-1.5 rounded-lg font-medium text-sm hover:text-red-400 hover:bg-red-900/20 border border-white/10 transition-all">
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

      <main className="relative max-w-7xl mx-auto px-6 py-8 grid grid-cols-12 gap-6 z-10">
        <div className="col-span-12 lg:col-span-3 space-y-6">
           <div className="bg-slate-900/50 backdrop-blur-md border border-violet-900/25 rounded-3xl overflow-hidden shadow-2xl relative group">
              <div className="p-6 border-b border-slate-800/50 flex justify-between items-start">
                 <div>
                    <h2 className="text-xl font-bold text-white leading-tight" style={{fontFamily:"'Space Grotesk', sans-serif"}}>
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
                    {auctionState.itemImage ? (
                       <img src={auctionState.itemImage} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" alt="Lot" />
                    ) : (
                       <div className="text-slate-700 font-black tracking-widest italic opacity-50">IMAGE PENDING</div>
                    )}
                 </div>
              </div>

              <div className="p-6 space-y-6">
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

                 <div className={clsx("bg-slate-950 rounded-2xl p-4 border flex flex-col gap-2 transition-all duration-300", isUrgent ? "border-red-500/80 shadow-[0_0_20px_rgba(239,68,68,0.3)]" : "border-slate-800/50")}>
                    <div className="flex justify-between items-center">
                       <p className={clsx("text-xs font-medium flex items-center gap-1.5", isUrgent ? "text-red-400" : "text-slate-400")}>
                         <Clock className="w-3 h-3" /> Time Remaining
                       </p>
                    </div>
                    <div className={clsx("text-3xl font-black font-mono tracking-tighter tabular-nums drop-shadow-md", isUrgent ? "text-red-400 animate-pulse" : "text-white", auctionState.status === 'Closed' ? 'opacity-40' : '')}>
                       {auctionState.status === 'Closed' ? 'ENDED' : formatTime(timeRemaining)}
                    </div>
                    {isUrgent && <p className="text-xs text-red-400 font-medium animate-pulse">Final seconds!</p>}
                 </div>

                 {/* Emoji reactions */}
                 <div className="flex gap-2 justify-center">
                   {REACTION_KEYS.map(k => (
                     <button key={k} onClick={() => handleReaction(k)} className="text-xl hover:scale-125 transition-transform active:scale-100 bg-slate-800/50 rounded-xl p-2 hover:bg-slate-700/50">{REACTION_EMOJI[k]}</button>
                   ))}
                 </div>

                 {/* Buy Now */}
                 {auctionState.buyNowPrice != null && auctionState.status === 'Active' && (
                   <button onClick={handleBuyNow} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-500/20">
                     <ShoppingCart className="w-4 h-4" /> Buy Now ₹{auctionState.buyNowPrice.toLocaleString()}
                   </button>
                 )}

                 {/* Bid increment presets */}
                 <div className="grid grid-cols-4 gap-2">
                   {[100, 500, 1000, 5000].map(inc => (
                     <button key={inc} onClick={() => { const next = (auctionState.currentBid || auctionState.startingPrice) + inc; socket.emit('place_bid', { auctionId: auctionState.auctionId, amount: next }); }} disabled={auctionState.status === 'Closed'} className="bg-white/5 hover:bg-violet-600 border border-white/10 hover:border-violet-500 text-white font-medium py-2 rounded-lg text-sm transition-all disabled:opacity-30 active:scale-95">
                       +{inc >= 1000 ? `${inc/1000}k` : inc}
                     </button>
                   ))}
                 </div>
                 <p className="text-[10px] text-slate-600 text-center">Quick increment · Min bid: ₹100</p>

                 {/* Auto-Bid Panel */}
                 {auctionState.status === 'Active' && (
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
                     <div className="flex items-center justify-center gap-2 bg-green-600/15 border border-green-600/30 rounded-2xl py-3 px-4">
                       <Check className="w-4 h-4 text-green-400" />
                       <span className="text-xs font-medium text-green-400">Payment Complete</span>
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

        <div className="col-span-12 lg:col-span-6 space-y-6">
           <div className="bg-slate-900/50 backdrop-blur-md border border-violet-900/25 rounded-3xl p-3 shadow-2xl relative overflow-hidden h-[540px] flex flex-col">
              <div className="absolute top-6 left-6 z-20 flex gap-2">
                 {isLive && (
                    <div className="bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-2 shadow-lg shadow-red-500/20 border border-red-500 animate-pulse">
                       <div className="w-1.5 h-1.5 bg-white rounded-full"></div> LIVE
                    </div>
                 )}
                 <div className="bg-slate-950/80 backdrop-blur-md text-white text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-2 border border-slate-800">
                    <Users className="w-3 h-3 text-violet-400" /> {viewerCount} WATCHING
                 </div>
              </div>

              {!isLive && !isBroadcaster && (
                <div className="absolute top-6 right-6 z-20">
                   <button onClick={startBroadcast} className="bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium px-4 py-1.5 rounded-full shadow-md shadow-violet-500/20 transition-all flex items-center gap-1.5">
                      <Video className="w-3 h-3" /> Start Broadcast
                   </button>
                </div>
              )}

              <div className="flex-1 bg-slate-950 rounded-2xl relative overflow-hidden border border-slate-800 flex items-center justify-center">
                 <video ref={videoRef} autoPlay playsInline muted={isBroadcaster} className={clsx("w-full h-full object-cover transition-opacity duration-1000", isLive ? "opacity-100" : "opacity-0")} />
                 
                 {!isLive && (
                    <div className="flex flex-col items-center justify-center text-center p-8">
                       <div className="w-20 h-20 rounded-full bg-slate-900 border-2 border-slate-800 flex items-center justify-center mb-6">
                          <Play className="w-8 h-8 text-slate-700 ml-1" />
                       </div>
                       <h3 className="text-xl font-black text-slate-300 tracking-tight">Stream Standby</h3>
                       <p className="text-xs text-slate-500 font-medium tracking-wide mt-2 max-w-xs">Waiting for the auctioneer to initialize broadcast</p>
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

              <div className="p-4 mt-auto">
                 <form onSubmit={handlePlaceBid} className="flex gap-3">
                    <div className="flex-1 relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate-600">₹</span>
                       <input 
                         type="number" 
                         value={bidAmount} 
                         onChange={(e)=>setBidAmount(e.target.value)} 
                         onFocus={() => { if (!bidAmount) setBidAmount(String(auctionState.currentBid + 100)); }}
                         placeholder={`Min ₹${(auctionState.currentBid + 100).toLocaleString()}`}
                         className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-10 text-2xl font-bold text-white focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/10 transition-all placeholder:text-slate-700 tabular-nums" 
                       />
                    </div>
                    <button 
                      type="submit"
                      disabled={auctionState.status === 'Closed'}
                      className="px-8 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl shadow-lg shadow-violet-500/20 hover:scale-[1.02] active:scale-95 transition-all text-lg disabled:opacity-30"
                    >
                       Bid
                    </button>
                 </form>
              </div>
           </div>

           <div className={clsx("bg-gradient-to-r from-violet-700 to-fuchsia-700 rounded-3xl p-6 flex items-center shadow-2xl shadow-violet-900/40 transition-all duration-700", auctionState.highestBidderId === myUser?.username ? "border-yellow-400 border-[3px] scale-[1.02]" : "border-violet-900/40 border")}>
              <div className="bg-white/10 p-4 rounded-2xl mr-6">
                <Trophy className={clsx("w-8 h-8", auctionState.highestBidderId === myUser?.username ? "text-yellow-400 animate-bounce" : "text-white/50")} />
              </div>
              <div className="flex-1">
                 <p className="text-xs text-white/60 font-medium tracking-wide">Current Top Bidder</p>
                 <div className="flex items-baseline gap-3">
                    <span className="text-xl font-bold text-white">
                       {auctionState.highestBidderId === 'None' ? 'Waiting for first bid...' : auctionState.highestBidderId}
                    </span>
                    <span className="text-xl font-semibold text-white/40 italic">₹{auctionState.currentBid.toLocaleString()}</span>
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

           <div className="col-span-12 lg:col-span-3">
           <div className="bg-slate-900/50 backdrop-blur-md border border-violet-900/25 rounded-3xl flex flex-col h-[744px] shadow-2xl">
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

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3b1f6b; border-radius: 10px; }
        @keyframes floatUp { 0% { transform: translateY(0) scale(1); opacity: 1; } 100% { transform: translateY(-200px) scale(1.5); opacity: 0; } }
        @keyframes bidFlash { 0% { color: #4ade80; transform: scale(1.1); text-shadow: 0 0 24px rgba(74,222,128,0.7); } 60% { color: #c084fc; transform: scale(1.02); } 100% { color: #c084fc; transform: scale(1); text-shadow: none; } }
        .bid-flash { animation: bidFlash 1.4s ease-out forwards; }
      `}} />
    </div>
  );
}

export default App;

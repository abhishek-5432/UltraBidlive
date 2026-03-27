import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { getDB } from './db.js';
import { generateToken, verifyToken } from './auth.js';
import { v4 as uuidv4 } from 'uuid';
import Razorpay from 'razorpay';
import crypto from 'crypto';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '646832990645-7opdki9o8ta3t0ge5h0clrdakrf81ncf.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ── Razorpay ──────────────────────────────────────────────────────
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_YOUR_KEY_ID';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'YOUR_KEY_SECRET';
const razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });

// ── REST Auth Middleware ──────────────────────────────────────────
function authMiddleware(req: any, res: any, next: any) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const decoded = verifyToken(auth.slice(7));
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });
  req.user = decoded;
  next();
}

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const db = await getDB();

app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const existing = db.data.users.find(u => u.email === email || u.username === username);
    if (existing) return res.status(400).json({ error: 'User already exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { id: uuidv4(), username, email, password: hashedPassword };
    db.data.users.push(newUser);
    await db.write();
    const token = generateToken(newUser.id, newUser.username);
    res.json({ token, user: { id: newUser.id, username: newUser.username } });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.email) return res.status(400).json({ error: 'Invalid Google token' });
    const email = payload.email;
    let user = db.data.users.find((u: any) => u.email === email);
    if (!user) {
      const baseName = (payload.name || email.split('@')[0] || 'google_user').replace(/\s+/g, '_').toLowerCase();
      const username = db.data.users.find((u: any) => u.username === baseName)
        ? `${baseName}_${Date.now().toString(36)}`
        : baseName;
      user = { id: uuidv4(), username, email, password: '', googleId: payload.sub || '' };
      db.data.users.push(user);
      await db.write();
    }
    const token = generateToken(user.id, user.username);
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch { res.status(401).json({ error: 'Google authentication failed' }); }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = db.data.users.find(u => u.email === email);
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });
    const token = generateToken(user.id, user.username);
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/auctions/:id/bids', (req, res) => {
  const bids = db.data.bids
    .filter(b => b.auctionId === req.params.id)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100);
  res.json(bids);
});

app.get('/api/auctions', (_req, res) => {
  const auctions = db.data.auctions.map(a => ({
    id: a.id, itemTitle: a.itemTitle, itemImage: a.itemImage,
    itemImages: a.itemImages ?? [a.itemImage],
    startingPrice: a.startingPrice, currentBid: a.currentBid,
    highestBidderId: a.highestBidderId, status: a.status, endTime: a.endTime,
    startTime: a.startTime ?? a.createdAt ?? Date.now(),
    reservePrice: a.reservePrice ?? null, buyNowPrice: a.buyNowPrice ?? null,
    category: a.category ?? 'General', createdBy: a.createdBy ?? 'system',
    bidCount: db.data.bids.filter(b => b.auctionId === a.id).length,
    description: a.description ?? '',
    createdAt: (a as any).createdAt ?? a.endTime,
  }));
  res.json(auctions);
});

app.get('/api/profile/:username', (req, res) => {
  const { username } = req.params;
  const user = db.data.users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const userBids = db.data.bids.filter(b => b.userId === username).sort((a, b) => b.timestamp - a.timestamp);
  const wins = db.data.auctions.filter(a => a.highestBidderId === username && a.status === 'Closed');
  const bidHistory = userBids.map(b => {
    const auction = db.data.auctions.find(a => a.id === b.auctionId);
    return { auctionTitle: auction?.itemTitle ?? 'Unknown', amount: b.amount, timestamp: b.timestamp, won: auction?.highestBidderId === username && auction?.status === 'Closed' };
  });
  res.json({ username: user.username, totalBids: userBids.length, wins: wins.length, bidHistory: bidHistory.slice(0, 20) });
});

// ── Payment: create Razorpay order ───────────────────────────────
app.post('/api/payment/create-order', authMiddleware, async (req: any, res: any) => {
  const { auctionId } = req.body;
  try {
    const auction = db.data.auctions.find(a => a.id === auctionId);
    if (!auction || auction.status !== 'Closed') return res.status(400).json({ error: 'Auction not closed yet' });
    if (auction.highestBidderId !== req.user.username) return res.status(403).json({ error: 'You are not the winner' });
    const alreadyPaid = db.data.payments.find(p => p.auctionId === auctionId && p.status === 'paid');
    if (alreadyPaid) return res.status(400).json({ error: 'Already paid' });
    const order = await razorpay.orders.create({
      amount: auction.currentBid * 100, // paise
      currency: 'INR',
      receipt: `auction_${auctionId}`.slice(0, 40),
      notes: { auctionId, itemTitle: auction.itemTitle, winner: auction.highestBidderId },
    });
    res.json({
      orderId: order.id,
      amount: auction.currentBid * 100,
      currency: 'INR',
      key: RAZORPAY_KEY_ID,
      itemTitle: auction.itemTitle,
      userName: req.user.username,
    });
  } catch (err: any) {
    console.error('Razorpay create-order error:', err);
    res.status(500).json({ error: err?.message || 'Payment initiation failed' });
  }
});

// ── Payment: verify signature ─────────────────────────────────────
app.post('/api/payment/verify', authMiddleware, async (req: any, res: any) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, auctionId } = req.body;
  try {
    const hmac = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
    const generated_signature = hmac.digest('hex');
    if (generated_signature !== razorpay_signature) return res.status(400).json({ error: 'Invalid payment signature' });
    const auction = db.data.auctions.find(a => a.id === auctionId);
    const payment = {
      id: uuidv4(),
      auctionId,
      userId: req.user.username,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      amount: auction?.currentBid ?? 0,
      status: 'paid' as const,
      timestamp: Date.now(),
    };
    db.data.payments.push(payment);
    await db.write();
    // Notify winner + seller via socket
    io.to(`user:${req.user.username}`).emit('payment_confirmed', { auctionId, paymentId: razorpay_payment_id, amount: payment.amount });
    if (auction?.createdBy) io.to(`user:${auction.createdBy}`).emit('seller_payment_received', { auctionId, itemTitle: auction.itemTitle, buyer: req.user.username, amount: payment.amount, paymentId: razorpay_payment_id });
    res.json({ success: true, paymentId: razorpay_payment_id });
  } catch (err: any) {
    console.error('Razorpay verify error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ── Payment: get status ───────────────────────────────────────────
app.get('/api/payment/status/:auctionId', authMiddleware, (req: any, res: any) => {
  const paid = db.data.payments.find(p => p.auctionId === req.params.auctionId && p.status === 'paid');
  res.json({ paid: !!paid, payment: paid || null });
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  const decoded = verifyToken(token);
  if (!decoded) return next(new Error('Authentication error'));
  (socket as any).user = decoded;
  next();
});

const bidRateLimit = new Map<string, number>();
const bidQueue: any[] = [];
const auctionViewers = new Map<string, Set<string>>();
// Auto-bid: auctionId -> Map<userId, maxAmount>
const maxBids = new Map<string, Map<string, number>>();

function emitViewerCount(auctionId: string) {
  const count = auctionViewers.get(auctionId)?.size ?? 0;
  io.to(`auction:${auctionId}`).emit('viewer_count', count);
}
let isProcessing = false;

async function processQueue() {
  if (isProcessing || bidQueue.length === 0) return;
  isProcessing = true;
  while (bidQueue.length > 0) {
    const job = bidQueue.shift();
    if (!job) continue;
    const { auctionId, amount, userId, socketId } = job;
    try {
      const auction = db.data.auctions.find(a => a.id === auctionId);
      if (!auction || auction.status !== 'Active') continue;
      const minBid = auction.currentBid + 100;
      if (amount < minBid) { io.to(socketId).emit('bid_error', `Minimum bid is Rs.${minBid.toLocaleString()}`); continue; }
      const prevHighest = auction.highestBidderId;
      auction.currentBid = amount;
      auction.highestBidderId = userId;
      const timeRemaining = auction.endTime - Date.now();
      if (timeRemaining < 30000 && timeRemaining > 0) auction.endTime = Date.now() + 30000;
      db.data.bids.push({ id: uuidv4(), auctionId, userId, amount, timestamp: Date.now() });
      if (auction.buyNowPrice && amount >= auction.buyNowPrice) auction.status = 'Closed';
      if (prevHighest && prevHighest !== 'None' && prevHighest !== userId) {
        io.to(`user:${prevHighest}`).emit('outbid', { auctionId, auctionTitle: auction.itemTitle, newBid: amount });
      }
      // ── Auto-bid resolution loop ──
      if (auction.status === 'Active') {
        const auctionMaxBids = maxBids.get(auctionId);
        if (auctionMaxBids) {
          for (let iter = 0; iter < 20; iter++) {
            const minNext = auction.currentBid + 100;
            const currentWinner = auction.highestBidderId;
            let bestUser = ''; let bestMax = 0;
            for (const [uid2, maxAmt] of auctionMaxBids.entries()) {
              if (uid2 === currentWinner) continue;
              if (maxAmt >= minNext && maxAmt > bestMax) { bestUser = uid2; bestMax = maxAmt; }
            }
            if (!bestUser) break;
            const autoBidAmt = minNext;
            const prevH = auction.highestBidderId;
            auction.currentBid = autoBidAmt;
            auction.highestBidderId = bestUser;
            const tr2 = auction.endTime - Date.now();
            if (tr2 < 30000 && tr2 > 0) auction.endTime = Date.now() + 30000;
            db.data.bids.push({ id: uuidv4(), auctionId, userId: bestUser, amount: autoBidAmt, timestamp: Date.now() });
            if (auction.buyNowPrice && autoBidAmt >= auction.buyNowPrice) auction.status = 'Closed';
            if (prevH && prevH !== 'None' && prevH !== bestUser) {
              io.to(`user:${prevH}`).emit('outbid', { auctionId, auctionTitle: auction.itemTitle, newBid: autoBidAmt });
            }
            io.to(`user:${bestUser}`).emit('auto_bid_placed', { auctionId, auctionTitle: auction.itemTitle, amount: autoBidAmt });
            if (auction.status !== 'Active') break;
          }
        }
      }
      await db.write();
      const history = db.data.bids.filter(b => b.auctionId === auctionId).sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
      const auctionUpdate = {
        itemTitle: auction.itemTitle, itemImage: auction.itemImage,
        itemImages: auction.itemImages ?? [auction.itemImage],
        currentBid: auction.currentBid, startingPrice: auction.startingPrice,
        highestBidderId: auction.highestBidderId, status: auction.status,
        endTime: auction.endTime, reservePrice: auction.reservePrice ?? null, buyNowPrice: auction.buyNowPrice ?? null,
        history: history.map(h => ({ userId: h.userId, amount: h.amount })), auctionId, startTime: auction.startTime ?? Date.now(), serverTimestamp: Date.now(),
      };
      io.to(`auction:${auctionId}`).emit('auction_updated', auctionUpdate);
      io.emit('lobby_auction_update', { id: auctionId, currentBid: auction.currentBid, highestBidderId: auction.highestBidderId, status: auction.status, endTime: auction.endTime, startTime: auction.startTime ?? Date.now(), bidCount: db.data.bids.filter(b => b.auctionId === auctionId).length });
    } catch (err) { console.error('Error processing bid:', err); }
  }
  isProcessing = false;
}

let broadcasterId = '';

io.on('connection', (socket) => {
  const user = (socket as any).user;
  console.log(`User connected: ${user.username}`);
  socket.join(`user:${user.username}`);

  socket.on('broadcaster', () => { broadcasterId = socket.id; socket.broadcast.emit('broadcaster'); });
  socket.on('watcher', () => { if (broadcasterId) socket.to(broadcasterId).emit('watcher', socket.id); });
  socket.on('offer', (id, msg) => socket.to(id).emit('offer', socket.id, msg));
  socket.on('answer', (id, msg) => socket.to(id).emit('answer', socket.id, msg));
  socket.on('candidate', (id, msg) => socket.to(id).emit('candidate', socket.id, msg));
  socket.on('disconnect', () => {
    if (broadcasterId === socket.id) socket.broadcast.emit('broadcaster_disconnect');
    socket.broadcast.emit('disconnectPeer', socket.id);
    // Remove from all auction rooms
    for (const [auctionId, viewers] of auctionViewers.entries()) {
      if (viewers.delete(socket.id)) emitViewerCount(auctionId);
    }
  });

  socket.on('join_auction', async (auctionId) => {
    socket.join(`auction:${auctionId}`);
    // Track viewer
    if (!auctionViewers.has(auctionId)) auctionViewers.set(auctionId, new Set());
    auctionViewers.get(auctionId)!.add(socket.id);
    emitViewerCount(auctionId);
    try {
      const auction = db.data.auctions.find(a => a.id === auctionId);
      if (!auction) {
        socket.emit('auction_not_found'); return;
      }
      if (auction.status === 'Active' && auction.endTime < Date.now()) {
        auction.endTime = Date.now() + 2 * 60000;
        await db.write();
      }
      const history = db.data.bids.filter(b => b.auctionId === auction!.id).sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
      const recentChats = db.data.chats.filter(c => c.auctionId === auction!.id).sort((a, b) => a.timestamp - b.timestamp).slice(-30);
      socket.emit('auction_state', {
        itemTitle: auction.itemTitle, itemImage: auction.itemImage,
        itemImages: auction.itemImages ?? [auction.itemImage],
        currentBid: auction.currentBid, startingPrice: auction.startingPrice,
        highestBidderId: auction.highestBidderId, status: auction.status,
        endTime: auction.endTime, reservePrice: auction.reservePrice ?? null, buyNowPrice: auction.buyNowPrice ?? null,
        history: history.map(h => ({ userId: h.userId, amount: h.amount })),
        auctionId: auction.id, startTime: auction.startTime ?? auction.createdAt ?? Date.now(), serverTimestamp: Date.now(), recentChats,
        description: (auction as any).description || '',
      });
    } catch (err) { console.error('join_auction error:', err); }
  });

  socket.on('leave_auction', (auctionId: string) => {
    socket.leave(`auction:${auctionId}`);
    auctionViewers.get(auctionId)?.delete(socket.id);
    emitViewerCount(auctionId);
  });

  socket.on('set_max_bid', ({ auctionId, maxAmount }: { auctionId: string; maxAmount: number }) => {
    const auction = db.data.auctions.find(a => a.id === auctionId);
    if (!auction || auction.status !== 'Active') { socket.emit('bid_error', 'Auction is not active.'); return; }
    const minRequired = auction.currentBid + 100;
    if (!maxAmount || maxAmount < minRequired) { socket.emit('bid_error', `Max bid must be at least Rs.${minRequired.toLocaleString()}`); return; }
    if (!maxBids.has(auctionId)) maxBids.set(auctionId, new Map());
    maxBids.get(auctionId)!.set(user.username, Number(maxAmount));
    socket.emit('max_bid_confirmed', { auctionId, maxAmount: Number(maxAmount) });
  });

  socket.on('cancel_max_bid', ({ auctionId }: { auctionId: string }) => {
    maxBids.get(auctionId)?.delete(user.username);
    socket.emit('max_bid_confirmed', { auctionId, maxAmount: null });
  });

  socket.on('place_bid', (data) => {
    const last = bidRateLimit.get(user.username) ?? 0;
    if (Date.now() - last < 2000) { socket.emit('bid_error', 'Too fast! Wait 2 seconds between bids.'); return; }
    bidRateLimit.set(user.username, Date.now());
    data.userId = user.username; data.socketId = socket.id;
    bidQueue.push(data); processQueue();
  });

  socket.on('buy_now', async ({ auctionId }) => {
    const auction = db.data.auctions.find(a => a.id === auctionId);
    if (!auction || auction.status !== 'Active' || !auction.buyNowPrice) return;
    const prevHighest = auction.highestBidderId;
    auction.currentBid = auction.buyNowPrice; auction.highestBidderId = user.username; auction.status = 'Closed';
    db.data.bids.push({ id: uuidv4(), auctionId, userId: user.username, amount: auction.buyNowPrice, timestamp: Date.now() });
    await db.write();
    if (prevHighest && prevHighest !== 'None' && prevHighest !== user.username) {
      io.to(`user:${prevHighest}`).emit('outbid', { auctionId, auctionTitle: auction.itemTitle, newBid: auction.buyNowPrice });
    }
    const history = db.data.bids.filter(b => b.auctionId === auctionId).sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
    io.to(`auction:${auctionId}`).emit('auction_updated', {
      itemTitle: auction.itemTitle, itemImage: auction.itemImage,
      itemImages: auction.itemImages ?? [auction.itemImage],
      currentBid: auction.currentBid, startingPrice: auction.startingPrice,
      highestBidderId: auction.highestBidderId, status: auction.status,
      endTime: auction.endTime, reservePrice: auction.reservePrice ?? null, buyNowPrice: auction.buyNowPrice ?? null,
      history: history.map(h => ({ userId: h.userId, amount: h.amount })), auctionId, startTime: auction.startTime ?? Date.now(), serverTimestamp: Date.now(),
    });
    io.emit('lobby_auction_update', { id: auctionId, currentBid: auction.currentBid, highestBidderId: auction.highestBidderId, status: auction.status, endTime: auction.endTime, startTime: auction.startTime ?? Date.now(), bidCount: db.data.bids.filter(b => b.auctionId === auctionId).length });
  });

  socket.on('create_auction', async (data) => {
    const { itemTitle, itemImage, itemImages, startingPrice, durationMinutes, reservePrice, buyNowPrice, category, description, startAt } = data;
    const cleanedImages = Array.isArray(itemImages)
      ? itemImages.map((img: string) => img?.trim()).filter(Boolean).slice(0, 6)
      : [itemImage].filter(Boolean);
    const primaryImage = cleanedImages[0] || itemImage || 'https://images.unsplash.com/photo-1587836374828-cb4387dfee7d?auto=format&fit=crop&q=80&w=400&h=400';
    const parsedStart = startAt ? new Date(startAt).getTime() : Date.now();
    const safeStart = Number.isFinite(parsedStart) && parsedStart > Date.now() + 30000 ? parsedStart : Date.now();
    const isScheduled = safeStart > Date.now() + 10000;
    const auction: import('./db.js').Auction = {
      id: uuidv4(), itemTitle, createdBy: user.username,
      itemImage: primaryImage,
      itemImages: cleanedImages.length ? cleanedImages : [primaryImage],
      startingPrice: Number(startingPrice) || 1000, currentBid: Number(startingPrice) || 1000,
      highestBidderId: 'None', status: isScheduled ? 'Upcoming' : 'Active',
      startTime: safeStart,
      endTime: safeStart + (Number(durationMinutes) || 2) * 60000,
      createdAt: Date.now(),
      category: category || 'General', reservePrice: reservePrice ? Number(reservePrice) : null, buyNowPrice: buyNowPrice ? Number(buyNowPrice) : null,
      description: description || '',
    };
    db.data.auctions.push(auction); await db.write();
    io.emit('auction_created', { ...auction, bidCount: 0 });
    socket.emit('auction_created_confirm', { auctionId: auction.id, status: auction.status, startTime: auction.startTime });
  });

  socket.on('restart_auction', async ({ auctionId, durationMinutes }) => {
    const auction = db.data.auctions.find(a => a.id === auctionId);
    if (!auction) return;
    auction.status = 'Active'; auction.startTime = Date.now(); auction.endTime = Date.now() + (Number(durationMinutes) || 2) * 60000;
    auction.currentBid = auction.startingPrice; auction.highestBidderId = 'None';
    await db.write();
    io.to(`auction:${auctionId}`).emit('auction_updated', {
      itemTitle: auction.itemTitle, itemImage: auction.itemImage,
      itemImages: auction.itemImages ?? [auction.itemImage],
      currentBid: auction.currentBid, startingPrice: auction.startingPrice,
      highestBidderId: auction.highestBidderId, status: auction.status,
      endTime: auction.endTime, reservePrice: auction.reservePrice ?? null, buyNowPrice: auction.buyNowPrice ?? null,
      history: [], auctionId, startTime: auction.startTime ?? Date.now(), serverTimestamp: Date.now(),
    });
  });

  socket.on('extend_time', async ({ auctionId, minutes }: { auctionId: string; minutes: number }) => {
    const auction = db.data.auctions.find(a => a.id === auctionId);
    if (!auction || (auction as any).createdBy !== user.username) return;
    if (auction.status !== 'Active') return;
    auction.endTime += (Number(minutes) || 2) * 60000;
    await db.write();
    const history = db.data.bids.filter(b => b.auctionId === auctionId).sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
    io.to(`auction:${auctionId}`).emit('auction_updated', {
      itemTitle: auction.itemTitle, itemImage: auction.itemImage,
      itemImages: auction.itemImages ?? [auction.itemImage],
      currentBid: auction.currentBid, startingPrice: auction.startingPrice,
      highestBidderId: auction.highestBidderId, status: auction.status,
      endTime: auction.endTime, reservePrice: auction.reservePrice ?? null, buyNowPrice: auction.buyNowPrice ?? null,
      history: history.map(h => ({ userId: h.userId, amount: h.amount })), auctionId, startTime: auction.startTime ?? Date.now(), serverTimestamp: Date.now(),
    });
    io.emit('lobby_auction_update', { id: auctionId, currentBid: auction.currentBid, highestBidderId: auction.highestBidderId, status: auction.status, endTime: auction.endTime, bidCount: db.data.bids.filter(b => b.auctionId === auctionId).length });
  });

  socket.on('delete_auction', async ({ auctionId }: { auctionId: string }) => {
    const auction = db.data.auctions.find(a => a.id === auctionId);
    if (!auction || (auction as any).createdBy !== user.username) return;
    const bidCount = db.data.bids.filter(b => b.auctionId === auctionId).length;
    if (bidCount > 0) { socket.emit('bid_error', 'Cannot delete an auction that has bids.'); return; }
    auction.status = 'Cancelled' as any;
    await db.write();
    io.emit('auction_deleted', { auctionId });
  });

  socket.on('send_chat', async ({ auctionId, message }) => {
    if (!message?.trim() || message.length > 200) return;
    const chatMsg = { id: uuidv4(), auctionId, userId: user.username, message: message.trim(), timestamp: Date.now() };
    db.data.chats.push(chatMsg);
    await db.write();
    io.to(`auction:${auctionId}`).emit('chat_message', chatMsg);
  });

  socket.on('send_reaction', ({ auctionId, emoji }) => {
    const allowed = ['FIRE', 'CLAP', 'MONEY', 'WOW', 'ROCKET'];
    if (!allowed.includes(emoji)) return;
    io.to(`auction:${auctionId}`).emit('reaction', { userId: user.username, emoji });
  });

  socket.on('update_item', async ({ auctionId, itemTitle, itemImage }) => {
    const auction = db.data.auctions.find(a => a.id === auctionId);
    if (!auction) return;
    auction.itemTitle = itemTitle || auction.itemTitle;
    auction.itemImage = itemImage || auction.itemImage;
    await db.write();
    const history = db.data.bids.filter(b => b.auctionId === auctionId).sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
    io.to(`auction:${auctionId}`).emit('auction_updated', {
      itemTitle: auction.itemTitle, itemImage: auction.itemImage,
      itemImages: auction.itemImages ?? [auction.itemImage],
      currentBid: auction.currentBid, startingPrice: auction.startingPrice,
      highestBidderId: auction.highestBidderId, status: auction.status,
      endTime: auction.endTime, reservePrice: auction.reservePrice ?? null, buyNowPrice: auction.buyNowPrice ?? null,
      history: history.map(h => ({ userId: h.userId, amount: h.amount })), auctionId, startTime: auction.startTime ?? Date.now(), serverTimestamp: Date.now(),
    });
  });
});

setInterval(async () => {
  const now = Date.now();
  let changed = false;
  for (const auction of db.data.auctions) {
    if (auction.status === 'Upcoming' && (auction.startTime ?? now) <= now) {
      auction.status = 'Active';
      changed = true;
      const history = db.data.bids.filter((b: any) => b.auctionId === auction.id).sort((a: any, b: any) => b.timestamp - a.timestamp).slice(0, 5).map((h: any) => ({ userId: h.userId, amount: h.amount }));
      io.to(`auction:${auction.id}`).emit('auction_updated', {
        itemTitle: auction.itemTitle, itemImage: auction.itemImage,
        itemImages: auction.itemImages ?? [auction.itemImage],
        currentBid: auction.currentBid, startingPrice: auction.startingPrice,
        highestBidderId: auction.highestBidderId, status: 'Active',
        endTime: auction.endTime, reservePrice: auction.reservePrice ?? null, buyNowPrice: auction.buyNowPrice ?? null,
        history, auctionId: auction.id, startTime: auction.startTime ?? now, serverTimestamp: now,
        description: auction.description || '',
      });
      io.emit('lobby_auction_update', { id: auction.id, currentBid: auction.currentBid, highestBidderId: auction.highestBidderId, status: 'Active', endTime: auction.endTime, startTime: auction.startTime ?? now, bidCount: db.data.bids.filter((b: any) => b.auctionId === auction.id).length });
    }
    if (auction.status === 'Active' && auction.endTime < now) {
      auction.status = 'Closed'; changed = true;
      const history = db.data.bids.filter((b: any) => b.auctionId === auction.id).sort((a: any, b: any) => b.timestamp - a.timestamp).slice(0, 5).map((h: any) => ({ userId: h.userId, amount: h.amount }));
      io.to(`auction:${auction.id}`).emit('auction_updated', {
        itemTitle: auction.itemTitle, itemImage: auction.itemImage,
        itemImages: auction.itemImages ?? [auction.itemImage],
        currentBid: auction.currentBid, startingPrice: auction.startingPrice,
        highestBidderId: auction.highestBidderId, status: 'Closed',
        endTime: auction.endTime, reservePrice: auction.reservePrice ?? null, buyNowPrice: auction.buyNowPrice ?? null,
        history, auctionId: auction.id, startTime: auction.startTime ?? now, serverTimestamp: now,
      });
      io.emit('lobby_auction_update', { id: auction.id, currentBid: auction.currentBid, highestBidderId: auction.highestBidderId, status: 'Closed', endTime: auction.endTime, startTime: auction.startTime ?? now, bidCount: db.data.bids.filter((b: any) => b.auctionId === auction.id).length });
    }
  }
  if (changed) await db.write();
}, 1000);

const PORT = 3001;
httpServer.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));

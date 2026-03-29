import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { getDB } from './db.js';
import type { DB } from './db.js';
import { generateToken, verifyToken } from './auth.js';
import { sendAlertEmail } from './email.js';
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
for (const order of db.data.orders) {
  order.invoiceNumber = order.invoiceNumber || createInvoiceNumber(order.id);
  if (typeof order.estimatedDelivery === 'undefined') order.estimatedDelivery = order.status === 'delivered' ? order.updatedAt : null;
  if (typeof order.courierLink === 'undefined') order.courierLink = null;
  if (typeof order.shippingLabelUrl === 'undefined') order.shippingLabelUrl = null;
  if (typeof order.request === 'undefined') order.request = null;
}
if (!(db.data as any).savedSearches) (db.data as any).savedSearches = [];
await db.write();
const scheduledSoonEmailSent = new Set<string>();

function getUserByUsername(username?: string) {
  if (!username) return null;
  return db.data.users.find(u => u.username === username) || null;
}

function emailUser(username: string | undefined, subject: string, text: string) {
  const user = getUserByUsername(username);
  if (!user?.email) return;
  void sendAlertEmail({ to: user.email, subject, text });
}

function canAccessOrder(order: import('./db.js').Order, username: string) {
  return order.buyerId === username || order.sellerId === username;
}

function createInvoiceNumber(orderId: string) {
  return `INV-${new Date().getFullYear()}-${orderId.slice(0, 8).toUpperCase()}`;
}

function estimateDelivery(days: number) {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInvoiceHtml(order: import('./db.js').Order, payment?: import('./db.js').Payment | null, auction?: import('./db.js').Auction | null) {
  const address = order.shippingAddress
    ? `${order.shippingAddress.fullName}<br/>${order.shippingAddress.line1}${order.shippingAddress.line2 ? `<br/>${escapeHtml(order.shippingAddress.line2)}` : ''}<br/>${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.postalCode}<br/>${order.shippingAddress.country}<br/>Phone: ${order.shippingAddress.phone}`
    : 'Address pending';
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice ${escapeHtml(order.invoiceNumber || order.id)}</title>
    <style>
      body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; padding: 32px; }
      .card { max-width: 860px; margin: 0 auto; background: #111827; border: 1px solid #334155; border-radius: 18px; padding: 28px; }
      .muted { color: #94a3b8; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-top: 24px; }
      .box { background: #0b1220; border: 1px solid #1e293b; border-radius: 14px; padding: 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 24px; }
      th, td { text-align: left; padding: 12px 10px; border-bottom: 1px solid #1e293b; }
      .amount { text-align: right; }
      .total { font-size: 20px; font-weight: bold; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>UltraBid Live Invoice</h1>
      <p class="muted">Invoice #: ${escapeHtml(order.invoiceNumber || order.id)}<br/>Generated: ${escapeHtml(new Date(order.updatedAt || order.createdAt).toLocaleString())}</p>
      <div class="grid">
        <div class="box">
          <strong>Billed To</strong>
          <p class="muted">${address}</p>
        </div>
        <div class="box">
          <strong>Order Summary</strong>
          <p class="muted">Buyer: ${escapeHtml(order.buyerId)}<br/>Seller: ${escapeHtml(order.sellerId)}<br/>Payment ID: ${escapeHtml(payment?.razorpayPaymentId || order.paymentId)}<br/>Auction ID: ${escapeHtml(order.auctionId)}</p>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Status</th>
            <th>Closed At</th>
            <th class="amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(order.itemTitle)}</td>
            <td>${escapeHtml(order.status.replace(/-/g, ' '))}</td>
            <td>${escapeHtml(new Date(auction?.endTime || order.createdAt).toLocaleString())}</td>
            <td class="amount">₹${escapeHtml(order.amount.toLocaleString())}</td>
          </tr>
          <tr>
            <td colspan="3" class="total">Total Paid</td>
            <td class="amount total">₹${escapeHtml(order.amount.toLocaleString())}</td>
          </tr>
        </tbody>
      </table>
      <p class="muted" style="margin-top:24px;">This invoice was generated automatically by UltraBid Live for digital order tracking and fulfillment support.</p>
    </div>
  </body>
</html>`;
}

function normalizeText(value?: string | null) {
  return (value || '').trim().toLowerCase();
}

function tokenizeText(value?: string | null) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/i)
    .filter(token => token.length >= 3);
}

function matchesSavedSearch(auction: import('./db.js').Auction, search: import('./db.js').SavedSearch, now = Date.now()) {
  const query = normalizeText(search.query);
  const haystack = `${auction.itemTitle || ''} ${auction.description || ''} ${auction.category || ''}`.toLowerCase();
  const matchQuery = !query || haystack.includes(query);
  const matchCategory = !search.category || search.category === 'All' || auction.category === search.category;
  let matchFilter = true;
  if (search.filter === 'active') matchFilter = auction.status === 'Active';
  else if (search.filter === 'upcoming') matchFilter = auction.status === 'Upcoming';
  else if (search.filter === 'ending_soon') matchFilter = auction.status === 'Active' && auction.endTime > now && auction.endTime - now < 60_000;
  else if (search.filter === 'ended') matchFilter = auction.status === 'Closed';
  else if (search.filter === 'buy_now') matchFilter = !!auction.buyNowPrice && auction.status === 'Active';
  else if (search.filter === 'mine') matchFilter = auction.createdBy === search.userId;
  return matchQuery && matchCategory && matchFilter;
}

function buildRecommendations(username: string, watchlistIds: string[] = []) {
  const now = Date.now();
  const relevantBids = db.data.bids.filter(b => b.userId === username);
  const bidAuctionIds = new Set(relevantBids.map(b => b.auctionId));
  const bidAuctions = db.data.auctions.filter(a => bidAuctionIds.has(a.id));
  const boughtAuctionIds = new Set(db.data.payments.filter(p => p.userId === username).map(p => p.auctionId));
  const boughtAuctions = db.data.auctions.filter(a => boughtAuctionIds.has(a.id));
  const savedSearches = db.data.savedSearches.filter(search => search.userId === username);
  const watchlistSet = new Set(watchlistIds.filter(Boolean));
  const watchedAuctions = db.data.auctions.filter(a => watchlistSet.has(a.id));

  const interestedCategories = new Set<string>();
  [...bidAuctions, ...boughtAuctions, ...watchedAuctions].forEach(auction => {
    if (auction.category) interestedCategories.add(auction.category);
  });
  savedSearches.forEach(search => {
    if (search.category && search.category !== 'All') interestedCategories.add(search.category);
  });

  const preferredSellers = new Set<string>();
  watchedAuctions.forEach(auction => {
    if (auction.createdBy) preferredSellers.add(auction.createdBy);
  });

  const preferredTokens = new Set<string>();
  savedSearches.forEach(search => tokenizeText(search.query).forEach(token => preferredTokens.add(token)));
  bidAuctions.forEach(auction => tokenizeText(auction.itemTitle).forEach(token => preferredTokens.add(token)));
  boughtAuctions.forEach(auction => tokenizeText(auction.itemTitle).forEach(token => preferredTokens.add(token)));
  watchedAuctions.forEach(auction => {
    tokenizeText(`${auction.itemTitle} ${auction.description || ''}`).forEach(token => preferredTokens.add(token));
  });

  const watchedByCategory = new Map<string, number>();
  watchedAuctions.forEach(auction => {
    const key = auction.category || 'General';
    watchedByCategory.set(key, (watchedByCategory.get(key) || 0) + 1);
  });

  return db.data.auctions
    .filter(auction => auction.createdBy !== username)
    .filter(auction => auction.status === 'Active' || auction.status === 'Upcoming')
    .map(auction => {
      const titleTokens = tokenizeText(`${auction.itemTitle} ${auction.description || ''}`);
      let score = 0;
      const reasons: string[] = [];

      if (auction.category && interestedCategories.has(auction.category)) {
        score += 30;
        reasons.push(`Matches your interest in ${auction.category}`);
      }

      if (auction.category && watchedByCategory.has(auction.category)) {
        score += Math.min(20, (watchedByCategory.get(auction.category) || 0) * 6);
        reasons.push(`Because you watch ${auction.category} listings`);
      }

      const sharedTokens = titleTokens.filter(token => preferredTokens.has(token));
      if (sharedTokens.length > 0) {
        score += Math.min(24, sharedTokens.length * 8);
        reasons.push(`Similar to searches for ${sharedTokens.slice(0, 2).join(', ')}`);
      }

      if (watchlistSet.has(auction.id)) {
        score += 45;
        reasons.push('Already on your watchlist');
      }

      if (auction.createdBy && preferredSellers.has(auction.createdBy)) {
        score += 14;
        reasons.push(`More from seller ${auction.createdBy}`);
      }

      const matchedSearch = savedSearches.find(search => matchesSavedSearch(auction, search, now));
      if (matchedSearch) {
        score += 35;
        reasons.push(`Fits saved search “${matchedSearch.label}”`);
      }

      if (auction.moderationStatus === 'Approved') {
        score += 10;
        reasons.push('Approved by trust layer');
      }

      if ((auction.startTime || 0) > now) {
        const startsIn = (auction.startTime || 0) - now;
        if (startsIn <= 6 * 60 * 60 * 1000) {
          score += 8;
          reasons.push('Starting soon');
        }
      } else if (auction.endTime > now && auction.endTime - now <= 15 * 60 * 1000) {
        score += 8;
        reasons.push('Ending soon');
      }

      if ((auction.currentBid || 0) > (auction.startingPrice || 0)) score += 4;
      const bidCount = db.data.bids.filter(b => b.auctionId === auction.id).length;
      if (bidCount >= 3) {
        score += Math.min(15, bidCount * 2);
        reasons.push('Trending with active bidding');
      }

      if (auction.highestBidderId === username) {
        score += 20;
        reasons.push('You are currently leading here');
      }

      return {
        ...serializeAuction(auction),
        recommendationScore: score,
        recommendationReason: reasons[0] || 'Popular auction for you',
        recommendationReasons: Array.from(new Set(reasons)).slice(0, 3),
      };
    })
    .filter(auction => auction.recommendationScore > 0)
    .sort((a, b) => b.recommendationScore - a.recommendationScore || b.bidCount - a.bidCount || a.endTime - b.endTime)
    .slice(0, 6);
}

function assessAuctionModeration({ itemTitle, description, itemImage }: { itemTitle?: string | undefined; description?: string | undefined; itemImage?: string | undefined }) {
  const text = `${itemTitle || ''} ${description || ''}`.trim();
  const reasons: string[] = [];
  let moderationStatus: 'Approved' | 'Pending' | 'Flagged' = 'Approved';

  if (/(weapon|gun|rifle|pistol|drugs?|cocaine|heroin|counterfeit|fake|replica|stolen|adult|xxx|nude|fraud|scam)/i.test(text)) {
    moderationStatus = 'Flagged';
    reasons.push('Sensitive or suspicious keywords detected.');
  } else if (/(telegram|whatsapp only|advance payment|dm me|cash only|upi first)/i.test(text)) {
    moderationStatus = 'Pending';
    reasons.push('Listing needs manual trust review.');
  }

  if (itemImage && !/^https?:\/\//i.test(itemImage) && !/^data:image\//i.test(itemImage)) {
    moderationStatus = 'Pending';
    reasons.push('Image source looks unusual.');
  }

  return {
    moderationStatus,
    moderationNotes: reasons.length ? reasons.join(' ') : null,
  };
}

function buildSellerTrust(username?: string) {
  if (!username) return { sellerTrustScore: 20, sellerTrustLabel: 'New Seller', sellerVerified: false };
  const listings = db.data.auctions.filter(a => a.createdBy === username);
  const sold = listings.filter(a => a.status === 'Closed' && a.highestBidderId && a.highestBidderId !== 'None');
  const listingIds = new Set(listings.map(a => a.id));
  const bids = db.data.bids.filter(b => listingIds.has(b.auctionId));
  const paid = db.data.payments.filter(p => listingIds.has(p.auctionId) && p.status === 'paid');
  let score = 20;
  if (listings.length >= 2) score += 15;
  if (sold.length >= 1) score += 20;
  if (paid.length >= 1) score += 20;
  if (bids.length >= 5) score += 10;
  if (new Set(bids.map(b => b.userId)).size >= 3) score += 10;
  if (listings.length > 0 && sold.length / listings.length >= 0.5) score += 10;
  score = Math.min(100, score);
  return {
    sellerTrustScore: score,
    sellerTrustLabel: score >= 80 ? 'Verified Seller' : score >= 55 ? 'Trusted Seller' : 'New Seller',
    sellerVerified: score >= 80,
  };
}

function serializeAuction(a: any) {
  const trust = buildSellerTrust(a.createdBy);
  return {
    id: a.id,
    itemTitle: a.itemTitle,
    itemImage: a.itemImage,
    itemImages: a.itemImages ?? [a.itemImage],
    startingPrice: a.startingPrice,
    currentBid: a.currentBid,
    highestBidderId: a.highestBidderId,
    status: a.status,
    endTime: a.endTime,
    startTime: a.startTime ?? a.createdAt ?? Date.now(),
    reservePrice: a.reservePrice ?? null,
    buyNowPrice: a.buyNowPrice ?? null,
    category: a.category ?? 'General',
    createdBy: a.createdBy ?? 'system',
    bidCount: db.data.bids.filter(b => b.auctionId === a.id).length,
    description: a.description ?? '',
    createdAt: a.createdAt ?? a.endTime,
    moderationStatus: a.moderationStatus ?? 'Approved',
    moderationNotes: a.moderationNotes ?? null,
    ...trust,
  };
}

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
    res.json({ token, user: { id: newUser.id, username: newUser.username, email: newUser.email } });
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
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err: any) {
    console.error('Google OAuth error:', err?.message || err);
    res.status(401).json({ error: 'Google authentication failed. Please ensure your Google account is valid and try again.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = db.data.users.find(u => u.email === email);
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });
    const token = generateToken(user.id, user.username);
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
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
  const auctions = db.data.auctions.map(a => serializeAuction(a));
  res.json(auctions);
});

app.get('/api/profile/:username', (req, res) => {
  const { username } = req.params;
  const user = db.data.users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const userBids = db.data.bids.filter(b => b.userId === username).sort((a, b) => b.timestamp - a.timestamp);
  const wins = db.data.auctions.filter(a => a.highestBidderId === username && a.status === 'Closed');
  const sellerAuctions = db.data.auctions.filter(a => a.createdBy === username);
  const sellerAuctionIds = new Set(sellerAuctions.map(a => a.id));
  const sellerBids = db.data.bids.filter(b => sellerAuctionIds.has(b.auctionId));
  const sellerPayments = db.data.payments.filter(p => sellerAuctionIds.has(p.auctionId) && p.status === 'paid');
  const soldAuctions = sellerAuctions.filter(a => a.status === 'Closed' && a.highestBidderId && a.highestBidderId !== 'None');
  const paidAuctionIds = new Set(sellerPayments.map(p => p.auctionId));
  const bidHistory = userBids.map(b => {
    const auction = db.data.auctions.find(a => a.id === b.auctionId);
    return { auctionTitle: auction?.itemTitle ?? 'Unknown', amount: b.amount, timestamp: b.timestamp, won: auction?.highestBidderId === username && auction?.status === 'Closed' };
  });
  const topAuction = sellerAuctions
    .map(a => ({
      id: a.id,
      itemTitle: a.itemTitle,
      amount: a.currentBid,
      bidCount: sellerBids.filter(b => b.auctionId === a.id).length,
      status: a.status,
    }))
    .sort((a, b) => (b.amount - a.amount) || (b.bidCount - a.bidCount))[0] || null;
  const revenueSeries = sellerAuctions
    .slice()
    .sort((a, b) => (a.startTime ?? a.createdAt ?? a.endTime) - (b.startTime ?? b.createdAt ?? b.endTime))
    .slice(-8)
    .map(a => sellerPayments.find(p => p.auctionId === a.id)?.amount || (a.status === 'Closed' && a.highestBidderId !== 'None' ? a.currentBid : 0));
  const recentSales = soldAuctions
    .slice()
    .sort((a, b) => b.endTime - a.endTime)
    .slice(0, 5)
    .map(a => ({
      auctionId: a.id,
      itemTitle: a.itemTitle,
      amount: sellerPayments.find(p => p.auctionId === a.id)?.amount || a.currentBid,
      winner: a.highestBidderId,
      paid: paidAuctionIds.has(a.id),
      timestamp: a.endTime,
    }));

  res.json({
    username: user.username,
    email: user.email,
    totalBids: userBids.length,
    wins: wins.length,
    bidHistory: bidHistory.slice(0, 20),
    sellerAnalytics: {
      totalListings: sellerAuctions.length,
      activeListings: sellerAuctions.filter(a => a.status === 'Active').length,
      upcomingListings: sellerAuctions.filter(a => a.status === 'Upcoming').length,
      soldListings: soldAuctions.length,
      totalRevenue: sellerPayments.reduce((sum, p) => sum + p.amount, 0),
      potentialRevenue: soldAuctions.reduce((sum, a) => sum + a.currentBid, 0),
      totalBidsReceived: sellerBids.length,
      uniqueBidders: new Set(sellerBids.map(b => b.userId)).size,
      conversionRate: sellerAuctions.length ? Math.round((soldAuctions.length / sellerAuctions.length) * 100) : 0,
      topAuction,
      revenueSeries,
      recentSales,
    },
  });
});

app.get('/api/saved-searches', authMiddleware, (req: any, res: any) => {
  const username = req.user.username;
  const savedSearches = db.data.savedSearches
    .filter(search => search.userId === username)
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json(savedSearches);
});

app.post('/api/saved-searches', authMiddleware, async (req: any, res: any) => {
  const username = req.user.username;
  const { label, query, category, filter, sortBy, notificationsEnabled } = req.body || {};
  const normalizedLabel = String(label || '').trim();
  const normalizedQuery = String(query || '').trim();
  const normalizedCategory = String(category || '').trim() || null;
  const normalizedFilter = String(filter || 'all').trim();
  const normalizedSortBy = String(sortBy || 'newest').trim();

  if (!normalizedLabel) return res.status(400).json({ error: 'Search label is required.' });
  if (!normalizedQuery && !normalizedCategory) return res.status(400).json({ error: 'Add a keyword or category before saving.' });
  if (db.data.savedSearches.filter(search => search.userId === username).length >= 12) {
    return res.status(400).json({ error: 'You can save up to 12 searches.' });
  }

  const filterValue: NonNullable<import('./db.js').SavedSearch['filter']> = ['all', 'active', 'upcoming', 'ending_soon', 'ended', 'buy_now', 'watchlist', 'mine'].includes(normalizedFilter)
    ? normalizedFilter as NonNullable<import('./db.js').SavedSearch['filter']>
    : 'all';
  const sortByValue: NonNullable<import('./db.js').SavedSearch['sortBy']> = ['newest', 'bids', 'ending', 'price_low', 'price_high'].includes(normalizedSortBy)
    ? normalizedSortBy as NonNullable<import('./db.js').SavedSearch['sortBy']>
    : 'newest';

  const savedSearch = {
    id: uuidv4(),
    userId: username,
    label: normalizedLabel,
    query: normalizedQuery,
    category: normalizedCategory,
    filter: filterValue,
    sortBy: sortByValue,
    notificationsEnabled: Boolean(notificationsEnabled),
    createdAt: Date.now(),
  };

  db.data.savedSearches.push(savedSearch);
  await db.write();
  res.status(201).json(savedSearch);
});

app.delete('/api/saved-searches/:id', authMiddleware, async (req: any, res: any) => {
  const username = req.user.username;
  const index = db.data.savedSearches.findIndex(search => search.id === req.params.id && search.userId === username);
  if (index === -1) return res.status(404).json({ error: 'Saved search not found.' });
  const deleted = db.data.savedSearches[index];
  if (!deleted) return res.status(404).json({ error: 'Saved search not found.' });
  db.data.savedSearches.splice(index, 1);
  await db.write();
  res.json({ success: true, id: deleted.id });
});

app.get('/api/recommendations', authMiddleware, (req: any, res: any) => {
  const username = req.user.username;
  const rawWatchlist = typeof req.query.watchlist === 'string' ? req.query.watchlist : '';
  const watchlistIds = rawWatchlist.split(',').map((value: string) => value.trim()).filter(Boolean);
  res.json(buildRecommendations(username, watchlistIds));
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
    const existingOrder = db.data.orders.find(o => o.auctionId === auctionId);
    const order = existingOrder || {
      id: uuidv4(),
      auctionId,
      paymentId: payment.id,
      buyerId: req.user.username,
      sellerId: auction?.createdBy || 'system',
      itemTitle: auction?.itemTitle || 'Auction Item',
      amount: auction?.currentBid ?? 0,
      status: 'paid-awaiting-address' as const,
      invoiceNumber: '',
      estimatedDelivery: estimateDelivery(7),
      shippingAddress: null,
      trackingId: null,
      carrier: null,
      courierLink: null,
      shippingLabelUrl: null,
      notes: null,
      request: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    if (!existingOrder) db.data.orders.push(order);
    else {
      existingOrder.paymentId = payment.id;
      existingOrder.amount = auction?.currentBid ?? existingOrder.amount;
      existingOrder.status = existingOrder.shippingAddress ? 'processing' : 'paid-awaiting-address';
      existingOrder.estimatedDelivery = existingOrder.shippingAddress ? estimateDelivery(5) : (existingOrder.estimatedDelivery ?? estimateDelivery(7));
      existingOrder.updatedAt = Date.now();
    }
    (existingOrder || order).invoiceNumber = (existingOrder || order).invoiceNumber || createInvoiceNumber((existingOrder || order).id);
    await db.write();
    // Notify winner + seller via socket
    io.to(`user:${req.user.username}`).emit('payment_confirmed', { auctionId, paymentId: razorpay_payment_id, amount: payment.amount });
    if (auction?.createdBy) io.to(`user:${auction.createdBy}`).emit('seller_payment_received', { auctionId, itemTitle: auction.itemTitle, buyer: req.user.username, amount: payment.amount, paymentId: razorpay_payment_id });
    io.to(`user:${req.user.username}`).emit('order_updated', existingOrder || order);
    if (auction?.createdBy) io.to(`user:${auction.createdBy}`).emit('order_updated', existingOrder || order);
    emailUser(req.user.username, `Payment confirmed for ${auction?.itemTitle || 'your auction'}`, `Your payment of Rs.${payment.amount.toLocaleString()} for "${auction?.itemTitle || 'Auction'}" is confirmed. Payment ID: ${razorpay_payment_id}.`);
    if (auction?.createdBy) {
      emailUser(auction.createdBy, `Buyer payment received for ${auction.itemTitle}`, `${req.user.username} completed payment of Rs.${payment.amount.toLocaleString()} for "${auction.itemTitle}". Payment ID: ${razorpay_payment_id}.`);
    }
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

app.get('/api/orders', authMiddleware, (req: any, res: any) => {
  const username = req.user.username;
  const orders = db.data.orders
    .filter(order => canAccessOrder(order, username))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  res.json(orders);
});

app.get('/api/orders/:auctionId', authMiddleware, (req: any, res: any) => {
  const username = req.user.username;
  const order = db.data.orders.find(o => o.auctionId === req.params.auctionId);
  if (!order || !canAccessOrder(order, username)) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

app.get('/api/orders/:orderId/invoice', authMiddleware, (req: any, res: any) => {
  const username = req.user.username;
  const order = db.data.orders.find(o => o.id === req.params.orderId);
  if (!order || !canAccessOrder(order, username)) return res.status(404).json({ error: 'Order not found' });
  order.invoiceNumber = order.invoiceNumber || createInvoiceNumber(order.id);
  const payment = db.data.payments.find(p => p.id === order.paymentId || p.auctionId === order.auctionId) || null;
  const auction = db.data.auctions.find(a => a.id === order.auctionId) || null;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${order.invoiceNumber}.html"`);
  res.send(renderInvoiceHtml(order, payment, auction));
});

app.post('/api/orders/:auctionId/address', authMiddleware, async (req: any, res: any) => {
  const username = req.user.username;
  const order = db.data.orders.find(o => o.auctionId === req.params.auctionId);
  if (!order || order.buyerId !== username) return res.status(404).json({ error: 'Order not found' });

  const { fullName, phone, line1, line2, city, state, postalCode, country } = req.body || {};
  if (![fullName, phone, line1, city, state, postalCode, country].every(Boolean)) {
    return res.status(400).json({ error: 'Please fill all required address fields.' });
  }

  order.shippingAddress = { fullName, phone, line1, line2: line2 || '', city, state, postalCode, country };
  order.status = 'processing';
  order.invoiceNumber = order.invoiceNumber || createInvoiceNumber(order.id);
  order.estimatedDelivery = estimateDelivery(5);
  order.updatedAt = Date.now();
  await db.write();

  io.to(`user:${order.sellerId}`).emit('order_updated', order);
  io.to(`user:${order.buyerId}`).emit('order_updated', order);
  emailUser(order.sellerId, `Shipping address submitted for ${order.itemTitle}`, `${order.buyerId} submitted a delivery address for "${order.itemTitle}". Open UltraBid to fulfill the order.`);
  res.json(order);
});

app.post('/api/orders/:orderId/request', authMiddleware, async (req: any, res: any) => {
  const username = req.user.username;
  const order = db.data.orders.find(o => o.id === req.params.orderId);
  if (!order || order.buyerId !== username) return res.status(404).json({ error: 'Order not found' });

  const { type, reason } = req.body || {};
  if (!['cancel', 'return'].includes(type)) return res.status(400).json({ error: 'Invalid request type.' });
  if (!String(reason || '').trim()) return res.status(400).json({ error: 'Please share a reason for your request.' });
  if (order.request?.status === 'requested') return res.status(400).json({ error: 'A request is already pending for this order.' });
  if (type === 'cancel' && !['paid-awaiting-address', 'processing'].includes(order.status)) {
    return res.status(400).json({ error: 'Cancellation is only available before the order is shipped.' });
  }
  if (type === 'return' && !['shipped', 'delivered'].includes(order.status)) {
    return res.status(400).json({ error: 'Return requests are available after shipment.' });
  }

  order.request = {
    type,
    status: 'requested',
    reason: String(reason).trim(),
    sellerNotes: null,
    requestedAt: Date.now(),
    resolvedAt: null,
  };
  order.updatedAt = Date.now();
  await db.write();

  io.to(`user:${order.sellerId}`).emit('order_updated', order);
  io.to(`user:${order.buyerId}`).emit('order_updated', order);
  emailUser(order.sellerId, `${type === 'cancel' ? 'Cancellation' : 'Return'} requested for ${order.itemTitle}`, `${order.buyerId} requested a ${type} for "${order.itemTitle}". Reason: ${order.request.reason}`);
  res.json(order);
});

app.post('/api/orders/:orderId/request/resolve', authMiddleware, async (req: any, res: any) => {
  const username = req.user.username;
  const order = db.data.orders.find(o => o.id === req.params.orderId);
  if (!order || order.sellerId !== username) return res.status(404).json({ error: 'Order not found' });
  if (!order.request || order.request.status !== 'requested') return res.status(400).json({ error: 'No pending request found.' });

  const { action, sellerNotes } = req.body || {};
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action.' });

  order.request.status = action === 'approve' ? 'approved' : 'rejected';
  order.request.sellerNotes = String(sellerNotes || '').trim() || null;
  order.request.resolvedAt = Date.now();
  if (action === 'approve') {
    if (order.request.type === 'cancel') {
      order.status = 'cancelled';
      order.estimatedDelivery = null;
    } else {
      order.status = 'returned';
    }
  }
  order.updatedAt = Date.now();
  await db.write();

  io.to(`user:${order.sellerId}`).emit('order_updated', order);
  io.to(`user:${order.buyerId}`).emit('order_updated', order);
  emailUser(order.buyerId, `${order.request.type === 'cancel' ? 'Cancellation' : 'Return'} ${order.request.status}`, `Your ${order.request.type} request for "${order.itemTitle}" was ${order.request.status}.${order.request.sellerNotes ? ` Seller note: ${order.request.sellerNotes}` : ''}`);
  res.json(order);
});

app.post('/api/orders/:orderId/status', authMiddleware, async (req: any, res: any) => {
  const username = req.user.username;
  const order = db.data.orders.find(o => o.id === req.params.orderId);
  if (!order || order.sellerId !== username) return res.status(404).json({ error: 'Order not found' });

  const { status, trackingId, carrier, notes, courierLink, shippingLabelUrl, estimatedDelivery } = req.body || {};
  const allowedStatuses = ['processing', 'shipped', 'delivered'];
  if (status && !allowedStatuses.includes(status)) return res.status(400).json({ error: 'Invalid order status.' });
  const finalStatus = status || order.status;
  const nextTrackingId = typeof trackingId === 'string' ? trackingId.trim() || null : (order.trackingId || null);
  if ((finalStatus === 'shipped' || finalStatus === 'delivered') && !nextTrackingId) {
    return res.status(400).json({ error: 'Tracking ID is required for shipped or delivered updates.' });
  }

  order.status = finalStatus as import('./db.js').Order['status'];
  order.trackingId = nextTrackingId;
  order.carrier = typeof carrier === 'string' ? carrier.trim() || null : (order.carrier || null);
  order.courierLink = typeof courierLink === 'string' ? courierLink.trim() || null : (order.courierLink || null);
  order.shippingLabelUrl = typeof shippingLabelUrl === 'string' ? shippingLabelUrl.trim() || null : (order.shippingLabelUrl || null);
  order.notes = typeof notes === 'string' ? notes.trim() || null : (order.notes || null);
  if (typeof estimatedDelivery === 'number' && Number.isFinite(estimatedDelivery)) {
    order.estimatedDelivery = estimatedDelivery;
  } else if (typeof estimatedDelivery === 'string' && estimatedDelivery.trim()) {
    const parsed = Number(estimatedDelivery);
    if (Number.isFinite(parsed)) order.estimatedDelivery = parsed;
  } else if (finalStatus === 'processing' && !order.estimatedDelivery) {
    order.estimatedDelivery = estimateDelivery(5);
  } else if (finalStatus === 'shipped' && (!order.estimatedDelivery || order.estimatedDelivery < Date.now())) {
    order.estimatedDelivery = estimateDelivery(4);
  } else if (finalStatus === 'delivered') {
    order.estimatedDelivery = Date.now();
  }
  order.updatedAt = Date.now();
  await db.write();

  io.to(`user:${order.sellerId}`).emit('order_updated', order);
  io.to(`user:${order.buyerId}`).emit('order_updated', order);
  emailUser(order.buyerId, `Order ${status}: ${order.itemTitle}`, `Your order for "${order.itemTitle}" is now marked as ${status}.${order.trackingId ? ` Tracking ID: ${order.trackingId}.` : ''}`);
  res.json(order);
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
        emailUser(prevHighest, `Outbid on ${auction.itemTitle}`, `You were outbid on "${auction.itemTitle}". The new highest bid is Rs.${amount.toLocaleString()}.`);
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
              emailUser(prevH, `Outbid on ${auction.itemTitle}`, `You were outbid on "${auction.itemTitle}". The new highest bid is Rs.${autoBidAmt.toLocaleString()}.`);
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
  socket.on('stop_broadcast', () => {
    if (broadcasterId !== socket.id) return;
    broadcasterId = '';
    socket.broadcast.emit('broadcaster_disconnect');
    socket.broadcast.emit('disconnectPeer', socket.id);
  });
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
        ...serializeAuction(auction),
        history: history.map(h => ({ userId: h.userId, amount: h.amount })),
        auctionId: auction.id, serverTimestamp: Date.now(), recentChats,
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
      emailUser(prevHighest, `Outbid on ${auction.itemTitle}`, `You were outbid on "${auction.itemTitle}" because another buyer used Buy Now for Rs.${auction.buyNowPrice.toLocaleString()}.`);
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
    const moderation = assessAuctionModeration({ itemTitle, description, itemImage: primaryImage });
    const auction: import('./db.js').Auction = {
      id: uuidv4(), itemTitle, createdBy: user.username,
      itemImage: primaryImage,
      itemImages: cleanedImages.length ? cleanedImages : [primaryImage],
      moderationStatus: moderation.moderationStatus,
      moderationNotes: moderation.moderationNotes,
      startingPrice: Number(startingPrice) || 1000, currentBid: Number(startingPrice) || 1000,
      highestBidderId: 'None', status: isScheduled ? 'Upcoming' : 'Active',
      startTime: safeStart,
      endTime: safeStart + (Number(durationMinutes) || 2) * 60000,
      createdAt: Date.now(),
      category: category || 'General', reservePrice: reservePrice ? Number(reservePrice) : null, buyNowPrice: buyNowPrice ? Number(buyNowPrice) : null,
      description: description || '',
    };
    db.data.auctions.push(auction); await db.write();
    io.emit('auction_created', serializeAuction(auction));
    socket.emit('auction_created_confirm', { auctionId: auction.id, status: auction.status, startTime: auction.startTime, moderationStatus: auction.moderationStatus, moderationNotes: auction.moderationNotes });
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
    const moderation = assessAuctionModeration({ itemTitle: auction.itemTitle, description: auction.description, itemImage: auction.itemImage });
    auction.moderationStatus = moderation.moderationStatus;
    auction.moderationNotes = moderation.moderationNotes;
    await db.write();
    const history = db.data.bids.filter(b => b.auctionId === auctionId).sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
    io.to(`auction:${auctionId}`).emit('auction_updated', {
      ...serializeAuction(auction),
      history: history.map(h => ({ userId: h.userId, amount: h.amount })), auctionId, serverTimestamp: Date.now(),
    });
  });
});

setInterval(async () => {
  const now = Date.now();
  let changed = false;
  for (const auction of db.data.auctions) {
    if (auction.status === 'Upcoming' && auction.startTime && auction.startTime > now && auction.startTime - now <= 5 * 60 * 1000 && !scheduledSoonEmailSent.has(auction.id)) {
      scheduledSoonEmailSent.add(auction.id);
      emailUser(auction.createdBy, `Auction starting soon: ${auction.itemTitle}`, `Your scheduled auction "${auction.itemTitle}" will start at ${new Date(auction.startTime).toLocaleString()}.`);
    }
    if (auction.status === 'Upcoming' && (auction.startTime ?? now) <= now) {
      auction.status = 'Active';
      changed = true;
      scheduledSoonEmailSent.delete(auction.id);
      emailUser(auction.createdBy, `Auction is now live: ${auction.itemTitle}`, `Your auction "${auction.itemTitle}" is now live on UltraBid. Open the app to manage the listing and watch bids in real time.`);
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
      if (auction.highestBidderId && auction.highestBidderId !== 'None') {
        emailUser(auction.highestBidderId, `You won ${auction.itemTitle}`, `You won "${auction.itemTitle}" with a final bid of Rs.${auction.currentBid.toLocaleString()}. Open UltraBid to complete payment.`);
      }
      if (auction.createdBy) {
        const closeSummary = auction.highestBidderId && auction.highestBidderId !== 'None'
          ? `${auction.highestBidderId} won your auction "${auction.itemTitle}" at Rs.${auction.currentBid.toLocaleString()}.`
          : `Your auction "${auction.itemTitle}" ended without a winning bidder.`;
        emailUser(auction.createdBy, `Auction ended: ${auction.itemTitle}`, closeSummary);
      }
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

const PORT = Number(process.env.PORT) || 3001;
httpServer.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));

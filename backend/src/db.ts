import { JSONFilePreset } from 'lowdb/node';
import type { Low } from 'lowdb';

export type User = {
  id: string;
  username: string;
  email: string;
  password?: string;
  googleId?: string;
};

export type Auction = {
  id: string;
  itemTitle: string;
  itemImage: string;
  itemImages?: string[];
  moderationStatus?: 'Approved' | 'Pending' | 'Flagged';
  moderationNotes?: string | null;
  startingPrice: number;
  currentBid: number;
  highestBidderId: string;
  status: 'Upcoming' | 'Active' | 'Closed' | 'Cancelled';
  startTime?: number;
  endTime: number;
  category?: string;
  reservePrice?: number | null;
  buyNowPrice?: number | null;
  createdBy?: string;
  description?: string;
  createdAt?: number;
};

export type Bid = {
  id: string;
  auctionId: string;
  userId: string;
  amount: number;
  timestamp: number;
};

export type Chat = {
  id: string;
  auctionId: string;
  userId: string;
  message: string;
  timestamp: number;
};

export type Payment = {
  id: string;
  auctionId: string;
  userId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amount: number;
  status: 'paid';
  timestamp: number;
};

export type ShippingAddress = {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type OrderRequest = {
  type: 'cancel' | 'return';
  status: 'requested' | 'approved' | 'rejected';
  reason: string;
  sellerNotes?: string | null;
  requestedAt: number;
  resolvedAt?: number | null;
};

export type Order = {
  id: string;
  auctionId: string;
  paymentId: string;
  buyerId: string;
  sellerId: string;
  itemTitle: string;
  amount: number;
  status: 'paid-awaiting-address' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
  invoiceNumber?: string;
  estimatedDelivery?: number | null;
  shippingAddress?: ShippingAddress | null;
  trackingId?: string | null;
  carrier?: string | null;
  courierLink?: string | null;
  shippingLabelUrl?: string | null;
  notes?: string | null;
  request?: OrderRequest | null;
  createdAt: number;
  updatedAt: number;
};

export type SavedSearch = {
  id: string;
  userId: string;
  label: string;
  query: string;
  category?: string | null;
  filter?: 'all' | 'active' | 'upcoming' | 'ending_soon' | 'ended' | 'buy_now' | 'watchlist' | 'mine';
  sortBy?: 'newest' | 'bids' | 'ending' | 'price_low' | 'price_high';
  notificationsEnabled?: boolean;
  createdAt: number;
};

export type Data = {
  users: User[];
  auctions: Auction[];
  bids: Bid[];
  chats: Chat[];
  payments: Payment[];
  orders: Order[];
  savedSearches: SavedSearch[];
};

const defaultData: Data = { users: [], auctions: [], bids: [], chats: [], payments: [], orders: [], savedSearches: [] };

export const getDB = async (): Promise<Low<Data>> => {
  const db = await JSONFilePreset<Data>('db.json', defaultData);
  if (!db.data.chats) (db.data as any).chats = [];
  if (!db.data.payments) (db.data as any).payments = [];
  if (!(db.data as any).orders) (db.data as any).orders = [];
  if (!(db.data as any).savedSearches) (db.data as any).savedSearches = [];
  return db;
};

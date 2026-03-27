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

export type Data = {
  users: User[];
  auctions: Auction[];
  bids: Bid[];
  chats: Chat[];
  payments: Payment[];
};

const defaultData: Data = { users: [], auctions: [], bids: [], chats: [], payments: [] };

export const getDB = async (): Promise<Low<Data>> => {
  const db = await JSONFilePreset<Data>('db.json', defaultData);
  if (!db.data.chats) (db.data as any).chats = [];
  if (!db.data.payments) (db.data as any).payments = [];
  return db;
};

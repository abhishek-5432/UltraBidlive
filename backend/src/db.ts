import { JSONFilePreset } from 'lowdb/node';

export type User = {
  id: string;
  username: string;
  email: string;
  password?: string;
};

export type Auction = {
  id: string;
  itemTitle: string;
  itemImage: string;
  startingPrice: number;
  currentBid: number;
  highestBidderId: string;
  status: 'Active' | 'Closed';
  endTime: number;
  category?: string;
  reservePrice?: number | null;
  buyNowPrice?: number | null;
  createdBy?: string;
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

export const getDB = async () => {
  const db = await JSONFilePreset<Data>('db.json', defaultData);
  if (!db.data.chats) (db.data as any).chats = [];
  if (!db.data.payments) (db.data as any).payments = [];
  return db;
};

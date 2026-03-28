import mongoose, { Schema } from 'mongoose';

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

// ── Mongoose models with flexible schemas ─────────────────────────
const schemaOpts = { versionKey: false, strict: false } as const;

function makeModel(name: string): mongoose.Model<any> {
  return (mongoose.models[name] as mongoose.Model<any>) || mongoose.model(name, new Schema({}, schemaOpts));
}

const UBUser     = makeModel('UBUser');
const UBAuction  = makeModel('UBAuction');
const UBBid      = makeModel('UBBid');
const UBChat     = makeModel('UBChat');
const UBPayment  = makeModel('UBPayment');
const UBOrder    = makeModel('UBOrder');
const UBSearch   = makeModel('UBSearch');

// ── Sync: upsert all current items + delete removed ones ──────────
async function syncCollection<T extends { id: string }>(
  model: mongoose.Model<any>,
  items: T[]
): Promise<void> {
  const ids = items.map(item => item.id);
  if (items.length > 0) {
    await model.bulkWrite(
      items.map(item => ({
        replaceOne: { filter: { id: item.id }, replacement: item, upsert: true },
      })),
      { ordered: false }
    );
  }
  await model.deleteMany({ id: { $nin: ids } });
}

// ── DB class: in-memory cache + MongoDB persistence ───────────────
export class DB {
  data: Data;
  constructor(data: Data) { this.data = data; }

  async write(): Promise<void> {
    await Promise.all([
      syncCollection(UBUser,    this.data.users),
      syncCollection(UBAuction, this.data.auctions),
      syncCollection(UBBid,     this.data.bids),
      syncCollection(UBChat,    this.data.chats),
      syncCollection(UBPayment, this.data.payments),
      syncCollection(UBOrder,   this.data.orders),
      syncCollection(UBSearch,  this.data.savedSearches),
    ]);
  }
}

function stripMeta<T>(docs: any[]): T[] {
  return docs.map(({ _id, __v, ...rest }) => rest as T);
}

export const getDB = async (): Promise<DB> => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is not set');
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri, { dbName: 'ultrabid' });
    console.log('✅ MongoDB connected');
  }
  const [users, auctions, bids, chats, payments, orders, savedSearches] = await Promise.all([
    UBUser.find().select('-_id -__v').lean(),
    UBAuction.find().select('-_id -__v').lean(),
    UBBid.find().select('-_id -__v').lean(),
    UBChat.find().select('-_id -__v').lean(),
    UBPayment.find().select('-_id -__v').lean(),
    UBOrder.find().select('-_id -__v').lean(),
    UBSearch.find().select('-_id -__v').lean(),
  ]);
  return new DB({
    users:        stripMeta<User>(users),
    auctions:     stripMeta<Auction>(auctions),
    bids:         stripMeta<Bid>(bids),
    chats:        stripMeta<Chat>(chats),
    payments:     stripMeta<Payment>(payments),
    orders:       stripMeta<Order>(orders),
    savedSearches: stripMeta<SavedSearch>(savedSearches),
  });
};

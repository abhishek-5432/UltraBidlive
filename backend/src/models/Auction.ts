import mongoose, { Schema, Document } from 'mongoose';

export interface IAuction extends Document {
  itemTitle: string;
  itemImage: string;
  itemImages?: string[];
  startingPrice: number;
  currentBid: number;
  highestBidderId: string;
  status: 'Upcoming' | 'Active' | 'Closed' | 'Cancelled';
  startTime?: Date;
  endTime: Date;
  createdAt: Date;
}

const AuctionSchema: Schema = new Schema({
  itemTitle: { type: String, required: true },
  itemImage: { type: String, required: true },
  itemImages: [{ type: String }],
  startingPrice: { type: Number, required: true },
  currentBid: { type: Number, default: 0 },
  highestBidderId: { type: String, default: 'None' },
  status: { type: String, enum: ['Upcoming', 'Active', 'Closed', 'Cancelled'], default: 'Active' },
  startTime: { type: Date },
  endTime: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IAuction>('Auction', AuctionSchema);

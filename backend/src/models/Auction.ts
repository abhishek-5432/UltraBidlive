import mongoose, { Schema, Document } from 'mongoose';

export interface IAuction extends Document {
  itemTitle: string;
  itemImage: string;
  startingPrice: number;
  currentBid: number;
  highestBidderId: string;
  status: 'Active' | 'Closed';
  endTime: Date;
  createdAt: Date;
}

const AuctionSchema: Schema = new Schema({
  itemTitle: { type: String, required: true },
  itemImage: { type: String, required: true },
  startingPrice: { type: Number, required: true },
  currentBid: { type: Number, default: 0 },
  highestBidderId: { type: String, default: 'None' },
  status: { type: String, enum: ['Active', 'Closed'], default: 'Active' },
  endTime: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IAuction>('Auction', AuctionSchema);

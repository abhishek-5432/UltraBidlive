import mongoose, { Schema, Document } from 'mongoose';

export interface IBid extends Document {
  auctionId: mongoose.Types.ObjectId | string;
  userId: string;
  amount: number;
  timestamp: Date;
}

const BidSchema: Schema = new Schema({
  auctionId: { type: Schema.Types.ObjectId, ref: 'Auction', required: true },
  userId: { type: String, required: true },
  amount: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.model<IBid>('Bid', BidSchema);

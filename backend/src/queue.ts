import { Queue, Worker, Job } from 'bullmq';
import { redisClient } from './redis';
import { Server } from 'socket.io';

let ioInstance: Server | null = null;

export const setIoInstance = (io: Server) => {
  ioInstance = io;
};

// Queue for processing bids sequentially
export const bidQueue = new Queue('bids', {
  connection: redisClient,
});

// Worker processes 1 bid at a time (per queue) to prevent race conditions
export const bidWorker = new Worker('bids', async (job: Job) => {
  const { auctionId, amount, userId, timestamp } = job.data;
  
  const auctionKey = `auction:${auctionId}`;
  const rawState = await redisClient.get(auctionKey);
  
  // Default state if not exists
  let state = rawState ? JSON.parse(rawState) : { 
    currentBid: 0, 
    highestBidderId: 'None', 
    status: 'Active',
    endTime: Date.now() + 60000 // default 60s
  };

  if (state.status !== 'Active') {
    throw new Error('Auction is Closed');
  }

  // Sequencer logic: only accept higher bids
  if (amount > state.currentBid) {
    state.currentBid = amount;
    state.highestBidderId = userId;
    
    // Add 10 seconds to end time if bid placed in last 10 seconds (anti-snipe)
    const timeRemaining = state.endTime - Date.now();
    if (timeRemaining < 10000 && timeRemaining > 0) {
      state.endTime += 10000;
    }

    // Persist new state back to Redis
    await redisClient.set(auctionKey, JSON.stringify(state));
    
    // Broadcast updated state to room
    if (ioInstance) {
      ioInstance.to(`auction:${auctionId}`).emit('auction_updated', {
        ...state,
        auctionId,
        serverTimestamp: Date.now()
      });
    }
    
    return state;
  } else {
    throw new Error('Bid too low');
  }
}, {
  connection: redisClient,
  concurrency: 1 
});

bidWorker.on('failed', (job, err) => {
  console.log(`Bid rejected for Job ${job?.id}: ${err.message}`);
  // We can emit 'bid_error' specifically to the user here using their socket ID if we stored it
});

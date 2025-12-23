const { Server } = require("socket.io");
const Bid = require("./models/bids");
const Product = require("./models/product");
const Order = require("./models/order");
const User = require("./models/user");

let io;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      // origin: process.env.FRONTEND_URL || "http://localhost:3000",
      origin: process.env.FRONTEND_URL,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("joinAuctionRoom", (productId) => {
      socket.join(productId);
      console.log(`User ${socket.id} joined auction room ${productId}`);
    });

    socket.on("leaveAuctionRoom", (productId) => {
      socket.leave(productId);
      console.log(`User ${socket.id} left auction room ${productId}`);
    });

    socket.on("placeBid", async ({ productId, bidAmount, userId }) => {
      let newBid;
      try {
        newBid = new Bid({
          product: productId,
          user: userId,
          amount: bidAmount,
        });
        await newBid.save();

        const query = {
          _id: productId,
          "auctionDetails.status": "Active",
          "auctionDetails.endTime": { $gt: new Date() },
          sellerId: { $ne: userId },
          $or: [
            { "auctionDetails.currentBid": { $lt: bidAmount } },
            {
              "auctionDetails.currentBid": { $exists: false },
              "auctionDetails.startPrice": { $lt: bidAmount },
            },
          ],
        };

        const update = {
          $set: {
            "auctionDetails.currentBid": bidAmount,
            "auctionDetails.highestBidder": userId,
          },
          $push: { "auctionDetails.bidHistory": newBid._id },
        };

        const updatedProduct = await Product.findOneAndUpdate(query, update, {
          new: false,
        });

        if (!updatedProduct) {
          await Bid.findByIdAndDelete(newBid._id);

          return socket.emit(
            "bidError",
            "Your bid was not high enough or the auction has ended."
          );
        }

        await newBid.populate("user", "name");

        io.to(productId).emit("bidUpdate", {
          currentBid: bidAmount,
          highestBidder: newBid.user.name,
          bid: newBid,
        });
      } catch (error) {
        console.error("Bid error:", error);
        if (newBid && newBid._id) {
          await Bid.findByIdAndDelete(newBid._id).catch((err) =>
            console.error("Rollback bid delete failed:", err)
          );
        }

        socket.emit("bidError", "An error occurred while placing your bid.");
      }
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  setInterval(() => {
    checkPendingAuctions();
    checkEndedAuctions();
  }, 15000); // Checks every 15 seconds
}

async function checkPendingAuctions() {
  try {
    const now = new Date();
    const pendingAuctions = await Product.find({
      "auctionDetails.status": "Pending",
      "auctionDetails.startTime": { $lte: now },
    });

    for (const auction of pendingAuctions) {
      auction.auctionDetails.status = "Active";
      await auction.save();

      io.to(auction._id.toString()).emit("auctionStarted", {
        productId: auction._id,
        message: "The auction is now active!",
      });

      console.log(`Auction ${auction.title} has been set to Active.`);
    }
  } catch (error) {
    console.error("Error checking pending auctions:", error);
  }
}

async function checkEndedAuctions() {
  try {
    const now = new Date();
    const endedAuctions = await Product.find({
      "auctionDetails.status": "Active",
      "auctionDetails.endTime": { $lte: now },
      isAuction: true,
    }).populate("sellerId", "name");

    for (const auction of endedAuctions) {
      auction.auctionDetails.status = "Completed";
      await auction.save();

      io.to(auction._id.toString()).emit("auctionEnded", {
        productId: auction._id,
        winnerId: auction.auctionDetails.highestBidder,
        finalPrice: auction.auctionDetails.currentBid,
      });

      if (!auction.auctionDetails.highestBidder) {
        console.log(`No winner for auction ${auction._id}, skipping order creation.`);
        continue;
      }

      const existingOrder = await Order.findOne({
        isAuctionOrder: true,
        auctionProduct: auction._id,
      });

      if (existingOrder) {
        console.log(`Order already exists for auction ${auction._id}, skipping.`);
        continue;
      }

      const winner = await User.findById(auction.auctionDetails.highestBidder);
      if (!winner) {
        console.log(`Winner user not found for auction ${auction._id}`);
        continue;
      }

      const itemsPrice = auction.auctionDetails.currentBid || auction.price || 0;
      const taxPrice = 0;
      const shippingPrice = 0;
      const totalPrice = itemsPrice + taxPrice + shippingPrice;

      const order = await Order.create({
        buyer: winner._id,
        seller: auction.sellerId,
        isAuctionOrder: true,
        auctionProduct: auction._id,
        shippingInfo: undefined,

        orderItems: [
          {
            name: auction.title,
            quantity: 1,
            image: auction.images?.[0]?.url || "",
            price: itemsPrice,
            product: auction._id,
          },
        ],

        itemsPrice,
        taxPrice,
        shippingPrice,
        totalPrice,
        orderStatus: "Address Pending",
      });

      console.log(`Auction order created: ${order._id} for winner ${winner.email}`);
    }
  } catch (error) {
    console.error("Error checking ended auctions:", error);
  }
}

module.exports = { initSocket, io };
 
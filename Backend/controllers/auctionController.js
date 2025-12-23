const Product = require("../models/product");

exports.createAuction = async (req, res) => {
  try {
    const { productId, startTime, endTime, startPrice } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }
    if (product.isAuction) {
      return res
        .status(400)
        .json({ message: "This product is already an auction item." });
    }

    const newStartTime = new Date(startTime);
    const newEndTime = new Date(endTime);
    const now = new Date();

    const status = newStartTime <= now ? 'Active' : 'Pending';

    if (status === 'Pending') {
      console.warn(`Auction ${productId} created as 'Pending'. You will need a background job to activate it at ${newStartTime}`);
    }

    product.isAuction = true;
    product.auctionDetails = {
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      startPrice: startPrice,
      currentBid: startPrice,
      status: status, //active when startTime reached
    };

    product.sellerId = req.user._id;

    await product.save();
    res
      .status(201)
      .json({
        success: true,
        message: "Auction created successfully",
        product,
      });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.getActiveAuctions = async (req, res) => {
  try {
    const now = new Date();
    const auctions = await Product.find({
      isAuction: true,
      "auctionDetails.status": "Active",
      "auctionDetails.endTime": { $gt: now },
    })
      .populate("sellerId", "name")
      .populate({
        path: "auctionDetails.bidHistory",
        populate: { path: "user", select: "name" },
        options: { sort: { createdAt: -1 } },
      })
      .sort({ "auctionDetails.endTime": 1 });

    res.status(200).json({ success: true, data: auctions });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.getUpcomingAuctions = async (req, res) => {
  try {
    const now = new Date();
    const auctions = await Product.find({
      isAuction: true,
      "auctionDetails.status": "Pending",
      "auctionDetails.startTime": { $gt: now },
    })
      .populate("sellerId", "name")
      .populate({
        path: "auctionDetails.bidHistory",
        populate: { path: "user", select: "name" },
        options: { sort: { createdAt: -1 } },
      })
      .sort({ "auctionDetails.startTime": 1 });

    res.status(200).json({ success: true, data: auctions });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.getAuctionById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("sellerId", "name")
      .populate({
        path: "auctionDetails.bidHistory",
        populate: { path: "user", select: "name" },
        options: { sort: { createdAt: -1 } },
      });

    if (!product || !product.isAuction) {
      return res.status(404).json({ message: "Auction product not found." });
    }

    res.status(200).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

//update end-time
exports.updateAuction = async (req, res) => {
  try {
    const { endTime } = req.body;
    const product = await Product.findById(req.params.id);

    if (!product || !product.isAuction) {
      return res.status(404).json({ message: "Auction product not found." });
    }

    if (endTime) product.auctionDetails.endTime = new Date(endTime);

    await product.save();
    res
      .status(200)
      .json({ success: true, message: "Auction updated.", data: product });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  } 
};

//get 2 days old auction
exports.getRecentCompletedAuctions = async (req, res) => {
  try {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const auctions = await Product.find({
      isAuction: true,
      "auctionDetails.status": "Completed",
      "auctionDetails.endTime": { $gte: twoDaysAgo, $lte: now },
    })
      .populate("sellerId", "name")
      .populate("auctionDetails.highestBidder", "name email")
      .sort({ "auctionDetails.endTime": -1 });

    res.json({ success: true, data: auctions });
  } catch (error) {
    console.error("getRecentCompletedAuctions error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


exports.placeBid = async (req, res) => {
  try {
    const { bidAmount } = req.body;
    const auctionId = req.params.id;
    const userId = req.user._id;

    // Find the auction product
    const product = await Product.findById(auctionId);
    if (!product || !product.isAuction) {
      return res.status(404).json({ 
        success: false, 
        message: "Auction not found" 
      });
    }

    // Check if auction is active
    const now = new Date();
    if (product.auctionDetails.status !== 'Active') {
      return res.status(400).json({ 
        success: false, 
        message: "Auction is not active" 
      });
    }

    // Check if auction has ended
    if (now > new Date(product.auctionDetails.endTime)) {
      return res.status(400).json({ 
        success: false, 
        message: "Auction has ended" 
      });
    }

    // Check if bid is higher than current bid
    const currentBid = product.auctionDetails.currentBid || product.auctionDetails.startPrice;
    if (bidAmount <= currentBid) {
      return res.status(400).json({ 
        success: false, 
        message: `Bid must be higher than current bid of ₹${currentBid}` 
      });
    }

    // Check minimum increment (₹50)
    if (bidAmount < currentBid + 50) {
      return res.status(400).json({ 
        success: false, 
        message: "Minimum bid increment is ₹50" 
      });
    }

    // Check if user is not the seller
    if (product.sellerId.toString() === userId.toString()) {
      return res.status(400).json({ 
        success: false, 
        message: "You cannot bid on your own auction" 
      });
    }

    // Initialize bidHistory if it doesn't exist
    if (!product.auctionDetails.bidHistory) {
      product.auctionDetails.bidHistory = [];
    }

    // Add new bid to history
    const newBid = {
      user: userId,
      amount: bidAmount,
      timestamp: now
    };

    product.auctionDetails.bidHistory.push(newBid);
    product.auctionDetails.currentBid = bidAmount;
    product.auctionDetails.highestBidder = userId;

    await product.save();

    // Populate the updated product for response
    const updatedProduct = await Product.findById(auctionId)
      .populate("sellerId", "name")
      .populate("auctionDetails.highestBidder", "name");

    res.status(200).json({
      success: true,
      message: "Bid placed successfully",
      data: updatedProduct
    });

  } catch (error) {
    console.error("Place bid error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

exports.cancelAuction = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product || !product.isAuction) {
      return res.status(404).json({ message: "Auction product not found." });
    }

    product.auctionDetails.status = "Cancelled";
    await product.save();

    res.status(200).json({ success: true, message: "Auction cancelled." });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

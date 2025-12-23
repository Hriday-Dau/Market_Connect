const Order = require("../models/order");
const Product = require("../models/product");
const mongoose = require("mongoose");

exports.getSellerStats = async (req, res) => {
  try {
    const sellerId = new mongoose.Types.ObjectId(req.user._id);

    // Delivered revenue and total sales from items owned by this seller
    const [salesData] = await Order.aggregate([
      { $match: { orderStatus: "Delivered" } },
      { $unwind: "$orderItems" },
      {
        $lookup: {
          from: "products",
          localField: "orderItems.product",
          foreignField: "_id",
          as: "prod", 
        },
      },
      { $unwind: "$prod" },
      { $match: { "prod.sellerId": sellerId } },
      {
        $group: {
          _id: null,
          orders: { $addToSet: "$_id" },
          totalRevenue: {
            $sum: { $multiply: ["$orderItems.price", "$orderItems.quantity"] },
          },
        },
      },
      {
        $project: { _id: 0, totalSales: { $size: "$orders" }, totalRevenue: 1 },
      },
    ]);

    // Pending orders (Processing/Shipped) that include seller-owned items
    const [pendingAgg] = await Order.aggregate([
      { $match: { orderStatus: { $in: ["Processing", "Shipped"] } } },
      { $unwind: "$orderItems" },
      {
        $lookup: {
          from: "products",
          localField: "orderItems.product",
          foreignField: "_id",
          as: "prod",
        },
      },
      { $unwind: "$prod" },
      { $match: { "prod.sellerId": sellerId } },
      { $group: { _id: null, orders: { $addToSet: "$_id" } } },
      { $project: { _id: 0, pending: { $size: "$orders" } } },
    ]);

    const totalProducts = await Product.countDocuments({
      sellerId: sellerId,
      isDeleted: false,
    });

    const [avgRatingData] = await Product.aggregate([
      {
        $match: {
          sellerId: sellerId,
          isDeleted: false,
          ratingCount: { $gt: 0 },
        },
      },
      { $group: { _id: null, avgRating: { $avg: "$ratingAvg" } } },
    ]);

    res.json({
      success: true,
      data: {
        totalRevenue: salesData?.totalRevenue || 0,
        totalSales: salesData?.totalSales || 0,
        pendingOrders: pendingAgg?.pending || 0,
        totalProducts,
        averageRating: avgRatingData ? avgRatingData.avgRating.toFixed(1) : 0,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.getSalesReport = async (req, res) => {
  try {
    const sellerId = new mongoose.Types.ObjectId(req.user._id);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    // Last 30 days: daily revenue from seller-owned items only
    const salesReport = await Order.aggregate([
      { $match: { orderStatus: "Delivered", createdAt: { $gte: startDate } } },
      { $unwind: "$orderItems" },
      {
        $lookup: {
          from: "products",
          localField: "orderItems.product",
          foreignField: "_id",
          as: "prod",
        },
      },
      { $unwind: "$prod" },
      { $match: { "prod.sellerId": sellerId } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalSales: {
            $sum: { $multiply: ["$orderItems.price", "$orderItems.quantity"] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({ success: true, data: salesReport });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
exports.getProductPerformance = async (req, res) => {
  try {
    const sellerId = req.user._id;

    const products = await Product.find({
      sellerId: sellerId,
      isDeleted: false,
    })
      .select("title stock price ratingAvg ratingCount images condition")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

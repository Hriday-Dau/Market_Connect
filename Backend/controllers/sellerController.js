const Order = require("../models/order");
const Return = require("../models/return");
const mongoose = require("mongoose");
const Product = require("../models/product");
const Review = require("../models/review");

const getMySales = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const sellerId = new mongoose.Types.ObjectId(req.user._id);

    const [result] = await Order.aggregate([
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
          _id: "$_id",
          buyer: { $first: "$buyer" },
          shippingInfo: { $first: "$shippingInfo" },
          orderStatus: { $first: "$orderStatus" },
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
          orderItems: {
            $push: {
              name: "$orderItems.name",
              quantity: "$orderItems.quantity",
              image: "$orderItems.image",
              price: "$orderItems.price",
              product: {
                _id: "$orderItems.product",
                title: "$prod.title",
                price: "$prod.price",
                images: "$prod.images",
              },
            },
          },
        },
      },
      
      {
        $lookup: {
          from: "users",
          localField: "buyer",
          foreignField: "_id",
          as: "buyerDoc",
        },
      },
      { $unwind: { path: "$buyerDoc", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          buyer: {
            _id: "$buyerDoc._id",
            name: "$buyerDoc.name",
            email: "$buyerDoc.email",
          },
          shippingInfo: 1,
          orderStatus: 1,
          createdAt: 1,
          updatedAt: 1,
          orderItems: 1,
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
    ]);

    const orders = result?.data || [];
    const total = result?.totalCount?.[0]?.count || 0;

    res.json({
      success: true,
      data: { orders, totalPages: Math.ceil(total / limit), currentPage: page },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const getMyReturns = async (req, res) => {
  try {
    const returns = await Return.find({ seller: req.user._id })
      .populate("order", "totalPrice orderStatus")
      .populate("buyer", "name email")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: returns });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const updateReturnStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolution, refundInfo } = req.body;

    const ret = await Return.findById(id);
    if (!ret)
      return res.status(404).json({ message: "Return request not found" });
    if (ret.seller.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Access denied" });

    
    const allowed = ["Approved", "Rejected", "Received by Seller", "Completed"];
    if (status && !allowed.includes(status))
      return res.status(400).json({ message: "Invalid status" });

    if (status) ret.status = status;
    if (resolution) ret.resolution = resolution;
    if (refundInfo) ret.refundInfo = refundInfo;

    await ret.save();

    res.json({ success: true, message: "Return updated", data: ret });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const getDashboardStats = async (req, res) => {
  try {
    const sellerObjId = new mongoose.Types.ObjectId(req.user._id);

    const [agg] = await Order.aggregate([
      { $match: { orderStatus: { $nin: ["Cancelled", "Payment Failed"] } } },
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
      { $match: { "prod.sellerId": sellerObjId } },
      {
        $group: {
          _id: null,
          orderIds: { $addToSet: "$_id" },
          totalRevenue: {
            $sum: { $multiply: ["$orderItems.price", "$orderItems.quantity"] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalOrders: { $size: "$orderIds" },
          totalRevenue: 1,
        },
      },
    ]);

    const totalOrders = agg?.totalOrders || 0;
    const totalRevenue = agg?.totalRevenue || 0;

    const totalProducts = await Product.countDocuments({
      sellerId: sellerObjId,
      isDeleted: false,
    });


    const pendingReturns = await Return.countDocuments({
      seller: sellerObjId,
      status: "Requested",
    });

    const [ratingAgg] = await Review.aggregate([
      { $match: { sellerId: sellerObjId, status: "visible" } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          ratingCount: { $sum: 1 },
        },
      },
    ]);

    const avgRating = ratingAgg ? ratingAgg.avgRating : 0;
    const ratingCount = ratingAgg ? ratingAgg.ratingCount : 0;

    const topProducts = await Order.aggregate([
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
      { $match: { "prod.sellerId": sellerObjId } },
      {
        $group: {
          _id: "$orderItems.product",
          qtySold: { $sum: "$orderItems.quantity" },
        },
      },
      { $sort: { qtySold: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          productId: "$_id",
          qtySold: 1,
          "product.title": "$product.title",
          "product.price": "$product.price",
          "product.images": "$product.images",
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        totalOrders,
        totalRevenue,
        totalProducts,
        pendingReturns,
        avgRating,
        ratingCount,
        topProducts,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getMySales,
  getMyReturns,
  updateReturnStatus,
  getDashboardStats,
};

const mongoose = require("mongoose");
const crypto = require("crypto");
const { Schema } = mongoose;

const productSchema = new Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", 
      required: true,
    },

    title: {
      type: String,
      required: [true, "Product title is required"],
      trim: true,
      minlength: 3,
      maxlength: 140,
    },

    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 5000,
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is required"],
    },

    tags: {
      type: [String],
      default: [],
      index: true,
    },

    images: [
      {
        url: { type: String, required: true },
        publicId: { type: String, required: true },
        isPrimary: { type: Boolean, default: false },
      },
    ],

    price: {
      type: Number,
      required: true,
      min: [0, "Price cannot be negative"],
    },

    currency: {
      type: String,
      enum: ["INR", "USD"],
      default: "INR",
    },

    stock: {
      type: Number,
      required: true,
      min: [0, "Stock cannot be negative"],
    },

    condition: {
      type: String,
      enum: ["new", "used", "refurbished"],
      default: "new",
    },

    specs: {
      type: Map,
      of: String,
      default: {},
    },

    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },

    isDeleted: {
      type: Boolean,
      default: false,
    },
    isAuction: {
      type: Boolean,
      default: false,
      index: true,
    },
    auctionDetails: {
      startTime: { type: Date },
      endTime: { type: Date },
      startPrice: { type: Number, default: 1 },
      currentBid: { type: Number },
      highestBidder: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      bidHistory: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        amount: { type: Number },
        timestamp: { type: Date }
      }],
      status: {
        type: String,
        enum: ["Pending", "Active", "Completed", "Cancelled"],
        default: "Pending",
      },
      winner: {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        name: { type: String },
        email: { type: String },
        winningBid: { type: Number }
      }
    },
  },
  { timestamps: true }
);

productSchema.pre("save", async function (next) {
  if (!this.isModified("title")) return next();

  let baseSlug = this.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

  let existing = null;
  try {
    existing = await this.constructor.findOne({ slug: baseSlug });
  } catch (err) {
    return next(err);
  }

  if (existing && existing._id.toString() !== this._id.toString()) {
    const randomSuffix = crypto.randomBytes(4).toString("hex");
    this.slug = `${baseSlug}-${randomSuffix}`;
  } else {
    this.slug = baseSlug;
  }

  next();
});

module.exports = mongoose.model("Product", productSchema);

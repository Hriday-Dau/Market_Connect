
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const passport = require("passport");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const http = require('http');
const { initSocket } = require('./socket');

const userRoutes = require("./routes/user");
require("./auth/googleAuth.js");

const app = express();
const server = http.createServer(app);

const cartRoutes = require("./routes/cart");
const couponRoutes = require("./routes/coupon");
const reviewRoutes = require("./routes/review");
const sellerRoutes = require("./routes/seller");
const orderRoutes = require("./routes/order");
const productRoutes = require("./routes/product");
const categoryRoutes = require("./routes/category");
const faqRoutes = require("./routes/faq");
const paymentRoutes = require("./routes/payment");
const returnRoutes = require("./routes/return");
const analyticsRoutes = require('./routes/sellerAnalyticsRoutes.js');
const auctionRoutes = require('./routes/auctionRoutes');
const chatRoutes = require("./routes/chat");
const assistantRoutes = require("./routes/assistant");
const { startAuctionScheduler } = require('./jobs/auctionScheduler');

if (process.env.NODE_ENV !== "test") {
  mongoose
    .connect(process.env.ATLASDB_URL)
    .then(() => console.log("MongoDB Atlas connected"))
    .catch(err => console.error("DB error:", err));
}


  initSocket(server);

app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://market-connect-2qmb.onrender.com",
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());


app.get("/", (req, res) => {
  res.json({ message: "Server is running" });
});

app.use("/api/users", userRoutes);

app.use("/api/faqs", faqRoutes); 
app.use("/api", productRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/reviews", reviewRoutes); 
app.use("/api/seller", sellerRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/returns", returnRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/auctions', auctionRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/assistant", assistantRoutes);

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORTT || 8080;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Start the auction scheduler
    startAuctionScheduler();
  });
}

module.exports = app;
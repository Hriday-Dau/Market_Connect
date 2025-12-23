//This document is for the purpose of maintaining all reusable schemas in one place

const mongoose = require("mongoose");
const { Schema } = mongoose;

//schema to store addresses
const addressSchema = new Schema(
  {
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: {
      type: String,
      required: true,
      trim: true,
      minlength: 6,
      maxlength: 6,
    },
    country: { type: String, required: true, default: "India" },
  },
  {} // allow default _id for subdocuments so they can be referenced/updated
);

// Exporting the schema for usage in other files
module.exports = addressSchema;
 
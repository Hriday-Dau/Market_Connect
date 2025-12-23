const Joi = require('joi');

const createAuctionSchema = Joi.object({
  productId: Joi.string().hex().length(24).required().messages({
    'string.empty': 'Product ID is required.',
    'string.hex': 'Must be a valid Product ID.'
  }),

  startTime: Joi.date().iso().required().messages({
    'date.base': 'Start time must be a valid date.', 
    'any.required': 'Start time is required.'
  }),

  endTime: Joi.date().iso().greater(Joi.ref('startTime')).required().messages({
    'date.base': 'End time must be a valid date.',
    'date.greater': 'End time must be after the start time.',
    'any.required': 'End time is required.'
  }),

  startPrice: Joi.number().min(1).required().messages({
    'number.base': 'Starting price must be a number.',
    'number.min': 'Starting price must be at least 1.',
    'any.required': 'Starting price is required.'
  })
});

const updateAuctionSchema = Joi.object({
  endTime: Joi.date().iso().optional()
});

module.exports = {
  createAuctionSchema,
  updateAuctionSchema
};
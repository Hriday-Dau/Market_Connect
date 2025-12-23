const Category = require('../models/category');
const Product = require('../models/product'); 

exports.createCategory = async (req, res) => {
  try {
    console.log('=== CREATE CATEGORY START ===');
    console.log('Request body:', req.body);
    
    const { name, slug, parentId } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ 
        success: false,  
        message: "Category name is required" 
      });
    }

    if (!slug || slug.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        message: "Slug is required" 
      });
    }

    const trimmedName = name.trim();
    const trimmedSlug = slug.trim().toLowerCase();

    const normalizedParentId = (parentId && parentId.toString().trim() !== '') ? parentId : null;

    console.log('Processing category:', { trimmedName, trimmedSlug, normalizedParentId });

    const existingName = await Category.findOne({ 
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') } 
    });

    if (existingName) {
      return res.status(400).json({ 
        success: false,
        message: "A category with this name already exists." 
      });
    }
    const existingSlug = await Category.findOne({ 
      slug: trimmedSlug 
    });

    if (existingSlug) {
      return res.status(400).json({ 
        success: false,
        message: "This slug is already taken. Please choose a different one." 
      });
    }

    const category = await Category.create({
      name: trimmedName,
      slug: trimmedSlug,
      parentId: normalizedParentId
    });

    console.log('Category created successfully:', category);
    
    res.status(201).json({ 
      success: true, 
      message: 'Category created successfully',
      category 
    });

  } catch (error) {
    console.error(' Create category error:', error);
    
    if (error.code === 11000) {
      if (error.keyPattern && error.keyPattern.name) {
        return res.status(400).json({
          success: false,
          message: "Category name already exists."
        });
      }
      if (error.keyPattern && error.keyPattern.slug) {
        return res.status(400).json({
          success: false,
          message: "Slug already exists. Please choose a different one."
        });
      }
    }
    
    res.status(500).json({ 
      success: false,
      message: "Server Error", 
      error: error.message 
    });
  }
};

exports.getAllCategories = async (req, res) => {
  try {
    console.log('[GET /categories] Fetching all categories...');
    const categories = await Category.find({}).sort({ name: 1 });
    console.log(`[GET /categories] Found ${categories.length} categories`);
    res.status(200).json({ success: true, categories });
  } catch (error) {
    console.error('[GET /categories] Error:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      message: "Server Error", 
      error: error.message 
    });
  }
};

exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ 
        success: false,
        message: 'Category not found' 
      });
    }
    res.status(200).json({ success: true, category });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: "Server Error", 
      error: error.message 
    });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { name, slug, parentId } = req.body;
    const category = await Category.findById(req.params.id);
    
    if (!category) {
      return res.status(404).json({ 
        success: false,
        message: 'Category not found' 
      });
    }

    if (name && name.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        message: "Category name cannot be empty" 
      });
    }

    if (slug && slug.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        message: "Slug cannot be empty" 
      });
    }

    if (name) {
      category.name = name.trim();
    }
    
    if (slug) {
      category.slug = slug.trim().toLowerCase();
    }
    
    if (req.body.hasOwnProperty('parentId')) {
      category.parentId = (parentId && parentId.toString().trim() !== '') ? parentId : null;
    }

    const updatedCategory = await category.save();

    res.status(200).json({ 
      success: true, 
      message: 'Category updated successfully',
      category: updatedCategory 
    });
  } catch (error) {
    console.error('Update category error:', error);
    
    if (error.code === 11000) {
      if (error.keyPattern && error.keyPattern.name) {
        return res.status(400).json({
          success: false,
          message: "Category name already exists."
        });
      }
      if (error.keyPattern && error.keyPattern.slug) {
        return res.status(400).json({
          success: false,
          message: "Slug already exists. Please choose a different one."
        });
      }
    }
    
    res.status(500).json({ 
      success: false,
      message: "Server Error", 
      error: error.message 
    });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;

    const productCount = await Product.countDocuments({ categoryId: categoryId });
    if (productCount > 0) {
      return res.status(400).json({ 
        success: false,
        message: `Cannot delete this category. It is already being used by ${productCount} product(s).` 
      });
    }

    const childCategoryCount = await Category.countDocuments({ parentId: categoryId });
    if (childCategoryCount > 0) {
      return res.status(400).json({ 
        success: false,
        message: `Cannot delete this category. It is a parent to ${childCategoryCount} other categories.` 
      });
    }
    
    const category = await Category.findByIdAndDelete(categoryId);
    if (!category) {
      return res.status(404).json({ 
        success: false,
        message: 'Category not found' 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Category deleted successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: "Server Error", 
      error: error.message 
    });
  }
};
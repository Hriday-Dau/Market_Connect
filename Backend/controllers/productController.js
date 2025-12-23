const Product = require("../models/product");
const { cloudinary } = require("../CloudConfig");

//new product
exports.createProduct = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ message: "Please upload at least one image." });
    }

    const images = req.files.map((f, index) => ({
      url: f.path, //Cloudinary url
      publicId: f.filename, // The public_id (e.g., "Market-Connect/Products/image_name")
      isPrimary: index === 0, //First image primary
    }));

    const productData = {
      ...req.body, 
      sellerId: req.user._id,
      images: images,
    };

    // Normalize specs to a plain object so Mongoose Map can cast it correctly
    if (productData.specs && typeof productData.specs === "object") {
      productData.specs = { ...productData.specs };
    }

    const product = await Product.create(productData);
    res.status(200).json({ success: true, product });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// GET /api/products/:id/similar
// Returns products from the same category as the given product, excluding the product itself
exports.getSimilarProducts = async (req, res) => {
  try {
    const { id } = req.params;

    const baseProduct = await Product.findById(id).select("categoryId");
    if (!baseProduct || baseProduct.isDeleted) {
      return res.status(404).json({ message: "Product not found" });
    }

    const similarProducts = await Product.find({
      _id: { $ne: id },
      categoryId: baseProduct.categoryId,
      isDeleted: false,
    })
      .populate("categoryId", "name")
      .sort({ createdAt: -1 })
      .limit(8);

    res.status(200).json({ success: true, products: similarProducts });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

//browse products
exports.getAllProducts = async (req, res) => {
  try {
    const { keyword, category, minPrice, maxPrice, condition } = req.query;
    const query = { isDeleted: false };

    if (keyword) {
      query.$or = [
        { title: { $regex: keyword, $options: "i" } },
        { description: { $regex: keyword, $options: "i" } },
      ];
    }
    if (category) query.categoryId = category;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    if (condition) query.condition = condition;

    const products = await Product.find(query)
      .populate("categoryId", "name")
      .sort({ createdAt: -1 });
    const totalProducts = await Product.countDocuments(query);

    res.status(200).json({
      success: true,
      products,
      totalProducts: totalProducts,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Search AutoComplete
exports.getProductSuggestions = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.json({ success: true, suggestions: [] });
    }
    const queryRegex = new RegExp(`^${q}`, "i");

    const products = await Product.find({
      title: { $regex: queryRegex },
      isDeleted: false,
    })
      .limit(10)
      .select("title slug");

    res.status(200).json({ success: true, suggestions: products });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

//find 1 product
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("sellerId", "sellerInfo.shopName")
      .populate("categoryId", "name");

    if (!product || product.isDeleted) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.status(200).json({ success: true, product });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

//update product
exports.updateProduct = async (req, res) => {
  try {
    const product = req.product; //isOwner has params attached with product found by ID

    // Normalize specs to a plain object before applying updates
    if (req.body.specs && typeof req.body.specs === "object") {
      req.body.specs = { ...req.body.specs };
    }

    product.set(req.body);

    if (req.files && req.files.length > 0) {
      const newImages = req.files.map((f) => ({
        url: f.path,
        publicId: f.filename,
      }));
      product.images.push(...newImages);
    }

    if (req.body.imagesToDelete) {
      //imagesToDelete - publicIds of images to be deleted from frontend
      const publicIdsToDelete = Array.isArray(req.body.imagesToDelete)
        ? req.body.imagesToDelete
        : [req.body.imagesToDelete];

      for (let publicId of publicIdsToDelete) {
        await cloudinary.uploader.destroy(publicId);
      }

      product.images = product.images.filter(
        (img) => !publicIdsToDelete.includes(img.publicId)
      );
    }

    const updatedProduct = await product.save();
    res.status(200).json({ success: true, product: updatedProduct });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

//delete product
exports.deleteProduct = async (req, res) => {
  try {
    const product = req.product; //isOwner has params attached with product found by ID

    //deleted product is still stored in db for future use if req
    product.isDeleted = true;
    await product.save();

    res
      .status(200)
      .json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// GET /api/products/compare?ids=<id1>,<id2>
exports.compareProducts = async (req, res) => {
  try {
    const idsParam = req.query.ids || req.query.id;
    if (!idsParam)
      return res.status(400).json({
        message: "Please provide product ids to compare via ?ids=id1,id2",
      });

    const ids = String(idsParam)
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (ids.length !== 2)
      return res
        .status(400)
        .json({ message: "Please provide exactly two product ids to compare" });

    const products = await Product.find({
      _id: { $in: ids },
      isDeleted: false,
    })
      .populate('categoryId', 'name')
      .lean();
    if (products.length !== 2)
      return res
        .status(404)
        .json({ message: "One or both products not found" });

    const [p1, p2] = products;

    // comparison metrics
    const metrics = {
      price: {
        p1: p1.price,
        p2: p2.price,
        better:
          p1.price < p2.price ? "p1" : p1.price > p2.price ? "p2" : "equal",
      },
      ratingAvg: {
        p1: p1.ratingAvg || 0,
        p2: p2.ratingAvg || 0,
        better:
          (p1.ratingAvg || 0) > (p2.ratingAvg || 0)
            ? "p1"
            : (p1.ratingAvg || 0) < (p2.ratingAvg || 0)
            ? "p2"
            : "equal",
      },
      ratingCount: {
        p1: p1.ratingCount || 0,
        p2: p2.ratingCount || 0,
        better:
          (p1.ratingCount || 0) > (p2.ratingCount || 0)
            ? "p1"
            : (p1.ratingCount || 0) < (p2.ratingCount || 0)
            ? "p2"
            : "equal",
      },
      stock: {
        p1: p1.stock || 0,
        p2: p2.stock || 0,
        better:
          (p1.stock || 0) > (p2.stock || 0)
            ? "p1"
            : (p1.stock || 0) < (p2.stock || 0)
            ? "p2"
            : "equal",
      },
      condition: { p1: p1.condition, p2: p2.condition },
    };

    // score condition: new > refurbished > used
    const conditionScore = (cond) =>
      cond === "new" ? 3 : cond === "refurbished" ? 2 : 1;
    metrics.condition.better =
      conditionScore(p1.condition) > conditionScore(p2.condition)
        ? "p1"
        : conditionScore(p1.condition) < conditionScore(p2.condition)
        ? "p2"
        : "equal";

    // specs comparison (union keys)
    const specs1 = p1.specs || {};
    const specs2 = p2.specs || {};
    const specKeys = Array.from(
      new Set([].concat(Object.keys(specs1), Object.keys(specs2)))
    );
    const specs = specKeys.map((k) => ({
      key: k,
      p1: specs1[k] || null,
      p2: specs2[k] || null,
    }));

    res.json({ success: true, data: { products: [p1, p2], metrics, specs } });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const bcrybt = require("bcrypt");
const validator = require("validator");
const jwt = require("jsonwebtoken");

const User = require("../models/user");
const Post = require("../models/post");

const { clearImage } = require("./util/file");

module.exports = {
  createUser: async function (args, req) {
    const email = args.userInput.email;
    const name = args.userInput.name;
    const password = args.userInput.password;

    const errors = [];
    if (!validator.isEmail(email)) {
      errors.push({
        message: "email is invalid",
      });
    }
    if (
      validator.isEmpty(password) ||
      !validator.isLength(password, { min: 8 })
    ) {
      errors.push({ message: "invalid password" });
    }
    if (errors.length > 0) {
      const error = new Error("invalid input");
      error.data = errors;
      error.code = 422;
      throw error;
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      const err = new Error("User Exists already");
      throw error;
    }
    const hashPass = await bcrybt.hash(password, 12);
    const user = new User({ email, name, password: hashPass });
    const createdUser = await user.save();
    return {
      ...createdUser._doc,
      _id: createdUser._id.toString(),
    };
  },
  login: async function ({ email, password }, req) {
    const user = await User.findOne({ email });
    if (!user) {
      const error = new Error("user not found");
      // error.data = errors;
      error.code = 401;
      throw error;
    }
    const isEqual = await bcrybt.compare(password, user.password);
    if (!isEqual) {
      const error = new Error("wrong password");
      // error.data = errors;
      error.code = 401;
      throw error;
    }
    const token = jwt.sign(
      {
        userId: user._id.toString(),
        email,
      },
      "OmarSecret",
      { expiresIn: "1h" }
    );
    return {
      token,
      userId: user._id.toString(),
    };
  },
  createPost: async function ({ postInput }, req) {
    if (!req.isAuth) {
      const err = new Error("not authenticated");
      err.code = 401;
      throw err;
    }
    const errors = [];
    if (
      validator.isEmpty(postInput.title) ||
      !validator.isLength(postInput.title, { min: 5 })
    ) {
      errors.push({ message: "title is invalid" });
    }
    if (
      validator.isEmpty(postInput.content) ||
      !validator.isLength(postInput.content, { min: 5 })
    ) {
      errors.push({ message: "content is invalid" });
    }
    if (errors.length > 0) {
      const error = new Error("invalid input");
      error.data = errors;
      error.code = 422;
      throw error;
    }
    const user = await User.findById(req.userId);
    if (!user) {
      const error = new Error("invalid user");
      error.code = 422;
      throw error;
    }
    const post = new Post({
      title: postInput.title,
      content: postInput.content,
      imageUrl: postInput.imageUrl,
      creator: user,
    });
    const createdPost = await post.save();
    user.posts.push(createdPost);
    await user.save();
    return {
      ...createdPost._doc,
      _id: createdPost._id.toString(),
      createdAt: createdPost.createdAt.toISOString(),
      updatedAt: createdPost.updatedAt.toISOString(),
    };
  },
  posts: async function ({ page }, req) {
    if (!req.isAuth) {
      const err = new Error("not authenticated");
      err.code = 401;
      throw err;
    }
    if (!page) {
      page = 1;
    }
    const perPage = 2;
    const totalPosts = await Post.find().countDocuments();
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .populate("creator");

    return {
      posts: posts.map((p) => {
        return {
          ...p._doc,
          _id: p._id.toString(),
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        };
      }),
      totalPosts,
    };
  },
  post: async function ({ id }, req) {
    if (!req.isAuth) {
      const err = new Error("not authenticated");
      err.code = 401;
      throw err;
    }
    const post = await Post.findById(id).populate("creator");
    if (!post) {
      const err = new Error("no post found");
      err.code = 404;
      throw err;
    }
    return {
      ...post._doc,
      _id: post._id.toString(),
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };
  },
  updatePost: async function ({ id, postInput }, req) {
    if (!req.isAuth) {
      const err = new Error("not authenticated");
      err.code = 401;
      throw err;
    }
    const post = await Post.findById(id).populate("creator");
    if (!post) {
      const err = new Error("Post not found");
      err.code = 404;
      throw err;
    }
    if (post.creator._id.toString() !== req.userId.toString()) {
      const err = new Error("not authorized");
      err.code = 403;
      throw err;
    }
    const errors = [];
    if (
      validator.isEmpty(postInput.title) ||
      !validator.isLength(postInput.title, { min: 5 })
    ) {
      errors.push({ message: "title is invalid" });
    }
    if (
      validator.isEmpty(postInput.content) ||
      !validator.isLength(postInput.content, { min: 5 })
    ) {
      errors.push({ message: "content is invalid" });
    }
    if (errors.length > 0) {
      const error = new Error("invalid input");
      error.data = errors;
      error.code = 422;
      throw error;
    }
    post.title = postInput.title;
    post.content = postInput.content;
    if (postInput.imageUrl !== "undefined") {
      post.imageUrl = postInput.imageUrl;
    }
    const updatedPost = await post.save();

    return {
      ...updatedPost._doc,
      _id: updatedPost._id.toString,
      createdAt: updatedPost.createdAt.toISOString(),
      updatedAt: updatedPost.updatedAt.toISOString(),
    };
  },
  deletePost: async function ({ id }, req) {
    if (!req.isAuth) {
      const err = new Error("not authenticated");
      err.code = 401;
      throw err;
    }
    const post = await Post.findById(id);
    if (!post) {
      const err = new Error("Post not found");
      err.code = 404;
      throw err;
    }
    if (post.creator.toString() !== req.userId.toString()) {
      const err = new Error("not authorized");
      err.code = 403;
      throw err;
    }
    try {
      clearImage(post.imageUrl);
      await Post.findByIdAndRemove(id);
      const user = await User.findById(req.userId);
      user.posts.pull(id);
      await user.save();
      return true;
    } catch {
      return false;
    }
  },
  user: async function (args, req) {
    if (!req.isAuth) {
      const err = new Error("not authenticated");
      err.code = 401;
      throw err;
    }
    const userDocument = await User.findById(req.userId);
    if (!userDocument) {
      const err = new Error("User not found");
      err.code = 404;
      throw err;
    }
    return { ...userDocument._doc, _id: userDocument.toString() };
  },
  updateStatus: async function ({ status }, req) {
    if (!req.isAuth) {
      const err = new Error("not authenticated");
      err.code = 401;
      throw err;
    }
    const user = await User.findById(req.userId);
    if (!user) {
      const err = new Error("User not found");
      err.code = 404;
      throw err;
    }
    user.status = status;
    await user.save();
    return { ...user._doc, _id: user._id.toString() };
  },
};

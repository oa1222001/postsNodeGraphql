const fs = require("fs");
const path = require("path");

const { validationResult } = require("express-validator");

const io = require("../socket");
const Post = require("../models/post");
const User = require("../models/user");
exports.getPosts = (req, res, next) => {
  const currentPage = req.query.page || 1;
  const perPage = 2;
  let totalItems;
  Post.find()
    .populate("creator")
    .countDocuments()
    .then((result) => {
      totalItems = result;
      return Post.find()
        .skip((currentPage - 1) * perPage)
        .limit(perPage);
    })
    .then((posts) => {
      if (!posts) {
        const err = new Error("no post Found");
        err.statusCode = 404;
        throw err;
      }
      res.status(200).json({ message: "Post Fetched", posts, totalItems });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

exports.createPost = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error("validation failed, entered data is incorrect");
    error.status = 422;
    throw error;
  }
  if (!req.file) {
    const error = new Error("no image provided");
    error.status = 422;
    throw error;
  }
  const imageUrl = req.file.path;
  const title = req.body.title;
  const content = req.body.content;
  let creator;
  let username;
  const post = new Post({
    title,
    imageUrl: imageUrl,
    content,
    creator: req.userId,
  });
  post
    .save()
    .then((result) => {
      // console.log(result);
      return User.findById(req.userId);
    })
    .then((user) => {
      creator = user;
      username = user.name;
      user.posts.push(post);
      return user.save();
    })
    .then((result) => {
      io.getIo().emit("posts", {
        action: "new Post",
        post: { ...post._doc, creator: { _id: req.userId, name: username } },
      });
      res.status(201).json({
        message: "post created successefully",
        post: { ...post, creator: { _id: creator._id, name: creator.name } },
      });
    })
    .catch((err) => {
      if (!err.statusCode) {
        error, (statusCode = 500);
      }
      next(err);
    });
};

exports.getPost = (req, res, next) => {
  const postId = req.params.postId;
  Post.findById(postId)
    .then((post) => {
      if (!post) {
        const err = new Error("no post Found");
        err.statusCode = 404;
        throw err;
      }
      res.status(200).json({ message: "Post Fetched", post });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

exports.updatePost = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error("validation failed, entered data is incorrect");
    error.status = 422;
    throw error;
  }
  const postId = req.params.postId;
  const title = req.params.title;
  const content = req.params.content;
  let imageUrl = req.body.image;
  if (req.file) {
    //imageUrl = req.file.path;
    imageUrl = req.file.path.replace("\\", "/");
  }
  if (!imageUrl) {
    const err = new Error("no image found");
    err.statusCode = 422;
    throw err;
  }

  Post.findById(postId)
    .then((post) => {
      if (!post) {
        const err = new Error("post not found");
        err.statusCode = 404;
        throw err;
      }
      if (post.creator.toString() !== req.userId.toString()) {
        const err = new Error("Not Authorized to update this");
        err.statusCode = 403;
        throw err;
      }
      if (imageUrl !== post.imageUrl) {
        clearImage(post.imageUrl);
      }
      post.title = title;
      post.imageUrl = imageUrl;
      post.content = content;
      return post.save();
    })
    .then((result) => {
      io.getIo().emit("posts", {
        action: "update",
        post: result,
      });
      return res.status(200).json({ message: "updated", post: result });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

exports.deletePost = (req, res, next) => {
  const postId = req.params.postId;
  Post.findById(postId)
    .then((post) => {
      if (!post) {
        const err = new Error("post not found");
        err.statusCode = 404;
        throw err;
      }
      if (post.creator.toString() !== req.userId.toString()) {
        const err = new Error("Not Authorized to update this");
        err.statusCode = 403;
        throw err;
      }

      clearImage(post.imageUrl);
      return Post.findByIdAndRemove(postId);
    })
    .then((result) => {
      return User.findById(req.userId);
    })
    .then((user) => {
      user.posts.pull(postId);
      return user.save();
    })
    .then((result) => {
      io.getIo().emit("posts", {
        action: "delete",
        post: postId,
      });
      res.status(200).json({ message: "deleted post" });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

const clearImage = (filePath) => {
  newFilepath = path.join(__dirname, "..", filePath);
  fs.unlink(newFilepath, (err) => {
    console.log(err);
  });
};

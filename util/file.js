const clearImage = (filePath) => {
  newFilepath = path.join(__dirname, filePath);
  fs.unlink(newFilepath, (err) => {
    console.log(err);
  });
};
exports.clearImage = clearImage;

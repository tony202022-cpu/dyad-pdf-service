module.exports = (req, res) => {
  res.status(200).json({
    status: "OK",
    service: "Dyad PDF Generator",
    time: new Date().toISOString(),
  });
};

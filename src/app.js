import express from "express";
import cors from "cors";
import router  from "./routes/index.js"
import mongoose from "mongoose";
import dotenv from "dotenv"
import { scheduleCandleRefreshJob } from "./jobs/refreshCandles.job.js";

const app = express();
app.use(cors());
app.use(express.json());
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(()=>{
console.log("DB connected success ")
scheduleCandleRefreshJob();
}).catch((err)=>{
  console.log("Errr in DB connection", err)
})


app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.use("/api",router);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
import User from '../models/user.js';
import axios from 'axios';

const headers =(key)=> {return  {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': '10.70.181.29',
    'X-ClientPublicIP': '152.58.154.63',
    'X-MACAddress': '14:B5:CD:5B:C5:67',
    'X-PrivateKey': {key}
  }
}

const loginuser=async(req,res)=>{
    try {
        const { password, clientcode, totp,key}=req.body;
        if(!password || ! clientcode || ! totp || !key){
           return res.status(400).json({message:"required things are missing"})
        }
        await axios.post('http://localhost:5000/api/login', { clientcode, password })
        res.status(200).json({ message: "User logged in successfully" });

    } catch (error) {
        console.log("Error in loginuser controller",error);
        res.status(500).json({ message: "Internal server error" });
    }
}
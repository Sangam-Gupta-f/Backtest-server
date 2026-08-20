import express from 'express';
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  clientcode: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  totp:{
 type: String,
    required: true
  },
  key:{
     type: String,
    required: true
  },
  jwtToken: {
    type: String,
  },
  refreshToken:{
    type: String,
  },
      jwtTokenExpiresAt: {
      type: Date,
      index: true,
      expires: 0,
    },
}, { timestamps: true } );

const User = mongoose.model('User', userSchema);

export default User;
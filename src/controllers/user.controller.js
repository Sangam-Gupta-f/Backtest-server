import User from '../models/user.js';
import axios from 'axios';
import { API } from '../../config/api.js';

const buildHeaders = (key, jwtToken) => {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': '10.70.181.29',
    'X-ClientPublicIP': '152.58.154.63',
    'X-MACAddress': '14:B5:CD:5B:C5:67',
    'X-PrivateKey': key,
  };
  if (jwtToken) headers.Authorization = `Bearer ${jwtToken}`;
  return headers;
};

const getBearerToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  return authHeader.split(' ')[1] || null;
};

const loginuser = async (req, res) => {
  try {
    const { password, clientcode, totp, key } = req.body;
    if (!password || !clientcode || !totp || !key) {
      return res.status(400).json({ message: 'required things are missing' });
    }

    const config = {
      method: 'post',
      url: `${API.root}${API.user_login}`,
      headers: buildHeaders(key),
      data: JSON.stringify({ clientcode, password, totp }),
    };

    const response = await axios(config);
    const angelData = response?.data;

    if (!angelData?.status) {
      return res.status(401).json({
        message: angelData?.message || 'Login failed',
        errorcode: angelData?.errorcode,
      });
    }

    const { jwtToken, refreshToken, feedToken } = angelData.data;

    await User.findOneAndUpdate(
      { clientcode },
      {
        password,
        totp,
        key,
        jwtToken,
        refreshToken,
        jwtTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      message: 'User logged in successfully',
      data: { jwtToken, refreshToken, feedToken, clientcode },
    });
  } catch (error) {
    console.log('Error in loginuser controller', error?.response?.data || error.message);
    return res.status(error?.response?.status || 500).json({
      message: 'Internal server error',
      error: error?.response?.data || error.message,
    });
  }
};

const generateToken = async (req, res) => {
  try {
    const refreshToken = getBearerToken(req);
    if (!refreshToken) {
      return res.status(400).json({ message: 'Missing refresh token' });
    }

    const user = await User.findOne({ refreshToken });
    if (!user) {
      return res.status(404).json({ message: 'Expired or invalid token' });
    }

    const config = {
      method: 'post',
      url: `${API.root}${API.generate_token}`,
      headers: buildHeaders(user.key),
      data: JSON.stringify({ refreshToken }),
    };

    const response = await axios(config);
    const angelData = response?.data;

    if (!angelData?.status) {
      return res.status(401).json({
        message: angelData?.message || 'Unable to refresh token',
        errorcode: angelData?.errorcode,
      });
    }

    const { jwtToken, refreshToken: newRefreshToken } = angelData.data;

    await User.findByIdAndUpdate(user._id, {
      jwtToken,
      refreshToken: newRefreshToken,
      jwtTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    return res.status(200).json({
      message: 'Successfully refreshed token',
      data: { jwtToken, refreshToken: newRefreshToken },
    });
  } catch (error) {
    console.log('Error in generateToken controller', error?.response?.data || error.message);
    return res.status(error?.response?.status || 500).json({
      message: 'Server side error during refresh token',
      error: error?.response?.data || error.message,
    });
  }
};

const logout = async (req, res) => {
  try {
    const jwtToken = getBearerToken(req);
    if (!jwtToken) {
      return res.status(400).json({ message: 'JWT not provided' });
    }

    const user = await User.findOne({ jwtToken });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const config = {
      method: 'post',
      url: `${API.root}${API.logout}`,
      headers: buildHeaders(user.key, jwtToken),
      data: JSON.stringify({ clientcode: user.clientcode }),
    };

    const response = await axios(config);
    const angelData = response?.data;

    if (!angelData?.status) {
      return res.status(401).json({
        message: angelData?.message || 'Logout failed',
        errorcode: angelData?.errorcode,
      });
    }

    await User.findByIdAndUpdate(user._id, {
      $unset: { jwtToken: '', refreshToken: '' },
    });

    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.log('Error in logout controller', error?.response?.data || error.message);
    return res.status(error?.response?.status || 500).json({
      message: 'Server side error during logout',
      error: error?.response?.data || error.message,
    });
  }
};

const getProfile = async (req, res) => {
  try {
    const jwtToken = getBearerToken(req);
    if (!jwtToken) {
      return res.status(400).json({ message: 'JWT not provided' });
    }

    const user = await User.findOne({ jwtToken });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const config = {
      method: 'get',
      url: `${API.root}${API.get_profile}`,
      headers: buildHeaders(user.key, jwtToken),
    };

    const response = await axios(config);
    const angelData = response?.data;

    if (!angelData?.status) {
      return res.status(401).json({
        message: angelData?.message || 'Unable to fetch profile',
        errorcode: angelData?.errorcode,
      });
    }

    return res.status(200).json({ message: 'Profile fetched successfully', data: angelData.data });
  } catch (error) {
    console.log('Error in getProfile controller', error?.response?.data || error.message);
    return res.status(error?.response?.status || 500).json({
      message: 'Server side error during profile fetch',
      error: error?.response?.data || error.message,
    });
  }
};

export { loginuser, generateToken, logout, getProfile };

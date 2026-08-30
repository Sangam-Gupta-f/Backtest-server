import User from '../models/user.js';
import { getBearerToken } from '../controllers/user.controller.js';

const authMiddleware = async (req, res, next) => {
  try {
    const jwtToken = getBearerToken(req);
    if (!jwtToken) {
      return res.status(400).json({ message: 'JWT not provided' });
    }

    const user = await User.findOne({ jwtToken });
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Unauthorized' });
  }
};

export { authMiddleware };

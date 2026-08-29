import { validateStrategy } from '../strategy/validateStrategy.js';

const validate = (req, res) => {
  const result = validateStrategy(req.body);
  return res.status(result.valid ? 200 : 422).json(result);
};

export { validate };

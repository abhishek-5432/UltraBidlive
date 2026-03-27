import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-12345';

export const generateToken = (userId: string, username: string) => {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' });
};

export const verifyToken = (token: string) => {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string, username: string };
  } catch (err) {
    return null;
  }
};

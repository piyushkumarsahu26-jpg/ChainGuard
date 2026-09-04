// Handles refresh-token hashing/storage so raw tokens are never persisted.
import bcrypt from 'bcrypt';
import { userRepository } from '../repositories/user.repository.js';

const SALT_ROUNDS = 10;

export const tokenService = {
  async storeRefreshToken(userId, refreshToken) {
    const hashed = await bcrypt.hash(refreshToken, SALT_ROUNDS);
    await userRepository.updateRefreshToken(userId, hashed);
  },

  async verifyStoredRefreshToken(user, refreshToken) {
    if (!user.refreshToken) return false;
    return bcrypt.compare(refreshToken, user.refreshToken);
  },

  async clearRefreshToken(userId) {
    await userRepository.updateRefreshToken(userId, null);
  },
};

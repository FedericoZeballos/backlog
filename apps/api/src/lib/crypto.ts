import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

export const randomToken = () => randomBytes(32).toString('base64url');

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const hashPassword = (password: string) => hash(password);

export const verifyPassword = (passwordHash: string, password: string) => verify(passwordHash, password);
